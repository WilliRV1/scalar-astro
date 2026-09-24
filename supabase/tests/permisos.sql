-- =============================================================================
-- Permisos: lo que el navegador puede y no puede hacer
-- =============================================================================
-- 1. El dueño guarda los ajustes de cobro (el trigger usa una función privada).
-- 2. Las funciones del motor no se pueden llamar desde el navegador.
-- 3. Nadie se cambia su propio rol ni sus permisos.
-- =============================================================================

begin;

insert into auth.users (id, email) values
  ('7e000000-0000-4000-8000-000000000001', 'dueno@boxperm.co'),
  ('7e000000-0000-4000-8000-000000000002', 'admin@boxperm.co'),
  ('7e000000-0000-4000-8000-000000000003', 'coach@boxperm.co'),
  ('7e000000-0000-4000-8000-000000000009', 'dueno@boxajeno.co');

insert into public.organizations (id, slug, name, status, plan_tier) values
  ('0e700000-0000-4000-8000-000000000001', 'box-perm',  'Box Perm',  'active', 'box'),
  ('0e700000-0000-4000-8000-000000000002', 'box-ajeno', 'Box Ajeno', 'active', 'box');

insert into public.memberships (org_id, user_id, role) values
  ('0e700000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000001', 'owner'),
  ('0e700000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000002', 'admin'),
  ('0e700000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000003', 'coach'),
  ('0e700000-0000-4000-8000-000000000002', '7e000000-0000-4000-8000-000000000009', 'owner');

insert into public.athletes (org_id, first_name, last_name, status) values
  ('0e700000-0000-4000-8000-000000000002', 'Atleta', 'Ajeno', 'active');

create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then
    raise exception 'FALLO [%] (la condición dio %)', label, coalesce(cond::text, 'NULL');
  end if;
  raise notice '  ok · %', label;
end $$;

set session role authenticated;

-- ============================ 1 · El dueño guarda sus ajustes ================
set request.jwt.claim.sub = '7e000000-0000-4000-8000-000000000001';

do $$
declare filas int;
begin
  update public.organizations
     set settings = settings || '{"grace_days": 4, "payment_link": "https://nequi.co/box-perm"}'::jsonb
   where id = '0e700000-0000-4000-8000-000000000001';
  get diagnostics filas = row_count;
  perform pg_temp.chk(filas = 1, 'el dueño guarda los ajustes de cobro sin "permission denied"');
  perform pg_temp.chk(
    (select settings->>'grace_days' from public.organizations
      where id = '0e700000-0000-4000-8000-000000000001') = '4',
    'y el valor queda guardado');
end $$;

-- ====================== 2 · El motor no se llama desde el navegador =========
do $$
declare f text; bloqueado boolean;
begin
  foreach f in array array[
    'select * from public.athlete_activity($1, current_date)',
    'select * from public.athlete_no_shows($1, current_date)',
    'select * from public.automation_settings_of($1)',
    'select * from public.reservation_settings_of($1)'
  ] loop
    bloqueado := false;
    begin
      execute f using '0e700000-0000-4000-8000-000000000002'::uuid;
    exception when insufficient_privilege then bloqueado := true;
    end;
    perform pg_temp.chk(bloqueado, 'desde el navegador no se puede llamar ' || split_part(split_part(f, 'public.', 2), '(', 1));
  end loop;
end $$;

-- ============================ 3 · Roles ======================================
-- El admin intenta ascenderse.
set request.jwt.claim.sub = '7e000000-0000-4000-8000-000000000002';
do $$
declare msg text;
begin
  begin
    update public.memberships set role = 'owner'
     where user_id = '7e000000-0000-4000-8000-000000000002';
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%tu propio rol%', 'un admin NO se asciende a dueño');

  begin
    update public.memberships set permissions = '{"can_view_finances": true}'::jsonb
     where user_id = '7e000000-0000-4000-8000-000000000002';
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%tu propio rol%', 'ni se da permisos a sí mismo');

  -- Lo que sí puede: dar permisos a un coach.
  update public.memberships set permissions = '{"can_view_finances": true}'::jsonb
   where user_id = '7e000000-0000-4000-8000-000000000003';
  perform pg_temp.chk(
    (select permissions->>'can_view_finances' from public.memberships
      where user_id = '7e000000-0000-4000-8000-000000000003') = 'true',
    'un admin SÍ le da permisos a un coach');
end $$;

reset role;
reset request.jwt.claim.sub;

-- Sin usuario (jobs, semillas) no hay límite.
do $$ begin
  update public.memberships set role = 'admin'
   where user_id = '7e000000-0000-4000-8000-000000000002';
  perform pg_temp.chk(
    (select role from public.memberships where user_id = '7e000000-0000-4000-8000-000000000002') = 'admin',
    'service_role (sin auth.uid) cambia roles sin restricción');
end $$;

rollback;

select 'PERMISOS OK' as resultado;
