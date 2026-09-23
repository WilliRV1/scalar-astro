-- =============================================================================
-- Prueba de la configuración del box
-- =============================================================================
-- Lo que se prueba aquí es lo que pasa si esto falla:
--
--   · Que un secreto de pasarela se pueda leer desde el navegador. Con la llave
--     privada de Wompi en la mano, cualquiera cobra y devuelve plata a nombre
--     del box. Es el peor fallo posible de todo el producto y tiene la sección
--     más larga.
--   · Que un box vea o cambie la configuración de otro. Un box que descubre que
--     el de al lado existe cancela el mismo día.
--   · Que un coach cambie el día de corte o apague la simulación. No es su
--     trabajo y nadie sabría quién lo hizo.
--   · Que una configuración imposible entre a la base (día de corte 40, un
--     horario de mensajes que empieza después de terminar). Se descubre el día
--     del corte, cuando ya no se cobró.
--   · Que un box nuevo arranque sin valores por defecto. El motor de cobros lee
--     `grace_days` y un NULL ahí es un cobro vencido el mismo día que se emite.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- semilla ---
insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'dueno@boxconfig.co'),
  ('e1000000-0000-4000-8000-000000000002', 'admin@boxconfig.co'),
  ('e1000000-0000-4000-8000-000000000003', 'coach@boxconfig.co'),
  ('e1000000-0000-4000-8000-000000000004', 'dueno@boxvecino.co');

-- El box A es el que se configura; el B existe solo para el aislamiento.
insert into public.organizations (id, slug, name, timezone, status) values
  ('0e000000-0000-4000-8000-000000000001', 'box-config', 'Box Config', 'America/Bogota', 'active'),
  ('0e000000-0000-4000-8000-000000000002', 'box-vecino', 'Box Vecino', 'America/Bogota', 'active');

insert into public.memberships (org_id, user_id, role) values
  ('0e000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'owner'),
  ('0e000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'admin'),
  ('0e000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'coach'),
  ('0e000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000004', 'owner');

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

-- ============================ 1 · Un box nuevo ya viene configurado =========
-- Nadie tiene que tocar SQL para que el box pueda cobrar el primer día.
do $$
declare s jsonb;
begin
  select settings into s from public.organizations
  where id = '0e000000-0000-4000-8000-000000000001';

  perform pg_temp.chk((s->>'grace_days')::int = 3,
    'un box nuevo arranca con 3 días de gracia');
  perform pg_temp.chk((s->>'default_billing_day')::int = 5,
    'un box nuevo arranca con el corte el día 5');
  perform pg_temp.chk((s->>'accepts_online_payment')::boolean = false,
    'el pago en línea arranca apagado: nadie conecta una pasarela sin decirlo');
  perform pg_temp.chk(s ? 'payment_link',
    'el enlace de pago existe como clave aunque esté vacío');

  perform pg_temp.chk(
    exists (select 1 from public.org_onboarding
            where org_id = '0e000000-0000-4000-8000-000000000001' and current_step = 'box'),
    'un box nuevo tiene su asistente de puesta en marcha en el primer paso');

  -- Estos los siembran las migraciones 0011 y 0014; la pantalla de
  -- configuración los edita, así que si desaparecieran se quedaría en blanco.
  perform pg_temp.chk(
    exists (select 1 from public.automation_settings
            where org_id = '0e000000-0000-4000-8000-000000000001' and simulation_mode),
    'un box nuevo arranca en modo simulación');
  perform pg_temp.chk(
    exists (select 1 from public.reservation_settings
            where org_id = '0e000000-0000-4000-8000-000000000001'),
    'un box nuevo tiene ajustes de reserva');
end $$;

-- Un box con la configuración a medias tampoco se queda sin valores.
do $$
declare s jsonb;
begin
  update public.organizations set settings = '{"grace_days": 10}'::jsonb
  where id = '0e000000-0000-4000-8000-000000000001';

  select settings into s from public.organizations
  where id = '0e000000-0000-4000-8000-000000000001';

  perform pg_temp.chk((s->>'grace_days')::int = 10,
    'lo que el box configura manda sobre el valor por defecto');
  perform pg_temp.chk((s->>'default_billing_day')::int = 5,
    'guardar solo una opción NO borra las demás');
end $$;

-- ============================ 2 · Lo imposible se rechaza, y se explica =====
-- El mensaje se le muestra al dueño tal cual (CLAUDE.md § Errores), así que la
-- prueba no comprueba solo que falle: comprueba que el texto diga qué pasó.
do $$
declare msg text;
begin
  begin
    update public.organizations set settings = settings || '{"default_billing_day": 40}'::jsonb
    where id = '0e000000-0000-4000-8000-000000000001';
    msg := null;
  exception when others then msg := sqlerrm;
  end;

  perform pg_temp.chk(msg is not null, 'un día de corte 40 NO entra a la base');
  perform pg_temp.chk(msg like '%entre 1 y 31%',
    'y el error dice cuál es el rango válido, no "violates check constraint"');
  perform pg_temp.chk(msg like '%40%',
    'y repite el valor que se intentó guardar');
end $$;

do $$
declare msg text;
begin
  begin
    update public.organizations set settings = settings || '{"grace_days": -1}'::jsonb
    where id = '0e000000-0000-4000-8000-000000000001';
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%entre 0 y 60%',
    'unos días de gracia negativos se rechazan con su rango');
end $$;

do $$
declare msg text;
begin
  begin
    update public.organizations set settings = settings || '{"grace_days": "tres"}'::jsonb
    where id = '0e000000-0000-4000-8000-000000000001';
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%número%',
    'unos días de gracia escritos en letras se rechazan');
end $$;

do $$
declare msg text;
begin
  begin
    update public.organizations set settings = settings || '{"payment_link": "pagos.com/box"}'::jsonb
    where id = '0e000000-0000-4000-8000-000000000001';
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%http%',
    'un enlace de pago sin http:// se rechaza explicando qué le falta');
end $$;

-- El horario silencioso invertido: escribir de 21:00 a 8:00 no es "al revés",
-- es escribirle a los atletas de madrugada.
do $$
declare msg text;
begin
  begin
    update public.automation_settings set quiet_start_hour = 21, quiet_end_hour = 8
    where org_id = '0e000000-0000-4000-8000-000000000001';
    msg := null;
  exception when others then msg := sqlerrm;
  end;

  perform pg_temp.chk(msg is not null, 'un horario de mensajes invertido NO entra a la base');
  perform pg_temp.chk(msg like '%al revés%',
    'y el error lo dice en español, no con el nombre del CHECK');
  perform pg_temp.chk(
    (select quiet_start_hour from public.automation_settings
     where org_id = '0e000000-0000-4000-8000-000000000001') = 8,
    'y el horario anterior queda intacto');
end $$;

do $$
declare msg text;
begin
  begin
    update public.automation_settings
       set max_messages_per_athlete_per_day = 9, max_messages_per_athlete_per_month = 4
    where org_id = '0e000000-0000-4000-8000-000000000001';
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%mayor que el mensual%',
    'un tope diario mayor que el mensual se rechaza: uno de los dos sobra');
end $$;

-- Una ventana de reserva que cierra antes de abrir deja la clase inreservable
-- sin que ningún mensaje de error lo diga. Se corta aquí.
do $$
declare msg text;
begin
  begin
    update public.reservation_settings set open_hours_before = 1, close_minutes_before = 120
    where org_id = '0e000000-0000-4000-8000-000000000001';
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%cerraría antes de abrirse%',
    'una ventana de reserva que cierra antes de abrir se rechaza');
end $$;

-- ============================ 3 · Quién puede cambiar qué ===================
set session role authenticated;

-- ---- el coach mira, pero no toca -------------------------------------------
set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000003';

do $$
declare filas int;
begin
  perform pg_temp.chk(
    (select (settings->>'grace_days')::int from public.organizations
     where id = '0e000000-0000-4000-8000-000000000001') = 10,
    'el coach SÍ lee la configuración de su box (necesita saber los días de gracia)');

  update public.organizations set settings = settings || '{"grace_days": 99}'::jsonb
  where id = '0e000000-0000-4000-8000-000000000001';
  get diagnostics filas = row_count;
  perform pg_temp.chk(filas = 0, 'el coach NO cambia la configuración del box');

  update public.automation_settings set simulation_mode = false
  where org_id = '0e000000-0000-4000-8000-000000000001';
  get diagnostics filas = row_count;
  perform pg_temp.chk(filas = 0, 'el coach NO apaga la simulación de mensajes');

  update public.reservation_settings set block_when_overdue = true
  where org_id = '0e000000-0000-4000-8000-000000000001';
  get diagnostics filas = row_count;
  perform pg_temp.chk(filas = 0, 'el coach NO activa el bloqueo por mora');
end $$;

do $$
declare msg text;
begin
  begin
    perform public.mark_onboarding_step('0e000000-0000-4000-8000-000000000001', 'box');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%dueño o el administrador%',
    'el coach NO avanza la puesta en marcha, y se le dice por qué');
end $$;

-- ---- el dueño sí ------------------------------------------------------------
set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';

do $$
declare filas int;
begin
  update public.organizations set settings = settings || '{"grace_days": 7, "accepts_online_payment": true}'::jsonb
  where id = '0e000000-0000-4000-8000-000000000001';
  get diagnostics filas = row_count;
  perform pg_temp.chk(filas = 1, 'el dueño SÍ cambia la configuración de su box');

  perform pg_temp.chk(
    (select (settings->>'grace_days')::int from public.organizations
     where id = '0e000000-0000-4000-8000-000000000001') = 7,
    'y el cambio queda guardado');

  update public.automation_settings set simulation_mode = false
  where org_id = '0e000000-0000-4000-8000-000000000001';
  get diagnostics filas = row_count;
  perform pg_temp.chk(filas = 1, 'el dueño SÍ apaga la simulación cuando está listo');

  update public.reservation_settings set cancel_minutes_before = 240
  where org_id = '0e000000-0000-4000-8000-000000000001';
  get diagnostics filas = row_count;
  perform pg_temp.chk(filas = 1, 'el dueño SÍ cambia el plazo de cancelación');
end $$;

-- Y la validación no se salta por ser dueño.
do $$
declare msg text;
begin
  begin
    update public.organizations set settings = settings || '{"default_billing_day": 40}'::jsonb
    where id = '0e000000-0000-4000-8000-000000000001';
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%entre 1 y 31%',
    'al dueño también se le rechaza un día de corte 40');
end $$;

-- ============================ 4 · Un box no ve al de al lado ================
do $$
declare filas int;
begin
  perform pg_temp.chk(
    (select count(*) from public.organizations
     where id = '0e000000-0000-4000-8000-000000000002') = 0,
    'el dueño del box A no ve siquiera que el box B existe');
  perform pg_temp.chk(
    (select count(*) from public.org_onboarding
     where org_id = '0e000000-0000-4000-8000-000000000002') = 0,
    'ni la puesta en marcha del box B');
  perform pg_temp.chk(
    (select count(*) from public.automation_settings
     where org_id = '0e000000-0000-4000-8000-000000000002') = 0,
    'ni los ajustes de mensajería del box B');
  perform pg_temp.chk(
    (select count(*) from public.reservation_settings
     where org_id = '0e000000-0000-4000-8000-000000000002') = 0,
    'ni los ajustes de reserva del box B');

  update public.organizations set settings = settings || '{"grace_days": 99}'::jsonb
  where id = '0e000000-0000-4000-8000-000000000002';
  get diagnostics filas = row_count;
  perform pg_temp.chk(filas = 0, 'y no puede cambiarle la configuración al box B');
end $$;

do $$
declare msg text;
begin
  begin
    perform public.mark_onboarding_step('0e000000-0000-4000-8000-000000000002', 'box');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%dueño o el administrador%',
    'ni avanzarle el asistente al box B');
end $$;

-- ============================ 5 · Los secretos =============================
-- La sección que justifica la migración entera. Hoy las llaves de Wompi salen
-- del entorno de la Edge Function, que es uno solo: la plata de todos los boxes
-- cayendo en la misma cuenta. Cada box mete las suyas, y NADIE las vuelve a
-- leer desde el navegador. Ni el coach, ni el administrador, ni el dueño que
-- las escribió.

-- ---- el dueño las guarda ----------------------------------------------------
do $$
declare cred public.org_credentials;
begin
  cred := public.set_org_credential(
    '0e000000-0000-4000-8000-000000000001', 'wompi_private_key',
    'prv_test_LLAVEPRIVADA4f2a', 'test');

  perform pg_temp.chk(cred.is_set, 'el dueño guarda la llave privada de su box');
  perform pg_temp.chk(cred.last4 = '4f2a',
    'y solo se guardan los últimos 4 caracteres para reconocerla');
  perform pg_temp.chk(cred.public_value is null,
    'de un secreto no queda ningún valor legible en la ficha');
  perform pg_temp.chk(cred.provider = 'wompi' and cred.environment = 'test',
    'la ficha dice de qué pasarela es y si es de pruebas o de producción');

  -- La comprobación que de verdad importa: que el secreto NO esté escondido en
  -- ninguna columna de la ficha, ni siquiera por accidente.
  perform pg_temp.chk(
    to_jsonb(cred)::text not like '%LLAVEPRIVADA%',
    'la ficha que vuelve al navegador NO contiene el secreto por ningún lado');

  -- La pública sí se muestra entera: viaja al navegador por diseño.
  cred := public.set_org_credential(
    '0e000000-0000-4000-8000-000000000001', 'wompi_public_key',
    'pub_test_LLAVEPUBLICA', 'test');
  perform pg_temp.chk(cred.public_value = 'pub_test_LLAVEPUBLICA',
    'la llave PÚBLICA de Wompi sí se guarda y se muestra entera');
  perform pg_temp.chk(cred.last4 is null,
    'y no se le guardan "últimos 4": no hay nada que ocultar');
end $$;

-- ---- pegar la llave equivocada se detecta al guardarla ----------------------
do $$
declare msg text; pista text;
begin
  begin
    perform public.set_org_credential(
      '0e000000-0000-4000-8000-000000000001', 'wompi_private_key', 'pub_test_MEEQUIVOQUE', 'test');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%prv_test_%',
    'pegar la llave pública donde va la privada se rechaza al momento');

  begin
    perform public.set_org_credential(
      '0e000000-0000-4000-8000-000000000001', 'llave_wompi', 'lo_que_sea', 'test');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%No conozco la credencial%',
    'una credencial inventada se rechaza: la Edge Function no sabría buscarla');

  begin
    perform public.set_org_credential(
      '0e000000-0000-4000-8000-000000000001', 'whatsapp_phone_number_id', '+573001234567', 'prod');
    msg := null; pista := null;
  exception when others then
    get stacked diagnostics msg = message_text, pista = pg_exception_hint;
  end;
  perform pg_temp.chk(msg like '%cadena de dígitos%',
    'el número de teléfono donde va el id de WhatsApp se rechaza');
  -- La pista viaja aparte del mensaje, y es la que evita la llamada de soporte:
  -- si se perdiera, el dueño reintentaría con el mismo número toda la tarde.
  perform pg_temp.chk(pista like '%Phone number ID%',
    'y la pista le dice dónde encontrar el dato correcto en el panel de Meta');
end $$;

-- ---- NADIE autenticado lee un secreto --------------------------------------
-- Esta es la aserción por la que existe el archivo. Si alguna vez pasa a verde
-- por el camino equivocado (una política nueva, un `grant` de más), lo que se
-- filtra es la llave con la que se mueve la plata del cliente.
do $$
declare msg text;
begin
  begin
    -- El dueño del box, autenticado, leyendo el secreto de SU PROPIO box.
    perform (select secret from public.org_secret_values
             where org_id = '0e000000-0000-4000-8000-000000000001');
    msg := null;
  exception when others then msg := sqlerrm;
  end;

  perform pg_temp.chk(msg is not null,
    'el dueño autenticado NO puede leer el secreto de su propio box');
  perform pg_temp.chk(msg like '%permission denied%' or msg like '%permiso denegado%',
    'y no es que vea una tabla vacía: la base le niega el acceso a la tabla');

  begin
    perform (select count(*) from public.org_secret_values);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg is not null,
    'ni siquiera puede contar cuántos secretos hay');

  begin
    perform private.org_secret('0e000000-0000-4000-8000-000000000001', 'wompi_private_key');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg is not null,
    'ni puede llamar a la función que las Edge Functions usan para leerlo');
end $$;

-- El dueño del box B: ni el suyo ni el ajeno.
set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000004';
do $$
declare msg text;
begin
  perform pg_temp.chk(
    (select count(*) from public.org_credentials
     where org_id = '0e000000-0000-4000-8000-000000000001') = 0,
    'el dueño del box B no ve ni el ESTADO de las credenciales del box A');

  begin
    perform (select secret from public.org_secret_values
             where org_id = '0e000000-0000-4000-8000-000000000001');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg is not null,
    'y mucho menos el secreto del box A');

  begin
    perform public.set_org_credential(
      '0e000000-0000-4000-8000-000000000001', 'wompi_private_key', 'prv_test_ROBADA', 'prod');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  perform pg_temp.chk(msg like '%Solo el dueño o el administrador%',
    'ni puede escribirle una credencial al box A para desviarle los cobros');
end $$;

-- El coach tampoco, ni el estado.
set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000003';
do $$
begin
  perform pg_temp.chk(
    (select count(*) from public.org_credentials) = 0,
    'el coach no ve el estado de las credenciales de su propio box');
end $$;

-- ---- la Edge Function sí, que para eso está --------------------------------
reset role;
set session role service_role;
do $$
begin
  perform pg_temp.chk(
    private.org_secret('0e000000-0000-4000-8000-000000000001', 'wompi_private_key')
      = 'prv_test_LLAVEPRIVADA4f2a',
    'service_role SÍ lee el secreto: es el único camino, y es el de las Edge Functions');
  perform pg_temp.chk(
    private.org_secret('0e000000-0000-4000-8000-000000000002', 'wompi_private_key') is null,
    'y para un box que no configuró nada devuelve nada, no el de otro box');
end $$;

-- ============================ 6 · Rotar y quitar ============================
reset role;
set session role authenticated;
set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000002';  -- el administrador

do $$
declare cred public.org_credentials;
begin
  cred := public.set_org_credential(
    '0e000000-0000-4000-8000-000000000001', 'wompi_private_key',
    'prv_prod_LLAVENUEVA9z8y', 'prod');
  perform pg_temp.chk(cred.last4 = '9z8y' and cred.environment = 'prod',
    'el administrador también puede rotar la llave y pasar a producción');
end $$;

reset role;
set session role service_role;
do $$
begin
  perform pg_temp.chk(
    private.org_secret('0e000000-0000-4000-8000-000000000001', 'wompi_private_key')
      = 'prv_prod_LLAVENUEVA9z8y',
    'rotar la llave reemplaza el secreto, no deja el viejo conviviendo');
  perform pg_temp.chk(
    (select count(*) from public.org_secret_values
     where org_id = '0e000000-0000-4000-8000-000000000001'
       and key = 'wompi_private_key') = 1,
    'y queda una sola fila por credencial');
end $$;

reset role;
set session role authenticated;
set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';
do $$
begin
  perform public.clear_org_credential('0e000000-0000-4000-8000-000000000001', 'wompi_private_key');
  perform pg_temp.chk(
    (select count(*) from public.org_credentials
     where org_id = '0e000000-0000-4000-8000-000000000001'
       and key = 'wompi_private_key') = 0,
    'quitar una credencial borra su ficha');
end $$;

reset role;
set session role service_role;
do $$
begin
  perform pg_temp.chk(
    (select count(*) from public.org_secret_values
     where org_id = '0e000000-0000-4000-8000-000000000001'
       and key = 'wompi_private_key') = 0,
    'y borra el secreto de verdad, no lo deja "inactivo" en la base');
end $$;

-- ============================ 7 · La puesta en marcha se recuerda ===========
reset role;
set session role authenticated;
set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';

do $$
declare o public.org_onboarding;
begin
  o := public.mark_onboarding_step('0e000000-0000-4000-8000-000000000001', 'box');
  perform pg_temp.chk(o.steps_done @> array['box'], 'el paso terminado queda marcado');
  perform pg_temp.chk(o.current_step = 'plans',
    'y el asistente pasa al siguiente paso pendiente');

  -- El box que importa los atletas el lunes se salta el paso hoy.
  o := public.mark_onboarding_step('0e000000-0000-4000-8000-000000000001', 'athletes', 'skipped');
  perform pg_temp.chk(o.steps_skipped @> array['athletes'],
    'un paso se puede saltar');
  perform pg_temp.chk(not (o.steps_done @> array['athletes']),
    'y saltado NO cuenta como hecho');
  perform pg_temp.chk(o.current_step = 'plans',
    'saltarse un paso no mueve al dueño del que tenía pendiente');

  perform pg_temp.chk(o.completed_at is null,
    'con pasos pendientes el asistente sigue abierto');

  o := public.mark_onboarding_step('0e000000-0000-4000-8000-000000000001', 'plans');
  o := public.mark_onboarding_step('0e000000-0000-4000-8000-000000000001', 'billing');
  o := public.mark_onboarding_step('0e000000-0000-4000-8000-000000000001', 'automations');

  perform pg_temp.chk(
    (select completed_at is not null from public.org_onboarding
     where org_id = '0e000000-0000-4000-8000-000000000001'),
    'cuando no queda nada pendiente el asistente se cierra solo');
  perform pg_temp.chk(
    (select current_step from public.org_onboarding
     where org_id = '0e000000-0000-4000-8000-000000000001') = 'done',
    'y queda marcado como terminado');
end $$;

do $$
begin
  perform pg_temp.chk(
    (select onboarded_at is not null from public.organizations
     where id = '0e000000-0000-4000-8000-000000000001'),
    'terminar el asistente deja la marca en el box, que es lo que mira el panel');
end $$;

-- Volver sobre un paso ya hecho reabre el asistente: el dueño que cambia de
-- opinión en marzo no tiene que empezar de cero, pero tampoco se le miente
-- diciéndole que está todo listo.
do $$
declare o public.org_onboarding;
begin
  o := public.mark_onboarding_step('0e000000-0000-4000-8000-000000000001', 'plans', 'pending');
  perform pg_temp.chk(not (o.steps_done @> array['plans']),
    'un paso se puede volver a dejar pendiente');
  perform pg_temp.chk(o.current_step = 'plans',
    'y el asistente vuelve a llevar ahí');
end $$;

reset role;
rollback;

select 'CONFIGURACIÓN DEL BOX OK' as resultado;
