-- =============================================================================
-- Prueba de los totales calculados en la base (TOTALES)
-- =============================================================================
-- Lo que se comprueba es lo que el navegador ya no puede garantizar: que el
-- total incluya TODAS las filas aunque la lista traiga solo las primeras 200 o
-- 300; que "hoy" y "este mes" sean los del box y no los de UTC; y que un
-- usuario de otro box, o un coach sin permiso financiero, reciba ceros.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- semilla ---
insert into auth.users (id, email) values
  ('71000000-0000-4000-8000-000000000001', 'dueno@boxtotales.co'),
  ('71000000-0000-4000-8000-000000000002', 'coach@boxtotales.co'),
  ('71000000-0000-4000-8000-000000000003', 'dueno@boxotro.co');

insert into public.organizations (id, slug, name, timezone) values
  ('70000000-0000-4000-8000-000000000001', 'box-totales', 'Box Totales', 'America/Bogota'),
  ('70000000-0000-4000-8000-000000000002', 'box-otro',    'Box Otro',    'America/Bogota');

insert into public.memberships (org_id, user_id, role, permissions, athlete_id) values
  ('70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'owner', '{}', null),
  ('70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 'coach', '{}', null),
  ('70000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000003', 'owner', '{}', null);

insert into public.athletes (id, org_id, first_name) values
  ('72000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'Muchos'),
  ('72000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'Otro');

-- 251 cobros abiertos: más que los 200 que trae la lista. Con "hoy" =
-- 2026-09-15 en Bogotá quedan así:
--   porVencer  100 × 10.000 (vence el 20) + 1 × 7.000 (vence hoy) = 1.007.000
--   reciente    60 × (20.000 - 5.000 pagados) (vence el 10)      =   900.000
--   seria       50 × 30.000 (venció el 25 de agosto)              = 1.500.000
--   critica     40 × 40.000 (venció el 1 de julio)                = 1.600.000
insert into public.invoices (org_id, athlete_id, number, period_start, period_end, due_on, amount_cents, paid_cents, status)
select '70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
       'PV-' || g, '2026-09-01', '2026-09-30', '2026-09-20', 10000, 0, 'open'
from generate_series(1, 100) g;
insert into public.invoices (org_id, athlete_id, number, period_start, period_end, due_on, amount_cents, paid_cents, status) values
  ('70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
   'HOY-1', '2026-09-01', '2026-09-30', '2026-09-15', 7000, 0, 'open');
insert into public.invoices (org_id, athlete_id, number, period_start, period_end, due_on, amount_cents, paid_cents, status)
select '70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
       'RE-' || g, '2026-09-01', '2026-09-30', '2026-09-10', 20000, 5000, 'partial'
from generate_series(1, 60) g;
insert into public.invoices (org_id, athlete_id, number, period_start, period_end, due_on, amount_cents, paid_cents, status)
select '70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
       'SE-' || g, '2026-08-01', '2026-08-31', '2026-08-25', 30000, 0, 'overdue'
from generate_series(1, 50) g;
insert into public.invoices (org_id, athlete_id, number, period_start, period_end, due_on, amount_cents, paid_cents, status)
select '70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
       'CR-' || g, '2026-06-01', '2026-06-30', '2026-07-01', 40000, 0, 'overdue'
from generate_series(1, 40) g;
-- Pagado y anulado: no cuentan, aunque venzan hace meses.
insert into public.invoices (org_id, athlete_id, number, period_start, period_end, due_on, amount_cents, paid_cents, status) values
  ('70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
   'PAGADO-1', '2026-05-01', '2026-05-31', '2026-05-05', 90000, 90000, 'paid'),
  ('70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
   'VOID-1',   '2026-05-01', '2026-05-31', '2026-05-05', 90000, 0,     'void');
-- El otro box tiene lo suyo.
insert into public.invoices (org_id, athlete_id, number, period_start, period_end, due_on, amount_cents, paid_cents, status)
select '70000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002',
       'OT-' || g, '2026-09-01', '2026-09-30', '2026-09-01', 50000, 0, 'open'
from generate_series(1, 3) g;

-- Pagos de septiembre (en Bogotá), para el recaudo del mes:
--   confirmados dentro del mes: 18.000 + 22.000
--   confirmado el 1 de octubre a las 03:00 UTC = 30 de sep 22:00 Bogotá: 1.000 (cuenta)
--   confirmado el 1 de sep a las 02:00 UTC = 31 de ago 21:00 Bogotá: 99.000 (NO cuenta)
--   pendiente dentro del mes: 5.000 (NO cuenta)
insert into public.payments (org_id, athlete_id, amount_cents, method, paid_at, status) values
  ('70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 18000, 'nequi', '2026-09-03 15:00:00+00', 'confirmed'),
  ('70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 22000, 'cash',  '2026-09-10 15:00:00+00', 'confirmed'),
  ('70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',  1000, 'cash',  '2026-10-01 03:00:00+00', 'confirmed'),
  ('70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 99000, 'cash',  '2026-09-01 02:00:00+00', 'confirmed'),
  ('70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',  5000, 'cash',  '2026-09-12 15:00:00+00', 'pending');

-- 350 gastos de septiembre: más que los 300 que trae la lista.
--   Servicios   200 × 1.000, pagados            = 200.000
--   Nómina      100 × 3.000, sin pagar          = 300.000
--   sin categoría 50 × 100, pagados             =   5.000
insert into public.expense_categories (id, org_id, name, kind) values
  ('73000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'Servicios', 'operational'),
  ('73000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', 'Nómina',    'payroll');
insert into public.expenses (org_id, category_id, description, amount_cents, incurred_on, paid_on)
select '70000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001',
       'Servicio ' || g, 1000, '2026-09-05', '2026-09-05'
from generate_series(1, 200) g;
insert into public.expenses (org_id, category_id, description, amount_cents, incurred_on, paid_on)
select '70000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000002',
       'Nómina ' || g, 3000, '2026-09-15', null
from generate_series(1, 100) g;
insert into public.expenses (org_id, category_id, description, amount_cents, incurred_on, paid_on)
select '70000000-0000-4000-8000-000000000001', null,
       'Suelto ' || g, 100, '2026-09-28', '2026-09-28'
from generate_series(1, 50) g;
-- Fuera del periodo, y la plantilla recurrente: ninguno cuenta.
insert into public.expenses (org_id, description, amount_cents, incurred_on, paid_on) values
  ('70000000-0000-4000-8000-000000000001', 'Agosto',  777000, '2026-08-31', '2026-08-31'),
  ('70000000-0000-4000-8000-000000000001', 'Octubre', 888000, '2026-10-01', null);
insert into public.expenses (org_id, description, amount_cents, incurred_on, is_recurring, recurrence, next_due_on) values
  ('70000000-0000-4000-8000-000000000001', 'Arriendo (plantilla)', 999999, '2026-09-01', true, 'monthly', '2026-10-01');
insert into public.expenses (org_id, description, amount_cents, incurred_on, paid_on) values
  ('70000000-0000-4000-8000-000000000002', 'Del otro box', 77000, '2026-09-10', null);

-- ------------------------------------------------------------- utilidades ---
create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  -- coalesce a propósito: una aserción que dé NULL es un fallo, no un "pasa".
  if not coalesce(cond, false) then
    raise exception 'FALLO [%] (la condición dio %)', label, coalesce(cond::text, 'NULL');
  end if;
  raise notice '  ok · %', label;
end $$;

set session role authenticated;

-- ============================ 1 · Cartera completa, más allá de la lista =====
set request.jwt.claim.sub = '71000000-0000-4000-8000-000000000001';  -- dueño
do $$
declare
  v_pendiente bigint;
  v_cobros int;
  v_mora bigint;
  v_en_mora int;
begin
  select sum(saldo_cents), sum(cobros) into v_pendiente, v_cobros
  from public.cartera_totales('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00');
  perform pg_temp.chk(v_cobros = 251, 'TOTALES · cuenta los 251 cobros abiertos, no solo los 200 de la lista');
  perform pg_temp.chk(v_pendiente = 5007000, 'el saldo por cobrar suma todas las filas (5.007.000)');

  select sum(saldo_cents), sum(cobros) into v_mora, v_en_mora
  from public.cartera_totales('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00')
  where tramo <> 'porVencer';
  perform pg_temp.chk(v_mora = 4000000 and v_en_mora = 150, 'lo vencido son 150 cobros por 4.000.000');

  perform pg_temp.chk(
    (select count(*) from public.cartera_totales('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00')) = 4,
    'devuelve siempre los 4 tramos');
  perform pg_temp.chk(
    (select saldo_cents from public.cartera_totales('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00') where tramo = 'porVencer') = 1007000,
    'por vencer: 1.007.000 (incluye el que vence hoy)');
  perform pg_temp.chk(
    (select saldo_cents from public.cartera_totales('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00') where tramo = 'reciente') = 900000,
    'reciente (1-7 días): 900.000, descontando lo ya abonado');
  perform pg_temp.chk(
    (select saldo_cents from public.cartera_totales('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00') where tramo = 'seria') = 1500000,
    'seria (8-30 días): 1.500.000');
  perform pg_temp.chk(
    (select saldo_cents from public.cartera_totales('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00') where tramo = 'critica') = 1600000,
    'crítica (más de 30 días): 1.600.000');
  perform pg_temp.chk(
    (select array_agg(tramo order by tramo) from public.cartera_totales('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00'))
      = array['critica', 'porVencer', 'reciente', 'seria'],
    'los nombres de los tramos son los que usa el tablero');
end $$;

-- ============================ 2 · "Hoy" es hoy en Bogotá, no en UTC ==========
do $$
begin
  -- 02:00 UTC del 16 son las 21:00 del 15 en Bogotá: el cobro del 15 no vence aún.
  perform pg_temp.chk(
    (select cobros from public.cartera_totales('70000000-0000-4000-8000-000000000001', '2026-09-16 02:00:00+00') where tramo = 'porVencer') = 101,
    'a las 21:00 de Bogotá el cobro que vence hoy sigue por vencer (en UTC ya sería mañana)');
  -- 12:00 UTC del 16 son las 07:00 del 16 en Bogotá: ahora sí lleva 1 día.
  perform pg_temp.chk(
    (select cobros from public.cartera_totales('70000000-0000-4000-8000-000000000001', '2026-09-16 12:00:00+00') where tramo = 'reciente') = 61,
    'a la mañana siguiente pasa al tramo de 1 a 7 días');
end $$;

-- ============================ 3 · Recaudo del mes ============================
do $$
declare v_cents bigint; v_pagos int;
begin
  select cents, pagos into v_cents, v_pagos
  from public.recaudo_mes('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00');
  perform pg_temp.chk(v_cents = 41000, 'recaudo de septiembre: 41.000 (cuenta el del 30 a las 22:00 Bogotá, no el del 31 de agosto)');
  perform pg_temp.chk(v_pagos = 3, 'son 3 pagos confirmados; el pendiente no cuenta');
  perform pg_temp.chk(
    (select count(*) from public.recaudo_mes('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00')) = 1,
    'recaudo_mes devuelve exactamente una fila');
  perform pg_temp.chk(
    (select cents from public.recaudo_mes('70000000-0000-4000-8000-000000000001', '2026-08-20 17:00:00+00')) = 99000,
    'en agosto (Bogotá) cuenta el pago de las 21:00 del 31');
end $$;

-- ============================ 4 · Gastos completos, más allá de la lista =====
do $$
declare r record;
begin
  select * into r
  from public.gastos_totales('70000000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30');
  perform pg_temp.chk(r.gastos = 350, 'cuenta los 350 gastos del mes, no solo los 300 de la lista');
  perform pg_temp.chk(r.total_cents = 505000, 'total del mes: 505.000 (sin el recurrente ni los de otros meses)');
  perform pg_temp.chk(r.sin_pagar_cents = 300000 and r.sin_pagar = 100, 'sin pagar: 100 gastos por 300.000');

  perform pg_temp.chk(
    (select array_agg(categoria order by total_cents desc)
       from public.gastos_por_categoria('70000000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30'))
      = array['Nómina', 'Servicios', 'Sin categoría'],
    'por categoría: de mayor a menor, y lo sin categoría se llama "Sin categoría"');
  perform pg_temp.chk(
    (select total_cents from public.gastos_por_categoria('70000000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30') where categoria = 'Sin categoría') = 5000,
    'lo sin categoría suma 5.000');
  perform pg_temp.chk(
    (select sum(total_cents) from public.gastos_por_categoria('70000000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30')) = 505000,
    'las categorías suman lo mismo que el total');
end $$;

-- ============================ 5 · Otro box y coach sin finanzas: ceros =======
set request.jwt.claim.sub = '71000000-0000-4000-8000-000000000003';  -- dueño del otro box
do $$
begin
  perform pg_temp.chk(
    (select sum(saldo_cents) from public.cartera_totales('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00')) = 0,
    'el dueño de otro box recibe cartera en cero para un box ajeno');
  perform pg_temp.chk(
    (select cents from public.recaudo_mes('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00')) = 0,
    'y recaudo en cero');
  perform pg_temp.chk(
    (select total_cents from public.gastos_totales('70000000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30')) = 0,
    'y gastos en cero');
  perform pg_temp.chk(
    (select sum(saldo_cents) from public.cartera_totales('70000000-0000-4000-8000-000000000002', '2026-09-15 17:00:00+00')) = 150000,
    'pero sí ve la cartera de su propio box (150.000)');
  perform pg_temp.chk(
    (select total_cents from public.gastos_totales('70000000-0000-4000-8000-000000000002', '2026-09-01', '2026-09-30')) = 77000,
    'y los gastos de su propio box (77.000)');
end $$;

set request.jwt.claim.sub = '71000000-0000-4000-8000-000000000002';  -- coach sin can_view_finances
do $$
begin
  perform pg_temp.chk(
    (select sum(saldo_cents) from public.cartera_totales('70000000-0000-4000-8000-000000000001', '2026-09-15 17:00:00+00')) = 0,
    'un coach sin permiso financiero recibe cartera en cero, no un error');
  perform pg_temp.chk(
    (select total_cents from public.gastos_totales('70000000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30')) = 0,
    'y gastos en cero');
end $$;

reset role;
reset request.jwt.claim.sub;

rollback;
