-- =============================================================================
-- 0010 · Entrenamiento: WOD del día, resultados, asistencia y leaderboard
-- =============================================================================
-- Es el módulo que el coach abre todos los días desde el celular y el que hace
-- que el atleta entre por su cuenta. Tres decisiones se resuelven aquí abajo,
-- en la base, porque en el cliente se rompen tarde o temprano:
--
--   1. PUBLICADO ≠ ESCRITO. El coach programa la semana por adelantado. Hasta
--      que no le da a publicar, el atleta NO puede ver el WOD — y eso no es un
--      `if` en React, es RLS: aunque la pantalla pidiera todos los WOD del box,
--      el servidor solo devuelve los que tienen `published_at`.
--   2. LA DIRECCIÓN DEL SCORE. En `for_time` MENOS es mejor; en `amrap`, `emom`
--      y `load`, MÁS es mejor. Si esto se equivoca, el leaderboard queda al
--      revés y la app le dice al atleta que empeoró justo cuando mejoró.
--   3. EL PR SE DETECTA SOLO. Nadie va a registrar a mano que subió su Back
--      Squat: el resultado del WOD ya lo dice. Lo hace un trigger, con la
--      dirección correcta según el tipo de score.
--
-- Ver docs/03-modelo-de-datos.md (Entrenamiento) y docs/01-producto-alcance.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- El WOD del día
-- -----------------------------------------------------------------------------
create table public.wods (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  date         date not null,
  title        text,
  notes        text,                 -- notas del coach para el día
  -- null = borrador. El atleta no lo ve todavía. Es la bandera que separa
  -- "estoy programando la semana" de "esto es lo que toca hoy".
  published_at timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Un box puede tener dos sesiones distintas el mismo día ("WOD" y "Open Gym"),
-- pero no dos con el mismo nombre. `coalesce` porque el título es opcional y
-- en SQL dos NULL no chocan entre sí.
create unique index wods_org_date_title_idx
  on public.wods (org_id, date, coalesce(title, ''));
create index wods_org_date_idx on public.wods (org_id, date desc);
-- Índice parcial: la consulta del atleta ("¿qué hay hoy?") solo mira publicados.
create index wods_org_publicados_idx on public.wods (org_id, date desc)
  where published_at is not null;

create trigger wods_touch
  before update on public.wods
  for each row execute function public.touch_updated_at();

comment on column public.wods.published_at is
  'Si es null el WOD es borrador y la RLS se lo esconde al atleta.';

-- -----------------------------------------------------------------------------
-- Los bloques del WOD
-- -----------------------------------------------------------------------------
create table public.wod_blocks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  wod_id       uuid not null references public.wods(id) on delete cascade,
  position     int not null default 0,
  kind         text not null
               check (kind in ('warmup','strength','metcon','accessory','cooldown')),
  title        text,
  description  text not null default '',  -- "21-15-9 Thrusters 43kg / Pull-ups"
  score_type   text
               check (score_type in ('for_time','amrap','emom','load','not_scored')),
  time_cap_sec int check (time_cap_sec is null or time_cap_sec > 0),
  -- {"rx": "43kg", "scaled": "30kg", "beginner": "20kg"}
  scaling      jsonb not null default '{}'::jsonb,
  -- Si el bloque mide un movimiento del catálogo (un Back Squat, un Fran), el
  -- resultado alimenta la marca personal sin que nadie la escriba dos veces.
  movement_id  uuid references public.movements(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- A propósito NO hay único sobre (wod_id, position): reordenar bloques desde el
-- celular son varios UPDATE sueltos y un único no diferible los rechazaría a
-- mitad de camino. El orden lo garantiza el ORDER BY, no una restricción.
create index wod_blocks_org_wod_idx on public.wod_blocks (org_id, wod_id, position);
-- El borrado en cascada de un WOD necesita el índice encabezado por wod_id.
create index wod_blocks_wod_idx on public.wod_blocks (wod_id, position);
create index wod_blocks_movement_idx on public.wod_blocks (movement_id)
  where movement_id is not null;

comment on column public.wod_blocks.score_type is
  'for_time (menos es mejor) | amrap | emom | load (más es mejor) | not_scored';

-- -----------------------------------------------------------------------------
-- Resultados
-- -----------------------------------------------------------------------------
create table public.results (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  wod_block_id  uuid not null references public.wod_blocks(id) on delete cascade,
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  -- SIEMPRE numérico: segundos, kilos, o rondas.reps (5+13 -> 5.13). Es lo que
  -- permite ordenar el leaderboard y detectar el PR.
  value_numeric numeric check (value_numeric is null or value_numeric >= 0),
  display_value text,                 -- "8:42", "5+13" — lo que lee el atleta
  scale         text not null default 'rx'
                check (scale in ('rx','scaled','beginner')),
  notes         text,
  rpe           int check (rpe is null or rpe between 1 and 10),
  energy        int check (energy is null or energy between 1 and 5),
  logged_by     text not null default 'athlete'
                check (logged_by in ('athlete','coach')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Un atleta, un resultado por bloque. Sin esto el leaderboard se llena de
  -- intentos repetidos y el PR se dispara varias veces.
  unique (wod_block_id, athlete_id)
);

create index results_org_block_idx on public.results (org_id, wod_block_id);
create index results_org_athlete_idx on public.results (org_id, athlete_id, created_at desc);
-- FK encabezada por athlete_id para el borrado en cascada del atleta.
create index results_athlete_idx on public.results (athlete_id);

create trigger results_touch
  before update on public.results
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Asistencia
-- -----------------------------------------------------------------------------
-- Check-in de un toque en el piso del box. Es la materia prima de la detección
-- de fuga: "no viene hace dos semanas" sale de aquí.
--
-- Todavía sin `class_id`: las clases con cupo y reserva llegan en F3. Cuando
-- lleguen, esa migración añade la columna y afina el único. Hoy la regla del
-- box es más simple y más dura: un atleta se marca UNA vez por día.
-- -----------------------------------------------------------------------------
create table public.attendances (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  date          date not null default current_date,
  status        text not null default 'attended'
                check (status in ('reserved','attended','no_show','cancelled')),
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (org_id, athlete_id, date)
);

create index attendances_org_date_idx on public.attendances (org_id, date desc);
create index attendances_org_athlete_idx on public.attendances (org_id, athlete_id, date desc);
create index attendances_athlete_idx on public.attendances (athlete_id);

-- =============================================================================
-- Helpers de RLS
-- =============================================================================
-- Mismo criterio que en 0001: viven en `private`, que no está expuesto por
-- PostgREST, y son SECURITY DEFINER para no disparar la RLS de `wods` desde
-- dentro de la política de `wod_blocks` (eso sería evaluar la política de otra
-- tabla una vez por fila). Ninguno recibe "de quién": solo preguntan si un WOD
-- está publicado, que por sí solo no revela nada — para llegar al id hay que
-- poder leer la fila, y eso ya lo controla el `org_id in (…)` que los acompaña.
-- =============================================================================

create or replace function private.wod_is_published(p_wod_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wods w
    where w.id = p_wod_id and w.published_at is not null
  )
$$;

create or replace function private.block_is_published(p_block_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wod_blocks b
    join public.wods w on w.id = b.wod_id
    where b.id = p_block_id and w.published_at is not null
  )
$$;

-- El `grant execute on all functions` de 0001 solo alcanzó a las funciones que
-- existían entonces. Las nuevas se conceden explícitamente o toda consulta del
-- atleta falla con "permission denied for function".
grant execute on function private.wod_is_published(uuid)   to authenticated;
grant execute on function private.block_is_published(uuid) to authenticated;
revoke all on function private.wod_is_published(uuid)   from public, anon;
revoke all on function private.block_is_published(uuid) from public, anon;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.wods        enable row level security;
alter table public.wod_blocks  enable row level security;
alter table public.results     enable row level security;
alter table public.attendances enable row level security;

-- ------------------------------------------------------------------- wods ---
create policy "el staff gestiona los WOD de su box"
  on public.wods for all
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()))
  with check (org_id in (select private.auth_staff_org_ids()));

-- El atleta ve los PUBLICADOS de su box. Los borradores de la semana que viene
-- no existen para él.
create policy "el atleta ve los WOD publicados de su box"
  on public.wods for select
  to authenticated
  using (published_at is not null and org_id in (select private.auth_org_ids()));

-- ------------------------------------------------------------- wod_blocks ---
create policy "el staff gestiona los bloques de su box"
  on public.wod_blocks for all
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()))
  with check (org_id in (select private.auth_staff_org_ids()));

create policy "el atleta ve los bloques de un WOD publicado"
  on public.wod_blocks for select
  to authenticated
  using (
    org_id in (select private.auth_org_ids())
    and (select private.wod_is_published(wod_id))
  );

-- ---------------------------------------------------------------- results ---
create policy "el staff gestiona los resultados de su box"
  on public.results for all
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()))
  with check (org_id in (select private.auth_staff_org_ids()));

-- El leaderboard: el atleta ve los resultados de sus compañeros en los bloques
-- ya publicados. Es la mitad de la gracia de venir al box.
create policy "el atleta ve el leaderboard de su box"
  on public.results for select
  to authenticated
  using (
    org_id in (select private.auth_org_ids())
    and (select private.block_is_published(wod_block_id))
  );

-- …pero solo escribe el suyo. `athlete_id = current_athlete_id(org_id)` es lo
-- que impide registrarle a otro un tiempo que no hizo.
create policy "el atleta registra su propio resultado"
  on public.results for insert
  to authenticated
  with check (
    athlete_id = (select private.current_athlete_id(org_id))
    and (select private.block_is_published(wod_block_id))
  );

create policy "el atleta corrige su propio resultado"
  on public.results for update
  to authenticated
  using (athlete_id = (select private.current_athlete_id(org_id)))
  with check (athlete_id = (select private.current_athlete_id(org_id)));

create policy "el atleta borra su propio resultado"
  on public.results for delete
  to authenticated
  using (athlete_id = (select private.current_athlete_id(org_id)));

-- ------------------------------------------------------------ attendances ---
create policy "el staff gestiona la asistencia de su box"
  on public.attendances for all
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()))
  with check (org_id in (select private.auth_staff_org_ids()));

create policy "el atleta ve su propia asistencia"
  on public.attendances for select
  to authenticated
  using (athlete_id = (select private.current_athlete_id(org_id)));

-- =============================================================================
-- Detección automática de PR
-- =============================================================================
-- Si el bloque apunta a un movimiento del catálogo y se puntúa por carga o por
-- tiempo, el resultado ES una marca. El trigger la guarda solo si MEJORA la
-- anterior, y "mejorar" depende del tipo de score:
--
--     load      -> más kilos es mejor   (120 > 115)
--     for_time  -> MENOS segundos es mejor (8:30 < 9:10)
--
-- Espejo exacto de isImprovement() en src/features/performance/format.ts.
--
-- Solo cuenta RX: un Fran escalado a 30 kg no es comparable con uno a 43 kg, y
-- meterlo al histórico de marcas ensuciaría la gráfica de evolución.
-- SECURITY DEFINER porque el atleta no tiene permiso de escribir en
-- personal_records — y no debe tenerlo: sus marcas las pone el sistema o el coach.
-- =============================================================================
create or replace function public.detect_personal_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block    public.wod_blocks%rowtype;
  v_movement public.movements%rowtype;
  v_date     date;
  v_best     numeric;
  v_mejora   boolean;
begin
  if new.value_numeric is null then
    return new;
  end if;

  -- Una marca escalada no entra al histórico.
  if new.scale <> 'rx' then
    return new;
  end if;

  select * into v_block from public.wod_blocks b where b.id = new.wod_block_id;
  if not found or v_block.movement_id is null then
    return new;
  end if;

  if coalesce(v_block.score_type, '') not in ('load', 'for_time') then
    return new;
  end if;

  select * into v_movement from public.movements m where m.id = v_block.movement_id;
  if not found then
    return new;
  end if;

  select w.date into v_date from public.wods w where w.id = v_block.wod_id;

  -- La mejor marca previa del atleta en ese movimiento, en la dirección que
  -- corresponda. Se compara contra TODO el histórico, no solo contra la última:
  -- bajar hoy respecto de ayer pero no respecto del récord no es un PR.
  select case
           when v_block.score_type = 'for_time' then min(pr.value_numeric)
           else max(pr.value_numeric)
         end
    into v_best
  from public.personal_records pr
  where pr.athlete_id = new.athlete_id
    and pr.movement_id = v_block.movement_id
    and pr.reps = 1;

  v_mejora := v_best is null
    or (v_block.score_type = 'for_time' and new.value_numeric < v_best)
    or (v_block.score_type = 'load'     and new.value_numeric > v_best);

  if not v_mejora then
    return new;
  end if;

  -- `on conflict` por el único (athlete_id, movement_id, achieved_on, reps):
  -- si el atleta corrige su resultado el mismo día, se actualiza la marca en
  -- lugar de reventar la transacción.
  insert into public.personal_records
    (org_id, athlete_id, movement_id, value_numeric, unit, reps, achieved_on, source, notes)
  values
    (new.org_id, new.athlete_id, v_block.movement_id, new.value_numeric,
     v_movement.unit, 1, coalesce(v_date, current_date), 'wod_result',
     coalesce(v_block.title, v_movement.name))
  on conflict (athlete_id, movement_id, achieved_on, reps) do update
    set value_numeric = excluded.value_numeric,
        unit          = excluded.unit,
        source        = excluded.source,
        notes         = excluded.notes;

  return new;
end;
$$;

create trigger results_detecta_pr
  after insert or update of value_numeric, scale on public.results
  for each row execute function public.detect_personal_record();

-- =============================================================================
-- Leaderboard
-- =============================================================================
-- SECURITY DEFINER, igual que public.org_team(): el leaderboard necesita el
-- NOMBRE de los compañeros, y la política de `athletes` solo le deja al atleta
-- leerse a sí mismo (ahí viven la cédula, el teléfono y el estado de pago). En
-- vez de abrir esa tabla entera se abre esta ventana estrecha: id, nombre y
-- score del WOD, nada más.
--
-- Como toda función SECURITY DEFINER de este proyecto, NO recibe "de quién":
-- comprueba con auth.uid() que quien llama pertenezca al box del WOD, y que el
-- WOD esté publicado salvo que sea del staff. Sin eso devuelve cero filas —
-- cero y no una excepción, porque esta consulta se repinta sola en la pantalla
-- del atleta y un error ahí rompería la vista del día.
--
-- El orden, que es lo que hay que acertar:
--   1. RX antes que Scaled antes que Principiante — no se comparan peras y manzanas.
--   2. for_time ascendente (8:42 le gana a 9:10).
--   3. amrap / emom / load descendente (más rondas, más kilos).
--   4. Quien lo registró primero rompe el empate.
-- =============================================================================
create or replace function public.leaderboard(p_wod_id uuid)
returns table (
  block_id       uuid,
  block_position int,
  block_title    text,
  score_type     text,
  result_id      uuid,
  athlete_id     uuid,
  athlete_name   text,
  value_numeric  numeric,
  display_value  text,
  scale          text,
  rpe            int,
  rank_overall   int,
  rank_in_scale  int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org       uuid;
  v_published timestamptz;
begin
  select w.org_id, w.published_at into v_org, v_published
  from public.wods w where w.id = p_wod_id;

  if v_org is null then
    return;
  end if;
  if v_org not in (select private.auth_org_ids()) then
    return;
  end if;
  if v_published is null and v_org not in (select private.auth_staff_org_ids()) then
    return;
  end if;

  return query
  select
    b.id,
    b.position,
    coalesce(b.title, b.kind),
    b.score_type,
    r.id,
    r.athlete_id,
    btrim(a.first_name || ' ' || coalesce(a.last_name, '')),
    r.value_numeric,
    r.display_value,
    r.scale,
    r.rpe,
    (rank() over (
      partition by b.id
      order by
        case r.scale when 'rx' then 0 when 'scaled' then 1 else 2 end,
        case when b.score_type = 'for_time' then r.value_numeric end asc nulls last,
        case when b.score_type in ('amrap','emom','load') then r.value_numeric end desc nulls last,
        r.created_at
    ))::int,
    (rank() over (
      partition by b.id, r.scale
      order by
        case when b.score_type = 'for_time' then r.value_numeric end asc nulls last,
        case when b.score_type in ('amrap','emom','load') then r.value_numeric end desc nulls last,
        r.created_at
    ))::int
  from public.wod_blocks b
  join public.results r  on r.wod_block_id = b.id
  join public.athletes a on a.id = r.athlete_id
  where b.wod_id = p_wod_id
  -- Por posición ordinal: `rank_overall` es a la vez columna de salida y nombre
  -- de función de ventana, y nombrarlo aquí sería ambiguo.
  order by 2, 12;
end;
$$;

grant execute on function public.leaderboard(uuid) to authenticated;
revoke all on function public.leaderboard(uuid) from public, anon;

comment on function public.leaderboard is
  'Resultados de un WOD ya ordenados: RX primero, for_time ascendente, el resto descendente.';
