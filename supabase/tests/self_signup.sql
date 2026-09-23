-- =============================================================================
-- Prueba del registro abierto de boxes (register_my_box)
-- =============================================================================
-- Lo que se vigila: que registrarse deje un box usable y con un solo dueño,
-- que nadie pueda registrar un box a nombre de otro ni sin sesión, y que el
-- box nuevo no vea nada de los boxes que ya existen.
-- =============================================================================

begin;

insert into auth.users (id, email) values
  ('5e000000-0000-4000-8000-000000000001', 'pipe@coachrubio.co'),
  ('5e000000-0000-4000-8000-000000000002', 'otro@coach.co'),
  ('5e000000-0000-4000-8000-000000000003', 'dueno@existente.co');

insert into public.organizations (id, slug, name, status, plan_tier) values
  ('0e500000-0000-4000-8000-000000000001', 'coach-pipe-rubio', 'Box Existente', 'active', 'box');
insert into public.memberships (org_id, user_id, role) values
  ('0e500000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000003', 'owner');
insert into public.athletes (org_id, first_name, last_name, status) values
  ('0e500000-0000-4000-8000-000000000001', 'Atleta', 'Ajeno', 'active');

create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then
    raise exception 'FALLO [%] (la condición dio %)', label, coalesce(cond::text, 'NULL');
  end if;
  raise notice '  ok · %', label;
end $$;

-- =================================================== 1 · Sin sesión, nada ====
set session role anon;
do $$
declare bloqueado boolean := false;
begin
  begin
    perform * from public.register_my_box('Box Fantasma');
  exception when insufficient_privilege then bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'sin sesión no se puede registrar un box');
end $$;
reset role;

-- ======================================= 2 · El coach registra su box =========
set session role authenticated;
set request.jwt.claim.sub = '5e000000-0000-4000-8000-000000000001';

create temp table registro as
  select * from public.register_my_box('Coach Pipe Rubio', 'Cali', null);

do $$
declare v_org uuid := (select org_id from registro);
begin
  perform pg_temp.chk((select slug from registro) = 'coach-pipe-rubio-2',
    'el slug sale del nombre y no pisa uno que ya existe');
  perform pg_temp.chk(
    (select role from public.memberships
      where org_id = v_org and user_id = '5e000000-0000-4000-8000-000000000001') = 'owner',
    'quien se registra queda como dueño');
  perform pg_temp.chk((select count(*) from public.plans where org_id = v_org) = 3,
    'el box arranca con los tres planes de ejemplo');
  perform pg_temp.chk((select count(*) from public.athletes where org_id = v_org) = 0,
    'el box arranca sin atletas');
  perform pg_temp.chk((select count(*) from public.athletes) = 0,
    'el dueño nuevo no ve ni un atleta de los boxes que ya existían');
  perform pg_temp.chk(
    (select status from public.organizations where id = v_org) = 'trial',
    'el box queda en periodo de prueba');
end $$;

reset role;
do $$ begin
  perform pg_temp.chk(
    (select count(*) from public.platform_subscriptions s join registro r on r.org_id = s.org_id
      where s.status = 'trialing' and s.price_cents = 0) = 1,
    'la suscripción con Scalar queda en prueba y sin cobro');
  perform pg_temp.chk(
    (select count(*) from public.org_onboarding o join registro r on r.org_id = o.org_id) = 1,
    'el asistente de puesta en marcha queda listo para el box nuevo');
  perform pg_temp.chk(
    (select count(*) from public.memberships m join registro r on r.org_id = m.org_id) = 1,
    'el box nuevo tiene exactamente un miembro: su dueño');
end $$;

-- ================================================= 3 · Tope por usuario ======
set session role authenticated;
set request.jwt.claim.sub = '5e000000-0000-4000-8000-000000000001';
select * from public.register_my_box('Coach Pipe Rubio Sede Norte');
select * from public.register_my_box('Coach Pipe Rubio Sede Sur');

do $$
declare bloqueado boolean := false;
begin
  begin
    perform * from public.register_my_box('Un cuarto box');
  exception when sqlstate '54000' then bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'un usuario no puede registrar más de tres boxes');
end $$;

-- ======================================== 4 · Nombres que no sirven ==========
set request.jwt.claim.sub = '5e000000-0000-4000-8000-000000000002';
do $$
declare bloqueado boolean := false;
begin
  begin
    perform * from public.register_my_box('  ');
  exception when sqlstate '22023' then bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'un nombre vacío se rechaza');
end $$;

do $$ begin
  perform pg_temp.chk(
    (select slug from public.register_my_box('Admin')) = 'box-admin',
    'un nombre que choca con un slug reservado no se lo apropia');
  perform pg_temp.chk(
    (select slug from public.register_my_box('Ñandú Fitness Club!')) = 'nandu-fitness-club',
    'las tildes y la ñ se vuelven un slug válido');
end $$;

reset role;
reset request.jwt.claim.sub;

rollback;

select 'REGISTRO DE BOXES OK' as resultado;
