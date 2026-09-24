# Entorno de prueba autoalojado (widawi)

Scalar corre en el servidor `widawi` sin Supabase en la nube, en
`~/scalar-demo`, y se publica en **https://scalar.widawi.online** por el túnel
de Cloudflare `widawi` (ruta `scalar.widawi.online → http://100.94.57.56:8099`).

Es un Supabase recortado a lo que usa la app: Postgres (imagen oficial de
Supabase, con `pg_cron`), Auth (GoTrue), PostgREST y Storage. Un nginx sirve la
SPA y hace de pasarela bajo el mismo origen. **No hay Edge Functions**: el
cobro en línea, el WhatsApp automático y el correo no funcionan aquí.

| Archivo | Qué es |
|---|---|
| `docker-compose.yml` | Los cinco contenedores, con healthchecks y rotación de logs |
| `nginx.conf` + `scalar-cabeceras.conf` | Pasarela, SPA, cabeceras de seguridad, límite de intentos de login |
| `gen-env.py` | Genera `.env` con secretos nuevos (una sola vez) |
| `aplicar.sh` | Aplica las migraciones pendientes (registro con hash en `scalar_demo.migraciones`) y, con `--semilla`, recarga el box de demostración |
| `desplegar.sh` | Desde el PC: sube migraciones, compila la SPA contra este entorno y la publica |
| `respaldo-scalar.*` | Respaldo diario (3:15 a. m. Bogotá) de la base y de Storage, 14 días |

## Recrear desde cero

```bash
ssh widawi
mkdir -p ~/scalar-demo/volumes/db && cd ~/scalar-demo
# copiar aquí docker-compose.yml, nginx.conf, scalar-cabeceras.conf, gen-env.py, aplicar.sh
# y roles.sql, jwt.sql, webhooks.sql de github.com/supabase/supabase/docker/volumes/db a volumes/db/
python3 gen-env.py            # secretos nuevos; editar PUBLIC_URL si cambia el dominio
docker compose up -d
```

Y desde el PC, en el repo: `deploy/widawi/desplegar.sh --semilla`.

Respaldos: copiar `respaldo-scalar.sh` a `/usr/local/sbin/` (ejecutable) y los
dos `respaldo-scalar.*` de systemd a `/etc/systemd/system/`, luego
`sudo systemctl enable --now respaldo-scalar.timer`. Restauración: ver el
encabezado del script. **Probarla una vez al mes.**

## Usuarios de demostración

`dueno@boxlaladera.co`, `coach@boxlaladera.co`, `atleta@boxlaladera.co`,
contraseña `demo1234`. El registro abierto (`/registro`) crea boxes reales.

## Qué NO tiene

- Edge Functions (Wompi, WhatsApp, correo, reporte semanal). nginx responde
  503 en `/functions/v1` con un mensaje en español.
- SMS: el atleta entra con correo y contraseña.
- Confirmación de correo (`GOTRUE_MAILER_AUTOCONFIRM=true`).
