-- =============================================================================
-- 0009 · Equipo del box: invitaciones y protección del último dueño
-- =============================================================================
-- Dos problemas distintos, el mismo dueño de negocio:
--
--   1. INVITAR. Hoy el box suma un coach metiendo filas a mano en la base. Se
--      necesita un flujo con vencimiento, que se pueda revocar y que no deje a
--      cualquiera con el enlace entrar al box: el correo de quien acepta tiene
--      que ser el mismo al que se invitó.
--
--   2. NO QUEDARSE SIN DUEÑO. Un administrador despistado degrada al único
--      dueño a coach y el box queda sin nadie que pueda administrarlo ni
--      transferir la propiedad. Eso solo se arregla desde soporte, con la llave
--      de servicio. Se vuelve imposible con un trigger.
--
-- Ver docs/02-arquitectura.md § "Identidad y roles".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Invitaciones
-- -----------------------------------------------------------------------------
-- Solo se invita como `admin` o `coach`:
--   · el atleta entra con código al celular (docs/02), no con un enlace;
--   · un `owner` no se invita, se nombra — promover a un miembro que YA está en
--     el box es una decisión deliberada y deja rastro en memberships.
-- -----------------------------------------------------------------------------
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null
              check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role        text not null check (role in ('admin','coach')),
  permissions jsonb not null default '{}'::jsonb,
  -- Token del enlace: dos UUID v4 pegados sin guiones, 64 hex y ~244 bits de
  -- azar. Se arma con gen_random_uuid(), que vive en pg_catalog desde Postgres
  -- 13, y no con gen_random_bytes() de pgcrypto: pgcrypto está en `extensions`
  -- en Supabase y en `public` en el Postgres pelado de las pruebas, así que sin
  -- calificar el esquema el DEFAULT se resolvería distinto en cada sitio. De
  -- paso, pg_catalog no obliga a repartir EXECUTE para poder insertar.
  token       text not null unique
              default replace(gen_random_uuid()::text, '-', '')
                   || replace(gen_random_uuid()::text, '-', ''),
  -- Quién invitó. Lo pone el trigger con auth.uid(), no el cliente: el dato
  -- sirve para pedir cuentas y no valdría nada si se pudiera escribir a mano.
  invited_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  status      text not null default 'pending'
              check (status in ('pending','accepted','revoked','expired')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Los permisos finos son un conjunto cerrado. Sin esto, un `can_ver_plata`
  -- mal escrito se guarda tan campante y no concede nada, y nadie entiende por
  -- qué el coach no ve los cobros.
  constraint invitations_permisos_conocidos check (
    jsonb_typeof(permissions) = 'object'
    and permissions - array['can_view_finances','can_edit_wods','can_manage_athletes']
        = '{}'::jsonb
  )
);

comment on table public.invitations is
  'Invitaciones al equipo de un box. El enlace se comparte por WhatsApp; el correo de quien acepta debe coincidir.';
comment on column public.invitations.token is
  'Secreto del enlace. No se expone por RLS a quien no sea owner/admin del box.';
comment on column public.invitations.expires_at is
  'Una invitación que nadie usó deja de servir. Por defecto, 14 días.';

-- Índices: org_id primero, como el resto del proyecto.
create index invitations_org_status_idx
  on public.invitations (org_id, status, created_at desc);

-- Una sola invitación viva por correo y box: reinvitar no debe dejar dos
-- enlaces válidos, que es la forma de que alguien entre con el rol equivocado.
create unique index invitations_org_email_pendiente_idx
  on public.invitations (org_id, email)
  where status = 'pending';

-- El token se busca solo (quien acepta no sabe en qué box está), así que este
-- es el único índice del proyecto que no empieza por org_id. Lo crea el
-- `unique` de la columna.

create or replace function public.tg_invitations_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- "Juan@Gmail.com " y "juan@gmail.com" son la misma persona. Se normaliza al
  -- guardar para que la comparación al aceptar sea un igual y no un lower() que
  -- alguien olvide poner algún día.
  new.email := lower(btrim(new.email));

  -- Quien invita es quien está autenticado, diga lo que diga el cliente. El
  -- coalesce deja pasar las cargas con service_role (semillas, importaciones),
  -- donde no hay auth.uid().
  if tg_op = 'INSERT' then
    new.invited_by := coalesce((select auth.uid()), new.invited_by);
  end if;

  return new;
end;
$$;

create trigger invitations_normalize
  before insert or update on public.invitations
  for each row execute function public.tg_invitations_normalize();

create trigger invitations_touch
  before update on public.invitations
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.invitations enable row level security;

-- Única política, y a propósito: quien recibe la invitación NO lee esta tabla.
-- Canjea el token por la función de abajo. Si pudiera leerla, un coach del box
-- vería los tokens de todos y podría entrar con el rol de otro.
create policy "owner/admin gestionan las invitaciones de su box"
  on public.invitations for all
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])))
  with check (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])));

-- =============================================================================
-- Aceptar la invitación
-- =============================================================================
-- SECURITY DEFINER porque quien acepta todavía no pertenece al box: sin saltar
-- la RLS no podría ni leer su propia invitación ni crear su membresía.
--
-- Como salta la RLS, la función no recibe "quién soy" por parámetro: el usuario
-- sale de auth.uid() y el correo de auth.users. Lo único que entra es el token.
-- =============================================================================
create or replace function public.accept_invitation(p_token text)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_inv   public.invitations%rowtype;
  v_m     public.memberships%rowtype;
begin
  if v_uid is null then
    raise exception 'Tienes que iniciar sesión antes de aceptar la invitación.'
      using errcode = '42501';
  end if;

  select lower(btrim(u.email)) into v_email
  from auth.users u where u.id = v_uid;

  -- FOR UPDATE: si el usuario toca el botón dos veces, la segunda espera a la
  -- primera y se encuentra la invitación ya aceptada, en vez de correr en
  -- paralelo y crear dos membresías.
  select * into v_inv
  from public.invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'La invitación no existe. Revisa que el enlace esté completo.'
      using errcode = 'P0002';
  end if;

  -- El correo tiene que coincidir. Sin esto, el enlace reenviado por WhatsApp a
  -- un grupo mete al box a quien lo toque primero.
  if v_email is null or v_email <> v_inv.email then
    raise exception 'Esta invitación es para %. Entra con esa cuenta para aceptarla.', v_inv.email
      using errcode = '42501';
  end if;

  -- Idempotente: aceptar dos veces devuelve la misma membresía.
  if v_inv.status = 'accepted' then
    select * into v_m
    from public.memberships
    where org_id = v_inv.org_id and user_id = v_uid;
    return v_m;
  end if;

  if v_inv.status = 'revoked' then
    raise exception 'El box canceló esta invitación. Pídeles una nueva.'
      using errcode = '22023';
  end if;

  if v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'La invitación venció el %. Pídele al box que te mande otra.',
      to_char(v_inv.expires_at at time zone 'America/Bogota', 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  -- Si la persona ya estaba en el box (por ejemplo como atleta), la invitación
  -- la asciende en vez de fallar con un choque de unique (org_id, user_id).
  insert into public.memberships
    (org_id, user_id, role, permissions, status, invited_at, accepted_at)
  values
    (v_inv.org_id, v_uid, v_inv.role, v_inv.permissions, 'active', v_inv.created_at, now())
  on conflict (org_id, user_id) do update
    set role        = excluded.role,
        permissions = excluded.permissions,
        status      = 'active',
        accepted_at = coalesce(memberships.accepted_at, excluded.accepted_at)
  returning * into v_m;

  update public.invitations
     set status = 'accepted', accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  return v_m;
end;
$$;

comment on function public.accept_invitation is
  'Canjea el token de una invitación por una membresía. Idempotente y solo para el correo invitado.';

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- =============================================================================
-- El último dueño no se toca
-- =============================================================================
-- Cubre las tres formas de dejar un box huérfano: degradar al dueño, ponerlo en
-- `disabled` y borrarle la membresía.
-- =============================================================================
create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_otros int;
begin
  -- Si sigue siendo dueño activo del mismo box, no hay nada que proteger.
  if tg_op = 'UPDATE'
     and new.role = 'owner'
     and new.status = 'active'
     and new.org_id = old.org_id
  then
    return new;
  end if;

  -- Borrar el box o la cuenta del usuario arrastra la membresía por CASCADE.
  -- Ahí no hay nada que proteger —el box ya no existe— y bloquearlo dejaría un
  -- box imposible de eliminar.
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.organizations o where o.id = old.org_id)
       or not exists (select 1 from auth.users u where u.id = old.user_id)
    then
      return old;
    end if;
  end if;

  -- FOR UPDATE contra la carrera: dos administradores degradando a cada uno de
  -- los dos dueños a la vez verían "queda otro" y el box se quedaría en cero.
  perform 1
  from public.memberships m
  where m.org_id = old.org_id
    and m.role = 'owner'
    and m.status = 'active'
    and m.id <> old.id
  for update;
  get diagnostics v_otros = row_count;

  if v_otros = 0 then
    raise exception
      'No puedes quitarle la propiedad al único dueño del box: se quedaría sin nadie que lo administre.'
      using errcode = 'P0001',
            hint = 'Nombra primero a otra persona como dueño y después cambia esta.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

comment on function public.protect_last_owner is
  'Impide degradar, desactivar o borrar al último dueño activo de un box.';

-- El WHEN evita entrar a la función en el 99% de los cambios de membresía.
create trigger memberships_protege_ultimo_owner
  before update or delete on public.memberships
  for each row
  when (old.role = 'owner' and old.status = 'active')
  execute function public.protect_last_owner();

-- =============================================================================
-- El equipo, con correo
-- =============================================================================
-- `auth.users` no está expuesto por la API y `authenticated` no puede leerlo.
-- Sin esto la pantalla de equipo mostraría UUID en vez de personas. La función
-- comprueba el permiso en su cuerpo —no confía en ningún parámetro— y solo
-- devuelve el correo de los miembros del box de quien pregunta.
-- =============================================================================

-- El nombre visible vive en `raw_user_meta_data`, que existe en Supabase pero
-- no en el arnés de pruebas. Se crea la versión que corresponda.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
      and column_name = 'raw_user_meta_data'
  ) then
    execute $f$
      create or replace function private.user_display_name(p_user uuid)
      returns text language sql stable security definer set search_path = '' as $b$
        select nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name',
                                     u.raw_user_meta_data->>'name', '')), '')
        from auth.users u where u.id = p_user
      $b$;
    $f$;
  else
    execute $f$
      create or replace function private.user_display_name(p_user uuid)
      returns text language sql stable security definer set search_path = '' as $b$
        select null::text
      $b$;
    $f$;
  end if;
end $$;

revoke all on function private.user_display_name(uuid) from public, anon, authenticated;

create or replace function public.org_team(p_org_id uuid)
returns table (
  membership_id uuid,
  user_id       uuid,
  email         text,
  display_name  text,
  role          text,
  permissions   jsonb,
  status        text,
  invited_at    timestamptz,
  joined_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_org_id is null
     or p_org_id not in (select private.auth_org_ids_with_role(array['owner','admin']))
  then
    raise exception 'Solo el dueño o un administrador ven el equipo de este box.'
      using errcode = '42501';
  end if;

  return query
  select m.id,
         m.user_id,
         u.email::text,
         private.user_display_name(m.user_id),
         m.role,
         m.permissions,
         m.status,
         m.invited_at,
         coalesce(m.accepted_at, m.created_at)
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org_id
    and m.role in ('owner','admin','coach')
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    coalesce(m.accepted_at, m.created_at);
end;
$$;

comment on function public.org_team is
  'Equipo (owner/admin/coach) de un box con su correo. Solo para owner/admin de ese box.';

revoke all on function public.org_team(uuid) from public, anon;
grant execute on function public.org_team(uuid) to authenticated;

-- Si esta migración se aplica, es porque la tabla nueva quedó protegida.
do $$ begin perform public.assert_rls_enabled(); end $$;
