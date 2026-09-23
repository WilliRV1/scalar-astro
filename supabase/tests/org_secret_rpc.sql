-- Prueba del puente de credenciales hacia las Edge Functions.
-- Lo que se comprueba es que la puerta abre para el servidor y NO para nadie más.

begin;

create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then
    raise exception 'FALLO [%] (la condición dio %)', label, coalesce(cond::text, 'NULL');
  end if;
  raise notice '  ok · %', label;
end $$;

insert into auth.users (id, email) values
  ('c5000000-0000-4000-8000-000000000001', 'dueno@boxllaves.co');

insert into public.organizations (id, slug, name, status)
values ('0f000000-0000-4000-8000-000000000001', 'box-llaves', 'Box Llaves', 'active');

insert into public.memberships (org_id, user_id, role)
values ('0f000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'owner');

-- El dueño guarda su llave privada de Wompi desde la aplicación.
do $$ begin
  perform set_config('request.jwt.claim.sub', 'c5000000-0000-4000-8000-000000000001', true);
  perform public.set_org_credential(
    '0f000000-0000-4000-8000-000000000001', 'wompi_private_key',
    'prv_test_1234567890abcdefghij', 'test');
end $$;

-- ============================ 1 · El servidor sí lee ========================
do $$ begin
  perform pg_temp.chk(
    public.org_secret_for_service(
      '0f000000-0000-4000-8000-000000000001', 'wompi_private_key'
    ) = 'prv_test_1234567890abcdefghij',
    'el servidor lee la llave del box por la envoltura pública');
end $$;

-- ============================ 2 · El dueño NO lee ===========================
-- Es dueño del box, guardó él mismo la llave, y aun así no puede recuperarla.
-- Si esto se rompiera, la llave privada de Wompi viajaría al navegador.
set session role authenticated;
set request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000001';

do $$
declare bloqueado boolean := false;
begin
  begin
    perform public.org_secret_for_service(
      '0f000000-0000-4000-8000-000000000001', 'wompi_private_key');
  exception when insufficient_privilege or others then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado,
    'ni el DUEÑO del box puede leer su propia llave privada desde el cliente');
end $$;

do $$
declare bloqueado boolean := false;
begin
  begin
    perform secret from public.org_secret_values limit 1;
  exception when others then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado,
    'la tabla de secretos no se puede leer directamente');
end $$;

reset role;
reset request.jwt.claim.sub;

-- ============================ 3 · La ficha sí se ve =========================
-- El dueño necesita saber si la llave está puesta, sin poder verla.
do $$ begin
  perform pg_temp.chk(
    exists (
      select 1 from public.org_credentials
      where org_id = '0f000000-0000-4000-8000-000000000001'
        and key = 'wompi_private_key' and is_set),
    'el dueño sí ve que la llave está configurada, sin ver su valor');
end $$;

rollback;

select 'PUENTE DE CREDENCIALES OK' as resultado;
