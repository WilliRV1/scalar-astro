-- =============================================================================
-- Prueba del motor de automatizaciones
-- =============================================================================
-- Lo que se prueba aquí no es "que la función corra": son los errores que hacen
-- que un box cancele el servicio.
--
--   · Correr el job dos veces y cobrarle dos veces al mismo atleta.
--   · Seguir cobrándole a quien YA PAGÓ.
--   · Escribirle a las 3 de la mañana.
--   · Mandarle seis mensajes en una semana hasta que bloquea el número del box.
--   · Enviar de verdad durante la demo o la primera semana del cliente.
--   · Que las reglas de un box toquen a los atletas de otro.
--
-- Fechas fijas a propósito (p_now inyectado), igual que en billing_engine.sql.
-- =============================================================================

begin;

-- El box A es el que se prueba; el B existe solo para comprobar el aislamiento.
insert into public.organizations (id, slug, name, timezone, status, phone, settings) values
  ('0a000000-0000-4000-8000-000000000001', 'box-auto', 'Box Automatizado',
   'America/Bogota', 'active', '+573001112233',
   '{"grace_days": 3, "payment_link": "https://pagar.test/box-auto"}'),
  ('0a000000-0000-4000-8000-000000000002', 'box-otro', 'Box Vecino',
   'America/Bogota', 'active', '+573004445566', '{}');

-- El trigger de alta ya copió el catálogo. Se apaga la simulación para poder
-- probar el comportamiento real; hay una sección dedicada a encenderla.
update public.automation_settings set simulation_mode = false;

insert into public.athletes (id, org_id, first_name, last_name, phone, joined_on, status, consent_whatsapp_at) values
  ('aa000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'Vencimiento', 'Pérez',  '+573001000001', '2025-01-01', 'active', '2025-01-01'),
  ('aa000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000002'::uuid, 'Placeholder', null, null, '2025-01-01', 'active', null);

-- (el segundo se corrige abajo: pertenece al box B)
delete from public.athletes where id = 'aa000000-0000-4000-8000-000000000002';

insert into public.athletes (id, org_id, first_name, last_name, phone, joined_on, status, consent_whatsapp_at) values
  ('aa000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000001', 'Moroso',      'Gómez',  '+573001000002', '2025-01-01', 'active', '2025-01-01'),
  ('aa000000-0000-4000-8000-000000000003', '0a000000-0000-4000-8000-000000000001', 'Fatiga',      'Ruiz',   '+573001000003', '2025-01-01', 'active', '2025-01-01'),
  ('aa000000-0000-4000-8000-000000000004', '0a000000-0000-4000-8000-000000000001', 'Silencio',    'Mora',   '+573001000004', '2025-01-01', 'active', '2025-01-01'),
  ('aa000000-0000-4000-8000-000000000005', '0a000000-0000-4000-8000-000000000001', 'Simulado',    'Díaz',   '+573001000005', '2025-01-01', 'active', '2025-01-01'),
  ('aa000000-0000-4000-8000-000000000006', '0a000000-0000-4000-8000-000000000001', 'Fugado',      'Salas',  '+573001000006', '2025-01-01', 'active', '2025-01-01'),
  ('aa000000-0000-4000-8000-000000000007', '0a000000-0000-4000-8000-000000000001', 'Constante',   'Lozano', '+573001000007', '2025-01-01', 'active', '2025-01-01'),
  ('aa000000-0000-4000-8000-000000000008', '0a000000-0000-4000-8000-000000000001', 'Conciliado',  'Vargas', '+573001000008', '2025-01-01', 'active', '2025-01-01'),
  ('ab000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000002', 'Ajeno',       'Torres', '+573002000001', '2025-01-01', 'active', '2025-01-01');

insert into public.invoices (id, org_id, athlete_id, number, period_start, period_end, issued_on, due_on, amount_cents, status) values
  -- vence el 20 de marzo: los avisos caen el 15 (5 días) y el 18 (2 días)
  ('11000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'F-000001', '2026-03-01', '2026-03-31', '2026-03-01', '2026-03-20', 18000000, 'open'),
  -- venció el 10: los cobros caen el 11 (1 día), el 14 (4) y el 18 (8)
  ('11000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000002', 'F-000002', '2026-02-10', '2026-03-09', '2026-02-10', '2026-03-10', 18000000, 'open'),
  -- antifatiga: vence el 22, el aviso de 5 días cae el 17
  ('11000000-0000-4000-8000-000000000003', '0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000003', 'F-000003', '2026-03-01', '2026-03-31', '2026-03-01', '2026-03-22', 18000000, 'open'),
  -- horario silencioso: vence el 25, el aviso de 5 días cae el 20
  ('11000000-0000-4000-8000-000000000004', '0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'F-000004', '2026-03-01', '2026-03-31', '2026-03-01', '2026-03-25', 18000000, 'open'),
  -- simulación: vence el 30, el aviso de 5 días cae el 25
  ('11000000-0000-4000-8000-000000000005', '0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000005', 'F-000005', '2026-03-01', '2026-03-31', '2026-03-01', '2026-03-30', 18000000, 'open'),
  -- conciliación: venció el 12, el cobro cae el 13 (1 día)
  ('11000000-0000-4000-8000-000000000008', '0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000008', 'F-000008', '2026-02-12', '2026-03-11', '2026-02-12', '2026-03-12', 18000000, 'open'),
  -- box vecino: mismo calendario que el atleta A1, para el aislamiento
  ('11000000-0000-4000-8000-000000000009', '0a000000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000001', 'F-000001', '2026-03-01', '2026-03-31', '2026-03-01', '2026-03-20', 18000000, 'open');

create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  -- coalesce a propósito: `if not cond` con cond = NULL no entra al if, así que
  -- una aserción que compare contra una columna vacía o una subconsulta sin
  -- filas pasaría sin haber comprobado nada. Un NULL aquí es un fallo.
  if not coalesce(cond, false) then
    raise exception 'FALLO [%] (la condición dio %)', label, coalesce(cond::text, 'NULL');
  end if;
  raise notice '  ok · %', label;
end $$;

-- ============================ 1 · Catálogo de fábrica =======================
do $$
begin
  perform pg_temp.chk(
    (select count(*) from public.automation_rules where org_id is null) = 15,
    'el catálogo global trae las 15 reglas de fábrica');
  perform pg_temp.chk(
    (select count(*) from public.automation_rules
     where org_id = '0a000000-0000-4000-8000-000000000001') = 15,
    'dar de alta un box le copia las 15 reglas');
  perform pg_temp.chk(
    (select count(*) from public.message_templates
     where org_id = '0a000000-0000-4000-8000-000000000001') =
    (select count(*) from public.message_templates where org_id is null),
    'y le copia todas las plantillas para que pueda editar el texto');
  perform pg_temp.chk(
    not exists (
      select 1 from public.automation_rules r
      where r.org_id = '0a000000-0000-4000-8000-000000000001'
        and r.template_id in (select t.id from public.message_templates t where t.org_id is null)),
    'las reglas del box apuntan a SUS plantillas, no a las de fábrica');
  perform pg_temp.chk(
    (select install_automation_defaults from public.install_automation_defaults(
       '0a000000-0000-4000-8000-000000000001')) = 15,
    'volver a instalar el catálogo es idempotente: siguen siendo 15');
end $$;

-- ============================ 2 · Aviso de vencimiento ======================
-- 15 de marzo, 10:00 en Bogotá: faltan 5 días para el vencimiento del 20.
do $$
declare r record; m public.message_outbox%rowtype;
begin
  select * into r from public.run_automations(
    '0a000000-0000-4000-8000-000000000001', '2026-03-15 15:00:00+00');

  perform pg_temp.chk(r.run_date = '2026-03-15',
    'a las 15:00 UTC el job trabaja sobre el 15 de marzo de Bogotá');

  select * into m from public.message_outbox
  where athlete_id = 'aa000000-0000-4000-8000-000000000001';

  perform pg_temp.chk(m.id is not null,
    'a 5 días del vencimiento se encola el aviso');
  perform pg_temp.chk(m.dedupe_key = 'payment_due_soon:11000000-0000-4000-8000-000000000001:5',
    'el dedupe_key identifica regla, factura y periodo');
  perform pg_temp.chk(m.rendered_body like 'Hola Vencimiento,%',
    'la plantilla se renderiza con el nombre del atleta');
  perform pg_temp.chk(m.rendered_body like '%20/03/2026%' and m.rendered_body like '%$ 180.000%',
    'y con la fecha y el importe en pesos');
  perform pg_temp.chk(m.rendered_body like '%https://pagar.test/box-auto%',
    'y con el enlace de pago del box');
  perform pg_temp.chk(m.rendered_body not like '%{{%',
    'no queda ninguna variable sin reemplazar');
  perform pg_temp.chk(m.status = 'queued' and not m.simulated and m.invoice_id is not null,
    'queda encolado, sin simular y atado a su factura');
end $$;

-- ============================ 3 · Idempotencia ==============================
-- El error que hace que un cliente cancele: el job se reintenta, se despliega
-- dos veces o alguien lo dispara a mano, y el atleta recibe el mismo cobro dos
-- veces.
do $$
declare antes bigint; despues bigint; enc int;
begin
  select count(*) into antes from public.message_outbox;

  select sum(queued) into enc from public.run_automations(
    '0a000000-0000-4000-8000-000000000001', '2026-03-15 15:00:00+00');

  select count(*) into despues from public.message_outbox;

  perform pg_temp.chk(antes = despues and enc = 0,
    'correr el job dos veces el mismo día NO encola dos veces el mismo mensaje');

  -- Y una tercera, con otra hora del mismo día del box.
  perform public.run_automations('0a000000-0000-4000-8000-000000000001', '2026-03-15 22:00:00+00');
  perform pg_temp.chk((select count(*) from public.message_outbox) = despues,
    'ni a otra hora del mismo día');
end $$;

-- ============================ 4 · Aviso a 2 días ============================
do $$
begin
  perform public.run_automations('0a000000-0000-4000-8000-000000000001', '2026-03-18 15:00:00+00');

  perform pg_temp.chk(
    exists (select 1 from public.message_outbox
            where dedupe_key = 'payment_due_soon:11000000-0000-4000-8000-000000000001:2'),
    'a 2 días del vencimiento se encola el segundo aviso');
  perform pg_temp.chk(
    (select count(*) from public.message_outbox
     where athlete_id = 'aa000000-0000-4000-8000-000000000001') = 2,
    'y son exactamente dos avisos para esa factura, no más');
end $$;

-- ============================ 5 · Cobro vencido =============================
-- 1, 4 y 8 días después del vencimiento. A los 8, además, alerta al dueño.
do $$
begin
  perform public.run_automations('0a000000-0000-4000-8000-000000000001', '2026-03-11 15:00:00+00');
  perform pg_temp.chk(
    exists (select 1 from public.message_outbox
            where dedupe_key = 'payment_overdue:11000000-0000-4000-8000-000000000002:1'),
    'a 1 día de mora se encola el cobro');

  perform public.run_automations('0a000000-0000-4000-8000-000000000001', '2026-03-14 15:00:00+00');
  perform pg_temp.chk(
    exists (select 1 from public.message_outbox
            where dedupe_key = 'payment_overdue:11000000-0000-4000-8000-000000000002:4'),
    'a 4 días de mora, el segundo cobro');

  -- el 18 ya se corrió antes (aviso a 2 días del otro atleta): la mora de 8
  -- días de este atleta se encoló en esa misma pasada.
  perform pg_temp.chk(
    exists (select 1 from public.message_outbox
            where dedupe_key = 'payment_overdue:11000000-0000-4000-8000-000000000002:8'),
    'a 8 días de mora, el tercero');
  perform pg_temp.chk(
    exists (select 1 from public.message_outbox
            where dedupe_key = 'payment_overdue_staff:11000000-0000-4000-8000-000000000002'
              and audience = 'staff' and to_address = '+573001112233'),
    'y a los 8 días se le avisa al dueño, al teléfono del box');
  perform pg_temp.chk(
    (select count(*) from public.message_outbox
     where athlete_id = 'aa000000-0000-4000-8000-000000000002' and audience = 'athlete') = 3,
    'el atleta moroso recibe 3 cobros, ni uno más');
  perform pg_temp.chk(
    not exists (select 1 from public.message_outbox
                where dedupe_key like 'payment_overdue:%:2'),
    'y ningún cobro en los días que la regla no contempla');
end $$;

-- ============================ 6 · Un pago CANCELA el cobro ==================
-- El peor bug posible del producto: cobrarle a quien ya pagó. El mensaje se
-- encola a las 6:00, el atleta paga a las 9:00 y el enviador sale a las 10:00.
do $$
declare v_msg uuid;
begin
  perform public.run_automations('0a000000-0000-4000-8000-000000000001', '2026-03-13 15:00:00+00');

  select id into v_msg from public.message_outbox
  where dedupe_key = 'payment_overdue:11000000-0000-4000-8000-000000000008:1';

  perform pg_temp.chk(v_msg is not null, 'hay un cobro encolado para la factura F-000008');
  perform pg_temp.chk(
    (select status from public.message_outbox where id = v_msg) = 'queued',
    'y está en cola, listo para salir');

  insert into public.payments (org_id, athlete_id, invoice_id, amount_cents, method, status)
  values ('0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000008',
          '11000000-0000-4000-8000-000000000008', 18000000, 'nequi', 'confirmed');

  perform pg_temp.chk(
    (select status from public.message_outbox where id = v_msg) = 'cancelled',
    'al entrar el pago, el cobro encolado de ESA factura se CANCELA');
  perform pg_temp.chk(
    (select cancel_reason from public.message_outbox where id = v_msg) is not null,
    'y queda el motivo en la bitácora, para poder responderle al atleta');
  perform pg_temp.chk(
    (select status from public.invoices where id = '11000000-0000-4000-8000-000000000008') = 'paid',
    'la factura queda saldada (lo hace el trigger del motor de cobros)');
  perform pg_temp.chk(
    (select status from public.message_outbox
     where dedupe_key = 'payment_overdue:11000000-0000-4000-8000-000000000002:1') = 'queued',
    'y NO se cancelan los cobros de OTRAS facturas');

  -- Y al día siguiente ya no se le vuelve a cobrar.
  perform public.run_automations('0a000000-0000-4000-8000-000000000001', '2026-03-16 15:00:00+00');
  perform pg_temp.chk(
    not exists (select 1 from public.message_outbox
                where dedupe_key = 'payment_overdue:11000000-0000-4000-8000-000000000008:4'),
    'y a los 4 días ya no se le cobra: la factura está paga');
end $$;

-- ============================ 7 · Antifatiga ================================
-- Tope de 4 mensajes automáticos por atleta al mes. Un atleta que recibe cinco
-- deja de leerlos y bloquea el número del box.
do $$
begin
  insert into public.message_outbox
    (org_id, athlete_id, audience, to_address, rendered_body, dedupe_key, queued_for_day, template_key)
  values
    ('0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000003', 'athlete', '+573001000003', 'mensaje 1', 'prueba:fatiga:1', '2026-03-02', 'welcome'),
    ('0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000003', 'athlete', '+573001000003', 'mensaje 2', 'prueba:fatiga:2', '2026-03-04', 'welcome'),
    ('0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000003', 'athlete', '+573001000003', 'mensaje 3', 'prueba:fatiga:3', '2026-03-06', 'welcome'),
    ('0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000003', 'athlete', '+573001000003', 'mensaje 4', 'prueba:fatiga:4', '2026-03-08', 'welcome');

  -- El 17 le tocaría el aviso de vencimiento de la factura F-000003.
  perform public.run_automations('0a000000-0000-4000-8000-000000000001', '2026-03-17 15:00:00+00');

  perform pg_temp.chk(
    not exists (select 1 from public.message_outbox
                where dedupe_key = 'payment_due_soon:11000000-0000-4000-8000-000000000003:5'),
    'con 4 mensajes ya enviados en el mes, el quinto NO se encola');
  perform pg_temp.chk(
    (select count(*) from public.message_outbox
     where athlete_id = 'aa000000-0000-4000-8000-000000000003') = 4,
    'el atleta se queda exactamente en el tope del mes');

  -- En abril el contador vuelve a cero: la factura del 22 de abril avisa el 17.
  update public.invoices set due_on = '2026-04-22'
  where id = '11000000-0000-4000-8000-000000000003';
  perform public.run_automations('0a000000-0000-4000-8000-000000000001', '2026-04-17 15:00:00+00');
  perform pg_temp.chk(
    (select count(*) from public.message_outbox
     where athlete_id = 'aa000000-0000-4000-8000-000000000003') = 5,
    'y el tope es POR MES: en abril vuelve a recibir');
end $$;

-- ============================ 8 · Prioridad entre reglas ====================
-- "Si dos reglas coinciden el mismo día, gana la de mayor prioridad y la otra
-- se descarta" (docs/04 §Reglas duras, 5).
do $$
declare v_dia date; v_cuantos int;
begin
  -- El mismo atleta con una factura vencida hace 1 día y otra que vence en 5.
  insert into public.invoices (id, org_id, athlete_id, number, period_start, period_end, issued_on, due_on, amount_cents, status)
  values ('11000000-0000-4000-8000-00000000000a', '0a000000-0000-4000-8000-000000000001',
          'aa000000-0000-4000-8000-000000000004', 'F-00000A', '2026-05-01', '2026-05-31', '2026-05-01', '2026-05-09', 18000000, 'open'),
         ('11000000-0000-4000-8000-00000000000b', '0a000000-0000-4000-8000-000000000001',
          'aa000000-0000-4000-8000-000000000004', 'F-00000B', '2026-05-01', '2026-05-31', '2026-05-01', '2026-05-15', 18000000, 'open');

  perform public.run_automations('0a000000-0000-4000-8000-000000000001', '2026-05-10 15:00:00+00');

  select count(*) into v_cuantos from public.message_outbox
  where athlete_id = 'aa000000-0000-4000-8000-000000000004' and queued_for_day = '2026-05-10';

  perform pg_temp.chk(v_cuantos = 1,
    'dos reglas el mismo día para el mismo atleta: solo sale un mensaje');
  perform pg_temp.chk(
    exists (select 1 from public.message_outbox
            where athlete_id = 'aa000000-0000-4000-8000-000000000004'
              and queued_for_day = '2026-05-10'
              and template_key = 'payment_overdue'),
    'y el que sale es el de mayor prioridad: el cobro vencido gana al aviso');
end $$;

-- ============================ 9 · Horario silencioso ========================
-- Nada antes de las 8:00 ni después de las 21:00, HORA DEL BOX. Un job a las
-- 08:00 UTC son las 03:00 en Bogotá.
do $$
declare m public.message_outbox%rowtype;
begin
  perform public.run_automations('0a000000-0000-4000-8000-000000000001', '2026-03-20 08:00:00+00');

  select * into m from public.message_outbox
  where dedupe_key = 'payment_due_soon:11000000-0000-4000-8000-000000000004:5';

  perform pg_temp.chk(m.id is not null,
    'el mensaje de madrugada SÍ se encola (no se pierde)');
  perform pg_temp.chk(
    (m.scheduled_for at time zone 'America/Bogota')::time = '08:00:00'::time,
    'pero se programa para las 8:00 de la mañana del box, no para las 3');
  perform pg_temp.chk(
    (m.scheduled_for at time zone 'America/Bogota')::date = '2026-03-20',
    'y el mismo día, no al siguiente');

  -- Y al revés: a las 23:00 del box se corre al día siguiente.
  perform pg_temp.chk(
    (public.next_allowed_send_at('2026-03-20 04:00:00+00', 'America/Bogota', 8, 21)
       at time zone 'America/Bogota')::text = '2026-03-20 08:00:00',
    'las 23:00 del 19 en Bogotá se corren a las 8:00 del 20');
  perform pg_temp.chk(
    public.next_allowed_send_at('2026-03-20 18:00:00+00', 'America/Bogota', 8, 21)
      = '2026-03-20 18:00:00+00'::timestamptz,
    'y una hora permitida (13:00 del box) no se toca');
end $$;

-- ============================ 10 · Modo simulación ==========================
-- Imprescindible en la primera semana de cada cliente y en la demo de ventas:
-- se ve qué HABRÍA pasado, sin que salga un solo mensaje.
do $$
declare m public.message_outbox%rowtype; v_lote int;
begin
  update public.automation_settings set simulation_mode = true
  where org_id = '0a000000-0000-4000-8000-000000000001';

  perform public.run_automations('0a000000-0000-4000-8000-000000000001', '2026-03-25 15:00:00+00');

  select * into m from public.message_outbox
  where dedupe_key = 'payment_due_soon:11000000-0000-4000-8000-000000000005:5';

  perform pg_temp.chk(m.id is not null,
    'en modo simulación el mensaje SÍ se encola: hay que poder mostrarlo');
  perform pg_temp.chk(m.simulated,
    'y queda marcado como simulado');
  perform pg_temp.chk(m.sent_at is null,
    'sin fecha de envío: no salió nada');

  -- El enviador nunca lo toma.
  perform pg_temp.chk(
    not exists (select 1 from public.claim_outbox_batch(
      '0a000000-0000-4000-8000-000000000001', 50, '2026-03-26 15:00:00+00') c
      where c.id = m.id),
    'el enviador NO toma los mensajes simulados');

  -- Esa llamada tomó de paso el resto del lote: se devuelven a la cola para que
  -- la sección siguiente pruebe el envío desde el principio.
  update public.message_outbox set status = 'queued', attempts = 0 where status = 'sending';

  select public.settle_simulated_messages('0a000000-0000-4000-8000-000000000001', 100,
    '2026-03-26 15:00:00+00') into v_lote;
  perform pg_temp.chk(v_lote >= 1,
    'se liquidan como simulados para que la bitácora muestre qué habría pasado');
  perform pg_temp.chk(
    (select status from public.message_outbox where id = m.id) = 'simulated',
    'y el estado final del mensaje simulado es "simulated", no "sent"');

  update public.automation_settings set simulation_mode = false
  where org_id = '0a000000-0000-4000-8000-000000000001';
end $$;

-- ============================ 11 · Envío y reintentos =======================
do $$
declare v_id uuid; v_estado text; v_antes timestamptz;
begin
  select id, scheduled_for into v_id, v_antes from public.message_outbox
  where dedupe_key = 'payment_due_soon:11000000-0000-4000-8000-000000000001:5';

  perform pg_temp.chk(
    exists (select 1 from public.claim_outbox_batch(
      '0a000000-0000-4000-8000-000000000001', 50, '2026-03-26 15:00:00+00') c
      where c.id = v_id),
    'el enviador toma el mensaje encolado cuya hora ya llegó');
  perform pg_temp.chk(
    (select status from public.message_outbox where id = v_id) = 'sending',
    'y lo marca como "sending" para que otra instancia no lo mande otra vez');

  select public.mark_outbox_result(v_id, 'failed', 'cloud_api', null, 'error de red',
                                   null, 4, '2026-03-26 15:00:00+00') into v_estado;
  perform pg_temp.chk(v_estado = 'queued',
    'un fallo NO es definitivo: el mensaje vuelve a la cola');
  perform pg_temp.chk(
    (select scheduled_for from public.message_outbox where id = v_id) > '2026-03-26 15:00:00+00',
    'y se reprograma más tarde, con espera creciente');

  select public.mark_outbox_result(v_id, 'sent', 'wa_me', 'wamid.TEST', null,
                                   1000, 4, '2026-03-26 16:00:00+00') into v_estado;
  perform pg_temp.chk(v_estado = 'sent'
    and (select sent_at from public.message_outbox where id = v_id) is not null,
    'y cuando sale de verdad queda la fecha y el identificador del proveedor');
end $$;

-- ============================ 12 · Detección de fuga ========================
-- `attendances` la traen los módulos de entrenamiento y reservas, que van en
-- paralelo. El motor tiene que funcionar SIN ella y aprovecharla en cuanto
-- exista: por eso la señal va protegida con `automation_source_ready` y aquí la
-- tabla se crea solo si todavía falta.
do $$
begin
  if to_regclass('public.attendances') is null then
    execute $ddl$
      create table public.attendances (
        id         uuid primary key default gen_random_uuid(),
        org_id     uuid not null references public.organizations(id) on delete cascade,
        athlete_id uuid not null references public.athletes(id) on delete cascade,
        date       date not null,
        status     text not null default 'attended'
      )
    $ddl$;
    execute 'alter table public.attendances enable row level security';
  end if;
end $$;

do $$
begin
  perform pg_temp.chk(
    public.automation_source_ready('public.attendances',
      array['org_id','athlete_id','date','status']),
    'el motor detecta que ya existe la tabla de asistencias');
end $$;

-- Fugado: venía 12 veces al mes y lleva 14 días sin aparecer.
insert into public.attendances (org_id, athlete_id, date, status)
select '0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000006',
       '2026-03-20'::date - d, 'attended'
from unnest(array[14,18,22,32,34,36,38,40,42,44,46,48,50,52,54]) d;

-- Constante: viene igual de seguido que siempre y vino ayer.
insert into public.attendances (org_id, athlete_id, date, status)
select '0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000007',
       '2026-03-20'::date - d, 'attended'
from unnest(array[1,3,5,7,9,11,13,15,17,19,21,23,31,33,35,37,39,41,43,45,47,49,51,53]) d;

insert into public.movements (id, org_id, name, metric, unit)
values ('99000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001',
        'Back Squat', 'weight', 'kg');
insert into public.personal_records (org_id, athlete_id, movement_id, value_numeric, unit, achieved_on)
values ('0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000007',
        '99000000-0000-4000-8000-000000000001', 100, 'kg', '2026-02-01');

do $$
declare r record; fug public.athlete_risk_scores%rowtype; con public.athlete_risk_scores%rowtype;
begin
  select * into r from public.refresh_risk_scores(
    '0a000000-0000-4000-8000-000000000001', '2026-03-20 15:00:00+00');

  perform pg_temp.chk(r.computed_on = '2026-03-20' and r.athletes_scored >= 7,
    'el cálculo de riesgo corre sobre todos los atletas activos del box');

  select * into fug from public.athlete_risk_scores
  where athlete_id = 'aa000000-0000-4000-8000-000000000006' and computed_on = '2026-03-20';
  select * into con from public.athlete_risk_scores
  where athlete_id = 'aa000000-0000-4000-8000-000000000007' and computed_on = '2026-03-20';

  perform pg_temp.chk(fug.days_since_last_visit = 14,
    'el atleta fugado lleva 14 días sin venir');
  perform pg_temp.chk(fug.band = 'at_risk',
    'y entra en la banda at_risk (mensaje automático + tarea)');
  perform pg_temp.chk(fug.score = 58,
    'con 58 puntos: 28 por los 14 días + 20 por la caída + 10 por no registrar marcas');
  perform pg_temp.chk(
    fug.reasons::text like '%14 días sin venir%',
    'y el motivo viene escrito, que es lo que el coach necesita leer');
  perform pg_temp.chk(
    fug.reasons::text like '%caida_frecuencia%',
    'incluida la caída de frecuencia de 30 días contra los 30 anteriores');

  perform pg_temp.chk(con.band = 'ok' and con.score = 0,
    'el atleta que viene normal NO aparece en riesgo');
  perform pg_temp.chk(con.days_since_last_visit = 1,
    'y su última asistencia es de ayer');

  -- Volver a calcular el mismo día no duplica la foto.
  perform public.refresh_risk_scores('0a000000-0000-4000-8000-000000000001', '2026-03-20 18:00:00+00');
  perform pg_temp.chk(
    (select count(*) from public.athlete_risk_scores
     where athlete_id = 'aa000000-0000-4000-8000-000000000006' and computed_on = '2026-03-20') = 1,
    'recalcular el mismo día actualiza la foto, no la duplica');
end $$;

-- ============================ 13 · Mora y riesgo ============================
do $$
declare v public.athlete_risk_scores%rowtype;
begin
  select * into v from public.athlete_risk_scores
  where athlete_id = 'aa000000-0000-4000-8000-000000000002' and computed_on = '2026-03-20';
  perform pg_temp.chk(v.days_overdue = 10,
    'los días de mora entran como señal de riesgo');
  perform pg_temp.chk(v.band in ('watch','at_risk','critical'),
    'un atleta en mora no se queda en la banda ok');
end $$;

-- ============================ 14 · Aislamiento entre boxes ==================
do $$
begin
  perform pg_temp.chk(
    not exists (select 1 from public.message_outbox
                where org_id = '0a000000-0000-4000-8000-000000000002'),
    'correr las reglas de un box NO le encola nada al box vecino');
  perform pg_temp.chk(
    not exists (select 1 from public.message_outbox
                where athlete_id = 'ab000000-0000-4000-8000-000000000001'),
    'ni le escribe a sus atletas, aunque tengan la misma fecha de vencimiento');
  perform pg_temp.chk(
    not exists (select 1 from public.athlete_risk_scores
                where org_id = '0a000000-0000-4000-8000-000000000002'),
    'ni calcula el riesgo de los atletas de otro box');

  -- Y al correrlo para el vecino, sí le llega lo suyo y nada del box A.
  update public.automation_settings set simulation_mode = false
  where org_id = '0a000000-0000-4000-8000-000000000002';
  perform public.run_automations('0a000000-0000-4000-8000-000000000002', '2026-03-15 15:00:00+00');
  perform pg_temp.chk(
    (select count(*) from public.message_outbox
     where org_id = '0a000000-0000-4000-8000-000000000002') = 1,
    'el box vecino recibe su propio aviso cuando le corren sus reglas');
  perform pg_temp.chk(
    (select to_address from public.message_outbox
     where org_id = '0a000000-0000-4000-8000-000000000002') = '+573002000001',
    'y va al teléfono del atleta correcto');
end $$;

-- ============================ 15 · Reglas duras de mensajería ===============
do $$
declare v_antes bigint;
begin
  -- Sin teléfono no hay canal: no se encola basura.
  update public.athletes set phone = null
  where id = 'aa000000-0000-4000-8000-000000000005';
  select count(*) into v_antes from public.message_outbox;
  perform public.queue_automation_message(
    '0a000000-0000-4000-8000-000000000001', null, 'aa000000-0000-4000-8000-000000000005',
    'welcome', 'prueba:sin-telefono', '{}'::jsonb, '2026-06-01 15:00:00+00');
  perform pg_temp.chk((select count(*) from public.message_outbox) = v_antes,
    'a un atleta sin teléfono no se le encola nada');

  -- Marketing sin opt-in vigente: no se manda (requisito de Meta y de la ley).
  update public.athletes set consent_whatsapp_at = null
  where id = 'aa000000-0000-4000-8000-000000000006';
  perform public.queue_automation_message(
    '0a000000-0000-4000-8000-000000000001', null, 'aa000000-0000-4000-8000-000000000006',
    'winback_14d', 'prueba:sin-optin', '{}'::jsonb, '2026-06-01 15:00:00+00');
  perform pg_temp.chk(
    not exists (select 1 from public.message_outbox where dedupe_key = 'prueba:sin-optin'),
    'sin opt-in registrado no sale un mensaje de marketing');

  -- Salida fácil: el atleta pidió que no le escriban más.
  update public.athletes set consent_whatsapp_at = '2025-01-01', tags = array['no_marketing']
  where id = 'aa000000-0000-4000-8000-000000000006';
  perform public.queue_automation_message(
    '0a000000-0000-4000-8000-000000000001', null, 'aa000000-0000-4000-8000-000000000006',
    'winback_14d', 'prueba:no-marketing', '{}'::jsonb, '2026-06-02 15:00:00+00');
  perform pg_temp.chk(
    not exists (select 1 from public.message_outbox where dedupe_key = 'prueba:no-marketing'),
    'la etiqueta no_marketing se respeta: no se le vuelve a escribir');

  -- Pero lo transaccional (un cobro que él mismo espera) sí sale.
  perform public.queue_automation_message(
    '0a000000-0000-4000-8000-000000000001', null, 'aa000000-0000-4000-8000-000000000006',
    'payment_due_soon', 'prueba:utility-si', '{"nombre":"Fugado"}'::jsonb, '2026-06-03 15:00:00+00');
  perform pg_temp.chk(
    exists (select 1 from public.message_outbox where dedupe_key = 'prueba:utility-si'),
    'y un mensaje de cobro (utility) sí se le puede mandar');

  -- El interruptor general del box apaga todo.
  update public.automation_settings set is_enabled = false
  where org_id = '0a000000-0000-4000-8000-000000000001';
  perform public.queue_automation_message(
    '0a000000-0000-4000-8000-000000000001', null, 'aa000000-0000-4000-8000-000000000001',
    'payment_due_soon', 'prueba:apagado', '{}'::jsonb, '2026-06-04 15:00:00+00');
  perform pg_temp.chk(
    not exists (select 1 from public.message_outbox where dedupe_key = 'prueba:apagado'),
    'con las automatizaciones apagadas no se encola nada');
  update public.automation_settings set is_enabled = true
  where org_id = '0a000000-0000-4000-8000-000000000001';
end $$;

-- ============================ 16 · Render de plantillas =====================
do $$
begin
  perform pg_temp.chk(
    public.render_template('Hola {{nombre}}, son {{valor}}',
      '{"nombre":"Ana","valor":"$ 180.000"}'::jsonb) = 'Hola Ana, son $ 180.000',
    'el render reemplaza las variables por su valor');
  perform pg_temp.chk(
    public.render_template('Hola {{nombre}}{{sobra}}', '{"nombre":"Ana"}'::jsonb) = 'Hola Ana',
    'una variable sin valor se borra: nunca viaja un {{hueco}} al atleta');
  perform pg_temp.chk(
    public.formato_pesos(18000000) = '$ 180.000',
    'el dinero se muestra en pesos con separador de miles colombiano');
end $$;

-- ============================ 17 · RLS de las tablas nuevas =================
-- El aislamiento entre boxes no lo hace el frontend: lo hace la RLS. Aquí se
-- comprueba con usuarios de verdad, porque una política mal escrita no falla:
-- devuelve datos de más, en silencio.
insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'dueno@boxauto.co'),
  ('c1000000-0000-4000-8000-000000000002', 'coach@boxauto.co'),
  ('c1000000-0000-4000-8000-000000000003', 'dueno@boxvecino.co'),
  ('c1000000-0000-4000-8000-000000000004', 'atleta@boxauto.co');

insert into public.memberships (org_id, user_id, role, permissions, athlete_id) values
  ('0a000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'owner', '{}', null),
  ('0a000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'coach', '{}', null),
  ('0a000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003', 'owner', '{}', null),
  ('0a000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000004', 'athlete', '{}',
   'aa000000-0000-4000-8000-000000000001');

do $$
declare v_dueno bigint; v_coach bigint; v_vecino bigint; v_atleta bigint;
begin
  set local role authenticated;

  set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
  select count(*) into v_dueno from public.message_outbox;

  set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000002';
  select count(*) into v_coach from public.message_outbox;

  set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000003';
  select count(*) into v_vecino from public.message_outbox;

  set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000004';
  select count(*) into v_atleta from public.message_outbox;

  reset role;

  perform pg_temp.chk(v_dueno > 0, 'el dueño ve la bitácora de su box');
  perform pg_temp.chk(v_coach = v_dueno,
    'el coach también la ve: necesita saber qué se le escribió ya a un atleta');
  perform pg_temp.chk(v_vecino = 1,
    'el dueño del box vecino solo ve los mensajes de SU box');
  perform pg_temp.chk(v_atleta > 0 and v_atleta < v_dueno,
    'el atleta ve lo suyo, pero no toda la bitácora del box');
  perform pg_temp.chk(
    (select count(*) from public.message_outbox m
     where m.athlete_id = 'aa000000-0000-4000-8000-000000000001'
       and m.audience = 'athlete') = v_atleta,
    'y lo que ve es exactamente lo que se le mandó a él, nunca una alerta interna');
end $$;

do $$
declare v_reglas bigint; v_riesgo bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000003';
  select count(*) into v_reglas from public.automation_rules
  where org_id = '0a000000-0000-4000-8000-000000000001';
  select count(*) into v_riesgo from public.athlete_risk_scores
  where org_id = '0a000000-0000-4000-8000-000000000001';
  reset role;

  perform pg_temp.chk(v_reglas = 0, 'un box no ve las reglas de otro');
  perform pg_temp.chk(v_riesgo = 0, 'ni el riesgo de fuga de los atletas de otro');
end $$;

do $$
declare v_catalogo bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000002';
  select count(*) into v_catalogo from public.automation_rules where org_id is null;
  reset role;

  perform pg_temp.chk(v_catalogo = 15,
    'el catálogo de fábrica sí es visible para el staff: es lo que se muestra en la demo');
end $$;

rollback;

select 'MOTOR DE AUTOMATIZACIONES OK' as resultado;
