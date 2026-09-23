-- =============================================================================
-- Registro de un box por su cuenta ("Registra tu box")
-- =============================================================================
-- Hasta aquí un box solo nacía por `create_organization()`, que exige ser
-- superadministrador y deja un enlace para que el dueño lo reclame por correo.
-- Eso obliga a tener proveedor de correo y a que alguien de Scalar haga el alta
-- a mano. Con esta función el coach se registra solo: crea su cuenta con
-- correo y contraseña, y en el mismo paso su box queda creado, vacío y en
-- prueba, con él como dueño.
--
-- Lo que hace es lo mismo que `create_organization()` para un plan de prueba
-- (planes por defecto, suscripción con Scalar en `trialing`, bitácora), pero:
--   · el dueño es siempre quien llama (`auth.uid()`), nunca un correo ajeno;
--   · el slug se deriva del nombre, porque el coach no sabe qué es un slug;
--   · un mismo usuario no puede fabricar boxes sin límite.
-- =============================================================================

/** "Coach Pipe Rubio" -> "coach-pipe-rubio". Solo ASCII, sin guiones sobrantes. */
create or replace function private.slug_desde_nombre(p_nombre text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      lower(translate(coalesce(p_nombre, ''),
        'ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòù', 'AEIOUUNaeiouunAEIOUaeiou')),
      '[^a-z0-9]+', '-', 'g'),
    '-')
$$;

create or replace function public.register_my_box(
  p_name  text,
  p_city  text default null,
  p_phone text default null
)
returns table (org_id uuid, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := (select auth.uid());
  v_name   text := btrim(coalesce(p_name, ''));
  v_base   text;
  v_slug   text;
  v_n      int  := 1;
  v_propios int;
  v_org    public.organizations%rowtype;
begin
  if v_user is null then
    raise exception 'Tienes que haber iniciado sesión para registrar un box.'
      using errcode = '42501';
  end if;

  if char_length(v_name) < 3 then
    raise exception 'Escribe el nombre del box (mínimo 3 letras).' using errcode = '22023';
  end if;

  if char_length(v_name) > 80 then
    raise exception 'El nombre del box es demasiado largo (máximo 80 caracteres).' using errcode = '22023';
  end if;

  -- Un registro abierto sin tope es una fábrica de boxes basura. Tres alcanzan
  -- para quien tiene sedes; más que eso pasa por soporte.
  select count(*) into v_propios
  from public.memberships m
  where m.user_id = v_user and m.role = 'owner';

  if v_propios >= 3 then
    raise exception 'Ya eres dueño de % boxes. Para registrar otro escríbenos a soporte.', v_propios
      using errcode = '54000';
  end if;

  -- Serializa los registros del mismo usuario: dos clics seguidos en
  -- "Registrar" no pueden saltarse el tope ni crear dos boxes gemelos.
  perform pg_advisory_xact_lock(hashtext('register_my_box:' || v_user::text));

  -- ---- slug a partir del nombre -------------------------------------------
  v_base := left(private.slug_desde_nombre(v_name), 44);
  v_base := btrim(v_base, '-');
  if char_length(v_base) < 3 then
    v_base := 'box-' || coalesce(nullif(v_base, ''), 'nuevo');
  end if;
  if private.slug_reservado(v_base) then
    v_base := 'box-' || v_base;
  end if;

  v_slug := v_base;
  while exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  -- ---- la organización (en prueba 14 días, igual que el alta interna) -----
  insert into public.organizations (slug, name, city, phone, plan_tier, status, trial_ends_on)
  values (
    v_slug,
    v_name,
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    'trial',
    'trial',
    current_date + 14
  )
  returning * into v_org;

  -- Los mismos planes de arranque que `create_organization()`.
  insert into public.plans (org_id, name, description, price_cents, billing_period, duration_days, class_quota)
  values
    (v_org.id, 'Mensualidad', 'Acceso ilimitado durante un mes',        18000000, 'monthly',   null, null),
    (v_org.id, 'Trimestre',   'Tres meses con descuento',               48000000, 'quarterly', null, null),
    (v_org.id, 'Clase suelta','Una clase, para visitantes y pruebas',    2500000, 'one_off',      1,    1);

  insert into public.platform_subscriptions
    (org_id, plan_tier, is_founder, price_cents, setup_fee_cents, status, next_charge_on)
  values (v_org.id, 'trial', false, 0, 0, 'trialing', current_date + 14);

  insert into public.memberships (org_id, user_id, role, status, accepted_at)
  values (v_org.id, v_user, 'owner', 'active', now());

  insert into public.audit_log (org_id, user_id, action, entity, entity_id, after)
  values (
    v_org.id, v_user, 'org.self_signup', 'organizations', v_org.id,
    jsonb_build_object('slug', v_slug, 'name', v_name)
  );

  return query select v_org.id, v_org.slug;
end;
$$;

comment on function public.register_my_box is
  'Registro abierto: quien llama crea un box en prueba de 14 días y queda como dueño. Máximo 3 boxes por usuario.';

revoke all on function public.register_my_box(text, text, text) from public, anon;
grant execute on function public.register_my_box(text, text, text) to authenticated;

do $$ begin perform public.assert_rls_enabled(); end $$;
