-- =============================================================================
-- Tareas programadas: el motor corre solo
-- =============================================================================
-- Hasta aquí, generar cobros, marcar la mora, armar la parrilla de clases,
-- cerrar las clases pasadas, calcular el riesgo de fuga y encolar los avisos
-- eran funciones listas que nadie llamaba. "Cobros que se cobran solos" era
-- una promesa sin cron.
--
-- Todo lo de aquí es SQL puro y corre en cualquier Postgres con pg_cron
-- (Supabase en la nube y la imagen supabase/postgres lo traen). Lo que
-- necesita salir a internet —enviar por WhatsApp, cobrar en Wompi— lo hacen
-- las Edge Functions, que se programan aparte con net.http_post cuando estén
-- desplegadas (ver docs/12-debito-recurrente.md § Programarlo).
--
-- En CI (postgres:17 a secas) no hay pg_cron: se comprueba y se salta, para
-- que la migración no rompa la suite. Las funciones sí se crean siempre.
--
-- Horas en UTC. Bogotá es UTC-5 todo el año.
-- =============================================================================

-- ---- cerrar las clases que ya pasaron ---------------------------------------
-- `close_class` es por clase y la llama el coach a mano; esto la aplica a las
-- que terminaron hace más de media hora y todavía tienen reservas sin
-- resolver. Idempotente: una clase ya cerrada no tiene reservas 'booked'.
create or replace function public.close_finished_classes(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clase record;
  v_total int := 0;
begin
  for v_clase in
    select distinct c.id
    from public.classes c
    join public.reservations r on r.class_id = c.id and r.status in ('booked', 'waitlisted')
    where c.status = 'scheduled'
      and c.ends_at < p_now - interval '30 minutes'
  loop
    v_total := v_total + coalesce(public.close_class(v_clase.id, p_now), 0);
  end loop;
  return v_total;
end;
$$;

comment on function public.close_finished_classes is
  'Cierra (marca no-show) las clases terminadas hace más de 30 min. Para el cron; idempotente.';

revoke all on function public.close_finished_classes(timestamptz) from public, anon, authenticated;

-- ---- registro de cada corrida ------------------------------------------------
-- Cada tarea se envuelve para que quede en job_runs: si un día los cobros no
-- salen, lo primero es mirar ahí y no adivinar si el cron corrió.
create or replace function public.run_scheduled_job(p_job text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id bigint;
  v_n      int;
begin
  insert into public.job_runs (job, status) values (p_job, 'running') returning id into v_run_id;

  begin
    case p_job
      when 'generate_invoices' then
        select coalesce(sum(invoices_created), 0)::int into v_n from public.generate_invoices();
      when 'mark_overdue' then
        perform public.mark_overdue(); v_n := null;
      when 'generate_classes' then
        perform public.generate_classes(); v_n := null;
      when 'close_finished_classes' then
        v_n := public.close_finished_classes();
      when 'refresh_risk_scores' then
        perform public.refresh_risk_scores(); v_n := null;
      when 'run_automations' then
        perform public.run_automations(); v_n := null;
      when 'settle_simulated_messages' then
        v_n := public.settle_simulated_messages();
      when 'flush_recurring_notices' then
        perform public.flush_recurring_notices(); v_n := null;
      when 'charge_due_subscriptions' then
        perform public.charge_due_subscriptions(); v_n := null;
      when 'run_platform_dunning' then
        perform public.run_platform_dunning(); v_n := null;
      else
        raise exception 'Tarea desconocida: %', p_job;
    end case;

    update public.job_runs
       set status = 'ok', finished_at = now(), processed = v_n
     where id = v_run_id;
  exception when others then
    update public.job_runs
       set status = 'error', finished_at = now(), error = sqlerrm
     where id = v_run_id;
    raise;
  end;
end;
$$;

revoke all on function public.run_scheduled_job(text) from public, anon, authenticated;

-- ---- el calendario -----------------------------------------------------------
do $$
declare
  v_job record;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron no está disponible en este Postgres: las tareas no se programan (normal en CI).';
    return;
  end if;

  create extension if not exists pg_cron;

  -- Reprogramar desde cero: así la migración se puede volver a aplicar y el
  -- calendario queda exactamente como está escrito aquí.
  for v_job in select jobid from cron.job where jobname like 'scalar:%' loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  -- 06:00 Bogotá: primero las facturas del día, después la mora, después los
  -- cobros automáticos (sin factura no hay nada que cobrar).
  perform cron.schedule('scalar:generate_invoices',       '0 11 * * *',    $c$select public.run_scheduled_job('generate_invoices')$c$);
  perform cron.schedule('scalar:mark_overdue',            '10 11 * * *',   $c$select public.run_scheduled_job('mark_overdue')$c$);
  perform cron.schedule('scalar:charge_due_subscriptions','20 11 * * *',   $c$select public.run_scheduled_job('charge_due_subscriptions')$c$);
  perform cron.schedule('scalar:run_platform_dunning',    '30 11 * * *',   $c$select public.run_scheduled_job('run_platform_dunning')$c$);
  -- 03:00 Bogotá: la parrilla de la semana y el riesgo de fuga.
  perform cron.schedule('scalar:generate_classes',        '0 8 * * *',     $c$select public.run_scheduled_job('generate_classes')$c$);
  perform cron.schedule('scalar:refresh_risk_scores',     '30 8 * * *',    $c$select public.run_scheduled_job('refresh_risk_scores')$c$);
  -- Cada hora: reglas de mensajes, avisos de débito y clases ya terminadas.
  perform cron.schedule('scalar:run_automations',         '5 * * * *',     $c$select public.run_scheduled_job('run_automations')$c$);
  perform cron.schedule('scalar:settle_simulated',        '15 * * * *',    $c$select public.run_scheduled_job('settle_simulated_messages')$c$);
  perform cron.schedule('scalar:flush_recurring_notices', '25 * * * *',    $c$select public.run_scheduled_job('flush_recurring_notices')$c$);
  perform cron.schedule('scalar:close_finished_classes',  '*/30 * * * *',  $c$select public.run_scheduled_job('close_finished_classes')$c$);

  raise notice 'Programadas % tareas de Scalar en pg_cron.', (select count(*) from cron.job where jobname like 'scalar:%');
end $$;

do $$ begin perform public.assert_rls_enabled(); end $$;
