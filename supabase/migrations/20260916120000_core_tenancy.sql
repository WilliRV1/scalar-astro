-- =============================================================================
-- 0001 · Núcleo multi-tenant: organizaciones, membresías y helpers de permisos
-- =============================================================================
-- Toda tabla de negocio de este producto cuelga de una organización (un box).
-- El aislamiento entre boxes NO se hace en el frontend: se hace aquí, con RLS.
-- Ver docs/02-arquitectura.md y docs/03-modelo-de-datos.md
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Utilidad: mantener updated_at al día
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Organizaciones (boxes)
-- -----------------------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique
                check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$'),
  name          text not null,
  legal_name    text,
  tax_id        text,
  timezone      text not null default 'America/Bogota',
  currency      char(3) not null default 'COP',
  logo_url      text,
  brand_color   text not null default '#EF4444',
  phone         text,
  address       text,
  city          text,
  -- Estado de la cuenta del box con nosotros (no del atleta con el box)
  plan_tier     text not null default 'trial'
                check (plan_tier in ('trial','starter','box','pro','chain')),
  status        text not null default 'trial'
                check (status in ('trial','active','past_due','suspended','churned')),
  trial_ends_on date,
  onboarded_at  timestamptz,
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger organizations_touch
  before update on public.organizations
  for each row execute function public.touch_updated_at();

comment on table public.organizations is
  'Un box / gimnasio funcional. Es la frontera de aislamiento de datos.';
comment on column public.organizations.slug is
  'Identificador del subdominio: <slug>.scalar.app';

-- -----------------------------------------------------------------------------
-- Membresías: qué usuario pertenece a qué box y con qué rol
-- -----------------------------------------------------------------------------
-- Una persona puede estar en varios boxes (un coach que trabaja en dos), por eso
-- esto es una tabla y no una columna sobre el usuario.
-- -----------------------------------------------------------------------------
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','admin','coach','athlete')),
  -- Permisos finos sobre el rol. El caso típico: un coach que además es dueño y
  -- sí puede ver la plata -> {"can_view_finances": true}
  permissions jsonb not null default '{}'::jsonb,
  athlete_id  uuid,  -- FK añadida en la migración de atletas (dependencia circular)
  status      text not null default 'active'
              check (status in ('active','invited','disabled')),
  invited_at  timestamptz,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id) where status = 'active';
create index memberships_org_role_idx on public.memberships (org_id, role);

create trigger memberships_touch
  before update on public.memberships
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Helpers de permisos
-- -----------------------------------------------------------------------------
-- Viven en el esquema `private`, que NO está expuesto por la API: nadie puede
-- invocarlos desde el cliente, solo las políticas RLS.
--
-- SECURITY DEFINER a propósito: consultan memberships desde dentro de las
-- políticas de memberships. Sin eso, la política se llamaría a sí misma y
-- Postgres entraría en recursión infinita. Como SECURITY DEFINER salta la RLS
-- de las tablas que toca, cada función filtra SIEMPRE por auth.uid() en su
-- cuerpo: nunca reciben "de quién" como parámetro.
--
-- Devuelven CONJUNTOS de org_id en vez de un booleano por fila. Así la política
-- se escribe `org_id in (select private.…)`, que Postgres evalúa UNA vez por
-- consulta en lugar de una vez por fila.
-- -----------------------------------------------------------------------------

create schema if not exists private;

create or replace function private.auth_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
$$;

comment on function private.auth_org_ids is
  'Boxes a los que pertenece el usuario autenticado. Base de toda política RLS.';

create or replace function private.auth_org_ids_with_role(roles text[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.role = any(roles)
$$;

/** Boxes donde el usuario es parte del equipo (dueño, administrador o coach). */
create or replace function private.auth_staff_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_org_ids_with_role(array['owner','admin','coach'])
$$;

/**
 * Boxes donde el usuario puede ver la plata.
 * Dueño y administrador siempre; un coach solo si el box se lo concedió.
 */
create or replace function private.auth_finance_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and (
      m.role in ('owner','admin')
      or (m.role = 'coach' and coalesce((m.permissions->>'can_view_finances')::boolean, false))
    )
$$;

/** El atleta vinculado al usuario actual dentro de un box concreto. */
create or replace function private.current_athlete_id(target_org uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.athlete_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.org_id = target_org
    and m.status = 'active'
    and m.role = 'athlete'
  limit 1
$$;

-- Permisos de los helpers.
--
-- OJO, esto es contraintuitivo y cuesta una tarde si se hace mal: las
-- expresiones de una política RLS se evalúan con los privilegios de QUIEN
-- CONSULTA, no del dueño de la tabla. Si se le revoca EXECUTE a `authenticated`,
-- toda consulta falla con "permission denied for function". Las pruebas de
-- aislamiento lo detectan de inmediato.
--
-- Lo que de verdad protege estos helpers es que el esquema `private` NO está
-- en la lista de esquemas expuestos por PostgREST (ver supabase/config.toml),
-- así que no se pueden invocar desde el cliente. Además ninguno acepta "de
-- quién" como parámetro: todos filtran por auth.uid() en su cuerpo, de modo que
-- no hay nada que extraer aunque se pudieran llamar.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;
revoke all on all functions in schema private from public, anon;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.memberships   enable row level security;

-- Cualquier miembro ve los datos de su box (el atleta necesita el nombre, el
-- logo y la zona horaria para que la aplicación funcione).
create policy "miembros leen su box"
  on public.organizations for select
  to authenticated
  using (id in (select private.auth_org_ids()));

-- Solo dueño y administrador modifican la configuración del box.
create policy "owner/admin actualizan su box"
  on public.organizations for update
  to authenticated
  using (id in (select private.auth_org_ids_with_role(array['owner','admin'])))
  with check (id in (select private.auth_org_ids_with_role(array['owner','admin'])));

-- Nadie crea ni borra boxes desde el cliente: eso pasa por una Edge Function
-- con service_role (alta de cliente nuevo). No se define policy de insert/delete.

create policy "el usuario ve sus propias membresías"
  on public.memberships for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "el staff ve las membresías de su box"
  on public.memberships for select
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()));

create policy "owner/admin gestionan membresías"
  on public.memberships for all
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])))
  with check (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])));
