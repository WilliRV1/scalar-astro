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

## F0 — Cimientos (2 semanas) · *bloquea todo lo demás*

Sin esto no se puede vender ni un box, porque hoy los datos están abiertos.

- [ ] **Rotar las llaves de Supabase** y sacar `.env` del historial de Git.
- [ ] Supabase CLI + `supabase/migrations/` versionadas. Borrar los `.sql` de la raíz.
- [ ] Esquema multi-tenant: `organizations`, `memberships`, `org_id` en todas las tablas.
- [ ] **RLS habilitada en todas las tablas** + `auth_org_ids()` / `has_role()`.
- [ ] Prueba automática que falla si alguna tabla pública queda sin RLS.
- [ ] Autenticación real: correo/contraseña para el staff, OTP para el atleta. Fuera el
      `prompt('admin123')` de `App.tsx:20` y el PIN `'0000'` de `AthleteLogin.tsx:44`.
- [ ] `react-router-dom` de verdad, con rutas por rol y carga diferida por módulo.
- [ ] Reestructura de carpetas (`features/`, `shared/`, `app/`).
- [ ] Tipos generados (`supabase gen types`) y eliminación de los `any`.
- [ ] `supabase start` local + `seed.sql` con un box demo. Eliminar el mock de
      `supabaseClient.ts`.
- [ ] GitHub Actions: typecheck + lint + build. Sentry. Ambientes dev/staging/prod.
- [ ] Quitar `dist/` del control de versiones. **Renombrar el producto sin "CrossFit"**.

**Entregable:** dos boxes coexistiendo en la misma base sin verse entre sí, con login real.

---

## F1 — Núcleo: atletas y plata (3 semanas)

- [ ] CRUD de atletas con el modelo nuevo (teléfono E.164, estado, consentimientos).
- [ ] Planes y suscripciones con fecha de corte por atleta.
- [ ] `generate-invoices` (job diario, idempotente) + tabla de cobros.
- [ ] Registro de pagos manuales con foto del comprobante.
- [ ] **Link de pago Wompi** (tarjeta, PSE, Nequi, Daviplata) + webhook que concilia solo.
- [ ] **Tablero de cartera**: quién debe, cuánto, hace cuántos días, ordenado por plata.
- [ ] Marcas personales contra catálogo de movimientos, con valores numéricos.
- [ ] Importador de Excel v2: reusar `ExcelImport.tsx`, agregando teléfonos, planes,
      fechas de corte y marcas, con vista previa y validación por fila.
- [ ] Invitación de coaches y matriz de permisos.

**Entregable:** el box del entrenador operando de verdad con sus datos migrados, y cobrando
en línea. Ya reemplaza el Excel.

---

## F2 — Entrenamiento (2 semanas)

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

## F3 — Horarios y reservas (2 semanas)

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

## F4 — Automatización (2 semanas) · **aquí empieza a venderse**

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

## F5 — Cobro automático colombiano (2 semanas) · *el mayor diferenciador*

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

## F6 — Finanzas y logística (2 semanas)

- [ ] Gastos con categorías y recurrencia.
- [ ] Insumos (magnesio, tiza, cauchos): stock, mínimo, última compra, proveedor.
- [ ] Compras con foto de factura, que se reflejan como gasto automáticamente.
- [ ] Calendario de compromisos (arriendo, seguro, mantenimiento, compras recurrentes).
- [ ] P&L mensual con comparación contra el mes anterior.
- [ ] Reportes: ingreso recurrente, altas y bajas, retención, origen de los atletas.
- [ ] **WhatsApp Cloud API** oficial: verificación del negocio, plantillas, envío real.

**Entregable:** el dueño ve su negocio completo, no solo sus atletas.

---

## F7 — Módulo del atleta (2 semanas)

- [ ] PWA instalable, con notificaciones push.
- [ ] Mi evolución, mis marcas, mi asistencia, mi historial de pagos y recibos.
- [ ] Tarjeta de PR compartible con la marca del box.

**Entregable:** el atleta abre la app solo. (Recordatorio: **la PWA nunca es obligatoria** —
todo lo esencial ya funciona por WhatsApp desde F3.)

---

## F8 — Convertirlo en SaaS de verdad (2 semanas)

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
