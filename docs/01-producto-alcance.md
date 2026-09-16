# 01 — Producto y alcance: qué ofrecemos y qué no

## La promesa en una frase

> **Scalar le devuelve al dueño del box las 8 horas al mes que pierde persiguiendo pagos
> por WhatsApp, y le avisa qué atleta está a punto de irse antes de que se vaya.**

No vendemos "software de gestión". Eso ya existe y es aburrido. Vendemos dos cosas
medibles: **plata que no se pierde** (cobros que se cobran solos, atletas que no se
fugan) y **tiempo del dueño** (el reporte llega solo, la lista de morosos se arma sola).

Todo lo que no sirva a esas dos promesas es secundario.

## Los tres módulos

En un box pequeño el dueño, el coach y el administrador suelen ser **la misma persona**.
Por eso no son tres aplicaciones: es **una aplicación con tres perfiles de permisos**, y
el dueño-coach ve la unión de dos de ellos.

### Módulo Administrador / Dueño

El módulo de la plata y la logística.

| Capacidad | Descripción | Fase |
|---|---|---|
| Planes y precios | Mensualidad, trimestre, 8 clases, drop-in, estudiante, pareja. Precio, duración, cupo de clases | F1 |
| Atletas y membresías | Alta, estado (activo / vencido / congelado / retirado), fecha de corte por atleta | F1 |
| Cobros | Generación automática del cobro de cada atleta en su fecha de corte | F1 |
| Registro de pagos | Efectivo, transferencia, Nequi, datáfono. Con foto del comprobante | F1 |
| Cartera | Quién debe, cuánto, hace cuántos días. Ordenado por plata, no por nombre | F1 |
| Gastos | Arriendo, servicios, coaches, mantenimiento, insumos. Categorizados y recurrentes | F4 |
| Insumos e inventario | Magnesio, tiza, cauchos, cintas, agarraderas: stock, fecha de última compra, proveedor, alerta de stock bajo | F4 |
| Compras programadas | Calendario de compras recurrentes y vencimientos (arriendo, seguro, mantenimiento de equipos) | F4 |
| P&L mensual | Ingresos − egresos, por mes, con comparación contra el mes anterior | F4 |
| Reportes | Ingreso recurrente mensual, atletas activos, altas y bajas del mes, tasa de retención, origen de los atletas | F4 |
| Usuarios y permisos | Invitar coaches, dar o quitar acceso a la parte financiera | F1 |
| Configuración de automatizaciones | Prender, apagar y editar cada regla y cada plantilla de mensaje | F3 |

### Módulo Coach

El módulo del día a día en el piso del box.

| Capacidad | Descripción | Fase |
|---|---|---|
| WOD del día | Editor: calentamiento, fuerza, metcon. Con tipo de score (tiempo, rondas+reps, carga, AMRAP) y escalas RX / Scaled / Principiante | F2 |
| Calendario de WODs | Programar la semana por adelantado, duplicar, biblioteca de WODs y benchmarks (Fran, Karen, Murph…) | F2 |
| Resultados | Registrar cómo le fue a cada atleta; o que el atleta lo registre y el coach valide | F2 |
| Asistencia | Marcar quién vino hoy (lista con un toque). Base de toda la detección de fuga | F2 |
| Ficha del atleta | RMs, historial de marcas, notas privadas del coach, lesiones y limitaciones, objetivos | F2 |
| Evolución | Gráficas de cada marca en el tiempo; comparación contra el promedio del box | F2 |
| Tablero del día | Quién viene hoy, quién cumple años, quién está vencido, quién no viene hace 2 semanas | F3 |
| Atletas en riesgo | Lista priorizada de quién se está por ir, con el motivo y un botón para escribirle | F3 |
| Leaderboard | Resultado del WOD del día ordenado, con RX / Scaled separados | F2 |
| Horarios y clases | Plantilla semanal de horarios, cupo por clase, coach asignado, festivos y cierres | F2.5 |
| Lista de la clase | Quién reservó, quién llegó, quién no llegó. Check-in de toda la clase desde el celular | F2.5 |
| Control de no-show | Ver quién reserva y no va; política configurable (aviso, bloqueo temporal) | F2.5 |

### Módulo Atleta

El módulo que hace que el atleta *quiera* abrirlo. Es una PWA, se instala en el celular.

| Capacidad | Descripción | Fase |
|---|---|---|
| WOD de hoy | Lo que toca hoy, con las escalas | F2 |
| Registrar resultado | Su score, si fue RX o escalado, notas | F2 |
| Mis marcas | Todos sus RMs y benchmarks, con la fecha de cada uno | F1 |
| Mi evolución | Gráfica por movimiento: cuánto subió el back squat en 6 meses. **Esto es lo que genera enganche** | F2 |
| Celebración de PR | Confetti + tarjeta compartible a Instagram con la marca del box. Es publicidad gratis para el box | F5 |
| Mi estado de pago | Cuándo vence, cuánto debe, historial de pagos | F5 |
| Pagar | Link de pago (Wompi / Mercado Pago) o subir comprobante de transferencia | F5 |
| Mis recibos | Historial descargable | F5 |
| Mi asistencia | Cuántas veces vino este mes | F5 |
| Check-in diario | Energía, RPE, notas (ya existe en el prototipo) | F2 |
| Reservar clase | Ver horarios con cupos disponibles y reservar desde el celular | F2.5 |
| Cancelar y lista de espera | Cancelar con antelación configurable; entrar a lista de espera y recibir aviso automático si se libera un cupo | F2.5 |
| Mis reservas | Próximas clases reservadas, con recordatorio | F2.5 |

## Qué NO vamos a ofrecer (y por qué)

Esta lista es tan importante como la anterior. Es lo que te permite lanzar en meses en
vez de años. Cada línea es una conversación que vas a tener con un cliente: la respuesta
es "todavía no, y esto es lo que sí tenemos".

| No incluido | Por qué | ¿Algún día? |
|---|---|---|
| **App nativa iOS/Android** | Meses de trabajo + US$99/año + revisiones de tienda. Una PWA instalable cubre el 95% | v3, si un cliente lo paga |
| **Facturación electrónica DIAN** | Requiere ser proveedor tecnológico autorizado o integrarse con uno. Es un producto entero | v2 vía integración con Alegra o Siigo |
| **Control de acceso / torniquete / huella** | Hardware. Otro negocio, otro soporte, otro margen | v3, solo con un integrador |
| **Nómina de coaches** | Legislación laboral colombiana. Que usen su contador | No |
| **Tienda / POS completo con inventario de retail** | Suplementos, ropa, bebidas. Se puede hacer simple en v2 (venta suelta), no un POS | v2 parcial |
| **Débito automático recurrente** | Requiere convenio y tokenización con la pasarela. Empezamos con link de pago por cobro | v2 |
| **Programación de ciclos de fuerza con porcentajes** | Periodización avanzada (5/3/1, Conjugate). Nicho | v3 |
| **Integración con relojes / wearables** | Ruido, poco valor para el dueño | No |
| **Chat interno** | Nadie lo va a usar teniendo WhatsApp | No |
| **Multi-sede** | Un box, una sede. Cuando llegue una cadena, se cobra distinto | v2 |
| **Traducción a otros idiomas** | Español Colombia primero. La arquitectura queda lista para i18n, pero no se traduce | v2 |

> **Decisión tomada (2026-09-16) — Reserva de clases entra en v1.** Es *table stakes*
> frente a Boxmagic y similares: si un box maneja horarios con cupo, sin esto la venta no
> arranca. Suma ~2 semanas al roadmap (fase F2.5) y obliga a modelar horarios, cupos, lista
> de espera, cancelación y no-show desde el principio. A cambio, habilita dos cosas que
> valen plata: **control de acceso por membresía** (quien está en mora no puede reservar) y
> **datos de asistencia mucho más limpios**, que es lo que alimenta la detección de fuga.

## Regla para decidir qué entra

Ante cualquier funcionalidad nueva, se pregunta en este orden:

1. ¿Le hace ganar o dejar de perder plata al dueño del box? → entra.
2. ¿Le ahorra tiempo repetitivo al dueño o al coach? → entra.
3. ¿Hace que el atleta abra la app por su cuenta? → entra (retención del box = retención nuestra).
4. ¿Solo lo pidió un cliente y ninguno más? → se cobra aparte o se dice que no.
5. ¿Requiere hardware, un ente regulador o un convenio bancario? → no, hasta v2 mínimo.
