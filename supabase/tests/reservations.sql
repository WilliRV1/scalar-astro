-- =============================================================================
-- Prueba de horarios y reservas de clase
-- =============================================================================
-- Aquí un error no se ve: se ve el lunes a las 6 a. m., con dos atletas
-- discutiendo por un cupo, o con alguien al que le cobraron una clase que el
-- box canceló. Se prueban las ocho reglas de docs/03 §"Reglas de reserva" con
-- fechas fijas, más el aislamiento entre boxes.
--
-- La prueba de CONCURRENCIA va al final, fuera de la transacción: dos
-- conexiones de verdad peleándose el último cupo no se pueden simular dentro
-- de una sola sesión.
--
-- Hora de referencia: el box está en America/Bogota (UTC-5), así que
-- 2026-10-05 11:00+00 es el lunes 5 de octubre a las 6:00 a. m. en el box.
-- =============================================================================

begin;

insert into public.organizations (id, slug, name, timezone, status) values
  ('d0000000-0000-4000-8000-000000000001', 'box-reservas', 'Box Reservas', 'America/Bogota', 'active'),
  ('d0000000-0000-4000-8000-000000000002', 'box-vecino-r', 'Box Vecino',   'America/Bogota', 'active');

update public.reservation_settings set
  open_hours_before     = 168,   -- se abre una semana antes
  close_minutes_before  = 30,    -- se cierra 30 min antes
  cancel_minutes_before = 120,   -- se cancela sin costo hasta 2 h antes
  late_cancel_policy    = 'consume_credit',
  waitlist_enabled      = true,
  waitlist_max          = 3,
  block_when_overdue    = false, -- POR DEFECTO el moroso SÍ puede reservar
  no_show_policy        = 'record',
  no_show_consumes_credit = true
where org_id = 'd0000000-0000-4000-8000-000000000001';

insert into public.athletes (id, org_id, first_name, phone, tags) values
  ('da000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Ana',  '+573001110001', '{}'),
  ('da000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Beto', '+573001110002', '{}'),
  ('da000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'Caro', '+573001110003', '{}'),
  ('da000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'Dana', '+573001110004', '{}'),
  ('da000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001', 'Elmo', '+573001110005', '{}'),
  ('da000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001', 'Fabi', '+573001110006', '{acceso_suspendido}'),
  ('da000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000001', 'Gabo', '+573001110007', '{}'),
  ('da000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000001', 'Hugo', '+573001110008', '{}'),
  ('da000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000002', 'Ivan', '+573002220001', '{}'),
  ('da000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000001', 'Jota',  '+573001110009', '{}'),
  ('da000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000001', 'Karla', '+573001110010', '{}');

insert into public.plans (id, org_id, name, price_cents, billing_period, class_quota) values
  ('d9000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Ilimitado', 18000000, 'monthly', null),
  ('d9000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Bono 2',     8000000, 'monthly', 2),
  ('d9000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002', 'Ilimitado', 18000000, 'monthly', null),
  ('d9000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'Bono 8',    24000000, 'monthly', 8);

-- Elmo está congelado (viaje); Gabo no tiene suscripción ninguna.
insert into public.subscriptions
  (id, org_id, athlete_id, plan_id, price_cents, billing_day, started_on, status, paused_from, paused_until) values
  ('d5000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 18000000, 1, '2026-01-01', 'active', null, null),
  ('d5000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000001', 18000000, 1, '2026-01-01', 'active', null, null),
  ('d5000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000001', 18000000, 1, '2026-01-01', 'active', null, null),
  ('d5000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000004', 'd9000000-0000-4000-8000-000000000002',  8000000, 1, '2026-01-01', 'active', null, null),
  ('d5000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000005', 'd9000000-0000-4000-8000-000000000001', 18000000, 1, '2026-01-01', 'active', '2026-09-01', '2026-11-30'),
  ('d5000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000006', 'd9000000-0000-4000-8000-000000000001', 18000000, 1, '2026-01-01', 'active', null, null),
  ('d5000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000008', 'd9000000-0000-4000-8000-000000000001', 18000000, 1, '2026-01-01', 'active', null, null),
  ('d5000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000002', 'da000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000003', 18000000, 1, '2026-01-01', 'active', null, null),
  ('d5000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-00000000000a', 'd9000000-0000-4000-8000-000000000004', 24000000, 1, '2026-01-01', 'active', null, null),
  ('d5000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-00000000000b', 'd9000000-0000-4000-8000-000000000001', 18000000, 1, '2026-01-01', 'active', null, null);

-- Fabi debe la mensualidad de septiembre desde hace rato.
insert into public.invoices
  (org_id, athlete_id, subscription_id, number, period_start, period_end, due_on, amount_cents, status) values
  ('d0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000006', 'd5000000-0000-4000-8000-000000000006',
   'R-0001', '2026-09-01', '2026-09-30', '2026-09-05', 18000000, 'overdue');

-- Clases. Todas el mismo horario del box: 6:00 a. m. de Bogotá.
insert into public.classes (id, org_id, name, starts_at, ends_at, capacity) values
  ('dc000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'WOD',
   '2026-10-05 11:00:00+00', '2026-10-05 12:00:00+00', 2),
  ('dc000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'WOD',
   '2026-10-06 11:00:00+00', '2026-10-06 12:00:00+00', 5),
  ('dc000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'WOD',
   '2026-10-07 11:00:00+00', '2026-10-07 12:00:00+00', 5),
  ('dc000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'WOD',
   '2026-10-08 11:00:00+00', '2026-10-08 12:00:00+00', 5),
  ('dc000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000002', 'WOD',
   '2026-10-05 11:00:00+00', '2026-10-05 12:00:00+00', 5),
  ('dc000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001', 'WOD',
   '2026-10-09 11:00:00+00', '2026-10-09 12:00:00+00', 5);

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

/** Ejecuta algo que DEBE fallar y devuelve el mensaje de error. */
create or replace function pg_temp.falla(sentencia text)
returns text language plpgsql as $$
begin
  execute sentencia;
  return null;   -- no falló: quien llama lo detecta porque espera un texto
exception when others then
  return sqlerrm;
end $$;

-- ================== 1 · Festivos colombianos (regla 7) ======================
-- La Ley Emiliani corre siete festivos al lunes siguiente. Si esto se calcula
-- mal, la parrilla genera clases el día que el box está cerrado y alguien
-- reserva un 12 de enero que no existe.
do $$
begin
  perform pg_temp.chk(public.easter_sunday(2026) = '2026-04-05',
    'la Pascua de 2026 es el 5 de abril');
  perform pg_temp.chk(public.easter_sunday(2027) = '2027-03-28',
    'y la de 2027 el 28 de marzo');
  perform pg_temp.chk(public.is_colombian_holiday('2026-01-12'),
    'Reyes se corre al lunes 12 de enero (Ley Emiliani)');
  perform pg_temp.chk(not public.is_colombian_holiday('2026-01-06'),
    'y el 6 de enero deja de ser festivo');
  perform pg_temp.chk(public.is_colombian_holiday('2026-06-29'),
    'San Pedro cae lunes en 2026 y se queda donde está');
  perform pg_temp.chk(public.is_colombian_holiday('2026-08-07'),
    'la Batalla de Boyacá es fija: no se corre nunca');
  perform pg_temp.chk(not public.is_colombian_holiday('2026-08-10'),
    'y por eso el lunes siguiente al 7 de agosto es día normal');
  perform pg_temp.chk(public.is_colombian_holiday('2026-04-03'),
    'el Viernes Santo sale del cálculo de la Pascua');
  perform pg_temp.chk(public.is_colombian_holiday('2026-05-18'),
    'la Ascensión se corre al lunes 18 de mayo');
  perform pg_temp.chk((select count(*) from public.colombian_holidays(2026)) = 18
                  and (select count(*) from public.colombian_holidays(2027)) = 18,
    'Colombia tiene 18 festivos, y el cálculo no caduca en 2027');
end $$;

-- ================== 2 · Generación de la parrilla (regla 7) =================
-- Lunes 6:00 a. m., cupo 12. Se generan dos semanas desde el lunes 5 de enero
-- de 2026: el 5 ya empezó, el 12 es festivo (Reyes corrido) y el 19 es normal.
insert into public.class_templates (id, org_id, name, weekday, start_time, duration_min, capacity, valid_from)
values ('db000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
        'WOD', 1, '06:00', 60, 12, '2026-01-01');

do $$
declare r record; r2 record;
begin
  select * into r from public.generate_classes(
    'd0000000-0000-4000-8000-000000000001', '2026-01-05 12:00:00+00', 2);

  perform pg_temp.chk(r.classes_created = 1,
    'la parrilla genera solo el lunes 19: el 5 ya pasó y el 12 es festivo');
  perform pg_temp.chk(r.holidays_skipped = 1,
    'y deja constancia de que se saltó un festivo');
  perform pg_temp.chk(
    exists (select 1 from public.classes c
            where c.template_id = 'db000000-0000-4000-8000-000000000001'
              and c.starts_at = '2026-01-19 11:00:00+00'),
    'la clase queda a las 6:00 HORA DEL BOX, no a las 6:00 UTC');
  perform pg_temp.chk(
    not exists (select 1 from public.classes c
                where c.template_id = 'db000000-0000-4000-8000-000000000001'
                  and c.starts_at::date = '2026-01-12'),
    'no hay clase el festivo de Reyes');
  perform pg_temp.chk(
    (select capacity from public.classes c where c.starts_at = '2026-01-19 11:00:00+00') = 12,
    'la clase hereda el cupo de la plantilla');

  -- Idempotencia: el job semanal corre varias veces y no duplica la parrilla.
  select * into r2 from public.generate_classes(
    'd0000000-0000-4000-8000-000000000001', '2026-01-05 12:00:00+00', 2);
  perform pg_temp.chk(r2.classes_created = 0,
    'correr la generación dos veces NO duplica la parrilla');

  -- Un box que sí abre los festivos.
  update public.reservation_settings set skip_holidays = false
  where org_id = 'd0000000-0000-4000-8000-000000000001';
  select * into r2 from public.generate_classes(
    'd0000000-0000-4000-8000-000000000001', '2026-01-05 12:00:00+00', 2);
  perform pg_temp.chk(r2.classes_created = 1,
    'el box que abre los festivos sí recibe la clase del 12 de enero');
  update public.reservation_settings set skip_holidays = true
  where org_id = 'd0000000-0000-4000-8000-000000000001';
end $$;

-- ================== 3 · Ventanas de tiempo (regla 3) ========================
do $$
declare v_err text;
begin
  -- 15 días antes: la reserva todavía no abre (se abre 168 h antes).
  v_err := pg_temp.falla($q$
    select * from public.book_class('dc000000-0000-4000-8000-000000000001',
      'da000000-0000-4000-8000-000000000001', 'app', false, '2026-09-20 01:00:00+00') $q$);
  perform pg_temp.chk(v_err like 'Todavía no se abre la reserva%',
    'no se puede reservar antes de que abra la ventana');

  -- 15 minutos antes: ya cerró (se cierra 30 min antes).
  v_err := pg_temp.falla($q$
    select * from public.book_class('dc000000-0000-4000-8000-000000000001',
      'da000000-0000-4000-8000-000000000001', 'app', false, '2026-10-05 10:45:00+00') $q$);
  perform pg_temp.chk(v_err like 'Ya cerró la reserva%',
    'no se puede reservar 15 minutos antes si el box cierra a los 30');

  -- Dentro de la ventana: entra.
  perform pg_temp.chk(
    (select status from public.book_class('dc000000-0000-4000-8000-000000000001',
       'da000000-0000-4000-8000-000000000001', 'app', false, '2026-10-05 01:00:00+00')) = 'booked',
    'dentro de la ventana sí reserva');
end $$;

-- ================== 4 · Quién puede reservar (regla 2) ======================
do $$
declare v_err text; v_st record;
begin
  -- Congelado por viaje.
  v_err := pg_temp.falla($q$
    select * from public.book_class('dc000000-0000-4000-8000-000000000002',
      'da000000-0000-4000-8000-000000000005', 'app', false, '2026-10-05 01:00:00+00') $q$);
  perform pg_temp.chk(v_err like 'Tu membresía está congelada hasta el 30/11/2026%',
    'una membresía congelada no reserva, y se le dice hasta cuándo');

  -- Sin membresía.
  v_err := pg_temp.falla($q$
    select * from public.book_class('dc000000-0000-4000-8000-000000000002',
      'da000000-0000-4000-8000-000000000007', 'app', false, '2026-10-05 01:00:00+00') $q$);
  perform pg_temp.chk(v_err like 'No tienes una membresía activa%',
    'sin membresía activa no se reserva');

  -- MORA con el interruptor APAGADO (el valor de fábrica): sí puede.
  perform pg_temp.chk(
    (select status from public.book_class('dc000000-0000-4000-8000-000000000002',
       'da000000-0000-4000-8000-000000000006', 'app', false, '2026-10-05 01:00:00+00')) = 'booked',
    'por defecto el atleta en mora SÍ puede reservar: la puerta la cierra el dueño');

  -- El box enciende el interruptor.
  update public.reservation_settings set block_when_overdue = true
  where org_id = 'd0000000-0000-4000-8000-000000000001';

  v_err := pg_temp.falla($q$
    select * from public.book_class('dc000000-0000-4000-8000-000000000003',
      'da000000-0000-4000-8000-000000000006', 'app', false, '2026-10-05 01:00:00+00') $q$);
  perform pg_temp.chk(v_err like 'Tienes una mensualidad vencida desde el 05/09/2026%',
    'con el interruptor encendido el moroso no reserva, y se le dice desde cuándo');

  -- Y al que está al día no le pasa nada.
  perform pg_temp.chk(
    (select status from public.book_class('dc000000-0000-4000-8000-000000000003',
       'da000000-0000-4000-8000-000000000002', 'app', false, '2026-10-05 01:00:00+00')) = 'booked',
    'el interruptor de mora no toca a quien está al día');

  -- Fabi paga. La etiqueta `acceso_suspendido` sigue puesta (hoy nada la
  -- quita), pero sin factura vencida vuelve a poder reservar: es el bug de
  -- "ya pagué y me siguen bloqueando" y no puede ocurrir.
  update public.invoices set status = 'paid', paid_cents = amount_cents
  where athlete_id = 'da000000-0000-4000-8000-000000000006';
  select * into v_st from private.booking_eligibility(
    'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000006',
    '2026-10-05 01:00:00+00');
  perform pg_temp.chk(v_st.reason is null,
    'quien se pone al día vuelve a reservar aunque le quede la etiqueta vieja');

  update public.reservation_settings set block_when_overdue = false
  where org_id = 'd0000000-0000-4000-8000-000000000001';
end $$;

-- ================== 5 · Bono de clases (regla 2) ============================
-- Dana tiene un plan de 2 clases al mes. La tercera no entra.
do $$
declare v_err text; v_st record;
begin
  perform public.book_class('dc000000-0000-4000-8000-000000000002',
    'da000000-0000-4000-8000-000000000004', 'app', false, '2026-10-05 01:00:00+00');
  perform public.book_class('dc000000-0000-4000-8000-000000000003',
    'da000000-0000-4000-8000-000000000004', 'app', false, '2026-10-05 01:00:00+00');

  perform pg_temp.chk(
    (select count(*) from public.reservations r
     where r.athlete_id = 'da000000-0000-4000-8000-000000000004' and r.consumed_credit) = 2,
    'cada reserva de un plan por bonos gasta una clase');

  v_err := pg_temp.falla($q$
    select * from public.book_class('dc000000-0000-4000-8000-000000000004',
      'da000000-0000-4000-8000-000000000004', 'app', false, '2026-10-05 01:00:00+00') $q$);
  perform pg_temp.chk(v_err like 'Ya usaste las 2 clases de tu plan Bono 2%',
    'agotado el bono no se reserva más, y se dice cuántas eran');

  -- El plan ilimitado no gasta nada.
  select * into v_st from private.booking_eligibility(
    'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001',
    '2026-10-05 01:00:00+00');
  perform pg_temp.chk(v_st.consumes_credit = false and v_st.credits_left is null,
    'un plan ilimitado no descuenta clases');
end $$;

-- ================== 6 · Cupo, lista de espera y doble reserva ===============
-- La clase 1 tiene cupo 2 y Ana ya está dentro (sección 3).
do $$
declare v_err text; r record;
begin
  perform pg_temp.chk(
    (select status from public.book_class('dc000000-0000-4000-8000-000000000001',
       'da000000-0000-4000-8000-000000000002', 'app', false, '2026-10-05 01:00:00+00')) = 'booked',
    'el segundo cupo de una clase de 2 se entrega');

  -- Tercero: no cabe, va a la lista de espera.
  select * into r from public.book_class('dc000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000003', 'app', false, '2026-10-05 01:00:00+00');
  perform pg_temp.chk(r.status = 'waitlisted' and r.waitlist_pos = 1,
    'el tercero entra a la lista de espera en la posición 1');
  perform pg_temp.chk(r.message like '%lista de espera%',
    'y se le dice, no se le deja un botón gris');

  -- Cuarto: posición 2.
  select * into r from public.book_class('dc000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000008', 'app', false, '2026-10-05 01:00:00+00');
  perform pg_temp.chk(r.waitlist_pos = 2,
    'el cuarto queda detrás del tercero, no delante');

  -- Estar en la lista NO gasta el bono.
  perform pg_temp.chk(
    (select not consumed_credit from public.reservations
     where class_id = 'dc000000-0000-4000-8000-000000000001'
       and athlete_id = 'da000000-0000-4000-8000-000000000008'),
    'estar en la lista de espera no gasta una clase del bono');

  -- Los contadores desnormalizados cuadran.
  select * into r from public.classes where id = 'dc000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(r.reserved_count = 2 and r.waitlist_count = 2,
    'los contadores de la clase reflejan 2 reservados y 2 en espera');

  -- Nadie reserva dos veces la misma clase.
  v_err := pg_temp.falla($q$
    select * from public.book_class('dc000000-0000-4000-8000-000000000001',
      'da000000-0000-4000-8000-000000000001', 'app', false, '2026-10-05 01:00:00+00') $q$);
  perform pg_temp.chk(v_err = 'Ya tienes reservada esa clase.',
    'un atleta no puede reservar dos veces la misma clase');

  v_err := pg_temp.falla($q$
    select * from public.book_class('dc000000-0000-4000-8000-000000000001',
      'da000000-0000-4000-8000-000000000003', 'app', false, '2026-10-05 01:00:00+00') $q$);
  perform pg_temp.chk(v_err like 'Ya estás en la lista de espera%',
    'ni entrar dos veces a la lista de espera');
end $$;

-- ================== 7 · Cancelar y ascender la lista (regla 4) ==============
do $$
declare r record; v_res uuid;
begin
  select id into v_res from public.reservations
  where class_id = 'dc000000-0000-4000-8000-000000000001'
    and athlete_id = 'da000000-0000-4000-8000-000000000001';

  select * into r from public.cancel_reservation(v_res, '2026-10-05 01:00:00+00');

  perform pg_temp.chk(r.cancelled and not r.late,
    'cancelar con 10 horas de antelación no tiene penalización');
  perform pg_temp.chk(
    r.promoted_athlete = 'da000000-0000-4000-8000-000000000003',
    'el PRIMERO de la lista pasa a reservado, no el último en llegar');
  perform pg_temp.chk(
    (select status from public.reservations where id = r.promoted_id) = 'booked'
    and (select waitlist_pos from public.reservations where id = r.promoted_id) is null,
    'y el ascenso ocurre dentro de la MISMA transacción, no en un job');
  perform pg_temp.chk(
    (select promoted_at from public.reservations where id = r.promoted_id) is not null,
    'queda registrado cuándo ascendió');

  -- Regla 11 de docs/04: el aviso queda encolado por la única puerta.
  perform pg_temp.chk(
    exists (select 1 from public.message_outbox m
            where m.template_key = 'waitlist_slot'
              and m.athlete_id = 'da000000-0000-4000-8000-000000000003'
              and m.dedupe_key = 'waitlist_slot:' || r.promoted_id::text),
    'queda encolado el aviso de cupo liberado para quien ascendió');

  select * into r from public.classes where id = 'dc000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(r.reserved_count = 2 and r.waitlist_count = 1,
    'la clase sigue llena: el cupo no se perdió, cambió de dueño');
end $$;

-- ================== 8 · Cancelación fuera de plazo (regla 3) ================
do $$
declare r record; v_res uuid;
begin
  -- Beto cancela a 1 hora de la clase; el plazo del box son 2 horas y la
  -- política es 'consume_credit'. Beto tiene plan ilimitado, así que no hay
  -- crédito que gastar, pero la cancelación queda marcada como tardía.
  select id into v_res from public.reservations
  where class_id = 'dc000000-0000-4000-8000-000000000001'
    and athlete_id = 'da000000-0000-4000-8000-000000000002';
  select * into r from public.cancel_reservation(v_res, '2026-10-05 10:00:00+00');
  perform pg_temp.chk(r.late,
    'cancelar 1 hora antes con plazo de 2 se marca como fuera de plazo');
  perform pg_temp.chk(
    (select late_cancel from public.reservations where id = v_res),
    'y queda guardado: el box distingue "avisó tarde" de "no avisó"');

  -- El mismo caso con un plan por bonos: la clase NO se devuelve.
  perform public.book_class('dc000000-0000-4000-8000-000000000004',
    'da000000-0000-4000-8000-00000000000a', 'app', false, '2026-10-05 01:00:00+00');
  select id into v_res from public.reservations
  where class_id = 'dc000000-0000-4000-8000-000000000004'
    and athlete_id = 'da000000-0000-4000-8000-00000000000a';
  perform pg_temp.chk((select consumed_credit from public.reservations where id = v_res),
    'reservar con plan por bonos gasta la clase antes de cancelar');
  select * into r from public.cancel_reservation(v_res, '2026-10-08 10:00:00+00');
  perform pg_temp.chk(r.late and not r.credit_returned
    and (select consumed_credit from public.reservations where id = v_res),
    'con política consume_credit, cancelar tarde NO devuelve la clase del bono');

  -- El box cambia de política a "cuenta como falta".
  update public.reservation_settings set late_cancel_policy = 'no_show'
  where org_id = 'd0000000-0000-4000-8000-000000000001';
  perform public.book_class('dc000000-0000-4000-8000-000000000002',
    'da000000-0000-4000-8000-000000000001', 'app', false, '2026-10-05 01:00:00+00');
  select id into v_res from public.reservations
  where class_id = 'dc000000-0000-4000-8000-000000000002'
    and athlete_id = 'da000000-0000-4000-8000-000000000001';
  select * into r from public.cancel_reservation(v_res, '2026-10-06 10:00:00+00');
  perform pg_temp.chk(r.counted_as_no_show
    and (select status from public.reservations where id = v_res) = 'no_show',
    'con política no_show, cancelar fuera de plazo pesa igual que no aparecer');

  update public.reservation_settings set late_cancel_policy = 'consume_credit'
  where org_id = 'd0000000-0000-4000-8000-000000000001';
end $$;

-- ================== 9 · No-show (regla 5) ===================================
do $$
declare v_n int; v_err text; v_st record;
begin
  -- Caro quedó reservada en la clase 1 (ascendió) y no aparece. Fabi se queda
  -- esperando un cupo que nunca se libera.
  update public.reservation_settings set no_show_consumes_credit = true
  where org_id = 'd0000000-0000-4000-8000-000000000001';

  perform pg_temp.chk(
    (select status from public.book_class('dc000000-0000-4000-8000-000000000001',
       'da000000-0000-4000-8000-000000000006', 'app', false, '2026-10-05 01:00:00+00')) = 'waitlisted',
    'la clase vuelve a estar llena y el siguiente entra a la lista');

  v_n := public.close_class('dc000000-0000-4000-8000-000000000001', '2026-10-05 12:30:00+00');
  perform pg_temp.chk(v_n >= 1,
    'al cerrar la clase, lo que quedó reservado pasa a falta');
  perform pg_temp.chk(
    (select status from public.reservations
     where class_id = 'dc000000-0000-4000-8000-000000000001'
       and athlete_id = 'da000000-0000-4000-8000-000000000003') = 'no_show',
    'quien reservó y no llegó queda registrado como falta');
  perform pg_temp.chk(
    not exists (select 1 from public.reservations
                where class_id = 'dc000000-0000-4000-8000-000000000001'
                  and status = 'waitlisted'),
    'la lista de espera que nunca entró se cierra sin penalización');

  -- El bono: el box decide si la falta lo consume.
  update public.reservation_settings set no_show_consumes_credit = false
  where org_id = 'd0000000-0000-4000-8000-000000000001';
  perform public.book_class('dc000000-0000-4000-8000-000000000006',
    'da000000-0000-4000-8000-00000000000a', 'app', false, '2026-10-05 01:00:00+00');
  v_n := public.close_class('dc000000-0000-4000-8000-000000000006', '2026-10-09 12:30:00+00');
  perform pg_temp.chk(
    (select not consumed_credit from public.reservations
     where class_id = 'dc000000-0000-4000-8000-000000000006'
       and athlete_id = 'da000000-0000-4000-8000-00000000000a'),
    'con no_show_consumes_credit apagado, la falta NO le gasta el bono');

  -- Bloqueo tras M faltas. Karla acumula exactamente 3 en la ventana, la
  -- última el 30 de septiembre: el bloqueo va hasta el 7 de octubre.
  update public.reservation_settings
  set no_show_policy = 'block', no_show_threshold = 3,
      no_show_window_days = 30, no_show_block_days = 7
  where org_id = 'd0000000-0000-4000-8000-000000000001';

  insert into public.classes (id, org_id, name, starts_at, ends_at, capacity) values
    ('dc000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000001', 'WOD',
     '2026-09-28 11:00:00+00', '2026-09-28 12:00:00+00', 5),
    ('dc000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000001', 'WOD',
     '2026-09-29 11:00:00+00', '2026-09-29 12:00:00+00', 5),
    ('dc000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-000000000001', 'WOD',
     '2026-09-30 11:00:00+00', '2026-09-30 12:00:00+00', 5);
  insert into public.reservations (org_id, class_id, athlete_id, status) values
    ('d0000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-00000000000a', 'da000000-0000-4000-8000-00000000000b', 'no_show'),
    ('d0000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-00000000000b', 'da000000-0000-4000-8000-00000000000b', 'no_show'),
    ('d0000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-00000000000c', 'da000000-0000-4000-8000-00000000000b', 'no_show');

  v_err := pg_temp.falla($q$
    select * from public.book_class('dc000000-0000-4000-8000-000000000003',
      'da000000-0000-4000-8000-00000000000b', 'app', false, '2026-10-05 01:00:00+00') $q$);
  perform pg_temp.chk(v_err = 'Tienes 3 faltas sin cancelar. Puedes volver a reservar el 07/10/2026.',
    'tras 3 faltas se bloquea la reserva y se le dice hasta qué día');

  -- Con dos faltas todavía no pasa nada: el umbral es del box.
  update public.reservation_settings set no_show_threshold = 4
  where org_id = 'd0000000-0000-4000-8000-000000000001';
  select * into v_st from private.booking_eligibility(
    'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-00000000000b',
    '2026-10-05 01:00:00+00');
  perform pg_temp.chk(v_st.reason is null,
    'con el umbral en 4, las mismas 3 faltas no bloquean nada');
  update public.reservation_settings set no_show_threshold = 3
  where org_id = 'd0000000-0000-4000-8000-000000000001';

  -- Pasados los 7 días de castigo vuelve a reservar sola: nadie tiene que
  -- acordarse de levantarle el bloqueo.
  select * into v_st from private.booking_eligibility(
    'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-00000000000b',
    '2026-10-08 01:00:00+00');
  perform pg_temp.chk(v_st.reason is null,
    'el bloqueo se levanta solo al pasar los días que fijó el box');

  -- Con la política en 'record' las faltas solo quedan registradas.
  update public.reservation_settings set no_show_policy = 'record'
  where org_id = 'd0000000-0000-4000-8000-000000000001';
  select * into v_st from private.booking_eligibility(
    'd0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-00000000000b',
    '2026-10-05 01:00:00+00');
  perform pg_temp.chk(v_st.reason is null,
    'con la política en "solo registrar" las faltas no bloquean nada');
end $$;

-- ================== 10 · Cancelar la clase entera (regla 6) =================
do $$
declare r record;
begin
  -- Dana (bono) y Beto ya tienen reservada la clase del 7 desde las secciones
  -- anteriores; a Dana le costó una clase de su bono.
  perform pg_temp.chk(
    (select consumed_credit from public.reservations
     where class_id = 'dc000000-0000-4000-8000-000000000003'
       and athlete_id = 'da000000-0000-4000-8000-000000000004'),
    'antes de cancelar, la clase del bono está consumida');

  select * into r from public.cancel_class('dc000000-0000-4000-8000-000000000003',
    'el coach está enfermo', '2026-10-06 14:00:00+00');

  perform pg_temp.chk(
    (select status from public.classes where id = 'dc000000-0000-4000-8000-000000000003') = 'cancelled',
    'la clase queda cancelada con su motivo');
  perform pg_temp.chk(r.notified >= 1,
    'se avisa a los reservados');
  perform pg_temp.chk(r.credits_returned >= 1,
    'y se devuelven los créditos consumidos');
  perform pg_temp.chk(
    (select not consumed_credit from public.reservations
     where class_id = 'dc000000-0000-4000-8000-000000000003'
       and athlete_id = 'da000000-0000-4000-8000-000000000004'),
    'que el box cancele no le puede costar una clase al atleta');
  perform pg_temp.chk(
    exists (select 1 from public.message_outbox m
            where m.template_key = 'class_cancelled'
              and m.rendered_body like '%el coach está enfermo%'),
    'el aviso lleva el motivo que escribió el coach');
  perform pg_temp.chk(
    (select count(*) from public.reservations r2
     where r2.class_id = 'dc000000-0000-4000-8000-000000000003'
       and r2.status <> 'cancelled') = 0,
    'no queda nadie reservado en una clase cancelada');

  perform pg_temp.chk(
    pg_temp.falla($q$ select * from public.book_class('dc000000-0000-4000-8000-000000000003',
      'da000000-0000-4000-8000-000000000001', 'app', false, '2026-10-05 01:00:00+00') $q$)
      like 'Esa clase está cancelada%',
    'y nadie puede reservar una clase cancelada');
end $$;

-- ================== 11 · La asistencia sale de la reserva (regla 8) =========
do $$
declare v_id uuid; v_err text;
begin
  perform public.book_class('dc000000-0000-4000-8000-000000000002',
    'da000000-0000-4000-8000-000000000002', 'app', false, '2026-10-05 01:00:00+00');

  v_id := public.check_in('dc000000-0000-4000-8000-000000000002',
    'da000000-0000-4000-8000-000000000002', true, '2026-10-06 11:05:00+00');

  perform pg_temp.chk(
    (select status from public.reservations where id = v_id) = 'attended',
    'el check-in marca la reserva como asistida');
  perform pg_temp.chk(
    exists (select 1 from public.attendances a
            where a.athlete_id = 'da000000-0000-4000-8000-000000000002'
              and a.class_id = 'dc000000-0000-4000-8000-000000000002'
              and a.date = '2026-10-06'),
    'y la asistencia aparece sola en attendances, con la fecha DEL BOX');

  -- Deshacer: el coach marcó al que no era.
  perform public.check_in('dc000000-0000-4000-8000-000000000002',
    'da000000-0000-4000-8000-000000000002', false, '2026-10-06 11:06:00+00');
  perform pg_temp.chk(
    not exists (select 1 from public.attendances a
                where a.athlete_id = 'da000000-0000-4000-8000-000000000002'
                  and a.class_id = 'dc000000-0000-4000-8000-000000000002'),
    'deshacer el check-in se lleva la asistencia: la fuga no lo cuenta como visita');

  -- Llegó sin reservar y el box lo permite.
  v_id := public.check_in('dc000000-0000-4000-8000-000000000002',
    'da000000-0000-4000-8000-00000000000b', true, '2026-10-06 11:07:00+00');
  perform pg_temp.chk(
    (select source from public.reservations where id = v_id) = 'walk_in',
    'a quien llega sin reservar se le hace check-in igual');

  -- Un box que no lo permite.
  update public.reservation_settings set allow_walk_in = false
  where org_id = 'd0000000-0000-4000-8000-000000000001';
  v_err := pg_temp.falla($q$ select public.check_in('dc000000-0000-4000-8000-000000000002',
    'da000000-0000-4000-8000-000000000003', true, '2026-10-06 11:08:00+00') $q$);
  perform pg_temp.chk(v_err = 'Este box no permite entrar sin reserva.',
    'y el box que no lo permite lo dice con todas las letras');
  update public.reservation_settings set allow_walk_in = true
  where org_id = 'd0000000-0000-4000-8000-000000000001';

  -- El check-in manual del piso del box (F2), sin clase, sigue funcionando.
  insert into public.attendances (org_id, athlete_id, date)
  values ('d0000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000007', '2026-10-06');
  perform pg_temp.chk(
    exists (select 1 from public.attendances a
            where a.athlete_id = 'da000000-0000-4000-8000-000000000007' and a.class_id is null),
    'el check-in manual sin reserva sigue existiendo');
end $$;

-- ================== 12 · Aislamiento entre boxes ============================
insert into auth.users (id, email) values
  ('d1000000-0000-4000-8000-000000000001', 'coach@boxreservas.co'),
  ('d1000000-0000-4000-8000-000000000002', 'ana@boxreservas.co'),
  ('d1000000-0000-4000-8000-000000000003', 'dueno@boxvecino.co');

insert into public.memberships (org_id, user_id, role, athlete_id) values
  ('d0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'coach',   null),
  ('d0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'athlete', 'da000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000003', 'owner',   null);

do $$
declare v_coach bigint; v_atleta bigint; v_vecino bigint; v_res bigint; v_err text;
begin
  set local role authenticated;

  set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';  -- coach Box Reservas
  select count(*) into v_coach from public.classes;

  set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000003';  -- dueño Box Vecino
  select count(*) into v_vecino from public.classes;

  set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000002';  -- Ana, atleta
  select count(*) into v_atleta from public.reservations;
  select count(*) into v_res from public.classes;

  reset role;
  set local request.jwt.claim.sub = '';

  perform pg_temp.chk(v_vecino = 1,
    'el dueño del box vecino ve UNA clase: la suya');
  perform pg_temp.chk(v_coach > 1,
    'y el coach ve las de su box');
  perform pg_temp.chk(
    v_atleta = (select count(*) from public.reservations
                where athlete_id = 'da000000-0000-4000-8000-000000000001'),
    'el atleta ve sus reservas y solo las suyas');
  perform pg_temp.chk(v_res = v_coach,
    'el atleta ve los horarios de su box para poder reservar');

  -- Reservar NO es un insert: el atleta no tiene esa política.
  set local role authenticated;
  set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000002';
  v_err := pg_temp.falla($q$
    insert into public.reservations (org_id, class_id, athlete_id)
    values ('d0000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000002',
            'da000000-0000-4000-8000-000000000001') $q$);
  reset role;
  set local request.jwt.claim.sub = '';

  perform pg_temp.chk(v_err is not null,
    'el atleta NO puede insertar una reserva a mano: la puerta es book_class()');
end $$;

-- Un coach del Box Reservas no puede reservarle a un atleta del Box Vecino.
do $$
declare v_err text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
  v_err := pg_temp.falla($q$
    select * from public.book_class('dc000000-0000-4000-8000-000000000005',
      'da000000-0000-4000-8000-000000000009') $q$);
  reset role;
  set local request.jwt.claim.sub = '';

  perform pg_temp.chk(v_err is not null,
    'el coach de un box no reserva en la clase de otro box');
end $$;

rollback;

-- =============================================================================
-- 13 · CONCURRENCIA DE VERDAD (regla 1): dos transacciones, un solo cupo
-- =============================================================================
-- Esta sección va FUERA de la transacción anterior a propósito: dos conexiones
-- no pueden ver datos sin confirmar, así que la semilla se confirma, se pelea
-- el cupo con dos sesiones reales de Postgres y al final se borra el box.
--
-- Se usa `dblink` porque permite mandar una consulta ASÍNCRONA: la sesión B
-- pide el último cupo mientras A todavía tiene el candado, esta sesión
-- comprueba que B QUEDÓ ESPERANDO, y solo entonces A confirma. Si el
-- `select … for update` de book_class() no existiera, B no esperaría a nadie y
-- las dos reservas entrarían.
-- =============================================================================
create extension if not exists dblink;

-- Red de seguridad: si algo se queda esperando un candado que nadie va a
-- soltar, la prueba tiene que FALLAR, no colgar el CI para siempre.
set statement_timeout = '60s';

create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then
    raise exception 'FALLO [%] (la condición dio %)', label, coalesce(cond::text, 'NULL');
  end if;
  raise notice '  ok · %', label;
end $$;

insert into public.organizations (id, slug, name, timezone, status) values
  ('dd000000-0000-4000-8000-000000000001', 'box-duelo', 'Box Duelo', 'America/Bogota', 'active');
update public.reservation_settings
  set open_hours_before = 2160, close_minutes_before = 0, waitlist_enabled = false
where org_id = 'dd000000-0000-4000-8000-000000000001';

insert into public.athletes (id, org_id, first_name, phone) values
  ('de000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 'Rapido', '+573009990001'),
  ('de000000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000001', 'Lento',  '+573009990002');

insert into public.plans (id, org_id, name, price_cents, billing_period) values
  ('df000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 'Ilimitado', 18000000, 'monthly');

insert into public.subscriptions (org_id, athlete_id, plan_id, price_cents, billing_day, started_on) values
  ('dd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000001', 18000000, 1, '2026-01-01'),
  ('dd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002', 'df000000-0000-4000-8000-000000000001', 18000000, 1, '2026-01-01');

-- Cupo 1. Un solo cupo, dos atletas, al mismo tiempo.
insert into public.classes (id, org_id, name, starts_at, ends_at, capacity) values
  ('dc000000-0000-4000-8000-0000000000f1', 'dd000000-0000-4000-8000-000000000001', 'WOD',
   now() + interval '2 days', now() + interval '2 days 1 hour', 1);

do $$
declare
  v_conn    text;
  v_estado  text;
  v_espera  int := 0;
  v_esperoB boolean;
  v_errorB  text;
  v_total   int;
  v_ok      int;
  v_cuenta  int;
begin
  -- Conexión de vuelta a esta misma base. Sirve igual con socket unix (las
  -- pruebas locales sin Docker) que con TCP.
  v_conn := 'host=' || split_part(current_setting('unix_socket_directories'), ',', 1)
         || ' port='   || current_setting('port')
         || ' dbname=' || current_database()
         || ' user='   || current_user;

  perform dblink_connect('duelo_a', v_conn);
  perform dblink_connect('duelo_b', v_conn);
  perform dblink_exec('duelo_a', 'begin');
  perform dblink_exec('duelo_b', 'begin');

  -- A pide el único cupo y NO confirma: se queda con el candado de la clase.
  select s into v_estado from dblink('duelo_a',
    $q$ select status from public.book_class('dc000000-0000-4000-8000-0000000000f1',
          'de000000-0000-4000-8000-000000000001') $q$) as t(s text);

  -- B pide el mismo cupo, en asíncrono para que esta sesión no se bloquee.
  perform dblink_send_query('duelo_b',
    $q$ select status from public.book_class('dc000000-0000-4000-8000-0000000000f1',
          'de000000-0000-4000-8000-000000000002') $q$);

  -- B tiene que quedarse esperando un candado de A. Esto solo confirma que hay
  -- contención; la aserción que de verdad distingue el `for update` es la de
  -- más abajo, la del mensaje de error de B (comprobado quitando el candado:
  -- sin él B reserva igual y esa aserción falla).
  while v_espera < 50 loop
    if exists (select 1 from pg_stat_activity
               where wait_event_type = 'Lock'
                 and datname = current_database()
                 and query like '%book_class%') then
      exit;
    end if;
    perform pg_sleep(0.1);
    v_espera := v_espera + 1;
  end loop;
  v_esperoB := v_espera < 50;

  -- A confirma. B despierta, vuelve a contar bajo el candado y ve la clase llena.
  perform dblink_exec('duelo_a', 'commit');

  begin
    perform * from dblink_get_result('duelo_b') as t(s text);
    v_errorB := null;
  exception when others then
    v_errorB := sqlerrm;
  end;

  -- Si B llegó a reservar —que es justo lo que no puede pasar— se CONFIRMA a
  -- propósito, para que la cuenta final vea de verdad dos reservas en lugar de
  -- taparlo con un rollback piadoso.
  begin
    if v_errorB is null then
      perform dblink_exec('duelo_b', 'commit');
    end if;
  exception when others then null;
  end;

  -- Las conexiones se cierran SIEMPRE antes de afirmar nada. Si una aserción
  -- fallara con B abierta, B se quedaría con candados y la limpieza del final
  -- se colgaría esperándola en vez de reportar el fallo.
  begin perform dblink_disconnect('duelo_a'); exception when others then null; end;
  begin perform dblink_disconnect('duelo_b'); exception when others then null; end;

  select count(*), count(*) filter (where status = 'booked')
    into v_total, v_ok
  from public.reservations
  where class_id = 'dc000000-0000-4000-8000-0000000000f1';

  select reserved_count into v_cuenta
  from public.classes where id = 'dc000000-0000-4000-8000-0000000000f1';

  perform pg_temp.chk(v_estado = 'booked',
    'la transacción A toma el último cupo');
  perform pg_temp.chk(v_esperoB,
    'la segunda transacción QUEDA ESPERANDO el candado de la primera');
  perform pg_temp.chk(v_errorB like '%llena%',
    'la segunda transacción se encuentra la clase llena y falla con el motivo');
  perform pg_temp.chk(v_total = 1 and v_ok = 1,
    'el último cupo se vendió UNA sola vez: una reserva, un ganador');
  perform pg_temp.chk(v_cuenta = 1,
    'y el contador de la clase no quedó en 2');
end $$;

-- Limpieza: esta sección sí confirmó, así que se lleva su propio box.
delete from public.organizations where id = 'dd000000-0000-4000-8000-000000000001';
reset statement_timeout;

select 'RESERVAS OK' as resultado;
