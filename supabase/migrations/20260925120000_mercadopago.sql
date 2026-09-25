-- =============================================================================
-- Mercado Pago · cobro del box a sus atletas y cobro de Scalar a los boxes
-- =============================================================================
-- Decisión del 2026-09-25: la pasarela de arranque es Mercado Pago, porque un
-- box abre cuenta con la cédula en minutos (Wompi pide RUT y días de
-- aprobación). Se monta sobre el MISMO molde de Wompi (migración 0009):
--
--   · el box guarda SUS credenciales (Configuración → Integraciones) y la
--     plata de sus atletas entra a SU cuenta;
--   · cada enlace es un `payment_intent` con una referencia nuestra;
--   · el webhook llega sin usuario, se verifica la firma en la Edge Function
--     y la conciliación es idempotente AQUÍ, en la base.
--
-- Lo nuevo de verdad es la segunda mitad: lo que el box le paga a Scalar.
-- Hasta hoy `platform_subscriptions.next_charge_on` solo avanzaba a mano. Ahora
-- hay intentos y pagos de plataforma, con Mercado Pago (cuenta de Scalar) o
-- registrados a mano (Nequi personal, que es como se arranca).
--
-- Dinero en centavos (bigint). Mercado Pago trabaja en PESOS con decimales
-- (`transaction_amount: 180000`); la conversión vive en la Edge Function y se
-- prueba allí. Aquí solo entran centavos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Credenciales por box: dos claves más en la lista cerrada
-- -----------------------------------------------------------------------------
create or replace function private.credential_keys()
returns table (key text, provider text, is_secret boolean)
language sql
immutable
set search_path = ''
as $$
  values
    -- Wompi. La pública se muestra entera: viaja al navegador por diseño.
    ('wompi_public_key',           'wompi',          false),
    ('wompi_private_key',          'wompi',          true),
    ('wompi_integrity_secret',     'wompi',          true),
    ('wompi_events_secret',        'wompi',          true),
    -- WhatsApp Cloud API. El id del número no es secreto; el token sí.
    ('whatsapp_phone_number_id',   'whatsapp_cloud', false),
    ('whatsapp_token',             'whatsapp_cloud', true),
    -- Mercado Pago. El access token cobra a la cuenta del box; el secreto del
    -- webhook es con el que se comprueba que el aviso de pago vino de ellos.
    ('mercadopago_access_token',   'mercadopago',    true),
    ('mercadopago_webhook_secret', 'mercadopago',    true)
$$;

-- Los CHECK de org_credentials listaban las claves y los proveedores. Se
-- buscan por su definición y no por nombre, porque Postgres los nombró solo.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.org_credentials'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%whatsapp_cloud%'
           or pg_get_constraintdef(oid) like '%wompi_public_key%')
  loop
    execute format('alter table public.org_credentials drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.org_credentials
  add constraint org_credentials_provider_check
    check (provider in ('wompi','whatsapp_cloud','mercadopago')),
  add constraint org_credentials_key_check
    check (key in ('wompi_public_key','wompi_private_key','wompi_integrity_secret',
                   'wompi_events_secret','whatsapp_phone_number_id','whatsapp_token',
                   'mercadopago_access_token','mercadopago_webhook_secret'));

-- Misma función de la migración 0017, con la validación de forma del token de
-- Mercado Pago y la lista de claves válidas sacada del catálogo (antes estaba
-- escrita a mano en el mensaje y se habría quedado vieja).
create or replace function public.set_org_credential(
  p_org_id      uuid,
  p_clave       text,
  p_valor       text,
  p_environment text default null
)
returns public.org_credentials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat   record;
  v_valor text := btrim(coalesce(p_valor, ''));
  v_env   text;
  v_row   public.org_credentials;
begin
  if p_org_id is null or p_org_id not in (select private.auth_org_ids_with_role(array['owner','admin'])) then
    raise exception 'Solo el dueño o el administrador del box pueden cambiar las credenciales de cobro y mensajería.'
      using errcode = '42501';
  end if;

  select * into v_cat from private.credential_keys() c where c.key = p_clave;
  if not found then
    raise exception 'No conozco la credencial "%".', p_clave
      using errcode = '22023',
            hint = 'Válidas: ' ||
                   (select string_agg(k.key, ', ' order by k.key) from private.credential_keys() k) || '.';
  end if;

  if v_valor = '' then
    raise exception 'La credencial "%" llegó vacía. Para quitarla usa el botón de borrar, que no es lo mismo que dejarla en blanco.', p_clave
      using errcode = '22023';
  end if;

  v_env := coalesce(nullif(btrim(coalesce(p_environment, '')), ''), 'test');
  if v_env not in ('test','prod') then
    raise exception 'El ambiente debe ser "test" (pruebas) o "prod" (producción). Recibí "%".', v_env
      using errcode = '22023';
  end if;

  -- Validaciones de forma. Pegar la llave de pruebas donde va la de producción
  -- es el error que hace que el box crea que está cobrando y no esté cobrando.
  if p_clave = 'wompi_public_key' and v_valor !~ '^pub_(test|prod)_' then
    raise exception 'La llave pública de Wompi empieza por pub_test_ o pub_prod_. La que pegaste empieza por "%".',
      left(v_valor, 9)
      using errcode = '22023',
            hint = 'Está en el panel de Wompi, en Desarrolladores → Llaves de API.';
  end if;

  if p_clave = 'wompi_private_key' and v_valor !~ '^prv_(test|prod)_' then
    raise exception 'La llave privada de Wompi empieza por prv_test_ o prv_prod_. Revisa que no hayas pegado la pública.'
      using errcode = '22023';
  end if;

  if p_clave = 'whatsapp_phone_number_id' and v_valor !~ '^[0-9]{5,30}$' then
    raise exception 'El identificador del número de WhatsApp es una cadena de dígitos. Recibí "%".', v_valor
      using errcode = '22023',
            hint = 'No es el número de teléfono: es el "Phone number ID" que muestra Meta en WhatsApp → Configuración de la API.';
  end if;

  -- Mercado Pago: el access token de la aplicación empieza por TEST- (pruebas)
  -- o APP_USR- (producción o usuario de prueba). Lo que no empiece así es la
  -- public key o cualquier otra cosa, y el cobro fallaría con un 401 mudo.
  if p_clave = 'mercadopago_access_token' and v_valor !~ '^(TEST-|APP_USR-)' then
    raise exception 'El access token de Mercado Pago empieza por TEST- o APP_USR-. Lo que pegaste empieza por "%": revisa que no sea la public key.',
      left(v_valor, 8)
      using errcode = '22023',
            hint = 'Está en mercadopago.com.co/developers → Tus integraciones → tu aplicación → Credenciales.';
  end if;

  insert into public.org_credentials
    (org_id, key, provider, environment, public_value, last4, is_set, configured_at, configured_by)
  values (
    p_org_id,
    p_clave,
    v_cat.provider,
    v_env,
    case when v_cat.is_secret then null else v_valor end,
    case when v_cat.is_secret then right(v_valor, 4) else null end,
    true,
    now(),
    (select auth.uid())
  )
  on conflict (org_id, key) do update
    set environment   = excluded.environment,
        public_value  = excluded.public_value,
        last4         = excluded.last4,
        is_set        = true,
        configured_at = now(),
        configured_by = excluded.configured_by
  returning * into v_row;

  if v_cat.is_secret then
    insert into public.org_secret_values (org_id, key, secret)
    values (p_org_id, p_clave, v_valor)
    on conflict (org_id, key) do update set secret = excluded.secret;
  end if;

  -- En la bitácora queda QUÉ se cambió y quién, nunca el valor.
  insert into public.audit_log (org_id, user_id, action, entity, entity_id, after)
  values (
    p_org_id, (select auth.uid()), 'org.credential_set', 'org_credentials', null,
    jsonb_build_object('key', p_clave, 'environment', v_env,
                       'is_secret', v_cat.is_secret, 'last4', v_row.last4)
  );

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2 · Intentos de pago con proveedor
-- -----------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.payment_intents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%''wompi''%'
  loop
    execute format('alter table public.payment_intents drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.payment_intents
  add constraint payment_intents_provider_check check (provider in ('wompi','mercadopago')),
  -- El id de la preferencia de Checkout Pro. Distinto del pago: una preferencia
  -- puede terminar en varios intentos de pago del atleta (uno rechazado y otro
  -- aprobado), y los pagos van en provider_transaction_id.
  add column provider_checkout_id text;

comment on column public.payment_intents.provider_checkout_id is
  'Id de la preferencia (Mercado Pago). El id del pago va en provider_transaction_id.';

-- open_payment_intent gana el proveedor. Se borra la firma vieja para que no
-- queden dos sobrecargas y PostgREST no sepa a cuál llamar.
drop function if exists public.open_payment_intent(uuid, text, timestamptz, uuid);

create or replace function public.open_payment_intent(
  p_invoice_id uuid,
  p_reference  text,
  p_expires_at timestamptz default null,
  p_created_by uuid default null,
  p_provider   text default 'wompi'
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
  if p_provider not in ('wompi','mercadopago') then
    raise exception 'Pasarela desconocida: %', p_provider using errcode = 'check_violation';
  end if;

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

  -- Un intento sigue vivo mientras la pasarela no lo haya cerrado y no haya
  -- vencido. Tiene que ser de la MISMA pasarela: un enlace de Wompi no sirve
  -- para cobrar por Mercado Pago.
  select * into vivo
  from public.payment_intents pi
  where pi.invoice_id = inv.id
    and pi.provider = p_provider
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
    reference, provider, expires_at, created_by
  )
  values (
    inv.org_id, inv.id, inv.athlete_id, saldo, coalesce(cur, 'COP'),
    p_reference, p_provider, p_expires_at, p_created_by
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
  'Abre (o reutiliza) un intento de pago por el saldo pendiente de una factura, para la pasarela indicada. La llama create-payment-link con service_role.';

-- -----------------------------------------------------------------------------
-- 3 · Aplicar un pago de Mercado Pago a la factura de un atleta
-- -----------------------------------------------------------------------------
-- La llama `mercadopago-webhook` con service_role, después de verificar la
-- firma Y de consultar el pago en la API de Mercado Pago (la notificación solo
-- trae el id; el estado y el monto salen de la consulta, nunca del aviso).
--
-- Los dos candados de 0009 aplican igual: (provider, event_id) en
-- webhook_events y (provider, provider_ref) en payments.
--
-- Estados de Mercado Pago (referencia · Consultar pago):
--   approved                                     -> pago registrado
--   pending, in_process, authorized, in_mediation -> intento en curso
--   rejected                                     -> declinado
--   cancelled                                    -> anulado
--   refunded, charged_back                       -> el pago ya registrado pasa a
--                                                   'refunded' y la factura se
--                                                   vuelve a abrir (trigger)
-- -----------------------------------------------------------------------------
create or replace function public.apply_mercadopago_payment(
  p_event_id     text,                          -- id de la notificación
  p_payment_id   text,                          -- id del pago en Mercado Pago
  p_reference    text,                          -- external_reference
  p_status       text,
  p_amount_cents bigint,
  p_payment_type text default null,             -- payment_type_id
  p_method_id    text default null,             -- payment_method_id
  p_event_type   text default 'payment.updated',
  p_payload      jsonb default '{}'::jsonb,
  p_paid_at      timestamptz default now(),
  p_org_id       uuid default null              -- el box de la URL del webhook
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
  if p_payment_id is null or length(p_payment_id) = 0 then
    raise exception 'El evento llegó sin id de pago' using errcode = 'check_violation';
  end if;

  -- Candado 1 · ¿ya procesamos esta notificación?
  insert into public.webhook_events (
    provider, event_id, event_type, provider_transaction_id, reference, payload
  )
  values (
    'mercadopago', p_event_id, p_event_type, p_payment_id, p_reference,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, event_id) do nothing
  returning id into v_event_row;

  if v_event_row is null then
    resultado := 'evento_duplicado';
    return next;
    return;
  end if;

  -- ¿De qué box es? Lo dice el intento que nosotros creamos, nunca el aviso.
  select count(*) into v_cuantos
  from public.payment_intents pi
  where pi.reference = p_reference and pi.provider = 'mercadopago';

  if v_cuantos = 0 then
    update public.webhook_events
    set status = 'ignored', result = 'referencia_desconocida', processed_at = now()
    where id = v_event_row;
    resultado := 'referencia_desconocida';
    return next;
    return;
  end if;

  if v_cuantos > 1 then
    raise exception 'Referencia ambigua entre boxes: %', p_reference
      using errcode = 'unique_violation';
  end if;

  select * into v_intent
  from public.payment_intents pi
  where pi.reference = p_reference and pi.provider = 'mercadopago';

  -- El webhook de un box no puede abonar la factura de otro, aunque la firma
  -- fuera válida: la URL del webhook lleva el box y tiene que coincidir.
  if p_org_id is not null and v_intent.org_id <> p_org_id then
    update public.webhook_events
    set status = 'ignored', result = 'box_no_coincide', org_id = p_org_id, processed_at = now()
    where id = v_event_row;
    resultado := 'box_no_coincide';
    return next;
    return;
  end if;

  v_status := case lower(coalesce(p_status, ''))
                when 'approved'     then 'approved'
                when 'pending'      then 'pending'
                when 'in_process'   then 'pending'
                when 'authorized'   then 'pending'
                when 'in_mediation' then 'pending'
                when 'rejected'     then 'declined'
                when 'cancelled'    then 'voided'
                when 'refunded'     then 'refunded'
                when 'charged_back' then 'refunded'
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

  -- Reembolso o contracargo: el pago deja de contar y el trigger vuelve a
  -- abrir la factura. El intento se queda como estaba (fue aprobado).
  if v_status = 'refunded' then
    update public.payments
    set status = 'refunded'
    where provider = 'mercadopago' and provider_ref = p_payment_id and status = 'confirmed'
    returning id into v_payment;

    update public.webhook_events
    set status = 'processed',
        result = case when v_payment is null then 'reembolso_sin_pago' else 'pago_reembolsado' end,
        org_id = v_intent.org_id, processed_at = now()
    where id = v_event_row;

    resultado  := case when v_payment is null then 'reembolso_sin_pago' else 'pago_reembolsado' end;
    payment_id := v_payment;
    intent_id  := v_intent.id;
    invoice_id := v_intent.invoice_id;
    return next;
    return;
  end if;

  -- Un aviso tardío no puede degradar un intento ya aprobado.
  update public.payment_intents
  set status = case when status = 'approved' then 'approved' else v_status end,
      provider_transaction_id = coalesce(p_payment_id, provider_transaction_id),
      payment_method_type = coalesce(p_method_id, p_payment_type, payment_method_type)
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

  -- Medio de pago de Mercado Pago -> catálogo de payments.method (0003).
  -- payment_method_id es el medio concreto (pse, visa, efecty…);
  -- payment_type_id es la familia (credit_card, bank_transfer, ticket…).
  v_method := case
                when lower(coalesce(p_method_id, ''))   = 'nequi'     then 'nequi'
                when lower(coalesce(p_method_id, ''))   = 'daviplata' then 'daviplata'
                when lower(coalesce(p_method_id, ''))   = 'pse'       then 'pse'
                when lower(coalesce(p_payment_type, '')) in ('credit_card','debit_card','prepaid_card') then 'card'
                when lower(coalesce(p_payment_type, '')) = 'bank_transfer' then 'pse'
                -- Efecty y corresponsales: el atleta pagó en efectivo.
                when lower(coalesce(p_payment_type, '')) = 'ticket'        then 'cash'
                when lower(coalesce(p_payment_type, '')) in ('account_money','digital_wallet') then 'transfer'
                else 'other'
              end;

  -- Candado 2 · el mismo pago de Mercado Pago no se registra dos veces
  -- (índice único payments_provider_ref_idx de la migración 0003).
  insert into public.payments (
    org_id, invoice_id, athlete_id, amount_cents, method, paid_at,
    reference, provider, provider_ref, status
  )
  values (
    v_intent.org_id, v_intent.invoice_id, v_intent.athlete_id, p_amount_cents,
    v_method, coalesce(p_paid_at, now()),
    p_reference, 'mercadopago', p_payment_id, 'confirmed'
  )
  on conflict do nothing
  returning id into v_payment;

  -- invoices.paid_cents y status los concilia el trigger payments_recalc_invoice.

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

comment on function public.apply_mercadopago_payment is
  'Aplica un pago de Mercado Pago YA VERIFICADO y YA CONSULTADO en su API. Idempotente por (provider, event_id) y por (provider, provider_ref).';

-- =============================================================================
-- 4 · Lo que el box le paga a Scalar
-- =============================================================================
-- Un intento de plataforma es "este box va a pagar ESTE periodo por ESTE
-- monto". El periodo empieza en next_charge_on y dura lo que diga
-- billing_period. Cuando entra la plata (Mercado Pago o Nequi a mano), el
-- periodo queda pago, next_charge_on avanza y, si el box estaba en mora o
-- suspendido, vuelve a estar activo.
-- =============================================================================
create table public.platform_payment_intents (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  subscription_id         uuid references public.platform_subscriptions(id) on delete set null,
  amount_cents            bigint not null check (amount_cents > 0),
  currency                char(3) not null default 'COP',
  -- Única en toda la plataforma: la cuenta de Mercado Pago es una sola (la de
  -- Scalar), así que aquí sí hay un solo espacio de referencias.
  reference               text not null unique
                          check (reference ~ '^[A-Za-z0-9_-]{6,255}$'),
  provider                text not null default 'mercadopago'
                          check (provider in ('mercadopago')),
  provider_checkout_id    text,
  provider_transaction_id text,
  status                  text not null default 'created'
                          check (status in ('created','pending','approved','declined','voided','error')),
  period_start            date not null,
  period_end              date not null,
  checkout_url            text,
  expires_at              timestamptz,
  created_by              uuid references auth.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (period_end >= period_start)
);

create index platform_payment_intents_org_idx
  on public.platform_payment_intents (org_id, status, created_at desc);

create trigger platform_payment_intents_touch before update on public.platform_payment_intents
  for each row execute function public.touch_updated_at();

comment on table public.platform_payment_intents is
  'Enlaces de pago de un box hacia Scalar (cuenta de Mercado Pago de Scalar). Traduce una referencia a un box y un periodo.';

create table public.platform_payments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  intent_id     uuid references public.platform_payment_intents(id) on delete set null,
  amount_cents  bigint not null check (amount_cents > 0),
  currency      char(3) not null default 'COP',
  method        text not null default 'other'
                check (method in ('cash','transfer','nequi','daviplata','card','pse','other')),
  paid_at       timestamptz not null default now(),
  period_start  date not null,
  period_end    date not null,
  provider      text not null default 'manual'
                check (provider in ('manual','mercadopago')),
  provider_ref  text,
  status        text not null default 'confirmed'
                check (status in ('confirmed','refunded')),
  notes         text,
  recorded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (period_end >= period_start)
);

-- El mismo pago de la pasarela no se registra dos veces.
create unique index platform_payments_provider_ref_idx
  on public.platform_payments (provider, provider_ref)
  where provider_ref is not null;
create index platform_payments_org_idx
  on public.platform_payments (org_id, paid_at desc);

comment on table public.platform_payments is
  'Cada pago que un box le hizo a Scalar, por Mercado Pago o registrado a mano (Nequi).';

-- -----------------------------------------------------------------------------
-- Qué periodo toca pagar y cuánto vale
-- -----------------------------------------------------------------------------
create or replace function private.platform_next_period(p_org_id uuid)
returns table (
  subscription_id uuid,
  plan_tier       text,
  amount_cents    bigint,
  period_start    date,
  period_end      date,
  billing_period  text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s         public.platform_subscriptions%rowtype;
  v_primero boolean;
begin
  select * into s
  from public.platform_subscriptions ps
  where ps.org_id = p_org_id and ps.status <> 'cancelled'
  order by ps.created_at desc
  limit 1;

  if not found then
    raise exception 'Este box no tiene una suscripción con Scalar.' using errcode = 'no_data_found';
  end if;

  if s.price_cents <= 0 then
    raise exception 'Este box todavía no tiene un plan con precio asignado. Escríbenos y lo activamos.'
      using errcode = 'check_violation';
  end if;

  subscription_id := s.id;
  plan_tier       := s.plan_tier;
  billing_period  := s.billing_period;
  period_start    := coalesce(s.next_charge_on, current_date);
  period_end      := case when s.billing_period = 'annual'
                          then (period_start + interval '1 year')::date - 1
                          else (period_start + interval '1 month')::date - 1
                     end;

  -- La cuota de implementación, si la hay, va en el primer pago y nunca más.
  select not exists (
    select 1 from public.platform_payments pp
    where pp.org_id = p_org_id and pp.status = 'confirmed'
  ) into v_primero;
  amount_cents := s.price_cents + case when v_primero then s.setup_fee_cents else 0 end;

  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- Dar por pago un periodo
-- -----------------------------------------------------------------------------
-- Es lo único que mueve next_charge_on. Si el box estaba en mora o suspendido
-- por no pagar, con esto vuelve: la plata ya entró.
create or replace function private.platform_apply_paid_period(
  p_org_id     uuid,
  p_period_end date,
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes text;
begin
  update public.platform_subscriptions
     set next_charge_on = greatest(coalesce(next_charge_on, current_date), p_period_end + 1),
         status         = 'active',
         suspended_on   = null
   where org_id = p_org_id
     and status <> 'cancelled';

  select o.status into v_antes from public.organizations o where o.id = p_org_id;

  update public.organizations
     set status = 'active'
   where id = p_org_id
     and status in ('past_due','suspended');

  insert into public.audit_log (org_id, user_id, action, entity, entity_id, before, after)
  values (
    p_org_id, (select auth.uid()), 'platform.payment_received', 'platform_payments', p_payment_id,
    jsonb_build_object('status', v_antes),
    jsonb_build_object('period_end', p_period_end)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Abrir un intento de pago hacia Scalar
-- -----------------------------------------------------------------------------
-- La llama `platform-payment-link` con service_role DESPUÉS de comprobar con la
-- llave del usuario (RLS: solo el dueño) que puede ver la suscripción del box.
create or replace function public.open_platform_payment_intent(
  p_org_id     uuid,
  p_reference  text,
  p_expires_at timestamptz default null,
  p_created_by uuid default null
)
returns table (
  intent_id     uuid,
  org_id        uuid,
  amount_cents  bigint,
  currency      char(3),
  reference     text,
  expires_at    timestamptz,
  period_start  date,
  period_end    date,
  plan_tier     text,
  checkout_url  text,
  reused        boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  per   record;
  vivo  public.platform_payment_intents%rowtype;
  nuevo public.platform_payment_intents%rowtype;
begin
  select * into per from private.platform_next_period(p_org_id);

  select * into vivo
  from public.platform_payment_intents pi
  where pi.org_id = p_org_id
    and pi.status in ('created','pending')
    and pi.amount_cents = per.amount_cents
    and pi.period_start = per.period_start
    and (pi.expires_at is null or pi.expires_at > now())
  order by pi.created_at desc
  limit 1;

  if found then
    intent_id    := vivo.id;
    org_id       := vivo.org_id;
    amount_cents := vivo.amount_cents;
    currency     := vivo.currency;
    reference    := vivo.reference;
    expires_at   := vivo.expires_at;
    period_start := vivo.period_start;
    period_end   := vivo.period_end;
    plan_tier    := per.plan_tier;
    checkout_url := vivo.checkout_url;
    reused       := true;
    return next;
    return;
  end if;

  insert into public.platform_payment_intents (
    org_id, subscription_id, amount_cents, reference, expires_at,
    period_start, period_end, created_by
  )
  values (
    p_org_id, per.subscription_id, per.amount_cents, p_reference, p_expires_at,
    per.period_start, per.period_end, p_created_by
  )
  returning * into nuevo;

  intent_id    := nuevo.id;
  org_id       := nuevo.org_id;
  amount_cents := nuevo.amount_cents;
  currency     := nuevo.currency;
  reference    := nuevo.reference;
  expires_at   := nuevo.expires_at;
  period_start := nuevo.period_start;
  period_end   := nuevo.period_end;
  plan_tier    := per.plan_tier;
  checkout_url := null;
  reused       := false;
  return next;
end;
$$;

comment on function public.open_platform_payment_intent is
  'Abre (o reutiliza) el intento de pago del box hacia Scalar por el periodo que toca. La llama platform-payment-link con service_role.';

-- -----------------------------------------------------------------------------
-- Aplicar un pago de Mercado Pago hacia Scalar
-- -----------------------------------------------------------------------------
create or replace function public.apply_platform_payment(
  p_event_id     text,
  p_payment_id   text,
  p_reference    text,
  p_status       text,
  p_amount_cents bigint,
  p_payment_type text default null,
  p_method_id    text default null,
  p_event_type   text default 'payment.updated',
  p_payload      jsonb default '{}'::jsonb,
  p_paid_at      timestamptz default now()
)
returns table (
  resultado  text,
  payment_id uuid,
  intent_id  uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_row bigint;
  v_intent    public.platform_payment_intents%rowtype;
  v_status    text;
  v_method    text;
  v_payment   uuid;
begin
  if p_event_id is null or length(p_event_id) = 0 then
    raise exception 'El evento llegó sin identificador' using errcode = 'check_violation';
  end if;
  if p_payment_id is null or length(p_payment_id) = 0 then
    raise exception 'El evento llegó sin id de pago' using errcode = 'check_violation';
  end if;

  insert into public.webhook_events (
    provider, event_id, event_type, provider_transaction_id, reference, payload
  )
  values (
    'mercadopago', p_event_id, p_event_type, p_payment_id, p_reference,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, event_id) do nothing
  returning id into v_event_row;

  if v_event_row is null then
    resultado := 'evento_duplicado';
    return next;
    return;
  end if;

  select * into v_intent
  from public.platform_payment_intents pi
  where pi.reference = p_reference;

  if not found then
    update public.webhook_events
    set status = 'ignored', result = 'referencia_desconocida', processed_at = now()
    where id = v_event_row;
    resultado := 'referencia_desconocida';
    return next;
    return;
  end if;

  v_status := case lower(coalesce(p_status, ''))
                when 'approved'     then 'approved'
                when 'pending'      then 'pending'
                when 'in_process'   then 'pending'
                when 'authorized'   then 'pending'
                when 'in_mediation' then 'pending'
                when 'rejected'     then 'declined'
                when 'cancelled'    then 'voided'
                when 'refunded'     then 'refunded'
                when 'charged_back' then 'refunded'
                else null
              end;

  if v_status is null then
    update public.webhook_events
    set status = 'ignored', result = 'estado_desconocido', org_id = v_intent.org_id, processed_at = now()
    where id = v_event_row;
    resultado := 'estado_desconocido';
    intent_id := v_intent.id;
    return next;
    return;
  end if;

  -- Un reembolso hacia un box se anota; el periodo NO se revierte solo. Eso
  -- es una decisión de una persona (superadmin), con el box al teléfono.
  if v_status = 'refunded' then
    update public.platform_payments
    set status = 'refunded'
    where provider = 'mercadopago' and provider_ref = p_payment_id and status = 'confirmed'
    returning id into v_payment;

    update public.webhook_events
    set status = 'processed',
        result = case when v_payment is null then 'reembolso_sin_pago' else 'pago_reembolsado' end,
        org_id = v_intent.org_id, processed_at = now()
    where id = v_event_row;

    resultado  := case when v_payment is null then 'reembolso_sin_pago' else 'pago_reembolsado' end;
    payment_id := v_payment;
    intent_id  := v_intent.id;
    return next;
    return;
  end if;

  update public.platform_payment_intents
  set status = case when status = 'approved' then 'approved' else v_status end,
      provider_transaction_id = coalesce(p_payment_id, provider_transaction_id)
  where id = v_intent.id;

  if v_status <> 'approved' then
    update public.webhook_events
    set status = 'processed', result = 'sin_pago_' || v_status,
        org_id = v_intent.org_id, processed_at = now()
    where id = v_event_row;
    resultado := 'sin_pago';
    intent_id := v_intent.id;
    return next;
    return;
  end if;

  if coalesce(p_amount_cents, 0) <= 0 then
    raise exception 'Un pago aprobado no puede venir en cero' using errcode = 'check_violation';
  end if;

  v_method := case
                when lower(coalesce(p_method_id, ''))   = 'nequi'     then 'nequi'
                when lower(coalesce(p_method_id, ''))   = 'daviplata' then 'daviplata'
                when lower(coalesce(p_method_id, ''))   = 'pse'       then 'pse'
                when lower(coalesce(p_payment_type, '')) in ('credit_card','debit_card','prepaid_card') then 'card'
                when lower(coalesce(p_payment_type, '')) = 'bank_transfer' then 'pse'
                when lower(coalesce(p_payment_type, '')) = 'ticket'        then 'cash'
                when lower(coalesce(p_payment_type, '')) in ('account_money','digital_wallet') then 'transfer'
                else 'other'
              end;

  -- La plata que entró se anota siempre. Pero un pago por debajo de lo que
  -- valía el periodo NO lo da por pago: eso lo revisa una persona.
  insert into public.platform_payments (
    org_id, intent_id, amount_cents, currency, method, paid_at,
    period_start, period_end, provider, provider_ref, status
  )
  values (
    v_intent.org_id, v_intent.id, p_amount_cents, v_intent.currency, v_method,
    coalesce(p_paid_at, now()), v_intent.period_start, v_intent.period_end,
    'mercadopago', p_payment_id, 'confirmed'
  )
  on conflict do nothing
  returning id into v_payment;

  if v_payment is null then
    update public.webhook_events
    set status = 'processed', result = 'pago_duplicado', org_id = v_intent.org_id, processed_at = now()
    where id = v_event_row;
    resultado := 'pago_duplicado';
    intent_id := v_intent.id;
    return next;
    return;
  end if;

  if p_amount_cents < v_intent.amount_cents then
    update public.webhook_events
    set status = 'processed', result = 'pago_insuficiente', org_id = v_intent.org_id, processed_at = now()
    where id = v_event_row;
    resultado  := 'pago_insuficiente';
    payment_id := v_payment;
    intent_id  := v_intent.id;
    return next;
    return;
  end if;

  perform private.platform_apply_paid_period(v_intent.org_id, v_intent.period_end, v_payment);

  update public.webhook_events
  set status = 'processed', result = 'pago_registrado', org_id = v_intent.org_id, processed_at = now()
  where id = v_event_row;

  resultado  := 'pago_registrado';
  payment_id := v_payment;
  intent_id  := v_intent.id;
  return next;
end;
$$;

comment on function public.apply_platform_payment is
  'Aplica un pago de un box hacia Scalar (Mercado Pago), ya verificado y consultado. Idempotente. Avanza next_charge_on y reactiva el box si estaba en mora.';

-- -----------------------------------------------------------------------------
-- Registrar a mano un pago del box (Nequi personal, como se arranca)
-- -----------------------------------------------------------------------------
create or replace function public.register_platform_payment(
  p_org_id       uuid,
  p_amount_cents bigint,
  p_method       text default 'nequi',
  p_paid_at      timestamptz default now(),
  p_notes        text default null
)
returns public.platform_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  per   record;
  v_row public.platform_payments;
begin
  perform private.require_platform_admin();

  if coalesce(p_amount_cents, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'check_violation';
  end if;

  select * into per from private.platform_next_period(p_org_id);

  insert into public.platform_payments (
    org_id, amount_cents, method, paid_at, period_start, period_end,
    provider, status, notes, recorded_by
  )
  values (
    p_org_id, p_amount_cents, coalesce(p_method, 'nequi'), coalesce(p_paid_at, now()),
    per.period_start, per.period_end, 'manual', 'confirmed', nullif(btrim(coalesce(p_notes, '')), ''),
    (select auth.uid())
  )
  returning * into v_row;

  perform private.platform_apply_paid_period(p_org_id, per.period_end, v_row.id);

  return v_row;
end;
$$;

comment on function public.register_platform_payment is
  'Superadmin: anota que el box pagó el periodo que tocaba (Nequi, transferencia) y avanza next_charge_on.';

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
revoke all on function public.open_payment_intent(uuid, text, timestamptz, uuid, text)
  from public, anon, authenticated;
revoke all on function public.apply_mercadopago_payment(text, text, text, text, bigint, text, text, text, jsonb, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.open_platform_payment_intent(uuid, text, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_platform_payment(text, text, text, text, bigint, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.register_platform_payment(uuid, bigint, text, timestamptz, text)
  from public, anon;
revoke all on function private.platform_next_period(uuid) from public, anon;
revoke all on function private.platform_apply_paid_period(uuid, date, uuid) from public, anon;

grant execute on function public.open_payment_intent(uuid, text, timestamptz, uuid, text)
  to service_role;
grant execute on function public.apply_mercadopago_payment(text, text, text, text, bigint, text, text, text, jsonb, timestamptz, uuid)
  to service_role;
grant execute on function public.open_platform_payment_intent(uuid, text, timestamptz, uuid)
  to service_role;
grant execute on function public.apply_platform_payment(text, text, text, text, bigint, text, text, text, jsonb, timestamptz)
  to service_role;
-- La registra el superadmin desde el navegador; require_platform_admin() decide.
grant execute on function public.register_platform_payment(uuid, bigint, text, timestamptz, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.platform_payment_intents enable row level security;
alter table public.platform_payments        enable row level security;

-- Solo el dueño ve lo que su box le paga a Scalar (mismo criterio que
-- platform_subscriptions). El equipo de Scalar lo ve todo. Se escribe solo
-- por las funciones de arriba.
create policy "el dueño ve los intentos de pago de su box con Scalar"
  on public.platform_payment_intents for select
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner']))
         or (select private.is_platform_admin()));

create policy "el dueño ve los pagos de su box a Scalar"
  on public.platform_payments for select
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner']))
         or (select private.is_platform_admin()));

do $$ begin perform public.assert_rls_enabled(); end $$;
