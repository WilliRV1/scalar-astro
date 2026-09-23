-- =============================================================================
-- 0019 · El dueño configura su propio box
-- =============================================================================
-- Hasta aquí, poner a andar un box nuevo exigía que nosotros entráramos: un
-- `update` a mano sobre `organizations.settings`, y unas llaves de Wompi y de
-- WhatsApp metidas en el entorno de las Edge Functions. Eso tiene dos costos:
--
--   1. No escala. Cada cliente nuevo es una tarde de un desarrollador, y el
--      cliente no puede cambiar de opinión un domingo.
--   2. ES PELIGROSO. Con las llaves de Wompi en el entorno de la función, LA
--      PLATA DE TODOS LOS BOXES CAE EN LA MISMA CUENTA. No es una molestia de
--      configuración: es el dinero del cliente en la cuenta de otro.
--
-- Esta migración cierra las dos cosas:
--
--   · `organizations.settings` deja de ser un saco sin fondo: tiene valores por
--     defecto y una validación que rechaza en español lo que no tiene sentido
--     (un día de corte 40, unos días de gracia negativos).
--   · `org_onboarding` recuerda por dónde iba el asistente de puesta en marcha,
--     para que cerrar la pestaña no cueste empezar de cero.
--   · `org_credentials` + `org_secret_values` guardan las llaves DE CADA BOX,
--     separando lo que se muestra de lo que jamás sale de la base.
--
-- No se crean ajustes nuevos donde ya los había: `automation_settings` (0011) y
-- `reservation_settings` (0014) siguen siendo los dueños de lo suyo. Lo que se
-- agrega aquí es la validación con mensaje entendible que les faltaba, porque
-- ahora el que escribe esos valores no es un desarrollador: es el dueño del box
-- desde el celular.
-- =============================================================================

-- =============================================================================
-- 1 · Los ajustes del box (`organizations.settings`)
-- =============================================================================
-- Sigue siendo `jsonb` y no columnas porque el motor de cobros ya lee
-- `settings->>'grace_days'` (0007) y el de automatizaciones
-- `settings->>'payment_link'` (0011). Cambiar eso ahora sería reescribir dos
-- motores probados para ganar nada.
--
-- Lo que sí cambia: el saco tiene forma. Hay una lista de claves conocidas, con
-- su valor por defecto y su validación. Una clave desconocida NO se rechaza a
-- propósito (mañana hay una nueva y no quiero una migración para probarla),
-- pero una clave conocida con un valor imposible sí.
-- -----------------------------------------------------------------------------

/**
 * Ajustes por defecto de un box. Un box recién creado tiene que poder cobrar
 * sin que nadie toque nada: 3 días de gracia y corte el 5, que es lo que hace
 * la mayoría de boxes en Cali (docs/08).
 */
create or replace function private.org_settings_defaults()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    -- Días que pasan entre que se emite el cobro y que se considera en mora.
    'grace_days',             3,
    -- Día del mes en que se le cobra a un atleta nuevo si nadie dice otra cosa.
    'default_billing_day',    5,
    -- ¿El box acepta que el atleta pague por la aplicación?
    'accepts_online_payment', false,
    -- Enlace de pago que se pega en los mensajes de cobro mientras no haya
    -- pasarela conectada (Nequi, Daviplata, un link de Bold…).
    'payment_link',           ''
  )
$$;

comment on function private.org_settings_defaults is
  'Valores por defecto de organizations.settings. Un box nuevo ya viene con ellos.';

/**
 * Completa y valida `organizations.settings`.
 *
 * Completa: las claves que falten se rellenan con el valor por defecto, así que
 * ninguna lectura del motor de cobros se encuentra un NULL.
 *
 * Valida: los mensajes están redactados para el dueño del box, no para
 * nosotros. Se le muestran tal cual (ver CLAUDE.md § Errores), así que dicen
 * qué está mal Y qué se esperaba.
 */
create or replace function public.check_org_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_day   int;
  v_grace int;
  v_link  text;
begin
  if new.settings is null then
    new.settings := '{}'::jsonb;
  end if;

  if jsonb_typeof(new.settings) <> 'object' then
    raise exception 'La configuración del box tiene que ser un objeto, no %.',
      jsonb_typeof(new.settings)
      using errcode = '22023';
  end if;

  -- Lo que el box no dijo, lo dice el valor por defecto. `||` deja ganar a la
  -- derecha, así que lo explícito manda.
  new.settings := private.org_settings_defaults() || new.settings;

  -- ---- días de gracia -------------------------------------------------------
  if jsonb_typeof(new.settings->'grace_days') <> 'number' then
    raise exception 'Los días de gracia tienen que ser un número entero de días (recibí %).',
      coalesce(new.settings->>'grace_days', 'nada')
      using errcode = '22023',
            hint = 'Es cuántos días después del corte se le sigue esperando al atleta antes de marcarlo en mora.';
  end if;

  v_grace := (new.settings->>'grace_days')::numeric::int;
  if v_grace < 0 or v_grace > 60 then
    raise exception 'Los días de gracia deben estar entre 0 y 60. Recibí %.', v_grace
      using errcode = '22023',
            hint = 'Con 0 el atleta queda en mora el mismo día del corte.';
  end if;

  -- ---- día de corte por defecto ---------------------------------------------
  if jsonb_typeof(new.settings->'default_billing_day') <> 'number' then
    raise exception 'El día de corte por defecto tiene que ser un número del 1 al 31 (recibí %).',
      coalesce(new.settings->>'default_billing_day', 'nada')
      using errcode = '22023';
  end if;

  v_day := (new.settings->>'default_billing_day')::numeric::int;
  if v_day < 1 or v_day > 31 then
    raise exception 'El día de corte por defecto debe estar entre 1 y 31. Recibí %.', v_day
      using errcode = '22023',
            hint = 'Si pones 31, en febrero se cobra el último día del mes.';
  end if;

  -- ---- pago en línea --------------------------------------------------------
  if jsonb_typeof(new.settings->'accepts_online_payment') <> 'boolean' then
    raise exception 'La opción de pago en línea solo puede estar encendida o apagada (recibí %).',
      coalesce(new.settings->>'accepts_online_payment', 'nada')
      using errcode = '22023';
  end if;

  -- ---- enlace de pago -------------------------------------------------------
  if jsonb_typeof(new.settings->'payment_link') <> 'string' then
    raise exception 'El enlace de pago tiene que ser texto (recibí %).',
      jsonb_typeof(new.settings->'payment_link')
      using errcode = '22023';
  end if;

  v_link := btrim(new.settings->>'payment_link');
  if v_link <> '' and v_link !~ '^https?://' then
    raise exception 'El enlace de pago "%" no parece un enlace: tiene que empezar por http:// o https://.', v_link
      using errcode = '22023',
            hint = 'Pega el enlace completo que te da Nequi, Daviplata o Bold.';
  end if;
  new.settings := jsonb_set(new.settings, '{payment_link}', to_jsonb(v_link));

  return new;
end;
$$;

comment on function public.check_org_settings is
  'Completa con los valores por defecto y valida organizations.settings con mensajes en español.';

create trigger organizations_check_settings
  before insert or update of settings on public.organizations
  for each row execute function public.check_org_settings();

-- Los boxes que ya existen también quedan con la forma completa. El `||` de la
-- función respeta lo que cada uno ya tuviera configurado.
update public.organizations set settings = settings;

-- =============================================================================
-- 2 · Mensajes entendibles en los ajustes que ya existían
-- =============================================================================
-- `automation_settings` y `reservation_settings` ya tenían sus CHECK, y están
-- bien: son la última línea. El problema es lo que el dueño VE cuando los
-- incumple: «new row for relation "automation_settings" violates check
-- constraint "automation_settings_check"». Eso no le dice nada a nadie.
--
-- Un trigger BEFORE corre ANTES de que se evalúen los CHECK, así que aquí se
-- alcanza a explicar el problema en español. El CHECK sigue detrás: si alguien
-- escribe por otro camino, igual no pasa.
-- -----------------------------------------------------------------------------

create or replace function public.check_automation_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quiet_end_hour <= new.quiet_start_hour then
    raise exception 'El horario para escribirle a los atletas está al revés: empieza a las %:00 y termina a las %:00.',
      new.quiet_start_hour, new.quiet_end_hour
      using errcode = '22023',
            hint = 'La hora de fin tiene que ser mayor que la de inicio. Lo normal es de 8:00 a 21:00.';
  end if;

  if new.quiet_start_hour < 0 or new.quiet_start_hour > 23 then
    raise exception 'La hora de inicio del horario permitido debe estar entre 0 y 23. Recibí %.',
      new.quiet_start_hour using errcode = '22023';
  end if;

  if new.quiet_end_hour < 1 or new.quiet_end_hour > 24 then
    raise exception 'La hora de fin del horario permitido debe estar entre 1 y 24. Recibí %.',
      new.quiet_end_hour using errcode = '22023';
  end if;

  if new.max_messages_per_athlete_per_month < 0 then
    raise exception 'El tope de mensajes al mes no puede ser negativo. Recibí %.',
      new.max_messages_per_athlete_per_month using errcode = '22023';
  end if;

  if new.max_messages_per_athlete_per_day < 0 then
    raise exception 'El tope de mensajes al día no puede ser negativo. Recibí %.',
      new.max_messages_per_athlete_per_day using errcode = '22023';
  end if;

  if new.max_messages_per_athlete_per_day > new.max_messages_per_athlete_per_month
     and new.max_messages_per_athlete_per_month > 0 then
    raise exception 'El tope diario (%) no puede ser mayor que el mensual (%).',
      new.max_messages_per_athlete_per_day, new.max_messages_per_athlete_per_month
      using errcode = '22023',
            hint = 'Con un tope mensual de 4 y uno diario de 1, un atleta recibe como mucho 4 mensajes al mes y nunca dos el mismo día.';
  end if;

  return new;
end;
$$;

create trigger automation_settings_check
  before insert or update on public.automation_settings
  for each row execute function public.check_automation_settings();

create or replace function public.check_reservation_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- La reserva se abre `open_hours_before` horas antes y se cierra
  -- `close_minutes_before` minutos antes. Si el cierre cae antes de la apertura,
  -- la clase NUNCA es reservable y nadie entiende por qué.
  if new.open_hours_before * 60 <= new.close_minutes_before then
    raise exception 'La reserva se cerraría antes de abrirse: abre % horas antes y cierra % minutos antes de la clase.',
      new.open_hours_before, new.close_minutes_before
      using errcode = '22023',
            hint = 'Lo normal: abre 168 horas antes (una semana) y cierra 30 minutos antes.';
  end if;

  if new.cancel_minutes_before > new.open_hours_before * 60 then
    raise exception 'El plazo para cancelar (% minutos antes) es más largo que el tiempo que la reserva lleva abierta (% horas).',
      new.cancel_minutes_before, new.open_hours_before
      using errcode = '22023',
            hint = 'Nadie podría cancelar a tiempo porque la reserva todavía no existía.';
  end if;

  if new.no_show_policy = 'block' and new.no_show_threshold < 1 then
    raise exception 'Para bloquear por faltas hay que decir cuántas faltas. Recibí %.',
      new.no_show_threshold using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger reservation_settings_check
  before insert or update on public.reservation_settings
  for each row execute function public.check_reservation_settings();

-- =============================================================================
-- 3 · El asistente de puesta en marcha
-- =============================================================================
-- El dueño no configura su box de una sentada: empieza, lo llama un atleta, y
-- vuelve en la noche. Si al volver encuentra el formulario vacío, no vuelve una
-- tercera vez. Por eso el progreso es una fila en la base y no el estado de un
-- componente de React.
--
-- Los pasos se pueden SALTAR, y saltado no es lo mismo que hecho: el box que se
-- saltó "atletas" porque los va a importar el lunes tiene que poder ver que le
-- falta, mientras que el que no usa reservas no quiere verlo nunca más.
-- -----------------------------------------------------------------------------

create table public.org_onboarding (
  org_id        uuid primary key references public.organizations(id) on delete cascade,
  current_step  text not null default 'box'
                check (current_step in ('box','plans','billing','athletes','automations','done')),
  steps_done    text[] not null default '{}'
                check (steps_done    <@ array['box','plans','billing','athletes','automations']::text[]),
  steps_skipped text[] not null default '{}'
                check (steps_skipped <@ array['box','plans','billing','athletes','automations']::text[]),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger org_onboarding_touch before update on public.org_onboarding
  for each row execute function public.touch_updated_at();

comment on table public.org_onboarding is
  'Por dónde va el asistente de puesta en marcha de cada box. Cerrar la pestaña no pierde el avance.';
comment on column public.org_onboarding.steps_skipped is
  'Pasos que el dueño decidió saltarse. Saltado no es hecho: se sigue pudiendo volver.';

/**
 * Cierra el asistente cuando ya no queda ningún paso pendiente, y deja la marca
 * en `organizations.onboarded_at`, que es la columna que ya existía para eso.
 *
 * SECURITY DEFINER porque toca `organizations`, y quien termina el asistente es
 * el dueño: su política de UPDATE se lo permitiría, pero no quiero que el cierre
 * dependa de qué rol tenía puesto el que guardó el último paso.
 */
create or replace function public.close_onboarding_when_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pendientes int;
begin
  select count(*) into v_pendientes
  from unnest(array['box','plans','billing','athletes','automations']) as paso
  where paso <> all (new.steps_done) and paso <> all (new.steps_skipped);

  if v_pendientes = 0 and new.completed_at is null then
    update public.org_onboarding
       set completed_at = now(), current_step = 'done'
     where org_id = new.org_id;

    update public.organizations
       set onboarded_at = coalesce(onboarded_at, now())
     where id = new.org_id;
  end if;

  return null;
end;
$$;

create trigger org_onboarding_close
  after insert or update of steps_done, steps_skipped on public.org_onboarding
  for each row execute function public.close_onboarding_when_ready();

/** Todo box tiene su fila desde el minuto uno, igual que `reservation_settings`. */
create or replace function public.seed_org_onboarding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.org_onboarding (org_id) values (new.id)
  on conflict (org_id) do nothing;
  return new;
end;
$$;

create trigger organizations_seed_onboarding
  after insert on public.organizations
  for each row execute function public.seed_org_onboarding();

/**
 * Marcar un paso del asistente.
 *
 * Existe además de la RLS (que ya permite el `update` directo) porque el
 * frontend necesita una sola ida y vuelta: marcar el paso, calcular el
 * siguiente pendiente y devolver la fila ya cerrada si era el último. Hacerlo
 * en tres consultas desde el navegador deja el asistente a medias si el celular
 * pierde señal entre la primera y la tercera.
 */
create or replace function public.mark_onboarding_step(
  p_org_id uuid,
  p_step   text,
  p_state  text default 'done'
)
returns public.org_onboarding
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   public.org_onboarding;
  v_pasos text[] := array['box','plans','billing','athletes','automations'];
begin
  if p_org_id is null or p_org_id not in (select private.auth_org_ids_with_role(array['owner','admin'])) then
    raise exception 'Solo el dueño o el administrador del box pueden avanzar la puesta en marcha.'
      using errcode = '42501';
  end if;

  if p_step <> all (v_pasos) then
    raise exception 'El paso "%" no existe. Los pasos son: %.', p_step, array_to_string(v_pasos, ', ')
      using errcode = '22023';
  end if;

  if p_state not in ('done','skipped','pending') then
    raise exception 'Estado de paso desconocido: "%". Válidos: done, skipped, pending.', p_state
      using errcode = '22023';
  end if;

  insert into public.org_onboarding (org_id) values (p_org_id)
  on conflict (org_id) do nothing;

  update public.org_onboarding o
     set steps_done    = case
                           when p_state = 'done'
                             then (select array_agg(distinct x) from unnest(o.steps_done || p_step) x)
                           else array_remove(o.steps_done, p_step)
                         end,
         steps_skipped = case
                           when p_state = 'skipped'
                             then (select array_agg(distinct x) from unnest(o.steps_skipped || p_step) x)
                           else array_remove(o.steps_skipped, p_step)
                         end
   where o.org_id = p_org_id;

  -- El siguiente pendiente, no "el de más allá": si el dueño se saltó los
  -- planes y luego volvió, el asistente lo lleva a lo que falte, no al final.
  update public.org_onboarding o
     set current_step = coalesce(
           (select p from unnest(v_pasos) p
             where p <> all (o.steps_done) and p <> all (o.steps_skipped)
             limit 1),
           'done')
   where o.org_id = p_org_id
   returning * into v_row;

  return v_row;
end;
$$;

comment on function public.mark_onboarding_step is
  'Marca un paso del asistente (done/skipped/pending) y devuelve el avance ya recalculado.';

-- =============================================================================
-- 4 · Las credenciales de CADA box
-- =============================================================================
-- Esta es la parte delicada de toda la migración, así que va explicada entera.
--
-- EL PROBLEMA. Hoy `charge-subscriptions` lee WOMPI_PRIVATE_KEY del entorno de
-- la Edge Function y `process-outbox` lee WHATSAPP_TOKEN. Entorno de la función
-- = uno solo para toda la plataforma = la plata de todos los boxes entra a la
-- misma cuenta de Wompi. Cada box tiene que traer las suyas.
--
-- LA SEPARACIÓN. Dos tablas, no una, porque la RLS es POR FILA y no por
-- columna: si el estado ("configurado, termina en 4f2a, desde el 3 de marzo")
-- viviera en la misma fila que el secreto, cualquier política que dejara ver el
-- estado dejaría ver el secreto. Es el mismo criterio con el que las lesiones y
-- las notas médicas viven aparte (docs/07-legal-colombia.md).
--
--   · `org_credentials`   → lo que SÍ se muestra. La lee el dueño.
--   · `org_secret_values` → el secreto. NADIE lo lee desde el navegador.
--
-- CÓMO SE PROTEGE EL SECRETO, exactamente y sin adornos:
--
--   a) `org_secret_values` no tiene NINGÚN privilegio para `anon` ni para
--      `authenticated`: se los revoca explícitamente más abajo. Un `select *`
--      desde el navegador no devuelve una fila vacía, devuelve
--      «permission denied for table org_secret_values». Este es el candado
--      principal, y hay una prueba que falla si alguien lo afloja.
--   b) Encima lleva RLS con una sola política, para `service_role`. Es
--      redundante a propósito (service_role ya salta la RLS) y está ahí para
--      que una tabla sin ningún privilegio no quede además sin política: la
--      guarda `supabase/tests/rls_guard.sql` trata eso como un descuido, y
--      tiene razón.
--   c) Se escriben SOLO por `public.set_org_credential()`, que comprueba por
--      dentro que quien llama sea dueño o administrador de ESE box y que no
--      devuelve el valor jamás.
--   d) Se leen SOLO por `private.org_secret()`, en el esquema `private` (que no
--      está expuesto por PostgREST) y con EXECUTE revocado a `authenticated`.
--
-- SOBRE CIFRAR. No se cifra, y es una decisión, no un olvido. Cifrar con
-- `pgcrypto` exige una clave, y la clave tendría que estar en algún lado:
--   · en la misma base → es un candado con la llave puesta: quien se lleva un
--     volcado se lleva las dos cosas y no hemos ganado nada;
--   · en el entorno de la Edge Function → sí protege contra un volcado de la
--     base, pero es EXACTAMENTE el problema que esta migración vino a quitar
--     (una clave de plataforma para todos), solo que movido un piso.
-- Así que aquí el secreto se guarda tal cual, y lo que lo protege es que la
-- tabla es inalcanzable salvo para `service_role`. Lo que esto NO protege, y
-- hay que decirlo: un volcado de la base, y cualquiera que tenga la
-- `service_role key`. El siguiente paso serio es cifrado de sobre con una clave
-- maestra en un KMS (Supabase Vault), y entonces `private.org_secret()` es la
-- única función que hay que cambiar: nadie más toca la tabla.
-- -----------------------------------------------------------------------------

/**
 * Qué credenciales conoce el producto.
 *
 * Lista cerrada a propósito: si el dueño pudiera inventar claves, la Edge
 * Function pediría `wompi_private_key` y él habría guardado `llave_wompi`, y
 * el cobro fallaría en silencio el día 5 a las 6 de la mañana.
 */
create or replace function private.credential_keys()
returns table (key text, provider text, is_secret boolean)
language sql
immutable
set search_path = ''
as $$
  values
    -- Wompi. La pública se muestra entera: viaja al navegador por diseño.
    ('wompi_public_key',         'wompi',          false),
    ('wompi_private_key',        'wompi',          true),
    ('wompi_integrity_secret',   'wompi',          true),
    ('wompi_events_secret',      'wompi',          true),
    -- WhatsApp Cloud API. El id del número no es secreto; el token sí.
    ('whatsapp_phone_number_id', 'whatsapp_cloud', false),
    ('whatsapp_token',           'whatsapp_cloud', true)
$$;

create table public.org_credentials (
  org_id        uuid not null references public.organizations(id) on delete cascade,
  key           text not null,
  provider      text not null check (provider in ('wompi','whatsapp_cloud')),
  environment   text not null default 'test' check (environment in ('test','prod')),
  -- El valor de las credenciales que NO son secretas (la llave pública de
  -- Wompi, el id del número de WhatsApp). Se muestra entero.
  public_value  text,
  -- De un secreto solo se guarda con qué termina, para que el dueño pueda
  -- reconocer cuál pegó sin que nadie pueda reconstruirlo.
  last4         text check (last4 is null or length(last4) <= 4),
  is_set        boolean not null default false,
  configured_at timestamptz,
  configured_by uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (org_id, key),
  check (key in ('wompi_public_key','wompi_private_key','wompi_integrity_secret',
                 'wompi_events_secret','whatsapp_phone_number_id','whatsapp_token'))
);

create index org_credentials_provider_idx on public.org_credentials (org_id, provider);

create trigger org_credentials_touch before update on public.org_credentials
  for each row execute function public.touch_updated_at();

comment on table public.org_credentials is
  'ESTADO de las credenciales de cada box. Nunca el secreto: eso vive en org_secret_values.';
comment on column public.org_credentials.last4 is
  'Los últimos 4 caracteres del secreto, para que el dueño reconozca cuál pegó.';

-- -----------------------------------------------------------------------------
-- El secreto. Léase el bloque de arriba antes de tocar nada de esto.
-- -----------------------------------------------------------------------------
create table public.org_secret_values (
  org_id     uuid not null,
  key        text not null,
  secret     text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, key),
  -- Un secreto sin su ficha de estado sería un secreto que nadie sabe que
  -- existe; borrar la ficha borra el secreto.
  foreign key (org_id, key) references public.org_credentials (org_id, key) on delete cascade
);

create trigger org_secret_values_touch before update on public.org_secret_values
  for each row execute function public.touch_updated_at();

comment on table public.org_secret_values is
  'Llaves privadas de cada box. Sin privilegios para anon ni authenticated: solo service_role, desde las Edge Functions.';

-- ESTE es el candado. La RLS de abajo es el segundo.
--
-- Ojo con el orden: tanto Supabase como el arnés de pruebas locales tienen
-- `alter default privileges in schema public grant ... to authenticated`, así
-- que la tabla NACE con privilegios. El revoke no es decorativo.
revoke all on public.org_secret_values from public, anon, authenticated;
grant select, insert, update, delete on public.org_secret_values to service_role;

/**
 * El secreto de un box, para las Edge Functions.
 *
 * Vive en `private` porque ese esquema no está expuesto por PostgREST, y además
 * se le revoca EXECUTE a `authenticated`.
 *
 * Ese revoke es seguro AQUÍ y sería un desastre en `private.auth_org_ids()`: la
 * trampa documentada en CLAUDE.md es sobre funciones que USAN las políticas
 * RLS, que se evalúan con los privilegios de quien consulta. Esta no aparece en
 * ninguna política; solo la llama `service_role`.
 */
create or replace function private.org_secret(p_org_id uuid, p_clave text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select v.secret
  from public.org_secret_values v
  where v.org_id = p_org_id
    and v.key = p_clave
$$;

comment on function private.org_secret is
  'Devuelve el secreto de un box. Solo service_role, desde las Edge Functions.';

/**
 * Guardar una credencial del box.
 *
 * Nunca devuelve el valor: devuelve la ficha de estado. Si algún día alguien
 * hace `select * from set_org_credential(...)` desde el navegador, lo peor que
 * se lleva son los últimos 4 caracteres.
 */
create or replace function public.set_org_credential(
  p_org_id      uuid,
  p_clave       text,
  p_valor       text,
  p_environment text default null
)
returns public.org_credentials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat   record;
  v_valor text := btrim(coalesce(p_valor, ''));
  v_env   text;
  v_row   public.org_credentials;
begin
  if p_org_id is null or p_org_id not in (select private.auth_org_ids_with_role(array['owner','admin'])) then
    raise exception 'Solo el dueño o el administrador del box pueden cambiar las credenciales de cobro y mensajería.'
      using errcode = '42501';
  end if;

  select * into v_cat from private.credential_keys() c where c.key = p_clave;
  if not found then
    raise exception 'No conozco la credencial "%".', p_clave
      using errcode = '22023',
            hint = 'Válidas: wompi_public_key, wompi_private_key, wompi_integrity_secret, wompi_events_secret, whatsapp_phone_number_id, whatsapp_token.';
  end if;

  if v_valor = '' then
    raise exception 'La credencial "%" llegó vacía. Para quitarla usa el botón de borrar, que no es lo mismo que dejarla en blanco.', p_clave
      using errcode = '22023';
  end if;

  v_env := coalesce(nullif(btrim(coalesce(p_environment, '')), ''), 'test');
  if v_env not in ('test','prod') then
    raise exception 'El ambiente debe ser "test" (pruebas) o "prod" (producción). Recibí "%".', v_env
      using errcode = '22023';
  end if;

  -- Validaciones de forma. Pegar la llave de pruebas donde va la de producción
  -- es el error que hace que el box crea que está cobrando y no esté cobrando.
  if p_clave = 'wompi_public_key' and v_valor !~ '^pub_(test|prod)_' then
    raise exception 'La llave pública de Wompi empieza por pub_test_ o pub_prod_. La que pegaste empieza por "%".',
      left(v_valor, 9)
      using errcode = '22023',
            hint = 'Está en el panel de Wompi, en Desarrolladores → Llaves de API.';
  end if;

  if p_clave = 'wompi_private_key' and v_valor !~ '^prv_(test|prod)_' then
    raise exception 'La llave privada de Wompi empieza por prv_test_ o prv_prod_. Revisa que no hayas pegado la pública.'
      using errcode = '22023';
  end if;

  if p_clave = 'whatsapp_phone_number_id' and v_valor !~ '^[0-9]{5,30}$' then
    raise exception 'El identificador del número de WhatsApp es una cadena de dígitos. Recibí "%".', v_valor
      using errcode = '22023',
            hint = 'No es el número de teléfono: es el "Phone number ID" que muestra Meta en WhatsApp → Configuración de la API.';
  end if;

  insert into public.org_credentials
    (org_id, key, provider, environment, public_value, last4, is_set, configured_at, configured_by)
  values (
    p_org_id,
    p_clave,
    v_cat.provider,
    v_env,
    case when v_cat.is_secret then null else v_valor end,
    case when v_cat.is_secret then right(v_valor, 4) else null end,
    true,
    now(),
    (select auth.uid())
  )
  on conflict (org_id, key) do update
    set environment   = excluded.environment,
        public_value  = excluded.public_value,
        last4         = excluded.last4,
        is_set        = true,
        configured_at = now(),
        configured_by = excluded.configured_by
  returning * into v_row;

  if v_cat.is_secret then
    insert into public.org_secret_values (org_id, key, secret)
    values (p_org_id, p_clave, v_valor)
    on conflict (org_id, key) do update set secret = excluded.secret;
  end if;

  -- En la bitácora queda QUÉ se cambió y quién, nunca el valor.
  insert into public.audit_log (org_id, user_id, action, entity, entity_id, after)
  values (
    p_org_id, (select auth.uid()), 'org.credential_set', 'org_credentials', null,
    jsonb_build_object('key', p_clave, 'environment', v_env,
                       'is_secret', v_cat.is_secret, 'last4', v_row.last4)
  );

  return v_row;
end;
$$;

/** Quitar una credencial. Borra el secreto de verdad, no lo deja "inactivo". */
create or replace function public.clear_org_credential(p_org_id uuid, p_clave text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_org_id is null or p_org_id not in (select private.auth_org_ids_with_role(array['owner','admin'])) then
    raise exception 'Solo el dueño o el administrador del box pueden quitar las credenciales.'
      using errcode = '42501';
  end if;

  -- El borrado en cascada de la ficha se lleva el secreto por la FK compuesta.
  delete from public.org_credentials where org_id = p_org_id and key = p_clave;

  insert into public.audit_log (org_id, user_id, action, entity, entity_id, after)
  values (p_org_id, (select auth.uid()), 'org.credential_cleared', 'org_credentials', null,
          jsonb_build_object('key', p_clave));
end;
$$;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.org_onboarding     enable row level security;
alter table public.org_credentials    enable row level security;
alter table public.org_secret_values  enable row level security;

-- ------------------------------------------------------------ org_onboarding --
-- El coach lo LEE (así sabe si al box le falta configurar algo antes de pedir
-- que las reservas funcionen), pero no lo mueve.
create policy "el staff ve la puesta en marcha de su box"
  on public.org_onboarding for select
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()));

create policy "owner/admin avanzan la puesta en marcha"
  on public.org_onboarding for all
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])))
  with check (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])));

-- ----------------------------------------------------------- org_credentials --
-- Solo dueño y administrador, ni siquiera lectura para el coach: saber que un
-- box cobra con Wompi en producción y desde cuándo no es asunto suyo.
--
-- Aquí no hay política de INSERT ni de UPDATE a propósito. Se escribe por
-- `set_org_credential()`, que es la única que sabe separar el secreto de su
-- ficha. Un `with check` no puede hacer eso.
create policy "owner/admin ven el estado de sus credenciales"
  on public.org_credentials for select
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])));

create policy "owner/admin quitan sus credenciales"
  on public.org_credentials for delete
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])));

-- --------------------------------------------------------- org_secret_values --
-- Una sola política, y para `service_role`. No es lo que protege la tabla (eso
-- es el REVOKE de arriba, y que service_role salta la RLS de todos modos): está
-- para que quede escrito QUIÉN es el único que puede llegar aquí, y para que la
-- guarda de RLS no la vea como una tabla olvidada.
--
-- NO existe ninguna política para `authenticated`. Es el punto entero de esta
-- migración y hay una prueba dedicada a que siga siendo así.
create policy "solo service_role toca los secretos"
  on public.org_secret_values for all
  to service_role
  using (true)
  with check (true);

-- =============================================================================
-- Permisos
-- =============================================================================
-- Mismo criterio que en 0010 y 0014: `authenticated` puede llamarlas porque la
-- función comprueba por dentro quién es; `anon` no.
grant execute on function public.mark_onboarding_step(uuid, text, text) to authenticated;
grant execute on function public.set_org_credential(uuid, text, text, text) to authenticated;
grant execute on function public.clear_org_credential(uuid, text) to authenticated;

revoke all on function public.mark_onboarding_step(uuid, text, text)   from public, anon;
revoke all on function public.set_org_credential(uuid, text, text, text) from public, anon;
revoke all on function public.clear_org_credential(uuid, text)         from public, anon;

-- La lectura del secreto no la puede llamar nadie del navegador. Ver la nota de
-- la función sobre por qué este revoke sí es seguro y el de los helpers de RLS
-- no lo era.
grant usage on schema private to service_role;
revoke all on function private.org_secret(uuid, text) from public, anon, authenticated;
grant execute on function private.org_secret(uuid, text) to service_role;

revoke all on function private.credential_keys()      from public, anon;
revoke all on function private.org_settings_defaults() from public, anon;

-- =============================================================================
-- Los boxes que ya existen
-- =============================================================================
insert into public.org_onboarding (org_id, steps_done, current_step, completed_at)
select o.id,
       -- Un box que ya venía andando no tiene que volver a hacer el asistente.
       case when o.onboarded_at is not null
            then array['box','plans','billing','athletes','automations']::text[]
            else '{}'::text[] end,
       case when o.onboarded_at is not null then 'done' else 'box' end,
       o.onboarded_at
from public.organizations o
on conflict (org_id) do nothing;

do $$ begin perform public.assert_rls_enabled(); end $$;
