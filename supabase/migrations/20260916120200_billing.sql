-- =============================================================================
-- 0003 · Planes, suscripciones, cobros y pagos
-- =============================================================================
-- Dinero SIEMPRE en centavos (bigint). Nunca float, nunca numeric del cliente.
-- El acceso financiero no lo da el rol sino private.auth_finance_org_ids(): un coach
-- solo ve la plata si el box se lo concedió.
-- =============================================================================

create table public.plans (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  name           text not null,
  description    text,
  price_cents    bigint not null check (price_cents >= 0),
  billing_period text not null default 'monthly'
                 check (billing_period in ('monthly','quarterly','semiannual','annual','one_off')),
  duration_days  int check (duration_days is null or duration_days > 0),
  class_quota    int check (class_quota is null or class_quota > 0),  -- null = ilimitado
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index plans_org_active_idx on public.plans (org_id, is_active);

create trigger plans_touch before update on public.plans
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
create table public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  athlete_id      uuid not null references public.athletes(id) on delete cascade,
  plan_id         uuid not null references public.plans(id),
  -- Precio congelado: si el box sube el plan, el atleta antiguo mantiene el suyo
  price_cents     bigint not null check (price_cents >= 0),
  discount_cents  bigint not null default 0 check (discount_cents >= 0),
  discount_reason text,
  started_on      date not null default current_date,
  ends_on         date,
  -- La "fecha de corte". Si es 31 y el mes no lo tiene, se usa el último día.
  billing_day     int not null check (billing_day between 1 and 31),
  status          text not null default 'active'
                  check (status in ('active','paused','overdue','cancelled')),
  paused_from     date,
  paused_until    date,
  cancel_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_on is null or ends_on >= started_on),
  check (discount_cents <= price_cents)
);
create index subscriptions_billing_idx on public.subscriptions (org_id, status, billing_day);
create index subscriptions_athlete_idx on public.subscriptions (org_id, athlete_id);
-- Un atleta no puede tener dos suscripciones activas a la vez
create unique index subscriptions_one_active_idx on public.subscriptions (athlete_id)
  where status = 'active';

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  athlete_id      uuid not null references public.athletes(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  number          text not null,
  period_start    date not null,
  period_end      date not null,
  issued_on       date not null default current_date,
  due_on          date not null,
  amount_cents    bigint not null check (amount_cents >= 0),
  paid_cents      bigint not null default 0 check (paid_cents >= 0),
  status          text not null default 'open'
                  check (status in ('open','partial','paid','overdue','void')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, number),
  check (period_end >= period_start)
);
create index invoices_cartera_idx on public.invoices (org_id, status, due_on);
create index invoices_athlete_idx on public.invoices (org_id, athlete_id, issued_on desc);

-- IDEMPOTENCIA DEL COBRO. Esta línea es la que evita el peor bug del producto:
-- si el job diario corre dos veces, el atleta NO recibe dos cobros del mismo mes.
create unique index invoices_no_duplica_periodo_idx
  on public.invoices (subscription_id, period_start)
  where subscription_id is not null and status <> 'void';

create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  invoice_id    uuid references public.invoices(id) on delete set null,
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  amount_cents  bigint not null check (amount_cents > 0),
  method        text not null
                check (method in ('cash','transfer','nequi','daviplata','card','pse','other')),
  paid_at       timestamptz not null default now(),
  reference     text,
  receipt_url   text,
  provider      text not null default 'manual'
                check (provider in ('manual','wompi','mercadopago')),
  provider_ref  text,
  recorded_by   uuid references auth.users(id),
  status        text not null default 'confirmed'
                check (status in ('pending','confirmed','rejected','refunded')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index payments_org_date_idx on public.payments (org_id, paid_at desc);
create index payments_invoice_idx on public.payments (invoice_id);
-- Un webhook de pasarela puede llegar dos veces: el mismo pago no se registra dos veces.
create unique index payments_provider_ref_idx on public.payments (provider, provider_ref)
  where provider_ref is not null;

create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Mantener el saldo de la factura en sincronía con sus pagos confirmados.
-- Se hace en la base y no en el cliente para que sea cierto sin importar por
-- dónde entre el pago (panel, webhook de Wompi, importación).
-- -----------------------------------------------------------------------------
create or replace function public.recalc_invoice_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  total bigint;
  inv   public.invoices%rowtype;
begin
  if target_invoice is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(p.amount_cents), 0) into total
  from public.payments p
  where p.invoice_id = target_invoice and p.status = 'confirmed';

  select * into inv from public.invoices where id = target_invoice;

  update public.invoices
  set paid_cents = total,
      status = case
                 when status = 'void' then 'void'
                 when total >= inv.amount_cents then 'paid'
                 when total > 0 then 'partial'
                 when inv.due_on < current_date then 'overdue'
                 else 'open'
               end
  where id = target_invoice;

  return coalesce(new, old);
end;
$$;

create trigger payments_recalc_invoice
  after insert or update or delete on public.payments
  for each row execute function public.recalc_invoice_balance();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices      enable row level security;
alter table public.payments      enable row level security;

-- Los planes son el catálogo comercial: todo el staff los lee (el coach necesita
-- saber qué plan tiene un atleta), pero solo quien ve finanzas los edita.
create policy "staff lee planes" on public.plans for select
  to authenticated using (org_id in (select private.auth_staff_org_ids()));
create policy "finanzas gestiona planes" on public.plans for all
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()))
  with check (org_id in (select private.auth_finance_org_ids()));
create policy "el atleta lee los planes activos" on public.plans for select
  to authenticated
  using (is_active and (select private.current_athlete_id(org_id)) is not null);

-- El coach necesita saber si un atleta está al día (para dejarlo entrenar o
-- reservar), pero no necesita ver importes: eso se resuelve en el cliente
-- mostrando solo el estado. A nivel de fila, el staff puede leer.
create policy "staff lee suscripciones" on public.subscriptions for select
  to authenticated using (org_id in (select private.auth_staff_org_ids()));
create policy "finanzas gestiona suscripciones" on public.subscriptions for all
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()))
  with check (org_id in (select private.auth_finance_org_ids()));
create policy "el atleta ve su suscripción" on public.subscriptions for select
  to authenticated using (athlete_id = (select private.current_athlete_id(org_id)));

create policy "finanzas gestiona cobros" on public.invoices for all
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()))
  with check (org_id in (select private.auth_finance_org_ids()));
create policy "el atleta ve sus cobros" on public.invoices for select
  to authenticated using (athlete_id = (select private.current_athlete_id(org_id)));

create policy "finanzas gestiona pagos" on public.payments for all
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()))
  with check (org_id in (select private.auth_finance_org_ids()));
create policy "el atleta ve sus pagos" on public.payments for select
  to authenticated using (athlete_id = (select private.current_athlete_id(org_id)));
