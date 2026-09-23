# Scalar

Plataforma de gestión para **boxes de entrenamiento funcional** y gimnasios pequeños:
cobros que se cobran solos, detección de atletas que se están yendo, reservas de clase y
el día a día del coach.

El plan completo de producto, negocio y arquitectura está en **[`docs/`](./docs/README.md)**.

---

## Desplegarlo y verlo funcionando

¿Solo quieres verlo en internet y enseñárselo a alguien? Está en
**[docs/DESPLIEGUE.md](./docs/DESPLIEGUE.md)**: dos cuentas gratuitas
(Supabase y Vercel) y unos diez minutos, con un box de demostración de ~40
atletas ya cargado.

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
