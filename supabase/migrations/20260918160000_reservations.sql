-- =============================================================================
-- 0014 · Horarios, clases con cupo y reservas
-- =============================================================================
-- Table stakes frente a Boxmagic: un box que maneja horarios con cupo no puede
-- ni evaluar el producto sin esto. Y habilita las dos cosas que valen plata:
-- bloquear la reserva a quien está en mora (la palanca de cobro más efectiva
-- que existe) y datos de asistencia limpios para la detección de fuga.
--
-- Las decisiones que se resuelven AQUÍ, en la base, y no en el cliente:
--
--   1. EL ÚLTIMO CUPO NO SE VENDE DOS VECES. `public.book_class()` empieza con
--      `select … from classes where id = … for update`. Mientras una
--      transacción tiene esa fila, la otra espera; cuando despierta vuelve a
--      CONTAR las reservas bajo el candado en vez de creerle al contador
--      desnormalizado. Leer el cupo y escribir después es exactamente el bug
--      que produce dos atletas para un solo cupo un lunes a las 6 a. m.
--   2. RESERVAR NO ES UN INSERT. El atleta no tiene política de `insert` sobre
--      `reservations`: un `with check` no puede contar cupos ni tomar candados.
--      La única puerta es `book_class()`, igual que `queue_automation_message()`
--      es la única puerta a `message_outbox`.
--   3. LA LISTA DE ESPERA SE MUEVE SOLA Y EN LA MISMA TRANSACCIÓN. Al cancelar,
--      el primero de la lista queda reservado antes de que la transacción
--      termine, y el aviso queda encolado en `message_outbox`. Si el aviso se
--      dejara para un job, el cupo quedaría "reservado en secreto" hasta que el
--      job corriera.
--   4. LA ASISTENCIA SALE DE LA RESERVA. `reservations.status = 'attended'`
--      alimenta `attendances` por trigger. El check-in manual del piso del box
--      (F2) sigue existiendo para quien llega sin reservar.
--
-- Ver docs/03-modelo-de-datos.md §"Reglas de reserva" y docs/04 reglas 11 a 14.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Festivos colombianos (Ley 51 de 1983, "Ley Emiliani")
-- -----------------------------------------------------------------------------
-- DECISIÓN: se CALCULAN, no se siembran en una tabla. Una tabla sembrada para
-- 2026 y 2027 obliga a acordarse de sembrar 2028 — y el día que no se siembre,
-- la parrilla genera clases el 1 de enero y nadie se entera hasta que un atleta
-- reserva. El cálculo no caduca.
--
-- Tres familias:
--   · Fijos, no se mueven: 1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dic.
--   · Emiliani: se corren al LUNES siguiente (6 ene, 19 mar, 29 jun, 15 ago,
--     12 oct, 1 nov, 11 nov).
--   · Móviles atados a la Pascua: Jueves y Viernes Santo caen donde caen;
--     Ascensión, Corpus Christi y Sagrado Corazón se corren al lunes.
-- -----------------------------------------------------------------------------

/** El lunes siguiente, o la misma fecha si ya es lunes. Es la Ley Emiliani. */
create or replace function public.next_monday(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_date + ((8 - extract(isodow from p_date)::int) % 7)
$$;

/** Domingo de Pascua por el algoritmo de Meeus/Butcher (calendario gregoriano). */
create or replace function public.easter_sunday(p_year int)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  a int; b int; c int; d int; e int; f int; g int;
  h int; i int; k int; l int; m int; mes int; dia int;
begin
  a := p_year % 19;
  b := p_year / 100;
  c := p_year % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31;
  dia := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_year, mes, dia);
end;
$$;

comment on function public.easter_sunday is
  'Domingo de Pascua gregoriano. De aquí salen los 6 festivos móviles colombianos.';

/** Los 18 festivos colombianos de un año, ya corridos según la Ley Emiliani. */
create or replace function public.colombian_holidays(p_year int)
returns setof date
language sql
immutable
set search_path = ''
as $$
  with pascua as (select public.easter_sunday(p_year) as d)
  -- Fijos: la ley no los mueve nunca.
  select make_date(p_year,  1,  1)   -- Año Nuevo
  union all select make_date(p_year,  5,  1)   -- Día del Trabajo
  union all select make_date(p_year,  7, 20)   -- Independencia
  union all select make_date(p_year,  8,  7)   -- Batalla de Boyacá
  union all select make_date(p_year, 12,  8)   -- Inmaculada Concepción
  union all select make_date(p_year, 12, 25)   -- Navidad
  -- Emiliani: al lunes siguiente.
  union all select public.next_monday(make_date(p_year,  1,  6))  -- Reyes Magos
  union all select public.next_monday(make_date(p_year,  3, 19))  -- San José
  union all select public.next_monday(make_date(p_year,  6, 29))  -- San Pedro y San Pablo
  union all select public.next_monday(make_date(p_year,  8, 15))  -- Asunción
  union all select public.next_monday(make_date(p_year, 10, 12))  -- Día de la Raza
  union all select public.next_monday(make_date(p_year, 11,  1))  -- Todos los Santos
  union all select public.next_monday(make_date(p_year, 11, 11))  -- Independencia de Cartagena
  -- Semana Santa: caen donde caen, jueves y viernes.
  union all select (select d from pascua) - 3   -- Jueves Santo
  union all select (select d from pascua) - 2   -- Viernes Santo
  -- Móviles con traslado: 39, 60 y 68 días después de Pascua, corridos al lunes.
  union all select (select d from pascua) + 43  -- Ascensión del Señor
  union all select (select d from pascua) + 64  -- Corpus Christi
  union all select (select d from pascua) + 71  -- Sagrado Corazón de Jesús
$$;

comment on function public.colombian_holidays is
  'Los 18 festivos de Colombia de un año. Calculados (Ley Emiliani + Pascua), no sembrados.';

create or replace function public.is_colombian_holiday(p_date date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1 from public.colombian_holidays(extract(year from p_date)::int) h
    where h = p_date
  )
$$;

-- -----------------------------------------------------------------------------
-- Ajustes de reserva por box
-- -----------------------------------------------------------------------------
-- Tabla aparte y no columnas en `organizations` por lo mismo que
-- `automation_settings`: esto lo toca el dueño a diario y su RLS es propia.
--
-- `block_when_overdue` arranca en FALSE a propósito. Bloquearle la reserva a un
-- atleta es cerrarle la puerta del box: esa decisión la toma el dueño, no
-- nosotros por defecto. Lo que le damos es el interruptor.
-- -----------------------------------------------------------------------------
create table public.reservation_settings (
  org_id                  uuid primary key
                          references public.organizations(id) on delete cascade,

  -- VENTANAS DE TIEMPO (docs/03 §Reglas de reserva, 3) -------------------------
  -- Con cuánta antelación se abre la reserva. 168 h = una semana.
  open_hours_before       int not null default 168
                          check (open_hours_before between 0 and 2160),
  -- Hasta cuántos minutos antes de la clase se puede reservar.
  close_minutes_before    int not null default 30
                          check (close_minutes_before between 0 and 1440),
  -- Hasta cuántos minutos antes se puede cancelar SIN penalización.
  cancel_minutes_before   int not null default 120
                          check (cancel_minutes_before between 0 and 10080),
  -- Qué pasa si cancela tarde:
  --   free           : no pasa nada (se le devuelve el bono)
  --   consume_credit : se le gasta el bono, pero no cuenta como falta
  --   no_show        : cuenta como falta, igual que no aparecer
  late_cancel_policy      text not null default 'consume_credit'
                          check (late_cancel_policy in ('free','consume_credit','no_show')),

  -- MORA (docs/03 §Reglas de reserva, 2) ---------------------------------------
  -- El único interruptor. Cuántos días de mora se toleran NO se configura aquí:
  -- lo decide la regla `access_cutoff` del motor de automatizaciones (0011), que
  -- es la que marca al atleta con la etiqueta `acceso_suspendido`. Dos plazos
  -- configurables en dos pantallas distintas para la misma decisión es cómo se
  -- llega a "el sistema lo bloqueó y nadie sabe con qué regla".
  block_when_overdue      boolean not null default false,

  -- LISTA DE ESPERA (docs/03 §Reglas de reserva, 4) ----------------------------
  waitlist_enabled        boolean not null default true,
  waitlist_max            int not null default 10 check (waitlist_max >= 0),

  -- NO-SHOW (docs/03 §Reglas de reserva, 5) ------------------------------------
  --   record : solo queda registrado
  --   notify : además se le avisa (regla 14 del motor de automatizaciones)
  --   block  : tras `no_show_threshold` faltas en `no_show_window_days`,
  --            no puede reservar durante `no_show_block_days`
  no_show_policy          text not null default 'record'
                          check (no_show_policy in ('record','notify','block')),
  -- ¿La falta le gasta el bono de clases? Lo decide el box.
  no_show_consumes_credit boolean not null default true,
  no_show_threshold       int not null default 3 check (no_show_threshold >= 1),
  no_show_window_days     int not null default 30 check (no_show_window_days >= 1),
  no_show_block_days      int not null default 7 check (no_show_block_days >= 1),

  -- PARRILLA -------------------------------------------------------------------
  skip_holidays           boolean not null default true,
  weeks_ahead             int not null default 4 check (weeks_ahead between 1 and 12),
  -- ¿Se le puede hacer check-in a quien llega sin reservar?
  allow_walk_in           boolean not null default true,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger reservation_settings_touch before update on public.reservation_settings
  for each row execute function public.touch_updated_at();

comment on table public.reservation_settings is
  'Interruptores de reserva por box: ventanas de tiempo, mora, lista de espera y no-show.';
comment on column public.reservation_settings.block_when_overdue is
  'Por defecto FALSE: no se le cierra la puerta a nadie sin que el dueño lo decida.';

/** Ajustes del box, con los valores por defecto si todavía no tiene fila. */
create or replace function public.reservation_settings_of(p_org_id uuid)
returns public.reservation_settings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.reservation_settings;
begin
  select * into v from public.reservation_settings s where s.org_id = p_org_id;
  if found then
    return v;
  end if;
  -- Una fila en memoria con los valores por defecto de la tabla. Así el box que
  -- nunca abrió la pantalla de configuración funciona igual que el que sí.
  insert into public.reservation_settings (org_id) values (p_org_id)
  on conflict (org_id) do nothing;
  select * into v from public.reservation_settings s where s.org_id = p_org_id;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- La parrilla semanal
-- -----------------------------------------------------------------------------
-- `weekday` sigue la convención de `extract(dow)` de Postgres: 0 = domingo …
-- 6 = sábado. Es la misma que `Date.getUTCDay()` en el cliente, así que la
-- parrilla no se corre un día al pintarla.
--
-- Nombre por defecto "Entrenamiento funcional" y no la marca ajena: ver CLAUDE.md.
-- -----------------------------------------------------------------------------
create table public.class_templates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null default 'Entrenamiento funcional',
  weekday      int not null check (weekday between 0 and 6),
  start_time   time not null,
  duration_min int not null default 60 check (duration_min between 5 and 480),
  capacity     int not null check (capacity > 0),
  coach_id     uuid references auth.users(id) on delete set null,
  valid_from   date not null default current_date,
  valid_until  date,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);

create index class_templates_org_idx
  on public.class_templates (org_id, weekday, start_time);
create index class_templates_coach_idx on public.class_templates (coach_id)
  where coach_id is not null;

create trigger class_templates_touch before update on public.class_templates
  for each row execute function public.touch_updated_at();

comment on column public.class_templates.weekday is
  '0 = domingo … 6 = sábado, igual que extract(dow) y Date.getUTCDay().';

-- -----------------------------------------------------------------------------
-- Las clases concretas
-- -----------------------------------------------------------------------------
create table public.classes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  template_id    uuid references public.class_templates(id) on delete set null,
  name           text not null default 'Entrenamiento funcional',
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  capacity       int not null check (capacity > 0),
  -- Desnormalizados y mantenidos por trigger: son para PINTAR la pantalla.
  -- La decisión de si hay cupo NO los mira: la toma `book_class()` contando
  -- bajo el candado de esta misma fila.
  reserved_count int not null default 0 check (reserved_count >= 0),
  waitlist_count int not null default 0 check (waitlist_count >= 0),
  coach_id       uuid references auth.users(id) on delete set null,
  wod_id         uuid references public.wods(id) on delete set null,
  status         text not null default 'scheduled'
                 check (status in ('scheduled','cancelled')),
  cancel_reason  text,
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- IDEMPOTENCIA DE LA GENERACIÓN. Correr `generate_classes` dos veces no duplica
-- la parrilla. Parcial porque una clase suelta (un seminario, un open gym) no
-- viene de plantilla y varios NULL no chocan entre sí en un único normal.
create unique index classes_no_duplica_idx
  on public.classes (org_id, template_id, starts_at)
  where template_id is not null;

create index classes_org_starts_idx on public.classes (org_id, starts_at);
create index classes_org_abiertas_idx on public.classes (org_id, starts_at)
  where status = 'scheduled';
-- Encabezado por template_id para el `on delete set null` de la plantilla.
create index classes_template_idx on public.classes (template_id)
  where template_id is not null;
create index classes_wod_idx on public.classes (wod_id) where wod_id is not null;
create index classes_coach_idx on public.classes (coach_id) where coach_id is not null;

create trigger classes_touch before update on public.classes
  for each row execute function public.touch_updated_at();

comment on column public.classes.reserved_count is
  'Desnormalizado para pintar. El cupo se decide contando bajo candado en book_class().';

-- -----------------------------------------------------------------------------
-- Las reservas
-- -----------------------------------------------------------------------------
create table public.reservations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  class_id        uuid not null references public.classes(id) on delete cascade,
  athlete_id      uuid not null references public.athletes(id) on delete cascade,
  -- Qué membresía pagó esta clase. Es lo que permite contar el bono consumido
  -- sin adivinar, y lo que hace auditable "me descontaron una clase de más".
  subscription_id uuid references public.subscriptions(id) on delete set null,
  status          text not null default 'booked'
                  check (status in ('booked','waitlisted','attended','no_show','cancelled')),
  waitlist_pos    int check (waitlist_pos is null or waitlist_pos > 0),
  source          text not null default 'app'
                  check (source in ('app','staff','whatsapp','walk_in')),
  booked_at       timestamptz not null default now(),
  promoted_at     timestamptz,     -- pasó de la lista de espera a reservado
  cancelled_at    timestamptz,
  cancelled_by    text check (cancelled_by in ('athlete','staff','system')),
  -- Canceló después del plazo. Se guarda además del estado porque el box
  -- necesita distinguir "avisó tarde" de "no avisó".
  late_cancel     boolean not null default false,
  checked_in_at   timestamptz,
  consumed_credit boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Un atleta, una reserva por clase. Sin esto el mismo atleta ocupa dos cupos
-- tocando el botón dos veces con mala señal.
create unique index reservations_una_por_clase_idx
  on public.reservations (org_id, class_id, athlete_id);

-- La lista de espera no puede tener dos primeros. Si un día un `update` mal
-- escrito repitiera una posición, el índice lo rechaza en vez de dejar que dos
-- atletas se peleen el mismo cupo liberado.
create unique index reservations_waitlist_pos_idx
  on public.reservations (org_id, class_id, waitlist_pos)
  where status = 'waitlisted';

-- "Mis próximas reservas" y la señal de no-shows del motor de automatizaciones.
create index reservations_org_athlete_idx
  on public.reservations (org_id, athlete_id, booked_at desc);
-- La lista de la clase. Encabezado por class_id además de por el cascade del
-- borrado de una clase: mismo criterio que `results_athlete_idx` en 0010.
create index reservations_clase_idx
  on public.reservations (class_id, status, waitlist_pos);
create index reservations_athlete_idx on public.reservations (athlete_id);
create index reservations_sub_idx on public.reservations (subscription_id)
  where subscription_id is not null;

create trigger reservations_touch before update on public.reservations
  for each row execute function public.touch_updated_at();

comment on table public.reservations is
  'Reservas de clase. Se escriben por book_class()/cancel_reservation(), nunca con un insert del cliente.';

-- -----------------------------------------------------------------------------
-- La asistencia se ata a la clase (docs/03 §Reglas de reserva, 8)
-- -----------------------------------------------------------------------------
-- 0010 dejó `attendances` con un único `(org_id, athlete_id, date)`: un atleta
-- se marcaba UNA vez por día. Con clases con cupo eso deja de ser cierto —
-- quien hace la de 6 a. m. y vuelve a la de 6 p. m. asistió dos veces— así que
-- el único pasa a incluir la clase. El `coalesce` mantiene la regla vieja para
-- el check-in manual sin clase: ahí sigue siendo uno por día.
-- -----------------------------------------------------------------------------
alter table public.attendances
  add column class_id uuid references public.classes(id) on delete set null;

alter table public.attendances
  drop constraint attendances_org_id_athlete_id_date_key;

create unique index attendances_una_por_clase_idx
  on public.attendances (org_id, athlete_id, date, coalesce(class_id::text, ''));

create index attendances_class_idx on public.attendances (class_id)
  where class_id is not null;

comment on column public.attendances.class_id is
  'Null = check-in manual sin reserva (el del piso del box, F2). Sigue existiendo.';

-- =============================================================================
-- Contadores desnormalizados
-- =============================================================================
create or replace function public.recalc_class_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clases uuid[];
  v_id     uuid;
begin
  -- Un update puede mover la reserva de clase (no pasa hoy, pero el trigger no
  -- tiene por qué asumirlo): se recalculan las dos.
  v_clases := array_remove(array[
    case when tg_op <> 'INSERT' then old.class_id end,
    case when tg_op <> 'DELETE' then new.class_id end
  ], null);

  foreach v_id in array v_clases loop
    update public.classes c
    set reserved_count = (
          select count(*) from public.reservations r
          where r.class_id = v_id and r.status in ('booked','attended')
        ),
        waitlist_count = (
          select count(*) from public.reservations r
          where r.class_id = v_id and r.status = 'waitlisted'
        )
    where c.id = v_id;
  end loop;

  return coalesce(new, old);
end;
$$;

create trigger reservations_recalc_counts
  after insert or update or delete on public.reservations
  for each row execute function public.recalc_class_counts();

-- =============================================================================
-- La asistencia sale de la reserva
-- =============================================================================
-- `reservations.status = 'attended'` escribe en `attendances`; volver atrás la
-- borra. La FECHA es la del día DEL BOX en que empieza la clase, no la de UTC:
-- una clase de 7 p. m. en Bogotá ya es el día siguiente en UTC y quedaría
-- contada en el día equivocado (CLAUDE.md, regla 5).
-- =============================================================================
create or replace function public.sync_attendance_from_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha date;
begin
  select (c.starts_at at time zone o.timezone)::date
    into v_fecha
  from public.classes c
  join public.organizations o on o.id = c.org_id
  where c.id = new.class_id;

  if v_fecha is null then
    return new;
  end if;

  if new.status = 'attended' then
    insert into public.attendances (org_id, athlete_id, class_id, date, status, checked_in_at)
    values (new.org_id, new.athlete_id, new.class_id, v_fecha, 'attended',
            coalesce(new.checked_in_at, now()))
    on conflict (org_id, athlete_id, date, coalesce(class_id::text, '')) do update
      set status = 'attended',
          checked_in_at = excluded.checked_in_at;

  elsif tg_op = 'UPDATE' and old.status = 'attended' then
    -- Se deshizo el check-in (el coach marcó al que no era). La asistencia se
    -- va con él: si no, la detección de fuga cree que vino.
    delete from public.attendances a
    where a.org_id = new.org_id
      and a.athlete_id = new.athlete_id
      and a.class_id = new.class_id;
  end if;

  return new;
end;
$$;

create trigger reservations_sync_attendance
  after insert or update of status on public.reservations
  for each row execute function public.sync_attendance_from_reservation();

-- =============================================================================
-- ¿Este atleta puede reservar?  (docs/03 §Reglas de reserva, 2 y 5)
-- =============================================================================
-- Una sola función responde y la usan las tres puertas: `book_class()`, el
-- ascenso desde la lista de espera y la pantalla del atleta. Devuelve el MOTIVO
-- en español, redactado para mostrárselo tal cual — "no puedes reservar" a
-- secas es exactamente lo que hace que el atleta llame al coach.
--
-- Devuelve además de qué suscripción sale la clase y si gasta bono, para que
-- quien reserve no lo tenga que volver a calcular.
-- =============================================================================

/**
 * El primer día del periodo de facturación vigente de una suscripción.
 * Resuelve los meses cortos igual que `is_billing_day`: corte el 31 en febrero
 * es el 28. Es la ventana en la que se cuenta el bono de clases.
 */
create or replace function public.subscription_period_start(p_billing_day int, p_date date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_mes  date := date_trunc('month', p_date)::date;
  v_fin  int;
  v_cand date;
begin
  v_fin  := extract(day from (v_mes + interval '1 month - 1 day'))::int;
  v_cand := v_mes + (least(p_billing_day, v_fin) - 1);
  if v_cand <= p_date then
    return v_cand;
  end if;
  v_mes := (v_mes - interval '1 month')::date;
  v_fin := extract(day from (v_mes + interval '1 month - 1 day'))::int;
  return v_mes + (least(p_billing_day, v_fin) - 1);
end;
$$;

create or replace function private.booking_eligibility(
  p_org_id     uuid,
  p_athlete_id uuid,
  p_now        timestamptz
)
returns table (reason text, subscription_id uuid, consumes_credit boolean, credits_left int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    public.organizations%rowtype;
  v_set    public.reservation_settings;
  v_ath    public.athletes%rowtype;
  v_sub    record;
  v_hoy    date;
  v_mora   date;
  v_faltas int;
  v_ultima timestamptz;
  v_hasta  date;
  v_ini    date;
  v_fin    date;
  v_usados int;
begin
  reason := null; subscription_id := null; consumes_credit := false; credits_left := null;

  select * into v_org from public.organizations o where o.id = p_org_id;
  if not found then
    reason := 'Ese box no existe.'; return next; return;
  end if;

  select * into v_ath from public.athletes a
  where a.id = p_athlete_id and a.org_id = p_org_id and a.deleted_at is null;
  if not found then
    reason := 'Ese atleta no existe en este box.'; return next; return;
  end if;

  v_set := public.reservation_settings_of(p_org_id);
  v_hoy := (p_now at time zone v_org.timezone)::date;

  -- --- 1 · Membresía activa (ni vencida ni congelada) -----------------------
  select s.*, p.class_quota, p.billing_period, p.duration_days, p.name as plan_name
    into v_sub
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.org_id = p_org_id
    and s.athlete_id = p_athlete_id
    and s.status = 'active'
  order by s.started_on desc
  limit 1;

  if not found then
    reason := 'No tienes una membresía activa. Habla con el box para reactivarla.';
    return next; return;
  end if;
  if v_sub.started_on > v_hoy then
    reason := 'Tu membresía empieza el ' || to_char(v_sub.started_on, 'DD/MM/YYYY') || '.';
    return next; return;
  end if;
  if v_sub.ends_on is not null and v_sub.ends_on < v_hoy then
    reason := 'Tu membresía venció el ' || to_char(v_sub.ends_on, 'DD/MM/YYYY') || '.';
    return next; return;
  end if;
  if v_sub.paused_from is not null and v_sub.paused_from <= v_hoy
     and (v_sub.paused_until is null or v_sub.paused_until >= v_hoy) then
    reason := case
      when v_sub.paused_until is null
        then 'Tu membresía está congelada. Escríbele al box para retomarla.'
      else 'Tu membresía está congelada hasta el ' || to_char(v_sub.paused_until, 'DD/MM/YYYY') || '.'
    end;
    return next; return;
  end if;

  subscription_id := v_sub.id;

  -- --- 2 · Mora, solo si el box encendió el interruptor ---------------------
  if v_set.block_when_overdue then
    select min(i.due_on) into v_mora
    from public.invoices i
    where i.org_id = p_org_id
      and i.athlete_id = p_athlete_id
      and i.status in ('open','partial','overdue')
      and i.due_on < v_hoy - v_set.overdue_grace_days;

    if v_mora is not null then
      reason := 'Tienes una mensualidad vencida desde el ' || to_char(v_mora, 'DD/MM/YYYY')
             || '. El box pidió estar al día para reservar.';
      return next; return;
    end if;
  end if;

  -- --- 3 · Bloqueo por faltas reiteradas ------------------------------------
  -- Se CALCULA, no se guarda: contar las faltas de la ventana es siempre cierto
  -- y se cura solo cuando el coach corrige un no-show mal puesto. Una columna
  -- `blocked_until` habría que mantenerla al día desde tres sitios distintos.
  if v_set.no_show_policy = 'block' then
    select count(*), max(c.starts_at)
      into v_faltas, v_ultima
    from public.reservations r
    join public.classes c on c.id = r.class_id
    where r.org_id = p_org_id
      and r.athlete_id = p_athlete_id
      and r.status = 'no_show'
      and c.starts_at >= p_now - (v_set.no_show_window_days || ' days')::interval;

    if v_faltas >= v_set.no_show_threshold then
      v_hasta := ((v_ultima at time zone v_org.timezone)::date) + v_set.no_show_block_days;
      if v_hasta > v_hoy then
        reason := 'Tienes ' || v_faltas || ' faltas sin cancelar. Puedes volver a reservar el '
               || to_char(v_hasta, 'DD/MM/YYYY') || '.';
        return next; return;
      end if;
    end if;
  end if;

  -- --- 4 · Bono de clases ---------------------------------------------------
  -- Un plan sin `class_quota` es ilimitado y no gasta nada.
  if v_sub.class_quota is not null then
    if v_sub.billing_period = 'one_off' then
      -- Bono suelto: la ventana es la vida del bono.
      v_ini := v_sub.started_on;
      v_fin := coalesce(v_sub.ends_on,
                        v_sub.started_on + coalesce(v_sub.duration_days, 3650));
    else
      -- Periodo de facturación vigente. El ancla es mensual: un plan por bonos
      -- trimestral es un caso que no existe en los boxes que conocemos, y si
      -- apareciera se resuelve con `one_off` + duration_days.
      v_ini := public.subscription_period_start(v_sub.billing_day, v_hoy);
      v_fin := (v_ini + public.period_length(v_sub.billing_period) - interval '1 day')::date;
    end if;

    select count(*) into v_usados
    from public.reservations r
    join public.classes c on c.id = r.class_id
    where r.org_id = p_org_id
      and r.athlete_id = p_athlete_id
      and r.consumed_credit
      and r.status in ('booked','attended','no_show')
      and (c.starts_at at time zone v_org.timezone)::date between v_ini and v_fin;

    credits_left := v_sub.class_quota - v_usados;
    if credits_left <= 0 then
      reason := 'Ya usaste las ' || v_sub.class_quota || ' clases de tu plan '
             || v_sub.plan_name || ' en este periodo.';
      return next; return;
    end if;
    consumes_credit := true;
  end if;

  return next;
end;
$$;

comment on function private.booking_eligibility is
  'Motivo (en español, para mostrárselo al atleta) por el que NO puede reservar, o null.';

-- La misma respuesta, pero desde el cliente: la pantalla del atleta necesita
-- decir POR QUÉ no puede reservar antes de que toque el botón.
create or replace function public.my_booking_status(p_org_id uuid)
returns table (reason text, credits_left int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ath uuid;
  v_el  record;
begin
  v_ath := private.current_athlete_id(p_org_id);
  if v_ath is null then
    return;   -- No es atleta de ese box: cero filas, no una excepción.
  end if;
  select e.reason, e.credits_left into v_el
  from private.booking_eligibility(p_org_id, v_ath, now()) e;
  reason := v_el.reason;
  credits_left := v_el.credits_left;
  return next;
end;
$$;

-- =============================================================================
-- Reservar
-- =============================================================================
-- EL CANDADO ES LA PRIMERA LÍNEA ÚTIL DE LA FUNCIÓN. `select … for update`
-- sobre la fila de la clase serializa a todo el que quiera ese horario: la
-- segunda transacción ESPERA, y cuando entra vuelve a contar. Por eso nunca se
-- venden dos veces el último cupo, y por eso el contador desnormalizado
-- `reserved_count` no participa en la decisión.
--
-- `p_now` es inyectable para poder probar las ventanas de tiempo con fechas
-- fijas, pero SOLO se respeta cuando no hay sesión de usuario (job, Edge
-- Function con service_role, prueba). Si no, un atleta adelantaría el reloj
-- desde el navegador para saltarse "hasta 30 minutos antes".
-- =============================================================================
create or replace function public.book_class(
  p_class_id   uuid,
  p_athlete_id uuid default null,        -- null = yo mismo
  p_source     text default 'app',
  p_force      boolean default false,    -- solo staff: "ya me pagó en efectivo"
  p_now        timestamptz default null
)
returns table (reservation_id uuid, status text, waitlist_pos int, message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class   public.classes%rowtype;
  v_set     public.reservation_settings;
  v_org     public.organizations%rowtype;
  v_now     timestamptz;
  v_yo      uuid;
  v_staff   boolean;
  v_serv    boolean;
  v_ath     uuid;
  v_el      record;
  v_prev    public.reservations%rowtype;
  v_abre    timestamptz;
  v_cierra  timestamptz;
  v_ocupado int;
  v_espera  int;
  v_pos     int;
  v_estado  text;
  v_consume boolean;
  v_sub     uuid;
  v_id      uuid;
begin
  -- ---------------------------------------------------------------- CANDADO --
  select * into v_class from public.classes c where c.id = p_class_id for update;
  if not found then
    raise exception 'Esa clase no existe.';
  end if;

  select * into v_org from public.organizations o where o.id = v_class.org_id;

  v_serv := (select auth.uid()) is null;
  v_now  := case when v_serv and p_now is not null then p_now else now() end;

  -- ------------------------------------------------------------ QUIÉN RESERVA --
  v_yo    := private.current_athlete_id(v_class.org_id);
  v_staff := v_serv or v_class.org_id in (select private.auth_staff_org_ids());

  if p_athlete_id is null then
    v_ath := v_yo;
  elsif p_athlete_id = v_yo or v_staff then
    v_ath := p_athlete_id;
  else
    raise exception 'No tienes permiso para reservar a nombre de otra persona.';
  end if;

  if v_ath is null then
    raise exception 'No encontramos tu ficha de atleta en este box.';
  end if;
  if p_force and not v_staff then
    raise exception 'Solo el equipo del box puede saltarse las reglas de reserva.';
  end if;

  v_set := public.reservation_settings_of(v_class.org_id);

  -- --------------------------------------------------------- ESTADO Y VENTANAS --
  if v_class.status = 'cancelled' then
    raise exception 'Esa clase está cancelada%.',
      coalesce(' (' || v_class.cancel_reason || ')', '');
  end if;

  v_abre   := v_class.starts_at - (v_set.open_hours_before    || ' hours')::interval;
  v_cierra := v_class.starts_at - (v_set.close_minutes_before || ' minutes')::interval;

  if v_now < v_abre then
    raise exception 'Todavía no se abre la reserva para esa clase. Abre el %.',
      to_char(v_abre at time zone v_org.timezone, 'DD/MM a las HH12:MI AM');
  end if;
  if v_now > v_cierra then
    raise exception 'Ya cerró la reserva para esa clase (se cierra % minutos antes).',
      v_set.close_minutes_before;
  end if;

  -- ------------------------------------------------------------- YA RESERVADA --
  select * into v_prev from public.reservations r
  where r.class_id = p_class_id and r.athlete_id = v_ath;

  if found then
    if v_prev.status = 'booked' then
      raise exception 'Ya tienes reservada esa clase.';
    elsif v_prev.status = 'waitlisted' then
      raise exception 'Ya estás en la lista de espera de esa clase, en la posición %.',
        v_prev.waitlist_pos;
    elsif v_prev.status = 'attended' then
      raise exception 'Ya asististe a esa clase.';
    end if;
    -- 'cancelled' o 'no_show': se reutiliza la fila. El único
    -- (org_id, class_id, athlete_id) impide insertar otra.
  end if;

  -- ----------------------------------------------------------- ¿PUEDE RESERVAR? --
  select e.reason, e.subscription_id, e.consumes_credit into v_el
  from private.booking_eligibility(v_class.org_id, v_ath, v_now) e;

  if v_el.reason is not null and not p_force then
    raise exception '%', v_el.reason;
  end if;
  v_sub     := v_el.subscription_id;
  v_consume := coalesce(v_el.consumes_credit, false);

  -- ------------------------------------------------------- CUPO, BAJO CANDADO --
  select count(*) into v_ocupado
  from public.reservations r
  where r.class_id = p_class_id and r.status in ('booked','attended');

  if v_ocupado < v_class.capacity then
    v_estado := 'booked';
    v_pos    := null;
  elsif v_set.waitlist_enabled then
    select count(*), coalesce(max(r.waitlist_pos), 0) + 1
      into v_espera, v_pos
    from public.reservations r
    where r.class_id = p_class_id and r.status = 'waitlisted';

    if v_espera >= v_set.waitlist_max then
      raise exception 'La clase está llena y la lista de espera también (% en fila).', v_espera;
    end if;
    v_estado := 'waitlisted';
    -- Estar en la lista no gasta el bono: se gasta al entrar de verdad.
    v_consume := false;
  else
    raise exception 'Esa clase ya está llena (% de % cupos).', v_ocupado, v_class.capacity;
  end if;

  -- ------------------------------------------------------------------ ESCRIBIR --
  if v_prev.id is not null then
    update public.reservations r
    set status = v_estado, waitlist_pos = v_pos, subscription_id = v_sub,
        source = p_source, booked_at = v_now, consumed_credit = v_consume,
        cancelled_at = null, cancelled_by = null, late_cancel = false,
        checked_in_at = null, promoted_at = null
    where r.id = v_prev.id
    returning r.id into v_id;
  else
    insert into public.reservations
      (org_id, class_id, athlete_id, subscription_id, status, waitlist_pos,
       source, booked_at, consumed_credit)
    values
      (v_class.org_id, p_class_id, v_ath, v_sub, v_estado, v_pos,
       p_source, v_now, v_consume)
    returning id into v_id;
  end if;

  reservation_id := v_id;
  status         := v_estado;
  waitlist_pos   := v_pos;
  message        := case
    when v_estado = 'booked' then 'Listo, quedaste dentro.'
    else 'La clase está llena: quedaste en la lista de espera, posición ' || v_pos
         || '. Si alguien cancela te avisamos.'
  end;
  return next;
end;
$$;

comment on function public.book_class is
  'Única puerta a una reserva. Toma el candado de la clase y cuenta el cupo bajo él.';

-- =============================================================================
-- Cancelar una reserva (y mover la lista de espera)
-- =============================================================================
-- El ascenso ocurre DENTRO de esta misma transacción: cuando la función
-- devuelve, el cupo ya tiene dueño y el aviso ya está en `message_outbox`. Si
-- se dejara para un job, el cupo quedaría libre "en secreto" hasta que corriera
-- y alguien más lo tomaría por la vía normal.
--
-- El candado se toma SIEMPRE sobre la clase primero y la reserva después: mismo
-- orden que en `book_class()`, que es lo que evita los interbloqueos.
-- =============================================================================
create or replace function public.cancel_reservation(
  p_reservation_id uuid,
  p_now            timestamptz default null
)
returns table (
  cancelled          boolean,
  late               boolean,
  credit_returned    boolean,
  counted_as_no_show boolean,
  promoted_id        uuid,
  promoted_athlete   uuid,
  message            text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res     public.reservations%rowtype;
  v_class   public.classes%rowtype;
  v_org     public.organizations%rowtype;
  v_set     public.reservation_settings;
  v_now     timestamptz;
  v_serv    boolean;
  v_staff   boolean;
  v_yo      uuid;
  v_limite  timestamptz;
  v_tarde   boolean;
  v_estado  text;
  v_consume boolean;
  v_libera  boolean;
  cand      record;
  v_el      record;
  v_prom    uuid;
  v_promath uuid;
begin
  select r.class_id into v_class.id from public.reservations r where r.id = p_reservation_id;
  if v_class.id is null then
    raise exception 'Esa reserva no existe.';
  end if;

  -- Candado de la clase primero, siempre.
  select * into v_class from public.classes c where c.id = v_class.id for update;
  select * into v_res   from public.reservations r where r.id = p_reservation_id;
  select * into v_org   from public.organizations o where o.id = v_class.org_id;

  v_serv := (select auth.uid()) is null;
  v_now  := case when v_serv and p_now is not null then p_now else now() end;

  v_yo    := private.current_athlete_id(v_class.org_id);
  v_staff := v_serv or v_class.org_id in (select private.auth_staff_org_ids());
  if not v_staff and v_res.athlete_id is distinct from v_yo then
    raise exception 'No tienes permiso para cancelar esa reserva.';
  end if;

  if v_res.status in ('cancelled','no_show') then
    raise exception 'Esa reserva ya no está activa.';
  end if;
  if v_res.status = 'attended' then
    raise exception 'Esa clase ya está marcada como asistida: quítale el check-in primero.';
  end if;

  v_set    := public.reservation_settings_of(v_class.org_id);
  v_limite := v_class.starts_at - (v_set.cancel_minutes_before || ' minutes')::interval;
  v_tarde  := v_now > v_limite;
  -- Estar en la lista de espera no tiene plazo: nadie se queda sin cupo por eso.
  if v_res.status = 'waitlisted' then
    v_tarde := false;
  end if;

  -- Política del box para la cancelación tardía.
  if not v_tarde then
    v_estado := 'cancelled'; v_consume := false;
  elsif v_set.late_cancel_policy = 'free' then
    v_estado := 'cancelled'; v_consume := false;
  elsif v_set.late_cancel_policy = 'consume_credit' then
    v_estado := 'cancelled'; v_consume := v_res.consumed_credit;
  else  -- 'no_show': avisar tarde pesa igual que no avisar
    v_estado := 'no_show';
    v_consume := v_res.consumed_credit and v_set.no_show_consumes_credit;
  end if;

  -- El cupo solo se libera si estaba ocupado de verdad.
  v_libera := v_res.status = 'booked' and v_class.status = 'scheduled';

  update public.reservations r
  set status = v_estado,
      consumed_credit = v_consume,
      cancelled_at = v_now,
      cancelled_by = case when v_staff and v_res.athlete_id is distinct from v_yo
                          then 'staff' else 'athlete' end,
      late_cancel = v_tarde,
      waitlist_pos = null
  where r.id = p_reservation_id;

  -- --------------------------------------------------------- LISTA DE ESPERA --
  if v_libera then
    for cand in
      select r.* from public.reservations r
      where r.class_id = v_class.id and r.status = 'waitlisted'
      order by r.waitlist_pos, r.booked_at
      for update
    loop
      -- El primero de la fila puede haber entrado en mora o quedarse sin bono
      -- mientras esperaba. Si no puede, se pasa al siguiente en vez de darle un
      -- cupo que después habría que quitarle.
      select e.reason, e.subscription_id, e.consumes_credit into v_el
      from private.booking_eligibility(v_class.org_id, cand.athlete_id, v_now) e;

      if v_el.reason is not null then
        continue;
      end if;

      update public.reservations r
      set status = 'booked', waitlist_pos = null, promoted_at = v_now,
          subscription_id = v_el.subscription_id,
          consumed_credit = coalesce(v_el.consumes_credit, false)
      where r.id = cand.id;

      v_prom    := cand.id;
      v_promath := cand.athlete_id;

      -- Regla 11 de docs/04: el aviso queda encolado aquí mismo, no en un job.
      perform public.queue_automation_message(
        v_class.org_id,
        (select ar.id from public.automation_rules ar
         where ar.key = 'waitlist_slot' and (ar.org_id = v_class.org_id or ar.org_id is null)
         order by (ar.org_id is null) limit 1),
        cand.athlete_id,
        'waitlist_slot',
        'waitlist_slot:' || cand.id::text,
        jsonb_build_object(
          'nombre', (select a.first_name from public.athletes a where a.id = cand.athlete_id),
          'clase',  v_class.name,
          'hora',   to_char(v_class.starts_at at time zone v_org.timezone, 'HH12:MI AM'),
          'box',    v_org.name),
        v_now, null, 'athlete');

      exit;
    end loop;
  end if;

  cancelled          := true;
  late               := v_tarde;
  credit_returned    := v_res.consumed_credit and not v_consume;
  counted_as_no_show := v_estado = 'no_show';
  promoted_id        := v_prom;
  promoted_athlete   := v_promath;
  message := case
    when v_estado = 'no_show'
      then 'Cancelaste fuera de plazo: el box la cuenta como falta.'
    when v_tarde and v_consume
      then 'Cancelaste fuera de plazo: la clase se te descuenta igual.'
    else 'Reserva cancelada. Gracias por liberar el cupo.'
  end;
  return next;
end;
$$;

-- =============================================================================
-- Cancelar la clase entera (festivo, coach enfermo)
-- =============================================================================
-- Avisa a TODOS los reservados y DEVUELVE los créditos consumidos. Que el box
-- cancele no le puede costar una clase al atleta.
-- =============================================================================
create or replace function public.cancel_class(
  p_class_id uuid,
  p_reason   text default null,
  p_now      timestamptz default null
)
returns table (notified int, credits_returned int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes%rowtype;
  v_org   public.organizations%rowtype;
  v_now   timestamptz;
  v_serv  boolean;
  v_regla uuid;
  v_dev   int := 0;
  v_avi   int := 0;
  cand    record;
begin
  select * into v_class from public.classes c where c.id = p_class_id for update;
  if not found then
    raise exception 'Esa clase no existe.';
  end if;

  v_serv := (select auth.uid()) is null;
  v_now  := case when v_serv and p_now is not null then p_now else now() end;

  if not v_serv and v_class.org_id not in (select private.auth_staff_org_ids()) then
    raise exception 'Solo el equipo del box puede cancelar una clase.';
  end if;
  if v_class.status = 'cancelled' then
    raise exception 'Esa clase ya estaba cancelada.';
  end if;

  select * into v_org from public.organizations o where o.id = v_class.org_id;

  update public.classes c
  set status = 'cancelled',
      cancel_reason = coalesce(p_reason, 'Cancelada por el box'),
      cancelled_at = v_now
  where c.id = p_class_id;

  select ar.id into v_regla from public.automation_rules ar
  where ar.key = 'class_cancelled' and (ar.org_id = v_class.org_id or ar.org_id is null)
  order by (ar.org_id is null) limit 1;

  for cand in
    select r.*, a.first_name
    from public.reservations r
    join public.athletes a on a.id = r.athlete_id
    where r.class_id = p_class_id
      and r.status in ('booked','waitlisted')
    for update of r
  loop
    if cand.consumed_credit then
      v_dev := v_dev + 1;
    end if;

    update public.reservations r
    set status = 'cancelled',
        consumed_credit = false,     -- devolución del crédito
        cancelled_at = v_now,
        cancelled_by = 'system',
        late_cancel = false,
        waitlist_pos = null
    where r.id = cand.id;

    -- Al de la lista de espera no se le avisa de una clase que nunca tuvo.
    if cand.status = 'booked' then
      if public.queue_automation_message(
           v_class.org_id, v_regla, cand.athlete_id, 'class_cancelled',
           'class_cancelled:' || cand.id::text,
           jsonb_build_object(
             'nombre', cand.first_name,
             'clase',  v_class.name,
             'hora',   to_char(v_class.starts_at at time zone v_org.timezone, 'HH12:MI AM'),
             'motivo', coalesce(p_reason, 'cierre del box'),
             'box',    v_org.name),
           v_now, null, 'athlete') is not null then
        v_avi := v_avi + 1;
      end if;
    end if;
  end loop;

  notified := v_avi;
  credits_returned := v_dev;
  return next;
end;
$$;

-- =============================================================================
-- Check-in y cierre de la clase
-- =============================================================================
-- El check-in del coach es un toque en el celular con la clase entrando por la
-- puerta: por eso `check_in` sirve tanto para confirmar al que reservó como
-- para meter al que llegó sin reservar, si el box lo permite.
-- =============================================================================
create or replace function public.check_in(
  p_class_id   uuid,
  p_athlete_id uuid,
  p_present    boolean default true,
  p_now        timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes%rowtype;
  v_set   public.reservation_settings;
  v_now   timestamptz;
  v_serv  boolean;
  v_res   public.reservations%rowtype;
  v_el    record;
  v_id    uuid;
begin
  select * into v_class from public.classes c where c.id = p_class_id for update;
  if not found then
    raise exception 'Esa clase no existe.';
  end if;

  v_serv := (select auth.uid()) is null;
  v_now  := case when v_serv and p_now is not null then p_now else now() end;

  if not v_serv and v_class.org_id not in (select private.auth_staff_org_ids()) then
    raise exception 'Solo el equipo del box registra la asistencia.';
  end if;

  v_set := public.reservation_settings_of(v_class.org_id);

  select * into v_res from public.reservations r
  where r.class_id = p_class_id and r.athlete_id = p_athlete_id;

  if not found then
    if not p_present then
      raise exception 'Ese atleta no tenía reserva en esa clase.';
    end if;
    if not v_set.allow_walk_in then
      raise exception 'Este box no permite entrar sin reserva.';
    end if;
    -- Llegó sin reservar. Se le gasta el bono igual que si hubiera reservado,
    -- pero no se le bloquea la entrada por mora: ya está en el piso del box.
    select e.subscription_id, e.consumes_credit into v_el
    from private.booking_eligibility(v_class.org_id, p_athlete_id, v_now) e;

    insert into public.reservations
      (org_id, class_id, athlete_id, subscription_id, status, source,
       booked_at, checked_in_at, consumed_credit)
    values
      (v_class.org_id, p_class_id, p_athlete_id, v_el.subscription_id, 'attended',
       'walk_in', v_now, v_now, coalesce(v_el.consumes_credit, false))
    returning id into v_id;
    return v_id;
  end if;

  if p_present then
    update public.reservations r
    set status = 'attended', checked_in_at = v_now, waitlist_pos = null
    where r.id = v_res.id;
  else
    -- Deshacer: vuelve a estar reservado, no marcado. El trigger de asistencia
    -- borra la fila de `attendances` para que la fuga no lo cuente como visita.
    update public.reservations r
    set status = 'booked', checked_in_at = null
    where r.id = v_res.id;
  end if;

  return v_res.id;
end;
$$;

/**
 * Cierra la clase: lo que siga en `booked` pasa a falta.
 * Lo llama el coach al terminar, o un job una hora después de `ends_at`.
 */
create or replace function public.close_class(
  p_class_id uuid,
  p_now      timestamptz default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes%rowtype;
  v_set   public.reservation_settings;
  v_now   timestamptz;
  v_serv  boolean;
  v_n     int;
begin
  select * into v_class from public.classes c where c.id = p_class_id for update;
  if not found then
    raise exception 'Esa clase no existe.';
  end if;

  v_serv := (select auth.uid()) is null;
  v_now  := case when v_serv and p_now is not null then p_now else now() end;

  if not v_serv and v_class.org_id not in (select private.auth_staff_org_ids()) then
    raise exception 'Solo el equipo del box cierra una clase.';
  end if;

  v_set := public.reservation_settings_of(v_class.org_id);

  with faltas as (
    update public.reservations r
    set status = 'no_show',
        -- ¿La falta gasta el bono? Lo decide el box (docs/03 §Reglas, 5).
        consumed_credit = r.consumed_credit and v_set.no_show_consumes_credit
    where r.class_id = p_class_id
      and r.status = 'booked'
    returning r.id
  )
  select count(*)::int into v_n from faltas;

  -- La lista de espera que nunca entró se cierra sin penalización.
  update public.reservations r
  set status = 'cancelled', cancelled_at = v_now, cancelled_by = 'system',
      waitlist_pos = null, consumed_credit = false
  where r.class_id = p_class_id and r.status = 'waitlisted';

  return v_n;
end;
$$;

-- =============================================================================
-- Generación de la parrilla
-- =============================================================================
-- `class_templates` → `classes` de las próximas semanas, saltándose los
-- festivos colombianos si el box así lo quiere. Idempotente por el único
-- (org_id, template_id, starts_at): correrlo dos veces no duplica la semana.
--
-- La hora se construye como hora LOCAL DEL BOX y después se convierte:
-- `(fecha + hora) at time zone o.timezone`. Guardar 06:00 UTC habría puesto la
-- clase a la 1 a. m. en Bogotá (CLAUDE.md, regla 5).
-- =============================================================================
create or replace function public.generate_classes(
  p_org_id uuid default null,
  p_now    timestamptz default now(),
  p_weeks  int default null
)
returns table (org_id uuid, classes_created int, holidays_skipped int, run_date date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  org      record;
  tpl      record;
  v_set    public.reservation_settings;
  v_hoy    date;
  v_hasta  date;
  v_dia    date;
  v_ini    timestamptz;
  v_creadas int;
  v_fest    int;
  v_id      uuid;
begin
  for org in
    select o.id, o.timezone
    from public.organizations o
    where (p_org_id is null or o.id = p_org_id)
      and o.status in ('trial','active','past_due')
  loop
    -- Un solo proceso generando por box. Si otro lo tiene, se salta el box en
    -- vez de esperar: el job vuelve a correr. Mismo criterio que generate_invoices.
    if not pg_try_advisory_xact_lock(hashtext('generate_classes'), hashtext(org.id::text)) then
      continue;
    end if;

    v_set    := public.reservation_settings_of(org.id);
    v_hoy    := (p_now at time zone org.timezone)::date;
    v_hasta  := v_hoy + (coalesce(p_weeks, v_set.weeks_ahead) * 7);
    v_creadas := 0;
    v_fest    := 0;

    for tpl in
      select t.* from public.class_templates t
      where t.org_id = org.id and t.is_active
    loop
      v_dia := greatest(v_hoy, tpl.valid_from);
      while v_dia <= least(v_hasta, coalesce(tpl.valid_until, v_hasta)) loop
        if extract(dow from v_dia)::int = tpl.weekday then
          if v_set.skip_holidays and public.is_colombian_holiday(v_dia) then
            v_fest := v_fest + 1;
          else
            v_ini := (v_dia + tpl.start_time) at time zone org.timezone;
            -- Nada de crear clases que ya empezaron.
            if v_ini > p_now then
              insert into public.classes
                (org_id, template_id, name, starts_at, ends_at, capacity, coach_id)
              values
                (org.id, tpl.id, tpl.name, v_ini,
                 v_ini + (tpl.duration_min || ' minutes')::interval,
                 tpl.capacity, tpl.coach_id)
              on conflict (org_id, template_id, starts_at)
                where template_id is not null
                do nothing
              returning id into v_id;

              if v_id is not null then
                v_creadas := v_creadas + 1;
                v_id := null;
              end if;
            end if;
          end if;
        end if;
        v_dia := v_dia + 1;
      end loop;
    end loop;

    org_id           := org.id;
    classes_created  := v_creadas;
    holidays_skipped := v_fest;
    run_date         := v_hoy;
    return next;
  end loop;
end;
$$;

comment on function public.generate_classes is
  'Parrilla semanal -> clases de las próximas semanas. Idempotente y respeta los festivos colombianos.';

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.reservation_settings enable row level security;
alter table public.class_templates      enable row level security;
alter table public.classes              enable row level security;
alter table public.reservations         enable row level security;

-- ------------------------------------------------------ reservation_settings --
create policy "el staff lee los ajustes de reserva"
  on public.reservation_settings for select
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()));

create policy "owner/admin gestionan los ajustes de reserva"
  on public.reservation_settings for all
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])))
  with check (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])));

-- El atleta los lee porque la pantalla tiene que decirle "se cancela hasta 2
-- horas antes" ANTES de que toque el botón. No hay nada sensible aquí.
create policy "el atleta lee los ajustes de reserva de su box"
  on public.reservation_settings for select
  to authenticated
  using (org_id in (select private.auth_org_ids()));

-- ----------------------------------------------------------- class_templates --
create policy "el staff gestiona la parrilla de su box"
  on public.class_templates for all
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()))
  with check (org_id in (select private.auth_staff_org_ids()));

create policy "el atleta ve la parrilla activa de su box"
  on public.class_templates for select
  to authenticated
  using (is_active and org_id in (select private.auth_org_ids()));

-- -------------------------------------------------------------------- classes --
create policy "el staff gestiona las clases de su box"
  on public.classes for all
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()))
  with check (org_id in (select private.auth_staff_org_ids()));

-- Todo miembro ve los horarios y el cupo restante de SU box. El aislamiento
-- entre boxes es este `org_id in (…)`: el de al lado no existe.
create policy "los miembros ven los horarios de su box"
  on public.classes for select
  to authenticated
  using (org_id in (select private.auth_org_ids()));

-- --------------------------------------------------------------- reservations --
create policy "el staff gestiona las reservas de su box"
  on public.reservations for all
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()))
  with check (org_id in (select private.auth_staff_org_ids()));

-- El atleta LEE las suyas y nada más. No hay política de insert ni de update a
-- propósito: un `with check` no puede contar cupos ni tomar el candado de la
-- clase, así que reservar y cancelar pasan por book_class() y
-- cancel_reservation(), que son SECURITY DEFINER y sí pueden.
create policy "el atleta ve sus propias reservas"
  on public.reservations for select
  to authenticated
  using (athlete_id = (select private.current_athlete_id(org_id)));

-- =============================================================================
-- Permisos
-- =============================================================================
-- Mismo criterio que en 0010: `authenticated` puede llamarlas (la función
-- comprueba por dentro quién es), `anon` no. Supabase concede EXECUTE a `anon`
-- por defecto sobre lo que vive en `public`, así que el revoke no es decorativo.
grant execute on function public.book_class(uuid, uuid, text, boolean, timestamptz) to authenticated;
grant execute on function public.cancel_reservation(uuid, timestamptz)              to authenticated;
grant execute on function public.cancel_class(uuid, text, timestamptz)              to authenticated;
grant execute on function public.check_in(uuid, uuid, boolean, timestamptz)         to authenticated;
grant execute on function public.close_class(uuid, timestamptz)                     to authenticated;
grant execute on function public.my_booking_status(uuid)                            to authenticated;
grant execute on function public.reservation_settings_of(uuid)                      to authenticated;

revoke all on function public.book_class(uuid, uuid, text, boolean, timestamptz) from public, anon;
revoke all on function public.cancel_reservation(uuid, timestamptz)              from public, anon;
revoke all on function public.cancel_class(uuid, text, timestamptz)              from public, anon;
revoke all on function public.check_in(uuid, uuid, boolean, timestamptz)         from public, anon;
revoke all on function public.close_class(uuid, timestamptz)                     from public, anon;
revoke all on function public.my_booking_status(uuid)                            from public, anon;
revoke all on function public.reservation_settings_of(uuid)                      from public, anon;

-- La generación de la parrilla es un job, no algo que se llame desde el cliente.
revoke all on function public.generate_classes(uuid, timestamptz, int)
  from public, anon, authenticated;

revoke all on function private.booking_eligibility(uuid, uuid, timestamptz) from public, anon;

-- =============================================================================
-- Ajustes por defecto para los boxes que ya existen
-- =============================================================================
insert into public.reservation_settings (org_id)
select o.id from public.organizations o
on conflict (org_id) do nothing;
