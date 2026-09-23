-- =============================================================================
-- Prueba de los campos personalizados
-- =============================================================================
-- Aquí lo que se pierde no es plata, son DATOS de atletas: el dueño desactiva
-- un campo y se lleva por delante lo que había escrito, o marca una lesión como
-- sensible y el atleta la sigue viendo. Las dos cosas se descubren tarde y no
-- se pueden deshacer, así que se prueban con casos concretos.
-- =============================================================================

begin;

-- ------------------------------------------------------------------ semilla --
insert into auth.users (id, email) values
  ('cf000000-0000-4000-8000-00000000d001', 'dueno@boxcampos.co'),
  ('cf000000-0000-4000-8000-00000000d002', 'coachsin@boxcampos.co'),
  ('cf000000-0000-4000-8000-00000000d003', 'coachcon@boxcampos.co'),
  ('cf000000-0000-4000-8000-00000000d004', 'atleta@boxcampos.co'),
  ('cf000000-0000-4000-8000-00000000d005', 'dueno@otrobox.co');

insert into public.organizations (id, slug, name, timezone) values
  ('cf000000-0000-4000-8000-000000000001', 'box-campos', 'Box Campos', 'America/Bogota'),
  ('cf000000-0000-4000-8000-000000000002', 'box-otro',   'Box Otro',   'America/Bogota');

insert into public.athletes (id, org_id, first_name) values
  ('cfa00000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'Ana'),
  ('cfa00000-0000-4000-8000-000000000002', 'cf000000-0000-4000-8000-000000000001', 'Beto'),
  ('cfb00000-0000-4000-8000-000000000003', 'cf000000-0000-4000-8000-000000000002', 'Caro');

insert into public.memberships (org_id, user_id, role, permissions, athlete_id) values
  ('cf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-00000000d001', 'owner',   '{}', null),
  ('cf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-00000000d002', 'coach',   '{}', null),
  ('cf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-00000000d003', 'coach',   '{"can_manage_athletes": true}', null),
  ('cf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-00000000d004', 'athlete', '{}', 'cfa00000-0000-4000-8000-000000000001'),
  ('cf000000-0000-4000-8000-000000000002', 'cf000000-0000-4000-8000-00000000d005', 'owner',   '{}', null);

-- Los campos que este box decidió tener.
insert into public.custom_field_defs
  (id, org_id, key, label, field_type, options, is_required, is_sensitive, sort_order) values
  ('cfd00000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
   'talla', 'Talla de camiseta', 'select', array['XS','S','M','L','XL'], true,  false, 1),
  ('cfd00000-0000-4000-8000-000000000002', 'cf000000-0000-4000-8000-000000000001',
   'peso_objetivo', 'Peso objetivo (kg)', 'number', '{}', false, false, 2),
  ('cfd00000-0000-4000-8000-000000000003', 'cf000000-0000-4000-8000-000000000001',
   'acudiente', 'Nombre del acudiente', 'text', '{}', false, false, 3),
  ('cfd00000-0000-4000-8000-000000000004', 'cf000000-0000-4000-8000-000000000001',
   'cel_acudiente', 'Celular del acudiente', 'phone', '{}', false, false, 4),
  ('cfd00000-0000-4000-8000-000000000005', 'cf000000-0000-4000-8000-000000000001',
   'firmo_papel', 'Firmó el consentimiento en papel', 'boolean', '{}', false, false, 5),
  ('cfd00000-0000-4000-8000-000000000006', 'cf000000-0000-4000-8000-000000000001',
   'clases_favoritas', 'Clases favoritas', 'multiselect',
   array['Halterofilia','Gimnásticos','Resistencia'], false, false, 6),
  ('cfd00000-0000-4000-8000-000000000007', 'cf000000-0000-4000-8000-000000000001',
   'revision_medica', 'Fecha de la revisión médica', 'date', '{}', false, false, 7),
  -- Sensible: no puede acabar en athletes.custom nunca.
  ('cfd00000-0000-4000-8000-000000000008', 'cf000000-0000-4000-8000-000000000001',
   'lesion_previa', 'Lesión previa', 'text', '{}', false, true, 8);

-- El otro box tiene sus propios campos, con una clave que se llama IGUAL.
insert into public.custom_field_defs (org_id, key, label, field_type, is_required) values
  ('cf000000-0000-4000-8000-000000000002', 'talla', 'Talla (otro box)', 'text', false);

-- ----------------------------------------------------------------- utilidad --
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

-- Ejecuta una escritura y devuelve el mensaje de error, o null si pasó.
create or replace function pg_temp.falla(sentencia text)
returns text language plpgsql as $$
begin
  execute sentencia;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- ======================= 1 · Lo que el servidor rechaza =====================
do $$
declare err text;
begin
  -- Punto de partida válido. Hace falta porque el trigger de UPDATE solo se
  -- dispara cuando `custom` CAMBIA de verdad (ver la migración): sin esto,
  -- "vaciar" una ficha que ya estaba vacía no sería un cambio y no probaría nada.
  update public.athletes set custom = '{"talla": "M"}'::jsonb
   where id = 'cfa00000-0000-4000-8000-000000000001';

  -- Obligatorio vacío. Las cuatro formas de "vacío" son la misma cosa.
  err := pg_temp.falla($q$
    update public.athletes set custom = '{}'::jsonb
     where id = 'cfa00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%"Talla de camiseta" es obligatorio%',
    'un campo obligatorio ausente se rechaza');

  err := pg_temp.falla($q$
    update public.athletes set custom = '{"talla": "   "}'::jsonb
     where id = 'cfa00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%es obligatorio%',
    'un obligatorio con solo espacios también se rechaza');

  err := pg_temp.falla($q$
    update public.athletes set custom = '{"talla": null}'::jsonb
     where id = 'cfa00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%es obligatorio%',
    'un obligatorio en null también se rechaza');

  -- Opción que no está en la lista.
  err := pg_temp.falla($q$
    update public.athletes set custom = '{"talla": "XXXL"}'::jsonb
     where id = 'cfa00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%no acepta "XXXL"%' and err like '%XS, S, M, L, XL%',
    'un select con una opción inválida se rechaza y el error dice cuáles valen');

  -- Número con letras.
  err := pg_temp.falla($q$
    update public.athletes
       set custom = '{"talla": "M", "peso_objetivo": "72 kilos"}'::jsonb
     where id = 'cfa00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%espera un número%',
    'un número con letras se rechaza');

  -- Fecha que pasa el patrón pero no existe.
  err := pg_temp.falla($q$
    update public.athletes
       set custom = '{"talla": "M", "revision_medica": "2026-02-31"}'::jsonb
     where id = 'cfa00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%fecha que no existe%',
    'el 31 de febrero se rechaza aunque tenga la forma de una fecha');

  -- Teléfono fuera de E.164. La normalización es del cliente; la base no adivina.
  err := pg_temp.falla($q$
    update public.athletes
       set custom = '{"talla": "M", "cel_acudiente": "300 123 4567"}'::jsonb
     where id = 'cfa00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%formato internacional%',
    'un celular sin normalizar a E.164 se rechaza');

  -- Multiselect con un elemento que no está en la lista.
  err := pg_temp.falla($q$
    update public.athletes
       set custom = '{"talla": "M", "clases_favoritas": ["Halterofilia","Zumba"]}'::jsonb
     where id = 'cfa00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%no acepta "Zumba"%',
    'un multiselect con una opción inválida se rechaza');

  -- Un valor sensible NO puede entrar por la ficha general.
  err := pg_temp.falla($q$
    update public.athletes
       set custom = '{"talla": "M", "lesion_previa": "hombro"}'::jsonb
     where id = 'cfa00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%es sensible%',
    'un campo sensible no se puede colar en la ficha general del atleta');
end $$;

-- ======================= 2 · Lo que el servidor normaliza ===================
do $$
declare c jsonb;
begin
  update public.athletes
     set custom = jsonb_build_object(
       'talla', ' M ',
       'peso_objetivo', '72,5',
       'acudiente', '  María Pérez  ',
       'cel_acudiente', '+573001234567',
       'firmo_papel', 'true',
       'clases_favoritas', '["Halterofilia","Halterofilia","Resistencia"]'::jsonb,
       'revision_medica', '2026-03-15',
       'sin_definicion', 'lo que sea')
   where id = 'cfa00000-0000-4000-8000-000000000001';

  select custom into c from public.athletes
   where id = 'cfa00000-0000-4000-8000-000000000001';

  perform pg_temp.chk(c->>'talla' = 'M', 'el select se guarda recortado');
  perform pg_temp.chk(jsonb_typeof(c->'peso_objetivo') = 'number' and (c->>'peso_objetivo')::numeric = 72.5,
    'el número llega como texto "72,5" y se guarda como NÚMERO 72.5');
  perform pg_temp.chk(c->>'acudiente' = 'María Pérez', 'el texto se guarda sin espacios sobrantes');
  perform pg_temp.chk(jsonb_typeof(c->'firmo_papel') = 'boolean' and (c->>'firmo_papel')::boolean,
    'el "true" de un formulario se guarda como booleano');
  perform pg_temp.chk(jsonb_array_length(c->'clases_favoritas') = 2,
    'el multiselect no guarda la misma opción dos veces');
  perform pg_temp.chk(c->>'revision_medica' = '2026-03-15', 'la fecha válida se guarda');
end $$;

-- El 0 que en realidad es una casilla vacía: '' no puede volverse 0.
do $$
declare c jsonb;
begin
  update public.athletes
     set custom = '{"talla": "M", "peso_objetivo": ""}'::jsonb
   where id = 'cfa00000-0000-4000-8000-000000000002';

  select custom into c from public.athletes
   where id = 'cfa00000-0000-4000-8000-000000000002';

  perform pg_temp.chk(not (c ? 'peso_objetivo'),
    'un número vacío se descarta, NO se guarda como 0 (Number("") es 0)');
end $$;

-- ======================= 3 · Desactivar no borra nada =======================
do $$
declare c jsonb; visibles int;
begin
  update public.custom_field_defs set is_active = false
   where id = 'cfd00000-0000-4000-8000-000000000003';   -- acudiente

  select custom into c from public.athletes
   where id = 'cfa00000-0000-4000-8000-000000000001';
  perform pg_temp.chk(c->>'acudiente' = 'María Pérez',
    'desactivar un campo NO borra el valor que el box ya había escrito');

  select count(*) into visibles from public.custom_field_defs
   where org_id = 'cf000000-0000-4000-8000-000000000001' and is_active;
  perform pg_temp.chk(visibles = 7, 'el campo desactivado desaparece del formulario');

  -- Y se puede seguir editando al atleta aunque ese campo ya no exista para el
  -- formulario: su valor viaja intacto y no lo valida nadie.
  update public.athletes set custom = custom || '{"talla": "L"}'::jsonb
   where id = 'cfa00000-0000-4000-8000-000000000001';
  select custom into c from public.athletes
   where id = 'cfa00000-0000-4000-8000-000000000001';
  perform pg_temp.chk(c->>'acudiente' = 'María Pérez' and c->>'talla' = 'L',
    'editar al atleta con un campo desactivado no pierde su valor');

  -- Reactivar: vuelve a verse, con el dato de siempre.
  update public.custom_field_defs set is_active = true
   where id = 'cfd00000-0000-4000-8000-000000000003';
  select custom into c from public.athletes
   where id = 'cfa00000-0000-4000-8000-000000000001';
  perform pg_temp.chk(c->>'acudiente' = 'María Pérez',
    'al reactivar el campo el valor sigue ahí');
end $$;

-- ======================= 4 · Clave inmutable, etiqueta no ===================
do $$
declare err text; c jsonb;
begin
  err := pg_temp.falla($q$
    update public.custom_field_defs set key = 'talla_camiseta'
     where id = 'cfd00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%clave de un campo no se puede cambiar%',
    'la clave de un campo es inmutable: si cambiara, los valores quedarían huérfanos');

  err := pg_temp.falla($q$
    update public.custom_field_defs set field_type = 'text'
     where id = 'cfd00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%tipo del campo%no se puede cambiar%',
    'el tipo de un campo es inmutable');

  update public.custom_field_defs set label = 'Talla de la camiseta del box'
   where id = 'cfd00000-0000-4000-8000-000000000001';
  select custom into c from public.athletes
   where id = 'cfa00000-0000-4000-8000-000000000001';
  perform pg_temp.chk(c->>'talla' = 'L',
    'renombrar la etiqueta no toca ni la clave ni los valores');
end $$;

-- ======================= 5 · Borrar no puede perder datos ===================
do $$
declare err text;
begin
  err := pg_temp.falla($q$
    delete from public.custom_field_defs
     where id = 'cfd00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%ya tiene datos de atletas%',
    'un campo con datos NO se borra: el error manda desactivarlo');

  -- Uno que nadie llenó sí se puede borrar: no hay nada que perder.
  insert into public.custom_field_defs (org_id, key, label, field_type)
  values ('cf000000-0000-4000-8000-000000000001', 'error_de_tecleo', 'Se creó por error', 'text');
  delete from public.custom_field_defs
   where org_id = 'cf000000-0000-4000-8000-000000000001' and key = 'error_de_tecleo';
  perform pg_temp.chk(
    not exists (select 1 from public.custom_field_defs
                 where org_id = 'cf000000-0000-4000-8000-000000000001' and key = 'error_de_tecleo'),
    'un campo que nadie llenó sí se puede borrar');
end $$;

-- ======================= 6 · Tope de campos por box =========================
do $$
declare err text; activos int;
begin
  -- Ya hay 8. Se llega hasta 30.
  for i in 9..30 loop
    insert into public.custom_field_defs (org_id, key, label, field_type, sort_order)
    values ('cf000000-0000-4000-8000-000000000001', 'relleno_' || i, 'Relleno ' || i, 'text', i);
  end loop;

  select count(*) into activos from public.custom_field_defs
   where org_id = 'cf000000-0000-4000-8000-000000000001' and is_active;
  perform pg_temp.chk(activos = 30, 'se pueden tener 30 campos activos');

  err := pg_temp.falla($q$
    insert into public.custom_field_defs (org_id, key, label, field_type)
    values ('cf000000-0000-4000-8000-000000000001', 'uno_de_mas', 'Uno de más', 'text')$q$);
  perform pg_temp.chk(err like '%30 campos personalizados activos%' and err like '%Desactiva alguno%',
    'el campo 31 se rechaza con un mensaje que dice qué hacer');

  -- Desactivar libera cupo.
  update public.custom_field_defs set is_active = false
   where org_id = 'cf000000-0000-4000-8000-000000000001' and key = 'relleno_30';
  insert into public.custom_field_defs (org_id, key, label, field_type)
  values ('cf000000-0000-4000-8000-000000000001', 'uno_de_mas', 'Uno de más', 'text');
  perform pg_temp.chk(
    exists (select 1 from public.custom_field_defs
             where org_id = 'cf000000-0000-4000-8000-000000000001' and key = 'uno_de_mas'),
    'desactivar un campo libera cupo para otro');

  -- Y reactivar el desactivado ya no cabe: el tope se sigue respetando.
  err := pg_temp.falla($q$
    update public.custom_field_defs set is_active = true
     where org_id = 'cf000000-0000-4000-8000-000000000001' and key = 'relleno_30'$q$);
  perform pg_temp.chk(err like '%es el máximo%',
    'reactivar un campo cuando ya no hay cupo se rechaza');

  -- Limpieza para las secciones siguientes.
  delete from public.custom_field_defs
   where org_id = 'cf000000-0000-4000-8000-000000000001'
     and (key like 'relleno\_%' or key = 'uno_de_mas');
end $$;

-- ======================= 7 · Datos sensibles ================================
do $$
declare err text; c jsonb;
begin
  insert into public.athlete_custom_sensitive (athlete_id, org_id, custom)
  values ('cfa00000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
          '{"lesion_previa": "  Hombro derecho  "}'::jsonb);

  select custom into c from public.athlete_custom_sensitive
   where athlete_id = 'cfa00000-0000-4000-8000-000000000001';
  perform pg_temp.chk(c->>'lesion_previa' = 'Hombro derecho',
    'el valor sensible se guarda en su propia tabla, normalizado');

  perform pg_temp.chk(
    not ((select custom from public.athletes
           where id = 'cfa00000-0000-4000-8000-000000000001') ? 'lesion_previa'),
    'el valor sensible NO está en la ficha general del atleta');

  -- Y al revés: un campo normal no cabe en el almacén sensible.
  err := pg_temp.falla($q$
    update public.athlete_custom_sensitive set custom = custom || '{"talla": "M"}'::jsonb
     where athlete_id = 'cfa00000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(err like '%no está marcado como sensible%',
    'un campo normal no se puede esconder en el almacén sensible');
end $$;

-- Marcar como sensible un campo que YA tenía datos mueve los valores.
do $$
declare c_general jsonb; c_sensible jsonb;
begin
  update public.custom_field_defs set is_sensitive = true
   where id = 'cfd00000-0000-4000-8000-000000000003';   -- acudiente

  select custom into c_general from public.athletes
   where id = 'cfa00000-0000-4000-8000-000000000001';
  select custom into c_sensible from public.athlete_custom_sensitive
   where athlete_id = 'cfa00000-0000-4000-8000-000000000001';

  perform pg_temp.chk(not (c_general ? 'acudiente'),
    'al marcar un campo como sensible su valor SALE de la ficha general');
  perform pg_temp.chk(c_sensible->>'acudiente' = 'María Pérez',
    'y aparece intacto en el almacén sensible, sin perderse');

  -- Volver atrás también mueve el dato de regreso.
  update public.custom_field_defs set is_sensitive = false
   where id = 'cfd00000-0000-4000-8000-000000000003';

  select custom into c_general from public.athletes
   where id = 'cfa00000-0000-4000-8000-000000000001';
  select custom into c_sensible from public.athlete_custom_sensitive
   where athlete_id = 'cfa00000-0000-4000-8000-000000000001';
  perform pg_temp.chk(c_general->>'acudiente' = 'María Pérez',
    'quitarle lo sensible devuelve el valor a la ficha general');
  perform pg_temp.chk(not (c_sensible ? 'acudiente'),
    'y no deja una copia olvidada en la tabla sensible');
end $$;

-- ======================= 8 · Aislamiento y permisos (RLS) ===================
set session role authenticated;

-- Dueño del Box Campos
set request.jwt.claim.sub = 'cf000000-0000-4000-8000-00000000d001';
do $$
declare err text;
begin
  perform pg_temp.chk(
    (select count(*) from public.custom_field_defs) = 8,
    'el dueño ve los 8 campos de su box y ninguno del otro');
  perform pg_temp.chk(
    (select count(*) from public.custom_field_defs
      where org_id = 'cf000000-0000-4000-8000-000000000002') = 0,
    'un box NO ve las definiciones de otro box');

  -- Escribir un atleta como usuario autenticado: el trigger de validación tiene
  -- que seguir funcionando aunque `validate_custom_fields` esté revocada.
  err := pg_temp.falla($q$
    insert into public.athletes (org_id, first_name, custom)
    values ('cf000000-0000-4000-8000-000000000001', 'Dani', '{"talla": "S"}'::jsonb)$q$);
  perform pg_temp.chk(err is null,
    'un usuario autenticado puede escribir campos personalizados (la validación no se le exige por EXECUTE)');

  err := pg_temp.falla($q$
    insert into public.athletes (org_id, first_name, custom)
    values ('cf000000-0000-4000-8000-000000000001', 'Eva', '{"talla": "XXXL"}'::jsonb)$q$);
  perform pg_temp.chk(err like '%no acepta "XXXL"%',
    'y la validación lo sigue frenando, con el mensaje en español');

  perform pg_temp.chk(
    (select count(*) from public.athlete_custom_sensitive) = 1,
    'el dueño ve los valores sensibles de su box');
end $$;

-- Coach SIN el permiso de gestionar atletas
set request.jwt.claim.sub = 'cf000000-0000-4000-8000-00000000d002';
do $$ begin
  perform pg_temp.chk(
    (select count(*) from public.custom_field_defs) = 8,
    'el coach ve las definiciones para poder llenar la ficha');
  perform pg_temp.chk(
    (select count(*) from public.athlete_custom_sensitive) = 0,
    'un coach SIN permiso no ve un solo valor sensible');
end $$;

-- Coach CON el permiso
set request.jwt.claim.sub = 'cf000000-0000-4000-8000-00000000d003';
do $$ begin
  perform pg_temp.chk(
    (select count(*) from public.athlete_custom_sensitive) = 1,
    'un coach CON permiso sí ve los valores sensibles');
end $$;

-- El atleta
set request.jwt.claim.sub = 'cf000000-0000-4000-8000-00000000d004';
do $$
declare c jsonb;
begin
  perform pg_temp.chk(
    (select count(*) from public.athlete_custom_sensitive) = 0,
    'el atleta NO puede leer un campo sensible, ni el suyo');

  select custom into c from public.athletes
   where id = 'cfa00000-0000-4000-8000-000000000001';
  perform pg_temp.chk(c->>'talla' = 'L',
    'el atleta sí ve los campos normales de su propia ficha');

  perform pg_temp.chk(
    (select count(*) from public.custom_field_defs) = 7,
    'el atleta ve las definiciones activas y no sensibles (7 de 8)');
  perform pg_temp.chk(
    (select count(*) from public.custom_field_defs where is_sensitive) = 0,
    'y ninguna de las sensibles');
end $$;

-- Dueño del OTRO box
set request.jwt.claim.sub = 'cf000000-0000-4000-8000-00000000d005';
do $$
declare err text;
begin
  perform pg_temp.chk(
    (select count(*) from public.custom_field_defs) = 1,
    'el dueño del otro box solo ve su propio campo, aunque se llame igual');
  perform pg_temp.chk(
    (select count(*) from public.athlete_custom_sensitive) = 0,
    'y no ve un solo valor sensible del primer box');

  err := pg_temp.falla($q$
    update public.custom_field_defs set label = 'Robado'
     where org_id = 'cf000000-0000-4000-8000-000000000001'$q$);
  perform pg_temp.chk(
    (select label from public.custom_field_defs
      where id = 'cfd00000-0000-4000-8000-000000000001') is null,
    'no puede ni leer la definición del otro box para modificarla');
end $$;

reset role;

rollback;

select 'CAMPOS PERSONALIZADOS OK' as resultado;
