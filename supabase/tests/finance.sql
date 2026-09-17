-- =============================================================================
-- Prueba de finanzas y logística del box
-- =============================================================================
-- Aquí se cruzan las dos cosas que el dueño no perdona: que la plata no cuadre
-- y que la vea quien no debe. Por eso se prueba con importes conocidos, con dos
-- boxes a la vez y con un coach sin permiso financiero mirando.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- semilla ---
insert into auth.users (id, email) values
  ('df000000-0000-4000-8000-000000000001', 'dueno@boxfinanzas.co'),
  ('df000000-0000-4000-8000-000000000002', 'coach@boxfinanzas.co'),      -- sin permiso
  ('df000000-0000-4000-8000-000000000003', 'coachfin@boxfinanzas.co'),   -- con permiso
  ('df000000-0000-4000-8000-000000000004', 'dueno@boxvecino.co');

insert into public.organizations (id, slug, name, timezone, status) values
  ('0f000000-0000-4000-8000-000000000001', 'box-finanzas', 'Box Finanzas', 'America/Bogota', 'active'),
  ('0f000000-0000-4000-8000-000000000002', 'box-vecino',   'Box Vecino',   'America/Bogota', 'active');

insert into public.memberships (org_id, user_id, role, permissions) values
  ('0f000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000001', 'owner', '{}'),
  ('0f000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000002', 'coach', '{}'),
  ('0f000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000003', 'coach', '{"can_view_finances": true}'),
  ('0f000000-0000-4000-8000-000000000002', 'df000000-0000-4000-8000-000000000004', 'owner', '{}');

insert into public.athletes (id, org_id, first_name, joined_on, churned_on, status, referral_source) values
  ('af000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001', 'Ana',    '2026-01-15', null,         'active',  'Instagram'),
  ('af000000-0000-4000-8000-000000000002', '0f000000-0000-4000-8000-000000000001', 'Bruno',  '2026-03-03', null,         'active',  'Referido'),
  ('af000000-0000-4000-8000-000000000003', '0f000000-0000-4000-8000-000000000001', 'Carla',  '2025-11-01', '2026-03-20', 'churned', 'Instagram'),
  ('af000000-0000-4000-8000-000000000004', '0f000000-0000-4000-8000-000000000001', 'Diego',  '2026-02-01', null,         'active',  null),
  ('af000000-0000-4000-8000-000000000005', '0f000000-0000-4000-8000-000000000002', 'Vecino', '2026-01-01', null,         'active',  'Google');

insert into public.plans (id, org_id, name, price_cents, billing_period) values
  ('9f000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001', 'Mensualidad', 18000000, 'monthly'),
  ('9f000000-0000-4000-8000-000000000002', '0f000000-0000-4000-8000-000000000001', 'Trimestre',   48000000, 'quarterly'),
  ('9f000000-0000-4000-8000-000000000003', '0f000000-0000-4000-8000-000000000001', 'Bono 8',       9000000, 'one_off');

insert into public.subscriptions (org_id, athlete_id, plan_id, price_cents, billing_day, status) values
  ('0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000001', 18000000, 5, 'active'),
  ('0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000002', '9f000000-0000-4000-8000-000000000002', 48000000, 5, 'active'),
  ('0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000004', '9f000000-0000-4000-8000-000000000001', 18000000, 5, 'active'),
  -- Un bono no es ingreso recurrente: no debe sumar al MRR.
  ('0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000003', '9f000000-0000-4000-8000-000000000003',  9000000, 5, 'active');

-- Pagos del box: marzo de 2026, hora de Bogotá.
insert into public.payments (id, org_id, athlete_id, amount_cents, method, paid_at, status) values
  ('f0000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001', 50000000, 'nequi',    '2026-03-10 17:00:00+00', 'confirmed'),
  ('f0000000-0000-4000-8000-000000000002', '0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000002', 30000000, 'transfer', '2026-03-15 17:00:00+00', 'confirmed'),
  -- Un pago sin confirmar NO es ingreso: todavía no entró la plata.
  ('f0000000-0000-4000-8000-000000000003', '0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000004', 10000000, 'card',     '2026-03-20 17:00:00+00', 'pending'),
  -- Plata del box vecino: no puede asomarse en ningún reporte del primero.
  ('f0000000-0000-4000-8000-000000000004', '0f000000-0000-4000-8000-000000000002', 'af000000-0000-4000-8000-000000000005', 99900000, 'cash',     '2026-03-11 17:00:00+00', 'confirmed');

insert into public.expense_categories (id, org_id, name, kind) values
  ('ce000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001', 'Arriendo', 'operational'),
  ('ce000000-0000-4000-8000-000000000002', '0f000000-0000-4000-8000-000000000001', 'Servicios', 'operational');

insert into public.suppliers (id, org_id, name, phone) values
  ('50f00000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001', 'Distribuidora Fitness', '+573001112233'),
  ('50f00000-0000-4000-8000-000000000002', '0f000000-0000-4000-8000-000000000001', 'Inmobiliaria del Sur',  null);

insert into public.supplies (id, org_id, name, unit, current_stock, min_stock, default_supplier_id, reorder_every_days) values
  ('51f00000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001', 'Magnesio', 'kg',     0, 12, '50f00000-0000-4000-8000-000000000001', 30),
  ('51f00000-0000-4000-8000-000000000002', '0f000000-0000-4000-8000-000000000001', 'Tiza',     'caja',  20,  5, '50f00000-0000-4000-8000-000000000001', null),
  ('51f00000-0000-4000-8000-000000000003', '0f000000-0000-4000-8000-000000000001', 'Cauchos',  'unidad', 3,  3, null, null);

-- Compromiso recurrente: el arriendo del local.
insert into public.expenses (id, org_id, category_id, supplier_id, description, amount_cents,
                             incurred_on, is_recurring, recurrence, next_due_on) values
  ('e5000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001',
   'ce000000-0000-4000-8000-000000000001', '50f00000-0000-4000-8000-000000000002',
   'Arriendo del local', 20000000, '2026-03-01', true, 'monthly', '2026-03-01');

-- Gasto del box vecino, para el aislamiento.
insert into public.expenses (org_id, description, amount_cents, incurred_on) values
  ('0f000000-0000-4000-8000-000000000002', 'Arriendo del vecino', 77700000, '2026-03-01');

-- ------------------------------------------------------------- utilidades ---
create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  -- coalesce a propósito: `if not cond` con cond = NULL no entra al if, así que
  -- una aserción contra una subconsulta sin filas pasaría sin comprobar nada.
  -- Un NULL aquí es un fallo.
  if not coalesce(cond, false) then
    raise exception 'FALLO [%] (la condición dio %)', label, coalesce(cond::text, 'NULL');
  end if;
  raise notice '  ok · %', label;
end $$;

-- ================== 1 · Quién ve la plata y quién no ========================
-- El módulo entero cuelga de private.auth_finance_org_ids(). Un coach del box
-- sin can_view_finances no puede ver ni un gasto ni una compra.
set session role authenticated;

set request.jwt.claim.sub = 'df000000-0000-4000-8000-000000000002';  -- coach SIN permiso
do $$
begin
  perform pg_temp.chk((select count(*) from public.expenses) = 0,
    'un coach sin permiso financiero no ve ningún gasto');
  perform pg_temp.chk((select count(*) from public.supply_purchases) = 0,
    'un coach sin permiso financiero no ve ninguna compra de insumo');
  perform pg_temp.chk((select count(*) from public.supplies) = 0,
    'un coach sin permiso financiero no ve el inventario ni sus costos');
  perform pg_temp.chk((select count(*) from public.suppliers) = 0,
    'un coach sin permiso financiero no ve los proveedores');
  perform pg_temp.chk(
    (select coalesce(sum(income_cents), 0) from public.monthly_pnl(
       '0f000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-31')) = 0,
    'y el P&L le sale en ceros aunque llame a la función');
end $$;

set request.jwt.claim.sub = 'df000000-0000-4000-8000-000000000003';  -- coach CON permiso
do $$
begin
  perform pg_temp.chk((select count(*) from public.expenses) = 1,
    'el coach con permiso financiero sí ve los gastos de su box');
  perform pg_temp.chk((select count(*) from public.supplies) = 3,
    'y ve el inventario completo');
  perform pg_temp.chk(
    (select count(*) from public.expenses
      where org_id = '0f000000-0000-4000-8000-000000000002') = 0,
    'pero ni con permiso ve un gasto del box vecino');
end $$;

-- Un coach sin permiso tampoco puede ESCRIBIR gastos.
set request.jwt.claim.sub = 'df000000-0000-4000-8000-000000000002';
do $$
declare falló boolean := false;
begin
  begin
    insert into public.expenses (org_id, description, amount_cents)
    values ('0f000000-0000-4000-8000-000000000001', 'Gasto colado', 100);
  exception when insufficient_privilege then
    falló := true;
  end;
  perform pg_temp.chk(falló, 'un coach sin permiso financiero no puede registrar gastos');
end $$;

reset role;

-- ================== 2 · Una compra de insumo es un gasto ====================
insert into public.supply_purchases (id, org_id, supply_id, purchased_on, quantity, total_cents, invoice_url) values
  ('c0000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001',
   '51f00000-0000-4000-8000-000000000001', '2026-03-05', 10, 15000000,
   '0f000000-0000-4000-8000-000000000001/facturas/magnesio.jpg');

do $$
declare
  v_compra public.supply_purchases%rowtype;
  v_gasto  public.expenses%rowtype;
  v_insumo public.supplies%rowtype;
begin
  select * into v_compra from public.supply_purchases
   where id = 'c0000000-0000-4000-8000-000000000001';
  select * into v_gasto from public.expenses where id = v_compra.expense_id;
  select * into v_insumo from public.supplies
   where id = '51f00000-0000-4000-8000-000000000001';

  perform pg_temp.chk(v_compra.expense_id is not null,
    'la compra de insumo queda enlazada a un gasto');
  perform pg_temp.chk(v_gasto.amount_cents = 15000000 and v_gasto.incurred_on = '2026-03-05',
    'el gasto espejo trae el importe y la fecha de la compra');
  perform pg_temp.chk(
    v_gasto.category_id = (select id from public.expense_categories
                           where org_id = v_compra.org_id and lower(name) = 'insumos'),
    'el gasto cae en la categoría Insumos, creada sola si no existía');
  perform pg_temp.chk(v_gasto.receipt_url = v_compra.invoice_url,
    'la foto de la factura viaja de la compra al gasto');
  perform pg_temp.chk(v_compra.supplier_id = '50f00000-0000-4000-8000-000000000001',
    'si no dicen a quién le compraron, se asume el proveedor habitual del insumo');
  perform pg_temp.chk(v_insumo.current_stock = 10,
    'la compra sube el stock del insumo');
  perform pg_temp.chk(v_insumo.last_purchased_on = '2026-03-05',
    'y deja registrada la fecha de la última compra');
  perform pg_temp.chk(v_insumo.avg_unit_cost_cents = 1500000,
    'el costo unitario promedio queda en 15.000 el kilo');
end $$;

-- ================== 3 · Borrar la compra revierte todo =====================
insert into public.supply_purchases (id, org_id, supply_id, purchased_on, quantity, total_cents) values
  ('c0000000-0000-4000-8000-000000000002', '0f000000-0000-4000-8000-000000000001',
   '51f00000-0000-4000-8000-000000000002', '2026-03-08', 5, 5000000);

do $$
declare v_gasto uuid;
begin
  select expense_id into v_gasto from public.supply_purchases
   where id = 'c0000000-0000-4000-8000-000000000002';

  perform pg_temp.chk((select current_stock from public.supplies
                       where id = '51f00000-0000-4000-8000-000000000002') = 25,
    'la segunda compra sube la tiza de 20 a 25 cajas');

  delete from public.supply_purchases where id = 'c0000000-0000-4000-8000-000000000002';

  perform pg_temp.chk(not exists (select 1 from public.expenses where id = v_gasto),
    'al borrar la compra se borra su gasto (si no, el P&L contaría plata que nunca salió)');
  perform pg_temp.chk((select current_stock from public.supplies
                       where id = '51f00000-0000-4000-8000-000000000002') = 20,
    'y el stock vuelve a como estaba');
  perform pg_temp.chk((select last_purchased_on from public.supplies
                       where id = '51f00000-0000-4000-8000-000000000002') is null,
    'la tiza se queda sin fecha de última compra, porque ya no hay ninguna');
end $$;

-- ================== 4 · El gasto recurrente avanza =========================
set session role authenticated;
set request.jwt.claim.sub = 'df000000-0000-4000-8000-000000000001';  -- el dueño

do $$
declare
  v_arriendo public.expenses%rowtype;
  v_periodo  public.expenses%rowtype;
begin
  select * into v_arriendo from public.register_expense_payment(
    'e5000000-0000-4000-8000-000000000001', '2026-03-02');

  perform pg_temp.chk(v_arriendo.next_due_on = '2026-04-01',
    'pagar el arriendo de marzo mueve el próximo vencimiento al 1 de abril');
  perform pg_temp.chk(v_arriendo.paid_on = '2026-03-02',
    'y deja constancia de cuándo se pagó');

  select * into v_periodo from public.expenses
   where parent_expense_id = 'e5000000-0000-4000-8000-000000000001';

  perform pg_temp.chk(v_periodo.amount_cents = 20000000 and v_periodo.incurred_on = '2026-03-01',
    'el egreso real del periodo queda como gasto propio del mes que se pagó');
  perform pg_temp.chk(not v_periodo.is_recurring,
    'el gasto del periodo no es recurrente: el compromiso es el padre, no la copia');

  -- Y otra vez, que es como se usa mes a mes.
  select * into v_arriendo from public.register_expense_payment(
    'e5000000-0000-4000-8000-000000000001', '2026-04-02');
  perform pg_temp.chk(v_arriendo.next_due_on = '2026-05-01',
    'al mes siguiente vuelve a avanzar, sin saltarse ni repetir periodos');
  perform pg_temp.chk(
    (select count(*) from public.expenses
      where parent_expense_id = 'e5000000-0000-4000-8000-000000000001') = 2,
    'cada pago deja su propio egreso: dos pagos, dos gastos');
end $$;

-- ================== 5 · El P&L cuadra =======================================
-- Marzo del Box Finanzas, con números conocidos:
--   ingresos  500.000 + 300.000              = 800.000  (el pago pendiente no cuenta)
--   egresos   200.000 arriendo + 150.000 magnesio = 350.000
--   neto                                       450.000
do $$
declare r record;
begin
  select * into r from public.monthly_pnl(
    '0f000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-31');

  perform pg_temp.chk(r.month = '2026-03-01', 'el P&L agrupa por mes calendario');
  perform pg_temp.chk(r.income_cents = 80000000,
    'los ingresos son los pagos CONFIRMADOS del mes (800.000), no las facturas');
  perform pg_temp.chk(r.expense_cents = 35000000,
    'los egresos suman el arriendo pagado y la compra de magnesio (350.000)');
  perform pg_temp.chk(r.net_cents = 45000000,
    'el neto es ingresos menos egresos (450.000)');
  perform pg_temp.chk(r.net_cents = r.income_cents - r.expense_cents,
    'y cuadra por definición, no por casualidad');
end $$;

do $$
declare v_meses int;
begin
  select count(*) into v_meses from public.monthly_pnl(
    '0f000000-0000-4000-8000-000000000001', '2026-01-01', '2026-04-30');
  perform pg_temp.chk(v_meses = 4,
    'un rango de cuatro meses devuelve los cuatro, también los que no tuvieron movimiento');

  perform pg_temp.chk(
    (select expense_cents from public.monthly_pnl(
       '0f000000-0000-4000-8000-000000000001', '2026-04-01', '2026-04-30')) = 20000000,
    'el arriendo de abril cae en abril, no en el mes en que se creó el compromiso');
end $$;

-- ================== 6 · Un box no ve la plata de otro =======================
do $$
declare r record;
begin
  select * into r from public.monthly_pnl(
    '0f000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-31');

  perform pg_temp.chk(r.income_cents = 80000000,
    'los 999.000 que cobró el box vecino no entran al P&L de este box');
  perform pg_temp.chk(r.expense_cents = 35000000,
    'ni sus 777.000 de arriendo');
end $$;

set request.jwt.claim.sub = 'df000000-0000-4000-8000-000000000004';  -- dueño del box vecino
do $$
declare r record;
begin
  select * into r from public.monthly_pnl(
    '0f000000-0000-4000-8000-000000000002', '2026-03-01', '2026-03-31');
  perform pg_temp.chk(r.income_cents = 99900000 and r.expense_cents = 77700000,
    'y el box vecino ve los suyos, completos');

  -- Pidiendo explícitamente el box ajeno: la RLS no devuelve nada.
  select * into r from public.monthly_pnl(
    '0f000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-31');
  perform pg_temp.chk(r.income_cents = 0 and r.expense_cents = 0,
    'pedir el P&L de un box ajeno devuelve ceros, no datos');
end $$;

-- ================== 7 · Zona horaria del box ================================
-- 2026-04-01 02:00 UTC son las 21:00 del 31 de marzo en Bogotá: ese pago es de
-- MARZO. Sin esto el corte de mes queda corrido y el dueño no cuadra su caja.
reset role;
insert into public.payments (org_id, athlete_id, amount_cents, method, paid_at, status) values
  ('0f000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001',
   7000000, 'cash', '2026-04-01 02:00:00+00', 'confirmed');

set session role authenticated;
set request.jwt.claim.sub = 'df000000-0000-4000-8000-000000000001';
do $$
declare v_marzo bigint; v_abril bigint;
begin
  select income_cents into v_marzo from public.monthly_pnl(
    '0f000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-31');
  select income_cents into v_abril from public.monthly_pnl(
    '0f000000-0000-4000-8000-000000000001', '2026-04-01', '2026-04-30');

  perform pg_temp.chk(v_marzo = 87000000,
    'un pago a las 02:00 UTC del 1 de abril suma en MARZO, que es el mes del box');
  perform pg_temp.chk(v_abril = 0,
    'y no aparece en abril');
end $$;

-- ================== 8 · Alerta de stock bajo ================================
do $$
declare
  v_filas int;
  r record;
begin
  select count(*) into v_filas from public.supplies_low_stock('0f000000-0000-4000-8000-000000000001');
  perform pg_temp.chk(v_filas = 2,
    'la alerta trae magnesio (10 de 12) y cauchos (3 de 3), no la tiza que está sobrada');

  select * into r from public.supplies_low_stock('0f000000-0000-4000-8000-000000000001')
   where name = 'Magnesio';

  -- Literalmente lo que preguntó el dueño: cuándo compré el magnesio y a cuánto.
  perform pg_temp.chk(r.last_purchased_on = '2026-03-05',
    'dice cuándo se compró el magnesio por última vez');
  perform pg_temp.chk(r.last_supplier = 'Distribuidora Fitness',
    'dice a quién se le compró');
  perform pg_temp.chk(r.last_total_cents = 15000000 and r.last_unit_cost_cents = 1500000,
    'y dice cuánto costó: 150.000 por 10 kilos, 15.000 el kilo');
  perform pg_temp.chk(r.suggested_reorder_on = '2026-04-04',
    'sugiere reponer 30 días después de la última compra');

  perform pg_temp.chk(
    exists (select 1 from public.supplies_low_stock('0f000000-0000-4000-8000-000000000001')
            where name = 'Cauchos'),
    'un insumo justo EN el mínimo también entra en la alerta');
  perform pg_temp.chk(
    not exists (select 1 from public.supplies_low_stock('0f000000-0000-4000-8000-000000000001')
                where name = 'Tiza'),
    'y uno por encima del mínimo no');
end $$;

-- ================== 9 · Calendario de compromisos ===========================
do $$
declare v_filas int; r record;
begin
  select count(*) into v_filas from public.upcoming_commitments(
    '0f000000-0000-4000-8000-000000000001', '2026-04-01', '2026-04-30');
  -- El arriendo ya se pagó hasta mayo (sección 4), así que en abril solo queda
  -- pendiente reponer el magnesio.
  perform pg_temp.chk(v_filas = 1,
    'en abril solo vence la reposición del magnesio: el arriendo ya está pagado');
  perform pg_temp.chk(
    (select count(*) from public.upcoming_commitments(
       '0f000000-0000-4000-8000-000000000001', '2026-05-01', '2026-05-31')) = 1,
    'y el arriendo reaparece en mayo, que es su próximo vencimiento');

  select * into r from public.upcoming_commitments(
    '0f000000-0000-4000-8000-000000000001', '2026-04-01', '2026-04-30')
   where kind = 'supply';
  perform pg_temp.chk(r.due_on = '2026-04-04',
    'la compra recurrente se estima con la última compra más su intervalo de reposición');
end $$;

-- ================== 10 · Reportes del dueño =================================
do $$
declare r record;
begin
  select * into r from public.org_mrr('0f000000-0000-4000-8000-000000000001');
  -- 180.000 + 180.000 mensuales + 480.000/3 del trimestre = 520.000
  perform pg_temp.chk(r.mrr_cents = 52000000,
    'el ingreso recurrente mensual normaliza el trimestre a su equivalente mensual');
  perform pg_temp.chk(r.active_subscriptions = 3,
    'y no cuenta el bono de 8 clases, que no es recurrente');
end $$;

do $$
declare r record;
begin
  select * into r from public.monthly_membership_report(
    '0f000000-0000-4000-8000-000000000001', '2026-03-01', '2026-03-31');

  perform pg_temp.chk(r.altas = 1, 'marzo tuvo un alta');
  perform pg_temp.chk(r.bajas = 1, 'y una baja');
  perform pg_temp.chk(r.activos_inicio = 3,
    'con 3 atletas vivos al empezar el mes');
  perform pg_temp.chk(r.retencion = 0.6667,
    'la retención de marzo es 1 - 1/3 = 66,67%');
end $$;

do $$
declare v_instagram int; v_sin int;
begin
  select total into v_instagram from public.athlete_sources('0f000000-0000-4000-8000-000000000001')
   where source = 'Instagram';
  select total into v_sin from public.athlete_sources('0f000000-0000-4000-8000-000000000001')
   where source = 'Sin registrar';

  perform pg_temp.chk(v_instagram = 2, 'dos atletas llegaron por Instagram');
  perform pg_temp.chk(v_sin = 1, 'y del que no se anotó el origen se dice que no se anotó');
  perform pg_temp.chk(
    (select sum(total) from public.athlete_sources('0f000000-0000-4000-8000-000000000001')) = 4,
    'el origen cubre a todos los atletas del box y solo a los suyos');
end $$;

-- Un coach sin permiso financiero tampoco ve los reportes del dueño.
set request.jwt.claim.sub = 'df000000-0000-4000-8000-000000000002';
do $$
begin
  perform pg_temp.chk(
    (select mrr_cents from public.org_mrr('0f000000-0000-4000-8000-000000000001')) = 0,
    'un coach sin permiso financiero no ve el ingreso recurrente del box');
  perform pg_temp.chk(
    (select count(*) from public.athlete_sources('0f000000-0000-4000-8000-000000000001')) = 0,
    'ni los reportes comerciales');
end $$;

reset role;

rollback;

select 'FINANZAS OK' as resultado;
