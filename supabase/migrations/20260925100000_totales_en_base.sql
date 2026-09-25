-- =============================================================================
-- Totales de cartera, recaudo y gastos calculados en la base
-- =============================================================================
-- Hasta hoy el tablero sumaba en el navegador las filas que traía PostgREST, y
-- PostgREST trae como mucho el tope de la lista (200 cobros, 300 gastos). Un
-- box con más cobros abiertos o más gastos en el mes que ese tope veía un
-- total incompleto. Aquí los totales se calculan sobre TODAS las filas; la
-- lista sigue paginada, porque son dos preguntas distintas.
--
-- Todas son `security invoker`: la RLS de invoices, payments y expenses decide
-- qué suma cada quien. Un coach sin permiso financiero recibe ceros, no un
-- error, igual que recibe cero filas en la lista.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cartera por tramo de mora
-- -----------------------------------------------------------------------------
-- Los tramos son los mismos del tablero: por vencer, 1-7, 8-30 y más de 30
-- días. "Hoy" es hoy en la zona horaria del box: a las 02:00 UTC en Bogotá
-- todavía es ayer, y un cobro que vence hoy no está en mora.
--
-- `p_now` existe para poder probar con fechas fijas.
create or replace function public.cartera_totales(
  p_org_id uuid,
  p_now    timestamptz default now()
)
returns table (
  tramo       text,
  cobros      int,
  saldo_cents bigint
)
language sql
stable
set search_path = ''
as $$
  with hoy as (
    select (p_now at time zone coalesce(o.timezone, 'America/Bogota'))::date as d
    from public.organizations o
    where o.id = p_org_id
  ),
  abiertos as (
    select (h.d - i.due_on) as dias,
           (i.amount_cents - i.paid_cents) as saldo
    from public.invoices i
    cross join hoy h
    where i.org_id = p_org_id
      and i.status in ('open', 'partial', 'overdue')
  ),
  sumas as (
    select case
             when dias <= 0  then 'porVencer'
             when dias <= 7  then 'reciente'
             when dias <= 30 then 'seria'
             else 'critica'
           end as tramo,
           count(*)::int as cobros,
           sum(saldo)::bigint as saldo_cents
    from abiertos
    group by 1
  ),
  tramos as (
    select t.tramo, t.orden
    from unnest(array['porVencer', 'reciente', 'seria', 'critica'])
         with ordinality as t(tramo, orden)
  )
  -- Siempre las 4 filas, con ceros donde no hay nada: el tablero pinta los 4
  -- tramos aunque el box esté al día.
  select t.tramo, coalesce(s.cobros, 0), coalesce(s.saldo_cents, 0)::bigint
  from tramos t
  left join sumas s on s.tramo = t.tramo
  order by t.orden;
$$;

comment on function public.cartera_totales is
  'Cobros abiertos por tramo de mora (porVencer, reciente, seria, critica), en la zona horaria del box.';

-- -----------------------------------------------------------------------------
-- Recaudo del mes en curso
-- -----------------------------------------------------------------------------
-- Mismo criterio que monthly_pnl: pagos CONFIRMADOS, y el mes es el mes en la
-- zona del box. Un pago a las 02:00 UTC del 1 de octubre son las 21:00 del 30
-- de septiembre en Bogotá y pertenece a septiembre.
create or replace function public.recaudo_mes(
  p_org_id uuid,
  p_now    timestamptz default now()
)
returns table (cents bigint, pagos int)
language sql
stable
set search_path = ''
as $$
  with mes as (
    select date_trunc('month', (p_now at time zone z.tz))::date as inicio, z.tz
    from (
      select coalesce(o.timezone, 'America/Bogota') as tz
      from public.organizations o
      where o.id = p_org_id
    ) z
  )
  -- Agregado sin group by: siempre devuelve exactamente una fila, con ceros si
  -- el box no existe o no es visible para quien pregunta.
  select coalesce(sum(p.amount_cents), 0)::bigint,
         count(*)::int
  from public.payments p
  where p.org_id = p_org_id
    and p.status = 'confirmed'
    -- Rango en timestamptz (no un cast por fila) para que use el índice
    -- (org_id, paid_at).
    and p.paid_at >= (select m.inicio::timestamp at time zone m.tz from mes m)
    and p.paid_at <  (select (m.inicio + interval '1 month') at time zone m.tz from mes m);
$$;

comment on function public.recaudo_mes is
  'Pagos confirmados del mes en curso (zona horaria del box): total en centavos y cantidad.';

-- -----------------------------------------------------------------------------
-- Gastos del periodo
-- -----------------------------------------------------------------------------
-- Solo gastos reales (no recurrentes): el recurrente es la plantilla del
-- compromiso, no plata que salió. Es el mismo filtro de la lista y de
-- monthly_pnl; si cambia en uno tiene que cambiar en los tres.
create or replace function public.gastos_totales(
  p_org_id uuid,
  p_desde  date,
  p_hasta  date
)
returns table (
  total_cents     bigint,
  gastos          int,
  sin_pagar_cents bigint,
  sin_pagar       int
)
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(e.amount_cents), 0)::bigint,
         count(*)::int,
         coalesce(sum(e.amount_cents) filter (where e.paid_on is null), 0)::bigint,
         (count(*) filter (where e.paid_on is null))::int
  from public.expenses e
  where e.org_id = p_org_id
    and not e.is_recurring
    and e.incurred_on between p_desde and p_hasta;
$$;

comment on function public.gastos_totales is
  'Total, cantidad y parte sin pagar de los gastos no recurrentes del periodo.';

create or replace function public.gastos_por_categoria(
  p_org_id uuid,
  p_desde  date,
  p_hasta  date
)
returns table (categoria text, total_cents bigint)
language sql
stable
set search_path = ''
as $$
  select coalesce(c.name, 'Sin categoría') as categoria,
         sum(e.amount_cents)::bigint
  from public.expenses e
  left join public.expense_categories c on c.id = e.category_id
  where e.org_id = p_org_id
    and not e.is_recurring
    and e.incurred_on between p_desde and p_hasta
  group by 1
  order by 2 desc, 1;
$$;

comment on function public.gastos_por_categoria is
  'Gasto no recurrente del periodo agrupado por categoría, de mayor a menor.';

-- -----------------------------------------------------------------------------
-- Permisos: solo usuarios autenticados. Lo que ven lo decide la RLS.
-- -----------------------------------------------------------------------------
revoke all on function public.cartera_totales(uuid, timestamptz)      from public, anon;
revoke all on function public.recaudo_mes(uuid, timestamptz)          from public, anon;
revoke all on function public.gastos_totales(uuid, date, date)        from public, anon;
revoke all on function public.gastos_por_categoria(uuid, date, date)  from public, anon;

grant execute on function public.cartera_totales(uuid, timestamptz)     to authenticated;
grant execute on function public.recaudo_mes(uuid, timestamptz)         to authenticated;
grant execute on function public.gastos_totales(uuid, date, date)       to authenticated;
grant execute on function public.gastos_por_categoria(uuid, date, date) to authenticated;

do $$ begin perform public.assert_rls_enabled(); end $$;
