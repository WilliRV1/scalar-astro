-- =============================================================================
-- Prueba de la capa de plataforma (SaaS)
-- =============================================================================
-- Aquí se comprueba lo que convierte este producto en un SaaS y, sobre todo, lo
-- que impide que convertirlo en SaaS abra un hueco: que tener una cuenta de
-- superadministrador NO sea una llave maestra sobre los datos de los boxes.
--
-- Si algún día alguien "arregla" una política escribiendo
-- `or private.is_platform_admin()`, la sección 5 de este archivo falla. Ese es
-- su único trabajo y es el más importante del repositorio.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- semilla ---
insert into auth.users (id, email) values
  ('5a000000-0000-4000-8000-000000000001', 'yo@scalar.co'),        -- superadmin
  ('5a000000-0000-4000-8000-000000000002', 'dueno@boxalfa.co'),    -- dueño del box
  ('5a000000-0000-4000-8000-000000000003', 'coach@boxalfa.co');    -- coach del box

insert into public.organizations (id, slug, name, status, plan_tier) values
  ('0a000000-0000-4000-8000-00000000000a', 'box-alfa', 'Box Alfa', 'active', 'box');

insert into public.athletes (id, org_id, first_name, last_name, phone, status) values
  ('aa000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-00000000000a', 'Marcela', 'Ríos', '+573001110001', 'active'),
  ('aa000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-00000000000a', 'Andrés',  'Gil',  '+573001110002', 'active'),
  ('aa000000-0000-4000-8000-000000000003', '0a000000-0000-4000-8000-00000000000a', 'Luisa',   'Paz',  '+573001110003', 'active');

insert into public.memberships (org_id, user_id, role) values
  ('0a000000-0000-4000-8000-00000000000a', '5a000000-0000-4000-8000-000000000002', 'owner'),
  ('0a000000-0000-4000-8000-00000000000a', '5a000000-0000-4000-8000-000000000003', 'coach');

insert into public.platform_subscriptions (org_id, plan_tier, price_cents, status, next_charge_on) values
  ('0a000000-0000-4000-8000-00000000000a', 'box', 17900000, 'active', current_date + 15);

-- El superadministrador. Esta fila solo se escribe con service_role.
insert into public.platform_admins (user_id, note) values
  ('5a000000-0000-4000-8000-000000000001', 'Fundador — soporte y operación');

-- ------------------------------------------------------------- utilidades ---
create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  -- coalesce a propósito: `if not cond` con cond = NULL no entra al if, así que
  -- una aserción que compare contra una columna vacía o una subconsulta sin
  -- filas pasaría sin haber comprobado nada. Un NULL aquí es un fallo.
  if not coalesce(cond, false) then
    raise exception 'FALLO [%] (la condición dio %)', label, coalesce(cond::text, 'NULL');
  end if;
  raise notice '  ok · %', label;
end $$;

set session role authenticated;

-- ============================ 1 · Un usuario normal no es superadmin ========
-- El dueño de un box es el usuario más poderoso que existe DENTRO de un box, y
-- aun así no puede tocar nada de la plataforma.
set request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000002';  -- dueño del Box Alfa

do $$
declare bloqueado boolean;
begin
  bloqueado := false;
  begin
    perform * from public.create_organization('box-pirata', 'Box Pirata', 'pirata@correo.co', 'box');
  exception when insufficient_privilege then bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'un dueño de box NO puede dar de alta boxes nuevos');

  bloqueado := false;
  begin
    perform public.impersonate('0a000000-0000-4000-8000-00000000000a', 'quiero mirar el box del vecino');
  exception when insufficient_privilege then bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'un usuario normal NO puede suplantar a nadie');

  bloqueado := false;
  begin
    perform * from public.platform_metrics();
  exception when insufficient_privilege then bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'un usuario normal NO ve las métricas de la plataforma');

  bloqueado := false;
  begin
    perform * from public.platform_boxes();
  exception when insufficient_privilege then bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'un usuario normal NO ve la lista de boxes de la plataforma');

  bloqueado := false;
  begin
    perform public.suspend_org_for_nonpayment('0a000000-0000-4000-8000-00000000000a', 'porque sí');
  exception when insufficient_privilege then bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'un usuario normal NO puede suspender un box');

  perform pg_temp.chk((select count(*) from public.platform_admins) = 0,
    'un usuario normal no ve la lista de superadministradores');
end $$;

-- ============================ 2 · Alta de un box nuevo ======================
set request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000001';  -- superadmin

do $$
declare
  r record;
  b record;
begin
  select * into r
  from public.create_organization(
    'box-beta', 'Box Beta', 'dueno@boxbeta.co', 'box', 'Cali', '+573001234567');

  perform pg_temp.chk(r.org_id is not null, 'el superadmin sí da de alta un box');
  perform pg_temp.chk(r.slug = 'box-beta', 'el box queda con su slug (su subdominio)');
  perform pg_temp.chk(r.owner_user_id is null and r.invite_token is not null,
    'si el dueño todavía no tiene cuenta, queda invitado con un enlace');

  -- El superadmin ve el box nuevo por la vía que le corresponde —la función de
  -- plataforma—, no leyendo la tabla: la tabla le sigue estando vedada.
  select * into b from public.platform_boxes() where slug = 'box-beta';
  perform pg_temp.chk(b.org_status = 'active', 'un box con plan de pago nace activo, no en prueba');
  perform pg_temp.chk(b.plan_tier = 'box' and b.price_cents = 17900000,
    'el plan Box nos lo paga a 179.000 COP/mes');
  perform pg_temp.chk(b.city = 'Cali', 'los datos del alta quedan guardados');

  perform set_config('scalar.org_beta', r.org_id::text, true);
end $$;

-- Lo que quedó sembrado se comprueba desde fuera de la RLS, como una auditoría.
reset role;
reset request.jwt.claim.sub;

do $$
declare
  v_org uuid := current_setting('scalar.org_beta', true)::uuid;
  sub   public.platform_subscriptions%rowtype;
begin
  perform pg_temp.chk((select count(*) from public.plans where org_id = v_org) = 3,
    'el box nuevo nace con sus planes por defecto sembrados');
  perform pg_temp.chk(
    (select price_cents from public.plans where org_id = v_org and name = 'Mensualidad') = 18000000,
    'la mensualidad por defecto son 180.000 COP (la mediana de Cali)');
  perform pg_temp.chk(
    (select count(*) from public.plans where org_id = v_org and billing_period = 'one_off') = 1,
    'y trae la clase suelta para visitantes');

  select * into sub from public.platform_subscriptions where org_id = v_org;
  perform pg_temp.chk(sub.setup_fee_cents = 45000000,
    'la suscripción arrastra los 450.000 COP de implementación');
  perform pg_temp.chk(sub.status = 'active' and sub.next_charge_on is not null,
    'la suscripción con Scalar queda activa y con fecha de próximo cobro');
end $$;

set session role authenticated;
set request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000001';

-- ============================ 3 · Slugs ====================================
do $$
declare
  fallo boolean;
  mensaje text;
begin
  fallo := false;
  begin
    perform * from public.create_organization('box-alfa', 'Box Alfa Copia', 'otro@correo.co', 'starter');
  exception when unique_violation then
    fallo := true;
    get stacked diagnostics mensaje = message_text;
  end;
  perform pg_temp.chk(fallo, 'un slug repetido se rechaza');
  perform pg_temp.chk(mensaje like '%Ya existe un box%',
    'y el mensaje dice en cristiano que ese box ya existe');

  fallo := false;
  begin
    perform * from public.create_organization('demo', 'Box Demo', 'demo@correo.co', 'starter');
  exception when invalid_parameter_value then
    fallo := true;
    get stacked diagnostics mensaje = message_text;
  end;
  perform pg_temp.chk(fallo, 'un slug reservado (demo) se rechaza');
  perform pg_temp.chk(mensaje like '%reservado%', 'y el mensaje explica que está reservado');

  fallo := false;
  begin
    perform * from public.create_organization('Box Con Espacios', 'X', 'x@correo.co', 'starter');
  exception when invalid_parameter_value then fallo := true;
  end;
  perform pg_temp.chk(fallo, 'un slug con mayúsculas y espacios se rechaza');

  fallo := false;
  begin
    perform * from public.create_organization('box-gamma', 'Box Gamma', 'esto-no-es-un-correo', 'starter');
  exception when invalid_parameter_value then fallo := true;
  end;
  perform pg_temp.chk(fallo, 'un correo de dueño inválido se rechaza');

  perform pg_temp.chk(
    (select count(*) from public.organizations where slug in ('demo','box-gamma')) = 0,
    'ningún alta rechazada deja un box a medias');
end $$;

-- ============================ 4 · Suplantación con motivo ===================
do $$
declare
  ses public.platform_impersonations%rowtype;
  fallo boolean;
begin
  fallo := false;
  begin
    perform public.impersonate('0a000000-0000-4000-8000-00000000000a', 'soporte');
  exception when invalid_parameter_value then fallo := true;
  end;
  perform pg_temp.chk(fallo, 'un motivo de tres letras no sirve: hay que decir para qué se entra');

  select * into ses
  from public.impersonate('0a000000-0000-4000-8000-00000000000a',
                          'revisar el cobro duplicado de Marcela del 3 de octubre');

  perform pg_temp.chk(ses.id is not null, 'el superadmin sí abre una sesión de soporte');
  perform pg_temp.chk(ses.expires_at > now(), 'la sesión de soporte vence sola');
end $$;

-- La bitácora la lee el dueño del box, no el superadmin: se comprueba desde
-- fuera de la RLS, como lo haría una auditoría.
reset role;
reset request.jwt.claim.sub;

do $$
declare fila public.audit_log%rowtype;
begin
  select * into fila
  from public.audit_log
  where action = 'platform.impersonate'
    and org_id = '0a000000-0000-4000-8000-00000000000a'
  order by created_at desc
  limit 1;

  perform pg_temp.chk(fila.id is not null,
    'la suplantación queda registrada en audit_log');
  perform pg_temp.chk(fila.user_id = '5a000000-0000-4000-8000-000000000001',
    'y queda escrito QUIÉN entró');
  perform pg_temp.chk(fila.after->>'reason' like '%Marcela%',
    'y queda escrito POR QUÉ entró');

  perform pg_temp.chk(
    exists (select 1 from public.audit_log
            where action = 'platform.org_created' and after->>'slug' = 'box-beta'),
    'el alta de un box también queda en la bitácora');
end $$;

set session role authenticated;

-- ============================ 5 · EL AISLAMIENTO SIGUE EN PIE ===============
-- La prueba más importante del archivo. El superadmin tiene una suplantación
-- ABIERTA sobre el Box Alfa y aun así, por la vía normal, no ve ni un dato.
set request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000001';

do $$ begin
  perform pg_temp.chk((select count(*) from public.athletes) = 0,
    'ser superadmin NO deja leer los atletas de ningún box');
  perform pg_temp.chk((select count(*) from public.organizations) = 0,
    'ser superadmin NO deja leer la tabla de organizaciones');
  perform pg_temp.chk((select count(*) from public.memberships) = 0,
    'ser superadmin NO deja leer las membresías de un box');
  perform pg_temp.chk((select count(*) from public.invoices) = 0,
    'ser superadmin NO deja leer los cobros de un box');
  perform pg_temp.chk((select count(*) from public.audit_log) = 0,
    'ser superadmin NO deja leer la bitácora de un box por la vía normal');
  perform pg_temp.chk((select count(*) from public.athlete_health) = 0,
    'ser superadmin NO deja leer datos de salud de nadie');

  -- Lo que sí puede: mirar agregados del box que está atendiendo, y solo
  -- porque abrió la sesión de soporte de la sección 4.
  perform pg_temp.chk(
    (select atletas_activos from public.platform_org_detail('0a000000-0000-4000-8000-00000000000a')) = 3,
    'con la sesión de soporte abierta sí ve cifras agregadas del box');
end $$;

-- Y sobre un box que NO está atendiendo, ni los agregados.
do $$
declare
  otro  uuid;
  fallo boolean := false;
begin
  select b.org_id into otro from public.platform_boxes() b where b.slug = 'box-beta';
  begin
    perform * from public.platform_org_detail(otro);
  exception when insufficient_privilege then fallo := true;
  end;
  perform pg_temp.chk(fallo,
    'sin motivo escrito no se miran los datos de un box, ni agregados');
end $$;

-- ============================ 6 · Métricas de plataforma ====================
do $$
declare m record;
begin
  select * into m from public.platform_metrics();

  perform pg_temp.chk(m.boxes_totales >= 2, 'las métricas cuentan todos los boxes');
  perform pg_temp.chk(m.boxes_activos >= 2, 'y cuántos están activos');
  perform pg_temp.chk(m.atletas_totales = 3, 'y los atletas de toda la plataforma');
  perform pg_temp.chk(m.mrr_cents = 35800000,
    'el ingreso recurrente son los dos boxes a 179.000 COP');
  perform pg_temp.chk(m.mensajes_enviados >= 0,
    'los mensajes enviados salen en cero mientras no haya módulo de automatizaciones');
end $$;

-- ============================ 7 · Mora: suspender sin borrar ================
do $$
declare
  org public.organizations%rowtype;
begin
  select * into org
  from public.suspend_org_for_nonpayment('0a000000-0000-4000-8000-00000000000a',
                                         'dos meses sin pagar, avisado por WhatsApp el 1 y el 10');

  perform pg_temp.chk(org.status = 'suspended', 'suspender por mora cambia el estado del box');
  perform pg_temp.chk(
    (select b.sub_status from public.platform_boxes() b
      where b.org_id = '0a000000-0000-4000-8000-00000000000a') = 'suspended',
    'y también la suscripción con Scalar');
end $$;

reset role;
reset request.jwt.claim.sub;

do $$ begin
  perform pg_temp.chk(
    (select count(*) from public.athletes
      where org_id = '0a000000-0000-4000-8000-00000000000a') = 3,
    'suspender NO borra a los atletas del box');
  perform pg_temp.chk(
    exists (select 1 from public.organizations where id = '0a000000-0000-4000-8000-00000000000a'),
    'suspender NO borra el box');
  perform pg_temp.chk(
    exists (select 1 from public.audit_log where action = 'platform.org_suspended'),
    'la suspensión queda en la bitácora');
end $$;

set session role authenticated;

-- El box suspendido queda en SOLO LECTURA: su gente entra y ve, pero no escribe.
set request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000002';  -- dueño del Box Alfa

do $$
declare bloqueado boolean := false;
begin
  perform pg_temp.chk((select count(*) from public.athletes) = 3,
    'el box suspendido SIGUE VIENDO sus atletas');

  begin
    update public.athletes set first_name = 'Marcelita'
     where id = 'aa000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'pero el box suspendido NO puede escribir');

  bloqueado := false;
  begin
    insert into public.plans (org_id, name, price_cents)
    values ('0a000000-0000-4000-8000-00000000000a', 'Plan nuevo', 1000000);
  exception when insufficient_privilege then bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'tampoco puede crear planes nuevos');
end $$;

-- Y en cuanto paga, todo vuelve.
set request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000001';
do $$
declare org public.organizations%rowtype;
begin
  select * into org from public.reactivate_org('0a000000-0000-4000-8000-00000000000a', 'pagó el 12');
  perform pg_temp.chk(org.status = 'active', 'reactivar devuelve el box a activo');
end $$;

set request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000002';
do $$
declare ok boolean := false;
begin
  update public.athletes set first_name = 'Marcela'
   where id = 'aa000000-0000-4000-8000-000000000001';
  ok := true;
  perform pg_temp.chk(ok, 'reactivado, el box vuelve a escribir sin perder nada');
end $$;

-- ============================ 8 · Cobranza automática =======================
-- Se le atrasa el cobro al Box Alfa 30 días (esto lo haría el paso del tiempo).
reset role;
reset request.jwt.claim.sub;
update public.platform_subscriptions
   set next_charge_on = current_date - 30, grace_days = 10
 where org_id = '0a000000-0000-4000-8000-00000000000a';

set session role authenticated;
set request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000001';
do $$
declare r record;
begin
  select * into r from public.run_platform_dunning(current_date);
  perform pg_temp.chk(r.marcados_en_mora = 1, 'la cobranza marca en mora lo vencido');
  perform pg_temp.chk(r.suspendidos = 1, 'y suspende lo que ya agotó sus días de gracia');

  -- Idempotente: es un job de cron, va a correr todos los días.
  select * into r from public.run_platform_dunning(current_date);
  perform pg_temp.chk(r.marcados_en_mora = 0 and r.suspendidos = 0,
    'correr la cobranza dos veces no vuelve a mover nada');
  perform pg_temp.chk(
    (select count(*) from public.platform_boxes()
      where org_id = '0a000000-0000-4000-8000-00000000000a' and org_status = 'suspended') = 1,
    'el panel de plataforma lo muestra suspendido');
end $$;

-- ============================ 9 · El dueño reclama su box ===================
reset role;
reset request.jwt.claim.sub;

-- El dueño del Box Beta se registra en la aplicación (esto lo hace Supabase Auth).
insert into auth.users (id, email)
values ('5a000000-0000-4000-8000-000000000004', 'dueno@boxbeta.co');

-- El token se saca ahora, fuera de la RLS: es lo que le mandamos por WhatsApp.
select set_config('scalar.token_beta',
                  (select token from public.platform_owner_invites
                    where email = 'dueno@boxbeta.co' and status = 'pending'),
                  true);

set session role authenticated;

do $$
declare
  v_token text := current_setting('scalar.token_beta', true);
  v_m     public.memberships%rowtype;
  fallo   boolean := false;
begin
  perform pg_temp.chk(v_token is not null, 'el alta dejó un enlace de propiedad para el dueño');

  -- Otra persona con el enlace no entra.
  perform set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000003', true);
  begin
    perform public.accept_owner_invitation(v_token);
  exception when insufficient_privilege then fallo := true;
  end;
  perform pg_temp.chk(fallo, 'el enlace reenviado a otra persona NO sirve');

  -- El dueño invitado sí.
  perform set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000004', true);
  select * into v_m from public.accept_owner_invitation(v_token);
  perform pg_temp.chk(v_m.role = 'owner' and v_m.status = 'active',
    'el dueño invitado reclama su box y queda como dueño activo');

  -- Idempotente: tocar el enlace dos veces no crea dos membresías.
  select * into v_m from public.accept_owner_invitation(v_token);
  perform pg_temp.chk(v_m.role = 'owner', 'tocar el enlace dos veces devuelve lo mismo');
end $$;

reset role;
reset request.jwt.claim.sub;

do $$ begin
  perform pg_temp.chk(
    (select count(*) from public.memberships m
      join public.organizations o on o.id = m.org_id
     where o.slug = 'box-beta' and m.role = 'owner') = 1,
    'el Box Beta tiene exactamente un dueño');
end $$;

rollback;

select 'PLATAFORMA SAAS OK' as resultado;
