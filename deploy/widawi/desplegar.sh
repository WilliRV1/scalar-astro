#!/usr/bin/env bash
# Desde el PC: sube el estado actual del repo a https://scalar.widawi.online
#   desplegar.sh [--semilla]
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"
tar czf - supabase/migrations supabase/seed_demo.sql \
  | ssh widawi 'rm -rf ~/scalar-demo/repo && mkdir -p ~/scalar-demo/repo && tar xzf - -C ~/scalar-demo/repo'
ssh widawi "cd ~/scalar-demo && ./aplicar.sh ${1:-}"
ANON=$(ssh widawi "grep ^ANON_KEY= ~/scalar-demo/.env | cut -d= -f2-")
OUT=$(mktemp -d)
VITE_SUPABASE_URL=https://scalar.widawi.online VITE_SUPABASE_ANON_KEY="$ANON" \
  npx vite build --outDir "$OUT" --emptyOutDir --logLevel error
tar czf - -C "$OUT" . | ssh widawi 'rm -rf ~/scalar-demo/dist/* && tar xzf - -C ~/scalar-demo/dist'
rm -rf "$OUT"
echo "✓ desplegado $(git rev-parse --short HEAD) en https://scalar.widawi.online"
