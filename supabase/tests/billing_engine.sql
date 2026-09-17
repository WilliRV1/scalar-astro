-- =============================================================================
-- Prueba del motor de cobros
-- =============================================================================
-- Un error aquí se traduce en cobrarle dos veces a un atleta, o no cobrarle
-- nunca. Es lo que hace que un box cancele el servicio, así que se prueba con
-- fechas fijas y casos límite reales.
-- =============================================================================

begin;

insert into public.organizations (id, slug, name, timezone, status, settings) values
  ('0c000000-0000-4000-8000-000000000001', 'box-cobros', 'Box Cobros', 'America/Bogota', 'active', '{"grace_days": 3}');

insert into public.athletes (id, org_id, first_name) values
  ('ac000000-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-000000000001', 'Corte5'),
  ('ac000000-0000-4000-8000-000000000002', '0c000000-0000-4000-8000-000000000001', 'Corte31'),
  ('ac000000-0000-4000-8000-000000000003', '0c000000-0000-4000-8000-000000000001', 'Congelado'),
  ('ac000000-0000-4000-8000-000000000004', '0c000000-0000-4000-8000-000000000001', 'Cancelado'),
  ('ac000000-0000-4000-8000-000000000005', '0c000000-0000-4000-8000-000000000001', 'Vencido'),
  ('ac000000-0000-4000-8000-000000000006', '0c000000-0000-4000-8000-000000000001', 'ConDescuento');

insert into public.plans (id, org_id, name, price_cents, billing_period) values
  ('9c000000-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-000000000001', 'Mensualidad', 18000000, 'monthly'),
  ('9c000000-0000-4000-8000-000000000002', '0c000000-0000-4000-8000-000000000001', 'Trimestre',   48000000, 'quarterly');

insert into public.subscriptions (id, org_id, athlete_id, plan_id, price_cents, discount_cents, billing_day, started_on, status, paused_from, paused_until, ends_on) values
  ('5c000000-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000001', '9c000000-0000-4000-8000-000000000001', 18000000, 0, 5,  '2025-01-01', 'active',    null, null, null),
  ('5c000000-0000-4000-8000-000000000002', '0c000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000002', '9c000000-0000-4000-8000-000000000001', 18000000, 0, 31, '2025-01-01', 'active',    null, null, null),
  ('5c000000-0000-4000-8000-000000000003', '0c000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000003', '9c000000-0000-4000-8000-000000000001', 18000000, 0, 5,  '2025-01-01', 'active',    '2026-02-01', '2026-12-01', null),
  ('5c000000-0000-4000-8000-000000000004', '0c000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000004', '9c000000-0000-4000-8000-000000000001', 18000000, 0, 5,  '2025-01-01', 'cancelled', null, null, null),
  ('5c000000-0000-4000-8000-000000000005', '0c000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000005', '9c000000-0000-4000-8000-000000000001', 18000000, 0, 5,  '2025-01-01', 'active',    null, null, '2025-06-30'),
  ('5c000000-0000-4000-8000-000000000006', '0c000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000006', '9c000000-0000-4000-8000-000000000002', 48000000, 8000000, 5, '2025-01-01', 'active', null, null, null);

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

-- ============================ 1 · Día de corte normal =======================
-- 5 de marzo de 2026, mediodía en Bogotá
do $$
declare creadas int;
begin
  select sum(invoices_created) into creadas
  from public.generate_invoices('0c000000-0000-4000-8000-000000000001', '2026-03-05 17:00:00+00');

  perform pg_temp.chk(creadas = 2,
    'cobra a los 2 atletas con corte el 5 (y a nadie más)');
  perform pg_temp.chk(
    exists (select 1 from public.invoices where subscription_id = '5c000000-0000-4000-8000-000000000001'),
    'el atleta con corte el 5 recibe su cobro');
  perform pg_temp.chk(
    not exists (select 1 from public.invoices where subscription_id = '5c000000-0000-4000-8000-000000000003'),
    'una suscripción CONGELADA no genera cobro');
  perform pg_temp.chk(
    not exists (select 1 from public.invoices where subscription_id = '5c000000-0000-4000-8000-000000000004'),
    'una suscripción cancelada no genera cobro');
  perform pg_temp.chk(
    not exists (select 1 from public.invoices where subscription_id = '5c000000-0000-4000-8000-000000000005'),
    'una suscripción terminada no genera cobro');
end $$;

-- ============================ 2 · Idempotencia ==============================
do $$
declare antes bigint; despues bigint; creadas int;
begin
  select count(*) into antes from public.invoices;
  select sum(invoices_created) into creadas
  from public.generate_invoices('0c000000-0000-4000-8000-000000000001', '2026-03-05 17:00:00+00');
  select count(*) into despues from public.invoices;

  perform pg_temp.chk(antes = despues and creadas = 0,
    'correr el job dos veces el mismo día NO duplica el cobro');
end $$;

-- ============================ 3 · Importes ==================================
do $$
declare inv public.invoices%rowtype;
begin
  select * into inv from public.invoices where subscription_id = '5c000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(inv.amount_cents = 18000000, 'el importe es el precio de la suscripción');
  perform pg_temp.chk(inv.due_on = '2026-03-08', 'el vencimiento respeta los 3 días de gracia del box');
  perform pg_temp.chk(inv.period_start = '2026-03-05' and inv.period_end = '2026-04-04',
    'el periodo mensual va del 5 al 4 del mes siguiente');

  select * into inv from public.invoices where subscription_id = '5c000000-0000-4000-8000-000000000006';
  perform pg_temp.chk(inv.amount_cents = 40000000, 'el descuento se resta del importe (480.000 - 80.000)');
  perform pg_temp.chk(inv.period_end = '2026-06-04', 'el periodo trimestral dura 3 meses');
end $$;

-- ============================ 4 · Fin de mes ================================
-- El caso que se olvida siempre: corte el 31 en un mes que no tiene 31.
do $$
declare creadas int;
begin
  select sum(invoices_created) into creadas
  from public.generate_invoices('0c000000-0000-4000-8000-000000000001', '2026-02-28 17:00:00+00');
  perform pg_temp.chk(creadas = 1,
    'un corte el 31 SÍ se cobra el 28 de febrero, no se salta el mes');

  select sum(invoices_created) into creadas
  from public.generate_invoices('0c000000-0000-4000-8000-000000000001', '2026-02-27 17:00:00+00');
  perform pg_temp.chk(creadas = 0,
    'y no se cobra dos veces el 27');

  select sum(invoices_created) into creadas
  from public.generate_invoices('0c000000-0000-4000-8000-000000000001', '2026-01-31 17:00:00+00');
  perform pg_temp.chk(creadas = 1,
    'en un mes con 31 días se cobra el 31');
end $$;

-- ============================ 5 · Zona horaria ==============================
-- 2026-04-06 02:00 UTC son las 21:00 del 5 de abril en Bogotá. El cobro
-- pertenece al día 5 del box, no al 6 de UTC. Sin esto todos los cobros salen
-- corridos un día y el box lo nota de inmediato.
do $$
declare r record;
begin
  select * into r from public.generate_invoices('0c000000-0000-4000-8000-000000000001', '2026-04-06 02:00:00+00');
  perform pg_temp.chk(r.run_date = '2026-04-05',
    'a las 02:00 UTC el job cobra el día 5 de Bogotá, no el 6 de UTC');
  perform pg_temp.chk(r.invoices_created = 2,
    'y cobra a los atletas con corte el 5');
end $$;

-- ============================ 6 · Consecutivo ===============================
do $$
declare numeros text[]; repetidos int;
begin
  select array_agg(number order by number) into numeros from public.invoices;
  select count(*) - count(distinct number) into repetidos from public.invoices;

  perform pg_temp.chk(repetidos = 0, 'no hay dos facturas con el mismo número');
  perform pg_temp.chk(
    (select count(*) from public.invoices) = (select invoice_seq from public.org_counters
                                              where org_id = '0c000000-0000-4000-8000-000000000001'),
    'el consecutivo no deja huecos cuando el job se repite');
end $$;

-- ============================ 7 · Mora ======================================
do $$
declare r record;
begin
  select * into r from public.mark_overdue('2026-03-20 17:00:00+00');
  perform pg_temp.chk(r.invoices_marked >= 2, 'las facturas vencidas pasan a overdue');
  perform pg_temp.chk(
    (select status from public.athletes where id = 'ac000000-0000-4000-8000-000000000001') = 'overdue',
    'el atleta con factura vencida queda marcado en mora');
end $$;

-- ============================ 8 · Aislamiento del job =======================
do $$
declare otros bigint;
begin
  select count(*) into otros from public.invoices
  where org_id <> '0c000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(otros = 0,
    'el job de un box no toca los cobros de otro');
end $$;

rollback;

select 'MOTOR DE COBROS OK' as resultado;
