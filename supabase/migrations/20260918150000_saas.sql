-- =============================================================================
-- 0010 · La plataforma: superadministrador, alta de boxes, nuestra suscripción
--        con el box, suplantación auditada y métricas
-- =============================================================================
-- Hasta aquí el producto sabía ser un box. Esta migración le enseña a ser un
-- SaaS: la capa donde NOSOTROS damos de alta clientes, les cobramos, los
-- suspendemos si no pagan y los atendemos cuando algo falla.
--
-- Hay dos cobros distintos en este repositorio y confundirlos cuesta caro:
--
--   · `subscriptions` / `invoices` / `payments`  → el BOX le cobra al ATLETA.
--   · `platform_subscriptions` (esta migración)  → NOSOTROS le cobramos al BOX.
--
-- Regla de oro de esta capa, y la razón de que todo sea SECURITY DEFINER:
--
--   **El superadministrador NO entra por la RLS de los boxes.**
--
-- Sería facilísimo escribir `or private.is_platform_admin()` en cada política y
-- quedarnos con una llave maestra. No se hace: el día que esa función tenga un
-- bug, o que alguien inserte una fila de más en `platform_admins`, se caen de
-- golpe los 30 boxes a la vez. En vez de eso, el superadmin ve la plataforma
-- —cuántos boxes, cuánto facturan, quién está en mora— a través de funciones
-- explícitas que devuelven AGREGADOS, y para mirar los datos de un box tiene
-- que suplantar dejando su nombre y su motivo en la bitácora.
--
-- Ver docs/02-arquitectura.md § "Panel de superadministrador" y
-- docs/05-negocio-precio-gtm.md § "Precio recomendado".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Quién es superadministrador
-- -----------------------------------------------------------------------------
-- Una tabla y no un flag en `auth.users`: el flag habría que ponerlo con la
-- llave de servicio en un sitio que no versionamos, y nadie sabría quién lo
-- tiene. Aquí se ve, se audita y se quita con un `delete`.
--
-- Nadie se da de alta a sí mismo: esta tabla se escribe solo con `service_role`
-- (consola de Supabase o migración de datos). No hay política de insert.
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  -- Para qué se le dio el acceso. Un nombre suelto dentro de un año no dice nada.
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.platform_admins is
  'Usuarios de Scalar con acceso al panel de plataforma. No da acceso a los datos de ningún box.';

alter table public.platform_admins enable row level security;

-- Única política: cada quien puede comprobar si él mismo es superadmin (la
-- aplicación lo necesita para decidir si pinta el panel). Nadie ve la lista
-- completa ni la puede modificar desde el cliente.
create policy "cada usuario ve si él mismo es superadmin"
  on public.platform_admins for select
  to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Helpers de plataforma
-- -----------------------------------------------------------------------------
-- En el esquema `private`, igual que el resto: no está expuesto por PostREST,
-- así que no se puede invocar desde el navegador. Y como en
-- 20260916120000_core_tenancy.sql, NO se le revoca EXECUTE a `authenticated`:
-- las expresiones de una política RLS se evalúan con los privilegios de quien
-- consulta, así que revocarlo rompería toda consulta con un
-- "permission denied for function". Ninguno de estos helpers recibe "quién soy"
-- por parámetro: todos salen de auth.uid().
-- -----------------------------------------------------------------------------
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = (select auth.uid())
  )
$$;

comment on function private.is_platform_admin is
  'True si el usuario autenticado es superadministrador de Scalar.';

/**
 * Corta la ejecución si quien llama no es superadministrador.
 * Se usa como primera línea de toda función de plataforma: son SECURITY
 * DEFINER y saltan la RLS, así que el permiso se comprueba a mano y siempre.
 */
create or replace function private.require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Esta operación es solo para el equipo de Scalar.'
      using errcode = '42501';
  end if;
end;
$$;

grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.require_platform_admin() to authenticated;
revoke all on function private.is_platform_admin() from public, anon;
revoke all on function private.require_platform_admin() from public, anon;

-- =============================================================================
-- Nuestra suscripción con el box
-- =============================================================================
-- Precios de docs/05-negocio-precio-gtm.md (decididos 2026-09-16):
--   Starter ≤40 atletas  ·  99.000 COP/mes
--   Box     ≤120 atletas · 179.000 COP/mes   ← el plan que se vende
--   Pro     ≤300 atletas · 329.000 COP/mes
--   Cadena  +300         · cotización
--   Implementación: 450.000 COP por única vez
--   Precio de fundador (primeros 3–5 boxes): 150.000 de entrada + 40.000/mes
-- =============================================================================
create table public.platform_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  -- Mismo vocabulario que organizations.plan_tier a propósito: si aquí dijera
  -- 'box' y allá 'pro', nadie sabría cuál manda.
  plan_tier       text not null default 'trial'
                  check (plan_tier in ('trial','starter','box','pro','chain')),
  -- El precio de fundador no es un plan: es el mismo plan con otro precio y con
  -- contraprestaciones por contrato (testimonio, caso de estudio, referidos).
  is_founder      boolean not null default false,
  -- Plata en centavos, como en todo el repositorio. Nunca float.
  price_cents     bigint not null default 0 check (price_cents >= 0),
  setup_fee_cents bigint not null default 0 check (setup_fee_cents >= 0),
  billing_period  text not null default 'monthly'
                  check (billing_period in ('monthly','annual')),
  status          text not null default 'trialing'
                  check (status in ('trialing','active','past_due','suspended','cancelled')),
  started_on      date not null default current_date,
  -- Cuándo le toca pagarnos. Null mientras está en prueba.
  next_charge_on  date,
  -- Días de gracia antes de suspender. No se suspende un box el mismo día que
  -- se le pasa la fecha: se cobra por transferencia y la gente se demora.
  grace_days      int not null default 10 check (grace_days between 0 and 60),
  suspended_on    date,
  cancelled_on    date,
  cancel_reason   text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.platform_subscriptions is
  'Lo que el box nos paga a nosotros por usar Scalar. Distinto de subscriptions, que es lo que el atleta le paga al box.';
comment on column public.platform_subscriptions.grace_days is
  'Días después de next_charge_on antes de suspender por mora.';

-- Un box no puede tener dos suscripciones vivas con nosotros a la vez.
create unique index platform_subscriptions_una_viva_idx
  on public.platform_subscriptions (org_id)
  where status <> 'cancelled';

-- Índice por org_id primero, como todo el proyecto.
create index platform_subscriptions_cobro_idx
  on public.platform_subscriptions (org_id, status, next_charge_on);

create trigger platform_subscriptions_touch
  before update on public.platform_subscriptions
  for each row execute function public.touch_updated_at();

alter table public.platform_subscriptions enable row level security;

-- El dueño del box ve qué nos paga y cuándo. Nadie más del box: el rol `owner`
-- es el único con acceso a la facturación de Scalar (docs/02 § Identidad).
-- Escribir esta tabla es nuestro: entra por las funciones de abajo.
create policy "el dueño ve la suscripción de su box con Scalar"
  on public.platform_subscriptions for select
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner'])));

-- =============================================================================
-- Invitación al primer dueño de un box nuevo
-- =============================================================================
-- `invitations` no sirve para esto a propósito: allí solo se invita a `admin` o
-- a `coach`, porque dentro de un box la propiedad se transfiere, no se reparte
-- (ver 20260917130000_invitations.sql). Pero el PRIMER dueño de un box nuevo no
-- tiene a quién pedírsela: lo nombramos nosotros al dar de alta el cliente.
-- Por eso es una tabla aparte, escrita solo por la plataforma.
-- =============================================================================
create table public.platform_owner_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null
              check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Mismo formato de token que las invitaciones del equipo: dos UUID v4 sin
  -- guiones, ~244 bits de azar, generado con gen_random_uuid() de pg_catalog
  -- para que el DEFAULT se resuelva igual en Supabase y en el Postgres pelado
  -- de las pruebas.
  token       text not null unique
              default replace(gen_random_uuid()::text, '-', '')
                   || replace(gen_random_uuid()::text, '-', ''),
  invited_by  uuid references auth.users(id) on delete set null,
  -- Más largo que los 14 días del equipo: entre que se firma y el dueño entra
  -- por primera vez puede pasar la implementación entera.
  expires_at  timestamptz not null default now() + interval '30 days',
  status      text not null default 'pending'
              check (status in ('pending','accepted','revoked','expired')),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.platform_owner_invites is
  'Enlace con el que el primer dueño de un box nuevo reclama su propiedad. Lo emite Scalar al dar de alta el cliente.';

create index platform_owner_invites_org_idx
  on public.platform_owner_invites (org_id, status, created_at desc);

-- Un solo enlace vivo por correo y box: dos enlaces válidos es la forma de que
-- entre quien no debe.
create unique index platform_owner_invites_pendiente_idx
  on public.platform_owner_invites (org_id, email)
  where status = 'pending';

create trigger platform_owner_invites_touch
  before update on public.platform_owner_invites
  for each row execute function public.touch_updated_at();

alter table public.platform_owner_invites enable row level security;

-- El dueño ya instalado ve el historial de invitaciones de propiedad de su box.
-- Quien todavía no es dueño no lee esta tabla: canjea el token por la función.
create policy "el dueño ve las invitaciones de propiedad de su box"
  on public.platform_owner_invites for select
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner'])));

-- =============================================================================
-- Suplantación para dar soporte
-- =============================================================================
-- Sin esto, atender un "no me cuadra el cobro de Marcela" termina en pedirle la
-- contraseña al cliente por WhatsApp. Con esto, queda escrito quién miró qué
-- box, cuándo y por qué, y el propio dueño lo puede leer.
-- =============================================================================
create table public.platform_impersonations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  -- Motivo obligatorio y con sustancia: "soporte" no explica nada dentro de
  -- seis meses, cuando haya que responderle a un cliente qué se miró.
  reason        text not null check (length(btrim(reason)) >= 10),
  started_at    timestamptz not null default now(),
  -- La sesión de soporte vence sola. Una llave que no caduca se queda abierta.
  expires_at    timestamptz not null default now() + interval '60 minutes',
  ended_at      timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.platform_impersonations is
  'Sesiones de soporte: qué superadmin miró qué box, por qué y hasta cuándo.';

create index platform_impersonations_org_idx
  on public.platform_impersonations (org_id, started_at desc);

alter table public.platform_impersonations enable row level security;

create policy "el superadmin ve sus propias suplantaciones"
  on public.platform_impersonations for select
  to authenticated
  using (admin_user_id = (select auth.uid()));

-- Transparencia con el cliente: el dueño puede ver cuándo entramos a su box.
create policy "el dueño ve quién entró a su box"
  on public.platform_impersonations for select
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner'])));

/** Boxes con una sesión de soporte viva del superadmin actual. */
create or replace function private.impersonated_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.org_id
  from public.platform_impersonations i
  where i.admin_user_id = (select auth.uid())
    and i.ended_at is null
    and i.expires_at > now()
$$;

grant execute on function private.impersonated_org_ids() to authenticated;
revoke all on function private.impersonated_org_ids() from public, anon;

-- =============================================================================
-- Alta de un box nuevo
-- =============================================================================
-- Todo el onboarding técnico en una transacción: organización + planes por
-- defecto + suscripción con nosotros + invitación al dueño. Si algo falla, no
-- queda un box a medias que haya que limpiar a mano.
-- =============================================================================

/** Slugs que no se pueden repartir porque son nuestros o son ambiguos. */
create or replace function private.slug_reservado(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_slug = any (array[
    'www','app','api','admin','demo','staging','localhost',
    'scalar','soporte','ayuda','blog','status','mail','cdn','dev','test'
  ])
$$;

grant execute on function private.slug_reservado(text) to authenticated;

/** Precio de lista del tramo, en centavos. Fuente: docs/05-negocio-precio-gtm.md */
create or replace function public.platform_price_cents(p_plan_tier text, p_is_founder boolean default false)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_is_founder then 4000000::bigint        -- 40.000 COP/mes los 12 primeros meses
    when p_plan_tier = 'starter' then 9900000::bigint   --  99.000 COP
    when p_plan_tier = 'box'     then 17900000::bigint  -- 179.000 COP
    when p_plan_tier = 'pro'     then 32900000::bigint  -- 329.000 COP
    else 0::bigint                                       -- trial y cadena: 0 / cotización
  end
$$;

comment on function public.platform_price_cents is
  'Precio mensual de lista de cada tramo en centavos de peso. Cadena se cotiza aparte.';

create or replace function public.create_organization(
  p_slug        text,
  p_name        text,
  p_owner_email text,
  p_plan_tier   text    default 'trial',
  p_city        text    default null,
  p_phone       text    default null,
  p_is_founder  boolean default false,
  p_price_cents bigint  default null
)
returns table (
  org_id        uuid,
  slug          text,
  owner_user_id uuid,
  invite_token  text,
  plans_created int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug   text := lower(btrim(coalesce(p_slug, '')));
  v_email  text := lower(btrim(coalesce(p_owner_email, '')));
  v_name   text := btrim(coalesce(p_name, ''));
  v_org    public.organizations%rowtype;
  v_user   uuid;
  v_token  text;
  v_precio bigint;
  v_setup  bigint;
begin
  perform private.require_platform_admin();

  -- ---- slug -----------------------------------------------------------------
  if v_slug = '' then
    raise exception 'Falta el slug del box (es el subdominio: <slug>.scalar.app).'
      using errcode = '22023';
  end if;

  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$' then
    raise exception 'El slug "%" no sirve: solo minúsculas, números y guiones, entre 3 y 50 caracteres, sin empezar ni terminar en guion.', v_slug
      using errcode = '22023',
            hint = 'Ejemplo: box-rubio';
  end if;

  if private.slug_reservado(v_slug) then
    raise exception 'El slug "%" está reservado por la plataforma. Elige otro.', v_slug
      using errcode = '22023',
            hint = 'Reservados: www, app, api, admin, demo, staging y otros nombres de infraestructura.';
  end if;

  if exists (select 1 from public.organizations o where o.slug = v_slug) then
    raise exception 'Ya existe un box con el slug "%". Elige otro.', v_slug
      using errcode = '23505',
            hint = 'Los slugs son únicos porque son el subdominio de cada box.';
  end if;

  -- ---- datos mínimos --------------------------------------------------------
  if v_name = '' then
    raise exception 'Falta el nombre del box.' using errcode = '22023';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'El correo del dueño ("%") no es válido.', p_owner_email
      using errcode = '22023';
  end if;

  if p_plan_tier not in ('trial','starter','box','pro','chain') then
    raise exception 'Plan desconocido: "%". Válidos: trial, starter, box, pro, chain.', p_plan_tier
      using errcode = '22023';
  end if;

  -- ---- la organización ------------------------------------------------------
  insert into public.organizations (slug, name, city, phone, plan_tier, status, trial_ends_on)
  values (
    v_slug,
    v_name,
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    p_plan_tier,
    case when p_plan_tier = 'trial' then 'trial' else 'active' end,
    case when p_plan_tier = 'trial' then current_date + 14 else null end
  )
  returning * into v_org;

  -- ---- planes por defecto ---------------------------------------------------
  -- El box los edita en cuanto entra, pero arranca con algo que se parece a la
  -- realidad caleña (docs/08 § 4): mensualidad ~180.000, trimestre con descuento
  -- y clase suelta. Un box que entra a una pantalla vacía no sabe por dónde
  -- empezar, y esa es la primera hora de soporte que nos ahorramos.
  insert into public.plans (org_id, name, description, price_cents, billing_period, duration_days, class_quota)
  values
    (v_org.id, 'Mensualidad', 'Acceso ilimitado durante un mes',        18000000, 'monthly',   null, null),
    (v_org.id, 'Trimestre',   'Tres meses con descuento',               48000000, 'quarterly', null, null),
    (v_org.id, 'Clase suelta','Una clase, para visitantes y pruebas',    2500000, 'one_off',      1,    1);

  -- ---- nuestra suscripción con el box ---------------------------------------
  v_precio := coalesce(p_price_cents, public.platform_price_cents(p_plan_tier, p_is_founder));
  v_setup  := case
                when p_plan_tier = 'trial' then 0
                when p_is_founder then 15000000     -- 150.000 COP de entrada
                else 45000000                       -- 450.000 COP de implementación
              end;

  insert into public.platform_subscriptions
    (org_id, plan_tier, is_founder, price_cents, setup_fee_cents, status, next_charge_on)
  values (
    v_org.id,
    p_plan_tier,
    p_is_founder,
    v_precio,
    v_setup,
    case when p_plan_tier = 'trial' then 'trialing' else 'active' end,
    case when p_plan_tier = 'trial' then current_date + 14 else current_date + 30 end
  );

  -- ---- el dueño -------------------------------------------------------------
  select u.id into v_user
  from auth.users u
  where lower(btrim(u.email)) = v_email
  limit 1;

  if v_user is not null then
    -- Ya tiene cuenta: se nombra dueño de una vez y no hay enlace que perder.
    insert into public.memberships (org_id, user_id, role, status, accepted_at)
    values (v_org.id, v_user, 'owner', 'active', now())
    on conflict (org_id, user_id) do update
      set role = 'owner', status = 'active';

    insert into public.platform_owner_invites
      (org_id, email, invited_by, status, accepted_at, accepted_by)
    values (v_org.id, v_email, (select auth.uid()), 'accepted', now(), v_user);
  else
    -- Todavía no existe la cuenta: queda el enlace para que se registre y
    -- reclame la propiedad con public.accept_owner_invitation().
    insert into public.platform_owner_invites (org_id, email, invited_by)
    values (v_org.id, v_email, (select auth.uid()))
    returning token into v_token;
  end if;

  -- ---- bitácora -------------------------------------------------------------
  insert into public.audit_log (org_id, user_id, action, entity, entity_id, after)
  values (
    v_org.id,
    (select auth.uid()),
    'platform.org_created',
    'organizations',
    v_org.id,
    jsonb_build_object(
      'slug', v_slug,
      'name', v_name,
      'plan_tier', p_plan_tier,
      'is_founder', p_is_founder,
      'price_cents', v_precio,
      'owner_email', v_email
    )
  );

  return query select v_org.id, v_org.slug, v_user, v_token, 3;
end;
$$;

comment on function public.create_organization is
  'Da de alta un box: organización + planes por defecto + suscripción con Scalar + invitación al dueño. Solo superadmin.';

revoke all on function public.create_organization(text, text, text, text, text, text, boolean, bigint)
  from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text, boolean, bigint)
  to authenticated;

-- =============================================================================
-- El dueño reclama su box
-- =============================================================================
-- SECURITY DEFINER porque quien acepta todavía no pertenece al box: sin saltar
-- la RLS no podría ni leer su invitación. El usuario sale de auth.uid() y el
-- correo de auth.users; lo único que entra por parámetro es el token.
-- =============================================================================
create or replace function public.accept_owner_invitation(p_token text)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_inv   public.platform_owner_invites%rowtype;
  v_m     public.memberships%rowtype;
begin
  if v_uid is null then
    raise exception 'Tienes que iniciar sesión antes de reclamar tu box.'
      using errcode = '42501';
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_uid;

  select * into v_inv
  from public.platform_owner_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'La invitación no existe. Revisa que el enlace esté completo.'
      using errcode = 'P0002';
  end if;

  if v_email is null or v_email <> v_inv.email then
    raise exception 'Esta invitación es para %. Entra con esa cuenta para aceptarla.', v_inv.email
      using errcode = '42501';
  end if;

  -- Idempotente: tocar el enlace dos veces devuelve la misma membresía.
  if v_inv.status = 'accepted' then
    select * into v_m from public.memberships
    where org_id = v_inv.org_id and user_id = v_uid;
    return v_m;
  end if;

  if v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'Esta invitación ya no sirve. Escríbenos y te mandamos otra.'
      using errcode = '22023';
  end if;

  insert into public.memberships (org_id, user_id, role, status, invited_at, accepted_at)
  values (v_inv.org_id, v_uid, 'owner', 'active', v_inv.created_at, now())
  on conflict (org_id, user_id) do update
    set role = 'owner', status = 'active',
        accepted_at = coalesce(memberships.accepted_at, excluded.accepted_at)
  returning * into v_m;

  update public.platform_owner_invites
     set status = 'accepted', accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  insert into public.audit_log (org_id, user_id, action, entity, entity_id, after)
  values (v_inv.org_id, v_uid, 'platform.owner_accepted', 'memberships', v_m.id,
          jsonb_build_object('email', v_email));

  return v_m;
end;
$$;

comment on function public.accept_owner_invitation is
  'Canjea el enlace de propiedad por la membresía de dueño. Idempotente y solo para el correo invitado.';

revoke all on function public.accept_owner_invitation(text) from public, anon;
grant execute on function public.accept_owner_invitation(text) to authenticated;

-- =============================================================================
-- Mora: suspender sin borrar
-- =============================================================================
-- Un box que deja de pagarnos NO se borra. Sus atletas, sus cobros y sus marcas
-- siguen ahí: lo que se apaga es la escritura. Motivos, en orden de importancia:
--
--   1. La mayoría de las moras se arreglan con una llamada. Borrar datos para
--      volver a cargarlos tres días después es la forma más rápida de perderlos.
--   2. El box tiene obligaciones legales sobre esos datos (docs/07).
--   3. Un box que puede entrar y VER lo que tiene adentro paga; uno al que le
--      cerraron la puerta de golpe, no.
--
-- El estado vive en organizations.status = 'suspended' y lo aplica el trigger
-- de abajo, no el frontend.
-- =============================================================================
create or replace function public.tg_block_writes_when_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then v_org := old.org_id; else v_org := new.org_id; end if;

  -- Sin usuario en sesión solo puede ser `service_role`: los jobs de cron, los
  -- webhooks de pasarela y nuestras propias herramientas. Esos SÍ escriben en un
  -- box suspendido; si no, un pago que entra por Wompi —justo el que levanta la
  -- suspensión— se perdería.
  if v_org is null or (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select o.status into v_status from public.organizations o where o.id = v_org;

  if v_status = 'suspended' and not private.is_platform_admin() then
    raise exception
      'Este box está suspendido por falta de pago y quedó en solo lectura. Tus datos están intactos.'
      using errcode = '42501',
            hint = 'Escríbenos por WhatsApp para reactivarlo: se levanta en cuanto entra el pago.';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

comment on function public.tg_block_writes_when_suspended is
  'Deja un box suspendido en solo lectura. No borra nada: solo bloquea la escritura del propio box.';

-- Las tablas donde escribe el box en su día a día. Quedan FUERA a propósito:
--   · payments y payment_intents → un pago que entra nunca se pierde;
--   · audit_log y job_runs       → los escribimos nosotros;
--   · platform_*                 → son nuestras, no del box.
do $$
declare t text;
begin
  foreach t in array array[
    'athletes','athlete_health','athlete_coach_notes',
    'plans','subscriptions','invoices',
    'personal_records','invitations'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format(
        'create trigger %I before insert or update or delete on public.%I
           for each row execute function public.tg_block_writes_when_suspended()',
        t || '_solo_lectura_si_suspendido', t);
    end if;
  end loop;
end $$;

create or replace function public.suspend_org_for_nonpayment(
  p_org_id uuid,
  p_reason text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes  text;
  v_org    public.organizations%rowtype;
begin
  perform private.require_platform_admin();

  select o.status into v_antes from public.organizations o where o.id = p_org_id;
  if v_antes is null then
    raise exception 'No existe el box %.', p_org_id using errcode = 'P0002';
  end if;

  update public.organizations
     set status = 'suspended'
   where id = p_org_id
  returning * into v_org;

  update public.platform_subscriptions
     set status = 'suspended', suspended_on = current_date
   where org_id = p_org_id
     and status <> 'cancelled';

  insert into public.audit_log (org_id, user_id, action, entity, entity_id, before, after)
  values (
    p_org_id, (select auth.uid()), 'platform.org_suspended', 'organizations', p_org_id,
    jsonb_build_object('status', v_antes),
    jsonb_build_object('status', 'suspended', 'reason', coalesce(btrim(p_reason), 'mora'))
  );

  return v_org;
end;
$$;

comment on function public.suspend_org_for_nonpayment is
  'Suspende un box por mora: queda en solo lectura, sin borrar nada. Solo superadmin.';

create or replace function public.reactivate_org(
  p_org_id uuid,
  p_reason text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes text;
  v_org   public.organizations%rowtype;
begin
  perform private.require_platform_admin();

  select o.status into v_antes from public.organizations o where o.id = p_org_id;
  if v_antes is null then
    raise exception 'No existe el box %.', p_org_id using errcode = 'P0002';
  end if;

  update public.organizations set status = 'active' where id = p_org_id
  returning * into v_org;

  update public.platform_subscriptions
     set status = 'active',
         suspended_on = null,
         next_charge_on = greatest(coalesce(next_charge_on, current_date), current_date)
   where org_id = p_org_id
     and status not in ('cancelled');

  insert into public.audit_log (org_id, user_id, action, entity, entity_id, before, after)
  values (
    p_org_id, (select auth.uid()), 'platform.org_reactivated', 'organizations', p_org_id,
    jsonb_build_object('status', v_antes),
    jsonb_build_object('status', 'active', 'reason', coalesce(btrim(p_reason), 'pago recibido'))
  );

  return v_org;
end;
$$;

/**
 * Pasada de cobranza: marca en mora lo vencido y suspende lo que ya agotó su
 * gracia. Pensada para correr por cron (docs/02 § Trabajos programados) y es
 * idempotente: correrla dos veces el mismo día no cambia nada la segunda vez.
 */
create or replace function public.run_platform_dunning(p_as_of date default current_date)
returns table (marcados_en_mora int, suspendidos int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mora int := 0;
  v_susp int := 0;
begin
  -- Sin usuario en sesión es el cron con service_role. Con usuario, tiene que
  -- ser del equipo de Scalar.
  if (select auth.uid()) is not null then
    perform private.require_platform_admin();
  end if;

  with vencidos as (
    update public.platform_subscriptions s
       set status = 'past_due'
     where s.status = 'active'
       and s.next_charge_on is not null
       and s.next_charge_on < p_as_of
    returning s.org_id
  )
  update public.organizations o
     set status = 'past_due'
    from vencidos v
   where o.id = v.org_id and o.status = 'active';
  get diagnostics v_mora = row_count;

  with agotados as (
    select s.org_id
    from public.platform_subscriptions s
    where s.status = 'past_due'
      and s.next_charge_on is not null
      and s.next_charge_on + s.grace_days < p_as_of
  ),
  apagados as (
    update public.platform_subscriptions s
       set status = 'suspended', suspended_on = p_as_of
      from agotados a
     where s.org_id = a.org_id and s.status = 'past_due'
    returning s.org_id
  )
  update public.organizations o
     set status = 'suspended'
    from apagados a
   where o.id = a.org_id;
  get diagnostics v_susp = row_count;

  return query select v_mora, v_susp;
end;
$$;

revoke all on function public.suspend_org_for_nonpayment(uuid, text) from public, anon;
revoke all on function public.reactivate_org(uuid, text) from public, anon;
revoke all on function public.run_platform_dunning(date) from public, anon;
grant execute on function public.suspend_org_for_nonpayment(uuid, text) to authenticated;
grant execute on function public.reactivate_org(uuid, text) to authenticated;
grant execute on function public.run_platform_dunning(date) to authenticated;

-- =============================================================================
-- Suplantar, con motivo y con rastro
-- =============================================================================
create or replace function public.impersonate(p_org_id uuid, p_reason text)
returns public.platform_impersonations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_ses    public.platform_impersonations%rowtype;
  v_slug   text;
begin
  perform private.require_platform_admin();

  if length(v_reason) < 10 then
    raise exception 'Escribe el motivo del soporte (mínimo 10 caracteres). Queda en la bitácora del box.'
      using errcode = '22023',
            hint = 'Ejemplo: "revisar el cobro duplicado de Marcela del 3 de octubre".';
  end if;

  select o.slug into v_slug from public.organizations o where o.id = p_org_id;
  if v_slug is null then
    raise exception 'No existe el box %.', p_org_id using errcode = 'P0002';
  end if;

  insert into public.platform_impersonations (org_id, admin_user_id, reason)
  values (p_org_id, (select auth.uid()), v_reason)
  returning * into v_ses;

  -- Lo importante de toda esta función. Si esta fila no queda, la suplantación
  -- no pasó: no hay soporte sin rastro.
  insert into public.audit_log (org_id, user_id, action, entity, entity_id, after)
  values (
    p_org_id, (select auth.uid()), 'platform.impersonate',
    'platform_impersonations', v_ses.id,
    jsonb_build_object(
      'reason', v_reason,
      'slug', v_slug,
      'expires_at', v_ses.expires_at
    )
  );

  return v_ses;
end;
$$;

comment on function public.impersonate is
  'Abre una sesión de soporte sobre un box. Solo superadmin, con motivo obligatorio y registro en audit_log.';

create or replace function public.end_impersonation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();

  update public.platform_impersonations
     set ended_at = now()
   where id = p_id
     and admin_user_id = (select auth.uid())
     and ended_at is null;

  if found then
    insert into public.audit_log (org_id, user_id, action, entity, entity_id, after)
    select i.org_id, (select auth.uid()), 'platform.impersonate_end',
           'platform_impersonations', i.id,
           jsonb_build_object('ended_at', i.ended_at)
    from public.platform_impersonations i where i.id = p_id;
  end if;
end;
$$;

revoke all on function public.impersonate(uuid, text) from public, anon;
revoke all on function public.end_impersonation(uuid) from public, anon;
grant execute on function public.impersonate(uuid, text) to authenticated;
grant execute on function public.end_impersonation(uuid) to authenticated;

-- =============================================================================
-- Lo que el superadmin puede mirar
-- =============================================================================
-- Todo agregado. Ninguna de estas funciones devuelve el nombre, el teléfono o
-- la deuda de UN atleta: para eso está la suplantación, que deja rastro.
-- =============================================================================
create or replace function public.platform_metrics()
returns table (
  boxes_totales     int,
  boxes_activos     int,
  boxes_en_prueba   int,
  boxes_en_mora     int,
  boxes_suspendidos int,
  mrr_cents         bigint,
  atletas_totales   int,
  mensajes_enviados bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_msgs bigint := 0;
begin
  perform private.require_platform_admin();

  -- Se pregunta por la tabla antes de contarla: el módulo de automatizaciones
  -- es una migración aparte y esta función tiene que servir igual en una base
  -- que todavía no lo tenga (staging recién creado, pruebas). Sin la tabla,
  -- devuelve 0 —que es la verdad— en vez de fallar. Solo cuentan los mensajes
  -- que de verdad salieron: los simulados y los encolados no.
  if to_regclass('public.message_outbox') is not null then
    execute 'select count(*) from public.message_outbox where status in (''sent'',''delivered'',''read'')'
      into v_msgs;
  end if;

  return query
  select
    (select count(*)::int from public.organizations),
    (select count(*)::int from public.organizations where status = 'active'),
    (select count(*)::int from public.organizations where status = 'trial'),
    (select count(*)::int from public.organizations where status = 'past_due'),
    (select count(*)::int from public.organizations where status = 'suspended'),
    -- Ingreso recurrente mensual: lo anual se divide entre 12 para que no
    -- infle la cifra. Un box en mora se sigue contando —todavía es cliente—;
    -- uno suspendido o cancelado, no.
    (select coalesce(sum(
        case when s.billing_period = 'annual' then s.price_cents / 12 else s.price_cents end
      ), 0)::bigint
     from public.platform_subscriptions s
     where s.status in ('active','past_due')),
    (select count(*)::int from public.athletes
      where deleted_at is null and status not in ('churned','lead')),
    v_msgs;
end;
$$;

comment on function public.platform_metrics is
  'Boxes, ingreso recurrente, atletas y mensajes de toda la plataforma. Solo superadmin.';

create or replace function public.platform_boxes()
returns table (
  org_id          uuid,
  slug            text,
  name            text,
  city            text,
  org_status      text,
  plan_tier       text,
  is_founder      boolean,
  price_cents     bigint,
  sub_status      text,
  next_charge_on  date,
  atletas_activos int,
  owner_email     text,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();

  return query
  select
    o.id,
    o.slug,
    o.name,
    o.city,
    o.status,
    coalesce(s.plan_tier, o.plan_tier),
    coalesce(s.is_founder, false),
    coalesce(s.price_cents, 0::bigint),
    coalesce(s.status, 'sin suscripción'),
    s.next_charge_on,
    (select count(*)::int from public.athletes a
      where a.org_id = o.id and a.deleted_at is null and a.status = 'active'),
    (select u.email::text
       from public.memberships m
       join auth.users u on u.id = m.user_id
      where m.org_id = o.id and m.role = 'owner' and m.status = 'active'
      order by m.created_at
      limit 1),
    o.created_at
  from public.organizations o
  left join public.platform_subscriptions s
    on s.org_id = o.id and s.status <> 'cancelled'
  order by o.created_at desc;
end;
$$;

comment on function public.platform_boxes is
  'Un renglón por box: estado, plan, precio, próximo cobro y dueño. Solo superadmin.';

/**
 * Detalle operativo de UN box. Exige una sesión de suplantación viva: mirar
 * hacia adentro de un cliente siempre deja rastro, aunque sea agregado.
 */
create or replace function public.platform_org_detail(p_org_id uuid)
returns table (
  atletas_activos   int,
  atletas_en_mora   int,
  cartera_cents     bigint,
  cobros_del_mes    int,
  ultimo_pago_at    timestamptz,
  miembros_staff    int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();

  if p_org_id not in (select private.impersonated_org_ids()) then
    raise exception 'Abre una sesión de soporte con motivo antes de mirar los datos de este box.'
      using errcode = '42501',
            hint = 'Usa public.impersonate(org_id, motivo).';
  end if;

  return query
  select
    (select count(*)::int from public.athletes a
      where a.org_id = p_org_id and a.deleted_at is null and a.status = 'active'),
    (select count(*)::int from public.athletes a
      where a.org_id = p_org_id and a.deleted_at is null and a.status = 'overdue'),
    (select coalesce(sum(i.amount_cents - i.paid_cents), 0)::bigint from public.invoices i
      where i.org_id = p_org_id and i.status in ('open','partial','overdue')),
    (select count(*)::int from public.invoices i
      where i.org_id = p_org_id and i.issued_on >= date_trunc('month', current_date)::date),
    (select max(p.paid_at) from public.payments p
      where p.org_id = p_org_id and p.status = 'confirmed'),
    (select count(*)::int from public.memberships m
      where m.org_id = p_org_id and m.status = 'active'
        and m.role in ('owner','admin','coach'));
end;
$$;

revoke all on function public.platform_metrics() from public, anon;
revoke all on function public.platform_boxes() from public, anon;
revoke all on function public.platform_org_detail(uuid) from public, anon;
grant execute on function public.platform_metrics() to authenticated;
grant execute on function public.platform_boxes() to authenticated;
grant execute on function public.platform_org_detail(uuid) to authenticated;

-- Si esta migración se aplica, es porque las cuatro tablas nuevas quedaron
-- protegidas con RLS.
do $$ begin perform public.assert_rls_enabled(); end $$;
