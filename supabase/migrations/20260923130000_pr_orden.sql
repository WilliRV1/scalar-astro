-- =============================================================================
-- 0020 · El récord no depende del orden en que lleguen los resultados
-- =============================================================================
-- `detect_personal_record` comparaba contra TODO el histórico sin mirar fechas.
-- Con los resultados llegando en orden cronológico funciona bien, pero basta
-- que uno viejo entre después de uno reciente para que se rompa:
--
--   1. Entra el de ayer (510 s). No hay histórico → se guarda como récord.
--   2. Entra el de hace dos meses (480 s, mejor). 480 < 510 → también récord.
--   3. La gráfica del atleta queda 480 → 510: dice que EMPEORÓ, cuando en
--      realidad mejoró de 510 a 480 y el de ayer nunca fue un récord.
--
-- Pasa de verdad: cuando un coach captura los resultados de la semana pasada
-- después de los de hoy, o cuando el importador carga un histórico completo.
-- Y afecta justo a la pantalla que engancha al atleta.
--
-- Dos cambios:
--   a) La marca a batir es la mejor lograda HASTA LA FECHA de ese resultado,
--      no la mejor de todos los tiempos.
--   b) Al entrar una marca vieja y mejor, los "récords" posteriores que ya no
--      lo son se borran. Solo los que vinieron de un WOD: una marca que el
--      atleta o el coach escribieron a mano es una afirmación suya y no se
--      toca sin que lo pidan.
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
  v_date := coalesce(v_date, current_date);

  -- (a) La marca a batir es la mejor lograda HASTA ESA FECHA. Comparar contra
  -- el futuro haría que capturar un resultado viejo nunca contara como récord
  -- aunque en su momento lo fuera.
  select case
           when v_block.score_type = 'for_time' then min(pr.value_numeric)
           else max(pr.value_numeric)
         end
    into v_best
  from public.personal_records pr
  where pr.athlete_id = new.athlete_id
    and pr.movement_id = v_block.movement_id
    and pr.reps = 1
    and pr.achieved_on <= v_date;

  v_mejora := v_best is null
    or (v_block.score_type = 'for_time' and new.value_numeric < v_best)
    or (v_block.score_type = 'load'     and new.value_numeric > v_best);

  if not v_mejora then
    return new;
  end if;

  insert into public.personal_records
    (org_id, athlete_id, movement_id, value_numeric, unit, reps, achieved_on, source, notes)
  values
    (new.org_id, new.athlete_id, v_block.movement_id, new.value_numeric,
     v_movement.unit, 1, v_date, 'wod_result',
     coalesce(v_block.title, v_movement.name))
  on conflict (athlete_id, movement_id, achieved_on, reps) do update
    set value_numeric = excluded.value_numeric,
        unit          = excluded.unit,
        source        = excluded.source,
        notes         = excluded.notes;

  -- (b) Esta marca puede dejar sin efecto a "récords" posteriores que, vistos
  -- en orden, nunca lo fueron. Se limpian solo los que vinieron de un WOD.
  delete from public.personal_records pr
  where pr.athlete_id = new.athlete_id
    and pr.movement_id = v_block.movement_id
    and pr.reps = 1
    and pr.achieved_on > v_date
    and pr.source = 'wod_result'
    and (
      (v_block.score_type = 'for_time' and pr.value_numeric >= new.value_numeric)
      or (v_block.score_type = 'load'  and pr.value_numeric <= new.value_numeric)
    );

  return new;
end;
$$;

do $$ begin perform public.assert_rls_enabled(); end $$;
