# 17 — Viabilidad técnica para cobrar a un cliente real

Auditoría atómica del estado del código **hoy** (commit `2dff053`, 2026-09-25), no del roadmap
ni de la auditoría de anoche. Cada afirmación cita el archivo:línea o el comando que la
verificó. Severidad: **bloqueante** (no se puede cobrar sin esto) · **importante** (se puede
cobrar pero es un riesgo real que hay que cerrar pronto) · **puede esperar** (pulido).

---

## 1. Resumen ejecutivo

**Si el dueño trabaja tiempo completo desde hoy, faltan entre 3 y 5 días efectivos (24-40
horas) para poder cobrarle con tranquilidad al primer box real** — asumiendo que se queda en
**widawi** (autoalojado) y cobra **manualmente** (efectivo, transferencia, enlace de pago
Wompi con cuenta de comercio ya abierta). Ese es el camino más corto y más responsable para
el primer cliente.

Si además quiere **débito automático por Nequi** funcionando desde el día 1, hay que sumar
**2-3 días más** de trabajo de despliegue e integración con Wompi real (sandbox primero), más
el tiempo de aprobación de la cuenta de comercio (fuera de control del dueño, típicamente
5-10 días hábiles según el trámite bancario).

La app en sí — atletas, cobros, cartera, reservas, WOD, automatizaciones, finanzas — **está
construida y probada**: 283 pruebas unitarias (`npm run test`, verificado, ver §6) y 727
aserciones SQL en 20 archivos de prueba (`ls supabase/tests/*.sql | wc -l`, verificado), todas
en verde en CI (`gh run list`, últimos 5 runs en `success`, verificado). `npm run lint` y
`npm run typecheck` pasan sin advertencias (verificado). Lo que falta **no es escribir más
código de producto**: es un puñado de decisiones de seguridad/despliegue, y sobre todo,
**la primera transacción real de Wompi, que nunca ha ocurrido** (ni en sandbox).

### Los 3 bloqueantes reales, en orden

1. ~~`.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `origin/master`~~ **Cerrado,
   2026-09-25**: al revisar el contenido se confirmó que esa llave **no es de Scalar** — es la
   llave anónima del proyecto Supabase personal "coach" (`wgicwqtsiiwqsxgqjlcw.supabase.co`),
   el que usa la prospección de negocios (`~/.prospeccion.env`, `cargar.py`). La rama activa
   (`claude/crossfit-saas-platform-pibfm8`) nunca tuvo el archivo trackeado. Se quitó `.env` de
   `master` (commit `97c67df`). **Decisión del dueño**: no rotar la llave ni reescribir el
   historial — riesgo aceptado a conciencia, asumiendo que nadie la vio mientras estuvo
   pública. Si en algún momento aparece actividad rara en las tablas de `prospectos`/`sst_*`,
   ese es el primer sospechoso a revisar.
2. **CORS abierto (`*`) en las Edge Functions si no se fija `SITIO_PERMITIDO`**
   (`supabase/functions/_shared/http.ts:15-20`, verificado). **No aplica a widawi hoy**: esas
   funciones no están desplegadas ahí (`nginx.conf` las intercepta con un 503 fijo, verificado)
   y todo el tráfico pasa por el mismo origen (`scalar.widawi.online`), sin CORS de por medio.
   Solo importa el día que se desplieguen Edge Functions (Cloud o widawi con Deno). **30
   minutos** al desplegar: `supabase secrets set SITIO_PERMITIDO=https://<dominio del panel>`.
3. **Ninguna transacción de Wompi —ni sandbox— ha pasado por el código**
   (`docs/10-wompi.md`, confirmado: no existen llaves ni evidencia de ejecución en el repo).
   El código de firma e idempotencia está probado contra vectores propios
   (`supabase/functions/_shared/wompi_pruebas.ts`) pero **no contra el servidor real de
   Wompi**, y la propia documentación señala que el ejemplo oficial de firma de eventos **no
   es reproducible** (`docs/10-wompi.md` líneas 251-260). **4-8 horas** una vez haya cuenta de
   comercio: desplegar `create-payment-link` y `wompi-webhook`, hacer un pago real de $1.000
   y reenviar el evento para confirmar que no se duplica.

**Recomendación de camino: quedarse en widawi para el primer box** (§3). Migrar a Supabase
Cloud + Vercel es la decisión correcta a mediano plazo, pero **no es una condición para
cobrar** al primer cliente — es más trabajo (10-14 horas) que no compra nada que el primer box
necesite el día 1, y widawi ya tiene respaldos, RLS, `pg_cron` y cabeceras de seguridad
funcionando.

---

## 2. Inventario atómico de pendientes

### 2.1 Bloqueantes

| # | Qué | Dónde | Evidencia | Horas |
|---|---|---|---|---|
| B1 | `.env` con URL y llave anónima de Supabase en `origin/master`, repo público | `origin/master:.env` | `git cat-file -p origin/master:.env` (PowerShell; el shell de este entorno reescribe el `:` de `git show` — ver §7) devuelve `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en claro | 2 |
| B2 | Cero transacciones de Wompi probadas contra el servidor real (ni sandbox) | `supabase/functions/create-payment-link/`, `wompi-webhook/`, `charge-subscriptions/`, `tokenize-payment-method/` | `docs/10-wompi.md` y `docs/12-debito-recurrente.md` lo declaran arriba de cada documento; no hay llaves de Wompi en ningún `.env.example`, secreto ni script del repo | 4-8 (una vez haya cuenta) |
| B3 | Edge Functions nunca desplegadas a ningún proyecto | `supabase/functions/*` (7 funciones) | Ningún script en `deploy/` ni `scripts/` llama `supabase functions deploy`; `deploy/widawi/README.md:9-10` dice explícitamente "No hay Edge Functions" en ese entorno | 2-3 |
| B4 | `RECURRING_CRON_SECRET`, `WOMPI_*`, `WHATSAPP_*` no configurados en ningún entorno real | — | `docs/12-debito-recurrente.md` §2; no hay `supabase secrets list` registrado en ningún doc | incluido en B3 |
| B5 | CORS cae a `*` si falta `SITIO_PERMITIDO` | `supabase/functions/_shared/http.ts:15-20` | Leído: `origenPermitido ?? '*'`; usado en `create-payment-link/index.ts:42` y `tokenize-payment-method/index.ts:89` | 0.5 |

### 2.2 Importantes (se puede vender, pero hay que cerrarlos rápido)

| # | Qué | Dónde | Evidencia | Horas |
|---|---|---|---|---|
| I1 | Cualquier coach del box lee `athlete_health` (lesiones, notas médicas) sin permiso financiero ni de salud aparte | `supabase/migrations/20260916120100_athletes.sql:139-143` | Política `"staff gestiona la salud del atleta"` usa `private.auth_staff_org_ids()`, el mismo helper que da acceso a cualquier staff — no hay `can_view_health` ni equivalente | 3-4 (agregar permiso fino + migrar política + prueba) |
| I2 | Rotar la llave anónima del Supabase autoalojado que usa el CRM del dueño (`coach@…`) | — | `docs/14-auditoria-2026-09-24.md` línea 19: "La comparte el CRM; rotarla lo tumba. Decidir cuándo" — sigue sin decidir | 1-2 + coordinar con el otro sistema |
| I3 | Totales de cartera y gastos se suman en el cliente con `.limit()` fijo | `src/features/billing/queries.ts:9,33` (`LIMITE_CARTERA=200`), `src/features/finance/queries.ts:22,39` (`LIMITE_GASTOS=300`) | Ya hay aviso en pantalla si se llega al tope (`ExpensesPage.tsx:61,105`, `AdminHome.tsx:77,92`, verificado) — mejoró desde la auditoría de anoche, que decía "salen bajos sin aviso" (`docs/14` línea 113). Con 200 facturas abiertas o 300 gastos/mes sigue siendo un total incompleto, solo que ahora avisado | 4-6 (mover el `sum()` a una función SQL) |
| I4 | `useMonthlyCollected` sin `.limit()` pero sin paginar: en un box de 250+ atletas con muchos pagos/mes puede traer una fila por pago sin tope | `src/features/billing/queries.ts:86-91` | Leído completo: `select('amount_cents')...gte('paid_at', inicio)` sin `.limit()` | 1-2 (agregar `count`/`sum` en la base) |
| I5 | Vercel (`vercel.json`) no tiene CSP ni límite de intentos de login; nginx de widawi sí los tiene | `vercel.json:12-56` vs `deploy/widawi/scalar-cabeceras.conf` | Leídos ambos: `vercel.json` no define `Content-Security-Policy`; `scalar-cabeceras.conf` sí la define completa | 1-2 si se migra a Vercel |
| I6 | Sin Sentry ni monitoreo de errores en ningún entorno | — | `grep -rl "sentry" src/ package.json` → sin resultados | 2-3 |
| I7 | Uptime Kuma con monitores sin crear (widawi) | — | `docs/14` línea 20: "Kuma pide iniciar sesión en :3001... Crear 3 monitores HTTP" — no verificable desde este entorno si ya se crearon (requiere entrar al panel de Kuma en widawi, sin acceso SSH en esta sesión) | 1 |
| I8 | Box 0 (Coach Pipe Rubio) no tiene datos reales migrados; el importador nunca se ha corrido con un Excel real de un cliente | — | Sin evidencia de ejecución en el repo (sin script, sin log, sin fila de auditoría); `docs/09-migracion-box-0.md` adenda concluye explícitamente "no migrar, arrancar limpio" y cargar por el importador — no hay indicio de que ese paso se haya dado | 2-4 (llamada con el entrenador + importar) |
| I9 | `SITIO_PERMITIDO` para `create-payment-link`/`tokenize-payment-method`, y `verify_jwt` de las 7 funciones | `supabase/config.toml:54-81` | **Ya resuelto en código**: los 7 bloques `[functions.*]` con `verify_jwt` correcto existen (verificado, línea por línea); solo falta *desplegar* con el secreto puesto (ver B3/B5) | — |

### 2.3 Puede esperar (pulido, no bloquea vender)

| # | Qué | Dónde | Evidencia |
|---|---|---|---|
| P1 | `touch_updated_at()` sin `set search_path` | `supabase/migrations/20260916120000_core_tenancy.sql:14-19` | Leído: la función no tiene `set search_path = ''`, a diferencia de otras funciones `security definer` del mismo archivo que sí la llevan (p. ej. `run_scheduled_job` en la migración de cron) |
| P2 | Auditoría 2026-09-24 lista ~25 hallazgos M/B de frontend (vacíos falsos en `AttendancePage`, `SchedulePage`, `PlansPage`, etc.; fechas ISO crudas; `aria-label` faltantes) | `docs/14-auditoria-2026-09-24.md`, secciones "Frontend — errores que no se ven" y "Frontend — textos y otros" | La mayoría de los hallazgos de severidad **A** de esas secciones **sí** se arreglaron (verificado: `mensajeAmigable` existe y se usa en `guards.tsx:21`, `AthleteForm.tsx:56,130,142`, `PaymentForm.tsx:64`, `ExpenseForm.tsx`; `Field.tsx:4` usa `text-base` de 16 px; `PaymentForm.tsx` ya no tiene `capture="environment"`, con comentario explicando por qué; `ExpensesPage.tsx` tiene confirmación con `onConfirm`/`ariaLabel`). Los de severidad **M/B** —fechas ISO, algunos `EmptyState` sin distinguir error de "vacío de verdad", `aria-label` sueltos— no se revisaron uno por uno en esta auditoría por volumen; se asume que siguen mayormente abiertos salvo lo arriba confirmado |
| P3 | `npm audit`: 14 vulnerabilidades, todas en `devDependencies` (vite, rollup, postcss, eslint) | — | `npm audit --omit=dev` → **0 vulnerabilidades** (verificado). El hallazgo de anoche sobre `react-router`/`ws`/`xlsx` en producción **ya no aparece**: mejoró |
| P4 | Excel importador sin mapeo de campos propios del box | `docs/06-roadmap.md` lo listaba como pendiente | **Ya no aplica**: `src/features/import/parse.ts`, `MapeoColumnas.tsx` y `plantilla.ts` ya manejan destinos `campo:<clave>` (verificado con grep) — el roadmap está desactualizado en este punto |

---

## 3. Camino recomendado: widawi vs. Supabase Cloud + Vercel

| | **A. Quedarse en widawi** | **B. Migrar a Supabase Cloud + Vercel** |
|---|---|---|
| **Qué se gana** | Ya está en producción, con RLS, `pg_cron`, cabeceras de seguridad (`scalar-cabeceras.conf`, incluida CSP), rate-limit de login, respaldo diario probado (`respaldo-scalar.sh`) y healthchecks arreglados (commit `ac689fc`). Cero trabajo de migración | PITR real (7 días, cualquier segundo) en vez de un volcado diario; sin depender del servidor personal del dueño; Edge Functions con acceso a internet para Wompi/WhatsApp/correo sin túnel; escala sin administrar Docker |
| **Qué se pierde** | Sin Edge Functions: cobro automático, WhatsApp Cloud API y correo **no funcionan** ahí (`deploy/widawi/README.md:9-10`, confirmado). El primer box tendría que cobrar con **enlace de pago manual generado a mano o cobro en efectivo/transferencia**, no con `create-payment-link`/`wompi-webhook`, porque esas funciones no corren en ese entorno | Hay que rehacer el CSP y el rate-limit de login que hoy vive en nginx (`vercel.json` no los tiene, verificado); hay que crear el proyecto, aplicar migraciones, configurar `pg_cron` (disponible en Supabase Pro, confirmado por búsqueda — no en el plan gratuito), desplegar las 7 Edge Functions y cargar todos los secretos desde cero |
| **Esfuerzo** | **0 horas** para operar; **4-8 horas** si además se quiere Wompi real (ver B2/B3, que aplican igual en cualquier camino porque las funciones no corren en widawi) | **10-14 horas**: crear proyecto Pro (US$25/mes), `supabase link` + aplicar 26 migraciones, `supabase functions deploy` × 7, `supabase secrets set` de ~12 variables, configurar dominio en Vercel, añadir CSP a `vercel.json`, programar `pg_cron` con `net.http_post` hacia las Edge Functions nuevas, probar cobro real |
| **Riesgo técnico con el primer box pagando** | Bajo para gestión/cartera/reservas (ya corre ahí desde hace días). Alto si se promete cobro automático el día 1, porque **no puede correr en widawi** | Bajo una vez desplegado y probado, pero el despliegue en sí es la primera vez que se hace de punta a punta — más superficie para un error de configuración el primer día |
| **Riesgo de reputación** | Si se vende "cobro automático por Nequi" y el box descubre que no está activo, es peor que no prometerlo. Si se vende "gestión + cartera + cobro manual con Wompi", cumple sin sorpresas | Ninguno adicional si se hace la prueba de sandbox antes de cobrar el primer peso real |

**Recomendación**: **A, para el primer box**, con el mensaje comercial ajustado: *"gestión, cartera, reservas y automatizaciones ya están"*; el cobro automático por Nequi llega en la semana siguiente, cuando se haga la migración a Supabase Cloud (que de todas formas hay que hacer para poder desplegar Edge Functions en cualquier entorno). Migrar a Cloud **antes** de firmar solo tiene sentido si el cliente exige débito automático desde el primer día — en ese caso, sumar los 10-14 horas de B antes de vender.

### 3.1 Medición real de widawi (2026-09-25), y por qué "número de boxes" no es la señal correcta

Se entró por SSH y se midió carga real en lugar de asumir un límite. Hallazgos:

| Métrica | Valor medido | Lectura |
|---|---|---|
| Contenedores de Scalar (web, storage, auth, rest, db) | 5-120 MB RAM c/u, 0-0,2% CPU | Scalar es ruido de fondo: no es lo que puede saturar el servidor, ni con 10-15 boxes reales |
| Memoria total del servidor | 7,7 GB, 2,6 GB en uso, 5,2 GB disponible | Holgura amplia hoy |
| Carga del sistema | 2,0 en 4 núcleos | Viene de Coolify, Immich y otros proyectos del dueño (`sst`, `prospectos`, `chatbot`, `kulombo`) que corren en la misma máquina — **no de Scalar** |
| Conexiones activas a Postgres | 10 | Muy por debajo de cualquier límite de plan gratuito o Pro |

**Corrección a §3**: la pregunta "¿aguanta widawi el box 3?" está mal planteada — Scalar en sí no genera carga medible todavía. La señal correcta para migrar a Cloud sigue siendo la misma de la tabla de arriba: **que un cliente exija débito automático**, no un número de boxes.

Se encontraron en cambio dos riesgos de infraestructura reales, sin relación con Scalar ni con el número de boxes:

| # | Hallazgo | Evidencia | Riesgo |
|---|---|---|---|
| H1 | **Un solo disco, sin redundancia** (`lsblk`: un único SSD Kingston SA400S3 de 447 GB, consumer-grade, sin RAID). SMART lo reporta sano hoy | `lsblk`, `smartctl -H /dev/sda` → PASSED | Si ese disco falla, se pierde Scalar **y** el resto de proyectos del dueño en la misma máquina (`sst`, `prospectos`, `chatbot`, `kulombo`, Immich) al mismo tiempo, sin aviso previo |
| H2 | **widawi es un portátil**, no un servidor de torre — tiene batería (`BAT0`) degradada: 56% de su capacidad de fábrica, reportando 0% de carga en el momento de la medición | `upower -i` sobre `BAT0` | La batería ya no sirve como respaldo de energía confiable; un corte de luz apaga el servidor de golpe |

**Recomendación revisada**: antes de gastar en migrar a la nube por temor a la carga de Scalar (que hoy no existe), el gasto que sí resuelve un riesgo real y actual es un **disco externo de respaldo** (~$200.000-350.000 COP, ya hay script listo en `deploy/widawi/respaldo-scalar.sh`) y un **UPS pequeño** (~$300.000-450.000 COP). Es gasto único, no mensual, y protege todos los proyectos del dueño en esa máquina, no solo Scalar.

---

## 4. Plan de trabajo ordenado (horas)

| Orden | Qué | Severidad | Horas | Depende de |
|---|---|---|---|---|
| 1 | Rotar la llave anónima de Supabase expuesta en `origin/master` (widawi) | Bloqueante | 2 | — |
| 2 | Confirmar que la rama que se despliega no trae `.env`; si hace falta, `git filter-repo` o repo nuevo | Bloqueante | 1-2 | 1 |
| 3 | Decidir y aplicar el permiso fino de `athlete_health` (¿`can_view_finances` sirve, o hace falta uno nuevo?) | Importante | 3-4 | — |
| 4 | Abrir la cuenta de comercio Wompi (RUT + cámara de comercio) — trámite externo, no técnico | Bloqueante | trámite (5-10 días hábiles, en paralelo) | — |
| 5 | Cargar llaves de sandbox y desplegar `create-payment-link` + `wompi-webhook` a un proyecto Supabase (aunque sea solo para probar) | Bloqueante | 2-3 | 4 |
| 6 | Pagar $1.000 en sandbox, reenviar el evento, confirmar que no se duplica (el guion completo ya está en `docs/10-wompi.md` §4) | Bloqueante | 1-2 | 5 |
| 7 | Fijar `SITIO_PERMITIDO` al desplegar | Bloqueante | 0.5 | 5 |
| 8 | Capacitación + alta del primer box por el runbook de `docs/11-operacion.md` §1 (48 horas ya incluye 1 transacción real de prueba por Nequi) | Bloqueante | 8 (repartidas en 2 días, según el runbook) | 6 |
| 9 | Mover el `sum()` de cartera/gastos a la base (I3/I4) | Importante | 5-8 | — |
| 10 | Sentry en el frontend | Importante | 2-3 | — |
| 11 | Crear los 3 monitores de Uptime Kuma en widawi | Importante | 1 | — |
| 12 | Migrar el box 0 con datos reales del entrenador (teléfonos incluidos) | Importante | 2-4 | 3, 8 |
| 13 | Si se decide migrar a Supabase Cloud + Vercel: proyecto, migraciones, 7 funciones, secretos, CSP en `vercel.json`, `pg_cron` con `net.http_post` | Importante (solo si se elige el camino B) | 10-14 | 5-7 |

**Total bloqueante puro (pasos 1, 2, 5, 6, 7)**: **≈ 7-10 horas de trabajo técnico**, más el trámite bancario de Wompi que no depende del dueño. **Con la capacitación y alta del primer box (paso 8, que ya incluye la prueba real), el total sube a ≈ 15-18 horas técnicas repartidas en 2-3 días de calendario**, sin contar el trámite de Wompi.

---

## 5. Qué se puede vender ya vs. qué falta

### Ya funciona hoy, verificado (283 pruebas unitarias + 727 aserciones SQL en verde)

- Atletas: alta, edición, importador de Excel con mapeo de campos propios, código E.164.
- Cobros manuales: facturación por corte, registro de pago con foto de comprobante, cartera
  por tramos de mora.
- Enlace de pago Wompi (`create-payment-link`) — **el código está probado contra la base, no
  contra Wompi** (ver B2).
- WOD, resultados, leaderboard, PRs con evolución.
- Reservas por horario con cupos, lista de espera, bloqueo de reserva por mora.
- Motor de automatizaciones con `wa.me` de un clic (sin trámite con Meta).
- Finanzas: gastos, insumos, compras, P&L.
- Panel de superadministrador con suplantación auditada.
- RLS y aislamiento entre boxes: 18+ aserciones dedicadas, verificadas en CI en cada push.

### Falta antes de decir "listo", con lo que se puede decir mientras tanto

| Se vende ya | Llega en | Mensaje sugerido |
|---|---|---|
| Gestión de atletas, cartera, cobro manual, reservas, WOD, automatizaciones por WhatsApp (enlace manual) | — | "Ya está" |
| Cobro automático por Nequi/tarjeta (débito recurrente) | 7-10 horas técnicas + cuenta de comercio aprobada | "Está en camino, entra en la primera semana" |
| WhatsApp automático (plantillas aprobadas por Meta) | Depende de la verificación de negocio en Meta (trámite externo, semanas) | "El botón de un clic ya funciona; las plantillas automáticas llegan cuando Meta apruebe la cuenta" |
| Monitoreo con alertas | 1-3 horas | Operacional, no se le vende al cliente, pero hay que tenerlo antes del primer cliente real |

---

## 6. Fuentes y comandos usados para verificar

```bash
npm run lint            # 0 errores
npm run typecheck       # 0 errores
npm run test            # 283 pruebas, 17 archivos, en verde
npm audit                # 14, todas en devDependencies
npm audit --omit=dev     # 0 vulnerabilidades
gh run list --limit 5    # 5/5 CI en success, incluye database (db:test)
ls supabase/tests/*.sql | wc -l        # 20 archivos de prueba SQL
grep -rc "chk(" supabase/tests/*.sql   # 727 aserciones (suma)
ls supabase/migrations/*.sql | wc -l   # 26 migraciones
git cat-file -p origin/master:.env     # (vía PowerShell) confirma VITE_SUPABASE_URL y
                                        # VITE_SUPABASE_ANON_KEY en claro en master
git ls-tree -r origin/master --name-only | grep node_modules   # 0 resultados: ya no está
grep -n "SITIO_PERMITIDO" supabase/functions/_shared/http.ts supabase/functions/*/index.ts
grep -n "athlete_health" -A15 supabase/migrations/20260916120100_athletes.sql
cat supabase/functions/wompi-webhook/index.ts   # confirma resolución del secreto por box
cat supabase/functions/_shared/credenciales.ts  # confirma llaves de Wompi por box (migración 0017)
grep -n "functions\.\|verify_jwt\|major_version" supabase/config.toml
cat deploy/widawi/scalar-cabeceras.conf   # CSP, HSTS, rate-limit ya en nginx
cat vercel.json                            # confirma ausencia de CSP en el camino Vercel
grep -n "capture=" src/features/billing/PaymentForm.tsx   # 0 resultados: ya arreglado
grep -n "document_id\|emergency_contact" src/types/database.ts src/features/athletes/AthleteForm.tsx
grep -rn "mensajeAmigable" src/                # helper de error central, ya usado en 5+ archivos
```

Búsqueda web usada para un solo dato no verificable desde el código: disponibilidad de
`pg_cron` en Supabase Pro (confirmado: se activa desde Database → Extensions en proyectos
Pro y superiores; no en el plan gratuito). Fuente: documentación y discusión pública de
Supabase, consultada 2026-09-25.

---

## 7. Lo que no se pudo verificar

- **No hay Docker corriendo en este entorno** (`docker info` falla: "no se pudo conectar al
  daemon"), así que `npm run db:test` no se pudo correr de forma local en esta sesión. Se usó
  como evidencia equivalente el último run de CI (`gh run list`), que sí ejecuta
  `./scripts/db-test.sh` en GitHub Actions y está en verde sobre el commit actual.
- **No hay acceso SSH a `widawi`** desde este entorno, así que no se pudo confirmar en vivo:
  si los 3 monitores de Uptime Kuma ya se crearon (I7), el estado real de los healthchecks de
  Docker tras el commit `ac689fc`, ni si el respaldo diario (`respaldo-scalar.timer`) está
  corriendo de verdad en el servidor (solo se verificó que el script existe y es correcto).
- **No hay cuenta de Wompi ni credenciales de sandbox** en este entorno ni en el repositorio,
  así que B2/B5/paso 6 del plan siguen siendo, literalmente, lo único que **nadie** ha podido
  probar todavía — ni esta auditoría ni el desarrollo original.
- **No se corrió una por una** cada fila de severidad M/B de `docs/14-auditoria-2026-09-24.md`
  contra el código de hoy (son ~25 hallazgos de pulido); se verificaron por muestreo los de
  mayor impacto (P2) y se recomienda una pasada dedicada antes de escalar a muchos boxes, no
  antes del primero.
- **El shell de este entorno reescribe el carácter `:` dentro de rutas de `git show`** (lo
  confirmé viendo el error `fatal: ambiguous argument 'origin\master;.env'`), así que la
  verificación de `.env` en `origin/master` se hizo por PowerShell (`git cat-file -p`), no por
  Bash. Documentado por si alguien repite el comando y le falla igual.
