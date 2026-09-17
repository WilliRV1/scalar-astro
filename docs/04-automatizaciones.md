# 04 — Motor de automatizaciones y WhatsApp

Este es el documento más importante del producto. El CRUD de atletas lo tiene todo el
mundo; **lo que se vende es que el sistema trabaje solo.**

## El modelo mental: disparador → condición → acción

Toda automatización es la misma estructura, guardada en `automation_rules`:

```
CUANDO (disparador: un horario o un evento)
  SI (condiciones se cumplen)
    ENTONCES (acción: mensaje, alerta al staff, etiqueta, tarea)
      RESPETANDO (horario permitido, tope de mensajes por atleta, opt-in vigente)
```

Esto permite que las reglas sean **datos, no código**: prender, apagar y ajustar cada una
desde la interfaz del box, sin desplegar nada. Y permite vender "automatización a la
medida" sin escribir código nuevo cada vez.

## Las 15 reglas de fábrica

Cada box nuevo arranca con estas activas (o desactivadas, según se indique). Este catálogo
**es el argumento de venta**: se muestra literalmente en la demo.

| # | Regla | Disparador | Acción | Categoría |
|---|---|---|---|---|
| 1 | **Aviso de vencimiento** | 5 y 2 días antes del `due_on` | WhatsApp: "Hola {{nombre}}, tu mensualidad vence el {{fecha}}. Puedes pagar aquí: {{link}}" | utility |
| 2 | **Cobro vencido** | 1, 4 y 8 días después del `due_on` | WhatsApp al atleta + a los 8 días alerta al dueño | utility |
| 3 | **Corte de acceso** | 10 días de mora | Cambia la membresía a `suspended`, avisa al coach. **No manda mensaje automático**: esa conversación es humana | — |
| 4 | **Atleta que dejó de venir** | 7 / 14 / 21 días sin asistencia teniendo membresía activa | 7d: alerta al coach. 14d: mensaje "te extrañamos". 21d: tarea de llamada para el dueño | marketing |
| 5 | **Bienvenida** | Alta de atleta | WhatsApp con enlace para activar su perfil + horarios + qué llevar | utility |
| 6 | **Seguimiento de clase de prueba** | 24 h después de un drop-in que no se convirtió | Mensaje con la promoción de primer mes | marketing |
| 7 | **Felicitación por PR** | Evento `pr_achieved` | Mensaje + tarjeta compartible con el logo del box. **Publicidad gratis en las historias de los atletas** | utility |
| 8 | **Cumpleaños** | 08:00 del día | Felicitación (y opcionalmente un beneficio) | marketing |
| 9 | **Insumo en mínimo** | Diario, `current_stock <= min_stock` | Aviso al dueño: "Queda poco magnesio. La última compra fue el {{fecha}} a {{proveedor}} por {{valor}}" | interna |
| 10 | **Reporte semanal del box** | Lunes 07:00 | Al dueño: ingresos de la semana, cartera pendiente, altas y bajas, asistencia promedio, 3 atletas en mayor riesgo | interna |
| 11 | **Cupo liberado** | Evento: alguien cancela y hay lista de espera | WhatsApp inmediato al primero de la lista: "Se liberó un cupo para las 6:00 pm, ya quedaste dentro" | utility |
| 12 | **Recordatorio de clase** | 2 h antes de la clase reservada | Recordatorio con opción de cancelar. **Baja el no-show de forma medible** | utility |
| 13 | **Clase cancelada** | Evento: el box cancela una clase | Aviso a todos los reservados + devolución del crédito | utility |
| 14 | **No-show reiterado** | 3 faltas sin cancelar en 30 días | Aviso al atleta y alerta al coach (es señal temprana de fuga) | utility |
| 15 | **Débito automático fallido** | Evento: un cobro por Nequi no pasa | Le dice al atleta qué pasó y cuándo se reintenta; si su autorización caducó, le manda el enlace para volver a autorizar | utility |

### Reserva por WhatsApp (F3) — el atleta no instala nada

Más allá de las reglas salientes, el canal es **de doble vía**: el atleta escribe al número
del box y reserva sin abrir ninguna aplicación.

```
Atleta: "voy mañana 6am"
  → el bot resuelve la clase, verifica membresía y cupo
  → si hay cupo: confirma y queda reservado
  → si no hay: ofrece lista de espera o el horario más cercano
  → si está en mora: responde con el link de pago (si el box activó el bloqueo por mora)
```

Se implementa con **mensajes de plantilla con botones** (respuestas rápidas del propio
WhatsApp), no con interpretación de texto libre: menos ambigüedad, menos soporte, y las
respuestas del atleta caen dentro de la ventana de servicio de 24 horas, que **es gratis**.

Justificación de mercado: 14 de los 21 boxes caleños identificados no tienen ni página web
([08](./08-mercado-cali.md)). Toda la competencia asume que el atleta instalará una app.

Extras configurables: recordatorio de compromisos recurrentes (arriendo, seguro,
mantenimiento), aviso de cierre de mes, y recordatorio de retomar a quien está congelado.

> Las reglas 11 a 14 nacen del módulo de reservas y son las que más se notan en el día a
> día: el aviso de cupo liberado es instantáneo y "mágico" para el atleta, y el
> recordatorio de clase baja el no-show, que es plata perdida para el box (cupo ocupado que
> nadie usó). Son el mejor argumento para justificar que las reservas entren en v1.

## Detección de fuga (el "qué atletas no volvieron")

`refresh-risk-scores` corre a diario y calcula por atleta:

```
señales:
  días desde la última asistencia         (peso alto)
  caída de frecuencia: visitas 30d vs 30d anteriores   (peso alto)
  días de mora                            (peso medio)
  nunca registró un resultado             (peso medio — nunca se enganchó)
  no-shows recientes                      (peso medio — reserva y no va: ya se está yendo)
  antigüedad < 60 días                    (peso medio — los primeros 2 meses son los que se caen)

bandas:
  ok        0-24
  watch     25-49   → aparece en el tablero del coach
  at_risk   50-74   → mensaje automático + tarea
  critical  75-100  → llamada del dueño
```

El valor no está en la fórmula, está en que **la lista aparezca sola cada mañana en el
tablero del coach, ordenada, con un botón de "escribirle"**. Hoy esa información existe en
la cabeza del dueño y se le olvida.

## WhatsApp: cómo hacerlo bien

### El camino en tres etapas

**Etapa 0 — "un clic" (va en F4, sin costo ni trámites).**
El sistema arma la lista de a quién hay que escribirle y el texto ya redactado; el coach
toca un botón y se abre WhatsApp con el mensaje escrito hacia ese número
(`https://wa.me/57300…?text=…`). No es automático, pero **elimina el 90% del trabajo**
(decidir a quién, buscar el chat, redactar) y funciona desde el día uno, sin API, sin
verificación de Meta y sin riesgo. Muchos clientes se quedan felices aquí.

**Etapa 1 — Cloud API oficial de Meta (F4/F6).**
Envío realmente automático. Requiere: cuenta de WhatsApp Business, verificación del negocio
en Meta Business Manager, un número dedicado (que no esté en uso en la app de WhatsApp), y
plantillas aprobadas por Meta para mensajes iniciados por el negocio.

**Etapa 2 — Un BSP (Twilio, 360dialog, Gupshup…) si el volumen lo justifica.**
Cobran un recargo sobre la tarifa de Meta a cambio de simplificar la administración de
números y plantillas. Para pocos boxes, ir directo a Meta sale mejor.

### Costos reales (Colombia)

Colombia tiene de las tarifas más baratas del mundo. Según la tarifa de Meta vigente en
2026 (verificar antes de fijar precios, cambia periódicamente):

| Categoría | Tarifa aproximada por mensaje | Para qué sirve |
|---|---|---|
| **Utility** | ~US$0,001 | Recordatorio de pago, confirmación, bienvenida, alertas **atadas a una acción del cliente** |
| **Marketing** | ~US$0,02 | Promociones, reactivación, cumpleaños |
| **Authentication** | ~US$0,001 | Códigos OTP (nuestro login del atleta) |
| **Service** | Gratis | Respuestas dentro de la ventana de 24 h abierta por el cliente |

Costo mensual estimado para un box de 120 atletas:

```
480 utility/mes (4 por atleta)    ×  US$0,001  =  US$0,48
 40 marketing/mes (reactivación)  ×  US$0,02   =  US$0,80
120 OTP/mes                       ×  US$0,001  =  US$0,12
                                       TOTAL   ≈  US$1,40  ≈  5.600 COP/mes
```

**Conclusión: WhatsApp no es un problema de costo.** Es un problema de trámite (verificación
y plantillas) y de reputación (si molestas, te bloquean). El costo real del negocio es el
soporte, no la mensajería.

### Reglas duras de mensajería

1. **Nunca usar librerías no oficiales** (Baileys, Venom, whatsapp-web.js). Violan los
   términos de WhatsApp y el número del *cliente* termina baneado. Eso no es un bug: es
   perder al cliente y su reputación con sus atletas.
2. **Opt-in registrado con fecha y origen** (`athletes.consent_whatsapp_at`). Es requisito
   de Meta y de la ley colombiana de datos.
3. **Salida fácil**: toda plantilla de marketing incluye cómo pedir que no le escriban más,
   y el sistema lo respeta (`tags` con `no_marketing`).
4. **Horario silencioso**: nada antes de 8:00 ni después de 21:00, hora del box.
5. **Antifatiga**: tope de mensajes automáticos por atleta al mes (por defecto 4). Si dos
   reglas coinciden el mismo día, gana la de mayor prioridad y la otra se descarta.
6. **Idempotencia**: `dedupe_key` único por (regla, atleta, periodo). Si el job corre dos
   veces, el atleta no recibe el mismo cobro dos veces. **Este es el error que hace que un
   cliente cancele.**
7. **Bitácora completa**: cada mensaje queda en `message_outbox` con estado y costo. El
   dueño puede ver exactamente qué se le mandó a cada atleta y cuándo. Sin esto, el primer
   reclamo ("me están cobrando y yo ya pagué") no se puede resolver.
8. **Modo simulación**: un interruptor por box que encola los mensajes pero no los envía,
   mostrando qué habría pasado. Indispensable para la primera semana de cada cliente nuevo
   y para la demo de ventas.

## Conciliación con los pagos

Cuando entra un pago (webhook de Wompi o registro manual):

```
pago confirmado
  → se aplica a la factura abierta más antigua
  → si queda saldada: status = paid
  → se CANCELAN los mensajes de cobro encolados para esa factura   ← crítico
  → la membresía vuelve a active si estaba overdue
  → se manda el recibo (utility)
```

El paso de cancelar lo encolado es el que evita el peor bug posible del producto: cobrarle
a alguien que ya pagó. Debe estar cubierto por una prueba automática.
