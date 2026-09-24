#!/usr/bin/env bash
# Respaldo diario de Scalar en widawi: la base (pg_dump -Fc) y los archivos de
# Storage (logos, comprobantes). Guarda 14 días. Lo dispara respaldo-scalar.timer.
#
# Restaurar (probarlo una vez al mes, no cuando toque):
#   docker exec -i scalar-demo-db-1 pg_restore -U supabase_admin -d postgres --clean --if-exists < scalar-db-FECHA.dump
#   docker run --rm -v scalar-demo_storage-data:/v -v ~/respaldos/scalar:/r alpine tar xzf /r/scalar-storage-FECHA.tgz -C /v
set -euo pipefail

DESTINO="$HOME/respaldos/scalar"
FECHA="$(date +%Y%m%d-%H%M)"
DB="$(docker ps -q -f name=scalar-demo-db)"
mkdir -p "$DESTINO"

docker exec "$DB" pg_dump -U supabase_admin -d postgres -Fc \
  --exclude-schema=cron --exclude-schema=net \
  > "$DESTINO/scalar-db-$FECHA.dump"

docker run --rm -v scalar-demo_storage-data:/v:ro -v "$DESTINO":/r alpine \
  tar czf "/r/scalar-storage-$FECHA.tgz" -C /v .

# Un respaldo que no se puede leer no es un respaldo.
docker exec -i "$DB" pg_restore --list < "$DESTINO/scalar-db-$FECHA.dump" > /dev/null

find "$DESTINO" -name 'scalar-*' -mtime +14 -delete
echo "ok $FECHA $(du -sh "$DESTINO" | cut -f1)"
