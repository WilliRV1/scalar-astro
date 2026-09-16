-- =============================================================================
-- Prueba de aislamiento entre boxes
-- =============================================================================
-- Verifica lo único que no puede fallar nunca en un SaaS multi-cliente: que un
-- box no pueda ver los datos de otro, y que el acceso financiero dependa del
-- permiso y no del rol. Se ejecuta en CI contra una base recién migrada.
-- Cualquier fallo levanta una excepción y aborta con código distinto de 0.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- semilla ---
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'dueno@boxuno.co'),
  ('22222222-2222-2222-2222-222222222222', 'coach@boxuno.co'),
  ('33333333-3333-3333-3333-333333333333', 'coachfin@boxuno.co'),
  ('44444444-4444-4444-4444-444444444444', 'atleta1@boxuno.co'),
  ('55555555-5555-5555-5555-555555555555', 'dueno@boxdos.co');

insert into public.organizations (id, slug, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'box-uno', 'Box Uno'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'box-dos', 'Box Dos');

insert into public.athletes (id, org_id, first_name, last_name, phone) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ana',  'Uno',  '+573001110001'),
  ('a2a2a2a2-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Beto', 'Uno',  '+573001110002'),
  ('b1b1b1b1-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'Caro', 'Dos',  '+573002220001');

insert into public.athlete_health (athlete_id, org_id, injuries) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Hombro derecho');
insert into public.athlete_coach_notes (athlete_id, org_id, notes) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Nota privada del coach');

insert into public.memberships (org_id, user_id, role, permissions, athlete_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner', '{}', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'coach', '{}', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'coach', '{"can_view_finances": true}', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'athlete', '{}', 'a1a1a1a1-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'owner', '{}', null);

insert into public.plans (id, org_id, name, price_cents) values
  ('cccc0000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Mensualidad', 18000000);

insert into public.subscriptions (id, org_id, athlete_id, plan_id, price_cents, billing_day) values
  ('50000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-000000000001', 18000000, 5);

insert into public.invoices (id, org_id, athlete_id, subscription_id, number, period_start, period_end, due_on, amount_cents) values
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'F-0001', '2026-09-01', '2026-09-30', '2026-09-08', 18000000);

-- ------------------------------------------------------------- utilidades ---
create or replace function pg_temp.check_eq(actual bigint, expected bigint, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FALLO [%]: se esperaba %, se obtuvo %', label, expected, actual;
  end if;
  raise notice '  ok · %', label;
end $$;

set session role authenticated;

-- ============================ 1 · Aislamiento entre boxes ====================
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';  -- coach del Box Uno
do $$ begin
  perform pg_temp.check_eq((select count(*) from public.athletes), 2,
    'el coach del Box Uno ve solo a sus 2 atletas');
  perform pg_temp.check_eq((select count(*) from public.athletes
    where org_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 0,
    'el coach del Box Uno NO ve atletas del Box Dos');
  perform pg_temp.check_eq((select count(*) from public.organizations), 1,
    'el coach ve solo su propio box');
end $$;

set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';  -- dueño del Box Dos
do $$ begin
  perform pg_temp.check_eq((select count(*) from public.athletes), 1,
    'el dueño del Box Dos ve solo a su atleta');
end $$;

-- ============================ 2 · Acceso financiero por permiso =============
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';  -- coach SIN finanzas
do $$ begin
  perform pg_temp.check_eq((select count(*) from public.invoices), 0,
    'el coach sin permiso financiero NO ve cobros');
  perform pg_temp.check_eq((select count(*) from public.payments), 0,
    'el coach sin permiso financiero NO ve pagos');
  perform pg_temp.check_eq((select count(*) from public.subscriptions), 1,
    'el coach sí ve la suscripción (necesita saber quién está al día)');
end $$;

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';  -- coach CON finanzas
do $$ begin
  perform pg_temp.check_eq((select count(*) from public.invoices), 1,
    'el coach con can_view_finances SÍ ve los cobros');
end $$;

-- ============================ 3 · El atleta solo ve lo suyo =================
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$ begin
  perform pg_temp.check_eq((select count(*) from public.athletes), 1,
    'el atleta se ve únicamente a sí mismo');
  perform pg_temp.check_eq((select count(*) from public.invoices), 1,
    'el atleta ve su propio cobro');
  perform pg_temp.check_eq((select count(*) from public.athlete_health), 1,
    'el atleta ve su propia ficha de salud');
  perform pg_temp.check_eq((select count(*) from public.athlete_coach_notes), 0,
    'el atleta NO ve las notas privadas del coach');
  perform pg_temp.check_eq((select count(*) from public.audit_log), 0,
    'el atleta NO ve la bitácora');
end $$;

-- ============================ 4 · No se puede escribir en otro box ==========
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare bloqueado boolean := false;
begin
  begin
    insert into public.athletes (org_id, first_name)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'Intruso');
  exception when insufficient_privilege then
    bloqueado := true;
  end;
  if not bloqueado then
    raise exception 'FALLO: el coach del Box Uno pudo crear un atleta en el Box Dos';
  end if;
  raise notice '  ok · RLS bloquea escribir en otro box';
end $$;

reset role;
reset request.jwt.claim.sub;

-- ============================ 5 · Idempotencia del cobro ====================
do $$
declare bloqueado boolean := false;
begin
  begin
    insert into public.invoices (org_id, athlete_id, subscription_id, number,
                                 period_start, period_end, due_on, amount_cents)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001',
            '50000000-0000-0000-0000-000000000001', 'F-0002',
            '2026-09-01', '2026-09-30', '2026-09-08', 18000000);
  exception when unique_violation then
    bloqueado := true;
  end;
  if not bloqueado then
    raise exception 'FALLO: se generó un cobro duplicado para el mismo periodo';
  end if;
  raise notice '  ok · el job no puede duplicar el cobro de un periodo';
end $$;

-- ============================ 6 · Conciliación del pago =====================
insert into public.payments (org_id, athlete_id, invoice_id, amount_cents, method)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001', 18000000, 'nequi');

do $$
declare st text; pagado bigint;
begin
  select status, paid_cents into st, pagado
  from public.invoices where id = '10000000-0000-0000-0000-000000000001';
  if st <> 'paid' or pagado <> 18000000 then
    raise exception 'FALLO: tras el pago la factura quedó en % con % centavos', st, pagado;
  end if;
  raise notice '  ok · el pago salda la factura automáticamente';
end $$;

-- Un pago parcial deja la factura en 'partial'
insert into public.invoices (id, org_id, athlete_id, number, period_start, period_end, due_on, amount_cents)
values ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
        'a2a2a2a2-0000-0000-0000-000000000002', 'F-0003',
        '2026-09-01', '2026-09-30', '2026-09-08', 18000000);
insert into public.payments (org_id, athlete_id, invoice_id, amount_cents, method)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'a2a2a2a2-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000002', 5000000, 'cash');
do $$
declare st text;
begin
  select status into st from public.invoices where id = '10000000-0000-0000-0000-000000000002';
  if st <> 'partial' then
    raise exception 'FALLO: un abono parcial dejó la factura en %', st;
  end if;
  raise notice '  ok · un abono parcial deja la factura en partial';
end $$;

-- ============================ 7 · Integridad entre boxes ====================
do $$
declare bloqueado boolean := false;
begin
  begin
    insert into public.memberships (org_id, user_id, role, athlete_id)
    values ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
            'athlete', 'a1a1a1a1-0000-0000-0000-000000000001');  -- atleta de otro box
  exception when others then
    bloqueado := true;
  end;
  if not bloqueado then
    raise exception 'FALLO: se vinculó una membresía a un atleta de otro box';
  end if;
  raise notice '  ok · una membresía no puede apuntar a un atleta de otro box';
end $$;

rollback;

select 'AISLAMIENTO OK' as resultado;
