-- =============================================================================
-- 0005 · Catálogo de movimientos y marcas personales
-- =============================================================================
-- Reemplaza las columnas sueltas del prototipo (back_squat, karen,
-- burpees_100…) por un catálogo + un histórico de marcas.
--
-- Por qué cambia: como columnas de texto no se puede ordenar, promediar,
-- graficar ni comparar contra el box, y agregar un movimiento nuevo obligaba a
-- alterar la tabla. Como filas numéricas, la evolución del atleta —que es lo
-- que engancha— sale de una consulta.
--
-- `legacy_key` guarda el nombre de la columna vieja para que la migración del
-- box del entrenador sea determinista y quede documentada en los propios datos.
-- =============================================================================

create table public.movements (
  id           uuid primary key default gen_random_uuid(),
  -- null = catálogo global, compartido por todos los boxes.
  -- con org_id = movimiento propio de ese box.
  org_id       uuid references public.organizations(id) on delete cascade,
  name         text not null,
  category     text check (category in ('weightlifting','gymnastics','monostructural','benchmark')),
  metric       text not null check (metric in ('weight','time','reps','rounds_reps','distance','calories')),
  unit         text not null default 'kg',
  is_benchmark boolean not null default false,
  legacy_key   text,
  sort_order   int not null default 100,
  created_at   timestamptz not null default now()
);

create unique index movements_unique_name_idx
  on public.movements (coalesce(org_id::text, 'global'), lower(name));
create index movements_org_idx on public.movements (org_id);

comment on column public.movements.legacy_key is
  'Columna equivalente en el prototipo. La usa la migración del box 0.';

-- -----------------------------------------------------------------------------
create table public.personal_records (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  movement_id   uuid not null references public.movements(id) on delete cascade,
  -- SIEMPRE numérico: kilos, o segundos, o repeticiones. "8:30" se guarda 510.
  value_numeric numeric not null check (value_numeric >= 0),
  unit          text not null,
  reps          int not null default 1 check (reps > 0),   -- 1RM, 3RM, 5RM
  achieved_on   date not null default current_date,
  source        text not null default 'manual'
                check (source in ('manual','wod_result','import','legacy')),
  notes         text,
  created_at    timestamptz not null default now()
);

create index personal_records_evolucion_idx
  on public.personal_records (org_id, athlete_id, movement_id, achieved_on desc);
-- Dos veces la misma marca, el mismo día, para el mismo movimiento: es un
-- duplicado de importación, no un PR nuevo.
create unique index personal_records_no_duplica_idx
  on public.personal_records (athlete_id, movement_id, achieved_on, reps);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.movements        enable row level security;
alter table public.personal_records enable row level security;

-- El catálogo global lo lee cualquiera que haya entrado; el propio del box,
-- solo quien pertenece a ese box.
create policy "catálogo visible para los miembros"
  on public.movements for select
  to authenticated
  using (org_id is null or org_id in (select private.auth_org_ids()));

create policy "el staff gestiona los movimientos de su box"
  on public.movements for all
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()))
  with check (org_id in (select private.auth_staff_org_ids()));

create policy "el staff gestiona las marcas de su box"
  on public.personal_records for all
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()))
  with check (org_id in (select private.auth_staff_org_ids()));

create policy "el atleta ve sus propias marcas"
  on public.personal_records for select
  to authenticated
  using (athlete_id = (select private.current_athlete_id(org_id)));

-- =============================================================================
-- Catálogo global
-- =============================================================================
-- Incluye exactamente los movimientos y benchmarks que ya usaba el box del
-- entrenador, con su `legacy_key`, para que su migración sea automática.
-- =============================================================================
insert into public.movements (name, category, metric, unit, is_benchmark, legacy_key, sort_order) values
  -- Levantamientos (el prototipo los guardaba como columnas)
  ('Back Squat',      'weightlifting', 'weight', 'kg', false, 'back_squat',     10),
  ('Front Squat',     'weightlifting', 'weight', 'kg', false, 'front_squat',    20),
  ('Deadlift',        'weightlifting', 'weight', 'kg', false, 'deadlift',       30),
  ('Bench Press',     'weightlifting', 'weight', 'kg', false, 'bench_press',    40),
  ('Shoulder Press',  'weightlifting', 'weight', 'kg', false, 'shoulder_press', 50),
  ('Push Press',      'weightlifting', 'weight', 'kg', false, 'push_press',     60),
  ('Clean',           'weightlifting', 'weight', 'kg', false, 'clean_rm',       70),
  ('Snatch',          'weightlifting', 'weight', 'kg', false, 'snatch_rm',      80),
  -- Benchmarks que ya medía el box
  ('Karen',           'benchmark', 'time', 'sec', true, 'karen',       200),
  ('100 Burpees',     'benchmark', 'time', 'sec', true, 'burpees_100', 210),
  -- Catálogo adicional, disponible desde el día uno
  ('Clean & Jerk',    'weightlifting', 'weight', 'kg', false, null, 90),
  ('Overhead Squat',  'weightlifting', 'weight', 'kg', false, null, 100),
  ('Thruster',        'weightlifting', 'weight', 'kg', false, null, 110),
  ('Fran',            'benchmark', 'time',        'sec',   true, null, 220),
  ('Grace',           'benchmark', 'time',        'sec',   true, null, 230),
  ('Helen',           'benchmark', 'time',        'sec',   true, null, 240),
  ('Murph',           'benchmark', 'time',        'sec',   true, null, 250),
  ('Cindy',           'benchmark', 'rounds_reps', 'rounds', true, null, 260),
  ('Pull-ups máximas','gymnastics', 'reps',       'reps',  false, null, 300),
  ('Row 500m',        'monostructural', 'time',   'sec',   false, null, 310);

-- Un box puede añadir los suyos: `movements` con su org_id. Nada de alterar
-- tablas para medir un movimiento nuevo, que es lo que obligaba el prototipo.
