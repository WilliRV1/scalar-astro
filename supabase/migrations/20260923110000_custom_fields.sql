-- =============================================================================
-- 0019 · Campos personalizados por box
-- =============================================================================
-- La ficha del atleta la decidimos nosotros y eso está mal para un SaaS: un box
-- anota la talla de la camiseta, otro el nombre del acudiente, otro si ya firmó
-- el consentimiento en papel. El dueño tiene que poder definir sus campos sin
-- que nadie despliegue código, igual que ya define sus planes o sus reglas de
-- automatización (migración 0011): la forma vive en DATOS, no en el esquema.
--
-- -----------------------------------------------------------------------------
-- DECISIÓN 1 · Dónde se guardan los valores: `athletes.custom jsonb`
-- -----------------------------------------------------------------------------
-- Se descartó el modelo EAV (una tabla `athlete_custom_values` con una fila por
-- atleta y campo) por tres razones concretas:
--
--   a) Se lee en la MISMA consulta que el atleta. La lista de atletas ya trae
--      `select *`; con EAV serían N filas extra por atleta y un join o una
--      agregación en cada pantalla. Con jsonb no cambia ni una consulta.
--   b) La RLS que ya existe sobre `athletes` lo protege sin políticas nuevas.
--      Una tabla EAV necesitaría sus propias políticas, y cada política nueva es
--      una oportunidad más de filtrar datos entre boxes.
--   c) El importador escribe el atleta completo de una sola vez; con EAV habría
--      que insertar el atleta, leer su id y volver a insertar los valores, que
--      es justo donde un import a medias deja datos huérfanos.
--
-- Lo que se pierde: no hay FK del valor a la definición, así que la integridad
-- la impone `public.validate_custom_fields()` desde un trigger. Se asume a
-- propósito, y por eso esa función es el corazón de esta migración.
--
-- -----------------------------------------------------------------------------
-- DECISIÓN 2 · Los campos SENSIBLES no caben en ese jsonb
-- -----------------------------------------------------------------------------
-- `athletes` tiene la política "el atleta se lee a sí mismo" (migración 0002).
-- RLS es por FILA, no por columna: todo lo que se guarde en `athletes.custom`
-- lo ve el atleta, y con el SDK basta pedir la columna. Un campo "lesión de
-- hombro" ahí dentro sería un dato sensible (docs/07-legal-colombia.md, Ley
-- 1581) expuesto a quien no debe verlo.
--
-- Por eso los valores de los campos marcados como sensibles viven en
-- `athlete_custom_sensitive`, tabla aparte y con RLS más estricta. Es
-- exactamente la razón por la que ya existían `athlete_health` y
-- `athlete_coach_notes`: cuando el acceso cambia, cambia la TABLA.
--
-- `validate_custom_fields` además impide que un valor sensible entre por la
-- puerta de atrás: si la clave de un campo sensible aparece en `athletes.custom`
-- la escritura se rechaza, no se ignora en silencio.
-- =============================================================================

-- btree_gin permite meter el `org_id` (btree) y el `custom` (jsonb) en el MISMO
-- índice GIN. Sin él, el índice de jsonb no podría empezar por org_id y la
-- regla de la casa —todo índice empieza por org_id— se rompería.
create extension if not exists btree_gin;

-- -----------------------------------------------------------------------------
-- Definición de los campos que cada box decide tener
-- -----------------------------------------------------------------------------
create table public.custom_field_defs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,

  -- La clave con la que el valor se guarda dentro del jsonb. INMUTABLE: ver el
  -- trigger `custom_field_defs_guard`. Si la clave cambiara, todos los valores
  -- ya guardados quedarían huérfanos sin que nadie se entere.
  key         text not null check (key ~ '^[a-z][a-z0-9_]{1,39}$'),

  -- Lo que se lee en pantalla. Esto SÍ se puede cambiar cuantas veces quiera.
  label       text not null check (btrim(label) <> '' and length(label) <= 60),

  field_type  text not null check (field_type in
              ('text','number','date','select','multiselect','boolean','phone')),

  -- Opciones de select/multiselect. Para los demás tipos va vacío.
  options     text[] not null default '{}',

  is_required boolean not null default false,

  -- Dato sensible (lesión, condición médica, alergia…). Cambia DÓNDE se guarda
  -- el valor, no solo quién lo ve. Ver la cabecera y docs/07-legal-colombia.md.
  is_sensitive boolean not null default false,

  help_text   text check (help_text is null or length(help_text) <= 200),
  sort_order  int not null default 0,

  -- Desactivar es la única forma de "quitar" un campo con datos: los valores
  -- siguen guardados y vuelven a verse si el dueño lo reactiva.
  is_active   boolean not null default true,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Un select sin opciones es un desplegable vacío; un texto con opciones es
  -- una definición a medio migrar. Las dos son errores de programación nuestros,
  -- así que se cortan aquí y no en el formulario.
  constraint custom_field_defs_opciones_coherentes check (
    case when field_type in ('select','multiselect')
         then array_length(options, 1) between 1 and 40
         else options = '{}'::text[]
    end
  )
);

-- Una clave no se repite dentro del box. Es lo que vuelve segura la búsqueda
-- por clave dentro del jsonb.
create unique index custom_field_defs_org_key_idx
  on public.custom_field_defs (org_id, key);

-- Lectura típica: "los campos activos de este box, en orden".
create index custom_field_defs_org_order_idx
  on public.custom_field_defs (org_id, sort_order, key)
  where is_active;

create trigger custom_field_defs_touch
  before update on public.custom_field_defs
  for each row execute function public.touch_updated_at();

comment on table public.custom_field_defs is
  'Los campos que cada box añade a la ficha del atleta. El dueño los define desde la interfaz.';
comment on column public.custom_field_defs.key is
  'Clave dentro del jsonb de valores. Inmutable: cambiarla dejaría huérfanos los datos guardados.';
comment on column public.custom_field_defs.is_sensitive is
  'Si es true, el valor NO va en athletes.custom sino en athlete_custom_sensitive.';
comment on column public.custom_field_defs.is_active is
  'Desactivar oculta el campo del formulario sin borrar un solo valor.';

-- -----------------------------------------------------------------------------
-- Valores de los campos NO sensibles: una columna en el propio atleta
-- -----------------------------------------------------------------------------
alter table public.athletes
  add column custom jsonb not null default '{}'::jsonb;

alter table public.athletes
  add constraint athletes_custom_es_objeto check (jsonb_typeof(custom) = 'object');

-- El índice empieza por org_id (regla de la casa) gracias a btree_gin: así una
-- búsqueda del tipo "atletas de MI box con talla = M" no roza los datos de otro.
create index athletes_org_custom_idx
  on public.athletes using gin (org_id, custom)
  where deleted_at is null;

comment on column public.athletes.custom is
  'Valores de los campos personalizados NO sensibles del box. Ver custom_field_defs.';

-- -----------------------------------------------------------------------------
-- Valores de los campos SENSIBLES: tabla aparte, RLS más estricta
-- -----------------------------------------------------------------------------
-- Mismo patrón que athlete_health y athlete_coach_notes. La diferencia con
-- athlete_health es deliberada: allí el atleta ve lo suyo porque es su historia
-- clínica y él la escribió; aquí el campo lo inventó el box y puede ser una
-- observación del staff ("sospecha de lesión"), así que el atleta no lo ve. Sus
-- derechos de titular se atienden por la exportación de datos del box, no
-- pintándolo en su pantalla.
-- -----------------------------------------------------------------------------
create table public.athlete_custom_sensitive (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  custom     jsonb not null default '{}'::jsonb
             check (jsonb_typeof(custom) = 'object'),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index athlete_custom_sensitive_org_idx
  on public.athlete_custom_sensitive (org_id);

create trigger athlete_custom_sensitive_touch
  before update on public.athlete_custom_sensitive
  for each row execute function public.touch_updated_at();

comment on table public.athlete_custom_sensitive is
  'Valores de los campos personalizados marcados como sensibles. Nunca los ve el atleta.';

-- -----------------------------------------------------------------------------
-- Quién puede ver un dato sensible
-- -----------------------------------------------------------------------------
-- Mismo molde que private.auth_finance_org_ids(): dueño y administrador
-- siempre; un coach solo si el box se lo concedió. Se reutiliza el permiso
-- `can_manage_athletes` que ya existe y que ya tiene interruptor en la pantalla
-- de equipo, en vez de inventar una llave nueva que nadie podría activar (la
-- lista cerrada de permisos vive en la migración 0009 y en team/permissions.ts).
-- El día que exista un permiso propio para datos sensibles, solo cambia esta
-- función: ninguna política hay que tocar.
-- -----------------------------------------------------------------------------
create or replace function private.auth_sensitive_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and (
      m.role in ('owner','admin')
      or (m.role = 'coach' and coalesce((m.permissions->>'can_manage_athletes')::boolean, false))
    )
$$;

comment on function private.auth_sensitive_org_ids is
  'Boxes donde el usuario puede ver datos sensibles del atleta. Dueño/admin siempre; coach solo con permiso.';

-- OJO: no se revoca EXECUTE a `authenticated`. Las expresiones de una política
-- RLS se evalúan con los privilegios de QUIEN CONSULTA; revocarlo rompería toda
-- consulta con "permission denied for function". Lo que protege este helper es
-- vivir en `private`, que PostgREST no expone. Ver CLAUDE.md.
grant execute on function private.auth_sensitive_org_ids() to authenticated;
revoke all on function private.auth_sensitive_org_ids() from public, anon;

-- =============================================================================
-- Validación en el SERVIDOR
-- =============================================================================
-- El formulario y el importador validan lo mismo (customfields/validacion.ts),
-- pero la verdad se impone aquí: un obligatorio vacío, un número con letras o
-- una opción que no está en la lista se rechazan aunque la escritura venga de
-- curl, de un script de migración o de una versión vieja de la aplicación.
--
-- Devuelve el jsonb NORMALIZADO (números como número, textos recortados,
-- vacíos eliminados) y el trigger guarda eso. Así no hay dos representaciones
-- del mismo dato: "80" y 80 no pueden convivir en la base.
--
-- SECURITY DEFINER a propósito: si leyera `custom_field_defs` con los permisos
-- de quien escribe, un llamador sin acceso a las definiciones vería CERO filas
-- por RLS y la validación pasaría sin comprobar nada. Un obligatorio se
-- saltaría en silencio, que es justo lo que esta función existe para impedir.
--
-- Solo valida los campos ACTIVOS. Las claves de campos desactivados o borrados
-- se conservan intactas: es lo que hace que desactivar NO pierda datos.
-- =============================================================================
create or replace function public.validate_custom_fields(
  p_org_id    uuid,
  p_custom    jsonb,
  p_sensitive boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d           record;
  v           jsonb;
  resultado   jsonb := coalesce(p_custom, '{}'::jsonb);
  txt         text;
  numero      numeric;
  elemento    jsonb;
  limpios     jsonb;
  intrusa     text;
begin
  if jsonb_typeof(resultado) <> 'object' then
    raise exception 'Los campos personalizados deben venir como objeto, no como %.',
      jsonb_typeof(resultado);
  end if;

  -- Un valor sensible NUNCA puede acabar en la ficha general (ni al revés).
  -- Sin esta comprobación bastaría con escribir directamente en athletes.custom
  -- para dejar una lesión a la vista del atleta.
  select k into intrusa
  from jsonb_object_keys(resultado) k
  join public.custom_field_defs c
    on c.org_id = p_org_id and c.key = k and c.is_active
  where c.is_sensitive <> p_sensitive
  limit 1;

  if intrusa is not null then
    if p_sensitive then
      raise exception 'El campo "%" no está marcado como sensible: su valor va en la ficha general.', intrusa;
    else
      raise exception 'El campo "%" es sensible: su valor no se guarda en la ficha general del atleta.', intrusa;
    end if;
  end if;

  for d in
    select c.key, c.label, c.field_type, c.options, c.is_required
    from public.custom_field_defs c
    where c.org_id = p_org_id
      and c.is_active
      and c.is_sensitive = p_sensitive
    order by c.sort_order, c.key
  loop
    v := resultado -> d.key;

    -- ------------------------------------------------------------------ vacío
    -- "Vacío" tiene muchas caras: la clave ausente, null, "", "   " y []. Todas
    -- son lo mismo y ninguna se guarda: un jsonb lleno de cadenas vacías es
    -- basura que después hay que filtrar en cada pantalla.
    --
    -- Este bloque va ANTES de convertir a número a propósito: en JavaScript
    -- `Number('')` es 0, así que un campo numérico vacío se guardaría como un
    -- 0 perfectamente válido. Un 0 no es un dato, es una casilla vacía
    -- disfrazada (ver CLAUDE.md), y arruina promedios y gráficas.
    if v is null
       or jsonb_typeof(v) = 'null'
       or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
       or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0)
    then
      resultado := resultado - d.key;
      if d.is_required then
        raise exception 'El campo "%" es obligatorio.', d.label;
      end if;
      continue;
    end if;

    -- ------------------------------------------------------------------ tipos
    case d.field_type

      when 'text' then
        if jsonb_typeof(v) <> 'string' then
          raise exception 'El campo "%" espera un texto.', d.label;
        end if;
        txt := btrim(v #>> '{}');
        if length(txt) > 500 then
          raise exception 'El campo "%" no puede pasar de 500 caracteres.', d.label;
        end if;
        resultado := resultado || jsonb_build_object(d.key, to_jsonb(txt));

      when 'number' then
        if jsonb_typeof(v) = 'number' then
          numero := (v #>> '{}')::numeric;
        elsif jsonb_typeof(v) = 'string' then
          txt := replace(btrim(v #>> '{}'), ',', '.');
          -- Se comprueba el PATRÓN antes de convertir. Confiar en el cast (o en
          -- Number.isFinite del lado del cliente) deja pasar cosas como '' o
          -- ' 12 kg' según el motor.
          if txt !~ '^-?[0-9]+(\.[0-9]+)?$' then
            raise exception 'El campo "%" espera un número. Se recibió "%".', d.label, v #>> '{}';
          end if;
          numero := txt::numeric;
        else
          raise exception 'El campo "%" espera un número.', d.label;
        end if;
        resultado := resultado || jsonb_build_object(d.key, to_jsonb(numero));

      when 'date' then
        if jsonb_typeof(v) <> 'string' then
          raise exception 'El campo "%" espera una fecha (AAAA-MM-DD).', d.label;
        end if;
        txt := btrim(v #>> '{}');
        if txt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
          raise exception 'El campo "%" espera una fecha con formato AAAA-MM-DD. Se recibió "%".',
            d.label, txt;
        end if;
        begin
          perform txt::date;  -- atrapa el 31 de febrero, que pasa el patrón
        exception when others then
          raise exception 'El campo "%" tiene una fecha que no existe: "%".', d.label, txt;
        end;
        resultado := resultado || jsonb_build_object(d.key, to_jsonb(txt));

      when 'boolean' then
        if jsonb_typeof(v) = 'boolean' then
          null;  -- ya está bien
        elsif jsonb_typeof(v) = 'string' and lower(btrim(v #>> '{}')) in ('true','false') then
          resultado := resultado || jsonb_build_object(
            d.key, to_jsonb(lower(btrim(v #>> '{}')) = 'true'));
        else
          raise exception 'El campo "%" solo acepta sí o no.', d.label;
        end if;

      when 'select' then
        if jsonb_typeof(v) <> 'string' then
          raise exception 'El campo "%" espera una de sus opciones.', d.label;
        end if;
        txt := btrim(v #>> '{}');
        if not (txt = any(d.options)) then
          raise exception 'El campo "%" no acepta "%". Opciones válidas: %.',
            d.label, txt, array_to_string(d.options, ', ');
        end if;
        resultado := resultado || jsonb_build_object(d.key, to_jsonb(txt));

      when 'multiselect' then
        if jsonb_typeof(v) <> 'array' then
          raise exception 'El campo "%" espera una lista de opciones.', d.label;
        end if;
        limpios := '[]'::jsonb;
        for elemento in select value from jsonb_array_elements(v) loop
          if jsonb_typeof(elemento) <> 'string' then
            raise exception 'El campo "%" espera una lista de opciones.', d.label;
          end if;
          txt := btrim(elemento #>> '{}');
          if not (txt = any(d.options)) then
            raise exception 'El campo "%" no acepta "%". Opciones válidas: %.',
              d.label, txt, array_to_string(d.options, ', ');
          end if;
          if not (limpios @> to_jsonb(array[txt])) then
            limpios := limpios || to_jsonb(array[txt]);
          end if;
        end loop;
        resultado := resultado || jsonb_build_object(d.key, limpios);

      when 'phone' then
        -- Misma regla que athletes.phone: la base exige E.164 y no adivina. La
        -- normalización ("300 123 4567" -> "+573001234567") la hace shared/lib/
        -- phone.ts, que es la única implementación: dos normalizadores acaban
        -- divergiendo y el segundo siempre pierde.
        if jsonb_typeof(v) <> 'string' then
          raise exception 'El campo "%" espera un celular.', d.label;
        end if;
        txt := btrim(v #>> '{}');
        if txt !~ '^\+[1-9][0-9]{7,14}$' then
          raise exception
            'El campo "%" espera un celular en formato internacional (+573001234567). Se recibió "%".',
            d.label, txt;
        end if;
        resultado := resultado || jsonb_build_object(d.key, to_jsonb(txt));

      else
        raise exception 'Tipo de campo desconocido: %.', d.field_type;
    end case;
  end loop;

  -- Tope de tamaño. Las claves sin definición activa se conservan (es lo que
  -- salva los datos de un campo desactivado), y sin este tope cualquiera podría
  -- usar la ficha del atleta como almacén de basura.
  if length(resultado::text) > 8000 then
    raise exception 'Los campos personalizados de este atleta ocupan demasiado (máximo 8 KB).';
  end if;

  return resultado;
end;
$$;

comment on function public.validate_custom_fields is
  'Valida y normaliza los valores de los campos personalizados de un box. Levanta excepción en español si algo no cuadra.';

-- No se expone por la API: solo la llaman los triggers. Si se pudiera invocar
-- desde el cliente, sus mensajes de error revelarían las etiquetas de los
-- campos de CUALQUIER box (la función es SECURITY DEFINER y recibe el org_id
-- como parámetro). Un trigger no comprueba EXECUTE al dispararse, así que
-- revocarlo no rompe ninguna escritura; la prueba lo verifica escribiendo como
-- `authenticated`.
revoke all on function public.validate_custom_fields(uuid, jsonb, boolean)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Triggers de validación
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER: estas dos envolturas no tocan ninguna tabla, solo llaman a
-- `validate_custom_fields`, que está revocada para `authenticated` (ver arriba).
-- Una función SECURITY INVOKER sí comprueba EXECUTE en las llamadas de su
-- cuerpo, así que sin esto toda escritura fallaría con "permission denied for
-- function". Es el precio de no exponer la validación por la API.
create or replace function public.athletes_validate_custom()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.custom := public.validate_custom_fields(new.org_id, new.custom, false);
  return new;
end;
$$;

create or replace function public.athlete_custom_sensitive_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.custom := public.validate_custom_fields(new.org_id, new.custom, true);
  return new;
end;
$$;

-- Dos triggers y no uno: la cláusula WHEN de un trigger de INSERT no puede
-- mirar OLD. Y en UPDATE se valida SOLO si `custom` cambió, lo cual no es una
-- optimización sino una protección: el día que un box marque un campo como
-- obligatorio, sus atletas viejos quedan sin ese dato; si se validara en cada
-- UPDATE, `mark_overdue()` (que solo toca `status`) empezaría a fallar y el box
-- se quedaría sin cobrar. El dato se exige cuando alguien edita la ficha.
create trigger athletes_validate_custom_ins
  before insert on public.athletes
  for each row execute function public.athletes_validate_custom();

create trigger athletes_validate_custom_upd
  before update on public.athletes
  for each row
  when (new.custom is distinct from old.custom or new.org_id is distinct from old.org_id)
  execute function public.athletes_validate_custom();

create trigger athlete_custom_sensitive_validate_ins
  before insert on public.athlete_custom_sensitive
  for each row execute function public.athlete_custom_sensitive_validate();

create trigger athlete_custom_sensitive_validate_upd
  before update on public.athlete_custom_sensitive
  for each row
  when (new.custom is distinct from old.custom or new.org_id is distinct from old.org_id)
  execute function public.athlete_custom_sensitive_validate();

-- =============================================================================
-- Reglas sobre las propias definiciones
-- =============================================================================

-- -----------------------------------------------------------------------------
-- La clave y el tipo son inmutables; la etiqueta no
-- -----------------------------------------------------------------------------
-- Renombrar "Talla" a "Talla de camiseta" es cosa de todos los días y no puede
-- costar un solo dato. Cambiar la CLAVE, en cambio, deja huérfano en silencio
-- todo lo guardado: el valor sigue en el jsonb con la clave vieja y ninguna
-- pantalla lo vuelve a encontrar. Cambiar el TIPO convierte cada valor ya
-- guardado en un valor inválido que bloquea la siguiente edición del atleta.
-- -----------------------------------------------------------------------------
create or replace function public.custom_field_defs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key is distinct from old.key then
    raise exception
      'La clave de un campo no se puede cambiar (era "%"). Cambia la etiqueta, que es lo que se ve; o desactiva este campo y crea otro.',
      old.key;
  end if;
  if new.field_type is distinct from old.field_type then
    raise exception
      'El tipo del campo "%" no se puede cambiar: los valores ya guardados dejarían de ser válidos. Desactívalo y crea uno nuevo.',
      old.label;
  end if;
  if new.org_id is distinct from old.org_id then
    raise exception 'Un campo personalizado no se puede mover a otro box.';
  end if;
  return new;
end;
$$;

create trigger custom_field_defs_guard_upd
  before update on public.custom_field_defs
  for each row execute function public.custom_field_defs_guard();

-- -----------------------------------------------------------------------------
-- Tope de campos por box
-- -----------------------------------------------------------------------------
-- 30 campos activos. No es una restricción técnica: es que una ficha con 60
-- casillas no la llena nadie y el box termina usando el Excel de nuevo.
-- Cuenta solo los ACTIVOS, así que desactivar libera cupo.
-- -----------------------------------------------------------------------------
create or replace function public.custom_field_defs_limit()
returns trigger
language plpgsql
security definer   -- la cuenta no puede depender de lo que la RLS deje ver
set search_path = ''
as $$
declare
  activos int;
  tope constant int := 30;
begin
  if not new.is_active then
    return new;
  end if;

  select count(*) into activos
  from public.custom_field_defs c
  where c.org_id = new.org_id
    and c.is_active
    and c.id <> new.id;

  if activos >= tope then
    raise exception
      'Este box ya tiene % campos personalizados activos, que es el máximo. Desactiva alguno antes de crear otro.',
      tope;
  end if;
  return new;
end;
$$;

create trigger custom_field_defs_limit_ins
  before insert on public.custom_field_defs
  for each row execute function public.custom_field_defs_limit();

create trigger custom_field_defs_limit_upd
  before update on public.custom_field_defs
  for each row
  when (new.is_active and not old.is_active)
  execute function public.custom_field_defs_limit();

-- -----------------------------------------------------------------------------
-- Borrar un campo no puede borrar los datos de los atletas
-- -----------------------------------------------------------------------------
-- Un campo que ya tiene valores NO se borra: se desactiva. Un campo que nadie
-- llenó nunca sí se puede borrar, porque no hay nada que perder y obligar a
-- arrastrar para siempre un error de tecleo es absurdo.
-- -----------------------------------------------------------------------------
create or replace function public.custom_field_defs_block_delete()
returns trigger
language plpgsql
security definer   -- tiene que ver TODOS los atletas del box, no solo los visibles
set search_path = ''
as $$
begin
  if exists (
        select 1 from public.athletes a
        where a.org_id = old.org_id and a.custom ? old.key
      )
     or exists (
        select 1 from public.athlete_custom_sensitive s
        where s.org_id = old.org_id and s.custom ? old.key
      )
  then
    raise exception
      'El campo "%" ya tiene datos de atletas. Desactívalo en vez de borrarlo: así los valores se conservan y vuelven a verse si lo reactivas.',
      old.label;
  end if;
  return old;
end;
$$;

create trigger custom_field_defs_block_delete_trg
  before delete on public.custom_field_defs
  for each row execute function public.custom_field_defs_block_delete();

-- -----------------------------------------------------------------------------
-- Marcar un campo como sensible MUEVE los valores que ya tenía
-- -----------------------------------------------------------------------------
-- Sin esto, marcar "Lesiones" como sensible no serviría de nada: los valores
-- viejos seguirían en athletes.custom, donde el atleta los lee. El cambio de
-- interruptor tiene que mover el dato al almacén correcto, en la misma
-- transacción, o no significa nada.
--
-- SECURITY DEFINER porque toca las filas de todos los atletas del box; no es un
-- agujero: solo se llega aquí actualizando una definición, y esa actualización
-- ya está restringida por RLS a dueño/administrador DE ESE box, y la función
-- solo toca filas de `new.org_id`.
-- -----------------------------------------------------------------------------
create or replace function public.custom_field_defs_move_values()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_sensitive then
    insert into public.athlete_custom_sensitive (athlete_id, org_id, custom)
    select a.id, a.org_id, jsonb_build_object(new.key, a.custom -> new.key)
    from public.athletes a
    where a.org_id = new.org_id and a.custom ? new.key
    on conflict (athlete_id) do update
      set custom     = athlete_custom_sensitive.custom || excluded.custom,
          updated_at = now();

    update public.athletes a
       set custom = a.custom - new.key
     where a.org_id = new.org_id and a.custom ? new.key;
  else
    update public.athletes a
       set custom = a.custom || jsonb_build_object(new.key, s.custom -> new.key)
      from public.athlete_custom_sensitive s
     where s.athlete_id = a.id
       and a.org_id = new.org_id
       and s.custom ? new.key;

    update public.athlete_custom_sensitive s
       set custom = s.custom - new.key
     where s.org_id = new.org_id and s.custom ? new.key;
  end if;
  return null;
end;
$$;

create trigger custom_field_defs_move_values_trg
  after update on public.custom_field_defs
  for each row
  when (new.is_sensitive is distinct from old.is_sensitive)
  execute function public.custom_field_defs_move_values();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.custom_field_defs        enable row level security;
alter table public.athlete_custom_sensitive enable row level security;

-- Todo el staff LEE las definiciones: sin ellas no se puede pintar el
-- formulario. Lo que un coach sin permiso no puede ver es el VALOR sensible de
-- un atleta, y eso lo decide la política de athlete_custom_sensitive.
create policy "staff lee las definiciones de su box"
  on public.custom_field_defs for select
  to authenticated
  using (org_id in (select private.auth_staff_org_ids()));

-- El atleta necesita las definiciones no sensibles para leer su propia ficha.
create policy "el atleta lee las definiciones no sensibles de su box"
  on public.custom_field_defs for select
  to authenticated
  using (
    is_active
    and not is_sensitive
    and org_id in (select private.auth_org_ids())
  );

-- Definir la ficha es decisión del dueño, no del coach.
create policy "owner/admin gestionan las definiciones"
  on public.custom_field_defs for all
  to authenticated
  using (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])))
  with check (org_id in (select private.auth_org_ids_with_role(array['owner','admin'])));

-- Los valores sensibles: ni el atleta, ni un coach sin permiso. Sin política de
-- lectura para el atleta A PROPÓSITO (compárese con athlete_health, donde sí la
-- hay porque ese dato es suyo y lo declaró él).
create policy "solo quien puede ver datos sensibles toca estos valores"
  on public.athlete_custom_sensitive for all
  to authenticated
  using (org_id in (select private.auth_sensitive_org_ids()))
  with check (org_id in (select private.auth_sensitive_org_ids()));

-- Si esta migración se aplica, es porque todo quedó protegido.
do $$ begin perform public.assert_rls_enabled(); end $$;
