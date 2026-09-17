-- =============================================================================
-- 0009 · Cobro en línea con Wompi (link de pago + webhook)
-- =============================================================================
-- El diferenciador del producto: el atleta paga con Nequi, PSE, Daviplata o
-- tarjeta desde el enlace que le llega por WhatsApp, y la factura se salda sola.
-- Ver docs/08-mercado-cali.md §5 y docs/10-wompi.md.
--
-- Tres cosas se resuelven aquí, en la base, y no en la Edge Function:
--
--   1. IDEMPOTENCIA. Wompi REINTENTA la entrega del evento. El mismo pago no
--      puede quedar registrado dos veces. Hay DOS candados independientes:
--        · `webhook_events (provider, event_id)` — el mismo evento no se
--          procesa dos veces.
--        · `payments_provider_ref_idx (provider, provider_ref)` de la
--          migración 0003 — la misma transacción de Wompi no se cobra dos
--          veces, aunque el evento llegue con otro `event_id`.
--   2. CONCILIACIÓN. El saldo de la factura NO se recalcula a mano: se inserta
--      el pago y el trigger `payments_recalc_invoice` (0003) hace el resto.
--      Un solo lugar decide si una factura está `paid`, `partial` u `open`.
--   3. AISLAMIENTO. El webhook entra con service_role (salta RLS), así que la
--      resolución del box NO puede venir del evento: se deduce del
--      `payment_intent` que nosotros mismos creamos.
--
-- Dinero SIEMPRE en centavos (bigint). Wompi también trabaja en centavos
-- (`amount_in_cents`), así que no hay conversión y no hay error de redondeo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Intentos de pago
-- -----------------------------------------------------------------------------
-- Un intento es "le mandamos a este atleta un enlace por ESTE monto con ESTA
-- referencia". Es lo único que nos permite saber, cuando llega el webhook, a
-- qué box y a qué factura pertenece una transacción de Wompi: el evento solo
-- trae la referencia que nosotros generamos.
-- -----------------------------------------------------------------------------
create table public.payment_intents (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  invoice_id              uuid references public.invoices(id) on delete set null,
  athlete_id              uuid not null references public.athletes(id) on delete cascade,
  amount_cents            bigint not null check (amount_cents > 0),
  currency                char(3) not null default 'COP',
  -- La referencia que viaja a Wompi. Wompi solo admite alfanuméricos, guion y
  -- guion bajo (docs.wompi.co · Widget & Checkout Web), y una referencia ya
  -- usada en una transacción completada no se puede reutilizar.
  reference               text not null
                          check (reference ~ '^[A-Za-z0-9_-]{6,255}$'),
  provider                text not null default 'wompi'
                          check (provider in ('wompi')),
  -- `data.transaction.id` del evento. Se llena cuando Wompi nos responde.
  provider_transaction_id text,
  -- `created`  : creado, todavía sin enlace o sin abrir
  -- `pending`  : Wompi tiene la transacción en curso (PENDING)
  -- el resto refleja los estados finales de Wompi: APPROVED, DECLINED,
  -- VOIDED, ERROR (docs.wompi.co · Estados de una transacción)
  status                  text not null default 'created'
                          check (status in ('created','pending','approved','declined','voided','error')),
  payment_method_type     text,
  checkout_url            text,
  expires_at              timestamptz,
  created_by              uuid references auth.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- La referencia es única POR BOX. No global: dos boxes son dos comercios
  -- distintos en Wompi y no comparten espacio de referencias.
  unique (org_id, reference)
);

create index payment_intents_org_status_idx
  on public.payment_intents (org_id, status, created_at desc);
create index payment_intents_invoice_idx
  on public.payment_intents (invoice_id);
create index payment_intents_athlete_idx
  on public.payment_intents (org_id, athlete_id, created_at desc);
-- El webhook llega con la referencia, no con el org_id: esta es LA búsqueda
-- caliente de todo el flujo.
create index payment_intents_reference_idx
  on public.payment_intents (reference);
create index payment_intents_transaction_idx
  on public.payment_intents (provider, provider_transaction_id)
  where provider_transaction_id is not null;

create trigger payment_intents_touch before update on public.payment_intents
  for each row execute function public.touch_updated_at();

comment on table public.payment_intents is
  'Enlaces de pago emitidos a una pasarela. Traduce una referencia de Wompi a un box, un atleta y una factura.';
comment on column public.payment_intents.reference is
  'Referencia enviada a Wompi. Única por box. Solo [A-Za-z0-9_-].';

-- -----------------------------------------------------------------------------
-- Bitácora de eventos de pasarela · IDEMPOTENCIA
-- -----------------------------------------------------------------------------
-- Wompi reintenta la entrega de un evento hasta recibir un 200. Sin esta tabla,
-- un reintento registraría el pago dos veces y la factura quedaría en negativo.
--
-- OJO con `event_id`: el evento de Wompi NO trae un identificador propio. Su
-- cuerpo es {event, data, environment, signature:{properties,checksum},
-- timestamp, sent_at} (docs.wompi.co · Eventos). Usamos por eso
-- `signature.checksum` como identificador: es un SHA-256 determinista sobre los
-- valores firmados + el timestamp + el secreto, así que dos entregas del MISMO
-- evento traen el MISMO checksum, y un evento posterior de la misma transacción
-- trae uno distinto.
--
-- Como ese identificador es derivado y no autoritativo, el segundo candado
-- (payments.provider_ref único) es el que de verdad garantiza que una
-- transacción aprobada solo produzca un pago.
-- -----------------------------------------------------------------------------
create table public.webhook_events (
  id           bigint generated always as identity primary key,
  provider     text not null default 'wompi'
               check (provider in ('wompi','mercadopago')),
  event_id     text not null,
  event_type   text,
  -- Se llena al resolver el intento. Null = evento que no supimos ubicar.
  org_id       uuid references public.organizations(id) on delete set null,
  provider_transaction_id text,
  reference    text,
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'received'
               check (status in ('received','processed','ignored','error')),
  result       text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  -- ESTE es el candado. Si Wompi entrega el evento dos veces, el segundo
  -- INSERT no pasa y la función sale sin tocar `payments`.
  unique (provider, event_id)
);

create index webhook_events_org_idx on public.webhook_events (org_id, received_at desc);
create index webhook_events_status_idx on public.webhook_events (status, received_at desc)
  where status in ('received','error');

comment on table public.webhook_events is
  'Cada evento de pasarela recibido, una sola vez. La restricción única (provider, event_id) es lo que impide registrar dos veces un pago reintentado.';

-- =============================================================================
-- Abrir un intento de pago
-- =============================================================================
-- La llama la Edge Function `create-payment-link` con service_role, DESPUÉS de
-- haber comprobado con la llave del usuario (y por tanto con RLS) que quien
-- pide el enlace puede ver esa factura.
--
-- El saldo se calcula aquí y no en el cliente: `amount_cents - paid_cents` es
-- la única cifra que la pasarela debe cobrar, y quien la firma no puede
-- elegirla.
--
-- Si ya hay un intento vivo por el mismo saldo, se reutiliza en vez de crear
-- otro: así el atleta que abre el enlace dos veces no genera dos referencias
-- (y Wompi no admite reutilizar una referencia ya completada).
-- =============================================================================
create or replace function public.open_payment_intent(
  p_invoice_id uuid,
  p_reference  text,
  p_expires_at timestamptz default null,
  p_created_by uuid default null
)
returns table (
  intent_id     uuid,
  org_id        uuid,
  athlete_id    uuid,
  invoice_id    uuid,
  amount_cents  bigint,
  currency      char(3),
  reference     text,
  expires_at    timestamptz,
  reused        boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv     public.invoices%rowtype;
  cur     char(3);
  saldo   bigint;
  vivo    public.payment_intents%rowtype;
  nuevo   public.payment_intents%rowtype;
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'La factura no existe' using errcode = 'no_data_found';
  end if;

  if inv.status = 'void' then
    raise exception 'La factura está anulada' using errcode = 'check_violation';
  end if;

  saldo := inv.amount_cents - inv.paid_cents;
  if saldo <= 0 then
    raise exception 'La factura ya está saldada' using errcode = 'check_violation';
  end if;

  select o.currency into cur from public.organizations o where o.id = inv.org_id;

  -- Un intento sigue vivo mientras Wompi no lo haya cerrado y no haya vencido.
  select * into vivo
  from public.payment_intents pi
  where pi.invoice_id = inv.id
    and pi.status in ('created','pending')
    and pi.amount_cents = saldo
    and (pi.expires_at is null or pi.expires_at > now())
  order by pi.created_at desc
  limit 1;

  if found then
    intent_id    := vivo.id;
    org_id       := vivo.org_id;
    athlete_id   := vivo.athlete_id;
    invoice_id   := vivo.invoice_id;
    amount_cents := vivo.amount_cents;
    currency     := vivo.currency;
    reference    := vivo.reference;
    expires_at   := vivo.expires_at;
    reused       := true;
    return next;
    return;
  end if;

  insert into public.payment_intents (
    org_id, invoice_id, athlete_id, amount_cents, currency,
    reference, expires_at, created_by
  )
  values (
    inv.org_id, inv.id, inv.athlete_id, saldo, coalesce(cur, 'COP'),
    p_reference, p_expires_at, p_created_by
  )
  returning * into nuevo;

  intent_id    := nuevo.id;
  org_id       := nuevo.org_id;
  athlete_id   := nuevo.athlete_id;
  invoice_id   := nuevo.invoice_id;
  amount_cents := nuevo.amount_cents;
  currency     := nuevo.currency;
  reference    := nuevo.reference;
  expires_at   := nuevo.expires_at;
  reused       := false;
  return next;
end;
$$;

comment on function public.open_payment_intent is
  'Abre (o reutiliza) un intento de pago por el saldo pendiente de una factura. La llama create-payment-link con service_role.';

-- =============================================================================
-- Aplicar un evento de Wompi
-- =============================================================================
-- La llama la Edge Function `wompi-webhook` con service_role, SOLO después de
-- haber validado `signature.checksum`. Esta función no verifica firmas: no
-- tiene los secretos y no debe tenerlos.
--
-- Devuelve una etiqueta de resultado en vez de lanzar excepción en los casos
-- normales (duplicado, rechazado), para que la Edge Function pueda responder
-- 200 y Wompi deje de reintentar.
-- =============================================================================
create or replace function public.apply_wompi_payment(
  p_event_id       text,                            -- signature.checksum
  p_transaction_id text,                            -- data.transaction.id
  p_reference      text,                            -- data.transaction.reference
  p_status         text,                            -- APPROVED|DECLINED|VOIDED|ERROR|PENDING
  p_amount_cents   bigint,                          -- data.transaction.amount_in_cents
  p_method_type    text default null,               -- data.transaction.payment_method_type
  p_event_type     text default 'transaction.updated',
  p_payload        jsonb default '{}'::jsonb,
  p_paid_at        timestamptz default now()
)
returns table (
  resultado  text,
  payment_id uuid,
  invoice_id uuid,
  intent_id  uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_row bigint;
  v_intent    public.payment_intents%rowtype;
  v_status    text;
  v_method    text;
  v_payment   uuid;
  v_cuantos   int;
begin
  if p_event_id is null or length(p_event_id) = 0 then
    raise exception 'El evento llegó sin identificador' using errcode = 'check_violation';
  end if;

  -- ---------------------------------------------------------------------
  -- Candado 1 · ¿ya procesamos este evento?
  -- ---------------------------------------------------------------------
  insert into public.webhook_events (
    provider, event_id, event_type, provider_transaction_id, reference, payload
  )
  values (
    'wompi', p_event_id, p_event_type, p_transaction_id, p_reference,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, event_id) do nothing
  returning id into v_event_row;

  if v_event_row is null then
    resultado := 'evento_duplicado';
    return next;
    return;
  end if;

  -- ---------------------------------------------------------------------
  -- ¿De qué box es? Lo dice el intento que nosotros creamos, nunca el evento.
  -- ---------------------------------------------------------------------
  select count(*) into v_cuantos
  from public.payment_intents pi
  where pi.reference = p_reference and pi.provider = 'wompi';

  if v_cuantos = 0 then
    update public.webhook_events
    set status = 'ignored', result = 'referencia_desconocida', processed_at = now()
    where id = v_event_row;

    resultado := 'referencia_desconocida';
    return next;
    return;
  end if;

  if v_cuantos > 1 then
    -- La referencia es única por box, así que dos boxes PODRÍAN coincidir. Si
    -- pasa, se falla ruidosamente: abonarle al box equivocado es peor que no
    -- abonar. La referencia que genera create-payment-link lleva el box dentro
    -- justamente para que esto no ocurra.
    raise exception 'Referencia ambigua entre boxes: %', p_reference
      using errcode = 'unique_violation';
  end if;

  select * into v_intent
  from public.payment_intents pi
  where pi.reference = p_reference and pi.provider = 'wompi';

  -- ---------------------------------------------------------------------
  -- Estado de Wompi -> estado nuestro
  -- ---------------------------------------------------------------------
  v_status := case upper(coalesce(p_status, ''))
                when 'APPROVED' then 'approved'
                when 'DECLINED' then 'declined'
                when 'VOIDED'   then 'voided'
                when 'ERROR'    then 'error'
                when 'PENDING'  then 'pending'
                else null
              end;

  if v_status is null then
    update public.webhook_events
    set status = 'ignored', result = 'estado_desconocido', org_id = v_intent.org_id,
        processed_at = now()
    where id = v_event_row;

    resultado := 'estado_desconocido';
    intent_id := v_intent.id;
    return next;
    return;
  end if;

  -- Un evento tardío no puede degradar un intento ya aprobado.
  update public.payment_intents
  set status = case when status = 'approved' then 'approved' else v_status end,
      provider_transaction_id = coalesce(p_transaction_id, provider_transaction_id),
      payment_method_type = coalesce(p_method_type, payment_method_type)
  where id = v_intent.id;

  if v_status <> 'approved' then
    update public.webhook_events
    set status = 'processed', result = 'sin_pago_' || v_status,
        org_id = v_intent.org_id, processed_at = now()
    where id = v_event_row;

    resultado  := 'sin_pago';
    intent_id  := v_intent.id;
    invoice_id := v_intent.invoice_id;
    return next;
    return;
  end if;

  if coalesce(p_amount_cents, 0) <= 0 then
    raise exception 'Un pago aprobado no puede venir en cero' using errcode = 'check_violation';
  end if;

  -- ---------------------------------------------------------------------
  -- Método de pago de Wompi -> el catálogo de `payments.method` (0003)
  -- docs.wompi.co · Métodos de pago
  -- ---------------------------------------------------------------------
  v_method := case upper(coalesce(p_method_type, ''))
                when 'CARD'                 then 'card'
                when 'NEQUI'                then 'nequi'
                when 'DAVIPLATA'            then 'daviplata'
                when 'PSE'                  then 'pse'
                when 'BANCOLOMBIA_TRANSFER' then 'transfer'
                when 'BANCOLOMBIA_QR'       then 'transfer'
                -- Corresponsal bancario: el atleta pagó en efectivo.
                when 'BANCOLOMBIA_COLLECT'  then 'cash'
                else 'other'
              end;

  -- ---------------------------------------------------------------------
  -- Candado 2 · la misma transacción de Wompi no se registra dos veces.
  -- Lo impone el índice único payments_provider_ref_idx (provider, provider_ref)
  -- creado en la migración 0003.
  -- ---------------------------------------------------------------------
  insert into public.payments (
    org_id, invoice_id, athlete_id, amount_cents, method, paid_at,
    reference, provider, provider_ref, status
  )
  values (
    v_intent.org_id, v_intent.invoice_id, v_intent.athlete_id, p_amount_cents,
    v_method, coalesce(p_paid_at, now()),
    p_reference, 'wompi', p_transaction_id, 'confirmed'
  )
  on conflict do nothing
  returning id into v_payment;

  -- NO se toca invoices.paid_cents ni invoices.status: de eso se encarga el
  -- trigger payments_recalc_invoice. Un solo lugar concilia el saldo.

  if v_payment is null then
    update public.webhook_events
    set status = 'processed', result = 'pago_duplicado', org_id = v_intent.org_id,
        processed_at = now()
    where id = v_event_row;

    resultado  := 'pago_duplicado';
    intent_id  := v_intent.id;
    invoice_id := v_intent.invoice_id;
    return next;
    return;
  end if;

  update public.webhook_events
  set status = 'processed', result = 'pago_registrado', org_id = v_intent.org_id,
      processed_at = now()
  where id = v_event_row;

  resultado  := 'pago_registrado';
  payment_id := v_payment;
  invoice_id := v_intent.invoice_id;
  intent_id  := v_intent.id;
  return next;
end;
$$;

comment on function public.apply_wompi_payment is
  'Aplica un evento de Wompi YA VERIFICADO. Idempotente por (provider, event_id) y por (provider, provider_ref). No recalcula el saldo: lo hace el trigger payments_recalc_invoice.';

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
-- Estas dos funciones son SECURITY DEFINER y NO se usan dentro de ninguna
-- política RLS, así que aquí sí se revoca EXECUTE sin romper nada (a diferencia
-- de los helpers de `private`, ver la nota de la migración 0001). Solo las
-- llaman las Edge Functions con service_role.
revoke all on function public.open_payment_intent(uuid, text, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_wompi_payment(text, text, text, text, bigint, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.open_payment_intent(uuid, text, timestamptz, uuid)
  to service_role;
grant execute on function public.apply_wompi_payment(text, text, text, text, bigint, text, text, jsonb, timestamptz)
  to service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.payment_intents enable row level security;
alter table public.webhook_events  enable row level security;

-- Mismo criterio que `payments` e `invoices` (0003): el acceso a la plata lo da
-- private.auth_finance_org_ids(), no el rol.
create policy "finanzas gestiona los intentos de pago"
  on public.payment_intents for all
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()))
  with check (org_id in (select private.auth_finance_org_ids()));

-- El atleta necesita ver su propio enlace para volver a abrirlo desde la app.
create policy "el atleta ve sus intentos de pago"
  on public.payment_intents for select
  to authenticated
  using (athlete_id = (select private.current_athlete_id(org_id)));

-- webhook_events: RLS activada y SIN políticas a propósito, igual que job_runs
-- (0004). Es bitácora de integración, no dato del box: guarda el cuerpo crudo
-- del evento, que incluye el correo del pagador. Solo service_role la ve.
-- Por eso está en la lista de excepciones de supabase/tests/rls_guard.sql.

do $$ begin perform public.assert_rls_enabled(); end $$;
