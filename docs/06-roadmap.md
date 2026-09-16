# 06 — Roadmap

Supuesto de trabajo: **desarrollador solo, con otros trabajos encima.** Las estimaciones
están en "semanas de trabajo efectivo" (~20 h cada una). Si le dedicas medio tiempo, el
calendario se estira, pero el orden no cambia.

El principio del orden: **cada fase termina en algo mostrable, y desde la fase 3 ya se
puede cobrar.** No hay que terminar el producto para empezar a vender.

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
- [ ] Quitar `dist/` del control de versiones.

**Entregable demostrable:** dos boxes coexistiendo en la misma base sin verse entre sí, con
login real.

---

## F1 — Núcleo: atletas y plata (3 semanas)

- [ ] CRUD de atletas con el modelo nuevo (teléfono E.164, estado, consentimientos).
- [ ] Planes y suscripciones con fecha de corte por atleta.
- [ ] `generate-invoices` (job diario, idempotente) + tabla de cobros.
- [ ] Registro de pagos manuales con foto del comprobante.
- [ ] **Tablero de cartera**: quién debe, cuánto, hace cuántos días, ordenado por plata.
- [ ] Marcas personales contra catálogo de movimientos, con valores numéricos.
- [ ] Importador de Excel v2: reusar `ExcelImport.tsx`, agregando teléfonos, planes,
      fechas de corte y marcas, con vista previa y validación por fila.
- [ ] Invitación de coaches y matriz de permisos.

**Entregable:** el box del entrenador operando de verdad con sus datos reales migrados.
Ya reemplaza el Excel.

---

## F2 — Entrenamiento (2 semanas)

- [ ] Editor de WOD con bloques, tipos de score y escalas.
- [ ] Calendario semanal, duplicar WOD, biblioteca de benchmarks.
- [ ] Registro de resultados (atleta y coach) + leaderboard del día.
- [ ] Asistencia con un toque.
- [ ] Ficha del atleta: marcas, evolución con gráficas, notas del coach, lesiones.
- [ ] Detección automática de PR al registrar un resultado.

**Entregable:** el coach deja de usar la pizarra y el cuaderno.

---

## F3 — Automatización (2 semanas) · **aquí empieza a venderse**

- [ ] Motor de reglas (`automation_rules`) con disparadores por horario y por evento.
- [ ] `message_outbox` con idempotencia, reintentos, horario silencioso y antifatiga.
- [ ] Las 10 reglas de fábrica de [04](./04-automatizaciones.md).
- [ ] **Etapa 0 de WhatsApp**: lista de destinatarios + mensaje redactado + enlace `wa.me`
      de un clic. Sin trámites con Meta.
- [ ] Cálculo de riesgo de fuga + tablero de "atletas en riesgo".
- [ ] Reporte semanal por correo.
- [ ] **Modo simulación** por box.

**Entregable:** la demo de ventas está completa. **Se cierra el primer cliente pago.**

---

## F4 — Finanzas y logística (2 semanas)

- [ ] Gastos con categorías y recurrencia.
- [ ] Insumos (magnesio, tiza, cauchos): stock, mínimo, última compra, proveedor.
- [ ] Compras con foto de factura, que se reflejan como gasto automáticamente.
- [ ] Calendario de compromisos (arriendo, seguro, mantenimiento, compras recurrentes).
- [ ] P&L mensual con comparación contra el mes anterior.
- [ ] Reportes: ingreso recurrente, altas y bajas, retención, origen de los atletas.
- [ ] **WhatsApp Cloud API** oficial: verificación del negocio, plantillas, envío real.

**Entregable:** el dueño ve su negocio completo, no solo sus atletas.

---

## F5 — Módulo del atleta (2 semanas)

- [ ] PWA instalable, con notificaciones push.
- [ ] Mi evolución, mis marcas, mi asistencia, mi historial de pagos.
- [ ] Estado de pago + subir comprobante.
- [ ] **Link de pago (Wompi)** + webhook que concilia y cancela los cobros encolados.
- [ ] Tarjeta de PR compartible con la marca del box.

**Entregable:** el atleta abre la app solo, y el box deja de perseguir comprobantes.

---

## F6 — Convertirlo en SaaS de verdad (2 semanas)

- [ ] Alta de boxes por subdominio + asistente de configuración inicial.
- [ ] Panel de superadministrador con suplantación registrada en bitácora.
- [ ] Facturación de Scalar a los boxes (estado de suscripción, suspensión por mora).
- [ ] Página de ventas + box demo público con datos sembrados.
- [ ] Base de conocimiento y videos de 90 segundos.
- [ ] Respaldos verificados + procedimiento de restauración probado de verdad.

**Entregable:** un box nuevo puede quedar operando sin que tú toques la base de datos.

---

## Calendario resumido

| Fase | Semanas efectivas | Acumulado | Hito |
|---|---|---|---|
| F0 Cimientos | 2 | 2 | Multi-tenant seguro |
| F1 Núcleo | 3 | 5 | Box 0 operando |
| F2 Entrenamiento | 2 | 7 | Reemplaza la pizarra |
| F3 Automatización | 2 | 9 | **Primera venta** |
| F4 Finanzas | 2 | 11 | Producto completo para el dueño |
| F5 Atleta | 2 | 13 | Pagos en línea |
| F6 SaaS | 2 | 15 | Escalable sin ti |

≈ **15 semanas efectivas**. A 20 h/semana: ~4 meses. A 10 h/semana: ~7 meses, con la
primera venta alrededor del mes 4.

## Trabajo comercial en paralelo (no esperar a terminar)

| Mientras va | Hacer |
|---|---|
| F0–F1 | 5 entrevistas con dueños de box. Resolver la decisión sobre reserva de clases |
| F2 | Redactar contrato, política de datos y acuerdo de tratamiento ([07](./07-legal-colombia.md)) |
| F3 | Migrar el box 0. Grabar el testimonio. Armar el box demo |
| F4 | Vender a 3 boxes a precio de fundador |
| F5–F6 | Subir a la tarifa objetivo con los clientes nuevos |
