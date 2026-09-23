#!/usr/bin/env bash
# Comprueba que es seguro aplicar Scalar sobre una base que YA TIENE datos de
# otro proyecto. No escribe nada salvo que se le pida con --registrar.
#
#   SUPABASE_DB_URL="postgresql://…" ./scripts/preflight.sh
#   SUPABASE_DB_URL="postgresql://…" ./scripts/preflight.sh --registrar
#
# Hace dos cosas:
#   1. CHOQUES DE NOMBRE. Varias tablas de Scalar tienen nombres genéricos
#      (invoices, payments, expenses, results, classes). Si ya existe una con
#      ese nombre, aplicar las migraciones fallaría a mitad de camino y dejaría
#      la base en un estado raro. Mejor saberlo antes.
#   2. TABLAS AJENAS. Las que no son de Scalar se registran en
#      `scalar_foreign_tables` para que la guarda de RLS no las revise.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[[ -n "${SUPABASE_DB_URL:-}" ]] || {
  echo "Falta SUPABASE_DB_URL."
  echo "Se saca de Supabase → Project Settings → Database → Connection string → URI"
  exit 1
}

REGISTRAR=false
[[ "${1:-}" == "--registrar" ]] && REGISTRAR=true

# Las tablas de Scalar se leen de las propias migraciones: así la lista no se
# queda desactualizada cuando alguien añade una tabla nueva.
mapfile -t NUESTRAS < <(
  grep -rhoiE 'create table (if not exists )?public\.[a-z_]+' supabase/migrations/*.sql \
    | sed -E 's/.*public\.//' | sort -u
)

echo "→ Scalar define ${#NUESTRAS[@]} tablas."

EXISTENTES=$(psql "$SUPABASE_DB_URL" -tAc "
  select string_agg(tablename, E'\n')
  from pg_tables where schemaname = 'public';") || {
  echo "✗ No se pudo conectar a la base. Revisa SUPABASE_DB_URL."; exit 1
}

if [[ -z "$EXISTENTES" ]]; then
  echo "✓ La base está vacía. Puedes aplicar las migraciones sin riesgo."
  exit 0
fi

mapfile -t ACTUALES <<< "$EXISTENTES"
echo "→ La base ya tiene ${#ACTUALES[@]} tablas en public."

# ¿Ya está Scalar aplicado aquí? (si están sus tablas centrales, sí)
YA_APLICADO=false
printf '%s\n' "${ACTUALES[@]}" | grep -qx "organizations" && \
  printf '%s\n' "${ACTUALES[@]}" | grep -qx "memberships" && YA_APLICADO=true

CHOQUES=(); AJENAS=()
for t in "${ACTUALES[@]}"; do
  if printf '%s\n' "${NUESTRAS[@]}" | grep -qx "$t"; then
    $YA_APLICADO || CHOQUES+=("$t")
  else
    AJENAS+=("$t")
  fi
done

echo
if [[ ${#AJENAS[@]} -gt 0 ]]; then
  echo "TABLAS QUE NO SON DE SCALAR (${#AJENAS[@]}):"
  printf '   · %s\n' "${AJENAS[@]}"
  echo
  echo "   Scalar no las toca. Solo hay que decírselo a la guarda de RLS,"
  echo "   que si no aborta al ver una tabla sin RLS."
fi

if [[ ${#CHOQUES[@]} -gt 0 ]]; then
  echo
  echo "✗ CHOQUE DE NOMBRES (${#CHOQUES[@]}). NO apliques las migraciones:"
  printf '   · %s\n' "${CHOQUES[@]}"
  echo
  echo "   Esas tablas ya existen y Scalar quiere crear otras con el mismo"
  echo "   nombre. La migración fallaría a mitad y dejaría la base a medias."
  echo "   Lo más limpio es un proyecto de Supabase aparte para Scalar."
  exit 2
fi

if $YA_APLICADO; then
  echo "→ Scalar ya está aplicado en esta base."
fi

if [[ ${#AJENAS[@]} -gt 0 ]]; then
  if $REGISTRAR; then
    echo
    echo "→ Registrando las tablas ajenas…"
    for t in "${AJENAS[@]}"; do
      psql "$SUPABASE_DB_URL" -q -c "
        insert into public.scalar_foreign_tables (table_name, note)
        values ('$t', 'registrada por preflight.sh')
        on conflict (table_name) do nothing;" 2>/dev/null \
        || { echo "   (aún no existe scalar_foreign_tables: aplica primero la migración 20260916115800)"; break; }
      echo "   · $t"
    done
    echo "✓ Listo."
  else
    echo
    echo "   Para registrarlas: ./scripts/preflight.sh --registrar"
    echo "   (hazlo DESPUÉS de aplicar la migración 20260916115800)"
  fi
fi

echo
echo "✓ Sin choques. Es seguro aplicar Scalar en esta base."
