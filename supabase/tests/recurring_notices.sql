-- =============================================================================
-- Prueba del puente entre el débito automático y las automatizaciones
-- =============================================================================
-- F5 marca los cobros que necesitan aviso; F4 es quien sabe mandarlos. Se
-- construyeron en paralelo y ninguna podía tocar el archivo de la otra, así que
-- el enganche quedó sin hacer: a un atleta cuyo débito falla se le agotaban los
-- reintentos SIN ENTERARSE.
-- =============================================================================

begin;

create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then
    raise exception 'FALLO [%] (la condición dio %)', label, coalesce(cond::text, 'NULL');
  end if;
  raise notice '  ok · %', label;
end $$;

insert into auth.users (id, email) values
  ('d5000000-0000-4000-8000-000000000001', 'dueno@boxdebito.co');

insert into public.organizations (id, slug, name, timezone, status)
values ('0d000000-0000-4000-8000-000000000001', 'box-debito', 'Box Débito', 'America/Bogota', 'active');

insert into public.memberships (org_id, user_id, role)
values ('0d000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'owner');

insert into public.athletes (id, org_id, first_name, phone, consent_whatsapp_at)
values ('ad000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001',
        'Ana', '+573001110001', now());

insert into public.plans (id, org_id, name, price_cents)
values ('9d000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001', 'Mensualidad', 18000000);

insert into public.subscriptions (id, org_id, athlete_id, plan_id, price_cents, billing_day)
values ('5d000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000001', '9d000000-0000-4000-8000-000000000001', 18000000, 5);

insert into public.invoices (id, org_id, athlete_id, subscription_id, number,
                             period_start, period_end, due_on, amount_cents)
values ('1d000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-000000000001',
        'F-9001', '2026-09-05', '2026-10-04', '2026-09-08', 18000000);

-- Método tokenizado y autorización vigente: sin ellos no existe un cobro
-- recurrente del que avisar.
insert into public.payment_methods (id, org_id, athlete_id, kind, provider_source_id, masked_phone)
values ('9e000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000001', 'nequi', 'src_prueba_001', '300***0001');

insert into public.recurring_authorizations (id, org_id, athlete_id, payment_method_id,
                                             accepted_text, accepted_version)
values ('ae000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000001',
        'Autorizo a mi box a debitar mi mensualidad de forma automática cada mes.', 'v1');

-- El box arranca en modo simulación; para esta prueba se apaga, porque lo que
-- se comprueba es que el mensaje SE ENCOLA.
update public.automation_settings
set simulation_mode = false
where org_id = '0d000000-0000-4000-8000-000000000001';

-- ============================ 1 · Reintento programado ======================
insert into public.recurring_charges (
  id, org_id, athlete_id, invoice_id, payment_method_id, authorization_id,
  amount_cents, period_start, status, notice_pending, notice_kind,
  attempt, next_attempt_at, queued_at
)
values ('1c000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000001', '1d000000-0000-4000-8000-000000000001',
        '9e000000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001',
        18000000, '2026-09-05', 'failed', true, 'retries_exhausted', 4, '2026-09-11', now());

do $$
declare enviados int;
begin
  select public.flush_recurring_notices('0d000000-0000-4000-8000-000000000001', '2026-09-08 15:00:00+00')
    into enviados;

  perform pg_temp.chk(enviados = 1, 'se envía el aviso del cobro fallido');
  perform pg_temp.chk(
    exists (
      select 1 from public.message_outbox
      where athlete_id = 'ad000000-0000-4000-8000-000000000001'
        and template_key = 'debito_agotado'),
    'con la plantilla de agotado, no con la de volver a autorizar');
  perform pg_temp.chk(
    not (select notice_pending from public.recurring_charges
         where id = '1c000000-0000-4000-8000-000000000001'),
    'y el cobro queda marcado como avisado');
end $$;

-- ============================ 2 · Idempotencia ==============================
do $$
declare antes bigint; despues bigint;
begin
  select count(*) into antes from public.message_outbox;
  -- Se vuelve a marcar como pendiente el MISMO intento: el aviso ya salió.
  update public.recurring_charges set notice_pending = true
  where id = '1c000000-0000-4000-8000-000000000001';
  perform public.flush_recurring_notices('0d000000-0000-4000-8000-000000000001', '2026-09-08 16:00:00+00');
  select count(*) into despues from public.message_outbox;

  perform pg_temp.chk(antes = despues,
    'el mismo intento no genera dos avisos aunque se reprocese');
end $$;

-- ============================ 3 · Autorización caducada =====================
insert into public.recurring_charges (
  id, org_id, athlete_id, invoice_id, payment_method_id, authorization_id,
  amount_cents, period_start, status, notice_pending, notice_kind, attempt, queued_at
)
values ('1c000000-0000-4000-8000-000000000002', '0d000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000001', '1d000000-0000-4000-8000-000000000001',
        '9e000000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001',
        18000000, '2026-10-05', 'failed', true, 'needs_new_authorization', 2, now());

do $$ begin
  perform public.flush_recurring_notices('0d000000-0000-4000-8000-000000000001', '2026-09-09 15:00:00+00');
  perform pg_temp.chk(
    exists (
      select 1 from public.message_outbox
      where athlete_id = 'ad000000-0000-4000-8000-000000000001'
        and template_key = 'debito_requiere_autorizacion'),
    'un token revocado pide volver a autorizar, no anuncia otro reintento');
end $$;

-- ============================ 4 · Regla apagada =============================
-- Si el box desactivó la regla, el aviso se descarta en vez de quedarse
-- pendiente para siempre acumulando ruido en la cola.
update public.automation_rules set is_active = false
where org_id = '0d000000-0000-4000-8000-000000000001' and key = 'debito_aviso';

insert into public.recurring_charges (
  id, org_id, athlete_id, invoice_id, payment_method_id, authorization_id,
  amount_cents, period_start, status, notice_pending, notice_kind, attempt, queued_at
)
values ('1c000000-0000-4000-8000-000000000003', '0d000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000001', '1d000000-0000-4000-8000-000000000001',
        '9e000000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001',
        18000000, '2026-11-05', 'failed', true, 'retries_exhausted', 4, now());

do $$ begin
  perform public.flush_recurring_notices('0d000000-0000-4000-8000-000000000001', '2026-09-10 15:00:00+00');
  perform pg_temp.chk(
    not (select notice_pending from public.recurring_charges
         where id = '1c000000-0000-4000-8000-000000000003'),
    'con la regla apagada el aviso se descarta, no se queda pendiente para siempre');
end $$;

-- ============================ 5 · Levantar el corte de acceso ===============
do $$ begin
  -- Ana arrastra el corte de acceso y una factura vencida.
  update public.athletes
  set tags = array['acceso_suspendido']
  where id = 'ad000000-0000-4000-8000-000000000001';

  update public.invoices set due_on = current_date - 20, status = 'overdue'
  where id = '1d000000-0000-4000-8000-000000000001';

  -- Paga parcialmente: sigue debiendo, así que sigue suspendida.
  insert into public.payments (org_id, athlete_id, invoice_id, amount_cents, method)
  values ('0d000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
          '1d000000-0000-4000-8000-000000000001', 5000000, 'nequi');

  perform pg_temp.chk(
    (select 'acceso_suspendido' = any(tags) from public.athletes
     where id = 'ad000000-0000-4000-8000-000000000001'),
    'un abono parcial no levanta el corte: sigue debiendo');

  -- Ahora salda el resto.
  insert into public.payments (org_id, athlete_id, invoice_id, amount_cents, method)
  values ('0d000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
          '1d000000-0000-4000-8000-000000000001', 13000000, 'nequi');

  perform pg_temp.chk(
    (select not ('acceso_suspendido' = any(tags)) from public.athletes
     where id = 'ad000000-0000-4000-8000-000000000001'),
    'al ponerse al día se le levanta el corte de acceso automáticamente');
end $$;

rollback;

select 'AVISOS DE DÉBITO OK' as resultado;
