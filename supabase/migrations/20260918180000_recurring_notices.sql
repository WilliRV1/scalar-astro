-- =============================================================================
-- 0016 · Puente entre el débito automático y el motor de automatizaciones
-- =============================================================================
-- F5 marca los cobros que necesitan aviso (`recurring_charges.notice_pending`
-- con su `notice_kind`), pero nadie los enviaba: F4 y F5 se construyeron en
-- paralelo y ninguna de las dos podía tocar el archivo de la otra.
--
-- Sin este puente, a un atleta cuyo débito falla se le agotan los reintentos y
-- NO SE ENTERA: el box lo ve en mora y el atleta cree que está al día. Es el
-- peor momento posible para no avisar.
--
-- Se encola por la puerta única (`queue_automation_message`), que es la que
-- aplica opt-in, horario silencioso, antifatiga e idempotencia.
-- =============================================================================

-- Plantillas de fábrica (org_id null = catálogo global). Se copian a cada box
-- con `install_automation_defaults`, igual que las demás.
insert into public.message_templates (org_id, key, name, channel, category, body, variables, is_active)
values
  (null, 'debito_requiere_autorizacion', 'Débito requiere nueva autorización', 'whatsapp', 'utility',
   'Hola {{nombre}}, tu autorización de pago automático dejó de funcionar, así que tu mensualidad de {{valor}} quedó pendiente. Vuelve a autorizarla aquí: {{link}}',
   array['nombre','valor','link'], true),
  (null, 'debito_agotado', 'Débito agotado tras varios intentos', 'whatsapp', 'utility',
   'Hola {{nombre}}, intentamos cobrar tu mensualidad de {{valor}} varias veces y no fue posible. ¿Nos ayudas con el pago? {{link}}',
   array['nombre','valor','link'], true)
on conflict do nothing;

insert into public.automation_rules (
  org_id, key, name, trigger_type, trigger_config, action_type, is_active
)
values
  (null, 'debito_aviso', 'Aviso cuando falla el cobro automático',
   'event', '{"source":"recurring_charges"}'::jsonb, 'send_message', true)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Envía los avisos pendientes y los marca como atendidos.
-- Idempotente por el `dedupe_key`: el aviso de un intento concreto sale una vez.
-- -----------------------------------------------------------------------------
create or replace function public.flush_recurring_notices(
  p_org_id uuid default null,
  p_now    timestamptz default now()
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        record;
  v_rule   uuid;
  v_tpl    text;
  v_saldo  bigint;
  v_total  int := 0;
begin
  for c in
    select rc.*, i.amount_cents, i.paid_cents, i.number
    from public.recurring_charges rc
    join public.invoices i on i.id = rc.invoice_id
    where rc.notice_pending
      and (p_org_id is null or rc.org_id = p_org_id)
    order by rc.org_id
  loop
    select id into v_rule
    from public.automation_rules
    where org_id = c.org_id and key = 'debito_aviso' and is_active;

    -- Si el box desactivó la regla, el aviso se descarta en vez de quedarse
    -- pendiente para siempre acumulando ruido.
    if v_rule is null then
      update public.recurring_charges set notice_pending = false where id = c.id;
      continue;
    end if;

    -- Solo hay dos tipos de aviso, los que F5 marca de verdad:
    -- `needs_new_authorization` (el token dejó de servir) y `retries_exhausted`
    -- (se agotaron los intentos). No se avisa en cada fallo intermedio: el
    -- sistema reintenta solo y llenar el WhatsApp del atleta de avisos es la
    -- forma más rápida de que silencie al box.
    v_tpl := case c.notice_kind
               when 'needs_new_authorization' then 'debito_requiere_autorizacion'
               else 'debito_agotado'
             end;

    v_saldo := c.amount_cents - c.paid_cents;

    perform public.queue_automation_message(
      p_org_id       => c.org_id,
      p_rule_id      => v_rule,
      p_athlete_id   => c.athlete_id,
      p_template_key => v_tpl,
      -- <regla>:<entidad>:<periodo>, el formato del proyecto.
      p_dedupe_key   => 'debito_aviso:' || c.id::text || ':' || coalesce(c.attempt, 0)::text,
      p_vars         => jsonb_build_object(
                          'valor', to_char(v_saldo / 100.0, 'FM$999,999,999'),
                          'proximo_intento', coalesce(to_char(c.next_attempt_at, 'DD/MM'), 'pronto'),
                          'link', ''
                        ),
      p_now          => p_now,
      p_invoice_id   => c.invoice_id,
      p_audience     => 'athlete'
    );

    update public.recurring_charges set notice_pending = false where id = c.id;
    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

comment on function public.flush_recurring_notices is
  'Envía los avisos de cobro automático fallido por la puerta única de automatizaciones.';

revoke all on function public.flush_recurring_notices(uuid, timestamptz) from public, anon, authenticated;

-- =============================================================================
-- Levantar el corte de acceso al ponerse al día
-- =============================================================================
-- El motor de automatizaciones marca con la etiqueta `acceso_suspendido` al
-- atleta con mora larga, y el módulo de reservas la lee para no dejarlo
-- reservar. Pero NADIE se la quitaba al pagar: quien se ponía al día quedaba
-- bloqueado para siempre. Es la versión en reservas del peor bug del producto,
-- castigar a quien ya pagó.
--
-- El módulo de reservas se defendió exigiendo la etiqueta Y una factura vencida
-- viva, así que hoy nadie queda encerrado. Esto arregla la causa: la etiqueta
-- deja de mentir.
--
-- Prefijo `zzzz_` a propósito: Postgres dispara los triggers en orden
-- alfabético y este tiene que correr DESPUÉS de los que concilian la factura
-- (`payments_recalc_invoice`, `zz_payments_cancela_cobros`,
-- `zzz_payments_concilia_debito`). Si corriera antes, leería la factura sin el
-- pago aplicado y no levantaría nada.
-- =============================================================================
create or replace function public.lift_access_suspension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  update public.athletes a
  set tags = array_remove(a.tags, 'acceso_suspendido')
  where a.id = new.athlete_id
    and 'acceso_suspendido' = any(a.tags)
    and not exists (
      select 1 from public.invoices i
      where i.athlete_id = a.id
        and i.status in ('open','partial','overdue')
        and i.due_on < current_date
    );

  return new;
end;
$$;

create trigger zzzz_payments_levanta_suspension
  after insert or update on public.payments
  for each row execute function public.lift_access_suspension();

do $$ begin perform public.assert_rls_enabled(); end $$;
