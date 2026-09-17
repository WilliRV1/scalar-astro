-- =============================================================================
-- 0007 · Motor de cobros
-- =============================================================================
-- Genera el cobro de cada atleta en su fecha de corte. Es la pieza de la que
-- depende la promesa del producto, así que las tres cosas que la pueden romper
-- se resuelven aquí y no en el cliente:
--
--   1. IDEMPOTENCIA. Si el job corre dos veces (reintento, despliegue, dedo),
--      el atleta NO puede recibir dos cobros del mismo periodo.
--   2. FIN DE MES. Una fecha de corte el 31 tiene que cobrarse el 28 en febrero,
--      no saltarse el mes.
--   3. ZONA HORARIA. "Hoy" es hoy en el box, no en UTC. Un job a las 3:00 UTC
--      son las 22:00 del día ANTERIOR en Bogotá: sin esto, todos los cobros
--      salen con un día de desfase.
--
-- La función acepta `p_now` para poder probar esos casos en CI con fechas fijas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Consecutivo de facturas por box
-- -----------------------------------------------------------------------------
-- Un `max(number) + 1` es una condición de carrera: dos procesos leen el mismo
-- máximo y generan el mismo número. Un UPDATE ... RETURNING es atómico.
-- -----------------------------------------------------------------------------
create table public.org_counters (
  org_id       uuid primary key references public.organizations(id) on delete cascade,
  invoice_seq  bigint not null default 0
);

alter table public.org_counters enable row level security;

create policy "finanzas lee el consecutivo de su box"
  on public.org_counters for select
  to authenticated
  using (org_id in (select private.auth_finance_org_ids()));

create or replace function public.next_invoice_number(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq bigint;
begin
  insert into public.org_counters (org_id, invoice_seq)
  values (p_org_id, 1)
  on conflict (org_id) do update
    set invoice_seq = public.org_counters.invoice_seq + 1
  returning invoice_seq into v_seq;

  return 'F-' || to_char(v_seq, 'FM000000');
end;
$$;

-- -----------------------------------------------------------------------------
-- ¿Toca cobrar hoy?
-- -----------------------------------------------------------------------------
create or replace function public.is_billing_day(p_billing_day int, p_date date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_billing_day = extract(day from p_date)::int
     or (
       -- Corte el 29, 30 o 31 en un mes que no llega: se cobra el último día.
       -- Sin esto, un atleta con corte el 31 no se cobraría nunca en febrero.
       p_billing_day > extract(day from (date_trunc('month', p_date) + interval '1 month - 1 day'))::int
       and p_date = (date_trunc('month', p_date) + interval '1 month - 1 day')::date
     )
$$;

comment on function public.is_billing_day is
  'Resuelve la fecha de corte contra meses cortos: el 31 se cobra el 28 en febrero.';

-- -----------------------------------------------------------------------------
-- Duración del periodo según el plan
-- -----------------------------------------------------------------------------
create or replace function public.period_length(p_billing_period text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_billing_period
           when 'monthly'    then interval '1 month'
           when 'quarterly'  then interval '3 months'
           when 'semiannual' then interval '6 months'
           when 'annual'     then interval '1 year'
           else interval '1 month'
         end
$$;

-- -----------------------------------------------------------------------------
-- El job
-- -----------------------------------------------------------------------------
create or replace function public.generate_invoices(
  p_org_id uuid default null,          -- null = todos los boxes
  p_now    timestamptz default now()   -- inyectable para poder probarlo
)
returns table (org_id uuid, invoices_created int, run_date date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  org      record;
  sub      record;
  v_today  date;
  v_count  int;
  v_grace  int;
  v_start  date;
  v_end    date;
  v_number text;
  v_id     uuid;
begin
  for org in
    select o.id, o.timezone, o.settings
    from public.organizations o
    where (p_org_id is null or o.id = p_org_id)
      and o.status in ('trial','active','past_due')
  loop
    -- Un solo proceso cobrando por box a la vez. Se libera al terminar la
    -- transacción. Si otra ejecución ya lo tiene, esta se salta el box en vez
    -- de esperar: el job vuelve a correr en una hora.
    if not pg_try_advisory_xact_lock(hashtext('generate_invoices'), hashtext(org.id::text)) then
      continue;
    end if;

    -- "Hoy" en el box, no en UTC.
    v_today := (p_now at time zone org.timezone)::date;
    v_grace := coalesce((org.settings->>'grace_days')::int, 3);
    v_count := 0;

    for sub in
      select s.*, p.billing_period
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id
      where s.org_id = org.id
        and s.status = 'active'
        and s.started_on <= v_today
        and (s.ends_on is null or s.ends_on >= v_today)
        -- Una suscripción congelada (viaje, lesión) no genera cobro.
        and not (
          s.paused_from is not null and s.paused_from <= v_today
          and (s.paused_until is null or s.paused_until >= v_today)
        )
        and public.is_billing_day(s.billing_day, v_today)
    loop
      v_start := v_today;
      v_end   := (v_start + public.period_length(sub.billing_period) - interval '1 day')::date;

      -- El consecutivo se gasta solo si la factura se inserta de verdad. Por eso
      -- se comprueba antes en lugar de pedir el número y descartarlo: si no, cada
      -- reintento del job dejaría huecos en la numeración del box.
      if exists (
        select 1 from public.invoices i
        where i.subscription_id = sub.id
          and i.period_start = v_start
          and i.status <> 'void'
      ) then
        continue;
      end if;

      v_number := public.next_invoice_number(org.id);

      -- ON CONFLICT como red de seguridad: si dos procesos llegaran hasta aquí,
      -- el índice único (subscription_id, period_start) decide y el segundo no
      -- inserta nada.
      insert into public.invoices (
        org_id, athlete_id, subscription_id, number,
        period_start, period_end, issued_on, due_on, amount_cents
      )
      values (
        org.id, sub.athlete_id, sub.id, v_number,
        v_start, v_end, v_today, v_start + v_grace,
        sub.price_cents - sub.discount_cents
      )
      on conflict do nothing
      returning id into v_id;

      if v_id is not null then
        v_count := v_count + 1;
        v_id := null;
      end if;
    end loop;

    org_id := org.id;
    invoices_created := v_count;
    run_date := v_today;
    return next;
  end loop;
end;
$$;

comment on function public.generate_invoices is
  'Job diario de cobros. Idempotente, consciente de la zona horaria del box y de los meses cortos.';

-- -----------------------------------------------------------------------------
-- Marcar la mora
-- -----------------------------------------------------------------------------
create or replace function public.mark_overdue(p_now timestamptz default now())
returns table (invoices_marked int, athletes_marked int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv int;
  v_ath int;
begin
  with vencidas as (
    update public.invoices i
    set status = 'overdue'
    from public.organizations o
    where o.id = i.org_id
      and i.status in ('open','partial')
      and i.due_on < (p_now at time zone o.timezone)::date
    returning i.id
  )
  select count(*)::int into v_inv from vencidas;

  with morosos as (
    update public.athletes a
    set status = 'overdue'
    where a.status = 'active'
      and exists (
        select 1 from public.invoices i
        where i.athlete_id = a.id and i.status = 'overdue'
      )
    returning a.id
  )
  select count(*)::int into v_ath from morosos;

  invoices_marked := v_inv;
  athletes_marked := v_ath;
  return next;
end;
$$;

revoke all on function public.generate_invoices(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_overdue(timestamptz) from public, anon, authenticated;
revoke all on function public.next_invoice_number(uuid) from public, anon;
