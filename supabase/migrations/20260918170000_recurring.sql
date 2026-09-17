-- =============================================================================
-- 0016 · Débito recurrente colombiano (tokenización + cobro automático)
-- =============================================================================
-- El mayor diferenciador del producto: el atleta autoriza UNA vez y su
-- mensualidad se cobra sola de su cuenta Nequi (o de su tarjeta) el día de
-- corte. Ningún competidor con venta local en Colombia lo hace sobre Nequi
-- (docs/08-mercado-cali.md §5.2 y §7.3). El runbook de la integración está en
-- docs/12-debito-recurrente.md.
--
-- Cuatro cosas se resuelven aquí, en la base, y no en la Edge Function:
--
--   1. NUNCA SE GUARDA UNA TARJETA. Lo único que entra a esta base es el
--      identificador que devuelve la pasarela (`payment_source_id` de Wompi) y
--      lo justo para que el atleta reconozca su medio de pago: últimos cuatro
--      dígitos o teléfono enmascarado. El número completo y el CVV NO se
--      guardan, no se registran y no se transmiten por nuestro servidor. Hay
--      CHECKs que lo hacen físicamente imposible; ver `payment_methods`.
--
--   2. LA AUTORIZACIÓN ES EVIDENCIA. `recurring_authorizations` guarda la fecha
--      y el texto exacto que el atleta aceptó (docs/07-legal-colombia.md: la
--      fecha es la evidencia). Una autorización no se edita: se revoca. Un
--      trigger lo impone, y revocarla corta el débito en el acto.
--
--   3. IDEMPOTENCIA. Correr el job dos veces no puede cobrar dos veces. Lo
--      impide un índice único (org_id, invoice_id, period_start) + `on conflict
--      do nothing`, igual que `generate_invoices` (0007), y un advisory lock por
--      box para que dos ejecuciones simultáneas no se pisen.
--
--   4. CONCILIACIÓN POR LA RUTA QUE YA EXISTE. Un cobro aprobado se registra
--      con `apply_wompi_payment` (0009), que inserta en `payments` y deja que
--      el trigger `payments_recalc_invoice` (0003) salde la factura. Aquí NO se
--      recalcula ningún saldo: un solo lugar decide si una factura está pagada.
--
-- Dinero SIEMPRE en centavos (bigint). Las fechas de negocio se evalúan en la
-- zona horaria del box, nunca en UTC. `p_now` es inyectable para poder probar
-- días concretos en CI.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Métodos de pago tokenizados
-- -----------------------------------------------------------------------------
-- ¡ADVERTENCIA PARA QUIEN VENGA DESPUÉS!
--
--   NO agregues aquí una columna para el número de la tarjeta, ni para el CVV,
--   ni para la fecha completa de vencimiento junto al número, ni para el
--   teléfono Nequi sin enmascarar. Ni "temporalmente", ni "solo para depurar".
--
--   Guardar un PAN (Primary Account Number) convierte esta base en un sistema
--   sujeto a PCI-DSS completo y nos pone encima una responsabilidad que este
--   producto no puede sostener. El modelo de la pasarela existe justamente para
--   que el dato sensible no pase por aquí: Wompi devuelve un `payment_source_id`
--   y ESE es el único secreto que necesitamos para cobrar.
--
--   Los CHECKs de `last_four` y `masked_phone` están puestos para que un
--   descuido falle de inmediato en vez de filtrarse en silencio.
-- -----------------------------------------------------------------------------
create table public.payment_methods (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  athlete_id          uuid not null references public.athletes(id) on delete cascade,

  provider            text not null default 'wompi'
                      check (provider in ('wompi')),
  -- Qué tokenizó el atleta. `nequi` es el diferenciador; `card` es lo que
  -- tienen todos. Los otros dos los admite Wompi como fuente de pago.
  kind                text not null
                      check (kind in ('card','nequi','daviplata','bancolombia_transfer')),

  -- EL identificador con el que se cobra. Es el `id` de la fuente de pago de
  -- Wompi (un entero, se guarda como texto para no atarnos a su tipo).
  provider_source_id  text not null check (length(provider_source_id) between 1 and 64),
  -- El token de tokenización (`tok_…`). Se guarda solo como rastro para
  -- soporte: NO sirve para cobrar y caduca. Puede ser null.
  provider_token      text check (provider_token is null or provider_token ~ '^[A-Za-z0-9_-]{8,128}$'),

  -- Para mostrar. NADA MÁS.
  brand               text,
  -- Exactamente cuatro dígitos. Si alguien intenta meter un número de tarjeta
  -- completo aquí, el CHECK lo rechaza.
  last_four           text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  -- Teléfono enmascarado para Nequi ("+57 *** *** 4567"). El CHECK prohíbe
  -- cinco dígitos seguidos: un teléfono real no cabe.
  masked_phone        text check (masked_phone is null or masked_phone !~ '[0-9]{5}'),
  exp_month           int  check (exp_month is null or exp_month between 1 and 12),
  exp_year            int  check (exp_year is null or exp_year between 2024 and 2100),

  -- Wompi exige el correo del pagador tanto para crear la fuente de pago como
  -- para cada transacción. Sin él no hay cobro posible, así que se guarda al
  -- autorizar y no se busca después.
  customer_email      text,

  -- `active`  : sirve para cobrar
  -- `revoked` : lo revocó el atleta, o el banco/la pasarela lo desvinculó
  -- `expired` : la tarjeta venció
  -- `failed`  : la pasarela lo rechaza de forma no recuperable
  status              text not null default 'active'
                      check (status in ('active','revoked','expired','failed')),
  revoked_at          timestamptz,
  revoke_reason       text,

  is_default          boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Una fuente de pago de la pasarela no se registra dos veces.
  unique (org_id, provider, provider_source_id),
  -- Un método activo tiene que decir CÓMO se muestra: o los últimos cuatro
  -- dígitos, o el teléfono enmascarado. "Método de pago guardado" a secas no
  -- le dice nada al atleta y no le permite reconocer de dónde le sale la plata.
  check (status <> 'active' or last_four is not null or masked_phone is not null)
);

-- Todo índice empieza por org_id: sin eso las consultas escanean los datos de
-- todos los boxes.
create index payment_methods_org_athlete_idx
  on public.payment_methods (org_id, athlete_id, created_at desc);
create index payment_methods_org_status_idx
  on public.payment_methods (org_id, status);
-- Un solo método predeterminado activo por atleta: es el que usa el débito.
create unique index payment_methods_predeterminado_idx
  on public.payment_methods (org_id, athlete_id)
  where is_default and status = 'active';

create trigger payment_methods_touch before update on public.payment_methods
  for each row execute function public.touch_updated_at();

comment on table public.payment_methods is
  'Medio de pago tokenizado de un atleta. Guarda el identificador de la pasarela, NUNCA el número de la tarjeta ni el CVV.';
comment on column public.payment_methods.provider_source_id is
  'Identificador de la fuente de pago en la pasarela (payment_source_id de Wompi). Es lo único con lo que se cobra.';
comment on column public.payment_methods.last_four is
  'Últimos cuatro dígitos, solo para mostrar. El CHECK impide que quepa un número de tarjeta.';
comment on column public.payment_methods.masked_phone is
  'Teléfono Nequi enmascarado, solo para mostrar. El CHECK prohíbe cinco dígitos seguidos.';

-- -----------------------------------------------------------------------------
-- Autorización del atleta · explícita, fechada y revocable
-- -----------------------------------------------------------------------------
-- Debitar la cuenta de alguien sin una autorización que se pueda enseñar es
-- indefendible ante una queja, ante la SIC y ante la propia pasarela. Se guarda
-- QUÉ aceptó (el texto literal y su versión), CUÁNDO (la fecha es la evidencia)
-- y hasta CUÁNTO autorizó.
--
-- Una autorización no se edita nunca: un trigger solo deja tocar las columnas
-- de revocación, y una revocada no se puede reactivar. Para volver a debitar,
-- el atleta autoriza de nuevo y queda otra fila con otra fecha.
-- -----------------------------------------------------------------------------
create table public.recurring_authorizations (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  athlete_id          uuid not null references public.athletes(id) on delete cascade,
  payment_method_id   uuid not null references public.payment_methods(id) on delete cascade,

  -- LA EVIDENCIA.
  authorized_at       timestamptz not null default now(),
  accepted_text       text not null check (length(accepted_text) >= 40),
  accepted_version    text not null,
  -- Enlace a la política que aceptó en la pasarela (permalink del token de
  -- aceptación de Wompi), si lo hubo.
  acceptance_permalink text,
  -- Tope autorizado por cobro. Null = sin tope explícito (se cobra el saldo de
  -- la factura). Con tope, un cobro por encima NO se intenta.
  max_amount_cents    bigint check (max_amount_cents is null or max_amount_cents > 0),

  -- Quién y desde dónde. Rastro mínimo para poder responder un reclamo.
  authorized_by       uuid references auth.users(id),
  ip                  inet,
  user_agent          text,

  revoked_at          timestamptz,
  revoked_by          uuid references auth.users(id),
  revoke_reason       text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (revoked_at is null or revoked_at >= authorized_at)
);

create index recurring_authorizations_org_athlete_idx
  on public.recurring_authorizations (org_id, athlete_id, authorized_at desc);
create index recurring_authorizations_method_idx
  on public.recurring_authorizations (org_id, payment_method_id);
-- Una sola autorización vigente por atleta. Autorizar de nuevo revoca la
-- anterior (lo hace `register_payment_method`), así que nunca hay dos.
create unique index recurring_authorizations_vigente_idx
  on public.recurring_authorizations (org_id, athlete_id)
  where revoked_at is null;

create trigger recurring_authorizations_touch before update on public.recurring_authorizations
  for each row execute function public.touch_updated_at();

comment on table public.recurring_authorizations is
  'Autorización de débito automático del atleta. La fecha es la evidencia; no se edita, solo se revoca.';

-- -----------------------------------------------------------------------------
-- Cobros automáticos
-- -----------------------------------------------------------------------------
-- Un cobro es "a esta factura, por este método, le toca débito". Los estados:
--
--   queued      encolado, esperando a que el job lo ejecute
--   processing  enviado a la pasarela, esperando respuesta o webhook
--   approved    cobrado (el pago lo registró apply_wompi_payment, no esta tabla)
--   declined    rechazado con reintento programado (next_attempt_at)
--   exhausted   se agotaron los reintentos: hay que avisarle al atleta
--   failed      fallo NO reintentable (token revocado, tarjeta vencida): hay
--               que pedirle al atleta que vuelva a autorizar
--   cancelled   ya no aplica (la factura se pagó por otra vía, o se revocó la
--               autorización)
-- -----------------------------------------------------------------------------
create table public.recurring_charges (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  athlete_id          uuid not null references public.athletes(id) on delete cascade,
  invoice_id          uuid not null references public.invoices(id) on delete cascade,
  payment_method_id   uuid not null references public.payment_methods(id),
  authorization_id    uuid not null references public.recurring_authorizations(id),

  amount_cents        bigint not null check (amount_cents > 0),
  currency            char(3) not null default 'COP',
  -- El periodo de la factura. Es lo que hace idempotente al job: dos cobros del
  -- mismo periodo por la misma factura no pueden existir.
  period_start        date not null,

  status              text not null default 'queued'
                      check (status in ('queued','processing','approved','declined','exhausted','failed','cancelled')),

  attempt             int not null default 0 check (attempt >= 0),
  max_attempts        int not null default 4 check (max_attempts between 1 and 10),
  queued_at           timestamptz not null default now(),
  next_attempt_at     timestamptz not null default now(),
  last_attempt_at     timestamptz,
  charged_at          timestamptz,

  -- El intento vivo: la referencia que viaja a la pasarela y el intento de pago
  -- que la traduce a box/factura cuando vuelve el webhook.
  reference           text,
  payment_intent_id   uuid references public.payment_intents(id) on delete set null,
  provider_transaction_id text,

  -- Por qué falló. Un fallo por fondos NO es lo mismo que un token revocado.
  failure_kind        text check (failure_kind in (
                        'insufficient_funds','revoked_token','expired_card',
                        'invalid_source','over_authorized_amount','missing_email',
                        'gateway_error','declined','other')),
  last_error_code     text,
  last_error_message  text,
  cancel_reason       text,

  -- Marca de "hay que avisarle al atleta". El canal (WhatsApp, correo) es del
  -- motor de automatizaciones; aquí solo queda la marca para que la recoja.
  notice_pending      boolean not null default false,
  notice_kind         text check (notice_kind in ('retries_exhausted','needs_new_authorization')),
  notified_at         timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- IDEMPOTENCIA DEL DÉBITO. Esta línea es la que impide cobrarle dos veces el
-- mismo mes al mismo atleta si el job corre dos veces. Un cobro cancelado sí
-- deja volver a encolar (p. ej. el atleta revocó y volvió a autorizar).
create unique index recurring_charges_una_por_periodo_idx
  on public.recurring_charges (org_id, invoice_id, period_start)
  where status <> 'cancelled';

create index recurring_charges_cola_idx
  on public.recurring_charges (org_id, next_attempt_at)
  where status in ('queued','declined');
create index recurring_charges_org_athlete_idx
  on public.recurring_charges (org_id, athlete_id, created_at desc);
create index recurring_charges_invoice_idx
  on public.recurring_charges (org_id, invoice_id);
create index recurring_charges_aviso_idx
  on public.recurring_charges (org_id, notice_kind)
  where notice_pending;
create index recurring_charges_reference_idx
  on public.recurring_charges (org_id, reference)
  where reference is not null;

create trigger recurring_charges_touch before update on public.recurring_charges
  for each row execute function public.touch_updated_at();

comment on table public.recurring_charges is
  'Intentos de cobro automático. El índice único (org_id, invoice_id, period_start) es lo que impide cobrar dos veces el mismo periodo.';

-- -----------------------------------------------------------------------------
-- Historial de reintentos
-- -----------------------------------------------------------------------------
-- Cada golpe contra la pasarela deja una fila. Sin esto, "¿por qué me cobraron
-- tres veces?" no se puede responder, y la respuesta correcta —"se intentó tres
-- veces y solo una pasó"— no se puede demostrar.
-- -----------------------------------------------------------------------------
create table public.recurring_charge_attempts (
  id             bigint generated always as identity primary key,
  org_id         uuid not null references public.organizations(id) on delete cascade,
  charge_id      uuid not null references public.recurring_charges(id) on delete cascade,
  attempt_no     int not null check (attempt_no > 0),
  reference      text,
  provider_transaction_id text,
  -- `sent` queda cuando se envió y todavía no hay respuesta: si la función
  -- muere a mitad, esa fila es la señal de que algo pasó.
  status         text not null default 'sent'
                 check (status in ('sent','approved','pending','declined','error','skipped')),
  failure_kind   text,
  error_code     text,
  error_message  text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  unique (charge_id, attempt_no)
);

create index recurring_charge_attempts_org_idx
  on public.recurring_charge_attempts (org_id, charge_id, attempt_no);

comment on table public.recurring_charge_attempts is
  'Un renglón por golpe contra la pasarela. Es la prueba de cuántas veces se intentó y con qué resultado.';

-- =============================================================================
-- Reintentos escalonados
-- =============================================================================
-- Al día 1, al 3 y al 7 desde que se encoló. No antes: a quien no le entró el
-- sueldo el día 1 tampoco le entra el día 2, y cada golpe rechazado le cuesta
-- reputación al comercio ante la pasarela.
--
-- Se mide desde `queued_at` (no desde el último intento) para que la escalera
-- sea la misma aunque el job se caiga un día: el atleta ve fechas predecibles.
-- =============================================================================
create or replace function public.recurring_retry_offset(p_attempt int)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_attempt
           when 1 then interval '1 day'
           when 2 then interval '3 days'
           when 3 then interval '7 days'
           else null
         end
$$;

comment on function public.recurring_retry_offset is
  'Escalera de reintentos medida desde que se encoló el cobro: día 1, día 3 y día 7.';

-- =============================================================================
-- Clasificación del fallo
-- =============================================================================
-- El requisito de negocio: un fallo por fondos insuficientes SE REINTENTA; un
-- token revocado NO, porque reintentarlo no lo va a arreglar nunca y lo único
-- que hace es quemar intentos y confundir al atleta. En ese caso se le pide que
-- vuelva a autorizar.
--
-- La pasarela no publica un catálogo estable de códigos de rechazo, así que se
-- clasifica por el texto además de por el código. Lo que no se reconoce se
-- trata como rechazo reintentable: preferimos un reintento de más a dar por
-- perdido un cobro que sí habría entrado.
-- VERIFICAR contra códigos reales de sandbox (ver docs/12-debito-recurrente.md).
-- =============================================================================
create or replace function public.recurring_failure_kind(
  p_provider_status text,
  p_error_code      text default null,
  p_error_message   text default null
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(coalesce(p_error_code,'') || ' ' || coalesce(p_error_message,''))
         ~ '(INSUFFICIENT|FONDOS|SALDO|LIMIT_EXCEEDED|CUPO)' then 'insufficient_funds'
    when upper(coalesce(p_error_code,'') || ' ' || coalesce(p_error_message,''))
         ~ '(REVOK|REVOC|UNSUBSCRIB|DESVINCUL|CANCEL|INACTIVE|NOT_FOUND|UNAVAILABLE_SOURCE)' then 'revoked_token'
    when upper(coalesce(p_error_code,'') || ' ' || coalesce(p_error_message,''))
         ~ '(EXPIRED|VENCID)' then 'expired_card'
    when upper(coalesce(p_error_code,'') || ' ' || coalesce(p_error_message,''))
         ~ '(INVALID_PAYMENT_SOURCE|INVALID_TOKEN|FUENTE)' then 'invalid_source'
    when upper(coalesce(p_provider_status,'')) in ('ERROR','VOIDED') then 'gateway_error'
    when upper(coalesce(p_provider_status,'')) = 'DECLINED' then 'declined'
    else 'other'
  end
$$;

comment on function public.recurring_failure_kind is
  'Traduce el rechazo de la pasarela a una causa nuestra. Decide si el cobro se reintenta o si hay que volver a autorizar.';

/** Causas que NO se reintentan: reintentarlas no las arregla. */
create or replace function public.recurring_failure_is_final(p_failure_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_failure_kind, '') in
    ('revoked_token','expired_card','invalid_source','over_authorized_amount','missing_email')
$$;

-- =============================================================================
-- Referencia del cobro
-- =============================================================================
-- Wompi solo admite [A-Za-z0-9_-] y NO deja reutilizar una referencia ya usada
-- en una transacción completada, así que CADA intento estrena la suya. Lleva el
-- box adentro por la misma razón que la de `create-payment-link`: que dos boxes
-- no puedan generar la misma cadena.
-- =============================================================================
create or replace function public.recurring_reference(
  p_org_id         uuid,
  p_invoice_number text,
  p_attempt        int
)
returns text
language sql
volatile
set search_path = ''
as $$
  select 'SCL-' || upper(substr(replace(p_org_id::text, '-', ''), 1, 8))
      || '-' || upper(substr(regexp_replace(coalesce(p_invoice_number, 'SINNUM'), '[^A-Za-z0-9]', '', 'g'), 1, 16))
      || '-D' || greatest(p_attempt, 1)::text
      || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
$$;

-- =============================================================================
-- Registrar método de pago + autorización, en un solo acto
-- =============================================================================
-- La llama la Edge Function `tokenize-payment-method` con service_role, DESPUÉS
-- de haber comprobado con la llave del usuario (y por tanto con RLS) que quien
-- autoriza es ese atleta o el equipo del box.
--
-- Método y autorización se insertan juntos a propósito: un método tokenizado
-- sin autorización es un débito sin permiso, y una autorización sin método no
-- sirve para nada. Si algo falla, no queda ni lo uno ni lo otro.
-- =============================================================================
create or replace function public.register_payment_method(
  p_org_id              uuid,
  p_athlete_id          uuid,
  p_kind                text,
  p_provider_source_id  text,
  p_accepted_text       text,
  p_accepted_version    text,
  p_customer_email      text default null,
  p_provider_token      text default null,
  p_brand               text default null,
  p_last_four           text default null,
  p_masked_phone        text default null,
  p_exp_month           int  default null,
  p_exp_year            int  default null,
  p_acceptance_permalink text default null,
  p_max_amount_cents    bigint default null,
  p_authorized_by       uuid default null,
  p_ip                  inet default null,
  p_user_agent          text default null,
  p_now                 timestamptz default now()
)
returns table (payment_method_id uuid, authorization_id uuid, replaced boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ath      public.athletes%rowtype;
  v_previa   uuid;
  v_metodo   uuid;
  v_auth     uuid;
  v_reemplaza boolean := false;
begin
  select * into v_ath from public.athletes a
  where a.id = p_athlete_id and a.org_id = p_org_id and a.deleted_at is null;
  if not found then
    raise exception 'El atleta no existe en ese box' using errcode = 'no_data_found';
  end if;

  if p_last_four is null and p_masked_phone is null then
    raise exception 'Hay que guardar algo con lo que el atleta reconozca su medio de pago'
      using errcode = 'check_violation';
  end if;

  -- Autorizar de nuevo revoca lo anterior: nunca hay dos autorizaciones
  -- vigentes ni dos métodos predeterminados. La revocación arrastra (por
  -- trigger) los cobros encolados del método viejo.
  select ra.id into v_previa
  from public.recurring_authorizations ra
  where ra.org_id = p_org_id and ra.athlete_id = p_athlete_id and ra.revoked_at is null
  limit 1;

  if v_previa is not null then
    update public.recurring_authorizations
    set revoked_at = p_now,
        revoked_by = p_authorized_by,
        revoke_reason = 'El atleta registró un medio de pago nuevo'
    where id = v_previa;
    v_reemplaza := true;
  end if;

  -- Por si quedara algún método activo sin autorización (no debería).
  update public.payment_methods
  set status = 'revoked', revoked_at = p_now, is_default = false,
      revoke_reason = coalesce(revoke_reason, 'Reemplazado por un medio de pago nuevo')
  where org_id = p_org_id and athlete_id = p_athlete_id and status = 'active';

  insert into public.payment_methods (
    org_id, athlete_id, kind, provider_source_id, provider_token,
    brand, last_four, masked_phone, exp_month, exp_year, customer_email,
    status, is_default, created_at, updated_at
  )
  values (
    p_org_id, p_athlete_id, p_kind, p_provider_source_id, p_provider_token,
    p_brand, p_last_four, p_masked_phone, p_exp_month, p_exp_year, p_customer_email,
    'active', true, p_now, p_now
  )
  returning id into v_metodo;

  insert into public.recurring_authorizations (
    org_id, athlete_id, payment_method_id, authorized_at,
    accepted_text, accepted_version, acceptance_permalink,
    max_amount_cents, authorized_by, ip, user_agent, created_at, updated_at
  )
  values (
    p_org_id, p_athlete_id, v_metodo, p_now,
    p_accepted_text, p_accepted_version, p_acceptance_permalink,
    p_max_amount_cents, p_authorized_by, p_ip, p_user_agent, p_now, p_now
  )
  returning id into v_auth;

  payment_method_id := v_metodo;
  authorization_id  := v_auth;
  replaced          := v_reemplaza;
  return next;
end;
$$;

comment on function public.register_payment_method is
  'Guarda el método tokenizado y la autorización del atleta en un solo acto. La llama tokenize-payment-method con service_role.';

-- =============================================================================
-- Una autorización no se edita: se revoca
-- =============================================================================
-- Si la autorización se pudiera editar, no sería evidencia de nada. Este
-- trigger deja tocar SOLO las columnas de revocación, y no deja resucitar una
-- revocada: para volver a debitar hay que autorizar otra vez, y eso deja otra
-- fila con otra fecha.
-- =============================================================================
create or replace function public.recurring_authorization_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id
     or new.athlete_id is distinct from old.athlete_id
     or new.payment_method_id is distinct from old.payment_method_id
     or new.authorized_at is distinct from old.authorized_at
     or new.accepted_text is distinct from old.accepted_text
     or new.accepted_version is distinct from old.accepted_version
     or new.acceptance_permalink is distinct from old.acceptance_permalink
     or new.max_amount_cents is distinct from old.max_amount_cents
     or new.authorized_by is distinct from old.authorized_by
     or new.ip is distinct from old.ip
     or new.user_agent is distinct from old.user_agent then
    raise exception 'La autorización de débito es evidencia: no se modifica, solo se revoca.'
      using errcode = 'check_violation';
  end if;

  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'Una autorización revocada no se reactiva: el atleta tiene que autorizar de nuevo.'
      using errcode = 'check_violation';
  end if;

  -- Revocar es un toque: basta con marcar la fecha y el resto se completa solo.
  if new.revoked_at is not null and old.revoked_at is null then
    new.revoked_by := coalesce(new.revoked_by, (select auth.uid()));
  end if;

  return new;
end;
$$;

create trigger recurring_authorizations_inmutable
  before update on public.recurring_authorizations
  for each row execute function public.recurring_authorization_immutable();

-- -----------------------------------------------------------------------------
-- Revocar corta el débito EN EL ACTO
-- -----------------------------------------------------------------------------
-- No "en la próxima corrida del job": en el mismo instante. El método queda
-- revocado y todo cobro encolado o a la espera de reintento queda cancelado.
-- Un cobro ya enviado a la pasarela (`processing`) no se toca: esa plata ya
-- está en camino y mentir sobre eso es peor.
-- -----------------------------------------------------------------------------
create or replace function public.recurring_authorization_revoked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_methods
  set status = 'revoked',
      revoked_at = new.revoked_at,
      is_default = false,
      revoke_reason = coalesce(new.revoke_reason, 'El atleta revocó la autorización')
  where id = new.payment_method_id
    and status = 'active';

  update public.recurring_charges
  set status = 'cancelled',
      cancel_reason = coalesce(new.revoke_reason, 'El atleta revocó la autorización'),
      notice_pending = false
  where authorization_id = new.id
    and status in ('queued','declined');

  return new;
end;
$$;

create trigger recurring_authorizations_revocacion
  after update on public.recurring_authorizations
  for each row
  when (new.revoked_at is not null and old.revoked_at is null)
  execute function public.recurring_authorization_revoked();

comment on function public.recurring_authorization_revoked is
  'Revocar la autorización desactiva el método y cancela los cobros encolados en el acto.';

-- =============================================================================
-- El job · encolar los cobros del día
-- =============================================================================
-- Mismo patrón que `generate_invoices` (0007): advisory lock por box, "hoy" en
-- la zona horaria del box y `p_now` inyectable.
--
-- Qué se cobra: toda factura CON SALDO de un atleta que tenga método activo y
-- autorización vigente. Una factura ya pagada (a mano, en efectivo, por enlace)
-- no tiene saldo y por tanto no se cobra: el filtro es el saldo, no el estado.
--
-- La autorización NO es retroactiva: solo se debitan facturas emitidas a partir
-- del día en que el atleta autorizó. Autorizar el débito no puede significar
-- que al día siguiente le salgan cuatro meses de deuda vieja de la cuenta sin
-- avisar; esa deuda se cobra por enlace, hablando con él.
-- =============================================================================
create or replace function public.charge_due_subscriptions(
  p_org_id uuid default null,          -- null = todos los boxes
  p_now    timestamptz default now()   -- inyectable para poder probarlo
)
returns table (
  org_id         uuid,
  charges_queued int,
  retries_ready  int,
  cancelled      int,
  run_date       date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  org        record;
  fac        record;
  v_today    date;
  v_encolados int;
  v_cancelados int;
  v_reintentos int;
  v_id       uuid;
begin
  for org in
    select o.id, o.timezone, o.currency
    from public.organizations o
    where (p_org_id is null or o.id = p_org_id)
      and o.status in ('trial','active','past_due')
  loop
    -- Un solo proceso encolando por box. Si otra ejecución ya lo tiene, esta se
    -- salta el box en vez de esperar: el job vuelve a correr en una hora.
    if not pg_try_advisory_xact_lock(hashtext('charge_due_subscriptions'), hashtext(org.id::text)) then
      continue;
    end if;

    -- "Hoy" en el box, no en UTC. A las 02:00 UTC en Bogotá es el día anterior.
    v_today := (p_now at time zone org.timezone)::date;
    v_encolados := 0;
    v_cancelados := 0;

    -- ---------------------------------------------------------------------
    -- 1 · Limpiar lo que ya no aplica: facturas saldadas o anuladas, métodos
    --     revocados, autorizaciones caídas. Antes de encolar nada.
    -- ---------------------------------------------------------------------
    with sobrantes as (
      select rc.id,
             case
               when i.status = 'void' then 'La factura se anuló'
               when i.amount_cents - i.paid_cents <= 0 then 'La factura ya está saldada'
               when ra.revoked_at is not null then 'El atleta revocó la autorización'
               else 'El medio de pago ya no está activo'
             end as motivo
      from public.recurring_charges rc
      join public.invoices i on i.id = rc.invoice_id
      join public.recurring_authorizations ra on ra.id = rc.authorization_id
      join public.payment_methods pm on pm.id = rc.payment_method_id
      where rc.org_id = org.id
        and rc.status in ('queued','declined')
        and (
          i.status = 'void'
          or i.amount_cents - i.paid_cents <= 0
          or ra.revoked_at is not null
          or pm.status <> 'active'
        )
    ),
    limpiadas as (
      update public.recurring_charges rc
      set status = 'cancelled',
          notice_pending = false,
          cancel_reason = s.motivo
      from sobrantes s
      where rc.id = s.id
      returning rc.id
    )
    select count(*)::int into v_cancelados from limpiadas;

    -- ---------------------------------------------------------------------
    -- 2 · Encolar. `on conflict do nothing` sobre el índice único
    --     (org_id, invoice_id, period_start): correr el job dos veces el mismo
    --     día NO encola dos cobros.
    -- ---------------------------------------------------------------------
    for fac in
      select i.id          as invoice_id,
             i.athlete_id  as athlete_id,
             i.period_start as period_start,
             (i.amount_cents - i.paid_cents) as saldo,
             pm.id         as method_id,
             ra.id         as auth_id
      from public.invoices i
      join public.athletes a on a.id = i.athlete_id and a.deleted_at is null
      join public.payment_methods pm
        on pm.org_id = i.org_id and pm.athlete_id = i.athlete_id
       and pm.status = 'active' and pm.is_default
      join public.recurring_authorizations ra
        on ra.org_id = i.org_id and ra.payment_method_id = pm.id and ra.revoked_at is null
      where i.org_id = org.id
        and i.status in ('open','partial','overdue')
        and i.amount_cents - i.paid_cents > 0
        and i.issued_on <= v_today
        -- La autorización no es retroactiva.
        and i.issued_on >= (ra.authorized_at at time zone org.timezone)::date
        -- Un cobro por encima de lo autorizado no se intenta siquiera.
        and (ra.max_amount_cents is null or i.amount_cents - i.paid_cents <= ra.max_amount_cents)
    loop
      insert into public.recurring_charges (
        org_id, athlete_id, invoice_id, payment_method_id, authorization_id,
        amount_cents, currency, period_start, status,
        queued_at, next_attempt_at, created_at, updated_at
      )
      values (
        org.id, fac.athlete_id, fac.invoice_id, fac.method_id, fac.auth_id,
        fac.saldo, coalesce(org.currency, 'COP'), fac.period_start, 'queued',
        p_now, p_now, p_now, p_now
      )
      on conflict do nothing
      returning id into v_id;

      if v_id is not null then
        v_encolados := v_encolados + 1;
        v_id := null;
      end if;
    end loop;

    -- ---------------------------------------------------------------------
    -- 3 · Cuántos reintentos están maduros (informativo: los ejecuta
    --     `claim_recurring_charges`, que es quien toma el trabajo).
    -- ---------------------------------------------------------------------
    select count(*)::int into v_reintentos
    from public.recurring_charges rc
    where rc.org_id = org.id
      and rc.status = 'declined'
      and rc.next_attempt_at <= p_now;

    org_id         := org.id;
    charges_queued := v_encolados;
    retries_ready  := v_reintentos;
    cancelled      := v_cancelados;
    run_date       := v_today;
    return next;
  end loop;
end;
$$;

comment on function public.charge_due_subscriptions is
  'Encola el débito automático de las facturas con saldo cuyo atleta tenga método tokenizado y autorización vigente. Idempotente y con advisory lock por box.';

-- =============================================================================
-- Tomar el trabajo
-- =============================================================================
-- La llama la Edge Function `charge-subscriptions` con service_role. Devuelve
-- lo justo para golpear la pasarela y deja cada cobro en `processing` con su
-- referencia y su intento de pago ya creados.
--
-- `for update skip locked`: si dos ejecuciones del job se solapan, la segunda
-- se salta las filas que la primera ya tomó en vez de esperarla. Sin esto, dos
-- contenedores podrían cobrarle a la misma persona a la vez.
--
-- El monto se RECALCULA aquí (saldo de la factura ahora mismo), no se usa el
-- que se guardó al encolar: entre el encolado y el cobro el atleta pudo haber
-- abonado en efectivo.
-- =============================================================================
create or replace function public.claim_recurring_charges(
  p_org_id uuid default null,
  p_limit  int default 50,
  p_now    timestamptz default now()
)
returns table (
  charge_id          uuid,
  org_id             uuid,
  athlete_id         uuid,
  invoice_id         uuid,
  invoice_number     text,
  amount_cents       bigint,
  currency           char(3),
  reference          text,
  intent_id          uuid,
  kind               text,
  provider_source_id text,
  customer_email     text,
  attempt            int,
  max_attempts       int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.recurring_charges%rowtype;
  v_inv    public.invoices%rowtype;
  v_auth   public.recurring_authorizations%rowtype;
  v_pm     public.payment_methods%rowtype;
  v_moneda char(3);
  v_saldo  bigint;
  v_ref    text;
  v_intent uuid;
  v_correo text;
begin
  for c in
    select rc.*
    from public.recurring_charges rc
    where rc.status in ('queued','declined')
      and rc.next_attempt_at <= p_now
      and (p_org_id is null or rc.org_id = p_org_id)
    order by rc.next_attempt_at, rc.created_at
    limit greatest(coalesce(p_limit, 50), 1)
    for update skip locked
  loop
    select * into v_inv from public.invoices i where i.id = c.invoice_id;
    v_saldo := v_inv.amount_cents - v_inv.paid_cents;

    -- Una factura ya pagada (a mano o por enlace) no se debita.
    if v_inv.status = 'void' or v_saldo <= 0 then
      update public.recurring_charges
      set status = 'cancelled',
          cancel_reason = case when v_inv.status = 'void'
                               then 'La factura se anuló'
                               else 'La factura ya está saldada' end,
          notice_pending = false
      where id = c.id;
      continue;
    end if;

    select * into v_auth from public.recurring_authorizations ra where ra.id = c.authorization_id;
    if v_auth.revoked_at is not null then
      update public.recurring_charges
      set status = 'cancelled',
          cancel_reason = 'El atleta revocó la autorización',
          notice_pending = false
      where id = c.id;
      continue;
    end if;

    select * into v_pm from public.payment_methods pm where pm.id = c.payment_method_id;
    if v_pm.status <> 'active' then
      update public.recurring_charges
      set status = 'failed',
          failure_kind = 'revoked_token',
          last_error_message = 'El medio de pago ya no está activo',
          notice_pending = true,
          notice_kind = 'needs_new_authorization'
      where id = c.id;
      continue;
    end if;

    if v_auth.max_amount_cents is not null and v_saldo > v_auth.max_amount_cents then
      update public.recurring_charges
      set status = 'failed',
          failure_kind = 'over_authorized_amount',
          last_error_message = 'El cobro supera el tope que autorizó el atleta',
          notice_pending = true,
          notice_kind = 'needs_new_authorization'
      where id = c.id;
      continue;
    end if;

    v_correo := coalesce(v_pm.customer_email,
                         (select a.email from public.athletes a where a.id = c.athlete_id));
    if v_correo is null or v_correo = '' then
      -- La pasarela exige correo del pagador. Sin él no hay cobro, y
      -- reintentarlo no lo arregla.
      update public.recurring_charges
      set status = 'failed',
          failure_kind = 'missing_email',
          last_error_message = 'El atleta no tiene correo y la pasarela lo exige',
          notice_pending = true,
          notice_kind = 'needs_new_authorization'
      where id = c.id;
      continue;
    end if;

    select o.currency into v_moneda from public.organizations o where o.id = c.org_id;
    v_ref := public.recurring_reference(c.org_id, v_inv.number, c.attempt + 1);

    -- El intento de pago es lo que traduce la referencia a box y factura cuando
    -- vuelve el webhook. Se crea uno por intento: la pasarela no deja reutilizar
    -- una referencia ya usada.
    insert into public.payment_intents (
      org_id, invoice_id, athlete_id, amount_cents, currency, reference, status
    )
    values (
      c.org_id, c.invoice_id, c.athlete_id, v_saldo, coalesce(v_moneda, 'COP'), v_ref, 'created'
    )
    returning id into v_intent;

    update public.recurring_charges
    set status = 'processing',
        attempt = c.attempt + 1,
        amount_cents = v_saldo,
        currency = coalesce(v_moneda, 'COP'),
        reference = v_ref,
        payment_intent_id = v_intent,
        last_attempt_at = p_now
    where id = c.id;

    insert into public.recurring_charge_attempts (
      org_id, charge_id, attempt_no, reference, status, started_at
    )
    -- `on conflict do nothing` a secas: el objetivo explícito no se puede
    -- nombrar aquí porque `charge_id` es también un parámetro de salida de esta
    -- función. La restricción única (charge_id, attempt_no) decide igual.
    values (c.org_id, c.id, c.attempt + 1, v_ref, 'sent', p_now)
    on conflict do nothing;

    charge_id          := c.id;
    org_id             := c.org_id;
    athlete_id         := c.athlete_id;
    invoice_id         := c.invoice_id;
    invoice_number     := v_inv.number;
    amount_cents       := v_saldo;
    currency           := coalesce(v_moneda, 'COP');
    reference          := v_ref;
    intent_id          := v_intent;
    kind               := v_pm.kind;
    provider_source_id := v_pm.provider_source_id;
    customer_email     := v_correo;
    attempt            := c.attempt + 1;
    max_attempts       := c.max_attempts;
    return next;
  end loop;
end;
$$;

comment on function public.claim_recurring_charges is
  'Toma los cobros maduros, crea su intento de pago y los deja en processing. Usa FOR UPDATE SKIP LOCKED para que dos ejecuciones no cobren lo mismo.';

-- =============================================================================
-- Anotar el resultado del intento
-- =============================================================================
-- La llama `charge-subscriptions` con lo que respondió la pasarela. Aquí NO se
-- registra el pago: eso lo hace `apply_wompi_payment` (0009) y de ahí el trigger
-- `payments_recalc_invoice` (0003) salda la factura. Un solo lugar concilia.
--
-- Lo que sí se decide aquí es la escalera de reintentos y la causa:
--   · fondos insuficientes  -> se reintenta (día 1, 3 y 7)
--   · token revocado / tarjeta vencida -> NO se reintenta; se le pide al
--     atleta que vuelva a autorizar
--   · se acabaron los intentos -> se marca `exhausted` y queda el aviso pendiente
-- =============================================================================
create or replace function public.record_recurring_charge_result(
  p_charge_id       uuid,
  p_provider_status text,                 -- APPROVED|PENDING|DECLINED|VOIDED|ERROR
  p_transaction_id  text default null,
  p_error_code      text default null,
  p_error_message   text default null,
  p_now             timestamptz default now()
)
returns table (
  charge_status   text,
  failure_kind    text,
  next_attempt_at timestamptz,
  will_retry      boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.recurring_charges%rowtype;
  v_estado text;
  v_causa  text;
  v_final  boolean;
  v_offset interval;
  v_prox   timestamptz;
  v_nuevo  text;
  v_aviso  text;
begin
  select * into c from public.recurring_charges rc where rc.id = p_charge_id for update;
  if not found then
    raise exception 'El cobro % no existe', p_charge_id using errcode = 'no_data_found';
  end if;

  v_estado := upper(coalesce(p_provider_status, ''));

  -- ---------------------------------------------------------------------
  -- Aprobado
  -- ---------------------------------------------------------------------
  if v_estado = 'APPROVED' then
    update public.recurring_charge_attempts
    set status = 'approved',
        provider_transaction_id = coalesce(p_transaction_id, provider_transaction_id),
        finished_at = p_now
    where charge_id = c.id and attempt_no = c.attempt;

    update public.recurring_charges
    set status = 'approved',
        charged_at = coalesce(charged_at, p_now),
        provider_transaction_id = coalesce(p_transaction_id, provider_transaction_id),
        failure_kind = null,
        notice_pending = false,
        notice_kind = null
    where id = c.id;

    charge_status   := 'approved';
    failure_kind    := null;
    next_attempt_at := null;
    will_retry      := false;
    return next;
    return;
  end if;

  -- ---------------------------------------------------------------------
  -- En curso: la pasarela todavía no decide. No se reintenta: se espera el
  -- webhook, que es quien trae el estado final.
  -- ---------------------------------------------------------------------
  if v_estado = 'PENDING' then
    update public.recurring_charge_attempts
    set status = 'pending',
        provider_transaction_id = coalesce(p_transaction_id, provider_transaction_id)
    where charge_id = c.id and attempt_no = c.attempt;

    update public.recurring_charges
    set status = 'processing',
        provider_transaction_id = coalesce(p_transaction_id, provider_transaction_id)
    where id = c.id;

    charge_status   := 'processing';
    failure_kind    := null;
    next_attempt_at := null;
    will_retry      := false;
    return next;
    return;
  end if;

  -- ---------------------------------------------------------------------
  -- Falló. La causa decide si se reintenta.
  -- ---------------------------------------------------------------------
  v_causa := public.recurring_failure_kind(v_estado, p_error_code, p_error_message);
  v_final := public.recurring_failure_is_final(v_causa);
  v_offset := public.recurring_retry_offset(c.attempt);
  v_prox := null;
  v_aviso := null;

  if v_final then
    -- Un token revocado no se arregla reintentando: se le pide al atleta que
    -- vuelva a autorizar, y el método queda inservible para no seguir
    -- golpeando a la pasarela con él.
    v_nuevo := 'failed';
    v_aviso := 'needs_new_authorization';

    update public.payment_methods
    set status = case when v_causa = 'expired_card' then 'expired' else 'revoked' end,
        revoked_at = coalesce(revoked_at, p_now),
        is_default = false,
        revoke_reason = coalesce(p_error_message, 'La pasarela rechazó el medio de pago')
    where id = c.payment_method_id
      and status = 'active';

  elsif c.attempt >= c.max_attempts or v_offset is null then
    v_nuevo := 'exhausted';
    v_aviso := 'retries_exhausted';
  else
    v_nuevo := 'declined';
    -- La escalera se mide desde que se encoló, no desde el último intento.
    v_prox := c.queued_at + v_offset;
    -- Si el job estuvo caído y la fecha ya pasó, se reintenta en la siguiente
    -- corrida, no de inmediato dentro de la misma.
    if v_prox <= p_now then
      v_prox := p_now + interval '1 hour';
    end if;
  end if;

  update public.recurring_charge_attempts
  set status = case when v_estado in ('ERROR','VOIDED') then 'error' else 'declined' end,
      failure_kind = v_causa,
      error_code = p_error_code,
      error_message = p_error_message,
      provider_transaction_id = coalesce(p_transaction_id, provider_transaction_id),
      finished_at = p_now
  where charge_id = c.id and attempt_no = c.attempt;

  update public.recurring_charges
  set status = v_nuevo,
      failure_kind = v_causa,
      last_error_code = p_error_code,
      last_error_message = p_error_message,
      provider_transaction_id = coalesce(p_transaction_id, provider_transaction_id),
      next_attempt_at = coalesce(v_prox, c.next_attempt_at),
      notice_pending = (v_aviso is not null),
      notice_kind = v_aviso
  where id = c.id;

  charge_status   := v_nuevo;
  failure_kind    := v_causa;
  next_attempt_at := v_prox;
  will_retry      := (v_nuevo = 'declined');
  return next;
end;
$$;

comment on function public.record_recurring_charge_result is
  'Anota el resultado de un intento y programa (o no) el siguiente. No registra el pago: de eso se encarga apply_wompi_payment.';

-- =============================================================================
-- Conciliación con lo que ya existe
-- =============================================================================
-- Dos triggers cierran el círculo sin duplicar una sola línea de la lógica de
-- pagos:
--
--   1. Sobre `payments`: cuando entra un pago (del webhook de Wompi, del panel
--      en efectivo o de una importación), el cobro automático de esa referencia
--      queda `approved`, y los cobros encolados de una factura que ya quedó
--      saldada se cancelan. "No se le cobra por débito a quien ya pagó a mano."
--
--   2. Sobre `payment_intents`: cuando el webhook marca la transacción como
--      rechazada, el cobro entra por la misma puerta que un rechazo síncrono y
--      se programa el reintento. Sin esto, un cobro se quedaría en `processing`
--      para siempre esperando una respuesta que ya llegó.
-- =============================================================================
create or replace function public.settle_recurring_charge_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices%rowtype;
begin
  if new.status is distinct from 'confirmed' then
    return new;
  end if;

  -- El pago que produjo ESTE cobro automático (misma referencia).
  if new.reference is not null then
    update public.recurring_charges rc
    set status = 'approved',
        charged_at = coalesce(rc.charged_at, new.paid_at),
        provider_transaction_id = coalesce(new.provider_ref, rc.provider_transaction_id),
        failure_kind = null,
        notice_pending = false,
        notice_kind = null
    where rc.org_id = new.org_id
      and rc.reference = new.reference
      and rc.status in ('queued','processing','declined');
  end if;

  if new.invoice_id is null then
    return new;
  end if;

  -- El trigger `payments_recalc_invoice` (0003) ya actualizó el saldo cuando se
  -- llega aquí (este trigger se llama zzz_ justamente para ir después). Si la
  -- factura quedó sin saldo, cualquier débito encolado sobra.
  select * into v_inv from public.invoices i where i.id = new.invoice_id;

  if found and (v_inv.status = 'void' or v_inv.amount_cents - v_inv.paid_cents <= 0) then
    update public.recurring_charges rc
    set status = 'cancelled',
        cancel_reason = 'La factura se pagó por otra vía: no se le cobra por débito a quien ya pagó',
        notice_pending = false
    where rc.invoice_id = new.invoice_id
      and rc.status in ('queued','declined');
  end if;

  return new;
end;
$$;

-- El nombre empieza por zzz a propósito: Postgres dispara los triggers de fila
-- en orden alfabético, y este tiene que correr DESPUÉS de
-- `payments_recalc_invoice` (0003), que es quien deja el saldo al día, y
-- después de `zz_payments_cancela_cobros` (0011).
create trigger zzz_payments_concilia_debito
  after insert or update on public.payments
  for each row execute function public.settle_recurring_charge_on_payment();

comment on function public.settle_recurring_charge_on_payment is
  'Marca el cobro automático como aprobado cuando entra su pago, y cancela los débitos encolados de una factura ya saldada.';

create or replace function public.recurring_charge_on_intent_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge uuid;
begin
  if new.status not in ('declined','voided','error') then
    return new;
  end if;

  select rc.id into v_charge
  from public.recurring_charges rc
  where rc.payment_intent_id = new.id
    and rc.status = 'processing'
  limit 1;

  if v_charge is null then
    return new;
  end if;

  perform public.record_recurring_charge_result(
    p_charge_id       => v_charge,
    p_provider_status => upper(new.status),
    p_transaction_id  => new.provider_transaction_id,
    p_error_code      => null,
    p_error_message   => 'La pasarela reportó la transacción como ' || new.status
  );

  return new;
end;
$$;

create trigger payment_intents_resultado_debito
  after update on public.payment_intents
  for each row
  when (new.status is distinct from old.status)
  execute function public.recurring_charge_on_intent_result();

comment on function public.recurring_charge_on_intent_result is
  'Cuando el webhook marca la transacción como rechazada, programa el reintento del cobro automático que la originó.';

-- =============================================================================
-- Permisos
-- =============================================================================
-- Estas funciones son SECURITY DEFINER y NO se usan dentro de ninguna política
-- RLS, así que aquí sí se puede revocar EXECUTE sin romper nada (a diferencia
-- de los helpers de `private`, ver la nota de la migración 0001). Solo las
-- llaman las Edge Functions con service_role.
revoke all on function public.charge_due_subscriptions(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_recurring_charges(uuid, int, timestamptz)
  from public, anon, authenticated;
revoke all on function public.record_recurring_charge_result(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.register_payment_method(
  uuid, uuid, text, text, text, text, text, text, text, text, text, int, int, text,
  bigint, uuid, inet, text, timestamptz) from public, anon, authenticated;

grant execute on function public.charge_due_subscriptions(uuid, timestamptz) to service_role;
grant execute on function public.claim_recurring_charges(uuid, int, timestamptz) to service_role;
grant execute on function public.record_recurring_charge_result(uuid, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.register_payment_method(
  uuid, uuid, text, text, text, text, text, text, text, text, text, int, int, text,
  bigint, uuid, inet, text, timestamptz) to service_role;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.payment_methods            enable row level security;
alter table public.recurring_authorizations   enable row level security;
alter table public.recurring_charges          enable row level security;
alter table public.recurring_charge_attempts  enable row level security;

-- Mismo criterio que `payments` e `invoices` (0003): el acceso a la plata lo da
-- private.auth_finance_org_ids(), no el rol.
create policy "finanzas ve los medios de pago de su box"
  on public.payment_methods for select
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()));

-- El atleta ve LO SUYO. Nada más, y en ningún otro box.
create policy "el atleta ve su medio de pago"
  on public.payment_methods for select
  to authenticated
  using (athlete_id = (select private.current_athlete_id(org_id)));

-- Nadie inserta un método desde el cliente: entra por register_payment_method
-- (service_role), que es lo único que puede garantizar que método y
-- autorización nacen juntos.

create policy "finanzas ve las autorizaciones de su box"
  on public.recurring_authorizations for select
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()));

create policy "el atleta ve su autorización"
  on public.recurring_authorizations for select
  to authenticated
  using (athlete_id = (select private.current_athlete_id(org_id)));

-- REVOCAR ES UN TOQUE: el atleta marca `revoked_at` en SU fila y se acabó el
-- débito. No tiene que escribirle a nadie ni esperar a que alguien lo atienda.
-- El trigger `recurring_authorizations_inmutable` impide que esta misma vía
-- sirva para alterar la evidencia o para resucitar una autorización revocada.
create policy "el atleta revoca su autorización"
  on public.recurring_authorizations for update
  to authenticated
  using (athlete_id = (select private.current_athlete_id(org_id)))
  with check (athlete_id = (select private.current_athlete_id(org_id)));

-- El box también puede revocar (un atleta que llama por teléfono, una baja).
create policy "finanzas revoca autorizaciones de su box"
  on public.recurring_authorizations for update
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()))
  with check (org_id in (select private.auth_finance_org_ids()));

create policy "finanzas ve los cobros automáticos de su box"
  on public.recurring_charges for select
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()));

-- Si un cobro falló, el atleta tiene que poder ver POR QUÉ desde su propia
-- pantalla, sin llamar al box.
create policy "el atleta ve sus cobros automáticos"
  on public.recurring_charges for select
  to authenticated
  using (athlete_id = (select private.current_athlete_id(org_id)));

create policy "finanzas ve el historial de intentos de su box"
  on public.recurring_charge_attempts for select
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()));

create policy "el atleta ve el historial de sus intentos"
  on public.recurring_charge_attempts for select
  to authenticated
  using (charge_id in (
    select rc.id from public.recurring_charges rc
    where rc.athlete_id = (select private.current_athlete_id(rc.org_id))
  ));

do $$ begin perform public.assert_rls_enabled(); end $$;
