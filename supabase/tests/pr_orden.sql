-- Prueba de que el récord no depende del orden de llegada de los resultados.
-- Lo que se protege es la gráfica de evolución del atleta, que es la pantalla
-- que hace que el atleta abra la aplicación por su cuenta.

begin;

create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then
    raise exception 'FALLO [%] (la condición dio %)', label, coalesce(cond::text, 'NULL');
  end if;
  raise notice '  ok · %', label;
end $$;

insert into public.organizations (id, slug, name, status)
values ('0b000000-0000-4000-8000-00000000000a', 'box-pr', 'Box PR', 'active');

insert into public.athletes (id, org_id, first_name)
values ('ab000000-0000-4000-8000-00000000000a', '0b000000-0000-4000-8000-00000000000a', 'Karen');

-- Un movimiento de tiempo (menos es mejor) y uno de carga (más es mejor).
insert into public.movements (id, org_id, name, category, metric, unit, is_benchmark)
values
  ('cb000000-0000-4000-8000-00000000000a', '0b000000-0000-4000-8000-00000000000a',
   'Benchmark Tiempo', 'benchmark', 'time', 'sec', true),
  ('cb000000-0000-4000-8000-00000000000b', '0b000000-0000-4000-8000-00000000000a',
   'Levantamiento Carga', 'weightlifting', 'weight', 'kg', false);

-- Dos WOD: uno de hace dos meses y uno de ayer.
insert into public.wods (id, org_id, date, title, published_at) values
  ('db000000-0000-4000-8000-00000000000a', '0b000000-0000-4000-8000-00000000000a',
   current_date - 60, 'Viejo', now()),
  ('db000000-0000-4000-8000-00000000000b', '0b000000-0000-4000-8000-00000000000a',
   current_date - 1, 'Reciente', now());

insert into public.wod_blocks (id, org_id, wod_id, position, kind, description, score_type, movement_id) values
  ('eb000000-0000-4000-8000-00000000000a', '0b000000-0000-4000-8000-00000000000a',
   'db000000-0000-4000-8000-00000000000a', 1, 'metcon', 'Viejo tiempo', 'for_time',
   'cb000000-0000-4000-8000-00000000000a'),
  ('eb000000-0000-4000-8000-00000000000b', '0b000000-0000-4000-8000-00000000000a',
   'db000000-0000-4000-8000-00000000000b', 1, 'metcon', 'Reciente tiempo', 'for_time',
   'cb000000-0000-4000-8000-00000000000a'),
  ('eb000000-0000-4000-8000-00000000000c', '0b000000-0000-4000-8000-00000000000a',
   'db000000-0000-4000-8000-00000000000a', 2, 'strength', 'Viejo carga', 'load',
   'cb000000-0000-4000-8000-00000000000b'),
  ('eb000000-0000-4000-8000-00000000000d', '0b000000-0000-4000-8000-00000000000a',
   'db000000-0000-4000-8000-00000000000b', 2, 'strength', 'Reciente carga', 'load',
   'cb000000-0000-4000-8000-00000000000b');

-- ============ 1 · Tiempo, llegando AL REVÉS =================================
-- Primero el resultado de ayer (510 s), después el de hace dos meses (480 s,
-- mejor). Es lo que pasa cuando el coach captura la semana pasada después de
-- haber capturado hoy.
do $$ begin
  insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, scale)
  values ('0b000000-0000-4000-8000-00000000000a', 'eb000000-0000-4000-8000-00000000000b',
          'ab000000-0000-4000-8000-00000000000a', 510, 'rx');

  insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, scale)
  values ('0b000000-0000-4000-8000-00000000000a', 'eb000000-0000-4000-8000-00000000000a',
          'ab000000-0000-4000-8000-00000000000a', 480, 'rx');

  -- El de ayer nunca fue récord: hace dos meses ya había hecho 480.
  perform pg_temp.chk(
    (select count(*) from public.personal_records
     where athlete_id = 'ab000000-0000-4000-8000-00000000000a'
       and movement_id = 'cb000000-0000-4000-8000-00000000000a') = 1,
    'un resultado viejo y mejor borra el "récord" posterior que nunca lo fue');

  perform pg_temp.chk(
    (select value_numeric from public.personal_records
     where athlete_id = 'ab000000-0000-4000-8000-00000000000a'
       and movement_id = 'cb000000-0000-4000-8000-00000000000a') = 480,
    'y el récord que queda es el bueno');
end $$;

-- ============ 2 · Carga, llegando AL REVÉS ==================================
do $$ begin
  -- Ayer 100 kg; hace dos meses 120 kg (mejor).
  insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, scale)
  values ('0b000000-0000-4000-8000-00000000000a', 'eb000000-0000-4000-8000-00000000000d',
          'ab000000-0000-4000-8000-00000000000a', 100, 'rx');

  insert into public.results (org_id, wod_block_id, athlete_id, value_numeric, scale)
  values ('0b000000-0000-4000-8000-00000000000a', 'eb000000-0000-4000-8000-00000000000c',
          'ab000000-0000-4000-8000-00000000000a', 120, 'rx');

  perform pg_temp.chk(
    (select count(*) from public.personal_records
     where athlete_id = 'ab000000-0000-4000-8000-00000000000a'
       and movement_id = 'cb000000-0000-4000-8000-00000000000b') = 1,
    'en carga pasa lo mismo y también se limpia');
end $$;

-- ============ 3 · La gráfica nunca empeora ==================================
do $$
declare retrocesos int;
begin
  select count(*) into retrocesos
  from (
    select pr.value_numeric,
           lag(pr.value_numeric) over (order by pr.achieved_on) as anterior
    from public.personal_records pr
    where pr.athlete_id = 'ab000000-0000-4000-8000-00000000000a'
      and pr.movement_id = 'cb000000-0000-4000-8000-00000000000a'
  ) s
  where anterior is not null and s.value_numeric > s.anterior;   -- en tiempo, subir es empeorar

  perform pg_temp.chk(retrocesos = 0,
    'la evolución del atleta no muestra un retroceso que no ocurrió');
end $$;

-- ============ 4 · Lo escrito a mano no se toca ==============================
do $$ begin
  insert into public.personal_records
    (org_id, athlete_id, movement_id, value_numeric, unit, achieved_on, source)
  values ('0b000000-0000-4000-8000-00000000000a', 'ab000000-0000-4000-8000-00000000000a',
          'cb000000-0000-4000-8000-00000000000b', 90, 'kg', current_date, 'manual');

  -- Entra un resultado viejo mejor que esa marca manual.
  update public.results set value_numeric = 125
  where wod_block_id = 'eb000000-0000-4000-8000-00000000000c';

  perform pg_temp.chk(
    exists (select 1 from public.personal_records
            where athlete_id = 'ab000000-0000-4000-8000-00000000000a'
              and source = 'manual' and value_numeric = 90),
    'una marca escrita a mano no la borra el detector: es una afirmación de su dueño');
end $$;

-- ============ 5 · El orden normal sigue funcionando =========================
do $$ begin
  perform pg_temp.chk(
    (select max(value_numeric) from public.personal_records
     where athlete_id = 'ab000000-0000-4000-8000-00000000000a'
       and movement_id = 'cb000000-0000-4000-8000-00000000000b'
       and source = 'wod_result') = 125,
    'mejorar un resultado sigue actualizando el récord');
end $$;

rollback;

select 'ORDEN DE RÉCORDS OK' as resultado;
