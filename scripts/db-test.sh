#!/usr/bin/env bash
# Ejecuta las pruebas de base de datos: migraciones + guarda de RLS + aislamiento.
#
#   ./scripts/db-test.sh                      # levanta un Postgres efímero local
#   DATABASE_URL=postgres://... ./scripts/db-test.sh   # contra una base ya existente
#
# La versión efímera no necesita Docker: usa los binarios de PostgreSQL del
# sistema y un stub mínimo del esquema `auth` de Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

run_sql() { psql "$@" -v ON_ERROR_STOP=1 -q; }

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "$DATABASE_URL")
  echo "→ Usando DATABASE_URL"
else
  PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
  [[ -x "$PGBIN/initdb" ]] || { echo "No se encontró PostgreSQL. Instala postgresql o define DATABASE_URL."; exit 1; }
  TMP="$(mktemp -d)"
  chmod 711 "$TMP"

  # PostgreSQL se niega a arrancar como root. En un contenedor que corre como
  # root (CI propio, Codespaces) se delega en el usuario `postgres`.
  if [[ "$(id -u)" -eq 0 ]]; then
    id postgres >/dev/null 2>&1 || { echo "Corriendo como root y no existe el usuario postgres."; exit 1; }
    mkdir -p "$TMP/data"; chown postgres:postgres "$TMP" "$TMP/data"
    AS_PG=(su postgres -c)
  else
    AS_PG=(bash -c)
  fi

  stop_pg() { "${AS_PG[@]}" "'$PGBIN/pg_ctl' -D '$TMP/data' stop -m immediate" >/dev/null 2>&1 || true; }
  trap 'stop_pg; rm -rf "$TMP"' EXIT

  "${AS_PG[@]}" "'$PGBIN/initdb' -D '$TMP/data' -U postgres --auth=trust" >/dev/null
  "${AS_PG[@]}" "'$PGBIN/pg_ctl' -D '$TMP/data' -o '-k $TMP -c listen_addresses=' -l '$TMP/log' start" >/dev/null
  PSQL=(psql -h "$TMP" -U postgres -d postgres)
  echo "→ Postgres efímero en $TMP"
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f supabase/tests/_local_auth_stub.sql
fi

echo "→ Aplicando migraciones"
for f in supabase/migrations/*.sql; do
  echo "   · $(basename "$f")"
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$f"
done

echo "→ Guarda de RLS"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f supabase/tests/rls_guard.sql

echo "→ Aislamiento entre boxes"
# Sin `set -o pipefail` explícito aquí, un fallo de psql quedaría enmascarado por
# el grep y CI pasaría en verde con las pruebas rotas. Se captura la salida y se
# comprueba el código de psql, no el del grep.
if out="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql 2>&1)"; then
  echo "$out" | grep -E "ok ·|AISLAMIENTO" || { echo "$out"; echo "✗ La prueba no reportó ninguna aserción"; exit 1; }
else
  echo "$out"
  echo "✗ Fallaron las pruebas de aislamiento"
  exit 1
fi

echo "→ Equipo del box (invitaciones y permisos)"
if out="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -f supabase/tests/team.sql 2>&1)"; then
  echo "$out" | grep -E "ok ·|EQUIPO" || { echo "$out"; echo "✗ Sin aserciones"; exit 1; }
else
  echo "$out"; echo "✗ Fallaron las pruebas de equipo"; exit 1
fi

echo "→ Cobro en línea (Wompi)"
if out="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -f supabase/tests/wompi.sql 2>&1)"; then
  echo "$out" | grep -E "ok ·|WOMPI" || { echo "$out"; echo "✗ Sin aserciones"; exit 1; }
else
  echo "$out"; echo "✗ Fallaron las pruebas de Wompi"; exit 1
fi

echo "→ Motor de cobros"
if out="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -f supabase/tests/billing_engine.sql 2>&1)"; then
  echo "$out" | grep -E "ok ·|MOTOR" || { echo "$out"; echo "✗ Sin aserciones"; exit 1; }
else
  echo "$out"; echo "✗ Falló el motor de cobros"; exit 1
fi

echo "→ Migración del box del entrenador (datos del prototipo)"
if out="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -f supabase/tests/legacy_migration.sql 2>&1)"; then
  echo "$out" | grep -E "ok ·|MIGRACIÓN" || { echo "$out"; echo "✗ Sin aserciones"; exit 1; }
else
  echo "$out"; echo "✗ Falló la migración del prototipo"; exit 1
fi

echo "✓ Base de datos OK"
