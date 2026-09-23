#!/usr/bin/env bash
# =============================================================================
# Deja un proyecto de Supabase listo para la demostración.
# =============================================================================
# Aplica TODAS las migraciones en orden y encima el box de demostración.
#
#   SUPABASE_DB_URL="postgresql://postgres:...@db.xxx.supabase.co:5432/postgres" \
#     ./scripts/setup-demo.sh
#
#   ./scripts/setup-demo.sh "postgresql://..."     # la URL como argumento
#   ./scripts/setup-demo.sh --solo-semilla         # ya migraste, solo los datos
#   ./scripts/setup-demo.sh --sin-semilla          # solo el esquema, sin datos
#   ./scripts/setup-demo.sh --si                   # sin preguntar (CI)
#
# Dónde se copia la URL: panel de Supabase → Project Settings → Database →
# Connection string → URI. La contraseña es la que pusiste al crear el proyecto;
# si no la recuerdas, ahí mismo se reinicia.
#
# Qué hace para no romper nada:
#   · lleva la cuenta de las migraciones aplicadas en
#     `supabase_migrations.schema_migrations` —la misma tabla que usa la CLI de
#     Supabase—, así que volver a correrlo no las repite;
#   · si la base YA tiene boxes con datos, avisa y pide confirmación antes de
#     escribir;
#   · la semilla borra y vuelve a crear SOLO el box de demostración. Un box real
#     que viva en la misma base no se toca.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

rojo()  { printf '\033[0;31m%s\033[0m\n' "$*" >&2; }
verde() { printf '\033[0;32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[0;90m%s\033[0m\n' "$*"; }
paso()  { printf '\n\033[1m→ %s\033[0m\n' "$*"; }

morir() { rojo "✗ $*"; exit 1; }

# ----------------------------------------------------------------- argumentos
CON_MIGRACIONES=1
CON_SEMILLA=1
SIN_PREGUNTAR=0
URL_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --solo-semilla) CON_MIGRACIONES=0 ;;
    --sin-semilla)  CON_SEMILLA=0 ;;
    --si|--yes|-y)  SIN_PREGUNTAR=1 ;;
    -h|--help)      sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)             morir "Opción desconocida: $1" ;;
    *)              URL_ARG="$1" ;;
  esac
  shift
done

# --------------------------------------------------------------- herramientas
command -v psql >/dev/null 2>&1 || morir \
  "No hay psql. Instálalo: 'brew install libpq' en macOS o 'apt install postgresql-client' en Linux."

# ------------------------------------------------------------ cadena de conexión
DB_URL="${URL_ARG:-${SUPABASE_DB_URL:-}}"

if [[ -z "$DB_URL" && -n "${SUPABASE_PROJECT_REF:-}" && -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  # Conexión directa al proyecto. Si tu red no tiene IPv6, usa mejor la cadena
  # del pooler que aparece en el panel (puerto 6543 o 5432 vía pooler).
  DB_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres"
  gris "Cadena armada a partir de SUPABASE_PROJECT_REF."
fi

if [[ -z "$DB_URL" ]]; then
  cat >&2 <<'AYUDA'
✗ Falta la cadena de conexión de la base.

  Cópiala del panel de Supabase:
    Project Settings → Database → Connection string → URI

  Y córrelo así:
    SUPABASE_DB_URL="postgresql://postgres:TU_CLAVE@db.xxxx.supabase.co:5432/postgres" \
      ./scripts/setup-demo.sh

  (o pásala como primer argumento)
AYUDA
  exit 1
fi

PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 --no-psqlrc)

# La URL lleva la contraseña: nunca se imprime entera.
SEGURA="$(printf '%s' "$DB_URL" | sed -E 's#(//[^:]+):[^@]*@#\1:****@#')"

paso "Conectando a $SEGURA"
"${PSQL[@]}" -q -t -c 'select 1' >/dev/null 2>&1 || morir \
  "No se pudo conectar. Revisa la contraseña y que la cadena sea la del proyecto correcto.
   Si tu red es solo IPv4, usa la cadena del pooler (Connection pooling) en vez de la directa."
verde "  conexión ok · $("${PSQL[@]}" -q -t -A -c 'select current_database() || $$ @ $$ || version()' | cut -c1-60)"

# ------------------------------------------------------------- ¿hay datos ya?
EXISTE_ORGS="$("${PSQL[@]}" -q -t -A -c "select to_regclass('public.organizations') is not null")"
if [[ "$EXISTE_ORGS" == "t" ]]; then
  N_ORGS="$("${PSQL[@]}" -q -t -A -c "select count(*) from public.organizations where slug <> 'box-la-ladera'")"
  if [[ "$N_ORGS" -gt 0 ]]; then
    rojo "⚠ Esta base ya tiene $N_ORGS box(es) además del de demostración."
    gris "  Las migraciones que falten se aplicarán sobre ellos y la semilla creará el box"
    gris "  de demostración al lado. Ningún box existente se borra, pero si esto es una base"
    gris "  de un cliente, párale aquí."
    if [[ "$SIN_PREGUNTAR" -eq 0 ]]; then
      [[ -t 0 ]] || morir "No hay terminal para preguntar. Si estás seguro, repite con --si."
      read -r -p "  Escribe SI para continuar: " RESP
      [[ "$RESP" == "SI" ]] || morir "Cancelado. No se escribió nada."
    fi
  fi
fi

# -------------------------------------------------------------- migraciones
if [[ "$CON_MIGRACIONES" -eq 1 ]]; then
  paso "Aplicando migraciones"

  "${PSQL[@]}" -q <<'SQL'
set client_min_messages = warning;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
SQL

  APLICADAS=0
  OMITIDAS=0
  for f in "$ROOT"/supabase/migrations/*.sql; do
    BASE="$(basename "$f")"
    VERSION="${BASE%%_*}"
    YA="$("${PSQL[@]}" -q -t -A -c \
      "select count(*) from supabase_migrations.schema_migrations where version = '$VERSION'")"
    if [[ "$YA" != "0" ]]; then
      gris "  · $BASE (ya estaba)"
      OMITIDAS=$((OMITIDAS + 1))
      continue
    fi
    printf '  · %s' "$BASE"
    if ! SALIDA="$("${PSQL[@]}" -q -f "$f" 2>&1)"; then
      printf '\n'
      rojo "$SALIDA"
      morir "Falló la migración $BASE. No se aplicó nada de lo que sigue."
    fi
    # Las migraciones traen NOTICE informativos; solo se enseñan si hay algo raro.
    printf ' ✓\n'
    if [[ -n "$SALIDA" ]]; then
      gris "$(printf '%s' "$SALIDA" | sed 's/^/      /')"
    fi
    "${PSQL[@]}" -q -c \
      "insert into supabase_migrations.schema_migrations (version, name)
       values ('$VERSION', '$BASE') on conflict (version) do nothing"
    APLICADAS=$((APLICADAS + 1))
  done
  verde "  $APLICADAS migración(es) nueva(s), $OMITIDAS ya estaban"
fi

# ------------------------------------------------------------------ semilla
if [[ "$CON_SEMILLA" -eq 1 ]]; then
  paso "Sembrando el box de demostración"
  gris "  (borra y vuelve a crear SOLO el box 'box-la-ladera')"
  if ! SALIDA="$("${PSQL[@]}" -f "$ROOT/supabase/seed_demo.sql" 2>&1)"; then
    rojo "$SALIDA"
    morir "Falló la semilla. La base quedó como estaba: va toda en una transacción."
  fi
  # El resumen que imprime la propia semilla.
  printf '%s\n' "$SALIDA" | grep -E 'NOTICE' | sed -E 's/^psql:[^ ]+ //; s/^NOTICE: {0,2}//' | sed 's/^/  /'
fi

paso "Listo"
cat <<'FIN'
  Entra con:
    dueno@boxlaladera.co   demo1234   (dueño: lo ve todo)
    coach@boxlaladera.co   demo1234   (coach: sin acceso a la plata)
    atleta@boxlaladera.co  demo1234   (atleta: su ficha, sus marcas, sus cobros)

  Los tres usuarios los crea la propia semilla. Si el inicio de sesión falla
  (pasa si el proyecto no expone pgcrypto), ponles la contraseña a mano desde el
  editor SQL del panel:

    update auth.users
       set encrypted_password = extensions.crypt('demo1234', extensions.gen_salt('bf'))
     where email like '%@boxlaladera.co';

  No los borres ni los vuelvas a crear desde el panel: las membresías y el
  vínculo con la ficha del atleta cuelgan del id que sembró este script.

  Guion de los 10 minutos: docs/13-puesta-en-marcha.md
FIN
