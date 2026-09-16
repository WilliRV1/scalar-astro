-- =============================================================================
-- 0004 · Bitácora, trabajos programados y la guarda de RLS
-- =============================================================================

-- Bitácora de acciones sensibles: borrados, movimientos de plata, suplantación
-- de usuario para dar soporte. Sin esto, el primer reclamo del tipo "yo ya
-- pagué y me siguen cobrando" no se puede resolver.
create table public.audit_log (
  id         bigint generated always as identity primary key,
  org_id     uuid references public.organizations(id) on delete set null,
  user_id    uuid references auth.users(id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  ip         inet,
  created_at timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (org_id, created_at desc);

-- Registro de ejecución de los jobs (generar cobros, enviar mensajes, etc.).
-- No tiene org_id: es operación nuestra, no del box.
create table public.job_runs (
  id          bigint generated always as identity primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text check (status in ('running','ok','error')),
  processed   int,
  error       text
);
create index job_runs_job_idx on public.job_runs (job, started_at desc);

alter table public.audit_log enable row level security;
alter table public.job_runs  enable row level security;

-- Solo dueño y administrador leen la bitácora de su box. Nadie la escribe desde
-- el cliente ni la puede modificar: las escrituras entran por funciones
-- SECURITY DEFINER y por Edge Functions con service_role.
create policy "owner/admin leen la bitácora de su box"
  on public.audit_log for select
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])));

-- job_runs: RLS activada y SIN políticas a propósito. Resultado: nadie con la
-- llave anónima la ve; solo service_role, que salta RLS por diseño.

-- =============================================================================
-- Guarda: ninguna tabla de `public` puede quedarse sin RLS
-- =============================================================================
-- El prototipo llegó a producción con RLS desactivada en las tres tablas y la
-- llave anónima viajando en el navegador: base de datos abierta al mundo.
-- Esta función convierte ese error en imposible de desplegar.
-- =============================================================================
create or replace function public.assert_rls_enabled()
returns void
language plpgsql
set search_path = ''
as $$
declare
  unguarded text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into unguarded
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if unguarded is not null then
    raise exception
      'RLS desactivada en: %. Toda tabla de public debe tener RLS (ver docs/02-arquitectura.md).',
      unguarded;
  end if;
end;
$$;

comment on function public.assert_rls_enabled is
  'Falla si alguna tabla de public quedó sin RLS. Se ejecuta al final de cada migración y en CI.';

-- Se ejecuta ahora: si esta migración se aplica, es porque todo está protegido.
do $$ begin perform public.assert_rls_enabled(); end $$;
