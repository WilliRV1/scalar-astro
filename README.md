# Scalar

Plataforma de gestión para **boxes de entrenamiento funcional** y gimnasios pequeños:
cobros que se cobran solos, detección de atletas que se están yendo, reservas de clase y
el día a día del coach.

El plan completo de producto, negocio y arquitectura está en **[`docs/`](./docs/README.md)**.

---

# 🚀 PARA QUIEN VA A HACER EL DESPLIEGUE — lee esto primero

Todo lo que hace falta para poner esto en internet está aquí. La guía paso a
paso, con capturas de dónde va cada cosa, está en
**[docs/DESPLIEGUE.md](./docs/DESPLIEGUE.md)**.

## Qué es

Una SPA de React + Vite que habla con Supabase. **No hay servidor propio**: el
build es estático y va a un CDN. La lógica de negocio vive en Postgres
(funciones y RLS) y en Edge Functions de Supabase.

## ⚠️ ANTES DE TOCAR LA BASE DE DATOS — esto puede romper algo ajeno

El dueño del proyecto **tiene tablas de OTRO proyecto suyo en el mismo Supabase.
No se tocan, no se mueven, no se renombran.**

Varias tablas de Scalar tienen nombres genéricos (`invoices`, `payments`,
`expenses`, `results`, `classes`). Si alguna ya existe en esa base, aplicar las
migraciones **falla a mitad de camino y deja la base a medias**.

**Primer paso, obligatorio, y no escribe nada:**

```bash
export SUPABASE_DB_URL="postgresql://postgres:CLAVE@db.XXXX.supabase.co:5432/postgres"
./scripts/preflight.sh
```

| Resultado | Qué hacer |
|---|---|
| `✓ Sin choques` | Seguir. Después de aplicar migraciones, corre `./scripts/preflight.sh --registrar` para que la guarda de RLS ignore las tablas ajenas |
| `✗ CHOQUE DE NOMBRES` | **Parar.** Crear un proyecto de Supabase nuevo y limpio solo para Scalar. Es gratis y evita el problema para siempre |

## Los tres pasos

### 1 · Base de datos

```bash
export SUPABASE_DB_URL="postgresql://postgres:CLAVE@db.XXXX.supabase.co:5432/postgres"
./scripts/setup-demo.sh     # aplica las migraciones + carga el box de demostración
```

Si prefieres hacerlo a mano, las migraciones se aplican **en orden alfabético**
desde `supabase/migrations/`. No te saltes ninguna ni cambies el orden.

### 2 · Variables de entorno en Vercel

Se sacan de Supabase → **Project Settings → API**:

| Variable | De dónde sale |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Llave `anon public` |

- La llave anónima **viaja al navegador por diseño**: identifica, no autoriza.
  Es seguro porque todas las tablas tienen RLS, verificado por 570 aserciones
  en CI.
- **Nunca** pongas aquí la llave `service_role`: esa salta la RLS y solo puede
  vivir en Edge Functions.
- Vite incrusta las variables **en el build**. Si cambias una, hay que
  **volver a desplegar**; no se leen en caliente.

### 3 · Desplegar

Conectar el repositorio en Vercel y desplegar. `vercel.json` ya está en el
repo y trae lo que suele fallar:

- Reescritura catch-all: sin ella, recargar `/coach/atletas` da **404**.
- `sw.js` sin caché: si no, el navegador se queda con el service worker viejo
  y la app **no se actualiza nunca**.
- Assets con caché inmutable y cabeceras de seguridad.

Framework: **Vite**. Build: `npm run build`. Salida: `dist`.

## Comprobar que quedó bien

```bash
npm run check    # lint + tipos + 213 pruebas unitarias + build + 570 aserciones de BD
```

Y en el sitio desplegado, la prueba de humo que importa: **entrar con los tres
usuarios del box de demostración** (contraseña `demo1234`, ver
`docs/13-puesta-en-marcha.md`). El coach **no** debe ver la plata; el dueño sí;
el atleta solo lo suyo. Si eso se cumple, el aislamiento de permisos funciona.

## Lo que NO está conectado — que nadie se lleve una sorpresa

| Qué | Estado real |
|---|---|
| Cobro en línea (Wompi) | Código completo y probado contra la base, pero **ninguna transacción real ha pasado por él**, ni en sandbox. Falta cuenta de comercio |
| WhatsApp automático | Funciona el botón de un clic (`wa.me`). El envío automático necesita cuenta de WhatsApp Business y plantillas aprobadas por Meta |
| Tareas programadas | Cobros, avisos y generación de clases son funciones listas, pero **falta engancharlas a `pg_cron`** |
| Correo | Sin proveedor. Las invitaciones se pasan por enlace copiable |

Nada de eso impide enseñar el producto: lo que se ve funciona completo.

## Secretos

**No los pegues en el chat ni los subas al repo.** Las llaves de Wompi y de
WhatsApp **no van en variables de entorno del despliegue**: cada box las mete
desde la aplicación, y se guardan de forma que ni el dueño puede leerlas desde
el navegador. Ver `docs/DESPLIEGUE.md`.

---

## Empezar a desarrollar

Requisitos: Node 22+ y [Docker](https://docs.docker.com/get-docker/) (para el stack local
de Supabase).

```bash
npm install
npx supabase start          # Postgres + Auth locales; imprime URL y anon key
cp .env.example .env        # pega ahí la URL y la anon key que imprimió
npx supabase db reset       # aplica migraciones + semilla con dos boxes
npm run dev
```

Usuarios de la semilla (contraseña `scalar123`):

| Correo | Rol | Para probar |
|---|---|---|
| `dueno@boxdemo.co` | owner del Box Demo | Ve la cartera y toda la plata |
| `coach@boxdemo.co` | coach del Box Demo | **No ve la plata**: la RLS se la oculta |
| `dueno@otrobox.co` | owner del Otro Box | No ve ni un solo dato del Box Demo |

Entrar con los tres, uno tras otro, es la forma más rápida de ver el aislamiento
funcionando.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Comprobación de tipos + build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Solo tipos |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run db:test` | **Migraciones + guarda de RLS + aislamiento entre boxes** |
| `npm run db:reset` | Recrea la base local y siembra los datos |
| `npm run types:gen` | Regenera `src/types/database.generated.ts` desde la base |
| `npm run check` | Todo lo anterior, como en CI |

`npm run db:test` no necesita Docker: levanta un Postgres efímero con los binarios del
sistema y un stub mínimo del esquema `auth`. Es lo que corre en CI.

## Arquitectura en corto

- **Un solo despliegue para todos los boxes.** Una base, `org_id` en cada tabla, un
  subdominio por cliente. Instalar una copia por cliente es lo que convierte un SaaS en
  una consultoría.
- **El aislamiento vive en Postgres, no en el frontend.** Todas las tablas tienen RLS. Los
  guardas de ruta deciden qué se *pinta*; la RLS decide a qué se *accede*. Si alguien
  manipula la URL, ve una pantalla vacía.
- **La llave anónima viaja al navegador por diseño**: identifica, no autoriza. La llave
  `service_role` nunca sale del servidor.
- **El dinero se mueve en centavos (`bigint`)**, nunca en coma flotante.
- **Las fechas de negocio se evalúan en la zona horaria del box**, no en UTC. Es el origen
  clásico del cobro generado el día equivocado.

Detalle en [`docs/02-arquitectura.md`](./docs/02-arquitectura.md) y
[`docs/03-modelo-de-datos.md`](./docs/03-modelo-de-datos.md).

## Estructura

```
src/
  app/          arranque, router y pantallas por módulo (admin · coach · atleta)
  features/     dominios: auth, org, athletes, billing…
  shared/       sistema de diseño y utilidades (supabase, dinero, teléfonos)
  types/        tipos de la base de datos
  legacy/       el prototipo anterior, aparcado y sin enrutar (ver su README)
supabase/
  migrations/   esquema versionado — la única fuente de verdad
  tests/        guarda de RLS y pruebas de aislamiento
  seed.sql      dos boxes de ejemplo
scripts/        utilidades de desarrollo
docs/           producto, negocio, arquitectura, mercado y hoja de ruta
```

## Reglas del repositorio

1. **Ninguna tabla sin RLS.** `supabase/tests/rls_guard.sql` falla el build si aparece una.
   No existe un caso legítimo de `disable row level security`.
2. **El esquema solo cambia por migración versionada.** Nada de ejecutar SQL a mano en el
   editor de Supabase: así nadie sabe en qué estado está la base de un cliente.
3. **Toda tabla de negocio lleva `org_id`** y sus índices empiezan por `org_id`.
4. **Los teléfonos se guardan en E.164.** La base lo exige: un número mal formateado es un
   cobro que nunca llega.
5. **Las tareas programadas son idempotentes.** Correrlas dos veces no puede cobrar dos
   veces.
