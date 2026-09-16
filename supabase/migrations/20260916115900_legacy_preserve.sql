-- =============================================================================
-- 0000 · Preservar el prototipo antes de tocar nada
-- =============================================================================
-- El box del entrenador lleva meses de datos reales en las tablas del prototipo
-- (`athletes` con columnas back_squat, karen…, más `workout_logs` y
-- `athlete_progress`). El esquema nuevo reutiliza el nombre `athletes`, así que
-- sin este paso la migración los pisaría.
--
-- Esta migración mueve lo viejo al esquema `legacy` en vez de borrarlo. Nada se
-- pierde: los datos siguen ahí, consultables, hasta que la migración esté
-- verificada y el entrenador confirme que todo cuadra.
--
-- En una base limpia (desarrollo local, CI) no hay nada que mover y no hace
-- nada. Es idempotente: se puede correr dos veces sin efecto.
-- =============================================================================

create schema if not exists legacy;

do $$
declare
  es_prototipo boolean;
begin
  -- ¿Existe la tabla del prototipo? Se distingue de la nueva por una columna
  -- que solo tenía la vieja.
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'athletes'
      and column_name = 'back_squat'
  ) into es_prototipo;

  if es_prototipo then
    raise notice 'Prototipo detectado. Moviendo las tablas a legacy…';

    alter table public.athletes set schema legacy;

    if to_regclass('public.workout_logs') is not null then
      alter table public.workout_logs set schema legacy;
    end if;

    if to_regclass('public.athlete_progress') is not null then
      alter table public.athlete_progress set schema legacy;
    end if;

    raise notice 'Listo. Datos del prototipo preservados en el esquema legacy.';
  else
    raise notice 'No hay prototipo que preservar (base limpia).';
  end if;
end $$;

-- El esquema legacy no se expone por la API y solo lo alcanza service_role.
revoke all on schema legacy from public, anon, authenticated;
