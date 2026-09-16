-- =============================================================================
-- Prueba de la migración del box del entrenador
-- =============================================================================
-- Reconstruye el esquema exacto del prototipo con datos sucios de verdad —los
-- que un box escribe a mano durante meses— y comprueba que la migración no
-- pierde ni deforma nada. Se corre en CI ANTES de tocar datos reales.
-- =============================================================================

begin;

-- --------------------------------------------- el prototipo, tal cual era ---
create table legacy.athletes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  name text not null,
  avatar_url text,
  payment_status text default 'pending',
  cut_day text,
  referral_source text,
  back_squat text, bench_press text, deadlift text, shoulder_press text,
  front_squat text, clean_rm text, push_press text,
  karen text, burpees_100 text, snatch_rm text,
  access_code text
);

create table legacy.athlete_progress (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  athlete_id uuid not null,
  field_name text not null,
  value text not null
);

-- Datos con la suciedad real: nombres compuestos, unidades escritas a mano,
-- comas decimales, tiempos en dos formatos, celdas vacías y días de corte raros.
insert into legacy.athletes
  (id, created_at, name, payment_status, cut_day, referral_source,
   back_squat, bench_press, deadlift, karen, burpees_100, snatch_rm, access_code)
values
  ('aa000000-0000-4000-8000-000000000001', '2024-03-01', 'Ana Restrepo',        'active',  '05', 'Instagram',
   '120',      '60',    '140',  '8:30',    '7:15',  '75',  'AR-1234'),
  ('aa000000-0000-4000-8000-000000000002', '2024-06-15', 'Juan Carlos Pérez Gómez', 'pending', '15', 'Referido',
   '120 kg',   '85,5',  '',     '1:02:30', 'n/a',   null,  'JC-5678'),
  ('aa000000-0000-4000-8000-000000000003', '2025-01-20', 'Zulma',              'active',  '',   null,
   '  95  ',   null,    '110',  '',        '9:05',  '55',  'ZU-9012'),
  ('aa000000-0000-4000-8000-000000000004', '2025-05-10', 'Pedro Gómez',        'pending', '35', 'Google',
   'muchos',   '70',    '150',  '-',       '6:40',  '80',  'PG-3456');

insert into legacy.athlete_progress (athlete_id, field_name, value, created_at) values
  ('aa000000-0000-4000-8000-000000000001', 'back_squat', '110', '2024-06-01'),
  ('aa000000-0000-4000-8000-000000000001', 'back_squat', '115', '2024-10-01'),
  ('aa000000-0000-4000-8000-000000000001', 'karen',      '9:10', '2024-06-01'),
  ('aa000000-0000-4000-8000-000000000002', 'back_squat', 'ilegible', '2024-09-01');

-- ------------------------------------------------------------- utilidades ---
create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not cond then raise exception 'FALLO [%]', label; end if;
  raise notice '  ok · %', label;
end $$;

-- ------------------------------------------------------------- migración ----
create temp table resultado as
  select * from legacy.migrate_box('box-entrenador', 'Box del Entrenador');

do $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'box-entrenador';

  perform pg_temp.chk(v_org is not null, 'se creó el box');

  -- Nadie se queda por fuera
  perform pg_temp.chk(
    (select count(*) from public.athletes where org_id = v_org) = 4,
    'migran los 4 atletas, ninguno se pierde');

  -- Nombres compuestos: "Juan Carlos Pérez Gómez" no se puede partir bien
  -- automáticamente, pero NO se puede perder el resto del nombre.
  perform pg_temp.chk(
    (select last_name from public.athletes where id = 'aa000000-0000-4000-8000-000000000002')
      = 'Carlos Pérez Gómez',
    'el apellido compuesto se conserva entero');
  perform pg_temp.chk(
    (select last_name from public.athletes where id = 'aa000000-0000-4000-8000-000000000003') is null,
    'un nombre de una sola palabra no inventa apellido');

  -- Estado de pago
  perform pg_temp.chk(
    (select status from public.athletes where id = 'aa000000-0000-4000-8000-000000000001') = 'active',
    'payment_status active -> atleta activo');
  perform pg_temp.chk(
    (select status from public.athletes where id = 'aa000000-0000-4000-8000-000000000002') = 'overdue',
    'payment_status pending -> atleta en mora');

  -- Fechas de corte, incluidos los valores imposibles
  perform pg_temp.chk(
    (select billing_day from public.subscriptions where athlete_id = 'aa000000-0000-4000-8000-000000000001') = 5,
    'cut_day "05" -> día de corte 5');
  perform pg_temp.chk(
    (select billing_day from public.subscriptions where athlete_id = 'aa000000-0000-4000-8000-000000000003') = 1,
    'cut_day vacío -> día 1, sin romper la migración');
  perform pg_temp.chk(
    (select billing_day from public.subscriptions where athlete_id = 'aa000000-0000-4000-8000-000000000004') = 31,
    'cut_day "35" -> se recorta a 31');

  -- Conversión de tiempos: lo que más se puede deformar
  perform pg_temp.chk(
    (select value_numeric from public.personal_records pr
     join public.movements m on m.id = pr.movement_id
     where pr.athlete_id = 'aa000000-0000-4000-8000-000000000001'
       and m.legacy_key = 'karen' and pr.achieved_on = '2024-10-01') = 510,
    'Karen "8:30" -> 510 segundos');
  perform pg_temp.chk(
    (select value_numeric from public.personal_records pr
     join public.movements m on m.id = pr.movement_id
     where pr.athlete_id = 'aa000000-0000-4000-8000-000000000002'
       and m.legacy_key = 'karen') = 3750,
    'Karen "1:02:30" -> 3750 segundos');

  -- Conversión de pesos escritos a mano
  perform pg_temp.chk(
    (select value_numeric from public.personal_records pr
     join public.movements m on m.id = pr.movement_id
     where pr.athlete_id = 'aa000000-0000-4000-8000-000000000002'
       and m.legacy_key = 'back_squat') = 120,
    '"120 kg" -> 120');
  perform pg_temp.chk(
    (select value_numeric from public.personal_records pr
     join public.movements m on m.id = pr.movement_id
     where pr.athlete_id = 'aa000000-0000-4000-8000-000000000002'
       and m.legacy_key = 'bench_press') = 85.5,
    '"85,5" con coma decimal -> 85.5');
  perform pg_temp.chk(
    (select value_numeric from public.personal_records pr
     join public.movements m on m.id = pr.movement_id
     where pr.athlete_id = 'aa000000-0000-4000-8000-000000000003'
       and m.legacy_key = 'back_squat') = 95,
    '"  95  " con espacios -> 95');

  -- Basura descartada, no convertida en un cero que arruinaría las gráficas
  perform pg_temp.chk(
    not exists (
      select 1 from public.personal_records pr
      join public.movements m on m.id = pr.movement_id
      where pr.athlete_id = 'aa000000-0000-4000-8000-000000000004'
        and m.legacy_key = 'back_squat'),
    '"muchos" se descarta en vez de guardarse como 0');
  perform pg_temp.chk(
    not exists (
      select 1 from public.personal_records pr
      join public.movements m on m.id = pr.movement_id
      where pr.athlete_id = 'aa000000-0000-4000-8000-000000000002'
        and m.legacy_key = 'burpees_100'),
    '"n/a" se descarta');

  -- El histórico se conserva: la evolución del back squat de Ana es real
  perform pg_temp.chk(
    (select count(*) from public.personal_records pr
     join public.movements m on m.id = pr.movement_id
     where pr.athlete_id = 'aa000000-0000-4000-8000-000000000001'
       and m.legacy_key = 'back_squat') = 3,
    'se conservan las 3 marcas de back squat de Ana (110, 115, 120)');
  perform pg_temp.chk(
    (select array_agg(pr.value_numeric order by pr.achieved_on) from public.personal_records pr
     join public.movements m on m.id = pr.movement_id
     where pr.athlete_id = 'aa000000-0000-4000-8000-000000000001'
       and m.legacy_key = 'back_squat') = array[110,115,120]::numeric[],
    'la evolución queda en orden cronológico correcto');

  -- La marca actual va DESPUÉS del histórico, no encima: si colisionara en
  -- fecha, el on conflict la descartaría y el atleta perdería su mejor marca.
  perform pg_temp.chk(
    (select max(achieved_on) from public.personal_records pr
     join public.movements m on m.id = pr.movement_id
     where pr.athlete_id = 'aa000000-0000-4000-8000-000000000001'
       and m.legacy_key = 'back_squat') = '2024-10-02',
    'la marca actual se fecha justo después del último histórico');
  perform pg_temp.chk(
    (select max(achieved_on) from public.personal_records pr
     join public.movements m on m.id = pr.movement_id
     where pr.athlete_id = 'aa000000-0000-4000-8000-000000000001'
       and m.legacy_key = 'back_squat') <> current_date,
    'la marca actual no inventa la fecha de hoy');

  -- Si la marca actual ya está en el histórico, no se duplica.
  perform pg_temp.chk(
    (select count(*) from public.personal_records pr
     join public.movements m on m.id = pr.movement_id
     where pr.athlete_id = 'aa000000-0000-4000-8000-000000000001'
       and m.legacy_key = 'karen') = 2,
    'Karen: histórico (9:10) + actual (8:30), sin duplicar');

  -- Y el recuento de lo ilegible se reporta para revisarlo a mano
  perform pg_temp.chk(
    (select cantidad from resultado where concepto like 'valores de marca ilegibles%') = 1,
    'la migración reporta el valor ilegible para revisión manual');
end $$;

-- ------------------------------------------------------------ idempotencia ---
do $$
declare antes bigint; despues bigint;
begin
  select count(*) into antes from public.personal_records;
  perform legacy.migrate_box('box-entrenador', 'Box del Entrenador');
  select count(*) into despues from public.personal_records;
  perform pg_temp.chk(antes = despues, 'correr la migración dos veces no duplica nada');
end $$;

-- ------------------------------------------------- nada se pierde en legacy --
do $$ begin
  perform pg_temp.chk(
    (select count(*) from legacy.athletes) = 4,
    'los datos del prototipo siguen intactos en legacy');
end $$;

rollback;

select 'MIGRACIÓN BOX 0 OK' as resultado;
