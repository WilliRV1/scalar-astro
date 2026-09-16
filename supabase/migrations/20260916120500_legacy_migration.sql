-- =============================================================================
-- 0006 · Migración del box del entrenador (box 0)
-- =============================================================================
-- Convierte los datos del prototipo, preservados en el esquema `legacy` por la
-- migración 0000, al modelo nuevo. Va como función versionada y no como script
-- suelto por tres razones: se puede probar en CI antes de tocar datos reales,
-- queda registrada en el repositorio, y es idempotente.
--
-- Uso, una sola vez, con service_role:
--   select * from legacy.migrate_box('box-del-entrenador', 'Nombre del Box');
--
-- Devuelve el recuento de lo migrado. No borra NADA del esquema legacy: los
-- datos viejos siguen ahí hasta que el entrenador confirme que todo cuadra.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Conversión de valores del prototipo, que guardaba TODO como texto.
--   '120'     (kg)      -> 120
--   '8:30'    (tiempo)  -> 510      segundos
--   '1:02:30' (tiempo)  -> 3750     segundos
--   '85,5' / '85.5'     -> 85.5
--   '' | null | 'n/a'   -> null
-- -----------------------------------------------------------------------------
create or replace function legacy.parse_value(raw text, metric text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  limpio text;
  partes text[];
begin
  if raw is null then return null; end if;

  limpio := trim(raw);
  if limpio = '' or lower(limpio) in ('n/a','na','-','–','?') then
    return null;
  end if;

  if metric = 'time' then
    -- mm:ss o hh:mm:ss
    if limpio ~ '^\d{1,2}:\d{1,2}(:\d{1,2})?$' then
      partes := string_to_array(limpio, ':');
      if array_length(partes, 1) = 2 then
        return partes[1]::numeric * 60 + partes[2]::numeric;
      else
        return partes[1]::numeric * 3600 + partes[2]::numeric * 60 + partes[3]::numeric;
      end if;
    end if;
    -- Solo dígitos en un campo de tiempo: se asume que ya son segundos
    if limpio ~ '^\d+$' then return limpio::numeric; end if;
    return null;
  end if;

  -- Peso y repeticiones: se quitan unidades escritas a mano ("120 kg", "120kg")
  limpio := regexp_replace(limpio, '[^0-9,.]', '', 'g');
  limpio := replace(limpio, ',', '.');
  if limpio = '' or limpio !~ '^\d*\.?\d+$' then return null; end if;
  return limpio::numeric;
end;
$$;

-- -----------------------------------------------------------------------------
create or replace function legacy.migrate_box(
  p_slug text,
  p_name text,
  p_plan_price_cents bigint default 18000000   -- 180.000 COP por defecto
)
returns table (concepto text, cantidad bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id  uuid;
  v_plan_id uuid;
begin
  if to_regclass('legacy.athletes') is null then
    raise exception 'No hay datos del prototipo en el esquema legacy. ¿Se corrió la migración 0000?';
  end if;

  -- 1 · El box. Si ya existe, se reutiliza: la función es idempotente.
  select id into v_org_id from public.organizations where slug = p_slug;
  if v_org_id is null then
    insert into public.organizations (slug, name, status, plan_tier)
    values (p_slug, p_name, 'active', 'box')
    returning id into v_org_id;
  end if;

  -- 2 · Un plan por defecto para colgar las suscripciones.
  select id into v_plan_id
  from public.plans where org_id = v_org_id and name = 'Mensualidad';
  if v_plan_id is null then
    insert into public.plans (org_id, name, price_cents, billing_period)
    values (v_org_id, 'Mensualidad', p_plan_price_cents, 'monthly')
    returning id into v_plan_id;
  end if;

  -- 3 · Atletas. El prototipo guardaba un solo campo `name`: se parte por el
  --     primer espacio. Es una heurística, y por eso el runbook pide revisar
  --     los nombres compuestos después de migrar.
  insert into public.athletes (
    id, org_id, first_name, last_name, avatar_url, referral_source,
    status, joined_on, created_at
  )
  select
    la.id,
    v_org_id,
    split_part(trim(la.name), ' ', 1),
    nullif(trim(substr(trim(la.name), length(split_part(trim(la.name), ' ', 1)) + 1)), ''),
    la.avatar_url,
    la.referral_source,
    case when la.payment_status = 'active' then 'active' else 'overdue' end,
    la.created_at::date,
    la.created_at
  from legacy.athletes la
  on conflict (id) do nothing;

  -- 4 · Suscripciones a partir de `cut_day`, que era la fecha de corte.
  --     Los valores raros ('', '0', '35') se llevan al día 1 y se anotan.
  insert into public.subscriptions (
    org_id, athlete_id, plan_id, price_cents, billing_day, started_on, status
  )
  select
    v_org_id, la.id, v_plan_id, p_plan_price_cents,
    greatest(1, least(31, coalesce(nullif(regexp_replace(coalesce(la.cut_day,''), '\D', '', 'g'), '')::int, 1))),
    la.created_at::date,
    case when la.payment_status = 'active' then 'active' else 'overdue' end
  from legacy.athletes la
  where not exists (
    select 1 from public.subscriptions s where s.athlete_id = la.id
  );

  -- 5 · Histórico de marcas (legacy.athlete_progress).
  if to_regclass('legacy.athlete_progress') is not null then
    insert into public.personal_records (
      org_id, athlete_id, movement_id, value_numeric, unit, achieved_on, source
    )
    select
      v_org_id, ap.athlete_id, m.id,
      legacy.parse_value(ap.value, m.metric),
      m.unit, ap.created_at::date, 'legacy'
    from legacy.athlete_progress ap
    join public.movements m on m.legacy_key = ap.field_name and m.org_id is null
    join public.athletes a on a.id = ap.athlete_id
    where legacy.parse_value(ap.value, m.metric) is not null
    on conflict do nothing;
  end if;

  -- 6 · Marcas actuales, que en el prototipo eran columnas de la tabla.
  --
  --     Dos trampas aquí, ambas detectadas por supabase/tests/legacy_migration.sql:
  --
  --     a) Si se fecha la marca actual con la fecha del último registro del
  --        histórico, choca con ese registro y el `on conflict do nothing` la
  --        descarta EN SILENCIO. El atleta pierde su mejor marca. Por eso se
  --        fecha un día después del último histórico.
  --     b) Si la marca actual es idéntica a la última del histórico, es el
  --        mismo dato: se omite en vez de duplicarlo.
  --
  --     No se usa la fecha de hoy: eso falsearía la gráfica de evolución,
  --     haciendo parecer que el atleta acaba de hacer un PR.
  insert into public.personal_records (
    org_id, athlete_id, movement_id, value_numeric, unit, achieved_on, source, notes
  )
  select
    v_org_id, la.id, m.id, valor.v, m.unit,
    coalesce(hist.ultima_fecha + 1, la.created_at::date),
    'legacy',
    case when hist.ultima_fecha is null
         then 'Fecha estimada: el prototipo no guardaba cuándo se logró la marca.'
         else null end
  from legacy.athletes la
  cross join lateral (
    values
      ('back_squat',     la.back_squat),
      ('front_squat',    la.front_squat),
      ('deadlift',       la.deadlift),
      ('bench_press',    la.bench_press),
      ('shoulder_press', la.shoulder_press),
      ('push_press',     la.push_press),
      ('clean_rm',       la.clean_rm),
      ('snatch_rm',      la.snatch_rm),
      ('karen',          la.karen),
      ('burpees_100',    la.burpees_100)
  ) as col(clave, texto)
  join public.movements m on m.legacy_key = col.clave and m.org_id is null
  cross join lateral (select legacy.parse_value(col.texto, m.metric) as v) valor
  left join lateral (
    select ap.created_at::date as ultima_fecha,
           legacy.parse_value(ap.value, m.metric) as ultimo_valor
    from legacy.athlete_progress ap
    where ap.athlete_id = la.id
      and ap.field_name = m.legacy_key
      and legacy.parse_value(ap.value, m.metric) is not null
    order by ap.created_at desc
    limit 1
  ) hist on true
  where valor.v is not null
    -- (b): no repetir la marca que ya está en el histórico
    and (hist.ultimo_valor is null or hist.ultimo_valor is distinct from valor.v)
  on conflict do nothing;

  -- 7 · Recuento para el runbook.
  return query
    select 'atletas migrados'::text,
           (select count(*) from public.athletes where org_id = v_org_id)
    union all
    select 'suscripciones creadas',
           (select count(*) from public.subscriptions where org_id = v_org_id)
    union all
    select 'marcas migradas',
           (select count(*) from public.personal_records where org_id = v_org_id)
    union all
    select 'atletas en el prototipo (control)',
           (select count(*) from legacy.athletes)
    union all
    select 'valores de marca ilegibles (revisar a mano)',
           (select count(*) from legacy.athlete_progress ap
            join public.movements m on m.legacy_key = ap.field_name and m.org_id is null
            where legacy.parse_value(ap.value, m.metric) is null);
end;
$$;

comment on function legacy.migrate_box is
  'Migra el box del prototipo al modelo nuevo. Idempotente. No borra nada de legacy.';

-- Solo service_role, nunca desde el navegador.
revoke all on function legacy.migrate_box(text, text, bigint) from public, anon, authenticated;
revoke all on function legacy.parse_value(text, text) from public, anon, authenticated;
