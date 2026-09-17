-- =============================================================================
-- Prueba del cobro en línea con Wompi
-- =============================================================================
-- Wompi REINTENTA la entrega de sus eventos hasta recibir un 200. Un fallo aquí
-- significa cobrarle dos veces a un atleta o dejar una factura sin saldar con
-- la plata ya en la cuenta del box: los dos son motivo de cancelación
-- inmediata del servicio. Por eso la idempotencia se prueba primero.
--
-- Estas pruebas NO tocan Wompi: ejercitan apply_wompi_payment con cuerpos de
-- evento con la forma que documenta docs.wompi.co (Eventos). La verificación de
-- la firma vive en la Edge Function y aquí se da por hecha.
-- =============================================================================

begin;

insert into public.organizations (id, slug, name, timezone, status) values
  ('0d000000-0000-4000-8000-000000000001', 'box-wompi-a', 'Box Wompi A', 'America/Bogota', 'active'),
  ('0d000000-0000-4000-8000-000000000002', 'box-wompi-b', 'Box Wompi B', 'America/Bogota', 'active');

insert into public.athletes (id, org_id, first_name) values
  ('ad000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001', 'Aprobado'),
  ('ad000000-0000-4000-8000-000000000002', '0d000000-0000-4000-8000-000000000001', 'Parcial'),
  ('ad000000-0000-4000-8000-000000000003', '0d000000-0000-4000-8000-000000000001', 'Rechazado'),
  ('ad000000-0000-4000-8000-000000000004', '0d000000-0000-4000-8000-000000000002', 'DelOtroBox');

-- Facturas de 180.000 COP = 18.000.000 centavos
insert into public.invoices (id, org_id, athlete_id, number, period_start, period_end, due_on, amount_cents) values
  ('1d000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001', 'F-000001', '2026-09-05', '2026-10-04', '2026-09-08', 18000000),
  ('1d000000-0000-4000-8000-000000000002', '0d000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000002', 'F-000002', '2026-09-05', '2026-10-04', '2026-09-08', 18000000),
  ('1d000000-0000-4000-8000-000000000003', '0d000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000003', 'F-000003', '2026-09-05', '2026-10-04', '2026-09-08', 18000000),
  ('1d000000-0000-4000-8000-000000000004', '0d000000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000004', 'F-000001', '2026-09-05', '2026-10-04', '2026-09-08', 18000000);

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

-- ============================ 0 · Abrir el intento ==========================
do $$
declare r record; r2 record;
begin
  select * into r from public.open_payment_intent(
    '1d000000-0000-4000-8000-000000000001', 'SCL-0D000001-F000001-AAAA1111');

  perform pg_temp.chk(r.amount_cents = 18000000,
    'el intento se abre por el saldo pendiente de la factura');
  perform pg_temp.chk(r.org_id = '0d000000-0000-4000-8000-000000000001'
                  and r.athlete_id = 'ad000000-0000-4000-8000-000000000001',
    'el intento hereda el box y el atleta de la factura');
  perform pg_temp.chk(r.currency = 'COP', 'la moneda es la del box');
  perform pg_temp.chk(not r.reused, 'el primer intento es nuevo');

  -- Pedir el enlace dos veces no debe crear dos referencias: Wompi no admite
  -- reutilizar una referencia ya completada, y dos enlaces vivos confunden al
  -- atleta.
  select * into r2 from public.open_payment_intent(
    '1d000000-0000-4000-8000-000000000001', 'SCL-0D000001-F000001-BBBB2222');
  perform pg_temp.chk(r2.reused and r2.intent_id = r.intent_id
                  and r2.reference = 'SCL-0D000001-F000001-AAAA1111',
    'pedir el enlace dos veces reutiliza el intento vivo');
end $$;

-- ============================ 1 · Idempotencia ==============================
-- LA prueba de esta migración: Wompi reintenta, el pago se registra UNA vez.
do $$
declare r1 record; r2 record; pagos int; inv public.invoices%rowtype;
begin
  select * into r1 from public.apply_wompi_payment(
    p_event_id       => 'CHK-APROBADO-0001',
    p_transaction_id => '113636-1735689600-12345',
    p_reference      => 'SCL-0D000001-F000001-AAAA1111',
    p_status         => 'APPROVED',
    p_amount_cents   => 18000000,
    p_method_type    => 'NEQUI');

  -- Entrega repetida, byte por byte idéntica.
  select * into r2 from public.apply_wompi_payment(
    p_event_id       => 'CHK-APROBADO-0001',
    p_transaction_id => '113636-1735689600-12345',
    p_reference      => 'SCL-0D000001-F000001-AAAA1111',
    p_status         => 'APPROVED',
    p_amount_cents   => 18000000,
    p_method_type    => 'NEQUI');

  select count(*)::int into pagos from public.payments
  where provider = 'wompi' and provider_ref = '113636-1735689600-12345';

  perform pg_temp.chk(r1.resultado = 'pago_registrado', 'la primera entrega registra el pago');
  perform pg_temp.chk(r2.resultado = 'evento_duplicado', 'la segunda entrega se reconoce como duplicada');
  perform pg_temp.chk(pagos = 1, 'un webhook entregado dos veces registra UN SOLO pago');

  select * into inv from public.invoices where id = '1d000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(inv.paid_cents = 18000000,
    'y el saldo no se duplica (el trigger no suma dos veces)');
end $$;

-- ============================ 2 · Reenvío con otro checksum =================
-- El segundo candado: si Wompi reenvía el MISMO pago dentro de un evento
-- distinto (otro timestamp => otro checksum), el índice único
-- (provider, provider_ref) de `payments` lo detiene igual.
do $$
declare r record; pagos int;
begin
  select * into r from public.apply_wompi_payment(
    p_event_id       => 'CHK-APROBADO-0001-REENVIO',
    p_transaction_id => '113636-1735689600-12345',
    p_reference      => 'SCL-0D000001-F000001-AAAA1111',
    p_status         => 'APPROVED',
    p_amount_cents   => 18000000,
    p_method_type    => 'NEQUI');

  select count(*)::int into pagos from public.payments
  where provider = 'wompi' and provider_ref = '113636-1735689600-12345';

  perform pg_temp.chk(r.resultado = 'pago_duplicado',
    'el mismo pago dentro de otro evento no se vuelve a registrar');
  perform pg_temp.chk(pagos = 1, 'sigue habiendo un solo pago para esa transacción');
end $$;

-- ============================ 3 · Pago aprobado salda ========================
do $$
declare inv public.invoices%rowtype; pago public.payments%rowtype; pi public.payment_intents%rowtype;
begin
  select * into inv from public.invoices where id = '1d000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(inv.status = 'paid', 'un pago aprobado deja la factura en paid');
  perform pg_temp.chk(inv.paid_cents = inv.amount_cents, 'y con el saldo cubierto');

  select * into pago from public.payments where provider_ref = '113636-1735689600-12345';
  perform pg_temp.chk(pago.method = 'nequi', 'NEQUI se traduce al método nequi');
  perform pg_temp.chk(pago.provider = 'wompi', 'el pago queda marcado como de Wompi');
  perform pg_temp.chk(pago.status = 'confirmed', 'el pago entra confirmado');
  perform pg_temp.chk(pago.org_id = '0d000000-0000-4000-8000-000000000001',
    'el pago se abona al box del intento, no al que diga el evento');

  select * into pi from public.payment_intents where reference = 'SCL-0D000001-F000001-AAAA1111';
  perform pg_temp.chk(pi.status = 'approved', 'el intento queda aprobado');
  perform pg_temp.chk(pi.provider_transaction_id = '113636-1735689600-12345',
    'el intento guarda la transacción de Wompi');
end $$;

-- ============================ 4 · Pago parcial ==============================
-- El atleta abona 100.000 de 180.000. La factura NO puede quedar en paid.
do $$
declare r record; inv public.invoices%rowtype;
begin
  perform public.open_payment_intent(
    '1d000000-0000-4000-8000-000000000002', 'SCL-0D000001-F000002-CCCC3333');

  select * into r from public.apply_wompi_payment(
    p_event_id       => 'CHK-PARCIAL-0001',
    p_transaction_id => '113636-1735689600-22222',
    p_reference      => 'SCL-0D000001-F000002-CCCC3333',
    p_status         => 'APPROVED',
    p_amount_cents   => 10000000,
    p_method_type    => 'PSE');

  select * into inv from public.invoices where id = '1d000000-0000-4000-8000-000000000002';

  perform pg_temp.chk(r.resultado = 'pago_registrado', 'el abono parcial se registra');
  perform pg_temp.chk(inv.paid_cents = 10000000, 'el saldo abonado es el del evento');
  perform pg_temp.chk(inv.status = 'partial', 'un pago parcial deja la factura en partial');
  perform pg_temp.chk(
    (select method from public.payments where provider_ref = '113636-1735689600-22222') = 'pse',
    'PSE se traduce al método pse');
end $$;

-- ============================ 5 · Evento rechazado ==========================
do $$
declare r record; inv public.invoices%rowtype; pagos int; pi public.payment_intents%rowtype;
begin
  perform public.open_payment_intent(
    '1d000000-0000-4000-8000-000000000003', 'SCL-0D000001-F000003-DDDD4444');

  select * into r from public.apply_wompi_payment(
    p_event_id       => 'CHK-RECHAZADO-0001',
    p_transaction_id => '113636-1735689600-33333',
    p_reference      => 'SCL-0D000001-F000003-DDDD4444',
    p_status         => 'DECLINED',
    p_amount_cents   => 18000000,
    p_method_type    => 'CARD');

  select count(*)::int into pagos from public.payments
  where provider_ref = '113636-1735689600-33333';
  select * into inv from public.invoices where id = '1d000000-0000-4000-8000-000000000003';
  select * into pi from public.payment_intents where reference = 'SCL-0D000001-F000003-DDDD4444';

  perform pg_temp.chk(r.resultado = 'sin_pago', 'un evento declined no produce pago');
  perform pg_temp.chk(pagos = 0, 'y no aparece ninguna fila en payments');
  perform pg_temp.chk(inv.paid_cents = 0 and inv.status = 'open',
    'la factura sigue abierta y sin abonos');
  perform pg_temp.chk(pi.status = 'declined', 'el intento queda rechazado');
end $$;

-- ============================ 6 · Eventos no finales ========================
do $$
declare r record; pi public.payment_intents%rowtype;
begin
  -- PENDING: PSE y Nequi pasan por aquí antes de resolverse.
  select * into r from public.apply_wompi_payment(
    p_event_id       => 'CHK-PENDIENTE-0001',
    p_transaction_id => '113636-1735689600-44444',
    p_reference      => 'SCL-0D000001-F000003-DDDD4444',
    p_status         => 'PENDING',
    p_amount_cents   => 18000000,
    p_method_type    => 'PSE');
  perform pg_temp.chk(r.resultado = 'sin_pago', 'un evento pending tampoco produce pago');

  -- Un evento tardío no puede degradar un intento ya aprobado.
  perform public.apply_wompi_payment(
    p_event_id       => 'CHK-TARDIO-0001',
    p_transaction_id => '113636-1735689600-12345',
    p_reference      => 'SCL-0D000001-F000001-AAAA1111',
    p_status         => 'PENDING',
    p_amount_cents   => 18000000,
    p_method_type    => 'NEQUI');
  select * into pi from public.payment_intents where reference = 'SCL-0D000001-F000001-AAAA1111';
  perform pg_temp.chk(pi.status = 'approved',
    'un evento tardío no degrada un intento ya aprobado');

  -- Referencia que no emitimos nosotros: se registra y se ignora, no se falla.
  select * into r from public.apply_wompi_payment(
    p_event_id       => 'CHK-DESCONOCIDO-0001',
    p_transaction_id => '113636-1735689600-55555',
    p_reference      => 'REFERENCIA-QUE-NO-EMITIMOS',
    p_status         => 'APPROVED',
    p_amount_cents   => 18000000);
  perform pg_temp.chk(r.resultado = 'referencia_desconocida',
    'una referencia ajena no revienta el webhook, se ignora');
  perform pg_temp.chk(
    (select status from public.webhook_events where event_id = 'CHK-DESCONOCIDO-0001') = 'ignored',
    'y queda registrada en la bitácora como ignorada');
end $$;

-- ============================ 7 · Aislamiento entre boxes ===================
do $$
declare invA public.invoices%rowtype; invB public.invoices%rowtype; ajenos int;
begin
  perform public.open_payment_intent(
    '1d000000-0000-4000-8000-000000000004', 'SCL-0D000002-F000001-EEEE5555');

  perform public.apply_wompi_payment(
    p_event_id       => 'CHK-BOX-B-0001',
    p_transaction_id => '113636-1735689600-66666',
    p_reference      => 'SCL-0D000002-F000001-EEEE5555',
    p_status         => 'APPROVED',
    p_amount_cents   => 18000000,
    p_method_type    => 'BANCOLOMBIA_COLLECT');

  select * into invB from public.invoices where id = '1d000000-0000-4000-8000-000000000004';
  perform pg_temp.chk(invB.status = 'paid', 'el pago del box B salda la factura del box B');
  perform pg_temp.chk(
    (select method from public.payments where provider_ref = '113636-1735689600-66666') = 'cash',
    'un pago en corresponsal bancario se registra como efectivo');

  -- Las facturas del box A no se movieron por un evento del box B.
  select * into invA from public.invoices where id = '1d000000-0000-4000-8000-000000000002';
  perform pg_temp.chk(invA.paid_cents = 10000000 and invA.status = 'partial',
    'un evento de un box no altera las facturas de otro');

  select count(*)::int into ajenos
  from public.payments p
  join public.payment_intents pi on pi.reference = p.reference
  where p.org_id <> pi.org_id;
  perform pg_temp.chk(ajenos = 0, 'ningún pago quedó abonado a un box distinto al de su intento');
end $$;

-- ============================ 8 · Referencia única por box ==================
do $$
declare fallo boolean;
begin
  -- Misma referencia, mismo box: prohibido.
  begin
    insert into public.payment_intents (org_id, invoice_id, athlete_id, amount_cents, reference)
    values ('0d000000-0000-4000-8000-000000000001', '1d000000-0000-4000-8000-000000000003',
            'ad000000-0000-4000-8000-000000000003', 100, 'SCL-0D000001-F000001-AAAA1111');
    fallo := false;
  exception when unique_violation then
    fallo := true;
  end;
  perform pg_temp.chk(fallo, 'la referencia no se puede repetir dentro del mismo box');

  -- Misma referencia, otro box: permitido (son dos comercios distintos en Wompi).
  insert into public.payment_intents (org_id, invoice_id, athlete_id, amount_cents, reference)
  values ('0d000000-0000-4000-8000-000000000002', '1d000000-0000-4000-8000-000000000004',
          'ad000000-0000-4000-8000-000000000004', 100, 'SCL-0D000001-F000001-AAAA1111');
  perform pg_temp.chk(
    (select count(*) from public.payment_intents
     where reference = 'SCL-0D000001-F000001-AAAA1111') = 2,
    'la misma referencia sí puede existir en otro box');

  -- Y si eso pasa, el webhook falla ruidosamente en vez de abonarle al que no es.
  begin
    perform public.apply_wompi_payment(
      p_event_id       => 'CHK-AMBIGUO-0001',
      p_transaction_id => '113636-1735689600-77777',
      p_reference      => 'SCL-0D000001-F000001-AAAA1111',
      p_status         => 'APPROVED',
      p_amount_cents   => 100);
    fallo := false;
  exception when unique_violation then
    fallo := true;
  end;
  perform pg_temp.chk(fallo,
    'una referencia ambigua entre boxes falla en vez de abonarle al box equivocado');
end $$;

-- ============================ 9 · Guardas de open_payment_intent ============
do $$
declare saldada boolean; anulada boolean;
begin
  begin
    perform public.open_payment_intent(
      '1d000000-0000-4000-8000-000000000001', 'SCL-0D000001-F000001-FFFF6666');
    saldada := false;
  exception when check_violation then
    saldada := true;
  end;
  perform pg_temp.chk(saldada, 'no se emite enlace de pago para una factura ya saldada');

  update public.invoices set status = 'void' where id = '1d000000-0000-4000-8000-000000000003';
  begin
    perform public.open_payment_intent(
      '1d000000-0000-4000-8000-000000000003', 'SCL-0D000001-F000003-GGGG7777');
    anulada := false;
  exception when check_violation then
    anulada := true;
  end;
  perform pg_temp.chk(anulada, 'no se emite enlace de pago para una factura anulada');
end $$;

-- ============================ 10 · Bitácora de eventos ======================
do $$
begin
  perform pg_temp.chk(
    (select count(*) from public.webhook_events where event_id = 'CHK-APROBADO-0001') = 1,
    'cada evento queda registrado una sola vez en webhook_events');
  perform pg_temp.chk(
    (select org_id from public.webhook_events where event_id = 'CHK-APROBADO-0001')
      = '0d000000-0000-4000-8000-000000000001',
    'el evento queda atribuido al box correcto');
  perform pg_temp.chk(
    not exists (select 1 from public.webhook_events where status = 'received'),
    'no quedan eventos a medio procesar');
end $$;

rollback;

select 'COBRO EN LÍNEA WOMPI OK' as resultado;
