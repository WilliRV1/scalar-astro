#!/usr/bin/env bash
# Desde el PC: sube el estado actual del repo a https://scalar.widawi.online
#   desplegar.sh [--semilla]
#
# Sube migraciones, Edge Functions, la configuración de docker-compose y nginx,
# aplica lo pendiente en la base, levanta lo que haya cambiado y publica la SPA
# compilada contra este entorno. Los secretos siguen en ~/scalar-demo/.env, que
# no se toca.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"

# Migraciones, semilla, funciones y enrutador. A las funciones se les quitan
# los \r por si el checkout de Windows dejó CRLF. A las migraciones NO: psql
# las lee igual y aplicar.sh compara su hash con el de cuando se aplicaron.
tar czf - supabase/migrations supabase/seed_demo.sql supabase/functions deploy/widawi/functions \
  | ssh widawi 'set -e; rm -rf ~/scalar-demo/repo; mkdir -p ~/scalar-demo/repo; tar xzf - -C ~/scalar-demo/repo;
    find ~/scalar-demo/repo/supabase/functions ~/scalar-demo/repo/deploy -type f \( -name "*.ts" -o -name "*.json" \) -exec sed -i "s/\r$//" {} +'

ssh widawi 'set -e; cd ~/scalar-demo; rm -rf functions; mkdir functions;
  cp -r repo/supabase/functions/. functions/;
  cp -r repo/deploy/widawi/functions/main functions/main'

# compose y nginx, tal cual están en el repo.
for f in docker-compose.yml nginx.conf scalar-cabeceras.conf; do
  sed 's/\r$//' "deploy/widawi/$f" | ssh widawi "cat > ~/scalar-demo/$f"
done

ssh widawi "cd ~/scalar-demo && ./aplicar.sh ${1:-} && docker compose up -d --remove-orphans && docker compose restart functions >/dev/null && docker compose exec web nginx -s reload"

ANON=$(ssh widawi "grep ^ANON_KEY= ~/scalar-demo/.env | cut -d= -f2-")
OUT=$(mktemp -d)
VITE_SUPABASE_URL=https://scalar.widawi.online VITE_SUPABASE_ANON_KEY="$ANON" \
  npx vite build --outDir "$OUT" --emptyOutDir --logLevel error
tar czf - -C "$OUT" . | ssh widawi 'rm -rf ~/scalar-demo/dist/* && tar xzf - -C ~/scalar-demo/dist'
rm -rf "$OUT"
echo "✓ desplegado $(git rev-parse --short HEAD) en https://scalar.widawi.online"
