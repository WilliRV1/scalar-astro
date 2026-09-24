-- =============================================================================
-- Permisos que faltaban y fugas que sobraban
-- =============================================================================
-- Cuatro arreglos que salieron de la auditoría de seguridad y del primer box
-- real en producción:
--
--   1. `private.org_settings_defaults()` la llama el trigger `check_org_settings`,
--      que NO es security definer: corre con los privilegios de quien guarda.
--      Se le había revocado EXECUTE a `public` y nunca se le concedió a
--      `authenticated`, así que el dueño veía "permission denied for function
--      org_settings_defaults" al guardar los ajustes de cobro. Es exactamente la
--      trampa documentada en CLAUDE.md ("no revoques EXECUTE a authenticated en
--      funciones que usen las políticas RLS"); aplica igual a los triggers.
--
--   2. `athlete_activity`, `athlete_no_shows` y `automation_settings_of` son
--      SECURITY DEFINER, reciben `p_org_id` del cliente, no comprueban
--      membresía y quedaron fuera de la lista de `revoke` de su migración.
--      Cualquier usuario autenticado podía pedir la asistencia de los atletas
--      de OTRO box. Solo las usa el motor (service_role): se revocan.
--
--   3. `reservation_settings_of` tenía el mismo hueco, con grant explícito.
--      Solo la llaman `book_class` y compañía desde dentro de la base.
--
--   4. Un `admin` podía ascenderse a `owner` (o darse permisos) porque la
--      política de escritura de memberships solo mira el org_id. Ahora nadie
--      cambia su propio rol, permisos ni estado. Que un admin transfiera la
--      propiedad a OTRO sigue permitido: es el diseño que prueba
--      supabase/tests/team.sql, con `protect_last_owner` cuidando al último.
-- =============================================================================

-- ---- 1 · el trigger de ajustes puede leer los valores por defecto ----------
grant execute on function private.org_settings_defaults() to authenticated;

-- ---- 2 y 3 · funciones del motor que no son para el navegador ---------------
revoke all on function public.athlete_activity(uuid, date)        from public, anon, authenticated;
revoke all on function public.athlete_no_shows(uuid, date)        from public, anon, authenticated;
revoke all on function public.automation_settings_of(uuid)        from public, anon, authenticated;
revoke all on function public.reservation_settings_of(uuid)       from public, anon, authenticated;

-- ---- 4 · quién puede cambiar roles ------------------------------------------
create or replace function public.guard_membership_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- Sin usuario (service_role, semillas, jobs) no hay a quién limitar.
  if v_actor is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.user_id = v_actor and (
       new.role        is distinct from old.role
    or new.permissions is distinct from old.permissions
    or new.status      is distinct from old.status
  ) then
    raise exception 'No puedes cambiar tu propio rol, permisos ni estado. Pídeselo a otro dueño del box.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_membership_roles is
  'Nadie se cambia su propio rol, permisos ni estado. Los jobs (sin auth.uid) pasan.';

revoke all on function public.guard_membership_roles() from public, anon;

create trigger memberships_guard_roles
  before update on public.memberships
  for each row execute function public.guard_membership_roles();

do $$ begin perform public.assert_rls_enabled(); end $$;
