# 05 — Modelo de negocio, precio y salida al mercado

## Respuesta corta a "¿qué te parece la idea?"

**La idea es buena y el nicho es correcto.** Un box de CrossFit es el cliente ideal para
software: tiene entre 40 y 200 clientes recurrentes, cobra mensualidades, pierde plata por
desorden, el dueño es también el coach y no tiene tiempo, y hoy lo lleva todo en Excel y
en un grupo de WhatsApp. Además ya tienes lo más difícil de conseguir: **un cliente cero
que confía en ti y un producto que conoce el oficio por dentro.**

**El precio, en cambio, está mal.** No por poco ambicioso, sino porque hace que el negocio
pierda plata a medida que crece. Abajo están los números.

## Unit economics: por qué 40.000 COP/mes no funciona

Costo mensual real de atender **un** box de ~120 atletas:

| Concepto | Costo/mes por box |
|---|---|
| Infraestructura (Supabase Pro + Vercel + Sentry, prorrateado entre ~10 boxes) | ~12.000 COP |
| WhatsApp (ver [04](./04-automatizaciones.md)) | ~6.000 COP |
| Pasarela de pagos | La paga el box sobre sus propias transacciones |
| **Subtotal técnico** | **~18.000 COP** |
| **Soporte: 1–2 horas/mes** (dudas, "no me cuadra el cobro", capacitar a un coach nuevo) | **60.000–160.000 COP** valorando tu hora a 60–80k |
| **Costo real total** | **~80.000–180.000 COP** |

Con 40.000 COP/mes, **cada cliente te cuesta plata desde el primer mensaje de soporte.**
Y el soporte no baja con la escala: baja por cliente, pero sube en total.

Mirado al revés: para ganar 2.000.000 COP/mes necesitarías **50 boxes** a 40k. Cincuenta
boxes es un trabajo de tiempo completo de soporte, tú solo, por un sueldo malo. Con el
precio recomendado, esos mismos 2.000.000 COP salen con **11 boxes**.

### Y el precio tampoco es lo que frena la venta

Un box de 120 atletas a 150.000 COP de mensualidad factura ~18.000.000 COP/mes. La regla
del sector: el software debe costar **≤2% de lo que factura el box** (hasta 360.000 COP en
ese ejemplo). Pero el argumento de venta no es el porcentaje, es este:

> **"Si el sistema recupera un solo atleta al mes de los que se te están yendo en
> silencio, ya se pagó solo y te sobra."**

Un atleta recuperado = 150.000 COP. El software cuesta menos que un atleta. Esa frase
cierra ventas; "40.000 pesitos" genera la sospecha de que no sirve. **Un precio demasiado
bajo comunica que el producto es un favor, no una herramienta**, y los clientes que llegan
por barato son los que más soporte piden y los primeros que se van.

## Precio recomendado · **DECIDIDO 2026-09-16**

> Estructura adoptada: **precio de fundador para los primeros 3–5 boxes + tarifa objetivo
> a partir del cliente 4–6**. Las cifras de abajo son las que van al contrato.

### Precio de fundador (los primeros 3–5 boxes)

Aquí sí tiene sentido tu número, pero **con nombre, con fecha de vencimiento y con
contraprestación**:

- **Instalación: 150.000 COP** (o gratis para el box de tu entrenador).
- **Mensualidad: 40.000 COP durante 12 meses.**
- A cambio, por contrato: testimonio grabado, caso de estudio con números reales,
  autorización para usar el nombre y el logo, disponibilidad para 2 llamadas de producto al
  mes, y referir a otros dos boxes.
- El contrato dice explícitamente: *"tarifa promocional de lanzamiento, válida 12 meses;
  al vencer pasa a la tarifa vigente con 30 días de aviso."* Sin esta cláusula, quedas
  atrapado en 40k para siempre con tus primeros clientes, que además serán los que más te
  recomienden.

### Tarifa objetivo (a partir del cliente 4–6)

| Plan | Atletas activos | Mensual | Para quién |
|---|---|---|---|
| **Starter** | hasta 40 | 99.000 COP | Box nuevo, entrenador personal, estudio pequeño |
| **Box** | hasta 120 | 189.000 COP | El box típico. **Este es el plan que se vende** |
| **Pro** | hasta 300 | 329.000 COP | Box grande o con dos salones |
| **Cadena** | +300 / multi-sede | Cotización | v2 |

- **Implementación: 450.000 COP** por única vez — migración del Excel, carga de atletas y
  marcas, configuración de planes y fechas de corte, plantillas de WhatsApp, capacitación
  de 2 horas al equipo. **Esto no es un cargo inventado: es el trabajo más pesado de todos
  y es lo que hace que el cliente no se vaya**, porque una vez sus datos están adentro,
  irse cuesta.
- **Mensajes de WhatsApp**: 500/mes incluidos; excedente a 60 COP/mensaje (margen alto
  sobre un costo de ~4 COP, y aun así imperceptible para el box).
- **Pago anual**: 2 meses gratis. Mejora tu caja y reduce la fuga.
- **Incremento anual**: IPC + 3 puntos, escrito en el contrato desde el principio.

### Qué se cobra aparte

| Concepto | Precio sugerido |
|---|---|
| Migración de un sistema distinto a Excel (Boxmagic, otro software) | 250.000 COP adicionales |
| Capacitación extra (más de 2 horas) | 120.000 COP/hora |
| Automatización o reporte a la medida | 300.000 COP por regla, con acuerdo escrito |
| Personalización de marca (dominio propio, logo en los mensajes) | 80.000 COP/mes |

> **Regla de oro contra la trampa de la consultoría**: si un cliente pide algo que no está
> en el producto, hay dos respuestas válidas — "no lo tenemos" o "lo construimos como
> funcionalidad del producto para todos, y tú la financias". Nunca una rama de código
> exclusiva para un cliente.

## Empaquetado: instalación vs. suscripción

Tu instinto de cobrar instalación es correcto, pero el nombre importa:

- **"Instalación" está mal** — sugiere que le pones un programa en un computador, y abre la
  pregunta "¿y si me lo instalas y después no te pago más?".
- **"Implementación y puesta en marcha" está bien** — es un servicio profesional: migración
  de datos, configuración y capacitación. Se cobra porque cuesta tu tiempo.
- **La mensualidad es licencia + operación + soporte + respaldos + mejoras.** Se explica
  así, no como "para que el sistema corra".

## Cómo vender (los primeros 10 boxes)

### Fase de validación (mes 1–3, mientras se construye)

1. **Box 0 — el de tu entrenador.** Gratis de por vida o a precio de fundador. Es tu
   laboratorio y tu primera referencia. A cambio: acceso a sus números reales para calibrar
   los reportes, y que te presente a otros dueños. **Los dueños de box se conocen todos entre
   ellos**: ese es tu canal de distribución, no la publicidad.
2. **Entrevistas antes de programar.** 5 conversaciones de 30 minutos con dueños de box.
   Tres preguntas: ¿cómo cobras hoy?, ¿cómo sabes que alguien dejó de venir?, ¿qué te
   gustaría saber de tu box que hoy no sabes? Con eso se resuelve la decisión abierta sobre
   reserva de clases y se ajusta el orden del roadmap.
3. **Lista de espera.** Al terminar la fase 3 del roadmap (ya hay cobros + automatización),
   sale la primera venta paga.

### Fase de venta (mes 4+)

- **Demo en vivo, presencial, de 20 minutos**, en un box demo con datos realistas. El guion
  es siempre el mismo: (1) "estos son tus atletas que no vienen hace 15 días y tú no lo
  sabías", (2) "estos te deben plata hoy", (3) "mira: les escribo a los 12 de un clic",
  (4) "esto es lo que te va a llegar cada lunes a las 7 de la mañana".
- **Prueba de 14 días con tus datos reales adentro.** Tú haces la migración durante la
  prueba: es el trabajo que convierte, porque al día 14 ya no quiere volver al Excel.
- **Onboarding estandarizado de 48 horas** con lista de chequeo: recibir el Excel, migrar,
  crear planes y fechas de corte, invitar al equipo, configurar plantillas, prender
  automatizaciones en modo simulación una semana, capacitación, salida en vivo.
- **Soporte por WhatsApp con horario publicado** (ej. lun–vie 8–18) y acuerdo de respuesta
  en 24 horas hábiles. **Sin horario definido, el soporte se come el negocio**: un dueño de
  box te escribe un domingo a las 9 p.m.
- **Base de conocimiento desde el primer cliente.** Cada pregunta que te hagan dos veces se
  convierte en un artículo o un video de 90 segundos. Es lo único que hace que el soporte no
  crezca linealmente con los clientes.

## Metas y señales de alarma

| Indicador | Meta año 1 | Alarma |
|---|---|---|
| Boxes pagando | 10–15 | < 5 al mes 9 |
| Ingreso recurrente mensual | 2.000.000+ COP | — |
| Fuga mensual de boxes | < 2% | 2 cancelaciones seguidas = problema de producto, no de precio |
| Horas de soporte por box al mes | < 1 h | > 3 h = falta documentación o hay un bug recurrente |
| Atletas activos usando la app del box | > 50% | < 25% = el módulo del atleta no está enganchando |

## Riesgos del negocio

| Riesgo | Mitigación |
|---|---|
| **Competencia establecida** (Boxmagic, Fitco, Wodify, SugarWOD…) | Competir por cercanía y por automatización en WhatsApp en español colombiano, no por cantidad de funciones. Tú contestas el teléfono; ellos no |
| **Un cliente grande te secuestra el roadmap** | La regla de oro de arriba: sin ramas exclusivas |
| **El soporte te consume** | Horario, base de conocimiento, modo simulación, panel de superadministrador con suplantación |
| **Tú eres el único punto de falla** | Documentar todo (este directorio), infraestructura reproducible, y desde el cliente 8 contratar apoyo de soporte por horas |
| **Un error de cobro** | Idempotencia + pruebas automáticas de facturación + modo simulación en el arranque |
| **Fuga de datos** | Lo de [00](./00-diagnostico.md) resuelto antes de la primera venta. Un incidente con datos de atletas, con sanción de la SIC, acaba el negocio |
| **Se te acaba el tiempo** (tienes otros trabajos) | Roadmap por fases vendibles: al terminar la fase 3 ya se puede cobrar. No esperar a "terminarlo" |

## Fuentes consultadas

- [WhatsApp Business API pricing 2026 — desglose por país](https://formbeep.com/whatsapp-api-pricing/)
- [WhatsApp Business API pricing: categorías y tarifas 2026](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)
- [Comparativo de software de gestión para boxes de CrossFit](https://www.fitune.io/post/best-management-software-for-crossfit-boxes)
- [Boxmagic — precios y alternativas (Capterra)](https://www.capterra.com/p/275373/Boxmagic/)

> Las tarifas de WhatsApp y los precios de la competencia cambian. **Verificar la tarifa
> vigente de Meta antes de fijar el precio de la bolsa de mensajes**, y pedirle cotización
> real a 2 competidores (como si fueras un box) antes de cerrar la lista de precios.
