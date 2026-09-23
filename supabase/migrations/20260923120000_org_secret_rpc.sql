-- =============================================================================
-- 0019 · Puente para que las Edge Functions lean las llaves de cada box
-- =============================================================================
-- La migración 0017 guarda las credenciales por box y deja `private.org_secret`
-- para leerlas. Pero `private` NO está entre los esquemas que expone PostgREST
-- (ver supabase/config.toml), así que una Edge Function no puede llamarla por
-- `rpc()` ni siquiera con la llave de servicio: las llaves quedaban guardadas y
-- sin usar, y el cobro de todos los boxes seguía cayendo en la misma cuenta.
--
-- Esto añade la única puerta que faltaba: una envoltura en `public`, alcanzable
-- por PostgREST, con EXECUTE **solo** para `service_role`. Un usuario
-- autenticado que la llame recibe «permission denied for function», no una
-- fila vacía.
-- =============================================================================

create or replace function public.org_secret_for_service(
  p_org_id uuid,
  p_clave  text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secreto text;
begin
  -- Doble cinturón: aunque el EXECUTE de abajo ya lo impide, si alguien
  -- concediera el permiso por error esto sigue cerrando la puerta.
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'Solo el servidor puede leer las credenciales de un box';
  end if;

  select private.org_secret(p_org_id, p_clave) into v_secreto;
  return v_secreto;
end;
$$;

comment on function public.org_secret_for_service is
  'Única vía para que una Edge Function lea una credencial de un box. Solo service_role.';

revoke all on function public.org_secret_for_service(uuid, text) from public, anon, authenticated;
grant execute on function public.org_secret_for_service(uuid, text) to service_role;

do $$ begin perform public.assert_rls_enabled(); end $$;
