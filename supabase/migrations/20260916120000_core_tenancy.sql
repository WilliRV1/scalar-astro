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
-- SECURITY DEFINER a propósito: estas funciones consultan memberships desde
-- dentro de las políticas RLS de memberships. Sin SECURITY DEFINER la política
-- se llamaría a sí misma y Postgres entraría en recursión infinita.
-- `set search_path = ''` + nombres calificados: evita secuestro de search_path.
-- -----------------------------------------------------------------------------

create or replace function public.auth_org_ids()
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

comment on function public.auth_org_ids is
  'Boxes a los que pertenece el usuario autenticado. Base de toda política RLS.';

create or replace function public.has_role(target_org uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.org_id = target_org
      and m.status = 'active'
      and m.role = any(roles)
  )
$$;

create or replace function public.is_staff(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(target_org, array['owner','admin','coach'])
$$;

-- Acceso financiero: dueños y administradores siempre; un coach solo si el box
-- se lo concedió explícitamente.
create or replace function public.can_view_finances(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.org_id = target_org
      and m.status = 'active'
      and (
        m.role in ('owner','admin')
        or (m.role = 'coach' and coalesce((m.permissions->>'can_view_finances')::boolean, false))
      )
  )
$$;

-- El atleta vinculado al usuario actual dentro de un box concreto.
create or replace function public.current_athlete_id(target_org uuid)
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
  using (id in (select public.auth_org_ids()));

-- Solo dueño y administrador modifican la configuración del box.
create policy "owner/admin actualizan su box"
  on public.organizations for update
  to authenticated
  using (public.has_role(id, array['owner','admin']))
  with check (public.has_role(id, array['owner','admin']));

-- Nadie crea ni borra boxes desde el cliente: eso pasa por una Edge Function
-- con service_role (alta de cliente nuevo). No se define policy de insert/delete.

create policy "el usuario ve sus propias membresías"
  on public.memberships for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "el staff ve las membresías de su box"
  on public.memberships for select
  to authenticated
  using (public.is_staff(org_id));

create policy "owner/admin gestionan membresías"
  on public.memberships for all
  to authenticated
  using (public.has_role(org_id, array['owner','admin']))
  with check (public.has_role(org_id, array['owner','admin']));
