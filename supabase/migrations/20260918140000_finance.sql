-- =============================================================================
-- 0012 · Finanzas y logística del box
-- =============================================================================
-- Este módulo es el que convierte "software para mis atletas" en "software para
-- mi negocio": el dueño quiere saber si gana o pierde plata y cuándo compró el
-- magnesio.
--
-- Tres reglas que se cumplen aquí y no en el cliente:
--
--   1. ACCESO. Nada de esto lo ve un coach cualquiera. Las políticas usan
--      private.auth_finance_org_ids(), no auth_staff_org_ids(): un coach solo
--      entra si el box le concedió can_view_finances.
--   2. DINERO EN CENTAVOS (bigint). Nunca coma flotante. La cantidad de un
--      insumo sí es numeric (medio kilo de magnesio existe), el dinero no.
--   3. UNA COMPRA DE INSUMO ES UN GASTO. El reflejo contable y el movimiento de
--      stock los hace un trigger, así que valen igual si la compra entra por el
--      panel, por una importación o por una Edge Function. Si se borra la
--      compra, el gasto y el stock se revierten.
--
-- Ver docs/03-modelo-de-datos.md §"Logística y finanzas del box".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categorías de gasto
-- -----------------------------------------------------------------------------
create table public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  kind       text not null default 'operational'
             check (kind in ('operational','payroll','capex','tax')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Sin distinguir mayúsculas: "Arriendo" y "arriendo" son la misma categoría, y
-- el trigger de insumos se apoya en esto para encontrar (o crear) "Insumos".
create unique index expense_categories_org_name_idx
  on public.expense_categories (org_id, lower(name));

comment on table public.expense_categories is
  'Arriendo, Servicios, Coaches, Insumos, Equipos… Categorías propias de cada box.';

-- -----------------------------------------------------------------------------
-- Proveedores
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  -- Mismo formato E.164 que los atletas: el proveedor también se contacta por
  -- WhatsApp, y un número a medio normalizar no sirve para eso.
  phone      text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email      text,
  notes      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suppliers_org_idx on public.suppliers (org_id, name);

create trigger suppliers_touch before update on public.suppliers
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Insumos: magnesio, tiza, cauchos, cintas, agarraderas
-- -----------------------------------------------------------------------------
create table public.supplies (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  name                text not null check (length(btrim(name)) > 0),
  unit                text not null default 'unidad',
  -- El stock SÍ es fraccionario (2,5 kg de magnesio) y no es dinero, así que
  -- numeric es lo correcto. Puede quedar negativo si el box descuenta consumo
  -- antes de registrar la compra: se avisa, no se bloquea.
  current_stock       numeric(12,2) not null default 0,
  min_stock           numeric(12,2) not null default 0 check (min_stock >= 0),
  -- Costo unitario promedio ponderado. Lo recalcula el trigger de compras: es
  -- un dato derivado, nadie lo escribe a mano.
  avg_unit_cost_cents bigint check (avg_unit_cost_cents is null or avg_unit_cost_cents >= 0),
  default_supplier_id uuid references public.suppliers(id) on delete set null,
  reorder_every_days  int check (reorder_every_days is null or reorder_every_days > 0),
  last_purchased_on   date,
  notes               text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Necesaria para la llave foránea compuesta de supply_purchases (abajo): un
  -- box no puede colgar una compra de un insumo de otro box.
  unique (id, org_id)
);
create index supplies_org_idx on public.supplies (org_id, name) where is_active;
create index supplies_supplier_idx on public.supplies (default_supplier_id);

create trigger supplies_touch before update on public.supplies
  for each row execute function public.touch_updated_at();

comment on column public.supplies.min_stock is
  'Por debajo (o igual) de esto el insumo sale en la alerta de compra.';

-- -----------------------------------------------------------------------------
-- Gastos
-- -----------------------------------------------------------------------------
-- Un gasto recurrente (arriendo, seguro, mantenimiento) es un COMPROMISO, no un
-- egreso: describe cuánto y cada cuánto hay que pagar, y alimenta el calendario.
-- El egreso real es la fila que crea public.register_expense_payment() cada vez
-- que se paga un periodo, con parent_expense_id apuntando al compromiso. Por eso
-- el P&L suma solo `not is_recurring`: si sumara las dos, el arriendo contaría
-- doble el mes en que se creó.
-- -----------------------------------------------------------------------------
create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  category_id       uuid references public.expense_categories(id) on delete set null,
  supplier_id       uuid references public.suppliers(id) on delete set null,
  description       text not null check (length(btrim(description)) > 0),
  amount_cents      bigint not null check (amount_cents >= 0),
  incurred_on       date not null default current_date,
  paid_on           date,
  is_recurring      boolean not null default false,
  recurrence        text check (recurrence in
                     ('weekly','biweekly','monthly','quarterly','semiannual','annual')),
  next_due_on       date,
  receipt_url       text,               -- foto de la factura (bucket `receipts`)
  notes             text,
  parent_expense_id uuid references public.expenses(id) on delete set null,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Un compromiso sin periodicidad ni próximo vencimiento no sirve para nada:
  -- no se puede avanzar ni aparece en el calendario.
  constraint expenses_recurrencia_completa
    check (not is_recurring or (recurrence is not null and next_due_on is not null))
);
create index expenses_org_fecha_idx on public.expenses (org_id, incurred_on desc);
create index expenses_org_categoria_idx on public.expenses (org_id, category_id, incurred_on desc);
create index expenses_supplier_idx on public.expenses (supplier_id);
create index expenses_parent_idx on public.expenses (parent_expense_id);
-- El calendario de compromisos solo mira las recurrentes: índice parcial.
create index expenses_compromisos_idx on public.expenses (org_id, next_due_on)
  where is_recurring;

-- -----------------------------------------------------------------------------
-- Compras de insumo: "cuándo compré el magnesio y a cuánto"
-- -----------------------------------------------------------------------------
create table public.supply_purchases (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  -- El modelo de datos lo dibujó opcional; aquí es obligatorio a propósito: una
  -- compra sin insumo no puede mover stock, que es la mitad de su razón de ser.
  -- Una compra suelta (un ventilador, una reparación) es un gasto, no una compra.
  supply_id    uuid not null,
  supplier_id  uuid references public.suppliers(id) on delete set null,
  purchased_on date not null default current_date,
  quantity     numeric(12,2) not null check (quantity > 0),
  total_cents  bigint not null check (total_cents >= 0),
  invoice_url  text,                    -- foto de la factura
  notes        text,
  -- Lo llena el trigger. Se pone a null si alguien borra el gasto a mano.
  expense_id   uuid references public.expenses(id) on delete set null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Compuesta: el insumo tiene que ser del MISMO box que la compra.
  foreign key (supply_id, org_id)
    references public.supplies (id, org_id) on delete cascade
);
create index supply_purchases_insumo_idx on public.supply_purchases (supply_id, purchased_on desc);
create index supply_purchases_org_fecha_idx on public.supply_purchases (org_id, purchased_on desc);
create index supply_purchases_supplier_idx on public.supply_purchases (supplier_id);
create index supply_purchases_expense_idx on public.supply_purchases (expense_id);

-- =============================================================================
-- Una compra de insumo se refleja como gasto y mueve el stock
-- =============================================================================

/**
 * Id de la categoría "Insumos" del box, creándola si hace falta.
 * Vive en `private` porque es un detalle interno del trigger, no una API.
 */
create or replace function private.supplies_category_id(p_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select c.id into v_id
  from public.expense_categories c
  where c.org_id = p_org_id and lower(c.name) = 'insumos';

  if v_id is null then
    insert into public.expense_categories (org_id, name, kind)
    values (p_org_id, 'Insumos', 'operational')
    on conflict (org_id, lower(name)) do nothing
    returning id into v_id;
  end if;

  -- Si dos compras entraron a la vez, el ON CONFLICT no devuelve fila: se
  -- vuelve a leer en vez de fallar.
  if v_id is null then
    select c.id into v_id
    from public.expense_categories c
    where c.org_id = p_org_id and lower(c.name) = 'insumos';
  end if;

  return v_id;
end;
$$;

/** Recalcula los datos derivados del insumo a partir de sus compras. */
create or replace function private.refresh_supply_stats(p_supply_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.supplies s
  set last_purchased_on = agg.ultima,
      avg_unit_cost_cents = agg.costo
  from (
    select max(sp.purchased_on) as ultima,
           case when coalesce(sum(sp.quantity), 0) > 0
                then round(sum(sp.total_cents) / sum(sp.quantity))::bigint
           end as costo
    from public.supply_purchases sp
    where sp.supply_id = p_supply_id
  ) agg
  where s.id = p_supply_id;
$$;

comment on function private.refresh_supply_stats is
  'Última compra y costo unitario promedio ponderado. Si no quedan compras, ambos vuelven a null.';

/**
 * BEFORE INSERT: crea el gasto espejo de la compra y lo enlaza.
 * Se hace en BEFORE para que expense_id quede escrito en la misma fila, sin un
 * UPDATE posterior que volvería a disparar triggers.
 */
create or replace function public.supply_purchase_to_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supply  public.supplies%rowtype;
  v_expense uuid;
begin
  select * into v_supply from public.supplies s where s.id = new.supply_id;

  -- Si no dijeron a quién le compraron, se asume el proveedor habitual.
  new.supplier_id := coalesce(new.supplier_id, v_supply.default_supplier_id);

  -- Una importación puede traer el gasto ya creado: no se duplica.
  if new.expense_id is not null then
    return new;
  end if;

  insert into public.expenses (
    org_id, category_id, supplier_id, description,
    amount_cents, incurred_on, paid_on, receipt_url, created_by
  )
  values (
    new.org_id,
    private.supplies_category_id(new.org_id),
    new.supplier_id,
    format('Compra de %s (%s %s)',
           v_supply.name,
           trim(to_char(new.quantity, 'FM999999990.99')),
           v_supply.unit),
    new.total_cents,
    new.purchased_on,
    new.purchased_on,          -- una compra de insumo se paga al comprarla
    new.invoice_url,
    new.created_by
  )
  returning id into v_expense;

  new.expense_id := v_expense;
  return new;
end;
$$;

/**
 * AFTER INSERT/UPDATE/DELETE: mueve el stock y mantiene el gasto espejo.
 * El stock es incremental (no se recalcula desde las compras) porque también
 * baja con el consumo del box, que no tiene fila en supply_purchases.
 */
create or replace function public.sync_supply_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.supplies s
    set current_stock = s.current_stock + new.quantity
    where s.id = new.supply_id;

  elsif tg_op = 'DELETE' then
    update public.supplies s
    set current_stock = s.current_stock - old.quantity
    where s.id = old.supply_id;

    -- Se borra la compra: se borra su gasto. Si no, el P&L seguiría contando
    -- plata que nunca salió.
    if old.expense_id is not null then
      delete from public.expenses e where e.id = old.expense_id;
    end if;

  else -- UPDATE
    if old.supply_id <> new.supply_id then
      update public.supplies s set current_stock = s.current_stock - old.quantity
      where s.id = old.supply_id;
      update public.supplies s set current_stock = s.current_stock + new.quantity
      where s.id = new.supply_id;
    elsif old.quantity <> new.quantity then
      update public.supplies s
      set current_stock = s.current_stock + (new.quantity - old.quantity)
      where s.id = new.supply_id;
    end if;

    if new.expense_id is not null then
      update public.expenses e
      set amount_cents = new.total_cents,
          incurred_on  = new.purchased_on,
          supplier_id  = new.supplier_id,
          receipt_url  = new.invoice_url
      where e.id = new.expense_id;
    end if;
  end if;

  perform private.refresh_supply_stats(coalesce(new.supply_id, old.supply_id));
  if tg_op = 'UPDATE' and old.supply_id <> new.supply_id then
    perform private.refresh_supply_stats(old.supply_id);
  end if;

  return coalesce(new, old);
end;
$$;

create trigger supply_purchases_to_expense
  before insert on public.supply_purchases
  for each row execute function public.supply_purchase_to_expense();

create trigger supply_purchases_sync_stock
  after insert or update or delete on public.supply_purchases
  for each row execute function public.sync_supply_stock();

-- =============================================================================
-- Gastos recurrentes
-- =============================================================================

create or replace function public.recurrence_interval(p_recurrence text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_recurrence
           when 'weekly'     then interval '1 week'
           when 'biweekly'   then interval '2 weeks'
           when 'monthly'    then interval '1 month'
           when 'quarterly'  then interval '3 months'
           when 'semiannual' then interval '6 months'
           when 'annual'     then interval '1 year'
           else interval '1 month'
         end
$$;

/**
 * Registra el pago del periodo de un gasto.
 *
 * Si el gasto es recurrente (un compromiso), deja constancia del egreso real
 * creando la fila del periodo pagado y avanza next_due_on al siguiente. Devuelve
 * el gasto ya actualizado.
 *
 * SECURITY INVOKER a propósito: corre con los permisos de quien llama, así que
 * la RLS de expenses decide. Un coach sin permiso financiero no encuentra la
 * fila y la función falla, en vez de pagarle el arriendo al box.
 */
create or replace function public.register_expense_payment(
  p_expense_id uuid,
  p_paid_on    date default current_date
)
returns public.expenses
language plpgsql
set search_path = ''
as $$
declare
  v_expense public.expenses%rowtype;
  v_periodo date;
begin
  select * into v_expense from public.expenses e where e.id = p_expense_id;
  if not found then
    raise exception 'No existe el gasto % o no tienes permiso para verlo', p_expense_id;
  end if;

  if not v_expense.is_recurring then
    update public.expenses e set paid_on = p_paid_on
    where e.id = p_expense_id
    returning * into v_expense;
    return v_expense;
  end if;

  -- El periodo que se está pagando es el que estaba pendiente.
  v_periodo := coalesce(v_expense.next_due_on, p_paid_on);

  insert into public.expenses (
    org_id, category_id, supplier_id, description, amount_cents,
    incurred_on, paid_on, receipt_url, parent_expense_id, created_by
  )
  values (
    v_expense.org_id, v_expense.category_id, v_expense.supplier_id,
    v_expense.description, v_expense.amount_cents,
    v_periodo, p_paid_on, v_expense.receipt_url, v_expense.id, v_expense.created_by
  );

  update public.expenses e
  set paid_on     = p_paid_on,
      next_due_on = (v_periodo + public.recurrence_interval(e.recurrence))::date
  where e.id = p_expense_id
  returning * into v_expense;

  return v_expense;
end;
$$;

comment on function public.register_expense_payment is
  'Paga el periodo de un gasto: crea el egreso del periodo y avanza next_due_on.';

-- =============================================================================
-- Consultas del módulo
-- =============================================================================
-- Todas son SECURITY INVOKER: la RLS de las tablas es la que filtra, así que no
-- hay forma de que un coach sin permiso financiero vea plata a través de ellas.
-- Las que leen tablas visibles para todo el staff (subscriptions, athletes)
-- comprueban el permiso a mano con private.can_view_finance().
-- =============================================================================

create or replace function private.can_view_finance(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.auth_finance_org_ids() f(org_id) where f.org_id = p_org_id
  )
$$;

-- -----------------------------------------------------------------------------
-- Alerta de stock bajo: "cuándo compré el magnesio y a cuánto"
-- -----------------------------------------------------------------------------
create or replace function public.supplies_low_stock(p_org_id uuid)
returns table (
  supply_id            uuid,
  name                 text,
  unit                 text,
  current_stock        numeric,
  min_stock            numeric,
  last_purchased_on    date,
  last_supplier        text,
  last_quantity        numeric,
  last_total_cents     bigint,
  last_unit_cost_cents bigint,
  suggested_reorder_on date
)
language sql
stable
set search_path = ''
as $$
  select s.id,
         s.name,
         s.unit,
         s.current_stock,
         s.min_stock,
         s.last_purchased_on,
         prov.name,
         ult.quantity,
         ult.total_cents,
         case when ult.quantity > 0
              then round(ult.total_cents / ult.quantity)::bigint
         end,
         case when s.reorder_every_days is not null and s.last_purchased_on is not null
              then s.last_purchased_on + s.reorder_every_days
         end
  from public.supplies s
  -- La última compra, no un promedio: el dueño pregunta por la que hizo.
  left join lateral (
    select sp.quantity, sp.total_cents, sp.supplier_id
    from public.supply_purchases sp
    where sp.supply_id = s.id
    order by sp.purchased_on desc, sp.created_at desc
    limit 1
  ) ult on true
  left join public.suppliers prov on prov.id = ult.supplier_id
  where s.org_id = p_org_id
    and s.is_active
    and s.current_stock <= s.min_stock
  order by (s.min_stock - s.current_stock) desc, s.name;
$$;

comment on function public.supplies_low_stock is
  'Insumos en o por debajo del mínimo, con la última compra: cuándo, a quién y a cuánto.';

-- -----------------------------------------------------------------------------
-- P&L mensual
-- -----------------------------------------------------------------------------
-- Función y no vista: así se filtra por box y por rango sin escanear el
-- histórico de todos los boxes, y se puede respetar la zona horaria de cada uno.
--
-- Ingresos = pagos CONFIRMADOS (plata que entró), no facturas emitidas.
-- Egresos  = gastos no recurrentes (ver la nota de la tabla expenses).
--
-- La zona horaria importa de verdad: un pago a las 02:00 UTC del 1 de abril son
-- las 21:00 del 31 de marzo en Bogotá y pertenece a MARZO. Sin esto el corte de
-- mes queda corrido y el dueño no cuadra su caja.
-- -----------------------------------------------------------------------------
create or replace function public.monthly_pnl(
  p_org_id uuid,
  p_desde  date,
  p_hasta  date
)
returns table (
  month         date,
  income_cents  bigint,
  expense_cents bigint,
  net_cents     bigint
)
language sql
stable
set search_path = ''
as $$
  with zona as (
    select coalesce(o.timezone, 'America/Bogota') as tz
    from public.organizations o
    where o.id = p_org_id
  ),
  meses as (
    select generate_series(
             date_trunc('month', p_desde),
             date_trunc('month', p_hasta),
             interval '1 month'
           )::date as month
  ),
  ingresos as (
    select date_trunc('month', (p.paid_at at time zone z.tz))::date as month,
           sum(p.amount_cents)::bigint as cents
    from public.payments p
    cross join zona z
    where p.org_id = p_org_id
      and p.status = 'confirmed'
      -- Rango en timestamptz (no un cast por fila) para que siga sirviendo el
      -- índice (org_id, paid_at).
      and p.paid_at >= (p_desde::timestamp at time zone z.tz)
      and p.paid_at <  ((p_hasta + 1)::timestamp at time zone z.tz)
    group by 1
  ),
  egresos as (
    select date_trunc('month', e.incurred_on)::date as month,
           sum(e.amount_cents)::bigint as cents
    from public.expenses e
    where e.org_id = p_org_id
      and not e.is_recurring
      and e.incurred_on between p_desde and p_hasta
    group by 1
  )
  select m.month,
         coalesce(i.cents, 0)::bigint,
         coalesce(g.cents, 0)::bigint,
         (coalesce(i.cents, 0) - coalesce(g.cents, 0))::bigint
  from meses m
  left join ingresos i on i.month = m.month
  left join egresos  g on g.month = m.month
  order by m.month;
$$;

comment on function public.monthly_pnl is
  'Ingresos (pagos confirmados) menos egresos por mes, en la zona horaria del box.';

-- -----------------------------------------------------------------------------
-- Calendario de compromisos
-- -----------------------------------------------------------------------------
create or replace function public.upcoming_commitments(
  p_org_id uuid,
  p_desde  date,
  p_hasta  date
)
returns table (
  kind         text,     -- expense | supply
  ref_id       uuid,
  label        text,
  category     text,
  supplier     text,
  due_on       date,
  amount_cents bigint
)
language sql
stable
set search_path = ''
as $$
  select 'expense'::text,
         e.id,
         e.description,
         coalesce(c.name, 'Sin categoría'),
         prov.name,
         e.next_due_on,
         e.amount_cents
  from public.expenses e
  left join public.expense_categories c on c.id = e.category_id
  left join public.suppliers prov on prov.id = e.supplier_id
  where e.org_id = p_org_id
    and e.is_recurring
    and e.next_due_on between p_desde and p_hasta

  union all

  -- Compras recurrentes de insumo: no tienen fecha pactada, se estiman con la
  -- última compra más el intervalo de reposición del insumo.
  select 'supply'::text,
         s.id,
         'Reponer ' || s.name,
         'Insumos',
         prov.name,
         (s.last_purchased_on + s.reorder_every_days)::date,
         s.avg_unit_cost_cents
  from public.supplies s
  left join public.suppliers prov on prov.id = s.default_supplier_id
  where s.org_id = p_org_id
    and s.is_active
    and s.reorder_every_days is not null
    and s.last_purchased_on is not null
    and (s.last_purchased_on + s.reorder_every_days) between p_desde and p_hasta

  order by 6, 3;
$$;

comment on function public.upcoming_commitments is
  'Qué vence en el rango: arriendo, seguro, mantenimiento y reposición de insumos.';

-- -----------------------------------------------------------------------------
-- Reportes
-- -----------------------------------------------------------------------------

/** Ingreso recurrente mensual: lo que el box factura cada mes si nadie se va. */
create or replace function public.org_mrr(p_org_id uuid)
returns table (mrr_cents bigint, active_subscriptions int)
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(round((s.price_cents - s.discount_cents)::numeric / m.meses)), 0)::bigint,
         count(*)::int
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  cross join lateral (
    select case p.billing_period
             when 'quarterly'  then 3
             when 'semiannual' then 6
             when 'annual'     then 12
             else 1
           end as meses
  ) m
  where s.org_id = p_org_id
    and s.status = 'active'
    -- Un bono no es ingreso recurrente: se compra una vez y se acaba.
    and p.billing_period <> 'one_off'
    -- subscriptions las lee todo el staff (el coach necesita el estado del
    -- atleta), pero el importe es plata: aquí sí se exige el permiso.
    and private.can_view_finance(p_org_id);
$$;

/** Altas, bajas y retención mes a mes. */
create or replace function public.monthly_membership_report(
  p_org_id uuid,
  p_desde  date,
  p_hasta  date
)
returns table (
  month          date,
  altas          int,
  bajas          int,
  activos_inicio int,
  retencion      numeric
)
language sql
stable
set search_path = ''
as $$
  with meses as (
    select generate_series(
             date_trunc('month', p_desde),
             date_trunc('month', p_hasta),
             interval '1 month'
           )::date as month
  ),
  visibles as (
    select a.*
    from public.athletes a
    where a.org_id = p_org_id
      and a.deleted_at is null
      -- Un interesado que nunca entrenó no es un alta ni una baja.
      and a.status <> 'lead'
      and private.can_view_finance(p_org_id)
  ),
  conteos as (
    select m.month,
           count(*) filter (
             where a.joined_on >= m.month
               and a.joined_on < (m.month + interval '1 month')::date
           )::int as altas,
           count(*) filter (
             where a.churned_on >= m.month
               and a.churned_on < (m.month + interval '1 month')::date
           )::int as bajas,
           count(*) filter (
             where a.joined_on < m.month
               and (a.churned_on is null or a.churned_on >= m.month)
           )::int as activos_inicio
    from meses m
    left join visibles a on true
    group by m.month
  )
  select c.month,
         c.altas,
         c.bajas,
         c.activos_inicio,
         case when c.activos_inicio > 0
              then round(1 - c.bajas::numeric / c.activos_inicio, 4)
         end
  from conteos c
  order by c.month;
$$;

comment on function public.monthly_membership_report is
  'Altas, bajas y retención del mes. La retención es 1 - bajas/activos al inicio del mes.';

/** De dónde salen los atletas: Instagram, referido, pasó por el frente… */
create or replace function public.athlete_sources(p_org_id uuid)
returns table (source text, total int, activos int)
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(btrim(a.referral_source), ''), 'Sin registrar') as source,
         count(*)::int,
         count(*) filter (where a.status = 'active')::int
  from public.athletes a
  where a.org_id = p_org_id
    and a.deleted_at is null
    and private.can_view_finance(p_org_id)
  group by 1
  order by 2 desc, 1;
$$;

-- =============================================================================
-- RLS
-- =============================================================================
-- Todo el módulo es finanzas: se entra con private.auth_finance_org_ids() y no
-- con auth_staff_org_ids(). Un coach sin can_view_finances no ve ni un gasto,
-- ni una compra, ni el costo del magnesio.
-- =============================================================================
alter table public.expense_categories enable row level security;
alter table public.suppliers          enable row level security;
alter table public.supplies           enable row level security;
alter table public.expenses           enable row level security;
alter table public.supply_purchases   enable row level security;

create policy "finanzas gestiona categorías de gasto"
  on public.expense_categories for all
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()))
  with check (org_id in (select private.auth_finance_org_ids()));

create policy "finanzas gestiona proveedores"
  on public.suppliers for all
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()))
  with check (org_id in (select private.auth_finance_org_ids()));

create policy "finanzas gestiona insumos"
  on public.supplies for all
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()))
  with check (org_id in (select private.auth_finance_org_ids()));

create policy "finanzas gestiona gastos"
  on public.expenses for all
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()))
  with check (org_id in (select private.auth_finance_org_ids()));

create policy "finanzas gestiona compras de insumo"
  on public.supply_purchases for all
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()))
  with check (org_id in (select private.auth_finance_org_ids()));

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
-- La llave anónima no tiene nada que hacer aquí. `authenticated` sí las ejecuta,
-- pero son SECURITY INVOKER: lo que devuelven lo decide la RLS del que llama.
revoke all on function public.monthly_pnl(uuid, date, date) from public, anon;
revoke all on function public.supplies_low_stock(uuid) from public, anon;
revoke all on function public.upcoming_commitments(uuid, date, date) from public, anon;
revoke all on function public.org_mrr(uuid) from public, anon;
revoke all on function public.monthly_membership_report(uuid, date, date) from public, anon;
revoke all on function public.athlete_sources(uuid) from public, anon;
revoke all on function public.register_expense_payment(uuid, date) from public, anon;

grant execute on function public.monthly_pnl(uuid, date, date) to authenticated;
grant execute on function public.supplies_low_stock(uuid) to authenticated;
grant execute on function public.upcoming_commitments(uuid, date, date) to authenticated;
grant execute on function public.org_mrr(uuid) to authenticated;
grant execute on function public.monthly_membership_report(uuid, date, date) to authenticated;
grant execute on function public.athlete_sources(uuid) to authenticated;
grant execute on function public.register_expense_payment(uuid, date) to authenticated;

-- Los triggers y los helpers internos no se llaman desde el cliente.
revoke all on function public.supply_purchase_to_expense() from public, anon, authenticated;
revoke all on function public.sync_supply_stock() from public, anon, authenticated;

-- Si esta migración se aplica, es porque las cinco tablas nuevas quedaron
-- protegidas. Se comprueban las de aquí y no todo `public` (lo hace la guarda
-- global de supabase/tests/rls_guard.sql en CI): una migración no debería
-- quedarse sin aplicar por un descuido de otro módulo.
do $$
declare
  sin_rls text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into sin_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('expense_categories','suppliers','supplies','expenses','supply_purchases')
    and (not c.relrowsecurity
         or not exists (select 1 from pg_policy p where p.polrelid = c.oid));

  if sin_rls is not null then
    raise exception 'Finanzas sin RLS o sin políticas en: %', sin_rls;
  end if;
end $$;
