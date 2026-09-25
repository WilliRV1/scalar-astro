-- =============================================================================
-- Prueba del cobro con Mercado Pago (MERCADO PAGO)
-- =============================================================================
-- Dos flujos sobre el mismo molde: el box cobra a sus atletas y Scalar cobra
-- al box. Mercado Pago reintenta los avisos y manda uno por cada cambio de
-- estado del mismo pago: registrar dos veces, o abonarle al box equivocado,
-- es motivo de cancelación inmediata. Por eso la idempotencia y el aislamiento
-- van primero.
--
-- Estas pruebas NO tocan Mercado Pago: ejercitan apply_mercadopago_payment y
-- apply_platform_payment con los datos que la Edge Function saca de
-- GET /v1/payments/{id}. La firma y la consulta viven en la función y aquí se
-- dan por hechas.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- semilla ---
insert into auth.users (id, email) values
  ('81000000-0000-4000-8000-000000000001', 'dueno@boxmp.co'),
  ('81000000-0000-4000-8000-000000000002', 'coach@boxmp.co'),
  ('81000000-0000-4000-8000-000000000003', 'dueno@boxotro-mp.co'),
  ('81000000-0000-4000-8000-000000000004', 'admin@scalar.co');

insert into public.organizations (id, slug, name, timezone, status) values
  ('80000000-0000-4000-8000-000000000001', 'box-mp-a', 'Box MP A', 'America/Bogota', 'active'),
  ('80000000-0000-4000-8000-000000000002', 'box-mp-b', 'Box MP B', 'America/Bogota', 'active'),
  ('80000000-0000-4000-8000-000000000003', 'box-mp-c', 'Box MP C', 'America/Bogota', 'past_due');

insert into public.memberships (org_id, user_id, role, permissions, athlete_id) values
  ('80000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'owner', '{}', null),
  ('80000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002', 'coach', '{}', null),
  ('80000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000003', 'owner', '{}', null);

insert into public.platform_admins (user_id, note) values
  ('81000000-0000-4000-8000-000000000004', 'prueba');

insert into public.athletes (id, org_id, first_name) values
  ('82000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'Atleta A'),
  ('82000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', 'Atleta B');

-- Facturas de 180.000 COP = 18.000.000 centavos
insert into public.invoices (id, org_id, athlete_id, number, period_start, period_end, due_on, amount_cents)
select ('1e000000-0000-4000-8000-00000000000' || g)::uuid,
       '80000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001',
       'F-00000' || g, '2026-09-05', '2026-10-04', '2026-09-08', 18000000
from generate_series(1, 6) g;
insert into public.invoices (id, org_id, athlete_id, number, period_start, period_end, due_on, amount_cents) values
  ('1e000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000002',
   '82000000-0000-4000-8000-000000000002', 'F-000001', '2026-09-05', '2026-10-04', '2026-09-08', 18000000);

-- Lo que cada box le paga a Scalar
insert into public.platform_subscriptions
  (org_id, plan_tier, is_founder, price_cents, setup_fee_cents, billing_period, status, started_on, next_charge_on)
values
  ('80000000-0000-4000-8000-000000000001', 'box',   true,  4990000, 0,        'monthly', 'active',   '2026-09-01', '2026-10-01'),
  ('80000000-0000-4000-8000-000000000002', 'trial', false, 0,       0,        'monthly', 'trialing', '2026-09-20', '2026-10-04'),
  ('80000000-0000-4000-8000-000000000003', 'box',   false, 4990000, 15000000, 'monthly', 'past_due', '2026-08-01', '2026-09-01');

create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  -- coalesce a propósito: una aserción que dé NULL es un fallo, no un "pasa".
  if not coalesce(cond, false) then
    raise exception 'FALLO [%] (la condición dio %)', label, coalesce(cond::text, 'NULL');
  end if;
  raise notice '  ok · %', label;
end $$;

-- ============================ 1 · El intento sabe de qué pasarela es ========
do $$
declare r record; r2 record; r3 record; r4 record; msg text;
begin
  select * into r from public.open_payment_intent(
    '1e000000-0000-4000-8000-000000000001', 'SCL-80000001-F000001-MPAAAA0001',
    now() + interval '1 day', null, 'mercadopago');
  perform pg_temp.chk(r.amount_cents = 18000000 and not r.reused,
    'MERCADO PAGO · el intento se abre por el saldo pendiente');
  perform pg_temp.chk(
    (select provider from public.payment_intents where id = r.intent_id) = 'mercadopago',
    'y queda marcado como de Mercado Pago');

  select * into r2 from public.open_payment_intent(
    '1e000000-0000-4000-8000-000000000001', 'SCL-80000001-F000001-MPAAAA0002',
    now() + interval '1 day', null, 'mercadopago');
  perform pg_temp.chk(r2.reused and r2.intent_id = r.intent_id,
    'pedirlo dos veces por la misma pasarela reutiliza el intento');

  select * into r3 from public.open_payment_intent(
    '1e000000-0000-4000-8000-000000000001', 'SCL-80000001-F000001-WPAAAA0001',
    now() + interval '1 day', null, 'wompi');
  perform pg_temp.chk(not r3.reused and r3.intent_id <> r.intent_id,
    'un enlace de Wompi no se reutiliza para Mercado Pago: son dos intentos');

  select * into r4 from public.open_payment_intent(
    '1e000000-0000-4000-8000-000000000001', 'SCL-80000001-F000001-WPAAAA0002');
  perform pg_temp.chk(r4.reused and r4.intent_id = r3.intent_id,
    'sin indicar pasarela sigue siendo Wompi (compatibilidad con lo que ya existía)');

  begin
    perform public.open_payment_intent(
      '1e000000-0000-4000-8000-000000000002', 'SCL-80000001-F000002-XXAAAA0001',
      null, null, 'paypal');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%Pasarela desconocida%', 'una pasarela que no existe se rechaza');
end $$;

-- ============================ 2 · Pago aprobado: una sola vez ===============
do $$
declare r record; inv public.invoices%rowtype; pago public.payments%rowtype;
begin
  select * into r from public.apply_mercadopago_payment(
    'n-1', 'mp-pago-1', 'SCL-80000001-F000001-MPAAAA0001', 'approved', 18000000,
    'bank_transfer', 'pse', 'payment.updated', '{}'::jsonb, '2026-09-25 15:00:00+00',
    '80000000-0000-4000-8000-000000000001');
  perform pg_temp.chk(r.resultado = 'pago_registrado', 'un pago aprobado se registra');

  select * into inv from public.invoices where id = '1e000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(inv.status = 'paid' and inv.paid_cents = 18000000,
    'la factura queda paga (lo hace el trigger, no la función)');

  select * into pago from public.payments where id = r.payment_id;
  perform pg_temp.chk(
    pago.provider = 'mercadopago' and pago.provider_ref = 'mp-pago-1'
    and pago.method = 'pse' and pago.status = 'confirmed'
    and pago.paid_at = '2026-09-25 15:00:00+00',
    'el pago lleva proveedor, id de Mercado Pago, medio PSE y la fecha de aprobación');
  perform pg_temp.chk(
    (select status from public.payment_intents where reference = 'SCL-80000001-F000001-MPAAAA0001') = 'approved'
    and (select provider_transaction_id from public.payment_intents where reference = 'SCL-80000001-F000001-MPAAAA0001') = 'mp-pago-1',
    'el intento queda aprobado con el id del pago');

  select * into r from public.apply_mercadopago_payment(
    'n-1', 'mp-pago-1', 'SCL-80000001-F000001-MPAAAA0001', 'approved', 18000000,
    'bank_transfer', 'pse');
  perform pg_temp.chk(r.resultado = 'evento_duplicado', 'el mismo aviso reintentado no se procesa dos veces');

  select * into r from public.apply_mercadopago_payment(
    'n-2', 'mp-pago-1', 'SCL-80000001-F000001-MPAAAA0001', 'approved', 18000000,
    'bank_transfer', 'pse');
  perform pg_temp.chk(r.resultado = 'pago_duplicado', 'otro aviso del MISMO pago tampoco lo registra otra vez');
  perform pg_temp.chk(
    (select count(*) from public.payments where provider_ref = 'mp-pago-1') = 1,
    'sigue habiendo un solo pago');
end $$;

-- ============================ 3 · Pendiente, rechazado, desconocido =========
do $$
declare r record;
begin
  perform public.open_payment_intent('1e000000-0000-4000-8000-000000000002',
    'SCL-80000001-F000002-MPAAAA0001', null, null, 'mercadopago');
  perform public.open_payment_intent('1e000000-0000-4000-8000-000000000003',
    'SCL-80000001-F000003-MPAAAA0001', null, null, 'mercadopago');

  select * into r from public.apply_mercadopago_payment(
    'n-3', 'mp-pago-2', 'SCL-80000001-F000002-MPAAAA0001', 'in_process', 18000000, 'credit_card', 'visa');
  perform pg_temp.chk(r.resultado = 'sin_pago', 'un pago en proceso no registra plata');
  perform pg_temp.chk(
    (select status from public.payment_intents where reference = 'SCL-80000001-F000002-MPAAAA0001') = 'pending'
    and (select status from public.invoices where id = '1e000000-0000-4000-8000-000000000002') = 'open',
    'el intento queda pendiente y la factura abierta');

  select * into r from public.apply_mercadopago_payment(
    'n-4', 'mp-pago-2', 'SCL-80000001-F000002-MPAAAA0001', 'approved', 18000000, 'credit_card', 'visa');
  perform pg_temp.chk(r.resultado = 'pago_registrado'
    and (select method from public.payments where id = r.payment_id) = 'card',
    'cuando pasa a aprobado se registra, y tarjeta de crédito es "card"');

  select * into r from public.apply_mercadopago_payment(
    'n-5', 'mp-pago-3', 'SCL-80000001-F000003-MPAAAA0001', 'rejected', 18000000, 'credit_card', 'master');
  perform pg_temp.chk(r.resultado = 'sin_pago'
    and (select status from public.payment_intents where reference = 'SCL-80000001-F000003-MPAAAA0001') = 'declined'
    and not exists (select 1 from public.payments where provider_ref = 'mp-pago-3'),
    'un pago rechazado deja el intento declinado y no registra nada');

  select * into r from public.apply_mercadopago_payment(
    'n-6', 'mp-pago-9', 'SCL-NOEXISTE-123456', 'approved', 18000000);
  perform pg_temp.chk(r.resultado = 'referencia_desconocida'
    and (select status from public.webhook_events where event_id = 'n-6') = 'ignored',
    'una referencia que no es nuestra se ignora y queda en la bitácora');

  select * into r from public.apply_mercadopago_payment(
    'n-7', 'mp-pago-3', 'SCL-80000001-F000003-MPAAAA0001', 'inventado', 18000000);
  perform pg_temp.chk(r.resultado = 'estado_desconocido', 'un estado que no conocemos no se aplica');
end $$;

-- ============================ 4 · El webhook de un box no abona a otro ======
do $$
declare r record;
begin
  perform public.open_payment_intent('1e000000-0000-4000-8000-000000000011',
    'SCL-80000002-F000001-MPBBBB0001', null, null, 'mercadopago');

  -- Llega por la URL del box A, pero la referencia es del box B.
  select * into r from public.apply_mercadopago_payment(
    'n-8', 'mp-pago-b1', 'SCL-80000002-F000001-MPBBBB0001', 'approved', 18000000,
    'bank_transfer', 'pse', 'payment.updated', '{}'::jsonb, now(),
    '80000000-0000-4000-8000-000000000001');
  perform pg_temp.chk(r.resultado = 'box_no_coincide'
    and not exists (select 1 from public.payments where provider_ref = 'mp-pago-b1'),
    'un aviso que entra por el webhook de otro box no registra nada');

  select * into r from public.apply_mercadopago_payment(
    'n-9', 'mp-pago-b1', 'SCL-80000002-F000001-MPBBBB0001', 'approved', 18000000,
    'bank_transfer', 'pse', 'payment.updated', '{}'::jsonb, now(),
    '80000000-0000-4000-8000-000000000002');
  perform pg_temp.chk(r.resultado = 'pago_registrado'
    and (select org_id from public.payments where provider_ref = 'mp-pago-b1') = '80000000-0000-4000-8000-000000000002',
    'por el webhook correcto sí, y al box correcto');
end $$;

-- ============================ 5 · Reembolsos y medios de pago ===============
do $$
declare r record; inv public.invoices%rowtype; msg text;
begin
  select * into r from public.apply_mercadopago_payment(
    'n-10', 'mp-pago-1', 'SCL-80000001-F000001-MPAAAA0001', 'refunded', 18000000, 'bank_transfer', 'pse');
  perform pg_temp.chk(r.resultado = 'pago_reembolsado'
    and (select status from public.payments where provider_ref = 'mp-pago-1') = 'refunded',
    'un reembolso marca el pago como reembolsado');
  select * into inv from public.invoices where id = '1e000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(inv.paid_cents = 0 and inv.status in ('open','overdue'),
    'y la factura vuelve a quedar abierta (trigger)');
  perform pg_temp.chk(
    (select status from public.payment_intents where reference = 'SCL-80000001-F000001-MPAAAA0001') = 'approved',
    'el intento no cambia: sí se aprobó en su momento');

  select * into r from public.apply_mercadopago_payment(
    'n-11', 'mp-pago-3', 'SCL-80000001-F000003-MPAAAA0001', 'charged_back', 18000000);
  perform pg_temp.chk(r.resultado = 'reembolso_sin_pago', 'un contracargo de algo que nunca se registró no rompe nada');

  begin
    perform public.apply_mercadopago_payment(
      'n-12', 'mp-pago-4', 'SCL-80000001-F000003-MPAAAA0001', 'approved', 0);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%cero%', 'un pago aprobado en cero se rechaza ruidosamente');

  perform public.open_payment_intent('1e000000-0000-4000-8000-000000000004',
    'SCL-80000001-F000004-MPAAAA0001', null, null, 'mercadopago');
  perform public.open_payment_intent('1e000000-0000-4000-8000-000000000005',
    'SCL-80000001-F000005-MPAAAA0001', null, null, 'mercadopago');
  perform public.open_payment_intent('1e000000-0000-4000-8000-000000000006',
    'SCL-80000001-F000006-MPAAAA0001', null, null, 'mercadopago');

  select * into r from public.apply_mercadopago_payment(
    'n-13', 'mp-pago-6', 'SCL-80000001-F000004-MPAAAA0001', 'approved', 18000000, 'ticket', 'efecty');
  perform pg_temp.chk((select method from public.payments where id = r.payment_id) = 'cash',
    'Efecty (ticket) es efectivo');
  select * into r from public.apply_mercadopago_payment(
    'n-14', 'mp-pago-7', 'SCL-80000001-F000005-MPAAAA0001', 'approved', 18000000, 'account_money', null);
  perform pg_temp.chk((select method from public.payments where id = r.payment_id) = 'transfer',
    'saldo en Mercado Pago es transferencia');
  select * into r from public.apply_mercadopago_payment(
    'n-15', 'mp-pago-8', 'SCL-80000001-F000006-MPAAAA0001', 'approved', 18000000, 'digital_wallet', 'nequi');
  perform pg_temp.chk((select method from public.payments where id = r.payment_id) = 'nequi',
    'el medio concreto (nequi) manda sobre la familia');
end $$;

-- ============================ 6 · Lo que el box le paga a Scalar ============
do $$
declare r record; r2 record; rc record; msg text;
begin
  select * into r from public.open_platform_payment_intent(
    '80000000-0000-4000-8000-000000000001', 'SCL-PLAT-80000001-AAAA000001', now() + interval '7 days');
  perform pg_temp.chk(
    r.amount_cents = 4990000 and r.period_start = '2026-10-01' and r.period_end = '2026-10-31'
    and r.plan_tier = 'box' and not r.reused,
    'el intento hacia Scalar es por el precio del plan y el periodo que empieza en next_charge_on');

  select * into r2 from public.open_platform_payment_intent(
    '80000000-0000-4000-8000-000000000001', 'SCL-PLAT-80000001-AAAA000002', now() + interval '7 days');
  perform pg_temp.chk(r2.reused and r2.intent_id = r.intent_id, 'pedirlo dos veces reutiliza el intento');

  begin
    perform public.open_platform_payment_intent(
      '80000000-0000-4000-8000-000000000002', 'SCL-PLAT-80000002-BBBB000001');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%precio%', 'un box en prueba, sin precio, no puede pagar todavía');

  select * into rc from public.open_platform_payment_intent(
    '80000000-0000-4000-8000-000000000003', 'SCL-PLAT-80000003-CCCC000001');
  perform pg_temp.chk(rc.amount_cents = 19990000 and rc.period_start = '2026-09-01' and rc.period_end = '2026-09-30',
    'el primer pago de un box con cuota de implementación la incluye');
end $$;

do $$
declare r record; s public.platform_subscriptions%rowtype; p public.platform_payments%rowtype;
begin
  select * into r from public.apply_platform_payment(
    'scalar:n-1', 'mp-plat-1', 'SCL-PLAT-80000001-AAAA000001', 'approved', 4990000,
    'bank_transfer', 'pse', 'payment.updated', '{}'::jsonb, '2026-09-26 15:00:00+00');
  perform pg_temp.chk(r.resultado = 'pago_registrado', 'un pago a Scalar aprobado se registra');

  select * into p from public.platform_payments where id = r.payment_id;
  perform pg_temp.chk(
    p.provider = 'mercadopago' and p.provider_ref = 'mp-plat-1' and p.method = 'pse'
    and p.period_start = '2026-10-01' and p.period_end = '2026-10-31' and p.status = 'confirmed',
    'con proveedor, id del pago, medio y el periodo que cubre');

  select * into s from public.platform_subscriptions where org_id = '80000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(s.next_charge_on = '2026-11-01' and s.status = 'active',
    'next_charge_on avanza al día siguiente del periodo pago');

  select * into r from public.apply_platform_payment(
    'scalar:n-1', 'mp-plat-1', 'SCL-PLAT-80000001-AAAA000001', 'approved', 4990000);
  perform pg_temp.chk(r.resultado = 'evento_duplicado', 'el mismo aviso no se procesa dos veces');
  select * into r from public.apply_platform_payment(
    'scalar:n-2', 'mp-plat-1', 'SCL-PLAT-80000001-AAAA000001', 'approved', 4990000);
  perform pg_temp.chk(r.resultado = 'pago_duplicado'
    and (select count(*) from public.platform_payments where provider_ref = 'mp-plat-1') = 1,
    'ni el mismo pago con otro aviso');
  select * into s from public.platform_subscriptions where org_id = '80000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(s.next_charge_on = '2026-11-01', 'y el periodo no avanza dos veces');

  -- El box C estaba en mora: al pagar vuelve.
  select * into r from public.apply_platform_payment(
    'scalar:n-3', 'mp-plat-c1', 'SCL-PLAT-80000003-CCCC000001', 'approved', 19990000, 'credit_card', 'visa');
  perform pg_temp.chk(r.resultado = 'pago_registrado', 'el box en mora paga');
  select * into s from public.platform_subscriptions where org_id = '80000000-0000-4000-8000-000000000003';
  perform pg_temp.chk(s.status = 'active' and s.suspended_on is null and s.next_charge_on = '2026-10-01',
    'su suscripción vuelve a estar activa con el siguiente periodo');
  perform pg_temp.chk(
    (select status from public.organizations where id = '80000000-0000-4000-8000-000000000003') = 'active',
    'y el box sale de la mora');
  perform pg_temp.chk(
    exists (select 1 from public.audit_log
            where org_id = '80000000-0000-4000-8000-000000000003' and action = 'platform.payment_received'),
    'queda en la bitácora');

  select * into r from public.open_platform_payment_intent(
    '80000000-0000-4000-8000-000000000003', 'SCL-PLAT-80000003-CCCC000002');
  perform pg_temp.chk(r.amount_cents = 4990000 and r.period_start = '2026-10-01',
    'el segundo pago ya no lleva la cuota de implementación');

  -- Pago por debajo del valor del periodo: se anota, no se da por pago.
  select * into r from public.apply_platform_payment(
    'scalar:n-4', 'mp-plat-c2', 'SCL-PLAT-80000003-CCCC000002', 'approved', 1000000);
  perform pg_temp.chk(r.resultado = 'pago_insuficiente'
    and exists (select 1 from public.platform_payments where provider_ref = 'mp-plat-c2'),
    'un pago menor al periodo se registra pero no lo da por pago');
  select * into s from public.platform_subscriptions where org_id = '80000000-0000-4000-8000-000000000003';
  perform pg_temp.chk(s.next_charge_on = '2026-10-01', 'y next_charge_on no se mueve');

  -- Reembolso a un box: se anota; el periodo no se revierte solo.
  select * into r from public.apply_platform_payment(
    'scalar:n-5', 'mp-plat-1', 'SCL-PLAT-80000001-AAAA000001', 'refunded', 4990000);
  perform pg_temp.chk(r.resultado = 'pago_reembolsado'
    and (select status from public.platform_payments where provider_ref = 'mp-plat-1') = 'refunded',
    'un reembolso hacia el box marca el pago como reembolsado');
  select * into s from public.platform_subscriptions where org_id = '80000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(s.next_charge_on = '2026-11-01', 'sin revertir el periodo: eso lo decide una persona');

  select * into r from public.apply_platform_payment(
    'scalar:n-6', 'mp-plat-x', 'SCL-PLAT-NOEXISTE-000001', 'approved', 4990000);
  perform pg_temp.chk(r.resultado = 'referencia_desconocida', 'una referencia desconocida se ignora');
end $$;

-- ============================ 7 · Credenciales, pago a mano y RLS ===========
set session role authenticated;

-- ---- el dueño guarda sus llaves de Mercado Pago -----------------------------
set request.jwt.claim.sub = '81000000-0000-4000-8000-000000000001';
do $$
declare cred public.org_credentials; msg text; pista text;
begin
  cred := public.set_org_credential(
    '80000000-0000-4000-8000-000000000001', 'mercadopago_access_token',
    'TEST-1234567890123456-092512-abcdef0123456789abcdef0123456789-123456789', 'test');
  perform pg_temp.chk(cred.is_set and cred.provider = 'mercadopago' and cred.last4 = '6789'
    and cred.public_value is null,
    'el access token se guarda como secreto y solo se ve en qué termina');

  cred := public.set_org_credential(
    '80000000-0000-4000-8000-000000000001', 'mercadopago_webhook_secret', 'a1b2c3d4e5f6', 'test');
  perform pg_temp.chk(cred.is_set and cred.last4 = 'e5f6', 'la clave secreta del webhook también');

  begin
    perform public.set_org_credential(
      '80000000-0000-4000-8000-000000000001', 'mercadopago_access_token', 'pub_test_esto_no_es', 'test');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%TEST-%APP_USR-%', 'pegar otra cosa donde va el access token se rechaza');

  begin
    perform public.set_org_credential('80000000-0000-4000-8000-000000000001', 'llave_inventada', 'x', 'test');
    msg := null;
  exception when others then
    get stacked diagnostics msg = message_text, pista = pg_exception_hint;
  end;
  perform pg_temp.chk(msg like '%No conozco%' and pista like '%mercadopago_access_token%',
    'la lista de claves válidas del mensaje incluye las de Mercado Pago');
end $$;

-- ---- el dueño ve lo suyo con Scalar, nadie más del box ----------------------
do $$ begin
  perform pg_temp.chk(
    (select count(*) from public.platform_payments where org_id = '80000000-0000-4000-8000-000000000001') = 1,
    'el dueño ve los pagos de su box a Scalar');
  perform pg_temp.chk(
    (select count(*) from public.platform_payment_intents where org_id = '80000000-0000-4000-8000-000000000001') = 1,
    'y sus intentos');
  perform pg_temp.chk(
    (select count(*) from public.platform_payments where org_id = '80000000-0000-4000-8000-000000000003') = 0,
    'pero no los de otro box');
end $$;

set request.jwt.claim.sub = '81000000-0000-4000-8000-000000000002';  -- coach del box A
do $$
declare msg text;
begin
  perform pg_temp.chk(
    (select count(*) from public.platform_payments) = 0,
    'el coach no ve lo que el box le paga a Scalar');
  begin
    perform public.register_platform_payment('80000000-0000-4000-8000-000000000001', 4990000, 'nequi');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg is not null, 'ni puede registrar un pago a mano');
end $$;

-- ---- el equipo de Scalar registra un Nequi a mano ---------------------------
set request.jwt.claim.sub = '81000000-0000-4000-8000-000000000004';  -- superadmin
do $$
declare p public.platform_payments; s public.platform_subscriptions%rowtype;
begin
  p := public.register_platform_payment(
    '80000000-0000-4000-8000-000000000001', 4990000, 'nequi', '2026-10-28 20:00:00+00', 'Nequi del 28');
  perform pg_temp.chk(
    p.provider = 'manual' and p.method = 'nequi' and p.period_start = '2026-11-01'
    and p.period_end = '2026-11-30' and p.notes = 'Nequi del 28',
    'un Nequi registrado a mano cubre el periodo que tocaba');
  perform pg_temp.chk(
    (select count(*) from public.platform_payments where org_id = '80000000-0000-4000-8000-000000000001') = 2,
    'el superadmin ve todos los pagos');
  -- La suscripción en sí solo la ve el dueño (RLS): el superadmin no la lee
  -- desde el navegador, la maneja por las funciones.
  perform pg_temp.chk(
    (select count(*) from public.platform_subscriptions
     where org_id = '80000000-0000-4000-8000-000000000001') = 0,
    'la suscripción del box no se lee con el rol de superadmin (RLS: solo el dueño)');
end $$;

reset role;
reset request.jwt.claim.sub;

do $$ begin
  perform pg_temp.chk(
    (select next_charge_on from public.platform_subscriptions
     where org_id = '80000000-0000-4000-8000-000000000001') = '2026-12-01',
    'y next_charge_on avanzó igual que con Mercado Pago');
end $$;

do $$ begin raise notice 'MERCADO PAGO OK'; end $$;

rollback;
