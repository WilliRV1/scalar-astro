-- =============================================================================
-- Prueba del módulo de entrenamiento
-- =============================================================================
-- Aquí se comprueban las cuatro cosas que, si fallan, el box se da cuenta el
-- mismo día:
--
--   · Un atleta ve el WOD de mañana antes de tiempo (o el de otro box).
--   · Un atleta le registra un tiempo a otro.
--   · El leaderboard sale al revés porque en `for_time` menos es mejor.
--   · El PR no se detecta, o se detecta cuando el atleta EMPEORÓ.
--
-- Se ejecuta en CI contra una base recién migrada. Cualquier fallo levanta una
-- excepción y aborta con código distinto de 0.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- semilla ---
insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000001', 'coach@boxnorte.co'),
  ('d0000000-0000-4000-8000-000000000002', 'ana@boxnorte.co'),
  ('d0000000-0000-4000-8000-000000000003', 'beto@boxnorte.co'),
  ('d0000000-0000-4000-8000-000000000004', 'coach@boxsur.co'),
  ('d0000000-0000-4000-8000-000000000005', 'caro@boxsur.co');

insert into public.organizations (id, slug, name) values
  ('0d000000-0000-4000-8000-000000000001', 'box-norte', 'Box Norte'),
  ('0d000000-0000-4000-8000-000000000002', 'box-sur',   'Box Sur');

insert into public.athletes (id, org_id, first_name, last_name) values
  ('a0000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001', 'Ana',  'Norte'),
  ('a0000000-0000-4000-8000-000000000002', '0d000000-0000-4000-8000-000000000001', 'Beto', 'Norte'),
  ('a0000000-0000-4000-8000-000000000003', '0d000000-0000-4000-8000-000000000001', 'Dani', 'Norte'),
  ('a0000000-0000-4000-8000-000000000004', '0d000000-0000-4000-8000-000000000002', 'Caro', 'Sur');

insert into public.memberships (org_id, user_id, role, athlete_id) values
  ('0d000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'coach',   null),
  ('0d000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'athlete', 'a0000000-0000-4000-8000-000000000001'),
  ('0d000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'athlete', 'a0000000-0000-4000-8000-000000000002'),
  ('0d000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000004', 'coach',   null),
  ('0d000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000005', 'athlete', 'a0000000-0000-4000-8000-000000000004');

-- El WOD de hoy, publicado, con dos bloques puntuables contra el catálogo.
insert into public.wods (id, org_id, date, title, published_at, created_by) values
  ('90000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001',
   '2026-09-17', 'WOD del día', '2026-09-17 11:00:00+00', 'd0000000-0000-4000-8000-000000000001'),
  -- Mañana. Todavía borrador: el atleta NO lo puede ver.
  ('90000000-0000-4000-8000-000000000002', '0d000000-0000-4000-8000-000000000001',
   '2026-09-18', 'Mañana', null, 'd0000000-0000-4000-8000-000000000001'),
  -- Publicado, pero del otro box.
  ('90000000-0000-4000-8000-000000000003', '0d000000-0000-4000-8000-000000000002',
   '2026-09-17', 'WOD del Sur', '2026-09-17 11:00:00+00', 'd0000000-0000-4000-8000-000000000004');

insert into public.wod_blocks (id, org_id, wod_id, position, kind, title, description, score_type, movement_id) values
  ('b0000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001',
   '90000000-0000-4000-8000-000000000001', 1, 'metcon', 'Fran',
   '21-15-9 Thrusters 43kg / Pull-ups', 'for_time',
   (select id from public.movements where name = 'Fran' and org_id is null)),
  ('b0000000-0000-4000-8000-000000000002', '0d000000-0000-4000-8000-000000000001',
   '90000000-0000-4000-8000-000000000001', 0, 'strength', 'Back Squat',
   '5-5-5, sube hasta el máximo del día', 'load',
   (select id from public.movements where name = 'Back Squat' and org_id is null)),
  ('b0000000-0000-4000-8000-000000000003', '0d000000-0000-4000-8000-000000000001',
   '90000000-0000-4000-8000-000000000002', 1, 'metcon', 'Karen',
   '150 Wall Balls', 'for_time',
   (select id from public.movements where name = 'Karen' and org_id is null)),
  ('b0000000-0000-4000-8000-000000000004', '0d000000-0000-4000-8000-000000000002',
   '90000000-0000-4000-8000-000000000003', 1, 'metcon', 'Helen', '3 rondas', 'for_time', null);

-- Marcas previas. Son la referencia contra la que el trigger decide si hay PR.
insert into public.personal_records (org_id, athlete_id, movement_id, value_numeric, unit, achieved_on, source) values
  -- Ana: Fran en 9:00 (540 s) y Back Squat en 95 kg. Hoy va a mejorar las dos.
  ('0d000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   (select id from public.movements where name = 'Fran' and org_id is null), 540, 'sec', '2026-01-10', 'manual'),
  ('0d000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   (select id from public.movements where name = 'Back Squat' and org_id is null), 95, 'kg', '2026-01-10', 'manual'),
  -- Beto: Fran en 8:00 (480 s) y Back Squat en 130 kg. Hoy le va a ir PEOR.
  ('0d000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   (select id from public.movements where name = 'Fran' and org_id is null), 480, 'sec', '2026-01-10', 'manual'),
  ('0d000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   (select id from public.movements where name = 'Back Squat' and org_id is null), 130, 'kg', '2026-01-10', 'manual');

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

/** Cuenta la marca de un atleta en un movimiento, por nombre del movimiento. */
create or replace function pg_temp.pr_count(p_athlete uuid, p_movement text)
returns bigint language sql as $$
  select count(*) from public.personal_records pr
  join public.movements m on m.id = pr.movement_id
  where pr.athlete_id = p_athlete and m.name = p_movement and m.org_id is null
$$;

set session role authenticated;

-- ============================ 1 · Qué ve el atleta ==========================
set request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000002';  -- Ana, Box Norte
do $$ begin
  perform pg_temp.chk(
    exists (select 1 from public.wods where id = '90000000-0000-4000-8000-000000000001'),
    'el atleta SÍ ve el WOD publicado de su box');
  perform pg_temp.chk(
    not exists (select 1 from public.wods where id = '90000000-0000-4000-8000-000000000002'),
    'el atleta NO ve un WOD sin publicar de su box');
  perform pg_temp.chk(
    not exists (select 1 from public.wods where id = '90000000-0000-4000-8000-000000000003'),
    'el atleta NUNCA ve el WOD de otro box, aunque esté publicado');
  perform pg_temp.chk(
    (select count(*) from public.wods) = 1,
    'en total el atleta ve exactamente un WOD: el publicado de su box');

  perform pg_temp.chk(
    (select count(*) from public.wod_blocks
     where wod_id = '90000000-0000-4000-8000-000000000001') = 2,
    'el atleta ve los 2 bloques del WOD publicado');
  perform pg_temp.chk(
    (select count(*) from public.wod_blocks
     where wod_id = '90000000-0000-4000-8000-000000000002') = 0,
    'el atleta NO ve los bloques de un WOD sin publicar');
  perform pg_temp.chk(
    (select count(*) from public.wod_blocks) = 2,
    'y no se le cuela ningún bloque del otro box');
end $$;

-- ============================ 2 · El atleta escribe lo SUYO =================
do $$ begin
  -- Fran en 8:42 = 522 s. Mejora sus 9:00 anteriores.
  insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, display_value, scale, rpe, logged_by)
  values ('0d000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
          'a0000000-0000-4000-8000-000000000001', 522, '8:42', 'rx', 9, 'athlete');
  -- Back Squat 100 kg. Mejora sus 95 kg.
  insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, display_value, scale, logged_by)
  values ('0d000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
          'a0000000-0000-4000-8000-000000000001', 100, '100 kg', 'rx', 'athlete');

  perform pg_temp.chk(
    (select count(*) from public.results
     where athlete_id = 'a0000000-0000-4000-8000-000000000001') = 2,
    'el atleta registra sus propios resultados');
end $$;

-- ============================ 3 · Lo que NO puede hacer =====================
do $$
declare v_fallo boolean := false;
begin
  -- Registrarle un tiempo a otro atleta del box.
  begin
    insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, scale)
    values ('0d000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000002', 400, 'rx');
  exception when others then v_fallo := true;
  end;
  perform pg_temp.chk(v_fallo,
    'el atleta NO puede registrar el resultado de otro atleta');

  -- Dos resultados en el mismo bloque.
  v_fallo := false;
  begin
    insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, scale)
    values ('0d000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000001', 480, 'rx');
  exception when others then v_fallo := true;
  end;
  perform pg_temp.chk(v_fallo,
    'un atleta NO puede registrar dos resultados en el mismo bloque');

  -- Adelantarse al WOD de mañana, que todavía es borrador.
  v_fallo := false;
  begin
    insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, scale)
    values ('0d000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003',
            'a0000000-0000-4000-8000-000000000001', 600, 'rx');
  exception when others then v_fallo := true;
  end;
  perform pg_temp.chk(v_fallo,
    'el atleta NO puede registrar resultado en un bloque sin publicar');

  -- Meterle mano al WOD.
  v_fallo := false;
  begin
    update public.wods set title = 'Yo mando' where id = '90000000-0000-4000-8000-000000000001';
    v_fallo := not found;
  exception when others then v_fallo := true;
  end;
  perform pg_temp.chk(v_fallo, 'el atleta NO puede editar el WOD');
end $$;

-- La pantalla del atleta guarda con UPSERT sobre (wod_block_id, athlete_id):
-- registrar y corregir son el mismo botón. Eso exige política de insert Y de
-- update, así que se prueba tal cual lo hace la aplicación.
do $$ begin
  insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, display_value, scale, logged_by)
  values ('0d000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
          'a0000000-0000-4000-8000-000000000001', 522, '8:42', 'rx', 'athlete')
  on conflict (wod_block_id, athlete_id) do update
    set value_numeric = excluded.value_numeric,
        display_value = excluded.display_value,
        scale         = excluded.scale;

  perform pg_temp.chk(
    (select display_value from public.results
      where wod_block_id = 'b0000000-0000-4000-8000-000000000001'
        and athlete_id = 'a0000000-0000-4000-8000-000000000001') = '8:42',
    'el atleta corrige su propio resultado con el mismo botón (upsert)');
end $$;

-- ============================ 4 · El coach registra por los demás ===========
set request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';  -- coach del Norte
do $$ begin
  -- Beto: Fran en 9:10 (550 s) — PEOR que sus 8:00. Back Squat 110 — PEOR que 130.
  insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, display_value, scale, logged_by) values
    ('0d000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000002', 550, '9:10', 'rx', 'coach'),
    ('0d000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
     'a0000000-0000-4000-8000-000000000002', 110, '110 kg', 'rx', 'coach'),
    -- Dani hizo Fran ESCALADO en 6:40 (400 s): el mejor tiempo del tablero, pero
    -- va después de todos los RX y no le cuenta como marca.
    ('0d000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000003', 400, '6:40', 'scaled', 'coach');

  perform pg_temp.chk((select count(*) from public.results) = 5,
    'el coach ve y registra los resultados de todo su box');
end $$;

-- Ya existiendo el resultado de Beto, se comprueba que Ana no lo pueda tocar.
-- (Antes el UPDATE habría afectado 0 filas por no existir, no por la RLS.)
set request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000002';  -- Ana
do $$
declare v_tocadas int;
begin
  update public.results set value_numeric = 1
   where athlete_id = 'a0000000-0000-4000-8000-000000000002';
  get diagnostics v_tocadas = row_count;

  perform pg_temp.chk(v_tocadas = 0,
    'el atleta NO puede corregir el resultado de otro');
  perform pg_temp.chk(
    (select value_numeric from public.results
      where wod_block_id = 'b0000000-0000-4000-8000-000000000001'
        and athlete_id = 'a0000000-0000-4000-8000-000000000002') = 550,
    'y el tiempo de Beto sigue intacto');
end $$;

set request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';  -- coach otra vez

-- ============================ 5 · Leaderboard ===============================
do $$
declare v_primero uuid; v_segundo uuid; v_tercero uuid;
begin
  -- for_time: MENOS es mejor.
  select l.athlete_id into v_primero from public.leaderboard('90000000-0000-4000-8000-000000000001') l
   where l.block_id = 'b0000000-0000-4000-8000-000000000001' and l.rank_overall = 1;
  select l.athlete_id into v_segundo from public.leaderboard('90000000-0000-4000-8000-000000000001') l
   where l.block_id = 'b0000000-0000-4000-8000-000000000001' and l.rank_overall = 2;
  select l.athlete_id into v_tercero from public.leaderboard('90000000-0000-4000-8000-000000000001') l
   where l.block_id = 'b0000000-0000-4000-8000-000000000001' and l.rank_overall = 3;

  perform pg_temp.chk(v_primero = 'a0000000-0000-4000-8000-000000000001',
    'en for_time gana el tiempo MENOR: Ana 8:42 antes que Beto 9:10');
  perform pg_temp.chk(v_segundo = 'a0000000-0000-4000-8000-000000000002',
    'y el segundo es Beto');
  perform pg_temp.chk(v_tercero = 'a0000000-0000-4000-8000-000000000003',
    'el 6:40 ESCALADO de Dani va después de todos los RX, aunque sea el mejor tiempo');
  perform pg_temp.chk(
    (select l.rank_in_scale from public.leaderboard('90000000-0000-4000-8000-000000000001') l
      where l.athlete_id = 'a0000000-0000-4000-8000-000000000003') = 1,
    'pero Dani sí es primero dentro de su propia escala');

  -- load: MÁS es mejor.
  select l.athlete_id into v_primero from public.leaderboard('90000000-0000-4000-8000-000000000001') l
   where l.block_id = 'b0000000-0000-4000-8000-000000000002' and l.rank_overall = 1;
  select l.athlete_id into v_segundo from public.leaderboard('90000000-0000-4000-8000-000000000001') l
   where l.block_id = 'b0000000-0000-4000-8000-000000000002' and l.rank_overall = 2;

  perform pg_temp.chk(v_primero = 'a0000000-0000-4000-8000-000000000002',
    'en load gana la carga MAYOR: Beto 110 kg antes que Ana 100 kg');
  perform pg_temp.chk(v_segundo = 'a0000000-0000-4000-8000-000000000001',
    'y Ana queda segunda con sus 100 kg');

  -- El nombre sale del leaderboard aunque la política de athletes no deje
  -- leerse entre compañeros: es justo para lo que la función es SECURITY DEFINER.
  perform pg_temp.chk(
    (select l.athlete_name from public.leaderboard('90000000-0000-4000-8000-000000000001') l
      where l.athlete_id = 'a0000000-0000-4000-8000-000000000002' limit 1) = 'Beto Norte',
    'el leaderboard trae el nombre del atleta');

  -- Los bloques salen en orden de programación (fuerza position 0, metcon 1).
  perform pg_temp.chk(
    (select l.block_id from public.leaderboard('90000000-0000-4000-8000-000000000001') l limit 1)
      = 'b0000000-0000-4000-8000-000000000002',
    'los bloques del leaderboard salen en el orden en que se programaron');
end $$;

-- El atleta también lo ve, y lo ve completo.
set request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000002';  -- Ana
do $$ begin
  perform pg_temp.chk(
    (select count(*) from public.leaderboard('90000000-0000-4000-8000-000000000001')) = 5,
    'el atleta ve el leaderboard completo del día');
  perform pg_temp.chk(
    (select count(*) from public.leaderboard('90000000-0000-4000-8000-000000000002')) = 0,
    'pero no hay leaderboard de un WOD sin publicar');
end $$;

set request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000005';  -- Caro, Box Sur
do $$ begin
  perform pg_temp.chk(
    (select count(*) from public.leaderboard('90000000-0000-4000-8000-000000000001')) = 0,
    'el atleta de otro box no obtiene NADA del leaderboard del Norte');
end $$;

-- ============================ 6 · Detección de PR ===========================
set request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';  -- coach
do $$ begin
  -- Carga: Ana subió de 95 a 100 kg.
  perform pg_temp.chk(
    exists (select 1 from public.personal_records pr
            join public.movements m on m.id = pr.movement_id
            where pr.athlete_id = 'a0000000-0000-4000-8000-000000000001'
              and m.name = 'Back Squat' and pr.value_numeric = 100
              and pr.source = 'wod_result' and pr.achieved_on = '2026-09-17'),
    'en carga, SUBIR crea el PR: Ana pasa de 95 a 100 kg sin escribir nada');

  -- Tiempo: Ana bajó de 9:00 a 8:42.
  perform pg_temp.chk(
    exists (select 1 from public.personal_records pr
            join public.movements m on m.id = pr.movement_id
            where pr.athlete_id = 'a0000000-0000-4000-8000-000000000001'
              and m.name = 'Fran' and pr.value_numeric = 522
              and pr.source = 'wod_result'),
    'en tiempo, BAJAR crea el PR: Ana pasa de 9:00 a 8:42');

  -- Beto empeoró en las dos. No se le inventa ninguna marca.
  perform pg_temp.chk(
    pg_temp.pr_count('a0000000-0000-4000-8000-000000000002', 'Fran') = 1,
    'en tiempo, SUBIR no crea PR: el 9:10 de Beto no toca su 8:00');
  perform pg_temp.chk(
    pg_temp.pr_count('a0000000-0000-4000-8000-000000000002', 'Back Squat') = 1,
    'en carga, bajar no crea PR: los 110 kg de Beto no tocan sus 130 kg');

  -- Dani hizo el mejor tiempo del día, pero escalado.
  perform pg_temp.chk(
    pg_temp.pr_count('a0000000-0000-4000-8000-000000000003', 'Fran') = 0,
    'un resultado ESCALADO no entra al histórico de marcas');

  -- Un bloque sin movimiento del catálogo no puede alimentar ninguna marca.
  perform pg_temp.chk(
    (select count(*) from public.personal_records
      where org_id = '0d000000-0000-4000-8000-000000000002') = 0,
    'un bloque sin movimiento asociado no genera marcas');
end $$;

-- Corregir el resultado a la baja tampoco borra ni empeora la marca.
do $$
declare v_marcas bigint;
begin
  update public.results set value_numeric = 600, display_value = '10:00'
   where wod_block_id = 'b0000000-0000-4000-8000-000000000001'
     and athlete_id = 'a0000000-0000-4000-8000-000000000001';

  select pg_temp.pr_count('a0000000-0000-4000-8000-000000000001', 'Fran') into v_marcas;
  perform pg_temp.chk(v_marcas = 2,
    'corregir un resultado a peor no añade una marca nueva');
  perform pg_temp.chk(
    (select min(pr.value_numeric) from public.personal_records pr
      join public.movements m on m.id = pr.movement_id
      where pr.athlete_id = 'a0000000-0000-4000-8000-000000000001' and m.name = 'Fran') = 522,
    'y el récord de 8:42 sigue en pie');

  -- Volver a bajarlo, esta vez por debajo: se actualiza la marca del día en
  -- lugar de chocar contra el único (atleta, movimiento, fecha, reps).
  update public.results set value_numeric = 500, display_value = '8:20'
   where wod_block_id = 'b0000000-0000-4000-8000-000000000001'
     and athlete_id = 'a0000000-0000-4000-8000-000000000001';

  perform pg_temp.chk(
    pg_temp.pr_count('a0000000-0000-4000-8000-000000000001', 'Fran') = 2,
    'corregir el mismo día actualiza la marca, no la duplica');
  perform pg_temp.chk(
    (select min(pr.value_numeric) from public.personal_records pr
      join public.movements m on m.id = pr.movement_id
      where pr.athlete_id = 'a0000000-0000-4000-8000-000000000001' and m.name = 'Fran') = 500,
    'y el récord baja a 8:20');
end $$;

-- ============================ 7 · Asistencia ================================
do $$
declare v_fallo boolean := false;
begin
  insert into public.attendances (org_id, athlete_id, date, checked_in_by) values
    ('0d000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
     '2026-09-17', 'd0000000-0000-4000-8000-000000000001'),
    ('0d000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
     '2026-09-17', 'd0000000-0000-4000-8000-000000000001');

  perform pg_temp.chk(
    (select count(*) from public.attendances where date = '2026-09-17') = 2,
    'el coach marca la asistencia del día de un toque');

  begin
    insert into public.attendances (org_id, athlete_id, date)
    values ('0d000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '2026-09-17');
  exception when others then v_fallo := true;
  end;
  perform pg_temp.chk(v_fallo,
    'NO se puede marcar dos veces al mismo atleta el mismo día');

  -- Otro día sí, claro.
  insert into public.attendances (org_id, athlete_id, date)
  values ('0d000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '2026-09-18');
  perform pg_temp.chk(
    (select count(*) from public.attendances
      where athlete_id = 'a0000000-0000-4000-8000-000000000001') = 2,
    'pero sí al día siguiente');
end $$;

set request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000002';  -- Ana
do $$ begin
  perform pg_temp.chk(
    (select count(*) from public.attendances) = 2,
    'el atleta ve su propia asistencia y solo la suya');
end $$;

-- ============================ 8 · Aislamiento entre boxes ===================
set request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000004';  -- coach del Sur
do $$ begin
  perform pg_temp.chk((select count(*) from public.wods) = 1,
    'el coach del Sur solo ve el WOD de su box');
  perform pg_temp.chk((select count(*) from public.wod_blocks) = 1,
    'el coach del Sur solo ve los bloques de su box');
  perform pg_temp.chk((select count(*) from public.results) = 0,
    'el coach del Sur no ve ni un resultado del Norte');
  perform pg_temp.chk((select count(*) from public.attendances) = 0,
    'el coach del Sur no ve la asistencia del Norte');
end $$;

do $$
declare v_fallo boolean := false;
begin
  -- Ni escribiendo con el org_id del otro box.
  begin
    insert into public.wods (org_id, date, title)
    values ('0d000000-0000-4000-8000-000000000001', '2026-09-19', 'Colado');
    v_fallo := false;
  exception when others then v_fallo := true;
  end;
  perform pg_temp.chk(v_fallo,
    'el coach del Sur no puede crear un WOD en el box del Norte');

  v_fallo := false;
  begin
    insert into public.attendances (org_id, athlete_id, date)
    values ('0d000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '2026-09-19');
  exception when others then v_fallo := true;
  end;
  perform pg_temp.chk(v_fallo,
    'ni marcarle asistencia a un atleta del Norte');
end $$;

reset role;
rollback;

select 'ENTRENAMIENTO OK' as resultado;
