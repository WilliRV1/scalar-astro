# 02 — Arquitectura técnica

## Principio rector

**Un solo despliegue, una sola base de datos, todos los boxes adentro.**

La tentación del desarrollador solo es "le instalo una copia a cada cliente". Es el error
que convierte un SaaS en una consultoría: cada cliente queda en una versión distinta, cada
bug hay que arreglarlo N veces y el margen desaparece en el cliente 4. Se paga un costo
alto una sola vez —aislamiento de datos correcto— y después crecer es gratis.

## Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind | Ya está, funciona, y es lo que sabes |
| Enrutamiento | `react-router-dom` v7 con rutas anidadas por rol y `lazy()` por módulo | Ya está instalado, hoy sin usar |
| Estado servidor | TanStack Query | Caché, reintentos, invalidación. Mata el 80% de los `useState`/`useEffect` actuales |
| Formularios | React Hook Form + Zod | Validación compartida entre cliente y Edge Functions |
| Gráficas | Recharts | Evolución de marcas, P&L, asistencia |
| Backend | Supabase: Postgres 15 + Auth + Storage + Edge Functions (Deno) + Realtime | Una sola plataforma, RLS nativa, plan gratuito para desarrollo |
| Jobs programados | `pg_cron` + `pg_net` invocando Edge Functions | Evita un segundo servicio que desplegar y pagar |
| Hosting | Vercel (o Netlify) con dominio comodín `*.scalar.app` | Despliegue por push, SSL automático para subdominios |
| Errores | Sentry (plan gratuito) | Enterarte de los errores antes que el cliente |
| Correo | Resend | Recibos, invitaciones, reporte semanal |
| WhatsApp | Meta Cloud API (ver [04](./04-automatizaciones.md)) | Canal principal del negocio en Colombia |
| Pagos del atleta al box | Wompi (Bancolombia) y/o Mercado Pago | Nequi, PSE, tarjetas. Ver nota abajo |
| Migraciones | Supabase CLI (`supabase/migrations/`) versionadas en Git | Reemplaza los `.sql` sueltos de la raíz |
| Pruebas | Vitest (unidad y lógica de cobros) + Playwright (3 flujos críticos) | No se testea todo; se testean cobros, permisos y login |
| CI | GitHub Actions: typecheck + lint + test + build en cada PR | Barato y evita romper producción |

> **Nota sobre pasarelas**: no hay que casarse con una. Se define una interfaz
> `PaymentProvider` (crear link, consultar estado, procesar webhook) y se implementa Wompi
> primero. Si un box ya usa Mercado Pago, se agrega el adaptador sin tocar el resto.

## Multi-tenancy

### Modelo: base compartida, esquema compartido, aislamiento por RLS

```
                         ┌─────────────────────────────┐
   box-rubio.scalar.app ─┤                             │
   crossfit-norte.…     ─┤   Una sola app en Vercel    │
   demo.scalar.app      ─┤   (resuelve el box por      │
                         │    subdominio → org.slug)   │
                         └──────────────┬──────────────┘
                                        │ JWT con claim org_id
                         ┌──────────────▼──────────────┐
                         │  Supabase / Postgres        │
                         │  Todas las tablas con       │
                         │  org_id + RLS obligatoria   │
                         └─────────────────────────────┘
```

Reglas no negociables:

1. **Toda tabla de negocio tiene `org_id uuid not null references organizations(id)`.**
2. **Toda tabla tiene RLS habilitada.** Se prohíbe `DISABLE ROW LEVEL SECURITY` en el
   repositorio; hay una prueba automática que falla si alguna tabla pública queda sin RLS.
3. **El `org_id` viaja en el JWT** como *custom claim*, escrito por un
   *custom access token hook* de Supabase Auth al iniciar sesión. Así las políticas RLS no
   tienen que hacer un `JOIN` contra `memberships` en cada consulta.
4. **La llave `service_role` jamás sale del servidor.** Solo vive en Edge Functions.
5. **Todo índice empieza por `org_id`**: `(org_id, ...)`. Sin eso, las consultas escanean
   los datos de todos los boxes.

### Identidad y roles

Supabase Auth con dos formas de entrada:

- **Staff (dueño, admin, coach)**: correo + contraseña, o enlace mágico. Con 2FA opcional
  para quien tenga acceso financiero.
- **Atleta**: **código OTP por WhatsApp o SMS al celular**. El atleta no quiere recordar
  otra contraseña, y su número ya está en la base del box. Alternativa de respaldo:
  enlace mágico por correo.

Una persona puede pertenecer a varios boxes (un coach que trabaja en dos). Por eso la
membresía es una tabla, no una columna:

```
auth.users ──< memberships (user_id, org_id, role, permissions) >── organizations
```

| Rol | Alcance |
|---|---|
| `owner` | Todo, incluido facturación de Scalar, borrar el box y transferir propiedad |
| `admin` | Todo excepto propiedad y facturación de Scalar |
| `coach` | Atletas, WODs, resultados, asistencia. **Sin acceso financiero por defecto** |
| `coach` + `can_view_finances` | El caso del dueño-coach de un box pequeño |
| `athlete` | Solo sus propios datos + lo público del box (WOD del día, leaderboard) |

Los permisos finos (`can_view_finances`, `can_edit_wods`, `can_manage_athletes`) van en una
columna `jsonb` sobre `memberships`, no en roles nuevos. Crear roles nuevos por cada
combinación es la trampa clásica.

### Aislamiento de archivos

Storage con buckets privados y rutas que empiezan por el `org_id`
(`avatars/{org_id}/{athlete_id}.jpg`, `receipts/{org_id}/{payment_id}.jpg`), con políticas
de Storage que replican la misma regla. Acceso siempre por URL firmada con vencimiento.

## Estructura de carpetas objetivo

```
src/
  app/                  # arranque, router, providers, límites de error
    routes/
      admin/            # módulo administrador (lazy)
      coach/            # módulo coach (lazy)
      athlete/          # módulo atleta (lazy)
      public/           # login, onboarding, página del box
  features/             # por dominio, no por tipo de archivo
    athletes/           # componentes + hooks + tipos + queries
    memberships/
    billing/            # planes, cobros, pagos, cartera
    wods/
    performance/        # marcas, PRs, evolución
    attendance/
    inventory/          # insumos y compras
    finance/            # gastos y P&L
    automations/        # reglas, plantillas, bitácora de envíos
    org/                # configuración del box, usuarios, permisos
  shared/
    ui/                 # botones, drawer, toast, tabla — el sistema de diseño
    lib/                # supabase, fechas, moneda COP, formato
    hooks/
  types/
    database.ts         # GENERADO por `supabase gen types` — nunca a mano
supabase/
  migrations/           # 0001_init.sql, 0002_billing.sql, …
  functions/            # Edge Functions (Deno)
    send-whatsapp/
    run-automations/
    generate-invoices/
    payment-webhook/
    weekly-report/
  seed.sql              # box demo con datos realistas
docs/
```

## Trabajos programados (el corazón de la automatización)

`pg_cron` dispara Edge Functions. Todas son **idempotentes** (se pueden correr dos veces
sin duplicar nada) y dejan registro en `job_runs`.

| Job | Frecuencia | Qué hace |
|---|---|---|
| `generate-invoices` | Diario 05:00 COT | Crea el cobro de cada atleta cuya fecha de corte es hoy |
| `run-automations` | Cada hora | Evalúa las reglas activas de cada box y encola mensajes |
| `process-outbox` | Cada 5 min | Envía lo encolado (WhatsApp / correo) con reintentos y control de frecuencia |
| `refresh-risk-scores` | Diario 04:00 | Recalcula riesgo de fuga por inasistencia y mora |
| `mark-overdue` | Diario 00:30 | Pasa membresías vencidas a `overdue` / `suspended` |
| `low-stock-check` | Diario 08:00 | Alerta de insumos bajo mínimo |
| `weekly-report` | Lunes 07:00 | Reporte del box al dueño por WhatsApp y correo |
| `db-export` | Domingo 03:00 | Respaldo lógico a Storage (además del PITR de Supabase) |

Zona horaria: todo se guarda en `timestamptz` en UTC; cada box tiene su
`timezone` (por defecto `America/Bogota`) y **toda regla de negocio con fechas se evalúa en
la zona del box**. Esta es la fuente más común de bugs de cobros: un cobro que se genera el
día equivocado porque el servidor está en UTC.

## Rendimiento y costo

- Consultas por atleta paginadas; nada de `select('*')` sobre toda la tabla como hoy
  (`CoachDashboard.tsx:246`).
- Vistas materializadas para el P&L y el leaderboard, refrescadas por cron.
- Con Supabase Pro (US$25/mes) caben cómodamente los primeros ~30 boxes. El costo por box
  no es el problema del negocio; el soporte sí (ver [05](./05-negocio-precio-gtm.md)).

## Ambientes

| Ambiente | Para qué |
|---|---|
| Local | `supabase start` + `npm run dev`, con `seed.sql` |
| Staging | Proyecto Supabase aparte + despliegue de rama. Aquí se prueban las migraciones |
| Producción | Proyecto Supabase con PITR activado |

Nada se aplica a producción sin haber pasado por staging. Las migraciones se aplican por
GitHub Actions, no a mano desde el editor de Supabase.

## Panel de superadministrador (interno)

Una ruta `/_admin` accesible solo para tu usuario, fuera de la RLS de los boxes:
alta de boxes nuevos, estado de suscripción de cada box, uso de mensajes, últimos errores,
y **suplantación de usuario con registro en bitácora** (indispensable para dar soporte sin
pedirle la contraseña al cliente).
