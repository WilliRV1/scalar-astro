# 16 — Viabilidad financiera: cuánto cuesta operar Scalar y desde cuándo es rentable

Fecha del análisis: 2026-09-25. Este documento modela el **costo de producción real**
(Supabase Cloud + Vercel, tal como asumen [06](./06-roadmap.md) y [11](./11-operacion.md)),
**no** el entorno de prueba autoalojado en widawi ([deploy/widawi/README.md](../deploy/widawi/README.md)),
que es solo el laboratorio del dueño y no representa el costo de servir clientes reales.
Cada cifra trae su fuente y su fecha de consulta; lo que no se pudo verificar está marcado
**ESTIMACIÓN** en mayúsculas. TRM usada: **$3.300 COP/USD**, la misma referencia de
[15-competencia-software.md](./15-competencia-software.md) (verificada 2026-09-25).

---

## 1. Resumen ejecutivo

**¿Alcanza el precio? Sí, pero no antes de ~10–11 boxes pagando la tarifa objetivo
($179.000/mes), y el precio de fundador ($40.000/mes) pierde plata en cada cliente
mientras dure.**

- El **costo fijo mensual de operar en producción** (Supabase Pro + Vercel Pro + dominio +
  facturación electrónica + contador) es de **~$681.000 a ~$1.081.000 COP/mes**, según qué
  tan barato consiga el dueño un contador en Cali (rango amplio, ver §2.8). Esto se paga
  **exista o no un solo box pagando**.
- Cada box a la tarifa objetivo ($179.000/mes) deja un **margen de contribución de
  ~$90.000–$120.000 COP/mes** después de WhatsApp y soporte, dependiendo de cuánto tiempo
  de soporte requiera en promedio.
- **Punto de equilibrio: entre 7 y 11 boxes pagando la tarifa objetivo**, según el
  escenario de costo del contador. El número que ya citaba [05](./05-negocio-precio-gtm.md)
  (11 boxes) queda confirmado de forma independiente en el escenario de contador más caro.
- **El precio de fundador ($40.000/mes) es estructuralmente deficitario por cliente**: el
  costo marginal de atender un box (soporte + WhatsApp) ya es mayor que los $40.000 que
  paga. Los primeros 3–5 clientes fundadores no contribuyen a cubrir el costo fijo — lo
  aumentan. Esto no invalida la estrategia (son inversión en testimonios y referidos, como
  ya explica 05), pero el dueño debe saber que **está subsidiando esos clientes de su
  bolsillo**, no que están ayudando a pagar la operación.
- **Hay al menos 4–5 meses, posiblemente más, en los que el dueño debe poner plata de su
  bolsillo** antes de que el negocio genere caja positiva (ver §4). El monto acumulado en
  el escenario modelado de 6 meses es de **~$4,2–4,9 millones COP**, principalmente por el
  contador y la infraestructura, que se pagan desde el mes 0, antes de la primera venta.
- **Trámite más restrictivo antes de poder facturarle a un cliente real: no es ningún
  trámite individual (RUT y cámara de comercio toman 1–5 días hábiles cada uno, Wompi
  aprueba en 1–3 días hábiles) sino la secuencia completa** — RUT y cámara de comercio
  tienen que existir *antes* de poder abrir la cuenta de comercio en Wompi, que a su vez
  tiene que estar aprobada antes de cobrar un peso. Contando la coordinación real (reunir
  documentos, esperar la cuenta bancaria, contratar contador, activar el software de
  facturación electrónica), el tiempo realista es de **2 a 3 semanas**, no los 1–3 días que
  cada trámite toma aislado.

---

## 2. Costo atómico línea por línea

### 2.1 Supabase Cloud

| Concepto | Costo | Fuente |
|---|---|---|
| Plan Pro (base) | USD 25/mes → **$82.500 COP/mes** | [supabase.com/pricing](https://supabase.com/pricing), consultado 2026-09-25 |
| Incluye | 8 GB de disco, 100 GB de Storage, 250 GB de egress, 100.000 MAU, y USD 10/mes de crédito de cómputo (cubre una instancia Micro) | ídem |
| Cómputo extra — Small (2 GB RAM) | USD 15/mes de tarifa, **USD 5/mes extra** neto del crédito → ~$16.500 COP/mes | ídem |
| Cómputo extra — Medium (4 GB RAM) | USD 60/mes, **USD 50/mes extra** → ~$165.000 COP/mes | ídem |
| Storage extra | USD 0,125/GB → ~$412 COP/GB/mes | ídem |
| Egress extra | USD 0,09/GB → ~$297 COP/GB/mes | ídem |
| MAU extra (sobre 100.000) | USD 0,00325/MAU | ídem |
| Plan Team (si se necesita cumplimiento avanzado) | USD 599/mes → ~$1.977.000 COP/mes | ídem |

**Cuándo se sale del plan Pro base**: con fotos de comprobantes de pago (~150–400 KB cada
una, según [10-wompi.md](./10-wompi.md) y el flujo de pago manual de F1), un box de 120
atletas que registra ~120 pagos/mes con foto genera del orden de 20–50 MB/mes de Storage
nuevo — insignificante frente a los 100 GB incluidos. El límite real que se toca primero es
el de **cómputo** (Micro, 1 GB RAM) cuando el número de boxes activos simultáneos crece: el
propio [05](./05-negocio-precio-gtm.md) ya asume prorratear la infraestructura entre ~10
boxes, que es aproximadamente donde el tráfico y las conexiones concurrentes justifican
subir a Small. **ESTIMACIÓN**: con 1–10 boxes, Micro alcanza; de 10 a ~30, Small; más allá,
Medium. No hay carga real todavía para verificarlo con datos propios.

### 2.2 Vercel

| Concepto | Costo | Fuente |
|---|---|---|
| Plan Hobby (gratis) | $0 — **no permite uso comercial** | [vercel.com/pricing](https://vercel.com/pricing), consultado 2026-09-25 |
| Plan Pro | USD 20/mes por asiento → **$66.000 COP/mes** (1 asiento, el dueño) | ídem |
| Incluye | 1 TB de transferencia de datos, 10M de Edge Requests, 1M de invocaciones de función | ídem |
| Transferencia extra | desde USD 0,15/GB | ídem |
| Edge Requests extra | desde USD 2 por millón | ídem |
| Invocaciones extra | desde USD 0,60 por millón | ídem |

El plan Hobby es gratis pero **Vercel prohíbe explícitamente su uso comercial**; con clientes
reales pagando, el plan Pro es obligatorio desde el primer box. 1 TB de transferencia es
generoso para una SPA + PWA de este tamaño: no se espera superarlo ni con 20 boxes activos.
**ESTIMACIÓN** razonada, sin carga real que lo confirme.

### 2.3 Wompi (pasarela de pagos)

| Concepto | Valor | Fuente |
|---|---|---|
| Comisión (plan Avanzado) | **2,65% + $700 + IVA** por transacción aprobada, todos los medios (tarjeta, PSE, Nequi, Bancolombia) | [soporte.wompi.co](https://soporte.wompi.co/hc/es-419/articles/360020957133), consultado 2026-09-25 — mismo dato que ya tenía [10-wompi.md §6](./10-wompi.md) |
| Desembolso | **Al día hábil siguiente** a la aprobación, con un máximo de 5 días hábiles según el reglamento de comercios | [wompi.com — cuánto cuesta una pasarela](https://wompi.com/es/co/aprende-con-wompi/blog/cuanto-cuesta-tener-pasarela), consultado 2026-09-25 — mejora el dato de "no confirmado" que dejaba 10-wompi.md |
| Aprobación de la cuenta de comercio | **1 a 3 días hábiles** tras entregar documentos completos | [Auge Digital — cómo abrir cuenta Wompi 2026](https://augedigital.co/guias/abrir-cuenta-wompi/), consultado 2026-09-25 |

**Importante**: esta comisión **la paga el box sobre sus propios cobros a sus atletas**, no
Scalar. No es un costo de Scalar — es un costo del cliente, que hay que explicarle en la
demo (ver 10-wompi.md §6, ya lo advertía). La única línea de ingreso relacionada para
Scalar es el diferencial opcional que ya describe [05](./05-negocio-precio-gtm.md)
("3,2% al box vs. 2,65% que cobra Wompi"), que es ingreso, no costo.

### 2.4 WhatsApp Business Cloud API (Meta)

| Categoría | Tarifa Colombia | Fuente |
|---|---|---|
| Utility | USD 0,0008/mensaje | [Ominiflow — WhatsApp API pricing Colombia](https://ominiflow.com/whatsapp-api-pricing/colombia), consultado 2026-09-25 |
| Authentication | USD 0,0008/mensaje | ídem |
| Marketing | USD 0,0125/mensaje | ídem |
| Service (dentro de la ventana de 24h) | Gratis | [Meta for Developers — WhatsApp pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing), consultado 2026-09-25 |

Meta cambió de facturación por conversación a **facturación por mensaje de plantilla
entregado** desde julio de 2025 (confirmado en la documentación oficial de Meta, consultada
2026-09-25) — el análisis de costo de [04-automatizaciones.md](./04-automatizaciones.md),
escrito con el modelo anterior, sigue siendo válido en magnitud porque las tarifas por
mensaje individual son del mismo orden que las tarifas por conversación que usaba.

**Estimación de volumen para un box de 100 atletas**, usando como base las 15 reglas de
fábrica de [04](./04-automatizaciones.md) (documento que sí existe en el repo, así que esto
no es una estimación a ciegas, es la aplicación de sus reglas a un box más pequeño):

```
Utility (aviso de vencimiento, cobro vencido, bienvenida, recordatorio de clase,
         cupo liberado, no-show, débito fallido, recibo)  ≈ 400 mensajes/mes × USD 0,0008 = USD 0,32
Marketing (atleta que dejó de venir, seguimiento de clase de prueba, cumpleaños) ≈ 33/mes × USD 0,0125 = USD 0,41
Authentication (código al celular del atleta, login)      ≈ 100/mes × USD 0,0008 = USD 0,08
                                                              TOTAL ≈ USD 0,81/mes ≈ $2.700 COP/mes
```

**Conclusión, igual que ya decía 04: WhatsApp no es un problema de costo** — ni con el
modelo de tarifas nuevo. El costo real que escala con el negocio es el soporte, no la
mensajería.

### 2.5 Dominio + correo transaccional

| Concepto | Costo | Fuente |
|---|---|---|
| Dominio .co | ~$55.000 COP primer año (con permanencia de 3 años en GoDaddy); rango general **$40.000–$300.000 COP/año** | [GoDaddy — precios de dominios Colombia](https://www.godaddy.com/resources/latam/desarrollo/como-comprar-dominio-web-colombia), consultado 2026-09-25 |
| Correo transaccional (Resend, ya en `package.json` como dependencia implícita del stack de Supabase/Vercel — **no está en `package.json` directamente, verificar si se usa Resend, SMTP de Supabase u otro proveedor**) | Plan gratis: 3.000 correos/mes, 100/día, 1 dominio | [Resend pricing 2026 (Flexprice)](https://flexprice.io/blog/detailed-resend-pricing-guide), consultado 2026-09-25 |
| Resend Pro (si se supera el gratis) | USD 20/mes por 50.000 correos → $66.000 COP/mes | ídem |

**No se encontró Resend ni ningún proveedor de correo transaccional listado en
`package.json`** (revisado 2026-09-25): el proyecto no declara una dependencia de correo
explícita en el frontend, lo cual es consistente con que el envío (recordatorios, recibos)
pasa por WhatsApp, no por correo, según el propio diseño de 04. El "reporte semanal por
correo" de la fase F6 del roadmap sí implica algún envío de correo — **ESTIMACIÓN**: con el
volumen de un negocio de pocos boxes (un correo semanal por dueño de box), el plan gratis de
Resend alcanza sin costo adicional durante mucho tiempo.

### 2.6 Respaldo de fotos a largo plazo (si Supabase Storage se llena)

| Proveedor | Precio | Fuente |
|---|---|---|
| Cloudflare R2 | USD 0,015/GB-mes almacenamiento, **egress gratis**, 10 GB gratis | [Cloudflare R2 pricing 2026](https://egresscost.com/cloudflare/), consultado 2026-09-25 |
| Backblaze B2 | USD 6,95/TB-mes (~USD 0,00695/GB-mes), egress gratis hasta 3x lo almacenado | [Backblaze B2 pricing 2026](https://comparebestai.com/articles/backblaze-b2-pricing), consultado 2026-09-25 |

Con el volumen estimado en §2.1 (20–50 MB/mes por box), **ningún box individual se acerca a
necesitar esto en años**. Es una previsión de largo plazo (agregando decenas de boxes
durante varios años), no un costo a modelar en los primeros 6 meses.

### 2.7 Efecto de la TRM

Los costos de Supabase (USD 25) y Vercel (USD 20) son **USD 45/mes en total** — el resto de
los costos (contador, facturación electrónica, dominio prorrateado) ya está en pesos y no
se mueve con el dólar.

| Escenario | TRM | Costo infra USD 45/mes en COP |
|---|---|---|
| TRM actual (referencia) | $3.300 | $148.500 COP/mes |
| TRM +15% | $3.795 | $170.775 COP/mes |
| **Diferencia** | — | **+$22.275 COP/mes** |

Un alza de TRM del 15% (que no es descabellada: la propia TRM subió de $3.208 a $3.330 en
tres días a finales de septiembre de 2026, según [15](./15-competencia-software.md))
**no cambia el punto de equilibrio de forma material**: es un aumento de ~2% sobre el costo
fijo total. El riesgo cambiario de este negocio es bajo porque la mayoría del costo (soporte
y contador) ya está en pesos.

### 2.8 Trámites y costos legales/administrativos en Colombia

| Concepto | Costo | Fuente |
|---|---|---|
| Matrícula mercantil persona natural (activos bajos) | Desde ~$24.220 + componente variable; rango observado **$48.400–$97.000 COP** según jurisdicción, con UVB 2026 = $12.110 | [Ámbito Jurídico — tarifas Cámaras de Comercio 2026](https://www.ambitojuridico.com/noticias/tributario/mercantil-propiedad-intelectual-y-arbitraje/estas-son-las-tarifas-de-las), consultado 2026-09-25 |
| RUT (registro nuevo) | Trámite en línea; formalización 1–3 días hábiles | [YoFacturo — cómo sacar el RUT 2026](https://yo-facturo.com/blog/como-sacar-el-rut-en-la-dian-paso-a-paso/), consultado 2026-09-25 |
| Cámara de comercio + NIT vía Ventanilla Única Empresarial (VUE) | Mismo día para SAS constituida en línea (convenio DIAN–Confecámaras); 1–5 días hábiles para persona jurídica sin cámara | [Colombiatramita — RUT 2026](https://colombiatramita.co/dian-impuestos/rut-dian/), consultado 2026-09-25 |
| Contador en Cali, empresa pequeña, contabilidad mensual estándar | **ESTIMACIÓN con rango amplio: $800.000–$1.200.000 COP/mes** para una pyme con IVA bimestral y sin nómina grande; Cali suele estar 15–25% por encima de ciudades intermedias | [SisteAcuse — honorarios servicios contables Colombia 2026](https://sisteacuse.com/blog/honorarios-servicios-contables-colombia-2026), consultado 2026-09-25 |
| Facturación electrónica DIAN (Alegra) | Desde $17.900 COP/mes (plan Emprendedor) hasta $179.900 COP/mes (plan Plus) | [Alegra — precios facturación electrónica Colombia](https://www.alegra.com/colombia/facturacion-electronica/precios/), consultado 2026-09-25 |
| Facturación electrónica DIAN (Siigo) | Desde $9.992 COP/mes (Facturación 24) | Resultado de búsqueda agregado, consultado 2026-09-25 — **no se verificó la página oficial de precios de Siigo directamente, confianza media** |
| Política de tratamiento de datos personales (Ley 1581 de 2012) | **ESTIMACIÓN, sin cifra de mercado verificable encontrada.** No se localizó un precio publicado de ningún despacho en Cali para este servicio específico. Con base en tarifas generales de servicios legales sencillos por documento, un rango razonado sería **$400.000–$1.500.000 COP** por única vez, pero **esto no está confirmado con ninguna fuente y debe cotizarse directamente con 2–3 abogados en Cali antes de presupuestarlo** | Sin fuente verificable — marcado explícitamente como no verificado |

**Nota sobre el rango del contador**: la cifra de $800.000–$1.200.000 COP/mes que arrojó la
búsqueda corresponde a una pyme ya operando con IVA bimestral. Un negocio que apenas
empieza, sin nómina, con pocas facturas al mes y régimen simple, **podría conseguir una
tarifa menor** (contador por horas o plan básico) — no se encontró una cifra específica para
ese caso más liviano, así que este documento modela **dos escenarios** (§3) para no ocultar
la incertidumbre.

**¿Se necesita persona jurídica o basta persona natural?** No se pudo confirmar con fuente
independiente si Scalar debe constituirse como SAS o si el dueño puede operar como persona
natural con actividad comercial (que es más barato y rápido). **ESTIMACIÓN**: dado que va a
facturar electrónicamente y a firmar contratos con boxes, lo más común en microempresas de
software en Colombia es empezar como persona natural con RUT y régimen simple, y evaluar
constituir SAS más adelante. Esto se debe confirmar con el contador antes de arrancar.

### 2.9 Costo de soporte humano

| Boxes | Horas/mes estimadas | Fuente / base |
|---|---|---|
| 1 | 1–2 h (dudas de arranque, capacitar coach nuevo) | [05-negocio-precio-gtm.md](./05-negocio-precio-gtm.md), cifra ya documentada en el repo |
| 5 | ~5–8 h (1–1,5 h/box promedio, cae por documentación y base de conocimiento) | **ESTIMACIÓN** razonada a partir de la meta de 05 ("<1h/box" como meta, ">3h/box" como alarma) |
| 20 | ~15–25 h (0,75–1,25 h/box promedio) | **ESTIMACIÓN**, misma base |

**Costo de oportunidad de esa hora**: 05 ya usa $60.000–80.000 COP/hora como valor de
referencia para el tiempo del dueño (que tiene otros trabajos, según el propio
[06-roadmap.md](./06-roadmap.md)). Este documento usa **$70.000 COP/hora** (punto medio) en
los cálculos de §3. **ESTIMACIÓN**, no hay tarifa de mercado dura para "hora de fundador de
un SaaS en Cali" — es un costo de oportunidad, no un precio de mercado.

---

## 3. Unit economics y punto de equilibrio

### 3.1 Costo fijo mensual (se paga exista o no un solo box)

| Concepto | Escenario A (contador barato) | Escenario B (contador de mercado) |
|---|---|---|
| Supabase Pro | $82.500 | $82.500 |
| Vercel Pro | $66.000 | $66.000 |
| Dominio (prorrateado, ~$150.000/año) | $12.500 | $12.500 |
| Facturación electrónica (Alegra Emprendedor) | $20.000 | $20.000 |
| Contador | **$500.000 (ESTIMACIÓN, tarifa básica)** | **$900.000 (punto medio del rango de mercado, §2.8)** |
| **Total fijo mensual** | **$681.000 COP** | **$1.081.000 COP** |

### 3.2 Costo variable por box/mes (tarifa objetivo, box de ~100–120 atletas)

| Concepto | 1 box | 3 boxes | 5 boxes | 10 boxes | 20 boxes |
|---|---|---|---|---|---|
| WhatsApp (§2.4) | $2.700 | $2.700 | $2.700 | $2.700 | $2.700 |
| Soporte (horas/box × $70.000, cae con la escala — §2.9) | $140.000 (2h) | $105.000 (1,5h) | $84.000 (1,2h) | $70.000 (1h) | $52.500 (0,75h) |
| **Costo variable por box** | **$142.700** | **$107.700** | **$86.700** | **$72.700** | **$55.200** |
| Ingreso por box (tarifa objetivo, $179.000) | $179.000 | $179.000 | $179.000 | $179.000 | $179.000 |
| **Margen de contribución por box** | **$36.300** | **$71.300** | **$92.300** | **$106.300** | **$123.800** |

### 3.3 Sensibilidad: 1, 3, 5, 10, 20 boxes (todos en tarifa objetivo)

| Boxes | Ingreso recurrente | Costo variable total | Contribución total | Costo fijo (Escenario A) | **Utilidad neta A** | Costo fijo (Escenario B) | **Utilidad neta B** |
|---|---|---|---|---|---|---|---|
| 1 | $179.000 | $142.700 | $36.300 | $681.000 | **-$644.700** | $1.081.000 | **-$1.044.700** |
| 3 | $537.000 | $323.100 | $213.900 | $681.000 | **-$467.100** | $1.081.000 | **-$867.100** |
| 5 | $895.000 | $433.500 | $461.500 | $681.000 | **-$219.500** | $1.081.000 | **-$619.500** |
| 10 | $1.790.000 | $727.000 | $1.063.000 | $681.000 | **+$382.000** | $1.081.000 | **-$18.000** |
| 20 | $3.580.000 | $1.104.000 | $2.476.000 | $681.000 | **+$1.795.000** | $1.081.000 | **+$1.395.000** |

**Punto de equilibrio**:
- **Escenario A (contador barato): ~7 boxes** pagando la tarifa objetivo cubren el costo fijo.
- **Escenario B (contador de mercado): ~11 boxes** — el mismo número que ya estimaba
  [05-negocio-precio-gtm.md](./05-negocio-precio-gtm.md) por un camino de cálculo distinto
  (soporte valorado directamente contra el precio, sin desglosar Supabase/Vercel/contador
  por separado). Que dos métodos de cálculo independientes lleguen al mismo número es una
  señal de que la cifra es razonablemente robusta.

Esta tabla **no incluye los ingresos de implementación** ($450.000 por box nuevo, una sola
vez) ni los boxes en tarifa de fundador (que se modelan aparte en §4, porque son
deficitarios por diseño mientras dura la promoción).

### 3.4 El precio de fundador, aparte

| Concepto | Valor |
|---|---|
| Ingreso mensual | $40.000 |
| Costo variable (soporte 1,5–2h + WhatsApp) | ~$107.700–$142.700 |
| **Margen de contribución** | **-$67.700 a -$102.700 COP/mes, por box, todos los meses durante 12 meses** |

Los $150.000 de entrada compensan parte de esto una sola vez, pero **no alcanzan a cubrir
12 meses de margen negativo** (12 × ~$85.000 promedio ≈ $1.020.000 de costo marginal
acumulado contra $150.000 de entrada). **Esto es correcto y esperado como estrategia de
adquisición** (testimonios, casos de estudio, referidos, como ya justifica
[05](./05-negocio-precio-gtm.md)), pero el dueño debe presupuestarlo como una **inversión de
marketing con salida de caja real**, no como ingresos que ayudan a pagar la operación.

---

## 4. Flujo de caja de los primeros 6 meses

Supuestos del escenario modelado (razonables dado el estado del producto — ya construido y
verificado según [06-roadmap.md](./06-roadmap.md) — y el plan de ventas de
[05](./05-negocio-precio-gtm.md) "vender a 3 boxes a precio de fundador" antes de subir a
tarifa objetivo):

- **Mes 0**: trámites (RUT, cámara de comercio, contador contratado, facturación
  electrónica activada, cuenta Wompi en revisión). Sin ingresos.
- **Meses 1–3**: se cierra un box fundador por mes (3 en total), cada uno paga $150.000 de
  entrada + $40.000/mes desde el mes de la firma.
- **Meses 4–5**: se cierra un box en tarifa objetivo por mes (implementación $450.000 +
  $179.000/mes), mientras los 3 fundadores siguen pagando $40.000/mes cada uno.
- **Mes 6**: sin cliente nuevo, se cobra lo recurrente de los 5 boxes activos.
- Costo fijo mensual: Escenario B ($1.081.000 COP/mes, el más realista para presupuestar,
  aunque §3 muestra que A es posible si el contador sale más barato).
- Wompi cobra comisión al box sobre sus propios recaudos, no a Scalar (§2.3): no entra en
  este flujo.
- No se modela el pago anual con 2 meses gratis (ninguno de los primeros clientes lo pediría
  en el mes 1 de prueba del producto).

| Mes | Ingresos | Detalle ingresos | Egresos | Detalle egresos | Neto del mes | **Caja acumulada** |
|---|---|---|---|---|---|---|
| 0 | $0 | — | $1.156.000 | Contador $900.000 + Supabase $82.500 + Vercel $66.000 + dominio $12.500 + facturación electrónica $20.000 + cámara de comercio/RUT ~$75.000 (única vez) | **-$1.156.000** | **-$1.156.000** |
| 1 | $190.000 | Box 1 fundador: $150.000 entrada + $40.000 mensualidad | $1.083.700 | Fijo $1.081.000 + WhatsApp box 1 $2.700 | **-$893.700** | **-$2.049.700** |
| 2 | $230.000 | Box 1 mensualidad $40.000 + Box 2 fundador $150.000+$40.000 | $1.086.400 | Fijo + WhatsApp 2 boxes $5.400 | **-$856.400** | **-$2.906.100** |
| 3 | $270.000 | Box 1+2 mensualidad $80.000 + Box 3 fundador $150.000+$40.000 | $1.089.100 | Fijo + WhatsApp 3 boxes $8.100 | **-$819.100** | **-$3.725.200** |
| 4 | $749.000 | Box 1-3 mensualidad $120.000 + Box 4 objetivo: $450.000 implementación + $179.000 | $1.092.500 | Fijo + WhatsApp 4 boxes $11.500 | **-$343.500** | **-$4.068.700** |
| 5 | $928.000 | Box 1-3 mensualidad $120.000 + Box 4 mensualidad $179.000 + Box 5 objetivo: $450.000+$179.000 | $1.095.200 | Fijo + WhatsApp 5 boxes $14.200 | **-$167.200** | **-$4.235.900** |
| 6 | $478.000 | Box 1-3 mensualidad $120.000 + Box 4-5 mensualidad $358.000 | $1.096.600 | Fijo + WhatsApp 5 boxes $15.600 | **-$618.600** | **-$4.854.500** |

**Lectura del flujo**: con este ritmo de ventas (3 fundadores + 2 objetivo en 6 meses, que
ya es una ejecución razonablemente buena para un vendedor solo), **el negocio sigue en rojo
al cierre del mes 6**, acumulando cerca de **$4,85 millones COP** que el dueño debe poner de
su bolsillo (o financiar de otra forma) antes de que la operación misma genere caja
positiva. El mes 4–5 es el punto de inflexión: los meses individuales dejan de perder tanto
en cuanto entran clientes en tarifa objetivo con su implementación, pero **hace falta
superar el umbral de ~10-11 boxes en tarifa objetivo (§3.3) para que el mes individual sea
positivo**, y a este ritmo de ventas eso no ocurre dentro de los primeros 6 meses.

**Nota sobre timing de Wompi**: aunque la comisión de Wompi no es costo de Scalar, si en
algún momento Scalar decide cobrar sus propias mensualidades por el mismo riel (Wompi) en
vez de transferencia manual, el desembolso al día hábil siguiente (§2.3) hace que el efecto
en caja de ese cambio sea mínimo — no es un cuello de botella para el flujo de Scalar mismo.

---

## 5. Trámites y tiempos para poder facturar

| # | Trámite | Tiempo típico | Fuente |
|---|---|---|---|
| 1 | RUT (registro nuevo ante la DIAN) | 1–3 días hábiles | [YoFacturo 2026](https://yo-facturo.com/blog/como-sacar-el-rut-en-la-dian-paso-a-paso/), consultado 2026-09-25 |
| 2 | Matrícula mercantil / cámara de comercio | Mismo día (SAS por VUE) a 1–5 días hábiles (persona jurídica sin cámara) | [Colombiatramita 2026](https://colombiatramita.co/dian-impuestos/rut-dian/), consultado 2026-09-25 |
| 3 | Cuenta bancaria de desembolso (Bancolombia, requisito de Wompi) | No verificado con fuente — depende del banco; **ESTIMACIÓN: 1–5 días hábiles** si ya se tiene RUT y cámara de comercio | Sin fuente directa |
| 4 | Cuenta de comercio Wompi (aprobación) | 1–3 días hábiles **después** de radicar documentos completos (que a su vez requieren 1–3) | [Auge Digital 2026](https://augedigital.co/guias/abrir-cuenta-wompi/), consultado 2026-09-25 |
| 5 | Software de facturación electrónica (Alegra/Siigo, alta y habilitación DIAN) | No se encontró tiempo específico; **ESTIMACIÓN: 1–3 días hábiles**, es un proceso mayormente automatizado por el proveedor | Sin fuente directa con tiempo exacto |
| 6 | Contratar contador | Depende de disponibilidad del contador — no es un trámite con tiempo fijo | — |
| 7 | Política de tratamiento de datos (Ley 1581) | No verificado; depende del abogado contratado | — |

**Ruta crítica realista**: los pasos 1 y 2 pueden hacerse en paralelo o casi (RUT primero,
cámara de comercio casi al mismo tiempo si es persona natural), pero el paso 4 (Wompi) **no
puede empezar hasta tener RUT y cámara de comercio en mano**, y el paso 3 (cuenta bancaria)
tampoco. Sumando la coordinación real (reunir documentos, que el banco confirme la cuenta,
que Wompi revise) — **no la suma optimista de los mínimos de cada trámite** — el tiempo
realista antes de poder cobrarle a un cliente real por Wompi es de **2 a 3 semanas**. Antes
de eso, técnicamente se puede vender con pago manual (transferencia, efectivo con foto de
comprobante, que ya funciona según [10-wompi.md](./10-wompi.md) F1), así que **la venta no
tiene que esperar los 2-3 semanas de Wompi**, pero el diferenciador principal del producto
("paga por Nequi sin que tú escribas un mensaje") sí.

---

## 6. Recomendación final

**No cambiar el precio de la tarifa objetivo ($179.000/mes + $450.000 implementación).**
Esta investigación no encuentra un argumento nuevo para subirlo o bajarlo: sigue cayendo en
la mitad baja de la franja competitiva ([15](./15-competencia-software.md)) y el margen de
contribución por box ($90.000–$120.000/mes) es sano una vez superado el punto de equilibrio.

**Lo que sí hay que ajustar, en orden de impacto:**

1. **Cotizar el contador con 2–3 firmas en Cali antes de presupuestar nada más.** Es la
   variable individual que más mueve el punto de equilibrio (7 vs. 11 boxes) y la que este
   documento pudo verificar con menos precisión (rango de $400.000 a $1.200.000 COP/mes).
   Preguntar explícitamente por un plan básico para una microempresa sin nómina y con pocas
   facturas, no la tarifa estándar de pyme con IVA bimestral que arrojó la búsqueda general.

2. **Presupuestar los primeros ~5 millones de pesos como inversión, no como capital de
   trabajo que se recupera rápido.** El flujo de caja de §4 muestra que, incluso con una
   ejecución de ventas razonablemente buena, el negocio sigue en rojo acumulado al mes 6.
   El dueño necesita tener ese colchón disponible (ahorros, otro ingreso, o crédito) antes
   de arrancar, no asumir que la primera venta lo resuelve.

3. **Limitar el precio de fundador a lo que ya dice 05 — 3 a 5 clientes, con fecha de
   vencimiento explícita en el contrato — y no extenderlo "porque están felices".** Cada mes
   adicional de un cliente en $40.000 es, con los números de este documento, un mes que
   cuesta más de lo que paga.

4. **Vender implementación desde el cliente 4, no solo desde el 6 como sugiere el rango de
   "4–6" en [05](./05-negocio-precio-gtm.md).** El flujo de caja de §4 muestra que el
   ingreso de $450.000 por implementación es lo único que revierte meses individuales de
   pérdida — subir a tarifa objetivo un mes antes tiene un efecto de caja directo y medible.

5. **No hay que recortar WhatsApp ni Wompi**: ninguno de los dos es un costo relevante
   (~$2.700/mes y a cargo del box, respectivamente). El costo real que hay que gestionar es
   el soporte (§2.9) — la base de conocimiento y el modo simulación que ya exige
   [05](./05-negocio-precio-gtm.md) no son un "nice to have", son lo que hace que el margen
   de contribución por box crezca de $36.000 a $124.000 al pasar de 1 a 20 boxes (§3.2).

---

## 7. Fuentes

- [Supabase — Pricing & Fees](https://supabase.com/pricing) — consultado 2026-09-25
- [Vercel — Pricing](https://vercel.com/pricing) — consultado 2026-09-25
- [Wompi — Planes y tarifas](https://soporte.wompi.co/hc/es-419/articles/360020957133--Cu%C3%A1les-son-los-planes-y-tarifas-que-maneja-la-plataforma-Wompi) — consultado 2026-09-25
- [Wompi — Cuánto cuesta tener una pasarela de pagos](https://wompi.com/es/co/aprende-con-wompi/blog/cuanto-cuesta-tener-pasarela) — consultado 2026-09-25
- [Auge Digital Solutions — Cómo abrir tu cuenta Wompi paso a paso (2026)](https://augedigital.co/guias/abrir-cuenta-wompi/) — consultado 2026-09-25
- [Meta for Developers — Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) — consultado 2026-09-25
- [Ominiflow — Colombia WhatsApp API Pricing 2026](https://ominiflow.com/whatsapp-api-pricing/colombia) — consultado 2026-09-25
- [Flexprice — Resend Pricing 2026](https://flexprice.io/blog/detailed-resend-pricing-guide) — consultado 2026-09-25
- [EgressCost — Cloudflare R2 Pricing 2026](https://egresscost.com/cloudflare/) — consultado 2026-09-25
- [ComparebestAI — Backblaze B2 Pricing 2026](https://comparebestai.com/articles/backblaze-b2-pricing) — consultado 2026-09-25
- [GoDaddy — Cómo comprar un dominio web en Colombia](https://www.godaddy.com/resources/latam/desarrollo/como-comprar-dominio-web-colombia) — consultado 2026-09-25
- [Ámbito Jurídico — Tarifas de las cámaras de comercio para el 2026](https://www.ambitojuridico.com/noticias/tributario/mercantil-propiedad-intelectual-y-arbitraje/estas-son-las-tarifas-de-las) — consultado 2026-09-25
- [YoFacturo — Cómo sacar el RUT en la DIAN paso a paso 2026](https://yo-facturo.com/blog/como-sacar-el-rut-en-la-dian-paso-a-paso/) — consultado 2026-09-25
- [Colombiatramita — RUT DIAN 2026](https://colombiatramita.co/dian-impuestos/rut-dian/) — consultado 2026-09-25
- [SisteAcuse — Honorarios servicios contables Colombia 2026](https://sisteacuse.com/blog/honorarios-servicios-contables-colombia-2026) — consultado 2026-09-25
- [Alegra — Precio de facturación electrónica Colombia](https://www.alegra.com/colombia/facturacion-electronica/precios/) — consultado 2026-09-25
- [docs/05-negocio-precio-gtm.md](./05-negocio-precio-gtm.md), [docs/06-roadmap.md](./06-roadmap.md), [docs/10-wompi.md](./10-wompi.md), [docs/12-debito-recurrente.md](./12-debito-recurrente.md), [docs/11-operacion.md](./11-operacion.md), [docs/14-auditoria-2026-09-24.md](./14-auditoria-2026-09-24.md), [docs/15-competencia-software.md](./15-competencia-software.md), [docs/04-automatizaciones.md](./04-automatizaciones.md) — documentos internos del repo, leídos completos el 2026-09-25

---

## 8. Lo que no se pudo verificar

- **Precio exacto de un contador en Cali para una microempresa recién constituida, sin
  nómina y con pocas facturas.** Solo se encontró el rango general de pyme pequeña
  ($800.000–$1.200.000/mes). Esto es la mayor fuente de incertidumbre de todo el documento
  y cambia el punto de equilibrio entre 7 y 11 boxes.
- **Costo de un abogado en Cali para redactar la política de tratamiento de datos (Ley
  1581).** No se encontró ninguna cifra de mercado publicada; el rango de $400.000–
  $1.500.000 COP usado en §2.8 es una estimación razonada sin respaldo de fuente, marcada
  como tal.
- **Si el proyecto necesita constituirse como SAS o puede operar como persona natural con
  RUT y régimen simple.** Afecta directamente el costo y tiempo de la cámara de comercio.
- **Tiempo real de apertura de la cuenta bancaria de desembolso** que exige Wompi — no se
  encontró un tiempo típico documentado.
- **Precio oficial de Siigo Facturación 24** ($9.992 COP/mes citado) — viene de un resultado
  agregado, no se verificó contra la página oficial de precios de Siigo directamente.
- **Si el proyecto usa o usará Resend** para correo transaccional — no aparece como
  dependencia en `package.json`; se asume que el "reporte semanal por correo" de la fase F6
  del roadmap usará algún proveedor, pero cuál no está decidido en el repo.
- **Carga real de Supabase/Vercel con boxes reales operando** — todas las estimaciones de
  cuándo se necesita subir de plan (Micro→Small, límites de Vercel) son ESTIMACIÓN, porque
  ningún box real ha operado en producción todavía (confirmado por
  [06-roadmap.md](./06-roadmap.md) y [14-auditoria-2026-09-24.md](./14-auditoria-2026-09-24.md):
  ni una transacción de Wompi, ni sandbox, ha corrido contra el código real).
- **Política de reintentos y tiempos de desembolso exactos de Wompi** — ya estaban marcados
  como sin verificar en [10-wompi.md](./10-wompi.md) y [12-debito-recurrente.md](./12-debito-recurrente.md);
  este documento mejora el dato de desembolso (día hábil siguiente, máximo 5 días) pero no
  lo confirma con la fuente oficial de Wompi, solo con un blog propio de Wompi.
