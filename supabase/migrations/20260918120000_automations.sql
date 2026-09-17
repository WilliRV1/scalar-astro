-- =============================================================================
-- 0011 · Motor de automatizaciones y mensajería
-- =============================================================================
-- Este es el diferenciador del producto. El CRUD lo tiene todo el mundo; lo que
-- se vende es que el sistema trabaje solo. Ver docs/04-automatizaciones.md.
--
-- El modelo mental es siempre el mismo y vive en DATOS, no en código:
--
--     CUANDO (disparador: un horario o un evento)
--       SI (se cumplen las condiciones)
--         ENTONCES (acción: mensaje, alerta al staff, etiqueta)
--           RESPETANDO (horario permitido, tope por atleta, opt-in vigente)
--
-- Por eso el box prende, apaga y ajusta cada regla desde la interfaz sin que
-- nosotros despleguemos nada, y por eso se puede vender "automatización a la
-- medida" sin escribir código nuevo.
--
-- Las cuatro cosas que pueden arruinar el producto se resuelven AQUÍ, en la
-- base, y no en la Edge Function (que se puede reintentar, caer a mitad o
-- ejecutarse dos veces en paralelo):
--
--   1. IDEMPOTENCIA. `message_outbox (org_id, dedupe_key)` es único. Si el job
--      corre dos veces, el atleta NO recibe el mismo cobro dos veces. Es el
--      error que hace que un cliente cancele.
--   2. ANTIFATIGA. Tope de mensajes automáticos por atleta al mes (4 por
--      defecto) y uno solo por día: si dos reglas coinciden el mismo día, gana
--      la de mayor prioridad y la otra se descarta.
--   3. HORARIO SILENCIOSO. Nada antes de las 8:00 ni después de las 21:00 HORA
--      DEL BOX. Un job a las 03:00 UTC son las 22:00 del día anterior en
--      Bogotá: sin la zona horaria, el motor escribe de madrugada y el box
--      pierde la confianza de sus atletas en una noche.
--   4. CONCILIACIÓN. Cuando entra un pago se CANCELAN los mensajes de cobro
--      encolados de esa factura. Cobrarle a quien ya pagó es el peor bug
--      posible del producto y tiene prueba propia.
--
-- Todas las funciones de job aceptan `p_now` para poder probarlas con fechas
-- fijas, igual que `generate_invoices` (migración 0007).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ajustes de automatización por box
-- -----------------------------------------------------------------------------
-- Tabla aparte y no columnas en `organizations` porque esto lo toca el dueño a
-- diario (sobre todo el interruptor de simulación) y porque así la RLS de la
-- configuración de mensajería es independiente de la del box.
--
-- `simulation_mode` arranca en TRUE a propósito: todo cliente nuevo pasa su
-- primera semana viendo qué HABRÍA mandado el sistema antes de dejarlo hablar
-- con sus atletas. Es también el modo de la demo de ventas.
-- -----------------------------------------------------------------------------
create table public.automation_settings (
  org_id                             uuid primary key
                                     references public.organizations(id) on delete cascade,
  is_enabled                         boolean not null default true,
  simulation_mode                    boolean not null default true,
  -- Horario permitido, en hora del box. [8, 21) = de 8:00 a 20:59.
  quiet_start_hour                   int not null default 8
                                     check (quiet_start_hour between 0 and 23),
  quiet_end_hour                     int not null default 21
                                     check (quiet_end_hour between 1 and 24),
  max_messages_per_athlete_per_month int not null default 4
                                     check (max_messages_per_athlete_per_month >= 0),
  -- Si dos reglas coinciden el mismo día, gana la de mayor prioridad. Este es
  -- el tope que lo impone.
  max_messages_per_athlete_per_day   int not null default 1
                                     check (max_messages_per_athlete_per_day >= 0),
  provider                           text not null default 'wa_me'
                                     check (provider in ('wa_me','cloud_api')),
  -- A dónde van las alertas internas (dueño). Si es null se usa el teléfono del box.
  staff_phone                        text
                                     check (staff_phone is null or staff_phone ~ '^\+[1-9][0-9]{7,14}$'),
  created_at                         timestamptz not null default now(),
  updated_at                         timestamptz not null default now(),
  check (quiet_end_hour > quiet_start_hour)
);

create trigger automation_settings_touch before update on public.automation_settings
  for each row execute function public.touch_updated_at();

comment on table public.automation_settings is
  'Interruptores de mensajería por box: simulación, horario silencioso y antifatiga.';
comment on column public.automation_settings.simulation_mode is
  'Encola los mensajes marcándolos como simulados y no los envía. Arranca encendido.';

-- -----------------------------------------------------------------------------
-- Plantillas de mensaje
-- -----------------------------------------------------------------------------
-- `org_id is null` = catálogo de fábrica, compartido por todos los boxes (mismo
-- patrón que `movements`). Al dar de alta un box se le copian para que pueda
-- editar el texto sin afectar a los demás.
-- -----------------------------------------------------------------------------
create table public.message_templates (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid references public.organizations(id) on delete cascade,
  key                    text not null check (key ~ '^[a-z][a-z0-9_]{2,60}$'),
  name                   text not null,
  channel                text not null default 'whatsapp'
                         check (channel in ('whatsapp','email','sms')),
  -- La categoría decide el precio en Meta y, sobre todo, las reglas: una
  -- plantilla `marketing` exige opt-in vigente y respeta `no_marketing`.
  category               text not null default 'utility'
                         check (category in ('utility','marketing','authentication','internal')),
  provider_template_name text,
  body                   text not null,
  variables              text[] not null default '{}',
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Una clave por box; y una sola vez en el catálogo global.
create unique index message_templates_key_idx
  on public.message_templates (coalesce(org_id::text, 'catalogo'), key);
create index message_templates_org_idx on public.message_templates (org_id, key);

create trigger message_templates_touch before update on public.message_templates
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Reglas
-- -----------------------------------------------------------------------------
create table public.automation_rules (
  id             uuid primary key default gen_random_uuid(),
  -- null = catálogo de fábrica (las 14 reglas que se muestran en la demo).
  org_id         uuid references public.organizations(id) on delete cascade,
  key            text not null check (key ~ '^[a-z][a-z0-9_]{2,60}$'),
  name           text not null,
  description    text,
  trigger_type   text not null check (trigger_type in ('schedule','event')),
  trigger_config jsonb not null default '{}'::jsonb,
  conditions     jsonb not null default '[]'::jsonb,
  action_type    text not null
                 check (action_type in ('send_message','notify_staff','create_task','tag_athlete','suspend_access')),
  template_id    uuid references public.message_templates(id) on delete set null,
  category       text not null default 'utility'
                 check (category in ('utility','marketing','authentication','internal')),
  -- Mayor número = gana el día. Ver `queue_automation_message`.
  priority       int not null default 50 check (priority between 0 and 100),
  is_active      boolean not null default true,
  last_run_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index automation_rules_key_idx
  on public.automation_rules (coalesce(org_id::text, 'catalogo'), key);
create index automation_rules_org_activas_idx
  on public.automation_rules (org_id, priority desc) where is_active;

create trigger automation_rules_touch before update on public.automation_rules
  for each row execute function public.touch_updated_at();

comment on column public.automation_rules.priority is
  'Desempate del día: si dos reglas coinciden para el mismo atleta, gana la mayor.';

-- -----------------------------------------------------------------------------
-- Bandeja de salida
-- -----------------------------------------------------------------------------
-- Bitácora completa: el dueño puede ver exactamente qué se le mandó a cada
-- atleta y cuándo. Sin esto, el primer reclamo del tipo "me están cobrando y yo
-- ya pagué" no se puede responder.
-- -----------------------------------------------------------------------------
create table public.message_outbox (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  athlete_id      uuid references public.athletes(id) on delete cascade,
  rule_id         uuid references public.automation_rules(id) on delete set null,
  -- La factura que originó el mensaje. Es lo que permite CANCELAR el cobro
  -- encolado cuando entra el pago.
  invoice_id      uuid references public.invoices(id) on delete cascade,
  -- 'athlete' cuenta para la antifatiga; 'staff' (alertas al dueño) no.
  audience        text not null default 'athlete' check (audience in ('athlete','staff')),
  channel         text not null default 'whatsapp' check (channel in ('whatsapp','email','sms')),
  to_address      text not null,
  template_key    text,
  category        text not null default 'utility'
                  check (category in ('utility','marketing','authentication','internal')),
  rendered_body   text not null,
  -- queued    : listo para que lo tome el enviador
  -- sending   : tomado por un proceso (evita que dos lo manden a la vez)
  -- ready     : etapa 0 de WhatsApp — el texto está listo para el clic del coach
  -- simulated : el box está en modo simulación; se registra lo que habría pasado
  status          text not null default 'queued'
                  check (status in ('queued','sending','ready','sent','delivered','read','failed','cancelled','simulated')),
  simulated       boolean not null default false,
  scheduled_for   timestamptz not null default now(),
  -- El día DEL BOX en que la regla disparó. Es la unidad de la antifatiga:
  -- sin esto habría que recalcular zonas horarias en cada conteo.
  queued_for_day  date not null,
  sent_at         timestamptz,
  provider        text,
  provider_msg_id text,
  error           text,
  attempts        int not null default 0,
  cost_micros     bigint,
  -- IDEMPOTENCIA. Único por box: correr el job dos veces no encola dos veces.
  dedupe_key      text not null,
  cancelled_at    timestamptz,
  cancel_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, dedupe_key)
);

create index message_outbox_pendientes_idx
  on public.message_outbox (org_id, status, scheduled_for);
create index message_outbox_bitacora_idx
  on public.message_outbox (org_id, created_at desc);
create index message_outbox_atleta_idx
  on public.message_outbox (org_id, athlete_id, queued_for_day desc);
create index message_outbox_factura_idx
  on public.message_outbox (org_id, invoice_id) where invoice_id is not null;

create trigger message_outbox_touch before update on public.message_outbox
  for each row execute function public.touch_updated_at();

comment on column public.message_outbox.dedupe_key is
  'Único por box. Formato: <regla>:<entidad>:<periodo>. Es la idempotencia del motor.';

-- -----------------------------------------------------------------------------
-- Riesgo de fuga
-- -----------------------------------------------------------------------------
-- El valor no está en la fórmula: está en que la lista aparezca sola cada
-- mañana en el tablero del coach, ordenada y con el motivo. Hoy esa información
-- vive en la cabeza del dueño y se le olvida.
-- -----------------------------------------------------------------------------
create table public.athlete_risk_scores (
  org_id                uuid not null references public.organizations(id) on delete cascade,
  athlete_id            uuid not null references public.athletes(id) on delete cascade,
  computed_on           date not null default current_date,
  days_since_last_visit int,
  visits_last_30d       int not null default 0,
  visits_prev_30d       int not null default 0,
  days_overdue          int not null default 0,
  no_shows_30d          int not null default 0,
  tenure_days           int not null default 0,
  never_logged_result   boolean not null default false,
  score                 int not null check (score between 0 and 100),
  band                  text not null check (band in ('ok','watch','at_risk','critical')),
  reasons               jsonb not null default '[]'::jsonb,
  computed_at           timestamptz not null default now(),
  primary key (org_id, athlete_id, computed_on)
);

create index athlete_risk_scores_tablero_idx
  on public.athlete_risk_scores (org_id, computed_on desc, score desc);

comment on table public.athlete_risk_scores is
  'Foto diaria del riesgo de fuga por atleta. La consume el tablero del coach.';

-- =============================================================================
-- Utilidades
-- =============================================================================

/** 18000000 centavos -> "$ 180.000". El separador de miles no depende del locale. */
create or replace function public.formato_pesos(p_cents bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select '$ ' || replace(to_char(coalesce(p_cents, 0) / 100, 'FM9,999,999,999'), ',', '.')
$$;

/**
 * Reemplaza {{clave}} por su valor. Lo que no venga en `p_vars` se deja vacío:
 * un mensaje con "{{nombre}}" literal es peor que uno con un hueco.
 */
create or replace function public.render_template(p_body text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_texto text := coalesce(p_body, '');
  v_par   record;
begin
  for v_par in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb))
  loop
    v_texto := replace(v_texto, '{{' || v_par.key || '}}', coalesce(v_par.value, ''));
  end loop;
  -- Cualquier variable que la regla no supo llenar se borra en vez de viajar.
  return regexp_replace(v_texto, '\{\{[a-z0-9_]+\}\}', '', 'g');
end;
$$;

comment on function public.render_template is
  'Render de plantillas {{variable}}. Espejo exacto de src/features/automations/plantillas.ts';

/**
 * ¿Existe esa tabla con esas columnas?
 *
 * Las reservas y la asistencia las construye otro módulo. El motor tiene que
 * funcionar ANTES de que existan y aprovecharlas en cuanto aparezcan, sin
 * romperse si llegan con otra forma.
 */
create or replace function public.automation_source_ready(p_table text, p_cols text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select to_regclass(p_table) is not null
     and not exists (
       select 1 from unnest(p_cols) c
       where not exists (
         select 1 from information_schema.columns ic
         where ic.table_schema = split_part(p_table, '.', 1)
           and ic.table_name   = split_part(p_table, '.', 2)
           and ic.column_name  = c
       )
     )
$$;

/** Ajustes del box, con los valores por defecto si todavía no tiene fila. */
create or replace function public.automation_settings_of(p_org_id uuid)
returns public.automation_settings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.automation_settings;
begin
  select * into v from public.automation_settings s where s.org_id = p_org_id;
  if not found then
    v.org_id := p_org_id;
    v.is_enabled := true;
    v.simulation_mode := true;
    v.quiet_start_hour := 8;
    v.quiet_end_hour := 21;
    v.max_messages_per_athlete_per_month := 4;
    v.max_messages_per_athlete_per_day := 1;
    v.provider := 'wa_me';
  end if;
  return v;
end;
$$;

/**
 * Horario silencioso: corre el envío al siguiente momento permitido, EN LA ZONA
 * HORARIA DEL BOX.
 *
 * Un mensaje que caería a las 3 de la mañana se programa para las 8:00 del
 * mismo día; uno de las 23:00, para las 8:00 del siguiente. Nada antes de las
 * 8:00 ni después de las 21:00 (docs/04 §Reglas duras, 4).
 */
create or replace function public.next_allowed_send_at(
  p_when     timestamptz,
  p_timezone text,
  p_start    int default 8,
  p_end      int default 21
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp;
  v_dia   date;
  v_hora  int;
begin
  v_local := p_when at time zone p_timezone;
  v_dia   := v_local::date;
  v_hora  := extract(hour from v_local)::int;

  if v_hora < p_start then
    return ((v_dia + make_interval(hours => p_start))::timestamp) at time zone p_timezone;
  elsif v_hora >= p_end then
    return ((v_dia + 1 + make_interval(hours => p_start))::timestamp) at time zone p_timezone;
  end if;

  return p_when;
end;
$$;

comment on function public.next_allowed_send_at is
  'Horario silencioso en hora del box. 03:00 -> 08:00 del mismo día; 23:00 -> 08:00 del siguiente.';

-- =============================================================================
-- El encolador: aquí viven TODAS las reglas duras de mensajería
-- =============================================================================
-- Una sola puerta de entrada a `message_outbox`. Ninguna regla encola por su
-- cuenta: así el opt-in, el horario silencioso, la antifatiga y la idempotencia
-- se cumplen siempre, incluso para una regla que escribamos con prisa dentro de
-- seis meses.
--
-- Devuelve el id del mensaje encolado, o NULL si se descartó (que es un
-- resultado normal y frecuente, no un error).
-- =============================================================================
create or replace function public.queue_automation_message(
  p_org_id       uuid,
  p_rule_id      uuid,
  p_athlete_id   uuid,
  p_template_key text,
  p_dedupe_key   text,
  p_vars         jsonb default '{}'::jsonb,
  p_now          timestamptz default now(),
  p_invoice_id   uuid default null,
  p_audience     text default 'athlete'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      public.organizations%rowtype;
  v_set      public.automation_settings;
  v_tpl      public.message_templates%rowtype;
  v_ath      public.athletes%rowtype;
  v_dia      date;
  v_destino  text;
  v_cuerpo   text;
  v_cuando   timestamptz;
  v_mes      int;
  v_id       uuid;
begin
  if p_dedupe_key is null or p_dedupe_key = '' then
    raise exception 'Un mensaje automático sin dedupe_key no es idempotente.';
  end if;

  select * into v_org from public.organizations o where o.id = p_org_id;
  if not found then return null; end if;

  v_set := public.automation_settings_of(p_org_id);
  if not v_set.is_enabled then return null; end if;

  v_dia := (p_now at time zone v_org.timezone)::date;

  -- IDEMPOTENCIA (1 de 2): se comprueba antes para no gastar trabajo. El candado
  -- de verdad es el índice único, más abajo.
  if exists (
    select 1 from public.message_outbox m
    where m.org_id = p_org_id and m.dedupe_key = p_dedupe_key
  ) then
    return null;
  end if;

  -- La plantilla propia del box gana sobre la de fábrica.
  select * into v_tpl
  from public.message_templates t
  where t.key = p_template_key
    and t.is_active
    and (t.org_id = p_org_id or t.org_id is null)
  order by (t.org_id is null)     -- false (la del box) primero
  limit 1;
  if not found then return null; end if;

  if p_audience = 'athlete' then
    select * into v_ath from public.athletes a where a.id = p_athlete_id;
    if not found or v_ath.deleted_at is not null or v_ath.org_id <> p_org_id then
      return null;
    end if;

    v_destino := v_ath.phone;
    if v_destino is null then return null; end if;

    -- Opt-in y salida fácil (docs/04 §Reglas duras, 2 y 3). El marketing exige
    -- consentimiento con fecha; lo transaccional (un cobro que el atleta ya
    -- espera por su relación comercial con el box) no.
    if v_tpl.category = 'marketing' then
      if v_ath.consent_whatsapp_at is null or 'no_marketing' = any(v_ath.tags) then
        return null;
      end if;
    end if;

    -- ANTIFATIGA (a): uno por atleta por día. Como run_automations recorre las
    -- reglas de mayor a menor prioridad, la primera que llega es la que gana y
    -- las demás del día se descartan.
    if v_set.max_messages_per_athlete_per_day > 0 then
      if (
        select count(*) from public.message_outbox m
        where m.org_id = p_org_id
          and m.athlete_id = p_athlete_id
          and m.audience = 'athlete'
          and m.queued_for_day = v_dia
          and m.status <> 'cancelled'
      ) >= v_set.max_messages_per_athlete_per_day then
        return null;
      end if;
    end if;

    -- ANTIFATIGA (b): tope del mes. Un atleta que recibe cinco mensajes en un
    -- mes deja de leerlos y bloquea el número del box.
    select count(*) into v_mes
    from public.message_outbox m
    where m.org_id = p_org_id
      and m.athlete_id = p_athlete_id
      and m.audience = 'athlete'
      and m.status <> 'cancelled'
      and m.queued_for_day >= date_trunc('month', v_dia)::date
      and m.queued_for_day <  (date_trunc('month', v_dia) + interval '1 month')::date;

    if v_mes >= v_set.max_messages_per_athlete_per_month then
      return null;
    end if;
  else
    -- Alerta interna: va al dueño, no cuenta para la antifatiga del atleta.
    v_destino := coalesce(v_set.staff_phone, v_org.phone);
    if v_destino is null then return null; end if;
  end if;

  v_cuerpo := public.render_template(v_tpl.body, p_vars);
  v_cuando := public.next_allowed_send_at(
    p_now, v_org.timezone, v_set.quiet_start_hour, v_set.quiet_end_hour);

  -- IDEMPOTENCIA (2 de 2): el índice único decide. Si dos ejecuciones del job
  -- llegan hasta aquí a la vez, la segunda no inserta nada y devuelve NULL.
  insert into public.message_outbox (
    org_id, athlete_id, rule_id, invoice_id, audience, channel, to_address,
    template_key, category, rendered_body, status, simulated, scheduled_for,
    queued_for_day, dedupe_key
  )
  values (
    p_org_id,
    p_athlete_id, p_rule_id, p_invoice_id, p_audience, v_tpl.channel, v_destino,
    v_tpl.key, v_tpl.category, v_cuerpo, 'queued', v_set.simulation_mode, v_cuando,
    v_dia, p_dedupe_key
  )
  on conflict (org_id, dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.queue_automation_message is
  'Única puerta a message_outbox: opt-in, horario silencioso, antifatiga e idempotencia.';

-- =============================================================================
-- Señales de actividad (asistencia y no-shows)
-- =============================================================================
-- Las reservas y la asistencia las está construyendo otro módulo. Estas dos
-- funciones se protegen con `automation_source_ready` y usan SQL dinámico: si
-- las tablas no existen todavía, el motor sigue funcionando con el resto de
-- señales en vez de caerse.
-- =============================================================================
create or replace function public.athlete_activity(p_org_id uuid, p_today date)
returns table (
  athlete_id     uuid,
  last_visit     date,
  visits_last_30 int,
  visits_prev_30 int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.automation_source_ready('public.attendances', array['org_id','athlete_id','date','status']) then
    return query execute $q$
      select a.id,
             max(t.date) filter (where t.status = 'attended'),
             count(*) filter (where t.status = 'attended' and t.date >  $2 - 30)::int,
             count(*) filter (where t.status = 'attended' and t.date <= $2 - 30
                                                         and t.date >  $2 - 60)::int
      from public.athletes a
      left join public.attendances t
             on t.athlete_id = a.id and t.org_id = a.org_id
      where a.org_id = $1 and a.deleted_at is null
      group by a.id
    $q$ using p_org_id, p_today;
  else
    return query
      select a.id, null::date, 0, 0
      from public.athletes a
      where a.org_id = p_org_id and a.deleted_at is null;
  end if;
end;
$$;

/**
 * Atletas que YA registraron algún resultado.
 *
 * "Nunca registró un resultado" es la señal de que el atleta nunca se enganchó
 * con el método. Cuenta tanto una marca personal (`personal_records`) como un
 * resultado de WOD (`results`, que llega con el módulo de entrenamientos), así
 * que la segunda va protegida por si todavía no existe.
 */
create or replace function public.athletes_with_results(p_org_id uuid)
returns table (athlete_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select distinct pr.athlete_id
    from public.personal_records pr
    where pr.org_id = p_org_id;

  if public.automation_source_ready('public.results', array['org_id','athlete_id']) then
    return query execute $q$
      select distinct r.athlete_id from public.results r where r.org_id = $1
    $q$ using p_org_id;
  end if;
end;
$$;

create or replace function public.athlete_no_shows(p_org_id uuid, p_today date)
returns table (athlete_id uuid, no_shows_30 int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.automation_source_ready('public.reservations', array['org_id','athlete_id','status','booked_at']) then
    return query execute $q$
      select a.id,
             count(r.id) filter (
               where r.status = 'no_show' and r.booked_at >= ($2 - 30)::timestamptz
             )::int
      from public.athletes a
      left join public.reservations r on r.athlete_id = a.id and r.org_id = a.org_id
      where a.org_id = $1 and a.deleted_at is null
      group by a.id
    $q$ using p_org_id, p_today;
  else
    return query
      select a.id, 0
      from public.athletes a
      where a.org_id = p_org_id and a.deleted_at is null;
  end if;
end;
$$;

-- =============================================================================
-- El job: evalúa las reglas activas y encola
-- =============================================================================
-- Recorre las reglas de MAYOR a MENOR prioridad. Combinado con el tope diario
-- de `queue_automation_message`, eso implementa literalmente la regla de
-- docs/04: "si dos reglas coinciden el mismo día, gana la de mayor prioridad y
-- la otra se descarta".
--
-- `p_now` es inyectable para poder probar fechas fijas, igual que en
-- `generate_invoices`.
-- =============================================================================
create or replace function public.run_automations(
  p_org_id uuid default null,
  p_now    timestamptz default now()
)
returns table (org_id uuid, queued int, evaluated int, run_date date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  o         record;
  regla     record;
  cand      record;
  v_today   date;
  v_enc     int;
  v_eval    int;
  v_tpl     text;
  v_link    text;
  v_id      uuid;
  v_dias    int;
  v_hay_asis boolean;
begin
  for o in
    select org.id, org.name, org.timezone, org.settings, org.phone
    from public.organizations org
    where (p_org_id is null or org.id = p_org_id)
      and org.status in ('trial','active','past_due')
  loop
    -- Un solo proceso automatizando por box a la vez. Si otra ejecución ya lo
    -- tiene, esta se salta el box en vez de esperar: el job vuelve a correr.
    if not pg_try_advisory_xact_lock(hashtext('run_automations'), hashtext(o.id::text)) then
      continue;
    end if;

    -- "Hoy" es hoy en el box, no en UTC.
    v_today := (p_now at time zone o.timezone)::date;
    v_link  := coalesce(o.settings->>'payment_link', '');
    v_enc   := 0;
    v_eval  := 0;
    v_hay_asis := public.automation_source_ready(
      'public.attendances', array['org_id','athlete_id','date','status']);

    for regla in
      select r.id, r.key, r.trigger_config, r.priority,
             coalesce(t.key, '') as template_key
      from public.automation_rules r
      left join public.message_templates t on t.id = r.template_id
      where r.org_id = o.id
        and r.is_active
        and r.trigger_type = 'schedule'
      order by r.priority desc, r.key
    loop
      v_eval := v_eval + 1;
      v_tpl := nullif(regla.template_key, '');

      -- ---------------------------------------------------------------------
      -- 1 · Aviso de vencimiento (5 y 2 días antes del due_on)
      -- ---------------------------------------------------------------------
      if regla.key = 'payment_due_soon' then
        for cand in
          select i.id, i.athlete_id, i.due_on, i.amount_cents, i.number,
                 (i.due_on - v_today) as faltan, a.first_name
          from public.invoices i
          join public.athletes a on a.id = i.athlete_id
          where i.org_id = o.id
            and i.status in ('open','partial')
            and (i.due_on - v_today) in (
              select v::int from jsonb_array_elements_text(
                coalesce(regla.trigger_config->'days_before', '[5,2]'::jsonb)) as v)
          order by i.due_on
        loop
          v_id := public.queue_automation_message(
            o.id, regla.id, cand.athlete_id, coalesce(v_tpl, 'payment_due_soon'),
            'payment_due_soon:' || cand.id || ':' || cand.faltan,
            jsonb_build_object(
              'nombre',  cand.first_name,
              'fecha',   to_char(cand.due_on, 'DD/MM/YYYY'),
              'valor',   public.formato_pesos(cand.amount_cents),
              'dias',    cand.faltan::text,
              'box',     o.name,
              'link',    v_link),
            p_now, cand.id, 'athlete');
          if v_id is not null then v_enc := v_enc + 1; end if;
        end loop;

      -- ---------------------------------------------------------------------
      -- 2 · Cobro vencido (1, 4 y 8 días después). A los 8 días, además, alerta
      --     al dueño: si a esas alturas no pagó, deja de ser un olvido.
      -- ---------------------------------------------------------------------
      elsif regla.key = 'payment_overdue' then
        for cand in
          select i.id, i.athlete_id, i.due_on, i.amount_cents, i.number,
                 (v_today - i.due_on) as mora, a.first_name, a.last_name
          from public.invoices i
          join public.athletes a on a.id = i.athlete_id
          where i.org_id = o.id
            and i.status in ('open','partial','overdue')
            and (v_today - i.due_on) in (
              select v::int from jsonb_array_elements_text(
                coalesce(regla.trigger_config->'days_after', '[1,4,8]'::jsonb)) as v)
          order by i.due_on
        loop
          v_id := public.queue_automation_message(
            o.id, regla.id, cand.athlete_id, coalesce(v_tpl, 'payment_overdue'),
            'payment_overdue:' || cand.id || ':' || cand.mora,
            jsonb_build_object(
              'nombre',  cand.first_name,
              'fecha',   to_char(cand.due_on, 'DD/MM/YYYY'),
              'valor',   public.formato_pesos(cand.amount_cents),
              'dias',    cand.mora::text,
              'box',     o.name,
              'link',    v_link),
            p_now, cand.id, 'athlete');
          if v_id is not null then v_enc := v_enc + 1; end if;

          if cand.mora >= 8 then
            v_id := public.queue_automation_message(
              o.id, regla.id, cand.athlete_id, 'payment_overdue_staff',
              'payment_overdue_staff:' || cand.id,
              jsonb_build_object(
                'nombre', trim(cand.first_name || ' ' || coalesce(cand.last_name, '')),
                'valor',  public.formato_pesos(cand.amount_cents),
                'dias',   cand.mora::text,
                'box',    o.name),
              p_now, cand.id, 'staff');
            if v_id is not null then v_enc := v_enc + 1; end if;
          end if;
        end loop;

      -- ---------------------------------------------------------------------
      -- 3 · Corte de acceso (10 días de mora)
      -- ---------------------------------------------------------------------
      -- NO manda mensaje automático al atleta: a esa altura la conversación es
      -- humana (docs/04, regla 3). Marca al atleta y avisa al coach.
      --
      -- Se marca con una etiqueta y no cambiando `subscriptions.status` a
      -- propósito: pasar la suscripción fuera de 'active' la sacaría del motor
      -- de cobros y el atleta dejaría de facturarse, que no es lo que significa
      -- "cortar el acceso". El bloqueo real de entrada lo aplica el módulo de
      -- reservas leyendo esta etiqueta.
      -- ---------------------------------------------------------------------
      elsif regla.key = 'access_cutoff' then
        for cand in
          select i.id, i.athlete_id, i.amount_cents, (v_today - i.due_on) as mora,
                 a.first_name, a.last_name
          from public.invoices i
          join public.athletes a on a.id = i.athlete_id
          where i.org_id = o.id
            and i.status in ('open','partial','overdue')
            and (v_today - i.due_on) >= coalesce((regla.trigger_config->>'days')::int, 10)
        loop
          update public.athletes a
          set tags = array_append(a.tags, 'acceso_suspendido')
          where a.id = cand.athlete_id
            and not ('acceso_suspendido' = any(a.tags));

          v_id := public.queue_automation_message(
            o.id, regla.id, cand.athlete_id, 'access_cutoff_staff',
            'access_cutoff:' || cand.id,
            jsonb_build_object(
              'nombre', trim(cand.first_name || ' ' || coalesce(cand.last_name, '')),
              'valor',  public.formato_pesos(cand.amount_cents),
              'dias',   cand.mora::text,
              'box',    o.name),
            p_now, cand.id, 'staff');
          if v_id is not null then v_enc := v_enc + 1; end if;
        end loop;

      -- ---------------------------------------------------------------------
      -- 4 · Atleta que dejó de venir (7 / 14 / 21 días)
      -- ---------------------------------------------------------------------
      elsif regla.key = 'athlete_inactive' and v_hay_asis then
        for cand in
          select a.id as athlete_id, a.first_name,
                 (v_today - act.last_visit) as dias
          from public.athletes a
          join public.athlete_activity(o.id, v_today) act on act.athlete_id = a.id
          where a.org_id = o.id
            and a.deleted_at is null
            and a.status in ('active','overdue')
            and act.last_visit is not null
            and (v_today - act.last_visit) in (
              select v::int from jsonb_array_elements_text(
                coalesce(regla.trigger_config->'days', '[7,14,21]'::jsonb)) as v)
        loop
          v_dias := cand.dias;
          if v_dias >= 21 then
            -- 21 días: tarea de llamada para el dueño. Un mensaje más no va a
            -- traerlo de vuelta; una llamada, a veces sí.
            v_id := public.queue_automation_message(
              o.id, regla.id, cand.athlete_id, 'inactive_call_task',
              'athlete_inactive:' || cand.athlete_id || ':' || v_dias,
              jsonb_build_object('nombre', cand.first_name, 'dias', v_dias::text, 'box', o.name),
              p_now, null, 'staff');
          elsif v_dias >= 14 then
            v_id := public.queue_automation_message(
              o.id, regla.id, cand.athlete_id, coalesce(v_tpl, 'winback_14d'),
              'athlete_inactive:' || cand.athlete_id || ':' || v_dias,
              jsonb_build_object('nombre', cand.first_name, 'dias', v_dias::text, 'box', o.name),
              p_now, null, 'athlete');
          else
            v_id := public.queue_automation_message(
              o.id, regla.id, cand.athlete_id, 'inactive_coach_alert',
              'athlete_inactive:' || cand.athlete_id || ':' || v_dias,
              jsonb_build_object('nombre', cand.first_name, 'dias', v_dias::text, 'box', o.name),
              p_now, null, 'staff');
          end if;
          if v_id is not null then v_enc := v_enc + 1; end if;
        end loop;

      -- ---------------------------------------------------------------------
      -- 5 · Bienvenida (alta de atleta)
      -- ---------------------------------------------------------------------
      elsif regla.key = 'welcome' then
        for cand in
          select a.id, a.first_name
          from public.athletes a
          where a.org_id = o.id
            and a.deleted_at is null
            and a.joined_on = v_today
        loop
          v_id := public.queue_automation_message(
            o.id, regla.id, cand.id, coalesce(v_tpl, 'welcome'),
            'welcome:' || cand.id,
            jsonb_build_object('nombre', cand.first_name, 'box', o.name, 'link', v_link),
            p_now, null, 'athlete');
          if v_id is not null then v_enc := v_enc + 1; end if;
        end loop;

      -- ---------------------------------------------------------------------
      -- 6 · Seguimiento de clase de prueba (24 h después, si no se convirtió)
      -- ---------------------------------------------------------------------
      elsif regla.key = 'trial_followup' then
        for cand in
          select a.id, a.first_name
          from public.athletes a
          where a.org_id = o.id
            and a.deleted_at is null
            and a.status in ('lead','trial')
            and a.joined_on = v_today - 1
            and not exists (
              select 1 from public.subscriptions s
              where s.athlete_id = a.id and s.status = 'active')
        loop
          v_id := public.queue_automation_message(
            o.id, regla.id, cand.id, coalesce(v_tpl, 'trial_followup'),
            'trial_followup:' || cand.id,
            jsonb_build_object('nombre', cand.first_name, 'box', o.name, 'link', v_link),
            p_now, null, 'athlete');
          if v_id is not null then v_enc := v_enc + 1; end if;
        end loop;

      -- ---------------------------------------------------------------------
      -- 7 · Felicitación por PR (publicidad gratis en las historias del atleta)
      -- ---------------------------------------------------------------------
      elsif regla.key = 'pr_achieved' then
        for cand in
          select pr.id, pr.athlete_id, pr.value_numeric, pr.unit, pr.reps,
                 a.first_name, m.name as movimiento
          from public.personal_records pr
          join public.athletes a on a.id = pr.athlete_id
          join public.movements m on m.id = pr.movement_id
          where pr.org_id = o.id
            and pr.achieved_on = v_today
        loop
          v_id := public.queue_automation_message(
            o.id, regla.id, cand.athlete_id, coalesce(v_tpl, 'pr_achieved'),
            'pr_achieved:' || cand.id,
            jsonb_build_object(
              'nombre',     cand.first_name,
              'movimiento', cand.movimiento,
              'marca',      trim(to_char(cand.value_numeric, 'FM999999.99')) || ' ' || cand.unit,
              'box',        o.name),
            p_now, null, 'athlete');
          if v_id is not null then v_enc := v_enc + 1; end if;
        end loop;

      -- ---------------------------------------------------------------------
      -- 8 · Cumpleaños
      -- ---------------------------------------------------------------------
      elsif regla.key = 'birthday' then
        for cand in
          select a.id, a.first_name
          from public.athletes a
          where a.org_id = o.id
            and a.deleted_at is null
            and a.status not in ('churned')
            and a.birth_date is not null
            and extract(month from a.birth_date) = extract(month from v_today)
            and extract(day   from a.birth_date) = extract(day   from v_today)
        loop
          v_id := public.queue_automation_message(
            o.id, regla.id, cand.id, coalesce(v_tpl, 'birthday'),
            'birthday:' || cand.id || ':' || extract(year from v_today)::int,
            jsonb_build_object('nombre', cand.first_name, 'box', o.name),
            p_now, null, 'athlete');
          if v_id is not null then v_enc := v_enc + 1; end if;
        end loop;

      -- ---------------------------------------------------------------------
      -- 9 · Insumo en mínimo. El módulo de insumos llega en otra migración, así
      --     que la consulta va protegida y en SQL dinámico.
      -- ---------------------------------------------------------------------
      elsif regla.key = 'low_stock'
            and public.automation_source_ready('public.supplies',
                  array['org_id','name','current_stock','min_stock','is_active']) then
        for cand in
          execute $q$
            select s.id, s.name, s.current_stock, s.unit, s.last_purchased_on,
                   s.avg_unit_cost_cents, s.default_supplier_id
            from public.supplies s
            where s.org_id = $1 and s.is_active and s.current_stock <= s.min_stock
          $q$ using o.id
        loop
          v_id := public.queue_automation_message(
            o.id, regla.id, null, coalesce(v_tpl, 'low_stock_alert'),
            'low_stock:' || cand.id || ':' || to_char(v_today, 'YYYY-MM-DD'),
            jsonb_build_object(
              'box',       o.name,
              'insumo',    cand.name,
              'fecha',     coalesce(to_char(cand.last_purchased_on, 'DD/MM/YYYY'), 'sin registro'),
              'proveedor', coalesce((select sup.name from public.suppliers sup
                                     where sup.id = cand.default_supplier_id), 'sin proveedor'),
              'valor',     public.formato_pesos(cand.avg_unit_cost_cents)),
            p_now, null, 'staff');
          if v_id is not null then v_enc := v_enc + 1; end if;
        end loop;

      -- ---------------------------------------------------------------------
      -- 10 · Reporte semanal del box (lunes)
      -- ---------------------------------------------------------------------
      elsif regla.key = 'weekly_report' then
        if extract(isodow from v_today)::int = coalesce((regla.trigger_config->>'isodow')::int, 1) then
          v_id := public.queue_automation_message(
            o.id, regla.id, null, coalesce(v_tpl, 'weekly_report'),
            'weekly_report:' || to_char(v_today, 'IYYY-"S"IW'),
            public.weekly_report(o.id, p_now),
            p_now, null, 'staff');
          if v_id is not null then v_enc := v_enc + 1; end if;
        end if;

      -- ---------------------------------------------------------------------
      -- 12 · Recordatorio de clase (2 h antes). Baja el no-show de forma medible.
      -- ---------------------------------------------------------------------
      elsif regla.key = 'class_reminder'
            and public.automation_source_ready('public.reservations', array['org_id','athlete_id','class_id','status'])
            and public.automation_source_ready('public.classes', array['org_id','starts_at','name']) then
        for cand in
          execute $q$
            select r.id, r.athlete_id, a.first_name, c.name as clase, c.starts_at
            from public.reservations r
            join public.classes  c on c.id = r.class_id
            join public.athletes a on a.id = r.athlete_id
            where r.org_id = $1
              and r.status = 'booked'
              and c.starts_at >= $2 + ($3 || ' hours')::interval
              and c.starts_at <  $2 + (($3 + 1) || ' hours')::interval
          $q$ using o.id, p_now, coalesce((regla.trigger_config->>'hours_before')::int, 2)
        loop
          v_id := public.queue_automation_message(
            o.id, regla.id, cand.athlete_id, coalesce(v_tpl, 'class_reminder'),
            'class_reminder:' || cand.id,
            jsonb_build_object(
              'nombre', cand.first_name,
              'clase',  cand.clase,
              'hora',   to_char(cand.starts_at at time zone o.timezone, 'HH12:MI AM'),
              'box',    o.name),
            p_now, null, 'athlete');
          if v_id is not null then v_enc := v_enc + 1; end if;
        end loop;

      -- ---------------------------------------------------------------------
      -- 14 · No-show reiterado (3 faltas sin cancelar en 30 días)
      -- ---------------------------------------------------------------------
      elsif regla.key = 'repeated_no_show' then
        for cand in
          select a.id as athlete_id, a.first_name, ns.no_shows_30
          from public.athletes a
          join public.athlete_no_shows(o.id, v_today) ns on ns.athlete_id = a.id
          where a.org_id = o.id
            and a.deleted_at is null
            and ns.no_shows_30 >= coalesce((regla.trigger_config->>'threshold')::int, 3)
        loop
          v_id := public.queue_automation_message(
            o.id, regla.id, cand.athlete_id, coalesce(v_tpl, 'repeated_no_show'),
            'repeated_no_show:' || cand.athlete_id || ':' || to_char(v_today, 'YYYY-MM'),
            jsonb_build_object('nombre', cand.first_name,
                               'faltas', cand.no_shows_30::text, 'box', o.name),
            p_now, null, 'athlete');
          if v_id is not null then v_enc := v_enc + 1; end if;
        end loop;
      end if;

      update public.automation_rules r set last_run_at = p_now where r.id = regla.id;
    end loop;

    org_id    := o.id;
    queued    := v_enc;
    evaluated := v_eval;
    run_date  := v_today;
    return next;
  end loop;
end;
$$;

comment on function public.run_automations is
  'Job de automatizaciones. Idempotente, consciente de la zona horaria del box y de la prioridad entre reglas.';

-- =============================================================================
-- Reporte semanal del box (regla 10)
-- =============================================================================
-- Devuelve las variables de la plantilla ya formateadas. Se calcula en SQL y no
-- en la Edge Function porque así el mismo número sale igual en el WhatsApp del
-- lunes y en la pantalla del dueño.
-- =============================================================================
create or replace function public.weekly_report(p_org_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz      text;
  v_nombre  text;
  v_hoy     date;
  v_desde   date;
  v_ingreso bigint;
  v_cartera bigint;
  v_altas   int;
  v_bajas   int;
  v_asist   numeric := 0;
  v_riesgo  text;
begin
  select o.timezone, o.name into v_tz, v_nombre
  from public.organizations o where o.id = p_org_id;
  if v_tz is null then return '{}'::jsonb; end if;

  v_hoy   := (p_now at time zone v_tz)::date;
  v_desde := v_hoy - 7;

  select coalesce(sum(p.amount_cents), 0) into v_ingreso
  from public.payments p
  where p.org_id = p_org_id
    and p.status = 'confirmed'
    and (p.paid_at at time zone v_tz)::date >= v_desde;

  select coalesce(sum(i.amount_cents - i.paid_cents), 0) into v_cartera
  from public.invoices i
  where i.org_id = p_org_id and i.status in ('open','partial','overdue');

  select count(*)::int into v_altas
  from public.athletes a
  where a.org_id = p_org_id and a.deleted_at is null and a.joined_on >= v_desde;

  select count(*)::int into v_bajas
  from public.athletes a
  where a.org_id = p_org_id and a.churned_on is not null and a.churned_on >= v_desde;

  if public.automation_source_ready('public.attendances', array['org_id','date','status']) then
    execute $q$
      select round(count(*)::numeric / 7, 1)
      from public.attendances t
      where t.org_id = $1 and t.status = 'attended' and t.date >= $2
    $q$ into v_asist using p_org_id, v_desde;
  end if;

  -- Los 3 atletas en mayor riesgo, que es lo único accionable del reporte.
  select string_agg(x.linea, E'\n') into v_riesgo from (
    select '· ' || trim(a.first_name || ' ' || coalesce(a.last_name, '')) ||
           ' (' || r.score || ')' as linea
    from public.athlete_risk_scores r
    join public.athletes a on a.id = r.athlete_id
    where r.org_id = p_org_id
      and r.computed_on = (select max(r2.computed_on) from public.athlete_risk_scores r2
                           where r2.org_id = p_org_id)
      and r.band in ('at_risk','critical')
    order by r.score desc
    limit 3
  ) x;

  return jsonb_build_object(
    'box',      v_nombre,
    'desde',    to_char(v_desde, 'DD/MM'),
    'hasta',    to_char(v_hoy, 'DD/MM'),
    'ingresos', public.formato_pesos(v_ingreso),
    'cartera',  public.formato_pesos(v_cartera),
    'altas',    v_altas::text,
    'bajas',    v_bajas::text,
    'asistencia', coalesce(v_asist, 0)::text,
    'riesgo',   coalesce(v_riesgo, 'Nadie en riesgo alto. Buena semana.')
  );
end;
$$;

-- =============================================================================
-- Detección de fuga
-- =============================================================================
-- Señales y pesos (docs/04 §Detección de fuga). La fórmula no es lo valioso: lo
-- valioso es que la lista salga sola cada mañana, ordenada y CON EL MOTIVO, que
-- es lo que permite que el coach escriba en diez segundos.
--
--   días desde la última asistencia   ≥30 → 45 · 21 → 38 · 14 → 28 · 7 → 15   (peso alto)
--   nunca vino y lleva más de 14 días inscrito                        → 40    (peso alto)
--   caída de frecuencia 30d vs 30d anteriores   ≥50% → 20 · ≥25% → 10 (peso alto)
--   días de mora                      ≥15 → 18 · ≥8 → 12 · ≥1 → 5     (peso medio)
--   nunca registró un resultado                                       → 10    (peso medio)
--   antigüedad < 60 días                                              → 8     (peso medio)
--   no-shows recientes                ≥3 → 12 · ≥1 → 5                        (peso medio)
--
-- Bandas: ok 0-24 · watch 25-49 · at_risk 50-74 · critical 75-100.
-- =============================================================================
create or replace function public.refresh_risk_scores(
  p_org_id uuid default null,
  p_now    timestamptz default now()
)
returns table (org_id uuid, athletes_scored int, computed_on date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  o        record;
  a        record;
  v_today  date;
  v_n      int;
  v_score  int;
  v_band   text;
  v_motivos jsonb;
  v_caida  numeric;
begin
  for o in
    select org.id, org.timezone
    from public.organizations org
    where (p_org_id is null or org.id = p_org_id)
      and org.status in ('trial','active','past_due')
  loop
    v_today := (p_now at time zone o.timezone)::date;
    v_n := 0;

    for a in
      select ath.id, ath.joined_on,
             act.last_visit, act.visits_last_30, act.visits_prev_30,
             coalesce(ns.no_shows_30, 0) as no_shows_30,
             (v_today - ath.joined_on) as antiguedad,
             not exists (select 1 from public.athletes_with_results(o.id) res
                         where res.athlete_id = ath.id) as sin_resultado,
             coalesce((select max(v_today - i.due_on) from public.invoices i
                       where i.athlete_id = ath.id
                         and i.status in ('open','partial','overdue')
                         and i.due_on < v_today), 0) as mora
      from public.athletes ath
      join public.athlete_activity(o.id, v_today) act on act.athlete_id = ath.id
      left join public.athlete_no_shows(o.id, v_today) ns on ns.athlete_id = ath.id
      where ath.org_id = o.id
        and ath.deleted_at is null
        and ath.status in ('trial','active','overdue','frozen')
    loop
      v_score := 0;
      v_motivos := '[]'::jsonb;

      -- Señal 1 · días desde la última asistencia
      if a.last_visit is null then
        if a.antiguedad > 14 then
          v_score := v_score + 40;
          v_motivos := v_motivos || jsonb_build_object(
            'codigo', 'nunca_vino', 'puntos', 40,
            'texto', 'Se inscribió hace ' || a.antiguedad || ' días y nunca registró asistencia');
        end if;
      else
        declare v_dias int := v_today - a.last_visit; v_p int := 0;
        begin
          if    v_dias >= 30 then v_p := 45;
          elsif v_dias >= 21 then v_p := 38;
          elsif v_dias >= 14 then v_p := 28;
          elsif v_dias >= 7  then v_p := 15;
          end if;
          if v_p > 0 then
            v_score := v_score + v_p;
            v_motivos := v_motivos || jsonb_build_object(
              'codigo', 'sin_venir', 'puntos', v_p,
              'texto', 'Lleva ' || v_dias || ' días sin venir');
          end if;
        end;
      end if;

      -- Señal 2 · caída de frecuencia (30 días contra los 30 anteriores)
      if a.visits_prev_30 >= 4 then
        v_caida := 1 - (a.visits_last_30::numeric / a.visits_prev_30);
        if v_caida >= 0.5 then
          v_score := v_score + 20;
          v_motivos := v_motivos || jsonb_build_object(
            'codigo', 'caida_frecuencia', 'puntos', 20,
            'texto', 'Pasó de ' || a.visits_prev_30 || ' a ' || a.visits_last_30 ||
                     ' entrenamientos al mes');
        elsif v_caida >= 0.25 then
          v_score := v_score + 10;
          v_motivos := v_motivos || jsonb_build_object(
            'codigo', 'caida_frecuencia', 'puntos', 10,
            'texto', 'Viene menos: de ' || a.visits_prev_30 || ' a ' || a.visits_last_30 ||
                     ' al mes');
        end if;
      end if;

      -- Señal 3 · días de mora
      if a.mora >= 15 then
        v_score := v_score + 18;
        v_motivos := v_motivos || jsonb_build_object(
          'codigo', 'mora', 'puntos', 18, 'texto', a.mora || ' días de mora');
      elsif a.mora >= 8 then
        v_score := v_score + 12;
        v_motivos := v_motivos || jsonb_build_object(
          'codigo', 'mora', 'puntos', 12, 'texto', a.mora || ' días de mora');
      elsif a.mora >= 1 then
        v_score := v_score + 5;
        v_motivos := v_motivos || jsonb_build_object(
          'codigo', 'mora', 'puntos', 5, 'texto', a.mora || ' días de mora');
      end if;

      -- Señal 4 · nunca registró un resultado: nunca se enganchó con el método
      if a.sin_resultado then
        v_score := v_score + 10;
        v_motivos := v_motivos || jsonb_build_object(
          'codigo', 'sin_resultado', 'puntos', 10,
          'texto', 'Nunca registró una marca');
      end if;

      -- Señal 5 · los primeros dos meses son los que se caen
      if a.antiguedad < 60 then
        v_score := v_score + 8;
        v_motivos := v_motivos || jsonb_build_object(
          'codigo', 'novato', 'puntos', 8,
          'texto', 'Lleva ' || a.antiguedad || ' días en el box');
      end if;

      -- Señal 6 · no-shows: reserva y no va, ya se está yendo
      if a.no_shows_30 >= 3 then
        v_score := v_score + 12;
        v_motivos := v_motivos || jsonb_build_object(
          'codigo', 'no_shows', 'puntos', 12,
          'texto', a.no_shows_30 || ' faltas sin cancelar en 30 días');
      elsif a.no_shows_30 >= 1 then
        v_score := v_score + 5;
        v_motivos := v_motivos || jsonb_build_object(
          'codigo', 'no_shows', 'puntos', 5,
          'texto', a.no_shows_30 || ' falta(s) sin cancelar en 30 días');
      end if;

      v_score := least(v_score, 100);
      v_band := case
                  when v_score >= 75 then 'critical'
                  when v_score >= 50 then 'at_risk'
                  when v_score >= 25 then 'watch'
                  else 'ok'
                end;

      insert into public.athlete_risk_scores (
        org_id, athlete_id, computed_on, days_since_last_visit,
        visits_last_30d, visits_prev_30d, days_overdue, no_shows_30d,
        tenure_days, never_logged_result, score, band, reasons, computed_at)
      values (
        o.id, a.id, v_today,
        case when a.last_visit is null then null else v_today - a.last_visit end,
        a.visits_last_30, a.visits_prev_30, a.mora, a.no_shows_30,
        a.antiguedad, a.sin_resultado, v_score, v_band, v_motivos, p_now)
      on conflict (org_id, athlete_id, computed_on) do update
        set days_since_last_visit = excluded.days_since_last_visit,
            visits_last_30d       = excluded.visits_last_30d,
            visits_prev_30d       = excluded.visits_prev_30d,
            days_overdue          = excluded.days_overdue,
            no_shows_30d          = excluded.no_shows_30d,
            tenure_days           = excluded.tenure_days,
            never_logged_result   = excluded.never_logged_result,
            score                 = excluded.score,
            band                  = excluded.band,
            reasons               = excluded.reasons,
            computed_at           = excluded.computed_at;

      v_n := v_n + 1;
    end loop;

    org_id          := o.id;
    athletes_scored := v_n;
    computed_on     := v_today;
    return next;
  end loop;
end;
$$;

comment on function public.refresh_risk_scores is
  'Riesgo de fuga por atleta, con el motivo en texto. Corre a diario antes de que abra el box.';

-- =============================================================================
-- Envío: tomar lote, marcar resultado, reintentos
-- =============================================================================
-- El enviador (Edge Function `process-outbox`) no escribe la tabla a mano. Toma
-- un lote con `for update skip locked` para que dos instancias del job en
-- paralelo NUNCA manden el mismo mensaje dos veces.
-- =============================================================================
create or replace function public.claim_outbox_batch(
  p_org_id uuid default null,
  p_limit  int default 50,
  p_now    timestamptz default now()
)
returns setof public.message_outbox
language sql
security definer
set search_path = ''
as $$
  update public.message_outbox m
  set status = 'sending', attempts = m.attempts + 1, updated_at = now()
  where m.id in (
    select c.id
    from public.message_outbox c
    where c.status = 'queued'
      and not c.simulated
      and c.scheduled_for <= p_now
      and (p_org_id is null or c.org_id = p_org_id)
    order by c.scheduled_for
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning m.*;
$$;

/**
 * Modo simulación: no se envía nada, pero queda registrado qué HABRÍA pasado.
 * Es lo que se le muestra al cliente en su primera semana y en la demo.
 */
create or replace function public.settle_simulated_messages(
  p_org_id uuid default null,
  p_limit  int default 200,
  p_now    timestamptz default now()
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  with lote as (
    select m.id from public.message_outbox m
    where m.simulated
      and m.status = 'queued'
      and m.scheduled_for <= p_now
      and (p_org_id is null or m.org_id = p_org_id)
    order by m.scheduled_for
    limit greatest(p_limit, 0)
  ), marcados as (
    update public.message_outbox m
    set status = 'simulated', sent_at = null, provider = 'simulacion'
    from lote where m.id = lote.id
    returning m.id
  )
  select count(*)::int into v_n from marcados;
  return v_n;
end;
$$;

/**
 * Resultado de un envío.
 *
 * Un fallo NO es definitivo: se reprograma con espera creciente (5, 15, 45,
 * 135 minutos) hasta `p_max_attempts`. Un número de WhatsApp que rechaza un
 * mensaje suele aceptarlo minutos después; darlo por perdido al primer intento
 * es perder cobros de verdad.
 */
create or replace function public.mark_outbox_result(
  p_id              uuid,
  p_status          text,
  p_provider        text default null,
  p_provider_msg_id text default null,
  p_error           text default null,
  p_cost_micros     bigint default null,
  p_max_attempts    int default 4,
  p_now             timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.message_outbox%rowtype;
  v_final text;
begin
  select * into v_m from public.message_outbox m where m.id = p_id;
  if not found then return null; end if;

  if p_status = 'failed' and v_m.attempts < p_max_attempts then
    update public.message_outbox m
    set status = 'queued',
        error = p_error,
        provider = coalesce(p_provider, m.provider),
        scheduled_for = p_now + (power(3, greatest(v_m.attempts - 1, 0)) * interval '5 minutes')
    where m.id = p_id;
    return 'queued';
  end if;

  v_final := p_status;
  update public.message_outbox m
  set status = v_final,
      provider = coalesce(p_provider, m.provider),
      provider_msg_id = coalesce(p_provider_msg_id, m.provider_msg_id),
      error = p_error,
      cost_micros = coalesce(p_cost_micros, m.cost_micros),
      sent_at = case when v_final in ('sent','delivered','read') then p_now else m.sent_at end
  where m.id = p_id;

  return v_final;
end;
$$;

-- =============================================================================
-- CONCILIACIÓN: un pago CANCELA los cobros encolados de esa factura
-- =============================================================================
-- El peor bug posible del producto es cobrarle a quien ya pagó. Pasa así: el
-- job encola el recordatorio a las 6:00, el atleta paga a las 9:00 y el
-- enviador manda el mensaje a las 10:00. Por eso la cancelación NO vive en la
-- Edge Function del webhook: vive aquí, y se dispara venga el pago de donde
-- venga (panel, Wompi o importación).
--
-- El trigger se llama `zz_…` a propósito: Postgres dispara los triggers de la
-- misma tabla y el mismo evento en ORDEN ALFABÉTICO, y este tiene que correr
-- DESPUÉS de `payments_recalc_invoice` (migración 0003) para leer el estado ya
-- recalculado de la factura.
--
-- Se cancela ante cualquier pago confirmado, no solo cuando la factura queda
-- saldada: a quien acaba de abonar tampoco se le manda un "tienes una deuda
-- pendiente" una hora después. Si sigue debiendo, el job del día siguiente
-- vuelve a encolar con otro dedupe_key.
-- =============================================================================
create or replace function public.cancel_dunning_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  if v_inv is null or new.status is distinct from 'confirmed' then
    return new;
  end if;

  update public.message_outbox m
  set status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = 'Pago recibido: no se le cobra a quien ya pagó'
  where m.org_id = new.org_id
    and m.invoice_id = v_inv
    and m.status in ('queued','sending','ready');

  -- Y el atleta vuelve a estar al día si ya no le queda nada vencido.
  update public.athletes a
  set status = 'active'
  where a.id = new.athlete_id
    and a.status = 'overdue'
    and not exists (
      select 1 from public.invoices i
      where i.athlete_id = a.id and i.status = 'overdue');

  return new;
end;
$$;

create trigger zz_payments_cancela_cobros
  after insert or update on public.payments
  for each row execute function public.cancel_dunning_on_payment();

comment on function public.cancel_dunning_on_payment is
  'Cancela los mensajes de cobro encolados de una factura cuando entra el pago.';

-- =============================================================================
-- Catálogo de fábrica: las 14 reglas que se muestran en la demo
-- =============================================================================
-- `org_id is null` = catálogo global, igual que `movements`. Cada box nuevo
-- recibe una COPIA para poder editar el texto sin afectar a los demás.
-- Ver la tabla de docs/04-automatizaciones.md §Las reglas de fábrica.
-- =============================================================================
insert into public.message_templates (org_id, key, name, channel, category, body, variables) values
  (null, 'payment_due_soon', 'Aviso de vencimiento', 'whatsapp', 'utility',
   'Hola {{nombre}}, tu mensualidad de {{box}} vence el {{fecha}} ({{valor}}). Puedes pagar aquí: {{link}}',
   array['nombre','box','fecha','valor','link']),

  (null, 'payment_overdue', 'Cobro vencido', 'whatsapp', 'utility',
   'Hola {{nombre}}, tu mensualidad de {{box}} venció el {{fecha}} y lleva {{dias}} día(s). Son {{valor}}. Puedes pagar aquí: {{link}}',
   array['nombre','box','fecha','dias','valor','link']),

  (null, 'payment_overdue_staff', 'Alerta de mora al dueño', 'whatsapp', 'internal',
   '{{box}}: {{nombre}} lleva {{dias}} días de mora por {{valor}}. Ya se le escribió tres veces; toca llamarlo.',
   array['box','nombre','dias','valor']),

  (null, 'access_cutoff_staff', 'Corte de acceso', 'whatsapp', 'internal',
   '{{box}}: {{nombre}} llegó a {{dias}} días de mora ({{valor}}). Quedó marcado con acceso suspendido. Esta conversación es humana, no le mandamos nada automático.',
   array['box','nombre','dias','valor']),

  (null, 'inactive_coach_alert', 'Aviso al coach por inasistencia', 'whatsapp', 'internal',
   '{{box}}: {{nombre}} lleva {{dias}} días sin venir y tiene membresía activa. Un mensaje tuyo hoy vale más que uno automático mañana.',
   array['box','nombre','dias']),

  (null, 'winback_14d', 'Te extrañamos', 'whatsapp', 'marketing',
   'Hola {{nombre}}, en {{box}} te estamos extrañando: llevas {{dias}} días sin aparecer. ¿Te esperamos esta semana? Si no quieres recibir más mensajes, responde NO.',
   array['nombre','box','dias']),

  (null, 'inactive_call_task', 'Tarea de llamada', 'whatsapp', 'internal',
   '{{box}}: {{nombre}} lleva {{dias}} días sin venir. Toca llamarlo hoy, no escribirle.',
   array['box','nombre','dias']),

  (null, 'welcome', 'Bienvenida', 'whatsapp', 'utility',
   '¡Bienvenido a {{box}}, {{nombre}}! Aquí activas tu perfil y ves los horarios: {{link}}. Lleva ropa cómoda, tus tenis y una toalla. Nos vemos.',
   array['nombre','box','link']),

  (null, 'trial_followup', 'Seguimiento de clase de prueba', 'whatsapp', 'marketing',
   'Hola {{nombre}}, ¿cómo te fue ayer en {{box}}? Tenemos promoción de primer mes para que sigas: {{link}}. Si no quieres más mensajes, responde NO.',
   array['nombre','box','link']),

  (null, 'pr_achieved', 'Felicitación por PR', 'whatsapp', 'utility',
   '¡{{nombre}}, marca nueva! {{movimiento}}: {{marca}}. Así se hace. — {{box}}',
   array['nombre','movimiento','marca','box']),

  (null, 'birthday', 'Cumpleaños', 'whatsapp', 'marketing',
   '¡Feliz cumpleaños, {{nombre}}! Todo el equipo de {{box}} te desea un año grande. Si no quieres recibir más mensajes, responde NO.',
   array['nombre','box']),

  (null, 'low_stock_alert', 'Insumo en mínimo', 'whatsapp', 'internal',
   '{{box}}: queda poco {{insumo}}. La última compra fue el {{fecha}} a {{proveedor}} por {{valor}}.',
   array['box','insumo','fecha','proveedor','valor']),

  (null, 'weekly_report', 'Reporte semanal del box', 'whatsapp', 'internal',
   '{{box}} · semana {{desde}} a {{hasta}}
Ingresos: {{ingresos}}
Cartera pendiente: {{cartera}}
Altas: {{altas}} · Bajas: {{bajas}}
Asistencia promedio: {{asistencia}} por día
En mayor riesgo:
{{riesgo}}',
   array['box','desde','hasta','ingresos','cartera','altas','bajas','asistencia','riesgo']),

  (null, 'waitlist_slot', 'Cupo liberado', 'whatsapp', 'utility',
   '{{nombre}}, se liberó un cupo para {{clase}} de las {{hora}} y ya quedaste dentro. — {{box}}',
   array['nombre','clase','hora','box']),

  (null, 'class_reminder', 'Recordatorio de clase', 'whatsapp', 'utility',
   '{{nombre}}, te esperamos hoy en {{clase}} a las {{hora}}. Si no puedes venir, cancela desde la app para liberar el cupo. — {{box}}',
   array['nombre','clase','hora','box']),

  (null, 'class_cancelled', 'Clase cancelada', 'whatsapp', 'utility',
   '{{nombre}}, se canceló {{clase}} de las {{hora}} ({{motivo}}). Te devolvimos el crédito. — {{box}}',
   array['nombre','clase','hora','motivo','box']),

  (null, 'repeated_no_show', 'No-show reiterado', 'whatsapp', 'utility',
   'Hola {{nombre}}, reservaste y no viniste {{faltas}} veces este mes. Si no vas a poder, cancela con tiempo para que otro use el cupo. — {{box}}',
   array['nombre','faltas','box']);

-- Las 14 reglas. `priority` es el desempate del día: mayor gana.
insert into public.automation_rules
  (org_id, key, name, description, trigger_type, trigger_config, action_type, category, priority, is_active, template_id)
select null, v.key, v.name, v.description, v.trigger_type, v.trigger_config::jsonb,
       v.action_type, v.category, v.priority, v.is_active,
       (select t.id from public.message_templates t where t.org_id is null and t.key = v.template_key)
from (values
  ('payment_due_soon', 'Aviso de vencimiento',
   '5 y 2 días antes del vencimiento, WhatsApp al atleta con el enlace de pago.',
   'schedule', '{"days_before":[5,2]}', 'send_message', 'utility', 80, true, 'payment_due_soon'),

  ('payment_overdue', 'Cobro vencido',
   '1, 4 y 8 días después del vencimiento. A los 8 días también avisa al dueño.',
   'schedule', '{"days_after":[1,4,8]}', 'send_message', 'utility', 90, true, 'payment_overdue'),

  ('access_cutoff', 'Corte de acceso',
   'A los 10 días de mora marca al atleta y avisa al coach. NO le escribe al atleta: esa conversación es humana.',
   'schedule', '{"days":10}', 'suspend_access', 'internal', 95, true, 'access_cutoff_staff'),

  ('athlete_inactive', 'Atleta que dejó de venir',
   '7 días: alerta al coach. 14: mensaje "te extrañamos". 21: tarea de llamada para el dueño.',
   'schedule', '{"days":[7,14,21]}', 'send_message', 'marketing', 70, true, 'winback_14d'),

  ('welcome', 'Bienvenida',
   'Al dar de alta al atleta: enlace para activar su perfil, horarios y qué llevar.',
   'schedule', '{}', 'send_message', 'utility', 85, true, 'welcome'),

  ('trial_followup', 'Seguimiento de clase de prueba',
   '24 h después de una prueba que no se convirtió, con la promoción de primer mes.',
   'schedule', '{}', 'send_message', 'marketing', 60, true, 'trial_followup'),

  ('pr_achieved', 'Felicitación por PR',
   'Cuando el atleta registra una marca nueva. Publicidad gratis en sus historias.',
   'schedule', '{}', 'send_message', 'utility', 55, true, 'pr_achieved'),

  ('birthday', 'Cumpleaños',
   'Felicitación el día del cumpleaños, dentro del horario permitido.',
   'schedule', '{}', 'send_message', 'marketing', 40, true, 'birthday'),

  ('low_stock', 'Insumo en mínimo',
   'Aviso diario al dueño cuando un insumo baja del mínimo, con la última compra y el proveedor.',
   'schedule', '{}', 'notify_staff', 'internal', 30, true, 'low_stock_alert'),

  ('weekly_report', 'Reporte semanal del box',
   'Lunes: ingresos, cartera, altas y bajas, asistencia y los 3 atletas en mayor riesgo.',
   'schedule', '{"isodow":1}', 'notify_staff', 'internal', 35, true, 'weekly_report'),

  ('waitlist_slot', 'Cupo liberado',
   'Alguien cancela y hay lista de espera: aviso inmediato al primero. Lo dispara el módulo de reservas.',
   'event', '{"event":"waitlist_promoted"}', 'send_message', 'utility', 99, true, 'waitlist_slot'),

  ('class_reminder', 'Recordatorio de clase',
   '2 horas antes de la clase reservada, con opción de cancelar. Baja el no-show de forma medible.',
   'schedule', '{"hours_before":2}', 'send_message', 'utility', 75, true, 'class_reminder'),

  ('class_cancelled', 'Clase cancelada',
   'El box cancela una clase: aviso a todos los reservados y devolución del crédito.',
   'event', '{"event":"class_cancelled"}', 'send_message', 'utility', 98, true, 'class_cancelled'),

  ('repeated_no_show', 'No-show reiterado',
   '3 faltas sin cancelar en 30 días: aviso al atleta. Es señal temprana de fuga.',
   'schedule', '{"threshold":3}', 'send_message', 'utility', 50, true, 'repeated_no_show')
) as v(key, name, description, trigger_type, trigger_config, action_type, category, priority, is_active, template_key);

-- -----------------------------------------------------------------------------
-- Alta de un box: copiar el catálogo
-- -----------------------------------------------------------------------------
-- Se copian las plantillas además de las reglas para que el box pueda cambiar
-- el texto ("nosotros no tuteamos") sin tocar a los demás clientes.
-- Es idempotente: volver a llamarla no duplica ni pisa lo que el box ya editó.
-- -----------------------------------------------------------------------------
create or replace function public.install_automation_defaults(p_org_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  insert into public.automation_settings (org_id)
  values (p_org_id)
  on conflict (org_id) do nothing;

  insert into public.message_templates
    (org_id, key, name, channel, category, provider_template_name, body, variables, is_active)
  select p_org_id, t.key, t.name, t.channel, t.category, t.provider_template_name,
         t.body, t.variables, t.is_active
  from public.message_templates t
  where t.org_id is null
    and not exists (
      select 1 from public.message_templates x
      where x.org_id = p_org_id and x.key = t.key);

  insert into public.automation_rules
    (org_id, key, name, description, trigger_type, trigger_config, conditions,
     action_type, template_id, category, priority, is_active)
  select p_org_id, r.key, r.name, r.description, r.trigger_type, r.trigger_config,
         r.conditions, r.action_type,
         (select x.id from public.message_templates x
          where x.org_id = p_org_id
            and x.key = (select y.key from public.message_templates y where y.id = r.template_id)),
         r.category, r.priority, r.is_active
  from public.automation_rules r
  where r.org_id is null
    and not exists (
      select 1 from public.automation_rules x
      where x.org_id = p_org_id and x.key = r.key);

  select count(*)::int into v_n
  from public.automation_rules r where r.org_id = p_org_id;
  return v_n;
end;
$$;

comment on function public.install_automation_defaults is
  'Copia el catálogo de fábrica a un box. Idempotente: no pisa lo que el box editó.';

-- Un box nuevo tiene que llegar con esto puesto: es lo que se le muestra en la
-- demo y lo que hace que el producto "trabaje solo" desde el primer día.
create or replace function public.instala_automatizaciones_al_crear_box()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.install_automation_defaults(new.id);
  return new;
end;
$$;

create trigger organizations_instala_automatizaciones
  after insert on public.organizations
  for each row execute function public.instala_automatizaciones_al_crear_box();

-- Los boxes que ya existían cuando se aplicó esta migración.
do $$
declare o record;
begin
  for o in select id from public.organizations loop
    perform public.install_automation_defaults(o.id);
  end loop;
end $$;

-- =============================================================================
-- RLS
-- =============================================================================
-- Quién toca qué:
--   · El catálogo de fábrica (org_id is null) lo LEE cualquier miembro del
--     staff: es lo que se muestra en la pantalla de automatizaciones.
--   · Prender, apagar y editar plantillas es de dueño y administrador. Un coach
--     no decide qué se le manda a los atletas del box.
--   · La bitácora (message_outbox) la lee todo el staff: el coach necesita
--     saber qué se le escribió ya a un atleta antes de escribirle él.
--   · Nadie escribe message_outbox ni athlete_risk_scores desde el cliente: eso
--     entra por funciones SECURITY DEFINER y por las Edge Functions.
-- =============================================================================
alter table public.automation_settings  enable row level security;
alter table public.message_templates    enable row level security;
alter table public.automation_rules     enable row level security;
alter table public.message_outbox       enable row level security;
alter table public.athlete_risk_scores  enable row level security;

create policy "staff lee los ajustes de automatización"
  on public.automation_settings for select
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()));

create policy "owner/admin gestionan los ajustes de automatización"
  on public.automation_settings for all
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])))
  with check (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])));

create policy "staff lee las plantillas (las suyas y las de fábrica)"
  on public.message_templates for select
  to authenticated
  using (org_id is null or org_id in (select private.auth_staff_org_ids()));

create policy "owner/admin gestionan las plantillas de su box"
  on public.message_templates for all
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])))
  with check (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])));

create policy "staff lee las reglas (las suyas y las de fábrica)"
  on public.automation_rules for select
  to authenticated
  using (org_id is null or org_id in (select private.auth_staff_org_ids()));

create policy "owner/admin gestionan las reglas de su box"
  on public.automation_rules for all
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])))
  with check (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])));

create policy "staff lee la bitácora de mensajes"
  on public.message_outbox for select
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()));

-- Cancelar a mano un mensaje encolado ("no le mandes eso a Juan") es una acción
-- de dueño/administrador y es la única escritura permitida desde el cliente.
create policy "owner/admin cancelan mensajes encolados"
  on public.message_outbox for update
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])))
  with check (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])));

create policy "el atleta ve lo que se le mandó"
  on public.message_outbox for select
  to authenticated
  using (athlete_id = (select private.current_athlete_id(org_id)));

create policy "staff lee el riesgo de fuga de su box"
  on public.athlete_risk_scores for select
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()));

-- =============================================================================
-- Privilegios
-- =============================================================================
-- Mismo criterio que el motor de cobros: los jobs no se invocan desde el
-- navegador. Corren con service_role desde las Edge Functions.
--
-- OJO: no se les revoca a `service_role`. En Supabase los privilegios por
-- defecto del esquema public conceden EXECUTE explícitamente a service_role, y
-- revocar a `public` no toca esa concesión.
-- =============================================================================
revoke all on function public.run_automations(uuid, timestamptz)              from public, anon, authenticated;
revoke all on function public.refresh_risk_scores(uuid, timestamptz)          from public, anon, authenticated;
revoke all on function public.queue_automation_message(uuid, uuid, uuid, text, text, jsonb, timestamptz, uuid, text)
                                                                              from public, anon, authenticated;
revoke all on function public.claim_outbox_batch(uuid, int, timestamptz)      from public, anon, authenticated;
revoke all on function public.settle_simulated_messages(uuid, int, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_outbox_result(uuid, text, text, text, text, bigint, int, timestamptz)
                                                                              from public, anon, authenticated;
revoke all on function public.install_automation_defaults(uuid)               from public, anon, authenticated;
revoke all on function public.athletes_with_results(uuid)                     from public, anon, authenticated;
revoke all on function public.cancel_dunning_on_payment()                     from public, anon;
revoke all on function public.instala_automatizaciones_al_crear_box()         from public, anon;

-- Estas sí las usa la interfaz: la vista previa de una plantilla se renderiza
-- con la MISMA función que usa el motor, para que lo que ve el dueño sea
-- exactamente lo que va a recibir el atleta.
revoke all on function public.render_template(text, jsonb) from public, anon;
grant execute on function public.render_template(text, jsonb) to authenticated;
revoke all on function public.formato_pesos(bigint) from public, anon;
grant execute on function public.formato_pesos(bigint) to authenticated;
revoke all on function public.weekly_report(uuid, timestamptz) from public, anon, authenticated;

-- Si esta migración se aplica, es porque las tablas nuevas quedaron protegidas.
do $$ begin perform public.assert_rls_enabled(); end $$;
