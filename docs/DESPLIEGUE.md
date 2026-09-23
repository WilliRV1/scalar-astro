# Desplegar Scalar en 10 minutos

Guía para dejar la aplicación funcionando en internet, con un box de
demostración cargado, y poder enseñársela a alguien.

Hacen falta **dos cuentas gratuitas**: Supabase (la base de datos) y Vercel (el
sitio). Ninguna pide tarjeta.

---

## 1 · La base de datos (5 minutos)

1. Entra a [supabase.com](https://supabase.com) → **New project**.
   - Nombre: `scalar`
   - Contraseña de la base: genérala y **guárdala**, la necesitas en el paso 3.
   - Región: **East US (North Virginia)** es la más cercana a Colombia de las
     gratuitas.
2. Espera a que termine de crearse (un par de minutos).
3. En **Project Settings → Database → Connection string → URI**, copia la cadena
   y reemplaza `[YOUR-PASSWORD]` por la contraseña del paso 1.
4. En tu computador, dentro del repositorio:

```bash
export SUPABASE_DB_URL="postgresql://postgres:TU-CLAVE@db.XXXX.supabase.co:5432/postgres"
./scripts/setup-demo.sh
```

Eso aplica todas las migraciones y carga el box de demostración.

5. En **Project Settings → API**, copia:
   - **Project URL** → será `VITE_SUPABASE_URL`
   - **anon public** → será `VITE_SUPABASE_ANON_KEY`

> La llave anónima viaja al navegador **por diseño**: identifica, no autoriza.
> Es seguro únicamente porque todas las tablas tienen RLS, y eso está verificado
> por 570 aserciones en CI. **Nunca** pongas aquí la llave `service_role`.

---

## 2 · El sitio (3 minutos)

1. Entra a [vercel.com](https://vercel.com) con tu cuenta de GitHub.
2. **Add New → Project** → elige el repositorio `scalar-astro`.
3. En **Environment Variables**, añade las dos del paso anterior:

   | Nombre | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | la Project URL de Supabase |
   | `VITE_SUPABASE_ANON_KEY` | la llave `anon public` |

4. **Deploy**. Vercel detecta Vite solo; el resto ya está en `vercel.json`.

Al terminar te da una URL del estilo `scalar-astro.vercel.app`.

> **Importante**: si cambias una variable de entorno, hay que **volver a
> desplegar**. Vite las incrusta en el build, no las lee en caliente.

---

## 3 · Entrar

Con los usuarios del box de demostración (ver `docs/13-puesta-en-marcha.md`,
contraseña `demo1234`):

| Usuario | Qué enseña |
|---|---|
| Dueño | Cartera, finanzas, reportes, configuración |
| Coach | WOD, asistencia, atletas — **sin ver la plata** |
| Atleta | Su evolución, su WOD, sus pagos |

Entrar con los tres seguidos es la forma más rápida de mostrar que el
aislamiento de permisos es real y no una pantalla distinta.

---

## 4 · Cosas que NO están conectadas todavía

Dicho sin rodeos, para que nadie se lleve una sorpresa en una demostración:

| Qué | Estado |
|---|---|
| Cobro en línea (Wompi) | El código está y probado contra la base, pero **ninguna transacción real ha pasado por él**. Falta cuenta de comercio |
| WhatsApp automático | Funciona el botón de un clic (`wa.me`). El envío automático necesita cuenta de WhatsApp Business y plantillas aprobadas por Meta |
| Tareas programadas | Los cobros, los avisos y la generación de clases son funciones listas, pero **falta engancharlas a `pg_cron`**. Hoy se disparan a mano |
| Correo | No hay proveedor configurado; las invitaciones se pasan por enlace copiable |

Nada de eso impide enseñar el producto: la parte que se ve funciona completa.

---

## 5 · Cuando sea un box de verdad

1. Entra como dueño y usa el **asistente de puesta en marcha**: datos del box,
   planes, día de corte, campos propios.
2. Importa los atletas reales desde el Excel (`/coach/importar`).
3. Borra el box de demostración desde el panel interno.
4. Deja el **modo simulación encendido la primera semana**: verás qué mensajes
   se habrían mandado, sin que le llegue nada a nadie.
