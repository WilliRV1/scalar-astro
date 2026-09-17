-- =============================================================================
-- Prueba del débito recurrente
-- =============================================================================
-- Aquí se prueba lo que mueve plata de la cuenta de una persona sin que esa
-- persona esté delante. Un fallo no es "un bug": es un débito no autorizado, o
-- dos débitos del mismo mes, o un atleta al que se le sigue cobrando después de
-- haber revocado. Cualquiera de los tres cierra el producto.
--
-- Estas pruebas NO tocan Wompi. Ejercitan la base: encolado, idempotencia,
-- escalera de reintentos, revocación y conciliación por la ruta que ya existe
-- (`apply_wompi_payment`). Lo que no se puede probar sin credenciales está
-- listado en docs/12-debito-recurrente.md.
-- =============================================================================

begin;

-- ------------------------------------------------------------------ semilla --
insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'dueno@boxdebito.co'),
  ('f1000000-0000-4000-8000-000000000002', 'atleta1@boxdebito.co'),
  ('f1000000-0000-4000-8000-000000000003', 'dueno@boxotro.co'),
  ('f1000000-0000-4000-8000-000000000004', 'coach@boxdebito.co');

insert into public.organizations (id, slug, name, timezone, currency, status) values
  ('0f000000-0000-4000-8000-000000000001', 'box-debito', 'Box Débito', 'America/Bogota', 'COP', 'active'),
  ('0f000000-0000-4000-8000-000000000002', 'box-otro',   'Box Otro',   'America/Bogota', 'COP', 'active');

insert into public.athletes (id, org_id, first_name, email, phone) values
  ('af000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001', 'Nequi',        'nequi@atleta.co',   '+573001110001'),
  ('af000000-0000-4000-8000-000000000002', '0f000000-0000-4000-8000-000000000001', 'SinAutorizar', 'sinaut@atleta.co',  '+573001110002'),
  ('af000000-0000-4000-8000-000000000003', '0f000000-0000-4000-8000-000000000001', 'Revoca',       'revoca@atleta.co',  '+573001110003'),
  ('af000000-0000-4000-8000-000000000004', '0f000000-0000-4000-8000-000000000001', 'SinFondos',    'fondos@atleta.co',  '+573001110004'),
  ('af000000-0000-4000-8000-000000000005', '0f000000-0000-4000-8000-000000000001', 'TokenMuerto',  'token@atleta.co',   '+573001110005'),
  ('af000000-0000-4000-8000-000000000006', '0f000000-0000-4000-8000-000000000001', 'PagoEnCaja',   'caja@atleta.co',    '+573001110006'),
  ('af000000-0000-4000-8000-000000000007', '0f000000-0000-4000-8000-000000000001', 'DeudaVieja',   'vieja@atleta.co',   '+573001110007'),
  ('af000000-0000-4000-8000-000000000008', '0f000000-0000-4000-8000-000000000001', 'PagaDespues',  'despues@atleta.co', '+573001110008'),
  ('af000000-0000-4000-8000-000000000009', '0f000000-0000-4000-8000-000000000002', 'DelOtroBox',   'otro@atleta.co',    '+573002220001');

insert into public.memberships (org_id, user_id, role, permissions, athlete_id) values
  ('0f000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'owner',   '{}', null),
  ('0f000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000004', 'coach',   '{}', null),
  ('0f000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'athlete', '{}', 'af000000-0000-4000-8000-000000000001'),
  ('0f000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000003', 'owner',   '{}', null);

-- Mensualidad de $180.000 = 18.000.000 centavos.
insert into public.invoices (id, org_id, athlete_id, number, period_start, period_end, issued_on, due_on, amount_cents) values
  ('1f000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001', 'F-000001', '2026-09-05', '2026-10-04', '2026-09-05', '2026-09-08', 18000000),
  ('1f000000-0000-4000-8000-000000000002', '0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000002', 'F-000002', '2026-09-05', '2026-10-04', '2026-09-05', '2026-09-08', 18000000),
  ('1f000000-0000-4000-8000-000000000003', '0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000003', 'F-000003', '2026-09-05', '2026-10-04', '2026-09-05', '2026-09-08', 18000000),
  ('1f000000-0000-4000-8000-000000000004', '0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000004', 'F-000004', '2026-09-05', '2026-10-04', '2026-09-05', '2026-09-08', 18000000),
  ('1f000000-0000-4000-8000-000000000005', '0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000005', 'F-000005', '2026-09-05', '2026-10-04', '2026-09-05', '2026-09-08', 18000000),
  ('1f000000-0000-4000-8000-000000000006', '0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000006', 'F-000006', '2026-09-05', '2026-10-04', '2026-09-05', '2026-09-08', 18000000),
  -- Emitida ANTES de que el atleta autorizara el débito: deuda vieja.
  ('1f000000-0000-4000-8000-000000000007', '0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000007', 'F-000007', '2026-08-05', '2026-09-04', '2026-08-05', '2026-08-08', 18000000),
  ('1f000000-0000-4000-8000-000000000008', '0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000008', 'F-000008', '2026-09-05', '2026-10-04', '2026-09-05', '2026-09-08', 18000000),
  ('1f000000-0000-4000-8000-000000000009', '0f000000-0000-4000-8000-000000000002', 'af000000-0000-4000-8000-000000000009', 'F-000001', '2026-09-05', '2026-10-04', '2026-09-05', '2026-09-08', 18000000);

create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  -- coalesce a propósito: `if not cond` con cond = NULL no entra al if, así que
  -- una aserción que compare contra una columna vacía o una subconsulta sin
  -- filas pasaría sin haber comprobado nada. Un NULL aquí es un fallo.
  if not coalesce(cond, false) then
    raise exception 'FALLO [%] (la condición dio %)', label, coalesce(cond::text, 'NULL');
  end if;
  raise notice '  ok · %', label;
end $$;

-- El texto que el atleta acepta. Es la evidencia, así que en la prueba va el
-- mismo que en la interfaz.
create or replace function pg_temp.texto_autorizacion()
returns text language sql immutable as $$
  select 'Autorizo a Box Débito a debitar automáticamente de este medio de pago '
      || 'el valor de mi mensualidad en la fecha de corte, hasta que yo revoque '
      || 'esta autorización desde la aplicación.'
$$;

-- ============================ 0 · Autorizaciones ============================
-- Todos autorizan el 1 de septiembre, cuatro días antes de que se emitan las
-- facturas del 5.
do $$
declare
  a uuid;
  r record;
begin
  foreach a in array array[
    'af000000-0000-4000-8000-000000000001'::uuid,
    'af000000-0000-4000-8000-000000000003'::uuid,
    'af000000-0000-4000-8000-000000000004'::uuid,
    'af000000-0000-4000-8000-000000000005'::uuid,
    'af000000-0000-4000-8000-000000000006'::uuid,
    'af000000-0000-4000-8000-000000000007'::uuid,
    'af000000-0000-4000-8000-000000000008'::uuid
  ]
  loop
    perform public.register_payment_method(
      p_org_id             => '0f000000-0000-4000-8000-000000000001',
      p_athlete_id         => a,
      p_kind               => 'nequi',
      p_provider_source_id => 'src-' || right(a::text, 4),
      p_accepted_text      => pg_temp.texto_autorizacion(),
      p_accepted_version   => '2026-09-01',
      p_customer_email     => right(a::text, 4) || '@atleta.co',
      p_masked_phone       => '+57 *** *** ' || right(a::text, 4),
      p_now                => '2026-09-01 15:00:00+00');
  end loop;

  -- El otro box, para el aislamiento.
  perform public.register_payment_method(
    p_org_id             => '0f000000-0000-4000-8000-000000000002',
    p_athlete_id         => 'af000000-0000-4000-8000-000000000009',
    p_kind               => 'card',
    p_provider_source_id => 'src-otro-9999',
    p_accepted_text      => pg_temp.texto_autorizacion(),
    p_accepted_version   => '2026-09-01',
    p_customer_email     => 'otro@atleta.co',
    p_brand              => 'VISA',
    p_last_four          => '4242',
    p_exp_month          => 12,
    p_exp_year           => 2030,
    p_now                => '2026-09-01 15:00:00+00');

  perform pg_temp.chk(
    (select count(*) from public.payment_methods where status = 'active') = 8,
    'cada atleta que autorizó queda con un método activo');
  perform pg_temp.chk(
    (select count(*) from public.recurring_authorizations where revoked_at is null) = 8,
    'y con una autorización vigente');

  select * into r from public.recurring_authorizations ra
  where ra.athlete_id = 'af000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(r.authorized_at = '2026-09-01 15:00:00+00',
    'la autorización guarda la fecha: la fecha es la evidencia');
  perform pg_temp.chk(r.accepted_text = pg_temp.texto_autorizacion() and r.accepted_version = '2026-09-01',
    'y guarda el texto exacto que el atleta aceptó, con su versión');
end $$;

-- ============================ 1 · Nunca se guarda una tarjeta ===============
-- Los CHECKs de la migración están para que esto sea imposible, no para que sea
-- "mala práctica".
do $$
declare pan boolean; tel boolean;
begin
  begin
    insert into public.payment_methods (org_id, athlete_id, kind, provider_source_id, last_four)
    values ('0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000002',
            'card', 'src-pan', '4242424242424242');
    pan := false;
  exception when check_violation then
    pan := true;
  end;
  perform pg_temp.chk(pan, 'no cabe un número de tarjeta completo en last_four');

  begin
    insert into public.payment_methods (org_id, athlete_id, kind, provider_source_id, masked_phone)
    values ('0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000002',
            'nequi', 'src-tel', '+573001234567');
    tel := false;
  exception when check_violation then
    tel := true;
  end;
  perform pg_temp.chk(tel, 'no cabe un teléfono sin enmascarar en masked_phone');

  perform pg_temp.chk(
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payment_methods'
        and column_name in ('card_number','pan','cvv','cvc','security_code')),
    'la tabla no tiene ninguna columna donde quepa el número o el CVV');
end $$;

-- ============================ 2 · El pago en caja va antes ==================
-- El atleta 6 paga en efectivo el día 4, antes de que corra el job. Ese cobro
-- NO puede salir por débito.
do $$
begin
  insert into public.payments (org_id, invoice_id, athlete_id, amount_cents, method, paid_at, provider, status)
  values ('0f000000-0000-4000-8000-000000000001', '1f000000-0000-4000-8000-000000000006',
          'af000000-0000-4000-8000-000000000006', 18000000, 'cash', '2026-09-04 15:00:00+00', 'manual', 'confirmed');

  perform pg_temp.chk(
    (select status from public.invoices where id = '1f000000-0000-4000-8000-000000000006') = 'paid',
    'el pago en efectivo salda la factura (lo hace el trigger de la 0003)');
end $$;

-- ============================ 3 · Encolar el débito =========================
-- 2026-09-05 17:00 UTC = mediodía del 5 en Bogotá.
do $$
declare r record;
begin
  select * into r from public.charge_due_subscriptions(
    '0f000000-0000-4000-8000-000000000001', '2026-09-05 17:00:00+00');

  perform pg_temp.chk(r.run_date = '2026-09-05',
    'el job evalúa el día del box, no el de UTC');
  perform pg_temp.chk(r.charges_queued = 5,
    'encola a los 5 atletas con método y autorización vigente');

  perform pg_temp.chk(
    not exists (select 1 from public.recurring_charges where invoice_id = '1f000000-0000-4000-8000-000000000002'),
    'un atleta SIN autorización vigente no se cobra');
  perform pg_temp.chk(
    not exists (select 1 from public.recurring_charges where invoice_id = '1f000000-0000-4000-8000-000000000006'),
    'una factura ya pagada a mano no se cobra por débito');
  perform pg_temp.chk(
    not exists (select 1 from public.recurring_charges where invoice_id = '1f000000-0000-4000-8000-000000000007'),
    'la autorización no es retroactiva: la deuda anterior no se debita');
  perform pg_temp.chk(
    (select amount_cents from public.recurring_charges where invoice_id = '1f000000-0000-4000-8000-000000000001') = 18000000,
    'el cobro se encola por el saldo de la factura');
end $$;

-- ============================ 4 · Idempotencia ==============================
-- LA prueba de este módulo: el job corre dos veces y NO cobra dos veces.
do $$
declare antes bigint; despues bigint; r record;
begin
  select count(*) into antes from public.recurring_charges;

  select * into r from public.charge_due_subscriptions(
    '0f000000-0000-4000-8000-000000000001', '2026-09-05 17:00:00+00');

  select count(*) into despues from public.recurring_charges;

  perform pg_temp.chk(r.charges_queued = 0 and antes = despues,
    'correr el job dos veces el mismo día NO encola un segundo cobro');

  -- Y unas horas después tampoco, que es como corre de verdad (cada hora).
  perform public.charge_due_subscriptions(
    '0f000000-0000-4000-8000-000000000001', '2026-09-05 23:00:00+00');
  perform pg_temp.chk(
    (select count(*) from public.recurring_charges) = antes,
    'ni corriéndolo otra vez más tarde el mismo día');

  perform pg_temp.chk(
    (select count(*) from public.recurring_charges
     where invoice_id = '1f000000-0000-4000-8000-000000000001') = 1,
    'la factura del atleta tiene exactamente un cobro encolado');
end $$;

-- ============================ 5 · Revocar corta en el acto ==================
-- El atleta 3 revoca ANTES de que se ejecute el cobro. No tiene que escribirle
-- a nadie ni esperar a la próxima corrida del job.
do $$
declare metodo public.payment_methods%rowtype; cobro public.recurring_charges%rowtype;
begin
  perform pg_temp.chk(
    (select status from public.recurring_charges where invoice_id = '1f000000-0000-4000-8000-000000000003') = 'queued',
    'el atleta que va a revocar tenía su cobro encolado');

  update public.recurring_authorizations
  set revoked_at = '2026-09-05 18:00:00+00', revoke_reason = 'Ya no quiero débito automático'
  where athlete_id = 'af000000-0000-4000-8000-000000000003' and revoked_at is null;

  select * into cobro from public.recurring_charges rc
  where rc.invoice_id = '1f000000-0000-4000-8000-000000000003';
  perform pg_temp.chk(cobro.status = 'cancelled',
    'revocar la autorización cancela el cobro encolado EN EL ACTO');

  select * into metodo from public.payment_methods pm
  where pm.athlete_id = 'af000000-0000-4000-8000-000000000003';
  perform pg_temp.chk(metodo.status = 'revoked' and metodo.revoked_at is not null,
    'y desactiva el medio de pago');

  -- Y el job no lo vuelve a encolar al día siguiente.
  perform public.charge_due_subscriptions(
    '0f000000-0000-4000-8000-000000000001', '2026-09-05 20:00:00+00');
  perform pg_temp.chk(
    not exists (
      select 1 from public.recurring_charges
      where invoice_id = '1f000000-0000-4000-8000-000000000003' and status <> 'cancelled'),
    'y el job ya no lo vuelve a encolar');
end $$;

-- ============================ 6 · Pagó a mano mientras tanto ================
-- El atleta 8 tenía su cobro encolado y pagó en efectivo en el box. El débito
-- se cancela solo: cobrarle a quien ya pagó es el peor error del producto.
do $$
declare c public.recurring_charges%rowtype;
begin
  select * into c from public.recurring_charges rc
  where rc.invoice_id = '1f000000-0000-4000-8000-000000000008';
  perform pg_temp.chk(c.status = 'queued',
    'el atleta 8 tenía su débito encolado');

  insert into public.payments (org_id, invoice_id, athlete_id, amount_cents, method, paid_at, provider, status)
  values ('0f000000-0000-4000-8000-000000000001', '1f000000-0000-4000-8000-000000000008',
          'af000000-0000-4000-8000-000000000008', 18000000, 'cash', '2026-09-07 15:00:00+00', 'manual', 'confirmed');

  select * into c from public.recurring_charges rc where rc.id = c.id;
  perform pg_temp.chk(c.status = 'cancelled',
    'pagar a mano cancela el débito encolado de esa factura');

  perform public.charge_due_subscriptions(
    '0f000000-0000-4000-8000-000000000001', '2026-09-08 17:00:00+00');
  perform pg_temp.chk(
    not exists (
      select 1 from public.recurring_charges
      where invoice_id = '1f000000-0000-4000-8000-000000000008' and status <> 'cancelled'),
    'y el job no lo vuelve a encolar: la factura ya no tiene saldo');
end $$;

-- ============================ 7 · Tomar el trabajo ==========================
do $$
declare tomados int; c public.recurring_charges%rowtype; pi public.payment_intents%rowtype;
begin
  select count(*)::int into tomados
  from public.claim_recurring_charges('0f000000-0000-4000-8000-000000000001', 50, '2026-09-05 20:00:00+00');

  perform pg_temp.chk(tomados = 3,
    'el job toma los 3 cobros que siguen vivos');

  select * into c from public.recurring_charges rc
  where rc.invoice_id = '1f000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(c.status = 'processing' and c.attempt = 1,
    'el cobro tomado queda en processing con su primer intento');
  perform pg_temp.chk(c.reference ~ '^[A-Za-z0-9_-]{6,255}$',
    'la referencia cumple el formato que admite la pasarela');

  select * into pi from public.payment_intents p where p.id = c.payment_intent_id;
  perform pg_temp.chk(pi.reference = c.reference and pi.invoice_id = c.invoice_id
                  and pi.amount_cents = 18000000,
    'cada intento de cobro crea su intento de pago: es lo que traduce la referencia cuando vuelve el webhook');

  perform pg_temp.chk(
    (select count(*) from public.recurring_charge_attempts where charge_id = c.id) = 1,
    'y queda un renglón en el historial de intentos');

  -- Tomarlo otra vez no lo duplica: ya no está ni en queued ni en declined.
  select count(*)::int into tomados
  from public.claim_recurring_charges('0f000000-0000-4000-8000-000000000001', 50, '2026-09-05 20:00:00+00');
  perform pg_temp.chk(tomados = 0,
    'un cobro en curso no se vuelve a tomar');
end $$;

-- ============================ 8 · Cobro aprobado ============================
-- Entra por la ruta que YA existe: apply_wompi_payment -> payments -> el trigger
-- de la 0003 salda la factura. Aquí no se recalcula ningún saldo.
do $$
declare c public.recurring_charges%rowtype; inv public.invoices%rowtype; r record;
begin
  select * into c from public.recurring_charges rc
  where rc.invoice_id = '1f000000-0000-4000-8000-000000000001';

  select * into r from public.apply_wompi_payment(
    p_event_id       => 'CHK-DEBITO-APROBADO-1',
    p_transaction_id => '113636-1757100000-11111',
    p_reference      => c.reference,
    p_status         => 'APPROVED',
    p_amount_cents   => 18000000,
    p_method_type    => 'NEQUI');

  perform pg_temp.chk(r.resultado = 'pago_registrado',
    'el cobro aprobado se registra como pago por la ruta existente');

  select * into inv from public.invoices i where i.id = '1f000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(inv.status = 'paid' and inv.paid_cents = 18000000,
    'y la factura queda saldada (la salda el trigger, no este módulo)');

  select * into c from public.recurring_charges rc
  where rc.invoice_id = '1f000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(c.status = 'approved' and c.charged_at is not null,
    'el cobro automático queda aprobado');

  perform pg_temp.chk(
    (select method from public.payments where provider_ref = '113636-1757100000-11111') = 'nequi',
    'el pago queda registrado como Nequi: el diferenciador del producto');

  -- La función también la llama la Edge Function al recibir el APPROVED
  -- síncrono de la pasarela. Llamarla después del webhook no puede duplicar nada.
  perform public.record_recurring_charge_result(
    p_charge_id => c.id, p_provider_status => 'APPROVED',
    p_transaction_id => '113636-1757100000-11111');

  perform pg_temp.chk(
    (select count(*) from public.payments where provider = 'wompi'
     and provider_ref = '113636-1757100000-11111') = 1,
    'anotar el resultado después del webhook NO registra un segundo pago');
  perform pg_temp.chk(
    (select status from public.recurring_charge_attempts
     where charge_id = c.id and attempt_no = 1) = 'approved',
    'el historial de intentos queda con el intento aprobado');
end $$;

-- ============================ 9 · Rechazo y reintentos ======================
-- Fondos insuficientes: SÍ se reintenta, y en la escalera 1 · 3 · 7 días.
do $$
declare c public.recurring_charges%rowtype; r record; tomados int;
begin
  select * into c from public.recurring_charges rc
  where rc.invoice_id = '1f000000-0000-4000-8000-000000000004';

  -- Primer rechazo: la pasarela responde DECLINED en el acto.
  select * into r from public.record_recurring_charge_result(
    p_charge_id => c.id, p_provider_status => 'DECLINED',
    p_transaction_id => '113636-1757100000-44441',
    p_error_code => 'INSUFFICIENT_FUNDS', p_error_message => 'Fondos insuficientes',
    p_now => '2026-09-05 20:00:00+00');

  perform pg_temp.chk(r.failure_kind = 'insufficient_funds' and r.will_retry,
    'fondos insuficientes SÍ se reintenta');
  perform pg_temp.chk(r.next_attempt_at = c.queued_at + interval '1 day',
    'y el siguiente intento queda programado al día 1');
  perform pg_temp.chk(
    (select status from public.recurring_charges where id = c.id) = 'declined',
    'el cobro queda rechazado, no perdido');
  perform pg_temp.chk(
    (select count(*) from public.payments where invoice_id = '1f000000-0000-4000-8000-000000000004') = 0,
    'un cobro rechazado no registra ningún pago');

  -- Día 1: segundo intento.
  select count(*)::int into tomados
  from public.claim_recurring_charges('0f000000-0000-4000-8000-000000000001', 50, c.queued_at + interval '1 day');
  perform pg_temp.chk(tomados = 1, 'al día 1 el cobro rechazado se vuelve a tomar');

  select * into r from public.record_recurring_charge_result(
    p_charge_id => c.id, p_provider_status => 'DECLINED',
    p_transaction_id => '113636-1757100000-44442',
    p_error_code => 'INSUFFICIENT_FUNDS', p_error_message => 'Fondos insuficientes',
    p_now => c.queued_at + interval '1 day');

  perform pg_temp.chk(r.next_attempt_at = c.queued_at + interval '3 days',
    'y el siguiente intento es al día 3');

  -- Día 3: tercer intento.
  perform public.claim_recurring_charges('0f000000-0000-4000-8000-000000000001', 50, c.queued_at + interval '3 days');
  select * into r from public.record_recurring_charge_result(
    p_charge_id => c.id, p_provider_status => 'DECLINED',
    p_error_code => 'INSUFFICIENT_FUNDS', p_error_message => 'Fondos insuficientes',
    p_now => c.queued_at + interval '3 days');
  perform pg_temp.chk(r.next_attempt_at = c.queued_at + interval '7 days',
    'y el siguiente al día 7');

  -- Día 7: cuarto y último.
  perform public.claim_recurring_charges('0f000000-0000-4000-8000-000000000001', 50, c.queued_at + interval '7 days');
  select * into r from public.record_recurring_charge_result(
    p_charge_id => c.id, p_provider_status => 'DECLINED',
    p_error_code => 'INSUFFICIENT_FUNDS', p_error_message => 'Fondos insuficientes',
    p_now => c.queued_at + interval '7 days');

  perform pg_temp.chk(r.charge_status = 'exhausted' and not r.will_retry,
    'agotados los reintentos, el cobro se marca como agotado');

  select * into c from public.recurring_charges rc where rc.id = c.id;
  perform pg_temp.chk(c.attempt = 4 and c.notice_pending and c.notice_kind = 'retries_exhausted',
    'y queda marcado para avisarle al atleta');
  perform pg_temp.chk(
    (select count(*) from public.recurring_charge_attempts where charge_id = c.id) = 4,
    'el historial guarda los 4 intentos: es la prueba de cuántas veces se intentó');
  perform pg_temp.chk(
    (select status from public.payment_methods where athlete_id = 'af000000-0000-4000-8000-000000000004') = 'active',
    'el medio de pago sigue activo: no tuvo la culpa, fue la plata');

  -- Y no se vuelve a intentar nunca más por su cuenta.
  select count(*)::int into tomados
  from public.claim_recurring_charges('0f000000-0000-4000-8000-000000000001', 50, c.queued_at + interval '30 days');
  perform pg_temp.chk(tomados = 0,
    'un cobro agotado no se vuelve a intentar solo');
end $$;

-- ============================ 10 · Token revocado por el banco ==============
-- Esto NO se reintenta: reintentarlo no lo arregla. Se le pide al atleta que
-- vuelva a autorizar.
do $$
declare c public.recurring_charges%rowtype; r record; tomados int; v_prox timestamptz;
begin
  select * into c from public.recurring_charges rc
  where rc.invoice_id = '1f000000-0000-4000-8000-000000000005';

  -- Primero un rechazo que llega POR EL WEBHOOK: la pasarela marca la
  -- transacción como DECLINED y el intento de pago arrastra al cobro. Sin esto
  -- el cobro se quedaría en `processing` para siempre.
  perform public.apply_wompi_payment(
    p_event_id       => 'CHK-DEBITO-RECHAZO-WEBHOOK',
    p_transaction_id => '113636-1757100000-55550',
    p_reference      => c.reference,
    p_status         => 'DECLINED',
    p_amount_cents   => 18000000,
    p_method_type    => 'NEQUI');

  select * into c from public.recurring_charges rc where rc.id = c.id;
  perform pg_temp.chk(c.status = 'declined',
    'un rechazo que llega por el webhook deja el cobro rechazado y con reintento');
  perform pg_temp.chk(c.next_attempt_at > c.queued_at,
    'y con el siguiente intento programado hacia adelante');
  v_prox := c.next_attempt_at;

  select count(*)::int into tomados
  from public.claim_recurring_charges('0f000000-0000-4000-8000-000000000001', 50, v_prox);
  perform pg_temp.chk(tomados = 1, 'cuando llega la fecha, el reintento se toma');

  -- Y en el reintento el banco responde que el atleta desvinculó la cuenta.
  select * into r from public.record_recurring_charge_result(
    p_charge_id => c.id, p_provider_status => 'DECLINED',
    p_transaction_id => '113636-1757100000-55551',
    p_error_code => 'PAYMENT_SOURCE_REVOKED',
    p_error_message => 'El usuario canceló la suscripción desde Nequi',
    p_now => v_prox);

  perform pg_temp.chk(r.failure_kind = 'revoked_token' and not r.will_retry,
    'un token revocado por el banco NO se reintenta');
  perform pg_temp.chk(r.charge_status = 'failed' and r.next_attempt_at is null,
    'el cobro queda fallido, sin siguiente intento');

  select * into c from public.recurring_charges rc where rc.id = c.id;
  perform pg_temp.chk(c.notice_pending and c.notice_kind = 'needs_new_authorization',
    'y marcado para pedirle al atleta que vuelva a autorizar');
  perform pg_temp.chk(
    (select status from public.payment_methods where athlete_id = 'af000000-0000-4000-8000-000000000005') = 'revoked',
    'el medio de pago queda revocado: no se sigue golpeando a la pasarela con él');

  select count(*)::int into tomados
  from public.claim_recurring_charges('0f000000-0000-4000-8000-000000000001', 50, v_prox + interval '30 days');
  perform pg_temp.chk(tomados = 0,
    'y no se vuelve a intentar en ninguna corrida posterior');

  -- Ni el job lo vuelve a encolar: ya no hay método activo.
  perform public.charge_due_subscriptions(
    '0f000000-0000-4000-8000-000000000001', v_prox + interval '30 days');
  perform pg_temp.chk(
    (select count(*) from public.recurring_charges
     where invoice_id = '1f000000-0000-4000-8000-000000000005') = 1,
    'el job tampoco lo vuelve a encolar mientras no autorice de nuevo');
end $$;

-- ============================ 11 · La autorización es evidencia =============
do $$
declare tocar boolean; revivir boolean;
begin
  begin
    update public.recurring_authorizations
    set accepted_text = 'Autorizo cualquier cobro por cualquier valor y para siempre, sin límite.'
    where athlete_id = 'af000000-0000-4000-8000-000000000001';
    tocar := false;
  exception when check_violation then
    tocar := true;
  end;
  perform pg_temp.chk(tocar,
    'el texto que aceptó el atleta no se puede modificar después');

  begin
    update public.recurring_authorizations
    set revoked_at = null
    where athlete_id = 'af000000-0000-4000-8000-000000000003';
    revivir := false;
  exception when check_violation then
    revivir := true;
  end;
  perform pg_temp.chk(revivir,
    'una autorización revocada no se puede reactivar: hay que autorizar de nuevo');
end $$;

-- ============================ 12 · Aislamiento entre boxes ==================
do $$
declare r record;
begin
  perform pg_temp.chk(
    not exists (
      select 1 from public.recurring_charges
      where org_id <> '0f000000-0000-4000-8000-000000000001'),
    'el job de un box no encola cobros de otro');

  perform pg_temp.chk(
    not exists (
      select 1 from public.recurring_charges rc
      join public.payment_methods pm on pm.id = rc.payment_method_id
      where pm.org_id <> rc.org_id),
    'ningún cobro quedó atado al medio de pago de otro box');

  -- Ahora sí, el otro box corre su propio job.
  select * into r from public.charge_due_subscriptions(
    '0f000000-0000-4000-8000-000000000002', '2026-09-05 17:00:00+00');
  perform pg_temp.chk(r.charges_queued = 1,
    'el otro box encola su propio cobro sin tocar nada del primero');
  perform pg_temp.chk(
    (select count(*) from public.recurring_charges
     where org_id = '0f000000-0000-4000-8000-000000000002') = 1,
    'y solo el suyo');
end $$;

-- ============================ 13 · RLS ======================================
-- Los guardas de ruta deciden qué se pinta; esto decide a qué se accede.
set session role authenticated;

set request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000002';  -- el atleta 1
do $$ begin
  perform pg_temp.chk((select count(*) from public.payment_methods) = 1,
    'el atleta ve UN método de pago: el suyo');
  perform pg_temp.chk(
    (select athlete_id from public.payment_methods) = 'af000000-0000-4000-8000-000000000001',
    'y es exactamente el suyo');
  perform pg_temp.chk((select count(*) from public.recurring_authorizations) = 1,
    've su autorización y ninguna más');
  perform pg_temp.chk(
    not exists (select 1 from public.recurring_charges
                where athlete_id <> 'af000000-0000-4000-8000-000000000001'),
    'y no ve los cobros de ningún compañero');
  perform pg_temp.chk((select count(*) from public.recurring_charge_attempts) >= 1,
    've el historial de sus propios intentos');
end $$;

set request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000004';  -- coach sin finanzas
do $$ begin
  perform pg_temp.chk((select count(*) from public.payment_methods) = 0,
    'un coach sin permiso financiero NO ve medios de pago');
  perform pg_temp.chk((select count(*) from public.recurring_charges) = 0,
    'ni los cobros automáticos del box');
end $$;

set request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000003';  -- dueño del otro box
do $$ begin
  perform pg_temp.chk((select count(*) from public.payment_methods) = 1,
    'el dueño del otro box ve solo el método de su propio atleta');
  perform pg_temp.chk(
    not exists (select 1 from public.payment_methods
                where org_id = '0f000000-0000-4000-8000-000000000001'),
    'y ninguno del primer box');
end $$;

set request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001';  -- dueño del box
do $$ begin
  perform pg_temp.chk((select count(*) from public.payment_methods) = 7,
    'el dueño ve los 7 medios de pago de su box');
  perform pg_temp.chk(
    not exists (select 1 from public.payment_methods
                where org_id = '0f000000-0000-4000-8000-000000000002'),
    'y ninguno del otro box');
end $$;

-- Revocar es UN TOQUE, y lo hace el propio atleta desde su pantalla.
set request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000002';  -- el atleta 1
do $$
declare tocadas int;
begin
  update public.recurring_authorizations
  set revoked_at = now(), revoke_reason = 'Prefiero pagar yo'
  where athlete_id = 'af000000-0000-4000-8000-000000000001' and revoked_at is null;
  get diagnostics tocadas = row_count;
  perform pg_temp.chk(tocadas = 1,
    'el atleta revoca su propia autorización con una sola escritura');

  update public.recurring_authorizations
  set revoked_at = now()
  where athlete_id = 'af000000-0000-4000-8000-000000000004' and revoked_at is null;
  get diagnostics tocadas = row_count;
  perform pg_temp.chk(tocadas = 0,
    'y no puede revocar la de otro atleta: la RLS no le enseña esa fila');
end $$;

reset role;
reset request.jwt.claim.sub;

do $$ begin
  perform pg_temp.chk(
    (select status from public.payment_methods
     where athlete_id = 'af000000-0000-4000-8000-000000000001') = 'revoked',
    'la revocación del atleta desactivó su medio de pago');
  perform pg_temp.chk(
    (select revoked_at is not null from public.recurring_authorizations
     where athlete_id = 'af000000-0000-4000-8000-000000000004') = false,
    'y la del otro atleta sigue intacta');
end $$;

rollback;

select 'DÉBITO RECURRENTE OK' as resultado;
