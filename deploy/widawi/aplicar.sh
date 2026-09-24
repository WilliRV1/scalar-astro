#!/usr/bin/env bash
# Aplica en la base de prueba de widawi las migraciones de ./repo que falten.
# Lleva el registro en scalar_demo.migraciones con el hash de cada archivo: si
# alguien edita una migración ya aplicada, avisa en vez de aplicarla a medias.
#   ./aplicar.sh            migraciones pendientes
#   ./aplicar.sh --semilla  además recarga el box de demostración
set -euo pipefail
cd "$(dirname "$0")"
C=$(docker compose ps -q db)
psql_() { docker exec -i "$C" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql_ -c "create schema if not exists scalar_demo;
  create table if not exists scalar_demo.migraciones (
    archivo text primary key, sha text not null, aplicada timestamptz default now());"

for f in repo/supabase/migrations/*.sql; do
  n=$(basename "$f"); sha=$(sha256sum "$f" | cut -c1-16)
  prev=$(psql_ -tAc "select sha from scalar_demo.migraciones where archivo = '$n'")
  if [[ -z "$prev" ]]; then
    echo "→ aplicando $n"
    psql_ < "$f"
    psql_ -c "insert into scalar_demo.migraciones (archivo, sha) values ('$n', '$sha')"
  elif [[ "$prev" != "$sha" ]]; then
    echo "✗ $n cambió después de aplicada. Hace falta reiniciar la base (./reiniciar.sh)."
    exit 1
  fi
done

if [[ "${1:-}" == "--semilla" ]]; then
  echo "→ recargando box de demostración"
  psql_ < repo/supabase/seed_demo.sql 2>&1 | grep -E "ERROR|WARNING" || true
fi
echo "✓ base al día"
