# 06 — Roadmap

Supuesto de trabajo: **desarrollador solo, con otros trabajos encima.** Las estimaciones
están en "semanas de trabajo efectivo" (~20 h cada una). Si le dedicas medio tiempo, el
calendario se estira, pero el orden no cambia.

Principio del orden: **cada fase termina en algo mostrable, y desde la fase F4 ya se puede
cobrar.** No hay que terminar el producto para empezar a vender.

> **Reordenado el 2026-09-16** tras la investigación de mercado ([08](./08-mercado-cali.md)).
> Dos cambios de fondo: el **cobro con rieles colombianos (Wompi/Nequi/PSE) sube de la
> penúltima fase a una fase propia temprana**, porque resultó ser el mayor hueco de la
> competencia y el dolor #1 documentado de los dueños; y las **reservas entran como fase
> completa** con reserva por WhatsApp incluida.

---

## F0 — Cimientos (2 semanas) · **en gran parte hecho (2026-09-16)**

Sin esto no se puede vender ni un box, porque los datos estaban abiertos.

**Hecho y verificado:**

- [x] `supabase/migrations/` versionadas. Borrados los cinco `.sql` de la raíz.
- [x] Esquema multi-tenant: `organizations`, `memberships`, `athletes`, planes,
      suscripciones, cobros, pagos, bitácora y `job_runs`. Todo con `org_id`.
- [x] **RLS habilitada en todas las tablas** + `auth_org_ids()`, `has_role()`,
      `is_staff()`, `can_view_finances()`, `current_athlete_id()`.
- [x] Datos sensibles y notas del coach en tablas aparte (RLS es por fila, no por columna).
- [x] Idempotencia del cobro por índice único `(subscription_id, period_start)`.
- [x] Trigger que concilia el saldo de la factura con sus pagos confirmados.
- [x] **Guarda de RLS**: `assert_rls_enabled()` corre al final de cada migración, más
      `supabase/tests/rls_guard.sql` en CI. Verificada con prueba negativa.
- [x] **18 aserciones de aislamiento entre boxes** (`supabase/tests/rls_isolation.sql`).
- [x] `scripts/db-test.sh`: Postgres efímero, sin Docker. Es lo que corre en CI.
- [x] Autenticación real: correo/contraseña para staff, código al celular para el atleta.
      Fuera el `prompt('admin123')` y el PIN `'0000'`.
- [x] `react-router-dom` con rutas por rol y carga diferida por módulo.
- [x] Reestructura de carpetas (`app/`, `features/`, `shared/`, `types/`).
- [x] Eliminado el mock de 163 líneas que reimplementaba el SDK de Supabase.
- [x] 18 pruebas unitarias (normalización E.164, dinero en centavos, días de mora).
- [x] GitHub Actions: lint, tipos, pruebas, build y pruebas de base de datos.
- [x] `.env` y `dist/` fuera del control de versiones. `.env.example` añadido.
- [x] El prototipo queda en `src/legacy/`, sin enrutar y documentado.

**Escrito pero sin verificar (necesita Docker, que no había en el entorno de desarrollo):**

- [ ] `supabase/seed.sql` y `supabase/config.toml`: comprobar en el primer `supabase start`.
- [ ] `npm run types:gen`: los tipos de `src/types/database.ts` están escritos a mano;
      se reemplazan por los generados en cuanto haya un proyecto enlazado.

**Pendiente, y algunas son tuyas, no del código:**

- [ ] **Rotar las llaves de Supabase.** Siguen expuestas en el historial de git. Mientras
      no se roten, la base vieja sigue accesible. Es lo más urgente de toda esta lista.
- [ ] Purgar `.env` del historial (`git filter-repo`) o migrar a un repositorio limpio.
- [ ] Renombrar el repositorio sin "CrossFit" (ver [08](./08-mercado-cali.md)).
- [ ] Sentry y ambientes de staging/producción separados.
- [ ] Vincular el proyecto de Supabase y aplicar las migraciones a la nube.

**Entregable:** dos boxes coexisten en la misma base sin verse entre sí, con login real y
una prueba automática que lo demuestra en cada push.

---

## F1 — Núcleo: atletas y plata (3 semanas) · **HECHO (2026-09-17)**

- [x] CRUD de atletas con el modelo nuevo (teléfono E.164, estado, consentimientos).
- [x] Planes y suscripciones con fecha de corte por atleta, con precio congelado.
- [x] `generate_invoices` idempotente, consciente de la zona horaria del box y de
      los meses cortos (corte el 31 → se cobra el 28 en febrero).
- [x] Registro de pagos manuales con foto del comprobante en Storage privado.
- [x] **Link de pago Wompi** (tarjeta, PSE, Nequi, Daviplata) + webhook idempotente.
- [x] Tablero de cartera por tramos de mora.
- [x] Marcas personales contra catálogo, con evolución y sparkline.
- [x] Importador de Excel v2 con validación fila por fila y detección de duplicados.
- [x] Invitación de coaches, matriz de permisos y canje del enlace.

**Verificado:** 92 pruebas unitarias y 147 aserciones SQL, más lint, tipos y build.

**Sin verificar contra el mundo real:** ninguna transacción de Wompi, ni en
sandbox, ha pasado por el código — falta la cuenta de comercio. Ver
[10-wompi.md](./10-wompi.md) → "Qué queda por verificar".

**Decisión abierta #2 — una cuenta de Wompi para todos los boxes, o una por box.**
Hoy las llaves salen del entorno de la Edge Function, así que la plata de todos
los boxes caería en la misma cuenta. Lo correcto para producción es una cuenta
por box, lo que exige guardar sus llaves cifradas por organización. La
trazabilidad ya está lista para cualquiera de las dos opciones.

---

## F2 — Entrenamiento (2 semanas) · **HECHO (2026-09-18)**

- [ ] Editor de WOD con bloques, tipos de score y escalas.
- [ ] Calendario semanal, duplicar WOD, biblioteca de benchmarks.
- [ ] Registro de resultados (atleta y coach) + leaderboard del día.
- [ ] Asistencia con un toque.
- [ ] Ficha del atleta: marcas, evolución con gráficas, notas del coach, lesiones.
- [ ] Detección automática de PR al registrar un resultado.

**Entregable:** el coach deja de usar la pizarra y el cuaderno.

> **Nota de prioridad**: la investigación no encontró el seguimiento de WODs y PRs en
> **ningún** dolor documentado de dueños de box — el dolor es el dinero y el cupo. Esta fase
> se conserva porque es lo que engancha al *atleta* (y la retención del atleta es lo que le
> vendes al dueño), pero **si el tiempo aprieta, es la primera candidata a posponerse**
> después de F3.

---

## F3 — Horarios y reservas (2 semanas) · **HECHO (2026-09-18)**

- [ ] Plantilla semanal de horarios (`class_templates`) + generación automática de las
      clases de las próximas 4 semanas, con calendario de festivos colombianos.
- [ ] Reserva desde el celular del atleta, con cupos en tiempo real.
- [ ] **Reserva por WhatsApp con botones** — el atleta no instala nada (ver
      [04](./04-automatizaciones.md)).
- [ ] **Función `book_class()` en la base con bloqueo de fila**: el último cupo no se puede
      vender dos veces. Con prueba de concurrencia.
- [ ] Reglas configurables por box: antelación de apertura, cierre de reservas, límite de
      cancelación sin penalización.
- [ ] **Bloqueo de reserva por mora** (interruptor por box). Es la palanca de cobro más
      efectiva del producto.
- [ ] Lista de espera con promoción automática y aviso al atleta.
- [ ] Descuento de créditos para planes por bonos de clases.
- [ ] Política de no-show configurable.
- [ ] Cancelación de clase completa con aviso masivo y devolución de créditos.
- [ ] Lista de la clase y check-in masivo desde el celular del coach.

**Entregable:** el box apaga el grupo de WhatsApp de "anoten quién viene a las 6". Ataca dos
de los tres dolores más citados (sobreventa de cupos y reservas duplicadas).

---

## F4 — Automatización (2 semanas) · **aquí empieza a venderse** · **HECHO (2026-09-18)**

- [ ] Motor de reglas (`automation_rules`) con disparadores por horario y por evento.
- [ ] `message_outbox` con idempotencia, reintentos, horario silencioso y antifatiga.
- [ ] Las 14 reglas de fábrica de [04](./04-automatizaciones.md).
- [ ] **Etapa 0 de WhatsApp**: lista de destinatarios + mensaje redactado + enlace `wa.me`
      de un clic. Sin trámites con Meta.
- [ ] Cálculo de riesgo de fuga + tablero de "atletas en riesgo".
- [ ] Reporte semanal por correo.
- [ ] **Modo simulación** por box.

**Entregable:** la demo de ventas está completa. **Se cierra el primer cliente pago.**

---

## F5 — Cobro automático colombiano (2 semanas) · *el mayor diferenciador* · **HECHO (2026-09-18)**

Esta fase existe por un hallazgo concreto: **ningún competidor con venta local en Colombia
tiene débito automático sobre Nequi**. Trainingym solo mueve VISA/Mastercard, Fitco usa
Stripe y Mercado Pago, Boxmagic ni siquiera vende aquí. El único con Wompi es WodBuster, un
producto español sin presencia comercial local.

- [ ] Wompi en Plan Avanzado, con **tokenización de tarjeta y de cuenta Nequi**.
- [ ] Autorización del atleta para el débito, con evidencia y revocación en un toque.
- [ ] Cobro automático el día de corte + **reintentos escalonados** ante fallo.
- [ ] Aviso de fallo al atleta y al box, con link de pago manual como alternativa.
- [ ] Conciliación automática: el pago cancela los mensajes de cobro encolados y reactiva
      la membresía. **Con prueba automática: cobrarle a quien ya pagó es el peor bug posible.**
- [ ] Panel de conciliación para el dueño (qué entró, qué falló, qué está pendiente).
- [ ] Recibo automático por WhatsApp.

**Entregable:** *"tus atletas pagan por Nequi el día 1 sin que tú escribas un solo mensaje"*.
Es la frase que cierra ventas.

---

## F6 — Finanzas y logística (2 semanas) · **HECHO (2026-09-18)**

- [ ] Gastos con categorías y recurrencia.
- [ ] Insumos (magnesio, tiza, cauchos): stock, mínimo, última compra, proveedor.
- [ ] Compras con foto de factura, que se reflejan como gasto automáticamente.
- [ ] Calendario de compromisos (arriendo, seguro, mantenimiento, compras recurrentes).
- [ ] P&L mensual con comparación contra el mes anterior.
- [ ] Reportes: ingreso recurrente, altas y bajas, retención, origen de los atletas.
- [ ] **WhatsApp Cloud API** oficial: verificación del negocio, plantillas, envío real.

**Entregable:** el dueño ve su negocio completo, no solo sus atletas.

---

## F7 — Módulo del atleta (2 semanas) · **HECHO (2026-09-18)**

- [ ] PWA instalable, con notificaciones push.
- [ ] Mi evolución, mis marcas, mi asistencia, mi historial de pagos y recibos.
- [ ] Tarjeta de PR compartible con la marca del box.

**Entregable:** el atleta abre la app solo. (Recordatorio: **la PWA nunca es obligatoria** —
todo lo esencial ya funciona por WhatsApp desde F3.)

---

## F8 — Convertirlo en SaaS de verdad (2 semanas) · **HECHO (2026-09-18)**

- [ ] Alta de boxes por subdominio + asistente de configuración inicial.
- [ ] Panel de superadministrador con suplantación registrada en bitácora.
- [ ] Facturación de Scalar a los boxes (estado de suscripción, suspensión por mora).
- [ ] Página de ventas **con precio público en pesos** + box demo con datos sembrados.
- [ ] Base de conocimiento y videos de 90 segundos.
- [ ] Respaldos verificados + procedimiento de restauración probado de verdad.

**Entregable:** un box nuevo puede quedar operando sin que tú toques la base de datos.

---

## Calendario resumido

| Fase | Semanas | Acumulado | Hito |
|---|---|---|---|
| F0 Cimientos | 2 | 2 | Multi-tenant seguro |
| F1 Núcleo + link de pago | 3 | 5 | Box 0 operando y cobrando |
| F2 Entrenamiento | 2 | 7 | Reemplaza la pizarra |
| F3 Horarios y reservas | 2 | 9 | Reemplaza el grupo de WhatsApp |
| F4 Automatización | 2 | 11 | **Primera venta** |
| F5 Cobro automático | 2 | 13 | El diferenciador queda armado |
| F6 Finanzas | 2 | 15 | Producto completo para el dueño |
| F7 Atleta PWA | 2 | 17 | Enganche del atleta |
| F8 SaaS | 2 | 19 | Escalable sin ti |

> **Todas las fases están construidas y verificadas (2026-09-18).** El
> calendario de abajo era la estimación original; se cumplió con agentes en
> paralelo. Lo que queda no es código: son las cuentas, los secretos y las
> pruebas contra los servicios reales. Ver "Lo que falta para vender" abajo.

≈ **19 semanas efectivas**. A 20 h/semana: ~5 meses. A 10 h/semana: ~9 meses, con la primera
venta alrededor del mes 5–6.

> **Atajo si el tiempo aprieta**: se puede posponer F2 (WOD y resultados) y salir a vender al
> terminar F3 + F4 con **cobros + reservas + automatización**, que es exactamente donde están
> los tres dolores documentados. Eso adelanta la primera venta a la semana 9. El WOD digital
> es lo que engancha al atleta, pero **no es por lo que paga el dueño**.

## Trabajo comercial en paralelo (no esperar a terminar)

| Mientras va | Hacer |
|---|---|
| F0 | **Las 5 tareas de campo de [08 §7.5](./08-mercado-cali.md)**: censo real por Maps e Instagram, DM a 10 boxes como prospecto, y probar `<box>.crosshero.site` / `.wodbuster.com` para saber quién ya paga software |
| F1 | 5 entrevistas presenciales con dueños de box del sur de Cali |
| F2–F3 | Redactar contrato, política de datos y acuerdo de encargo ([07](./07-legal-colombia.md)). Abrir la cuenta Wompi y la verificación de negocio en Meta (los trámites tardan) |
| F4 | Migrar el box 0. Grabar el testimonio. Armar el box demo |
| F5–F6 | Vender a 3 boxes a precio de fundador |
| F7–F8 | Subir a la tarifa objetivo con los clientes nuevos |


---

## Lo que falta para vender (2026-09-18)

El producto está construido: **570 aserciones de base de datos y 213 pruebas
unitarias**, todas en verde en CI. Lo que falta **no es código**.

### Bloqueantes de verdad

| # | Qué | Por qué bloquea |
|---|---|---|
| 1 | **Rotar las llaves del proyecto viejo de Supabase** | Siguen en el historial de git, y ese proyecto tiene RLS desactivada y `anon` con DELETE y TRUNCATE |
| 2 | **Cuenta de comercio en Wompi** (RUT + cámara de comercio) | Sin ella, ni una transacción ha pasado por el código: ni sandbox |
| 3 | ~~Decidir: una cuenta de Wompi para todos, o una por box~~ **RESUELTO**: una por box. El dueño mete sus llaves en Configuración → Integraciones, se guardan de forma que ni él puede leerlas desde el navegador, y el enlace de pago y el cobro recurrente ya usan las de cada box | — |
| 4 | **Cuenta de WhatsApp Business + plantillas aprobadas** | El proveedor Cloud API está escrito contra la documentación pero nunca se ejecutó. Mientras tanto funciona el `wa.me` de un clic |
| 5 | **Proyecto de Supabase nuevo, con las migraciones aplicadas** | Todo se ha probado contra Postgres efímero, nunca contra Supabase real |
| 6 | **Los teléfonos de los atletas del box 0** | Es el dato que no existe en la base vieja y sin el cual no hay recordatorio ni acceso del atleta |

### Pendientes técnicos menores

- **El importador de Excel no mapea todavía los campos propios del box.** Un box
  que definió "Talla de camiseta" y trae esa columna en su Excel tiene que
  meterla a mano después de importar. La función de validación ya es compartida
  (`validarCampos`), así que es extender el mapeo de `import/parse.ts` con
  destinos `campo:<clave>`, no escribir una segunda validación. Los campos
  sensibles **no** se importan por Excel: importar una lista no es una
  autorización de esas personas.

- Enganchar a `pg_cron`: `generate_invoices`, `run_automations`, `process-outbox`,
  `charge_due_subscriptions`, `generate_classes`, `run_platform_dunning`,
  `flush_recurring_notices`, `refresh_risk_scores`.
- Dar de alta el primer superadministrador a mano (no hay interfaz, a propósito).
- Regenerar `src/types/database.ts` con `npm run types:gen` contra el proyecto real.
- Sentry y los ambientes de staging y producción.
- El widget de Wompi en el navegador para guardar **tarjeta** (hoy solo Nequi).

### Trabajo comercial

Las cinco tareas de campo de [08 §7.5](./08-mercado-cali.md): censo real de Cali,
precios por DM a 10 boxes, quién ya paga software, y 5 entrevistas presenciales.
