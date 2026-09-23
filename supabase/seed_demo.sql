-- =============================================================================
-- Box de demostración — "Box La Ladera" (Cali)
-- =============================================================================
-- Un box creíble con un año de historia, para enseñárselo a un entrenador real.
-- No es un juguete de cinco atletas: son ~40 personas, con mora, con gente que
-- dejó de venir, con meses buenos y un mes en pérdida. El producto se vende
-- justamente porque enseña los problemas, así que aquí hay problemas.
--
-- TODAS las fechas se calculan contra `current_date`. Nada fijo: esta demo
-- tiene que seguir viéndose bien dentro de seis meses.
--
-- Nadie de aquí existe. Nombres, teléfonos, correos y el NIT son inventados;
-- los teléfonos usan el rango +57 300 1234 5XX, con formato E.164 válido pero
-- sin correspondencia con ninguna línea real. Ver docs/07-legal-colombia.md.
--
-- Cómo se aplica:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed_demo.sql
--   ./scripts/setup-demo.sh          (migraciones + esta semilla)
--   supabase db reset                (la carga supabase/seed.sql)
-- También se puede pegar entero en el editor SQL de Supabase. ENTERO: usa
-- tablas temporales y una sola transacción, así que no se ejecuta por trozos.
--
-- Usuarios de acceso (contraseña de los tres: `demo1234`):
--   dueno@boxlaladera.co   owner  — lo ve todo, incluida la plata
--   coach@boxlaladera.co   coach  — SIN acceso financiero (pruébalo: es el
--                                   argumento de "mi coach no ve mis números")
--   atleta@boxlaladera.co  athlete — vinculado a la ficha de Valentina Ocampo
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0 · Idempotencia
-- -----------------------------------------------------------------------------
-- Borrar el box arrastra en cascada todo lo suyo (atletas, cobros, WODs,
-- clases, gastos, consecutivo de facturas). Así, correr la semilla dos veces
-- deja exactamente el mismo box y no dos boxes mezclados.
-- -----------------------------------------------------------------------------
delete from public.organizations where id = 'b0c50000-0000-4000-8000-000000000001';

-- -----------------------------------------------------------------------------
-- 1 · Usuarios de acceso
-- -----------------------------------------------------------------------------
-- `auth.users` es de Supabase y NO es igual en todas partes: el arnés local de
-- pruebas (supabase/tests/_local_auth_stub.sql) tiene una tabla mínima de dos
-- columnas, y un proyecto real tiene treinta y pico. Por eso este bloque mira
-- qué columnas existen antes de escribir, en vez de asumir. La alternativa
-- —dejar los usuarios fuera de la semilla— obliga a crearlos a mano justo
-- cuando uno está enseñando el producto.
-- -----------------------------------------------------------------------------
do $$
declare
  v_full   boolean;
  v_crypt  text;      -- esquema donde vive pgcrypto (`extensions` en Supabase)
  v_pass   text;
  v_ident  boolean;
  v_prov   boolean;
  u        record;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
      and column_name = 'encrypted_password'
  ) into v_full;

  select n.nspname into v_crypt
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'crypt' limit 1;

  for u in
    select * from (values
      ('d1c50000-0000-4000-8000-000000000001'::uuid, 'dueno@boxlaladera.co',  'Andrea Ospina'),
      ('d1c50000-0000-4000-8000-000000000002'::uuid, 'coach@boxlaladera.co',  'Mateo Rivas'),
      ('d1c50000-0000-4000-8000-000000000003'::uuid, 'atleta@boxlaladera.co', 'Valentina Ocampo')
    ) as t(id, email, nombre)
  loop
    if not v_full then
      -- Arnés local: solo id y correo.
      insert into auth.users (id, email) values (u.id, u.email)
      on conflict (id) do nothing;
      continue;
    end if;

    if v_crypt is null then
      raise warning
        'pgcrypto no está disponible: el usuario % queda sin contraseña. Ponle una desde Authentication → Users.',
        u.email;
      v_pass := null;
    else
      execute format('select %I.crypt($1, %I.gen_salt($2))', v_crypt, v_crypt)
        into v_pass using 'demo1234', 'bf';
    end if;

    execute $ins$
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000', $1,
        'authenticated', 'authenticated', $2, $3,
        now(), now() - interval '430 days', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', $4)
      )
      on conflict (id) do update
        set email             = excluded.email,
            encrypted_password = coalesce(excluded.encrypted_password, auth.users.encrypted_password),
            updated_at        = now()
    $ins$ using u.id, u.email, v_pass, u.nombre;

    -- GoTrue lee las columnas de token como texto y NO acepta NULL: con un
    -- NULL, el login falla con "Database error querying schema". Un usuario
    -- creado desde el panel las trae en '', así que se dejan igual. Se mira
    -- qué columnas existen porque cambian entre versiones de GoTrue.
    execute (
      select 'update auth.users set '
             || string_agg(format('%1$I = coalesce(%1$I, %2$L)', column_name, ''), ', ')
             || ' where id = $1'
      from information_schema.columns
      where table_schema = 'auth' and table_name = 'users'
        and column_name in ('confirmation_token', 'recovery_token',
                            'email_change_token_new', 'email_change_token_current',
                            'email_change', 'phone_change', 'phone_change_token',
                            'reauthentication_token')
    ) using u.id;

    -- GoTrue moderno espera además una identidad por proveedor. Si la tabla no
    -- existe (arnés local) o cambia de forma, no se rompe la semilla por eso.
    select to_regclass('auth.identities') is not null into v_ident;
    if v_ident then
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'auth' and table_name = 'identities'
          and column_name = 'provider_id'
      ) into v_prov;

      begin
        if v_prov then
          execute $idp$
            insert into auth.identities (
              provider_id, user_id, identity_data, provider,
              last_sign_in_at, created_at, updated_at
            ) values (
              $1::text, $1,
              jsonb_build_object('sub', $1::text, 'email', $2, 'email_verified', true),
              'email', now(), now(), now()
            )
            on conflict do nothing
          $idp$ using u.id, u.email;
        else
          execute $idn$
            insert into auth.identities (
              user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
            ) values (
              $1,
              jsonb_build_object('sub', $1::text, 'email', $2, 'email_verified', true),
              'email', now(), now(), now()
            )
            on conflict do nothing
          $idn$ using u.id, u.email;
        end if;
      exception when others then
        raise warning 'No se pudo crear la identidad de %: %. Se puede entrar igual, o crear el usuario desde el panel.', u.email, sqlerrm;
      end;
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2 · El box
-- -----------------------------------------------------------------------------
-- Al insertarlo se disparan dos triggers que ya hacen su trabajo solos:
-- instalan las automatizaciones por defecto y la configuración de reservas.
-- -----------------------------------------------------------------------------
insert into public.organizations (
  id, slug, name, legal_name, tax_id, timezone, currency,
  phone, address, city, plan_tier, status, onboarded_at, created_at
) values (
  'b0c50000-0000-4000-8000-000000000001',
  'box-la-ladera', 'Box La Ladera', 'Box La Ladera S.A.S.', '901456789-1',
  'America/Bogota', 'COP',
  '+573001234500', 'Calle 9 # 46-20, barrio Tequendama', 'Cali',
  'box', 'active',
  now() - interval '430 days', now() - interval '430 days'
);

insert into public.platform_subscriptions (
  org_id, plan_tier, is_founder, price_cents, billing_period, status,
  started_on, next_charge_on, notes
) values (
  'b0c50000-0000-4000-8000-000000000001', 'box', true, 19900000, 'monthly', 'active',
  current_date - 430, date_trunc('month', current_date + interval '1 month')::date + 4,
  'Box fundador: precio congelado.'
);

-- El teléfono al que llegan los avisos internos del motor de automatizaciones.
update public.automation_settings
   set staff_phone = '+573001234500'
 where org_id = 'b0c50000-0000-4000-8000-000000000001';

-- -----------------------------------------------------------------------------
-- 3 · Planes  (precios reales del mercado colombiano, docs/08 §3)
-- -----------------------------------------------------------------------------
insert into public.plans (id, org_id, name, description, price_cents, billing_period, duration_days, class_quota) values
  ('91c50000-0000-4000-8000-000000000001', 'b0c50000-0000-4000-8000-000000000001',
   'Mensualidad ilimitada', 'Todas las clases del mes, sin permanencia.', 18000000, 'monthly', null, null),
  ('91c50000-0000-4000-8000-000000000002', 'b0c50000-0000-4000-8000-000000000001',
   'Bono 8 clases', 'Ocho clases para usar en dos meses. Para quien viaja o entrena por temporadas.', 13000000, 'one_off', 60, 8),
  ('91c50000-0000-4000-8000-000000000003', 'b0c50000-0000-4000-8000-000000000001',
   'Estudiante', 'Mensualidad con carné universitario vigente.', 15000000, 'monthly', null, null),
  ('91c50000-0000-4000-8000-000000000004', 'b0c50000-0000-4000-8000-000000000001',
   'Clase suelta (drop-in)', 'Una clase. Para el que está de paso o viene a probar.', 2000000, 'one_off', 1, 1);

-- -----------------------------------------------------------------------------
-- 4 · Los atletas
-- -----------------------------------------------------------------------------
-- La tabla temporal es el guion de toda la semilla: de aquí salen las
-- suscripciones, los cobros, la asistencia, los resultados y las reservas. Cada
-- columna es una decisión de qué historia cuenta ese atleta:
--
--   frec   entrenamientos por cada 6 días hábiles (0 = ya no viene)
--   ultimo días desde su última asistencia posible (10, 18 y 31 son los tres
--          que el tablero de fuga tiene que enseñar)
--   deuda  días de antigüedad de su cobro más viejo sin pagar (null = al día)
--   abono  % del cobro vencido que alcanzó a abonar (pago parcial)
--   baja   días desde que se retiró
-- -----------------------------------------------------------------------------
create temp table demo_atl on commit drop as
select
  d.n,
  ('a1c50000-0000-4000-8000-' || lpad(d.n::text, 12, '0'))::uuid as id,
  d.nombre, d.apellido, d.genero, d.edad, d.antig, d.estado, d.plan,
  d.corte, d.frec, d.ultimo, d.deuda, d.abono, d.fuente, d.motivo,
  (current_date - d.antig)::date as joined_on,
  case when d.baja is not null then (current_date - d.baja)::date end as churned_on,
  -- Nivel de fuerza de referencia del atleta, en kilos. Determinista: de aquí
  -- salen sus marcas y sus resultados de WOD, para que no se contradigan.
  (case when d.genero = 'M' then 70 + (d.n % 6) * 10 else 42 + (d.n % 5) * 7 end)::numeric as base_kg
from (values
  (1,  'Valentina',      'Ocampo',    'F', 29, 420, 'active',  'mensual',    5, 4,  1, null::int, 0,  'Instagram',              null::text,                                  null::int),
  (2,  'Santiago',       'Mosquera',  'M', 34, 395, 'active',  'mensual',    5, 3,  2, null,      0,  'Referido de un amigo',   null,                                        null),
  (3,  'Laura',          'Quintero',  'F', 26, 380, 'active',  'mensual',   10, 4,  1, null,      0,  'Pasó por el frente',     null,                                        null),
  (4,  'Andrés Felipe',  'Murillo',   'M', 31, 366, 'active',  'mensual',   10, 5,  0, null,      0,  'Instagram',              null,                                        null),
  (5,  'Daniela',        'Arboleda',  'F', 24, 350, 'active',  'estudiante',15, 3,  1, null,      0,  'Universidad Javeriana',  null,                                        null),
  (6,  'Juan Camilo',    'Restrepo',  'M', 38, 340, 'churned', 'mensual',    1, 0,125, null,      0,  'Google',                 'Lesión de hombro, no volvió',               120),
  (7,  'Mariana',        'Zapata',    'F', 27, 322, 'active',  'mensual',    1, 4,  0, null,      0,  'Referido de Valentina',  null,                                        null),
  (8,  'Sebastián',      'Caicedo',   'M', 22, 310, 'active',  'estudiante', 5, 3,  2, null,      0,  'Universidad del Valle',  null,                                        null),
  (9,  'Camila',         'Herrera',   'F', 33, 298, 'active',  'mensual',   20, 3,  1, null,      0,  'Instagram',              null,                                        null),
  (10, 'Jhon Freddy',    'Gutiérrez', 'M', 41, 290, 'overdue', 'mensual',   15, 2, 10, 40,        40, 'Referido',               null,                                        null),
  (11, 'Paola Andrea',   'Lozano',    'F', 36, 275, 'active',  'mensual',    5, 4,  0, null,      0,  'Pasó por el frente',     null,                                        null),
  (12, 'Julián',         'Bermúdez',  'M', 29, 260, 'active',  'mensual',   10, 2,  4, null,      0,  'Instagram',              null,                                        null),
  (13, 'Isabella',       'Rengifo',   'F', 23, 250, 'active',  'estudiante',20, 4,  1, null,      0,  'Referido',               null,                                        null),
  (14, 'Carlos Mario',   'Vélez',     'M', 45, 240, 'active',  'mensual',    1, 3,  0, null,      0,  'Google',                 null,                                        null),
  (15, 'Natalia',        'Cifuentes', 'F', 30, 228, 'active',  'mensual',   25, 2,  3, null,      0,  'Instagram',              null,                                        null),
  (16, 'Édison',         'Palacios',  'M', 27, 215, 'active',  'mensual',   15, 5,  0, null,      0,  'Referido',               null,                                        null),
  (17, 'Manuela',        'Tobón',     'F', 32, 205, 'frozen',  'mensual',    5, 0, 46, null,      0,  'Instagram',              null,                                        null),
  (18, 'Óscar Iván',     'Salazar',   'M', 39, 198, 'overdue', 'mensual',   10, 2, 18, 12,        0,  'Google',                 null,                                        null),
  (19, 'Diana Marcela',  'Bolaños',   'F', 28, 186, 'active',  'mensual',   20, 3,  1, null,      0,  'Referido',               null,                                        null),
  (20, 'Cristian',       'Vallejo',   'M', 35, 175, 'active',  'mensual',    1, 4,  0, null,      0,  'Instagram',              null,                                        null),
  (21, 'Alejandra',      'Guerrero',  'F', 31, 165, 'active',  'bono8',     10, 2,  3, null,      0,  'Pasó por el frente',     null,                                        null),
  (22, 'Wilson',         'Riascos',   'M', 43, 158, 'overdue', 'mensual',   15, 3,  2, 25,        0,  'Referido',               null,                                        null),
  (23, 'Melissa',        'Cardona',   'F', 25, 150, 'active',  'mensual',    5, 4,  1, null,      0,  'Instagram',              null,                                        null),
  (24, 'Mauricio',       'Cortés',    'M', 37, 142, 'churned', 'mensual',   10, 0, 95, null,      0,  'Google',                 'Se mudó a Bogotá',                          90),
  (25, 'Angie Paola',    'Sánchez',   'F', 26, 133, 'active',  'estudiante',20, 3,  2, null,      0,  'Universidad Santiago',   null,                                        null),
  (26, 'David',          'Escobar',   'M', 30, 125, 'frozen',  'mensual',   25, 0, 38, null,      0,  'Instagram',              null,                                        null),
  (27, 'Yuliana',        'Valencia',  'F', 34, 118, 'active',  'mensual',    5, 3,  0, null,      0,  'Referido',               null,                                        null),
  (28, 'Ricardo',        'Peláez',    'M', 48, 110, 'overdue', 'mensual',   15, 1, 30, 75,        0,  'Pasó por el frente',     null,                                        null),
  (29, 'Tatiana',        'Montoya',   'F', 29, 100, 'active',  'mensual',    1, 4,  1, null,      0,  'Instagram',              null,                                        null),
  (30, 'Nicolás',        'Aguirre',   'M', 24,  92, 'active',  'bono8',     10, 2,  2, null,      0,  'Referido',               null,                                        null),
  (31, 'Sandra Milena',  'Trujillo',  'F', 40,  85, 'active',  'mensual',   20, 3,  0, null,      0,  'Google',                 null,                                        null),
  (32, 'Fabián',         'Lasso',     'M', 33,  78, 'churned', 'mensual',    5, 0, 58, null,      0,  'Instagram',              'Se fue a un gimnasio más cerca de la casa', 55),
  (33, 'Katherine',      'Obando',    'F', 27,  70, 'active',  'mensual',   10, 4,  1, null,      0,  'Instagram',              null,                                        null),
  (34, 'Jorge Eliécer',  'Marín',     'M', 52,  62, 'churned', 'mensual',   15, 0, 28, null,      0,  'Recomendación médica',   'Probó un mes y no siguió',                  25),
  (35, 'Lorena',         'Betancourt','F', 31,  55, 'active',  'mensual',   25, 3,  0, null,      0,  'Instagram',              null,                                        null),
  (36, 'Duván',          'Angulo',    'M', 26,  45, 'active',  'mensual',    1, 4,  1, null,      0,  'Pasó por el frente',     null,                                        null),
  (37, 'Sara',           'Villegas',  'F', 22,  38, 'active',  'estudiante', 5, 3,  2, null,      0,  'Universidad Javeriana',  null,                                        null),
  (38, 'Esteban',        'Pizarro',   'M', 29,  30, 'active',  'mensual',   10, 3,  0, 3,         0,  'Instagram',              null,                                        null),
  (39, 'Liliana',        'Grajales',  'F', 35,  22, 'active',  'mensual',   20, 2,  1, 6,         50, 'Referido',               null,                                        null),
  (40, 'Kevin',          'Mosquera',  'M', 21,  12, 'trial',   'dropin',    15, 2,  1, null,      0,  'Instagram',              null,                                        null)
) as d(n, nombre, apellido, genero, edad, antig, estado, plan, corte, frec, ultimo, deuda, abono, fuente, motivo, baja);

insert into public.athletes (
  id, org_id, first_name, last_name, document_id, birth_date, gender, phone, email,
  emergency_contact_name, emergency_contact_phone,
  referral_source, joined_on, status, churned_on, churn_reason, tags,
  consent_data_at, consent_whatsapp_at, created_at
)
select
  a.id, 'b0c50000-0000-4000-8000-000000000001',
  a.nombre, a.apellido,
  (1000000000 + a.n * 7654321)::text,
  (current_date - (a.edad * 365 + a.n))::date,
  a.genero,
  '+5730012345' || lpad(a.n::text, 2, '0'),
  translate(lower(a.nombre || '.' || a.apellido), 'áéíóúüñ ', 'aeiouun.') || '@correo.co',
  case when a.n % 3 = 0 then 'Familiar' else 'Pareja' end,
  '+5730098765' || lpad(a.n::text, 2, '0'),
  a.fuente, a.joined_on, a.estado, a.churned_on, a.motivo,
  case
    when a.plan = 'estudiante' then array['universitario']
    when a.plan = 'bono8'      then array['bono']
    when a.estado = 'trial'    then array['prueba']
    else '{}'::text[]
  end,
  -- El consentimiento se guarda con su fecha: la fecha es la evidencia.
  (a.joined_on::timestamp + interval '10 hours') at time zone 'America/Bogota',
  -- Dos no autorizaron WhatsApp. Son los que el botón de mensaje NO debe ofrecer.
  case when a.n not in (12, 31)
       then (a.joined_on::timestamp + interval '10 hours') at time zone 'America/Bogota' end,
  (a.joined_on::timestamp + interval '10 hours') at time zone 'America/Bogota'
from demo_atl a;

-- Datos sensibles, en su propia tabla y con su propio consentimiento.
insert into public.athlete_health (athlete_id, org_id, injuries, medical_notes, consent_health_at)
select a.id, 'b0c50000-0000-4000-8000-000000000001', h.lesion, h.nota,
       (a.joined_on::timestamp + interval '10 hours') at time zone 'America/Bogota'
from demo_atl a
join (values
  (6,  'Manguito rotador derecho (2 cirugías)', 'Sin trabajo por encima de la cabeza. Sustituir con landmine press.'),
  (14, 'Hernia discal L4-L5 en 2019',           'Peso muerto solo con barra hexagonal y tope de 80 kg.'),
  (28, 'Menisco izquierdo',                     'Evitar box jump; escalonar con step-up.'),
  (34, 'Hipertensión controlada',               'Toma losartán. Evitar apneas largas en levantamientos pesados.'),
  (17, 'Embarazo (semana 22)',                  'Programación adaptada. Suspendió la mensualidad, vuelve después del parto.')
) as h(n, lesion, nota) on h.n = a.n;

insert into public.athlete_coach_notes (athlete_id, org_id, notes, updated_by)
select a.id, 'b0c50000-0000-4000-8000-000000000001', c.nota,
       'd1c50000-0000-4000-8000-000000000002'
from demo_atl a
join (values
  (10, 'Buen ambiente con el grupo de las 6 a. m. Se le venció la mensualidad y dejó de venir; vale la pena llamarlo, no escribirle.'),
  (18, 'Cambió de trabajo y le queda difícil el horario de la mañana. Proponerle el de las 7 p. m.'),
  (28, 'Lleva un mes sin aparecer. Preguntó por congelar en vez de cancelar: ofrecérselo antes de perderlo.'),
  (4,  'Listo para competir en el clasificatorio de noviembre. Le falta el muscle-up estricto.'),
  (37, 'Recién entra. Todavía no sabe escalar sola: revisarle los pesos en cada metcon.')
) as c(n, nota) on c.n = a.n;

-- -----------------------------------------------------------------------------
-- 5 · Equipo
-- -----------------------------------------------------------------------------
insert into public.memberships (org_id, user_id, role, permissions, athlete_id, status, accepted_at) values
  ('b0c50000-0000-4000-8000-000000000001', 'd1c50000-0000-4000-8000-000000000001', 'owner', '{}'::jsonb, null, 'active', now() - interval '430 days'),
  -- El coach NO lleva can_view_finances: la cartera y los gastos le devuelven
  -- cero filas por RLS, no una pantalla escondida por el router.
  ('b0c50000-0000-4000-8000-000000000001', 'd1c50000-0000-4000-8000-000000000002', 'coach', '{}'::jsonb, null, 'active', now() - interval '300 days'),
  ('b0c50000-0000-4000-8000-000000000001', 'd1c50000-0000-4000-8000-000000000003', 'athlete', '{}'::jsonb,
   'a1c50000-0000-4000-8000-000000000001', 'active', now() - interval '400 days');

-- -----------------------------------------------------------------------------
-- 6 · Suscripciones
-- -----------------------------------------------------------------------------
-- Una por atleta, salvo el de drop-in (paga suelto, no tiene membresía) y los
-- retirados, cuya suscripción queda cancelada con su motivo.
-- -----------------------------------------------------------------------------
insert into public.subscriptions (
  id, org_id, athlete_id, plan_id, price_cents, discount_cents, discount_reason,
  started_on, ends_on, billing_day, status, cancel_reason, paused_from, paused_until
)
select
  ('5bc50000-0000-4000-8000-' || lpad(a.n::text, 12, '0'))::uuid,
  'b0c50000-0000-4000-8000-000000000001', a.id,
  p.id, p.price_cents,
  -- Dos descuentos reales de box: el que trajo gente y la pareja que entrena junta.
  case when a.n in (7, 20) then 2000000 else 0 end,
  case when a.n in (7, 20) then 'Trajo un referido que ya lleva tres meses' end,
  a.joined_on,
  a.churned_on,
  a.corte,
  case a.estado when 'churned' then 'cancelled' when 'frozen' then 'paused' else 'active' end,
  a.motivo,
  case when a.estado = 'frozen' then (current_date - a.ultimo)::date end,
  case when a.estado = 'frozen' then (current_date + 30)::date end
from demo_atl a
join (values
  ('mensual',    '91c50000-0000-4000-8000-000000000001'::uuid, 18000000::bigint),
  ('bono8',      '91c50000-0000-4000-8000-000000000002'::uuid, 13000000),
  ('estudiante', '91c50000-0000-4000-8000-000000000003'::uuid, 15000000)
) as p(clave, id, price_cents) on p.clave = a.plan;

-- -----------------------------------------------------------------------------
-- 7 · Un año de cobros y pagos
-- -----------------------------------------------------------------------------
-- Se arma primero la tabla completa de cobros (con su fecha de vencimiento y si
-- está pagado o no) y de ahí salen las dos inserciones. Hacerlo así es lo que
-- permite que la mora tenga EXACTAMENTE la antigüedad que dice la columna
-- `deuda`: el cobro más viejo sin pagar vence en `current_date - deuda`, no en
-- una fecha fija que envejece sola y descuadra la demo en dos meses.
--
-- El estado del cobro no se escribe a mano: lo calcula el trigger
-- `payments_recalc_invoice` cuando entra el pago (pagado / abono parcial). Solo
-- al final se marcan como `overdue` los que vencieron y nadie tocó.
-- -----------------------------------------------------------------------------
create temp table demo_cobros on commit drop as
with fechas as (
  select
    a.n, a.id as athlete_id, a.joined_on, a.churned_on, a.deuda, a.abono, a.corte,
    s.id as sub_id, (s.price_cents - s.discount_cents) as monto,
    m.m,
    (date_trunc('month', current_date) - (m.m || ' months')::interval)::date as mes_inicio,
    (date_trunc('month', current_date) - (m.m || ' months')::interval
       + interval '1 month - 1 day')::date as mes_fin,
    case when a.deuda is not null
         then date_trunc('month', current_date - a.deuda)::date end as mes_impago
  from demo_atl a
  join public.subscriptions s on s.athlete_id = a.id
  cross join generate_series(0, 12) as m(m)
),
con_vencimiento as (
  select f.*,
    case
      when f.mes_impago is not null and f.mes_inicio = f.mes_impago
        then (current_date - f.deuda)::date
      -- Cuatro cobros del mes en curso vencen la semana entrante, caiga donde
      -- caiga su día de corte. Sin esto, el tramo "por vencer" del tablero se
      -- queda vacío los días 26 a 31 de cada mes y parece que la pantalla está
      -- rota justo cuando uno la está enseñando.
      when f.m = 0 and f.n in (11, 23, 29, 35)
        then (current_date + 2 + (f.n % 5))::date
      else (f.mes_inicio + (least(f.corte, extract(day from f.mes_fin)::int) - 1))::date
    end as due_on
  from fechas f
),
filtradas as (
  select c.*,
    case
      when c.mes_impago is not null and c.mes_inicio >= c.mes_impago then false
      when c.due_on <= current_date then true
      -- Unos cuantos pagan antes de que les venza. Si no, el tramo "por vencer"
      -- del tablero de cartera se llenaría con todo el box.
      when c.n % 3 = 0 then true
      else false
    end as pagado
  from con_vencimiento c
  where c.mes_inicio >= date_trunc('month', c.joined_on)::date
    and c.due_on >= c.joined_on
    and c.due_on <= current_date + 31
    and (c.churned_on is null or c.due_on <= c.churned_on)
)
select
  ('c0b50000-0000-4000-8000-' || lpad((f.n * 100 + f.m)::text, 12, '0'))::uuid as id,
  f.n, f.m, f.athlete_id, f.sub_id, f.monto, f.mes_inicio, f.mes_fin, f.due_on,
  f.pagado, f.abono,
  (f.mes_impago is not null and f.mes_inicio = f.mes_impago) as es_deuda_mas_vieja,
  row_number() over (order by f.due_on, f.n) as consecutivo
from filtradas f;

insert into public.invoices (
  id, org_id, athlete_id, subscription_id, number,
  period_start, period_end, issued_on, due_on, amount_cents, status, notes
)
select
  c.id, 'b0c50000-0000-4000-8000-000000000001', c.athlete_id, c.sub_id,
  'F-' || to_char(c.consecutivo, 'FM000000'),
  c.mes_inicio, c.mes_fin,
  greatest(c.due_on - 3, c.mes_inicio) as issued_on,
  c.due_on, c.monto, 'open',
  case when c.abono > 0 and c.es_deuda_mas_vieja
       then 'Quedó de completar el saldo con la prima.' end
from demo_cobros c;

-- El consecutivo queda donde lo dejó la semilla: el próximo cobro que genere el
-- job sigue la numeración, no vuelve a F-000001.
insert into public.org_counters (org_id, invoice_seq)
select 'b0c50000-0000-4000-8000-000000000001', coalesce(max(c.consecutivo), 0) from demo_cobros c
on conflict (org_id) do update set invoice_seq = excluded.invoice_seq;

-- Pagos completos
insert into public.payments (
  org_id, athlete_id, invoice_id, amount_cents, method, paid_at, reference,
  provider, recorded_by, status
)
select
  'b0c50000-0000-4000-8000-000000000001', c.athlete_id, c.id, c.monto,
  (array['nequi','transfer','cash','daviplata','pse','card'])[1 + ((c.n + c.m) % 6)],
  ((greatest(least(c.due_on + ((c.n % 5) - 2), current_date), c.mes_inicio)::timestamp
     + interval '15 hours') at time zone 'America/Bogota'),
  case when (c.n + c.m) % 6 in (0, 3) then 'M' || lpad((c.n * 137 + c.m)::text, 8, '0') end,
  'manual', 'd1c50000-0000-4000-8000-000000000001', 'confirmed'
from demo_cobros c
where c.pagado;

-- Abonos parciales: pagó una parte y quedó debiendo el resto. El trigger deja
-- el cobro en `partial`, que es un estado distinto de "no pagó nada" y el
-- tablero de cartera los cuenta por separado.
insert into public.payments (
  org_id, athlete_id, invoice_id, amount_cents, method, paid_at, reference,
  provider, recorded_by, status
)
select
  'b0c50000-0000-4000-8000-000000000001', c.athlete_id, c.id,
  (c.monto * c.abono / 100)::bigint, 'cash',
  ((least(c.due_on + 2, current_date)::timestamp + interval '15 hours') at time zone 'America/Bogota'),
  null, 'manual', 'd1c50000-0000-4000-8000-000000000001', 'confirmed'
from demo_cobros c
where not c.pagado and c.abono > 0 and c.es_deuda_mas_vieja;

-- Lo que venció y nadie pagó. El trigger ya marcó los que tienen abono.
update public.invoices
   set status = 'overdue'
 where org_id = 'b0c50000-0000-4000-8000-000000000001'
   and status = 'open'
   and paid_cents = 0
   and due_on < current_date;

-- Y ahora sí el estado del atleta. Va DESPUÉS de los pagos a propósito: el
-- trigger `zz_payments_cancela_cobros` devuelve a 'active' a quien recibe un
-- pago y ya no tiene nada vencido, así que marcar antes sería marcar en vano.
-- Diez días es el plazo de gracia del box: deber desde ayer no es estar en mora.
update public.athletes a
   set status = 'overdue'
 where a.org_id = 'b0c50000-0000-4000-8000-000000000001'
   and a.status = 'active'
   and exists (
     select 1 from public.invoices i
     where i.athlete_id = a.id
       and i.status in ('overdue', 'partial')
       and i.due_on < current_date - 10
   );

-- Clases sueltas: el que está de paso paga y ya. No hay cobro que perseguir,
-- pero sí es plata del mes y tiene que aparecer en el P&L.
insert into public.payments (
  org_id, athlete_id, invoice_id, amount_cents, method, paid_at, reference,
  provider, recorded_by, status
)
select
  'b0c50000-0000-4000-8000-000000000001', a.id, null, 2000000,
  (array['cash','nequi','daviplata'])[1 + (d % 3)],
  ((current_date - d)::timestamp + interval '18 hours') at time zone 'America/Bogota',
  'Drop-in', 'manual', 'd1c50000-0000-4000-8000-000000000002', 'confirmed'
from demo_atl a
cross join (values (2), (5), (9), (12)) as v(d)
where a.n = 40 and (current_date - d) > a.joined_on;

-- -----------------------------------------------------------------------------
-- 8 · Asistencia
-- -----------------------------------------------------------------------------
-- Seis meses de check-ins. La frecuencia sale de la columna `frec` y el corte
-- de `ultimo`: por eso hay quien viene cuatro veces por semana, quien viene una
-- y tres que dejaron de venir hace 10, 18 y 30 días. Esos tres son los que
-- tiene que enseñar la pantalla de riesgo de fuga, que es el argumento de venta.
--
-- Aquí se siembra de 14 días hacia atrás y con `class_id` nulo: es el check-in
-- de piso, el que el coach marca en la tableta sin que nadie haya reservado. Las
-- dos últimas semanas NO se escriben aquí — salen de las reservas de la sección
-- siguiente, que es como las produce el sistema en el día a día.
--
-- La fila forzada del final garantiza que la última visita caiga EXACTAMENTE
-- donde dice `ultimo`, incluso si ese día el módulo no le tocaba entrenar. Si
-- ese día es domingo se corre un día hacia atrás: el box no abre los domingos.
-- -----------------------------------------------------------------------------
insert into public.attendances (org_id, athlete_id, date, status, checked_in_at)
select
  'b0c50000-0000-4000-8000-000000000001', a.id, (current_date - d)::date, 'attended',
  ((current_date - d)::timestamp
    + ((array[5, 6, 7, 12, 17, 18, 19])[1 + (a.n % 7)] || ' hours')::interval)
    at time zone 'America/Bogota'
from demo_atl a
cross join generate_series(14, 179) as g(d)
where extract(dow from current_date - d) <> 0
  and d >= a.ultimo
  and (current_date - d) > a.joined_on
  and ((a.n + d) % 6) < (case when a.frec = 0 then 3 else a.frec end)
on conflict do nothing;

insert into public.attendances (org_id, athlete_id, date, status, checked_in_at)
select
  'b0c50000-0000-4000-8000-000000000001', a.id,
  (current_date - v.d)::date, 'attended',
  ((current_date - v.d)::timestamp
    + ((array[5, 6, 7, 12, 17, 18, 19])[1 + (a.n % 7)] || ' hours')::interval)
    at time zone 'America/Bogota'
from demo_atl a
cross join lateral (
  select a.ultimo + case when extract(dow from current_date - a.ultimo) = 0 then 1 else 0 end as d
) v
where (current_date - v.d) > a.joined_on
  and v.d >= 14          -- los últimos 14 días los pone el check-in de la clase
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 9 · Parrilla semanal
-- -----------------------------------------------------------------------------
-- Las franjas típicas de un box colombiano: el pico de verdad es 5-7 a. m. y
-- 5-7 p. m., y el mediodía es una clase pequeña. docs/08 §4.
-- -----------------------------------------------------------------------------
insert into public.class_templates (id, org_id, name, weekday, start_time, duration_min, capacity, coach_id, valid_from)
select
  ('c1a50000-0000-4000-8000-' || lpad((wd.d * 10 + h.i)::text, 12, '0'))::uuid,
  'b0c50000-0000-4000-8000-000000000001', h.nombre, wd.d, h.hora, 60, h.cupo,
  'd1c50000-0000-4000-8000-000000000002', (current_date - 430)::date
from generate_series(1, 5) as wd(d)
cross join (values
  (1, '05:00'::time, 12, 'Entrenamiento funcional'),
  (2, '06:00'::time, 16, 'Entrenamiento funcional'),
  (3, '07:00'::time, 14, 'Entrenamiento funcional'),
  (4, '12:00'::time, 10, 'Funcional mediodía'),
  (5, '17:00'::time, 16, 'Entrenamiento funcional'),
  (6, '18:00'::time, 18, 'Entrenamiento funcional'),
  (7, '19:00'::time, 16, 'Entrenamiento funcional')
) as h(i, hora, cupo, nombre);

insert into public.class_templates (id, org_id, name, weekday, start_time, duration_min, capacity, coach_id, valid_from)
values
  ('c1a50000-0000-4000-8000-000000000601', 'b0c50000-0000-4000-8000-000000000001',
   'Entrenamiento funcional', 6, '08:00', 60, 18, 'd1c50000-0000-4000-8000-000000000002', (current_date - 430)::date),
  ('c1a50000-0000-4000-8000-000000000602', 'b0c50000-0000-4000-8000-000000000001',
   'Sábado en parejas', 6, '09:00', 75, 16, 'd1c50000-0000-4000-8000-000000000002', (current_date - 430)::date);

-- La parrilla real de las próximas semanas la genera la misma función del job
-- diario: si la semilla la escribiera a mano, estaría probando otra cosa.
do $$ begin
  perform public.generate_classes('b0c50000-0000-4000-8000-000000000001'::uuid);
end $$;

-- Las dos semanas pasadas también tuvieron clases, y `generate_classes` no las
-- crea hacia atrás (no tendría por qué: es un job que mira al futuro). Se
-- siembran aquí para que la asistencia reciente cuelgue de una clase de verdad
-- y no de un check-in suelto.
insert into public.classes (org_id, template_id, name, starts_at, ends_at, capacity, coach_id)
select
  'b0c50000-0000-4000-8000-000000000001', t.id, t.name,
  ((current_date - g.d)::timestamp + t.start_time) at time zone 'America/Bogota',
  (((current_date - g.d)::timestamp + t.start_time) at time zone 'America/Bogota')
    + (t.duration_min || ' minutes')::interval,
  t.capacity, t.coach_id
from generate_series(0, 13) as g(d)
join public.class_templates t
  on t.org_id = 'b0c50000-0000-4000-8000-000000000001'
 and t.weekday = extract(dow from current_date - g.d)::int
where (((current_date - g.d)::timestamp + t.start_time) at time zone 'America/Bogota') < now()
on conflict do nothing;

-- El check-in: la reserva marcada `attended` es la que escribe la asistencia,
-- por trigger. Cada atleta entra a la clase de su horario (el de las 5 a. m. no
-- aparece a las 7 p. m.), y el sábado el box parte el grupo en dos clases.
with pasadas as (
  select c.id, c.starts_at,
         (current_date - (c.starts_at at time zone 'America/Bogota')::date) as d,
         extract(hour from (c.starts_at at time zone 'America/Bogota'))::int as hora,
         extract(dow  from (c.starts_at at time zone 'America/Bogota'))::int as dow
  from public.classes c
  where c.org_id = 'b0c50000-0000-4000-8000-000000000001'
    and c.starts_at < now()
    and c.starts_at > now() - interval '14 days'
)
insert into public.reservations (
  org_id, class_id, athlete_id, subscription_id, status, source, booked_at, checked_in_at
)
select
  'b0c50000-0000-4000-8000-000000000001', p.id, a.id, s.id, 'attended',
  (array['app','app','app','staff','walk_in'])[1 + (a.n % 5)],
  p.starts_at - interval '20 hours',
  p.starts_at + interval '4 minutes'
from pasadas p
join demo_atl a
  on p.hora = (case when p.dow = 6
                    then (case when a.n % 2 = 0 then 8 else 9 end)
                    else (array[5, 6, 7, 12, 17, 18, 19])[1 + (a.n % 7)] end)
 and p.d >= a.ultimo
 and (current_date - p.d) > a.joined_on
 and (((a.n + p.d) % 6) < (case when a.frec = 0 then 3 else a.frec end)
      or p.d = a.ultimo + case when extract(dow from current_date - a.ultimo) = 0 then 1 else 0 end)
left join public.subscriptions s on s.athlete_id = a.id and s.status = 'active'
on conflict do nothing;

-- Reservó y no apareció. No es una curiosidad: es la señal que más molesta al
-- box (ocupó un cupo que alguien más quería) y una de las seis que suma puntos
-- en el riesgo de fuga.
with pasadas as (
  select c.id, c.starts_at,
         (current_date - (c.starts_at at time zone 'America/Bogota')::date) as d,
         extract(hour from (c.starts_at at time zone 'America/Bogota'))::int as hora,
         extract(dow  from (c.starts_at at time zone 'America/Bogota'))::int as dow
  from public.classes c
  where c.org_id = 'b0c50000-0000-4000-8000-000000000001'
    and c.starts_at < now()
    and c.starts_at > now() - interval '14 days'
)
insert into public.reservations (
  org_id, class_id, athlete_id, subscription_id, status, source, booked_at,
  late_cancel, cancelled_at, cancelled_by
)
select
  'b0c50000-0000-4000-8000-000000000001', p.id, a.id, s.id,
  case when (a.n + p.d) % 3 = 0 then 'cancelled' else 'no_show' end,
  'app', p.starts_at - interval '20 hours',
  ((a.n + p.d) % 3 = 0),
  case when (a.n + p.d) % 3 = 0 then p.starts_at - interval '40 minutes' end,
  case when (a.n + p.d) % 3 = 0 then 'athlete' end
from pasadas p
join demo_atl a
  on p.hora = (case when p.dow = 6
                    then (case when a.n % 2 = 0 then 8 else 9 end)
                    else (array[5, 6, 7, 12, 17, 18, 19])[1 + (a.n % 7)] end)
 and a.n in (10, 12, 15, 18, 22, 28)
 and (a.n + p.d) % 4 = 0
 and (current_date - p.d) > a.joined_on
left join public.subscriptions s on s.athlete_id = a.id and s.status = 'active'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 10 · Reservas
-- -----------------------------------------------------------------------------
-- Primero la clase llena: la siguiente de las 6 p. m. se llena hasta el cupo y
-- deja tres en lista de espera. Es la pantalla que hay que enseñar, porque el
-- box que llena las 6 p. m. es el que tiene el problema que esto resuelve.
-- -----------------------------------------------------------------------------
with clase as (
  select c.id, c.capacity
  from public.classes c
  where c.org_id = 'b0c50000-0000-4000-8000-000000000001'
    and c.status = 'scheduled'
    and c.starts_at > now()
    and extract(hour from (c.starts_at at time zone 'America/Bogota')) = 18
  order by c.starts_at
  limit 1
),
candidatos as (
  select cl.id as class_id, cl.capacity, a.id as athlete_id, a.n,
         row_number() over (order by a.n) as rn
  from clase cl
  join demo_atl a on a.estado in ('active', 'overdue', 'trial')
)
insert into public.reservations (
  org_id, class_id, athlete_id, subscription_id, status, waitlist_pos, source, booked_at
)
select
  'b0c50000-0000-4000-8000-000000000001', c.class_id, c.athlete_id, s.id,
  case when c.rn <= c.capacity then 'booked' else 'waitlisted' end,
  case when c.rn > c.capacity then c.rn - c.capacity end,
  (array['app','app','app','staff','whatsapp'])[1 + (c.n % 5)],
  now() - ((30 - c.rn) || ' hours')::interval
from candidatos c
left join public.subscriptions s on s.athlete_id = c.athlete_id and s.status = 'active'
where c.rn <= c.capacity + 3
on conflict do nothing;

-- Y el resto de las clases de los próximos tres días, con ocupación despareja:
-- la de las 5 a. m. va corta y la de la tarde va llena. Ninguna se pasa del
-- cupo, que es lo que el sistema tiene que garantizar.
with clases as (
  select c.id, c.capacity, c.starts_at,
         row_number() over (order by c.starts_at) as i
  from public.classes c
  where c.org_id = 'b0c50000-0000-4000-8000-000000000001'
    and c.status = 'scheduled'
    and c.starts_at between now() and now() + interval '3 days'
    and not exists (select 1 from public.reservations r where r.class_id = c.id)
),
candidatos as (
  select cl.id as class_id, cl.capacity, cl.i, a.id as athlete_id, a.n,
         row_number() over (partition by cl.id order by ((a.n * 7 + cl.i) % 41)) as rn
  from clases cl
  join demo_atl a on a.estado in ('active', 'trial')
    and ((a.n * 3 + cl.i) % 9) < 4
)
insert into public.reservations (
  org_id, class_id, athlete_id, subscription_id, status, source, booked_at
)
select
  'b0c50000-0000-4000-8000-000000000001', c.class_id, c.athlete_id, s.id, 'booked',
  (array['app','app','app','staff','whatsapp'])[1 + (c.n % 5)],
  now() - ((24 - (c.rn % 20)) || ' hours')::interval
from candidatos c
left join public.subscriptions s on s.athlete_id = c.athlete_id and s.status = 'active'
where c.rn <= greatest(c.capacity - 2 - (c.i % 5), 1)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 11 · Entrenamientos de las últimas ocho semanas
-- -----------------------------------------------------------------------------
-- Ocho plantillas que rotan por día (el box no improvisa: tiene ciclo). Cada
-- día lleva sus tres bloques —calentamiento, fuerza y metcon— y los que miden
-- un movimiento del catálogo van enlazados a él: así el resultado del WOD
-- alimenta la marca personal por trigger, sin que nadie la escriba dos veces.
-- -----------------------------------------------------------------------------
create temp table demo_wod on commit drop as
select * from (values
  (0, 'Fran',
      'Día de referencia. El que ya tiene Fran, que la compare con la última vez.',
      '3 rondas: 10 air squats, 10 pass through con PVC, 200 m de trote suave',
      'Thruster', 'Thruster 5-5-5, subiendo. Sin pasar del 70% del clean.', 'Thruster', 0.60::numeric,
      'Fran', '21-15-9 · Thruster 43/30 kg + Pull-ups', 'Fran', 600, 210,
      '{"rx":"43/30 kg, pull-ups","scaled":"30/20 kg, pull-ups con banda","beginner":"20/15 kg, ring rows"}'::jsonb),
  (1, 'Fuerza de piernas + remo',
      'Ojo con la profundidad del squat antes de subir kilos.',
      '10 min de movilidad de cadera y tobillo + 2 rondas de 10 goblet squats',
      'Back Squat', 'Back Squat 5x3 al 80% del 1RM.', 'Back Squat', 1.00,
      'Intervalos de remo', '5 rondas: 250 m de remo / 1 min de descanso', null, 900, 480,
      '{"rx":"250 m","scaled":"200 m","beginner":"150 m"}'::jsonb),
  (2, 'Grace',
      'Técnica primero. La barra pesada no arregla un jalón feo.',
      'Barra vacía: 10 deadlift, 10 hang power clean, 10 push press',
      'Clean & Jerk', 'Clean & Jerk técnico: 6x2 al 70%.', 'Clean & Jerk', 0.75,
      'Grace', '30 Clean & Jerk 61/43 kg por tiempo', 'Grace', 720, 195,
      '{"rx":"61/43 kg","scaled":"43/30 kg","beginner":"30/20 kg"}'::jsonb),
  (3, 'Helen',
      'Salir despacio en la primera ronda. La carrera no es donde se gana.',
      '400 m de trote suave + 2 rondas de 10 swings ligeros y 10 ring rows',
      'Peso muerto', 'Deadlift 3x5 pesado, parando en el suelo.', 'Deadlift', 1.25,
      'Helen', '3 rondas: 400 m + 21 kettlebell swings 24/16 kg + 12 pull-ups', 'Helen', 900, 600,
      '{"rx":"24/16 kg, pull-ups","scaled":"16/12 kg, pull-ups con banda","beginner":"12/8 kg, ring rows"}'::jsonb),
  (4, 'Cindy',
      'Ritmo constante. El que sale en 10 rondas la primera mitad, termina caminando.',
      'Escalera 1-2-3-4-5 de pull-up, push-up y air squat',
      'Press militar', 'Shoulder Press 5x5, estricto.', 'Shoulder Press', 0.50,
      'Cindy', 'AMRAP 20 min: 5 pull-ups, 10 push-ups, 15 air squats', 'Cindy', null, 0,
      '{"rx":"pull-up estricto","scaled":"pull-up con banda","beginner":"ring rows y push-up en cajón"}'::jsonb),
  (5, 'Karen',
      'Que nadie suelte el balón antes de 20. Se rompe en series desde el principio.',
      '3 rondas: 10 wall balls ligeros, 10 good mornings con PVC',
      'Front Squat', 'Front Squat 4x4 al 75%.', 'Front Squat', 0.85,
      'Karen', '150 wall balls 9/6 kg al objetivo de 3 m por tiempo', 'Karen', 1200, 640,
      '{"rx":"9/6 kg a 3 m","scaled":"6/4 kg a 2,7 m","beginner":"4 kg, squat sin lanzar"}'::jsonb),
  (6, 'Cien burpees',
      'Prueba de cabeza más que de piernas. Se cuenta de a diez.',
      'Movilidad de hombro + 2 rondas de 8 burpees suaves y 10 hollow rocks',
      'Snatch', 'Power snatch técnico: 8x2.', 'Snatch', 0.55,
      '100 Burpees', '100 burpees por tiempo', '100 Burpees', 900, 430,
      '{"rx":"burpee con pecho al suelo","scaled":"burpee sin salto","beginner":"burpee en cajón"}'::jsonb),
  (7, 'Chipper del sábado',
      'Sábado en parejas: el que llega solo se empareja en la puerta.',
      'Relevos de 200 m por equipos y movilidad general',
      'Press de banca', 'Bench Press 5x5.', 'Bench Press', 0.75,
      'Chipper por parejas', 'En parejas, 40 min: 100 cal de remo, 80 wall balls, 60 box jumps, 40 burpees over bar, 20 muscle-ups',
      null, 2400, 1850,
      '{"rx":"muscle-up","scaled":"chest to bar","beginner":"jalón en anillas"}'::jsonb)
) as t(k, titulo, notas, calentamiento,
       fuerza_titulo, fuerza_desc, fuerza_mov, fuerza_factor,
       metcon_titulo, metcon_desc, metcon_mov, metcon_cap, metcon_base, escala);

insert into public.wods (id, org_id, date, title, notes, published_at, created_by)
select
  ('40d50000-0000-4000-8000-' || lpad(g.d::text, 12, '0'))::uuid,
  'b0c50000-0000-4000-8000-000000000001',
  (current_date - g.d)::date, t.titulo, t.notas,
  -- Publicado a las 5:30 a. m. del día del box: es cuando el atleta lo abre.
  ((current_date - g.d)::timestamp + interval '5 hours 30 minutes') at time zone 'America/Bogota',
  'd1c50000-0000-4000-8000-000000000002'
from generate_series(0, 55) as g(d)
join demo_wod t on t.k = (g.d % 8)
where extract(dow from current_date - g.d) <> 0;

insert into public.wod_blocks (id, org_id, wod_id, position, kind, title, description, score_type, time_cap_sec, scaling, movement_id)
select
  ('b10c0000-0000-4000-8000-' || lpad((g.d * 10 + 1)::text, 12, '0'))::uuid,
  'b0c50000-0000-4000-8000-000000000001',
  ('40d50000-0000-4000-8000-' || lpad(g.d::text, 12, '0'))::uuid,
  1, 'warmup', 'Calentamiento', t.calentamiento, 'not_scored', null, '{}'::jsonb, null
from generate_series(0, 55) as g(d)
join demo_wod t on t.k = (g.d % 8)
where extract(dow from current_date - g.d) <> 0;

insert into public.wod_blocks (id, org_id, wod_id, position, kind, title, description, score_type, time_cap_sec, scaling, movement_id)
select
  ('b10c0000-0000-4000-8000-' || lpad((g.d * 10 + 2)::text, 12, '0'))::uuid,
  'b0c50000-0000-4000-8000-000000000001',
  ('40d50000-0000-4000-8000-' || lpad(g.d::text, 12, '0'))::uuid,
  2, 'strength', t.fuerza_titulo, t.fuerza_desc, 'load', null, '{}'::jsonb,
  (select m.id from public.movements m where m.org_id is null and m.name = t.fuerza_mov)
from generate_series(0, 55) as g(d)
join demo_wod t on t.k = (g.d % 8)
where extract(dow from current_date - g.d) <> 0;

insert into public.wod_blocks (id, org_id, wod_id, position, kind, title, description, score_type, time_cap_sec, scaling, movement_id)
select
  ('b10c0000-0000-4000-8000-' || lpad((g.d * 10 + 3)::text, 12, '0'))::uuid,
  'b0c50000-0000-4000-8000-000000000001',
  ('40d50000-0000-4000-8000-' || lpad(g.d::text, 12, '0'))::uuid,
  3, 'metcon', t.metcon_titulo, t.metcon_desc,
  case when t.metcon_titulo = 'Cindy' then 'amrap' else 'for_time' end,
  t.metcon_cap, t.escala,
  (select m.id from public.movements m where m.org_id is null and m.name = t.metcon_mov)
from generate_series(0, 55) as g(d)
join demo_wod t on t.k = (g.d % 8)
where extract(dow from current_date - g.d) <> 0;

-- El WOD de mañana y el de pasado ya están programados, pero SIN publicar: es
-- el estado normal del coach los domingos por la noche y lo que distingue
-- "estoy programando la semana" de "esto es lo que toca hoy".
insert into public.wods (id, org_id, date, title, notes, published_at, created_by)
select
  ('40d50000-0000-4000-8000-' || lpad((900 + g.d)::text, 12, '0'))::uuid,
  'b0c50000-0000-4000-8000-000000000001',
  (current_date + g.d)::date, t.titulo, 'Borrador, falta revisar los pesos.', null,
  'd1c50000-0000-4000-8000-000000000002'
from generate_series(1, 2) as g(d)
join demo_wod t on t.k = ((g.d + 3) % 8)
where extract(dow from current_date + g.d) <> 0;

insert into public.wod_blocks (id, org_id, wod_id, position, kind, title, description, score_type, time_cap_sec, scaling, movement_id)
select
  ('b10c0000-0000-4000-8000-' || lpad((9000 + g.d * 10 + 3)::text, 12, '0'))::uuid,
  'b0c50000-0000-4000-8000-000000000001',
  ('40d50000-0000-4000-8000-' || lpad((900 + g.d)::text, 12, '0'))::uuid,
  3, 'metcon', t.metcon_titulo, t.metcon_desc,
  case when t.metcon_titulo = 'Cindy' then 'amrap' else 'for_time' end,
  t.metcon_cap, t.escala,
  (select m.id from public.movements m where m.org_id is null and m.name = t.metcon_mov)
from generate_series(1, 2) as g(d)
join demo_wod t on t.k = ((g.d + 3) % 8)
where extract(dow from current_date + g.d) <> 0;

-- A cada clase se le cuelga el WOD de su día, que es como lo ve el coach cuando
-- abre la clase en la tableta.
update public.classes c
   set wod_id = w.id
  from public.wods w
 where c.org_id = 'b0c50000-0000-4000-8000-000000000001'
   and w.org_id = c.org_id
   and w.date = (c.starts_at at time zone 'America/Bogota')::date;

-- -----------------------------------------------------------------------------
-- 12 · Resultados
-- -----------------------------------------------------------------------------
-- Solo anota resultado quien ESTUVO ese día: se cruzan con la asistencia. Y no
-- todos anotan, porque en un box de verdad tampoco anotan todos.
-- -----------------------------------------------------------------------------
insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, display_value, scale, logged_by, rpe, notes, created_at)
select
  'b0c50000-0000-4000-8000-000000000001', b.id, a.id,
  v.segundos,
  to_char((v.segundos || ' seconds')::interval, 'MI:SS'),
  case when a.n % 4 = 0 then 'scaled' else 'rx' end,
  case when a.n % 5 = 0 then 'coach' else 'athlete' end,
  6 + ((a.n + g.d) % 4),
  case when (a.n + g.d) % 11 = 0 then 'Se me fue el ritmo en la segunda ronda.' end,
  ((current_date - g.d)::timestamp + interval '19 hours') at time zone 'America/Bogota'
from generate_series(0, 55) as g(d)
join demo_wod t on t.k = (g.d % 8)
join public.wod_blocks b
  on b.id = ('b10c0000-0000-4000-8000-' || lpad((g.d * 10 + 3)::text, 12, '0'))::uuid
join demo_atl a on ((a.n + g.d) % 3) = 0
join public.attendances at2
  on at2.athlete_id = a.id and at2.date = (current_date - g.d)::date
cross join lateral (
  select greatest(
    60,
    t.metcon_base
      + ((a.n * 13 + g.d * 7) % 110)
      - (case when a.frec >= 4 then 45 else 0 end)
      - round((56 - g.d) / 8.0)
  )::int as segundos
) v
where t.metcon_titulo <> 'Cindy'
  and extract(dow from current_date - g.d) <> 0;

-- Cindy se mide en rondas + repeticiones: 14+20 se guarda 14.20 para poder
-- ordenar el leaderboard, y se pinta "14+20", que es lo que lee el atleta.
insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, display_value, scale, logged_by, rpe, created_at)
select
  'b0c50000-0000-4000-8000-000000000001', b.id, a.id,
  v.rondas + (v.reps / 100.0),
  v.rondas || '+' || v.reps,
  case when a.n % 4 = 0 then 'scaled' else 'rx' end, 'athlete',
  7 + ((a.n + g.d) % 3),
  ((current_date - g.d)::timestamp + interval '19 hours') at time zone 'America/Bogota'
from generate_series(0, 55) as g(d)
join demo_wod t on t.k = (g.d % 8)
join public.wod_blocks b
  on b.id = ('b10c0000-0000-4000-8000-' || lpad((g.d * 10 + 3)::text, 12, '0'))::uuid
join demo_atl a on ((a.n + g.d) % 3) = 0
join public.attendances at2
  on at2.athlete_id = a.id and at2.date = (current_date - g.d)::date
cross join lateral (
  select (10 + (a.n % 7) + (case when a.frec >= 4 then 3 else 0 end))::int as rondas,
         ((a.n * 7 + g.d) % 25)::int as reps
) v
where t.metcon_titulo = 'Cindy'
  and extract(dow from current_date - g.d) <> 0;

-- El bloque de fuerza lo anota menos gente: el que está subiendo kilos.
insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, display_value, scale, logged_by, created_at)
select
  'b0c50000-0000-4000-8000-000000000001', b.id, a.id,
  v.kilos, trim(to_char(v.kilos, 'FM999990.9')) || ' kg', 'rx', 'athlete',
  ((current_date - g.d)::timestamp + interval '19 hours') at time zone 'America/Bogota'
from generate_series(0, 55) as g(d)
join demo_wod t on t.k = (g.d % 8)
join public.wod_blocks b
  on b.id = ('b10c0000-0000-4000-8000-' || lpad((g.d * 10 + 2)::text, 12, '0'))::uuid
join demo_atl a on ((a.n + g.d) % 4) = 0
join public.attendances at2
  on at2.athlete_id = a.id and at2.date = (current_date - g.d)::date
cross join lateral (
  select round((a.base_kg * t.fuerza_factor
                + (case when g.d < 28 then 2.5 else 0 end)) / 2.5) * 2.5 as kilos
) v
where extract(dow from current_date - g.d) <> 0;

-- -----------------------------------------------------------------------------
-- 13 · Marcas personales con evolución
-- -----------------------------------------------------------------------------
-- Cuatro registros del mismo movimiento repartidos por la antigüedad de cada
-- atleta, mejorando. Es lo que hace que la gráfica de evolución tenga forma:
-- con dos puntos no hay nada que ver.
--
-- Las fechas salen de la antigüedad del atleta (85%, 60%, 33% y 10% de su
-- tiempo en el box), no de días fijos: así el que lleva cuatro meses también
-- tiene su serie, en vez de quedarse sin ninguna.
-- -----------------------------------------------------------------------------
insert into public.personal_records (org_id, athlete_id, movement_id, value_numeric, unit, reps, achieved_on, source, notes)
select
  'b0c50000-0000-4000-8000-000000000001', a.id, m.id,
  round((a.base_kg * mv.factor + p.mejora) / 2.5) * 2.5,
  'kg', 1,
  (current_date - round(least(a.antig, 350) * p.frac)::int)::date,
  'manual', 'Test de fuerza del ciclo'
from demo_atl a
cross join lateral (
  select case a.n % 3 when 0 then 'Back Squat' when 1 then 'Deadlift' else 'Clean' end as nombre,
         case a.n % 3 when 0 then 1.00 when 1 then 1.25 else 0.75 end as factor
) mv
join public.movements m on m.org_id is null and m.name = mv.nombre
cross join (values (0.85, 0.0), (0.60, 5.0), (0.33, 10.0), (0.10, 17.5)) as p(frac, mejora)
where a.antig >= 120 and a.estado <> 'churned'
on conflict do nothing;

-- Y las de tiempo, donde MENOS ES MEJOR: la serie baja de segundos aunque la
-- gráfica del atleta suba. Confundir las dos direcciones es felicitar al
-- atleta justo cuando empeora.
insert into public.personal_records (org_id, athlete_id, movement_id, value_numeric, unit, reps, achieved_on, source, notes)
select
  'b0c50000-0000-4000-8000-000000000001', a.id, m.id,
  greatest(180, (700 - a.frec * 25 + (a.n % 5) * 15 + p.delta))::numeric,
  'sec', 1,
  (current_date - round(least(a.antig, 340) * p.frac)::int)::date,
  'manual', 'Prueba de referencia del ciclo'
from demo_atl a
cross join lateral (
  select case when a.n % 2 = 0 then 'Karen' else '100 Burpees' end as nombre
) mv
join public.movements m on m.org_id is null and m.name = mv.nombre
cross join (values (0.80, 0), (0.45, -45), (0.15, -85)) as p(frac, delta)
where a.antig >= 120 and a.estado <> 'churned'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 14 · Gastos, proveedores e insumos
-- -----------------------------------------------------------------------------
insert into public.expense_categories (id, org_id, name, kind) values
  ('ca750000-0000-4000-8000-000000000001', 'b0c50000-0000-4000-8000-000000000001', 'Arriendo', 'operational'),
  ('ca750000-0000-4000-8000-000000000002', 'b0c50000-0000-4000-8000-000000000001', 'Servicios públicos', 'operational'),
  ('ca750000-0000-4000-8000-000000000003', 'b0c50000-0000-4000-8000-000000000001', 'Nómina', 'payroll'),
  ('ca750000-0000-4000-8000-000000000004', 'b0c50000-0000-4000-8000-000000000001', 'Mercadeo', 'operational'),
  ('ca750000-0000-4000-8000-000000000005', 'b0c50000-0000-4000-8000-000000000001', 'Mantenimiento y equipos', 'capex'),
  ('ca750000-0000-4000-8000-000000000006', 'b0c50000-0000-4000-8000-000000000001', 'Impuestos y contador', 'tax');

insert into public.suppliers (id, org_id, name, phone, email, notes) values
  ('50f50000-0000-4000-8000-000000000001', 'b0c50000-0000-4000-8000-000000000001',
   'Inmobiliaria Tequendama', '+573001234571', 'arriendos@inmobiliariademo.co', 'Contrato hasta diciembre. Sube con el IPC.'),
  ('50f50000-0000-4000-8000-000000000002', 'b0c50000-0000-4000-8000-000000000001',
   'Distribuidora Fitness del Valle', '+573001234572', 'ventas@distribuidorademo.co', 'Despachan en dos días. Descuento por compra de más de 500 mil.'),
  ('50f50000-0000-4000-8000-000000000003', 'b0c50000-0000-4000-8000-000000000001',
   'Magnesio Andino', '+573001234573', null, 'Solo WhatsApp. El magnesio de 1 kg es el que rinde.'),
  ('50f50000-0000-4000-8000-000000000004', 'b0c50000-0000-4000-8000-000000000001',
   'Aseo Total Cali', '+573001234574', null, null);

insert into public.supplies (id, org_id, name, unit, min_stock, default_supplier_id, reorder_every_days, notes) values
  ('5a750000-0000-4000-8000-000000000001', 'b0c50000-0000-4000-8000-000000000001', 'Magnesio en polvo', 'kg', 2, '50f50000-0000-4000-8000-000000000003', 60, null),
  ('5a750000-0000-4000-8000-000000000002', 'b0c50000-0000-4000-8000-000000000001', 'Tiza en barra', 'unidad', 20, '50f50000-0000-4000-8000-000000000003', 60, null),
  ('5a750000-0000-4000-8000-000000000003', 'b0c50000-0000-4000-8000-000000000001', 'Cauchos de asistencia', 'unidad', 4, '50f50000-0000-4000-8000-000000000002', null, 'Se revientan los verdes, no los azules.'),
  ('5a750000-0000-4000-8000-000000000004', 'b0c50000-0000-4000-8000-000000000001', 'Cuerdas de saltar', 'unidad', 3, '50f50000-0000-4000-8000-000000000002', null, null),
  ('5a750000-0000-4000-8000-000000000005', 'b0c50000-0000-4000-8000-000000000001', 'Desinfectante', 'litro', 5, '50f50000-0000-4000-8000-000000000004', 30, null),
  ('5a750000-0000-4000-8000-000000000006', 'b0c50000-0000-4000-8000-000000000001', 'Tape para manos', 'rollo', 6, '50f50000-0000-4000-8000-000000000002', 45, null);

-- Las compras mueven el stock y crean su gasto espejo por trigger: aquí no se
-- escribe ni el stock ni el gasto, justamente para que la demo enseñe que eso
-- lo hace el sistema.
insert into public.supply_purchases (org_id, supply_id, supplier_id, purchased_on, quantity, total_cents, notes, created_by)
select
  'b0c50000-0000-4000-8000-000000000001', c.supply_id, c.supplier_id,
  (current_date - c.dias)::date, c.cantidad, c.total, c.nota,
  'd1c50000-0000-4000-8000-000000000001'
from (values
  ('5a750000-0000-4000-8000-000000000001'::uuid, '50f50000-0000-4000-8000-000000000003'::uuid, 300, 10, 28000000, null::text),
  ('5a750000-0000-4000-8000-000000000001', '50f50000-0000-4000-8000-000000000003', 170, 10, 29000000, 'Subió el kilo.'),
  ('5a750000-0000-4000-8000-000000000001', '50f50000-0000-4000-8000-000000000003',  70, 8,  24000000, null),
  ('5a750000-0000-4000-8000-000000000002', '50f50000-0000-4000-8000-000000000003', 250, 60, 18000000, null),
  ('5a750000-0000-4000-8000-000000000002', '50f50000-0000-4000-8000-000000000003',  90, 60, 19200000, null),
  ('5a750000-0000-4000-8000-000000000003', '50f50000-0000-4000-8000-000000000002', 320, 12, 96000000, 'Juego completo de cauchos.'),
  ('5a750000-0000-4000-8000-000000000003', '50f50000-0000-4000-8000-000000000002', 110, 6,  52000000, null),
  ('5a750000-0000-4000-8000-000000000004', '50f50000-0000-4000-8000-000000000002', 200, 10, 35000000, null),
  ('5a750000-0000-4000-8000-000000000004', '50f50000-0000-4000-8000-000000000002',  40, 6,  22000000, null),
  ('5a750000-0000-4000-8000-000000000005', '50f50000-0000-4000-8000-000000000004', 120, 20, 16000000, null),
  ('5a750000-0000-4000-8000-000000000005', '50f50000-0000-4000-8000-000000000004',  55, 20, 16800000, null),
  ('5a750000-0000-4000-8000-000000000005', '50f50000-0000-4000-8000-000000000004',  20, 20, 16800000, null),
  ('5a750000-0000-4000-8000-000000000006', '50f50000-0000-4000-8000-000000000002', 180, 24, 28800000, null),
  ('5a750000-0000-4000-8000-000000000006', '50f50000-0000-4000-8000-000000000002',  60, 24, 30000000, null)
) as c(supply_id, supplier_id, dias, cantidad, total, nota);

-- El stock de hoy es lo comprado MENOS lo que el box se gastó, que no tiene
-- fila en ninguna parte (nadie apunta cada puñado de magnesio). Dos quedan por
-- debajo del mínimo a propósito: la alerta de reposición tiene que sonar.
update public.supplies s set current_stock = v.stock
from (values
  ('5a750000-0000-4000-8000-000000000001'::uuid, 1.5),   -- magnesio: bajo mínimo
  ('5a750000-0000-4000-8000-000000000002', 34),
  ('5a750000-0000-4000-8000-000000000003', 7),
  ('5a750000-0000-4000-8000-000000000004', 5),
  ('5a750000-0000-4000-8000-000000000005', 11),
  ('5a750000-0000-4000-8000-000000000006', 2)            -- tape: bajo mínimo
) as v(id, stock)
where s.id = v.id;

-- -----------------------------------------------------------------------------
-- 15 · Un año de gastos
-- -----------------------------------------------------------------------------
-- Los fijos, mes a mes. El P&L solo cuenta los gastos reales (los compromisos
-- recurrentes se registran aparte, al final, y no se suman dos veces).
--
-- Las cifras son las de un box pequeño de Cali: local de barrio, dos coaches a
-- medio tiempo, ~4,1 millones de costo fijo. Con 40 atletas eso deja el mes en
-- positivo por poco, y con 25 —los que había hace un año— lo dejaba en rojo. Esa
-- curva es el P&L que enseña la demo: el box cruzó a ganancia hace unos cinco
-- meses. Es la verdad de un box de esta talla y es un mejor argumento que una
-- línea plana bonita. El punto de equilibrio del sector está en ~100 socios
-- (docs/08 §4), así que este box todavía está armándose.
--
-- La nómina sube a la mitad de la serie: el segundo coach entró hace medio año.
-- -----------------------------------------------------------------------------
insert into public.expenses (id, org_id, category_id, supplier_id, description, amount_cents, incurred_on, paid_on, created_by)
select
  ('e0c50000-0000-4000-8000-' || lpad((m.m * 10 + c.i)::text, 12, '0'))::uuid,
  'b0c50000-0000-4000-8000-000000000001', c.categoria, c.proveedor, c.descripcion,
  c.monto
    + (case c.variacion when 1 then ((m.m % 4) * 4000000) else 0 end)
    - (case when c.variacion = 2 and m.m >= 6 then 50000000 else 0 end),
  v.fecha, v.fecha, 'd1c50000-0000-4000-8000-000000000001'
from generate_series(0, 11) as m(m)
cross join (values
  (1, 'ca750000-0000-4000-8000-000000000001'::uuid, '50f50000-0000-4000-8000-000000000001'::uuid, 'Arriendo del local',        200000000::bigint, 5,  0),
  (2, 'ca750000-0000-4000-8000-000000000003', null,                                               'Nómina de coaches',        140000000, 28, 2),
  (3, 'ca750000-0000-4000-8000-000000000002', null,                                               'Energía y agua',            32000000, 10, 1),
  (4, 'ca750000-0000-4000-8000-000000000002', null,                                               'Internet y datáfono',       12990000, 10, 0),
  (5, 'ca750000-0000-4000-8000-000000000006', null,                                               'Honorarios del contador',   25000000, 15, 0),
  (6, 'ca750000-0000-4000-8000-000000000004', null,                                               'Pauta en Instagram',        20000000, 20, 1)
) as c(i, categoria, proveedor, descripcion, monto, dia, variacion)
cross join lateral (
  select ((date_trunc('month', current_date) - (m.m || ' months')::interval)
          + ((c.dia - 1) || ' days')::interval)::date as fecha
) v
where v.fecha <= current_date
  and v.fecha >= current_date - 400
  and not (c.i = 6 and m.m % 2 = 1);   -- la pauta no se paga todos los meses

-- Los que no son de todos los meses. El de los bumpers es el que pone un mes en
-- rojo: un box tiene meses en pérdida y la gráfica tiene que poder enseñarlo.
insert into public.expenses (id, org_id, category_id, supplier_id, description, amount_cents, incurred_on, paid_on, notes, created_by)
select
  ('e0c50000-0000-4000-8000-' || lpad((900 + c.i)::text, 12, '0'))::uuid,
  'b0c50000-0000-4000-8000-000000000001', c.categoria, c.proveedor, c.descripcion, c.monto,
  v.fecha, v.fecha, c.nota, 'd1c50000-0000-4000-8000-000000000001'
from (values
  (1, 'ca750000-0000-4000-8000-000000000005'::uuid, '50f50000-0000-4000-8000-000000000002'::uuid,
      'Reposición de bumpers y dos barras olímpicas', 450000000::bigint, 5, 12,
      'Se pagó de contado para no financiar. Ese mes cerró en rojo y valió la pena.'::text),
  (2, 'ca750000-0000-4000-8000-000000000005', null,
      'Reparación del aire acondicionado', 120000000, 8, 9, null),
  (3, 'ca750000-0000-4000-8000-000000000004', '50f50000-0000-4000-8000-000000000002',
      'Camisetas del box para el reto de verano', 60000000, 2, 18, null),
  (4, 'ca750000-0000-4000-8000-000000000005', '50f50000-0000-4000-8000-000000000002',
      'Dos remos de segunda', 180000000, 10, 20, null)
) as c(i, categoria, proveedor, descripcion, monto, mes, dia, nota)
cross join lateral (
  select ((date_trunc('month', current_date) - (c.mes || ' months')::interval)
          + ((c.dia - 1) || ' days')::interval)::date as fecha
) v
where v.fecha <= current_date;

-- Los compromisos que vienen. Van marcados como recurrentes y por eso NO entran
-- al P&L: son el calendario de lo que hay que pagar, no plata que ya salió.
insert into public.expenses (id, org_id, category_id, supplier_id, description, amount_cents, incurred_on, is_recurring, recurrence, next_due_on, created_by)
values
  ('e0c50000-0000-4000-8000-000000000801', 'b0c50000-0000-4000-8000-000000000001',
   'ca750000-0000-4000-8000-000000000001', '50f50000-0000-4000-8000-000000000001',
   'Arriendo del local (compromiso mensual)', 200000000, current_date, true, 'monthly',
   (date_trunc('month', current_date + interval '1 month') + interval '4 days')::date,
   'd1c50000-0000-4000-8000-000000000001'),
  ('e0c50000-0000-4000-8000-000000000802', 'b0c50000-0000-4000-8000-000000000001',
   'ca750000-0000-4000-8000-000000000003', null,
   'Nómina de coaches (compromiso mensual)', 140000000, current_date, true, 'monthly',
   (date_trunc('month', current_date + interval '1 month') + interval '27 days')::date,
   'd1c50000-0000-4000-8000-000000000001'),
  ('e0c50000-0000-4000-8000-000000000803', 'b0c50000-0000-4000-8000-000000000001',
   'ca750000-0000-4000-8000-000000000006', null,
   'Declaración de IVA (cuatrimestral)', 80000000, current_date, true, 'quarterly',
   (current_date + 40)::date, 'd1c50000-0000-4000-8000-000000000001');

-- -----------------------------------------------------------------------------
-- 16 · Los jobs, corridos una vez
-- -----------------------------------------------------------------------------
-- El riesgo de fuga y la bandeja de salida no se escriben a mano: los calcula
-- el mismo código que corre en producción todas las mañanas. Si la semilla los
-- inventara, la demo estaría enseñando algo que el producto no hace.
-- -----------------------------------------------------------------------------
do $$
declare v_org uuid := 'b0c50000-0000-4000-8000-000000000001';
begin
  perform public.refresh_risk_scores(v_org);

  -- Dos corridas: la de anteayer y la de hoy. La primera se "liquida" para que
  -- la bandeja tenga historia —qué se HABRÍA enviado, que es lo que el box mira
  -- su primera semana en modo simulación— y la de hoy se queda encolada, que es
  -- lo que hay que hacer. Una bandeja vacía no demuestra nada y una bandeja solo
  -- con pendientes tampoco.
  perform public.run_automations(v_org, now() - interval '2 days');
  perform public.settle_simulated_messages(v_org, 200, now() - interval '1 day');
  perform public.run_automations(v_org);
end $$;

-- -----------------------------------------------------------------------------
-- 17 · Resumen
-- -----------------------------------------------------------------------------
-- Lo que quedó sembrado, contado desde la base y no desde lo que uno creía que
-- había escrito. Si un número sale en cero, algo se rompió arriba.
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := 'b0c50000-0000-4000-8000-000000000001';
  v     record;
begin
  select
    (select count(*) from public.athletes where org_id = v_org) as atletas,
    (select count(*) from public.athletes where org_id = v_org and status = 'active') as activos,
    (select count(*) from public.athletes where org_id = v_org and status = 'overdue') as en_mora,
    (select count(*) from public.invoices where org_id = v_org) as cobros,
    (select coalesce(sum(amount_cents - paid_cents), 0) from public.invoices
      where org_id = v_org and status in ('open','partial','overdue')) as cartera,
    (select count(*) from public.attendances where org_id = v_org) as asistencias,
    (select count(*) from public.wods where org_id = v_org) as wods,
    (select count(*) from public.results where org_id = v_org) as resultados,
    (select count(*) from public.personal_records where org_id = v_org) as marcas,
    (select count(*) from public.classes where org_id = v_org) as clases,
    (select count(*) from public.reservations where org_id = v_org) as reservas,
    (select count(*) from public.expenses where org_id = v_org and not is_recurring) as gastos,
    (select count(*) from public.supplies where org_id = v_org and current_stock < min_stock) as insumos_bajos,
    (select count(*) from public.athlete_risk_scores where org_id = v_org and band <> 'ok') as en_riesgo,
    (select count(*) from public.message_outbox where org_id = v_org) as mensajes
  into v;

  raise notice 'Box La Ladera listo:';
  raise notice '  % atletas (% activos, % en mora)', v.atletas, v.activos, v.en_mora;
  raise notice '  % cobros · cartera pendiente: $%', v.cobros, replace(to_char(v.cartera / 100, 'FM999,999,999'), ',', '.');
  raise notice '  % asistencias · % WOD con % resultados · % marcas', v.asistencias, v.wods, v.resultados, v.marcas;
  raise notice '  % clases · % reservas', v.clases, v.reservas;
  raise notice '  % gastos · % insumos bajo mínimo', v.gastos, v.insumos_bajos;
  raise notice '  % atletas en riesgo de fuga · % mensajes en la bandeja', v.en_riesgo, v.mensajes;
  raise notice 'Entra con dueno@boxlaladera.co / demo1234';

  if v.atletas = 0 or v.cobros = 0 or v.wods = 0 then
    raise exception 'La semilla terminó sin datos. Revisa los errores de arriba.';
  end if;
end $$;

commit;
