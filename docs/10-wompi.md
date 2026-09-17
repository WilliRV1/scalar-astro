# 10 — Cobro en línea con Wompi

Este documento es el **runbook** de la integración de pagos: qué hay que abrir, qué
secretos configurar, cómo probar y —sobre todo— **qué está sin verificar**.

> **Estado: implementado y probado contra la base de datos; SIN probar contra Wompi.**
> No hubo credenciales durante el desarrollo, así que ninguna transacción real ni de
> sandbox pasó por este código. La sección [Qué queda por verificar](#qué-queda-por-verificar)
> lista, una por una, las cosas que hay que confirmar antes de cobrarle a alguien.

## Por qué importa

De los productos que compiten en Cali, **solo WodBuster integra una pasarela colombiana**
([08 §5](./08-mercado-cali.md)). Los demás cobran con Stripe o Mercado Pago, o no cobran en
línea. Que el atleta pague con **Nequi** desde el WhatsApp que le llegó, sin instalar nada,
es el hueco estructural del mercado. Esto es lo que lo cierra.

---

## 1. Qué hay que conseguir

| Qué | Dónde | Notas |
|---|---|---|
| Cuenta de comercio Wompi | [comercios.wompi.co](https://comercios.wompi.co) | Wompi es del Grupo Bancolombia. El registro es en línea. |
| Cuenta de desembolso | Bancolombia o Nequi | Es a donde Wompi gira la plata recaudada. |
| RUT y cámara de comercio | — | Documentación estándar de alta de comercio. |
| Llaves de sandbox | Panel de Wompi | Salen de inmediato al registrarse, sin esperar aprobación. |
| Llaves de producción | Panel de Wompi | Requieren que el comercio esté aprobado. |

### La decisión que hay que tomar antes de salir a producción

**Hoy la integración usa UNA sola cuenta de Wompi para todos los boxes**: las llaves se leen
de variables de entorno de la función, no de la base. Eso significa que **la plata de todos
los boxes cae en la misma cuenta de comercio** y hay que repartirla después.

Las dos salidas posibles:

- **Cada box con su propia cuenta de Wompi** (recomendado, y lo que hace WodBuster). La plata
  le llega directo al box y nosotros no tocamos dinero ajeno —lo que además nos saca de encima
  buena parte del problema regulatorio, ver [07](./07-legal-colombia.md). Requiere mover las
  llaves a una tabla por organización (cifradas) y que `create-payment-link` las lea de ahí.
  **No está hecho.**
- **Cuenta única nuestra** con reparto posterior. Más simple de arrancar, pero implica recibir
  plata a nombre de terceros. Consultar antes con el contador y con Wompi.

`payment_intents.org_id` y la referencia con el box adentro ya dejan la trazabilidad lista para
cualquiera de las dos.

---

## 2. Secretos y configuración

Se cargan con la CLI (no se re-despliega después: quedan disponibles al instante):

```bash
supabase secrets set --env-file supabase/functions/.env.wompi
# o uno por uno
supabase secrets set WOMPI_PUBLIC_KEY=pub_test_xxxxx
supabase secrets list
```

| Variable | Obligatoria | Para qué |
|---|---|---|
| `WOMPI_PUBLIC_KEY` | sí | Identifica el comercio en el enlace de checkout. `pub_test_…` o `pub_prod_…` |
| `WOMPI_INTEGRITY_SECRET` | sí | Firma el enlace: sin ella cualquiera podría alterar el monto en la URL |
| `WOMPI_EVENTS_SECRET` | sí (webhook) | Verifica la firma de los eventos entrantes |
| `WOMPI_PRIVATE_KEY` | todavía no | Consultar una transacción por API (`GET /v1/transactions/{id}`). Reservada para la conciliación de respaldo, que **no está implementada** |
| `WOMPI_ENVIRONMENT` | recomendada | `test` o `prod`. Si está, el webhook rechaza eventos del otro ambiente |
| `WOMPI_REDIRECT_URL` | opcional | A dónde vuelve el atleta al terminar. Solo del entorno, nunca del cliente: aceptarla por parámetro sería un redirector abierto |
| `WOMPI_LINK_TTL_MINUTES` | opcional | Vigencia del enlace. Por defecto 4320 (72 h) |
| `SITIO_PERMITIDO` | recomendada | Origen del panel, para acotar el CORS de `create-payment-link`. Sin ella queda en `*` |

**Nunca** en el código, nunca en `src/`, nunca en un commit. `WOMPI_PUBLIC_KEY` es pública por
diseño (viaja en la URL del checkout); las otras tres **no salen jamás del servidor**.

Supabase ya inyecta solo `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, que
es lo que usan las funciones. *(Verificar: Supabase está migrando a `SUPABASE_PUBLISHABLE_KEYS`
y `SUPABASE_SECRET_KEYS`; las anteriores siguen inyectándose como heredadas.)*

### Lo que falta en `supabase/config.toml`

**Pendiente de integración, no está hecho** (ese archivo quedó fuera de esta entrega):

```toml
# Wompi no manda JWT: la autorización del webhook es la firma del evento.
[functions.wompi-webhook]
verify_jwt = false

# Esta sí exige sesión: el JWT decide, vía RLS, quién puede pedir el enlace.
[functions.create-payment-link]
verify_jwt = true
```

Sin `verify_jwt = false`, la plataforma rechaza los eventos de Wompi antes de que la función
los vea y **ningún pago se concilia**. Es el error de configuración más probable de todos.

---

## 3. Cómo funciona

```
El box (o el propio atleta) pide el enlace de una factura
  │
  ├─ create-payment-link
  │    1. lee la factura CON LA LLAVE DEL USUARIO -> RLS decide si puede
  │    2. open_payment_intent() calcula el saldo en la BASE (nunca el cliente)
  │    3. arma la referencia  SCL-<box>-<factura>-<aleatorio>
  │    4. firma la integridad  SHA256(ref + monto + moneda + expiración + secreto)
  │    5. devuelve el enlace de checkout.wompi.co y guarda el payment_intent
  │
  ├─ el atleta paga con Nequi / PSE / tarjeta / Daviplata / corresponsal
  │
  └─ wompi-webhook
       1. VERIFICA signature.checksum  -> si no cuadra: 401 y no se toca nada
       2. apply_wompi_payment()
            · webhook_events (provider, event_id) -> el evento no se procesa dos veces
            · payments (provider, provider_ref)   -> la transacción no se paga dos veces
            · inserta en payments y NADA MÁS
       3. el trigger payments_recalc_invoice concilia el saldo y el estado
```

**El saldo de la factura no se toca a mano en ningún punto.** Lo recalcula el trigger de la
migración 0003, igual que cuando el pago se registra en efectivo desde el panel. Un solo lugar
decide si una factura queda en `paid`, `partial` u `open`
([04 · Conciliación con los pagos](./04-automatizaciones.md)).

### Idempotencia: por qué hay dos candados

Wompi **reintenta** la entrega del evento hasta recibir un 200. Un pago registrado dos veces
deja la factura con saldo a favor y al box llamando a soporte.

1. `webhook_events (provider, event_id)` — la misma entrega no se procesa dos veces.
   Como **el evento de Wompi no trae identificador propio** (su cuerpo es `event`, `data`,
   `environment`, `signature`, `timestamp`, `sent_at`), se usa `signature.checksum` como
   identificador: es determinista sobre los valores firmados, el timestamp y el secreto.
2. `payments (provider, provider_ref)` — la misma transacción de Wompi no se paga dos veces,
   **aunque llegue dentro de un evento distinto**. Este es el candado que de verdad cuenta,
   porque el primero se apoya en un identificador derivado.

Ambos están probados en `supabase/tests/wompi.sql`.

### Códigos de respuesta del webhook (y por qué)

| Código | Cuándo | Efecto en Wompi |
|---|---|---|
| 200 | procesado, ya procesado, o evento que no nos interesa | deja de reintentar |
| 401 | firma inválida o ambiente equivocado | no reintenta: es basura |
| 400 | cuerpo ilegible o transacción incompleta | no reintenta |
| 500 | falló la base de datos | **que reintente** — un pago aprobado sin registrar es plata del box que su sistema no muestra |

---

## 4. Probar en sandbox

Sin credenciales solo se puede probar la mitad; con llaves de sandbox se prueba todo.

### Sin credenciales (lo que ya corre hoy)

```bash
# 1 · La base: idempotencia, conciliación, aislamiento entre boxes
./scripts/db-test.sh          # o el arranque manual de Postgres 16 + supabase/tests/wompi.sql

# 2 · Las firmas y el armado del enlace (sin red, sin secretos)
deno run supabase/functions/_shared/wompi_pruebas.ts
# también corre con:  node --experimental-strip-types supabase/functions/_shared/wompi_pruebas.ts
```

### Con llaves de sandbox

1. Cargar las llaves `pub_test_…`, `test_integrity_…`, `test_events_…` y `WOMPI_ENVIRONMENT=test`.
2. Desplegar: `supabase functions deploy create-payment-link wompi-webhook`.
3. Registrar la URL del webhook en el panel de Wompi:
   `https://<ref-del-proyecto>.supabase.co/functions/v1/wompi-webhook`
4. Pedir un enlace:
   ```bash
   curl -X POST https://<ref>.supabase.co/functions/v1/create-payment-link \
     -H "Authorization: Bearer <JWT del usuario>" \
     -H "Content-Type: application/json" \
     -d '{"invoice_id":"<uuid de una factura abierta>"}'
   ```
5. Abrir el `checkout_url` y pagar con los datos de prueba del sandbox de Wompi
   (tarjetas y flujos de prueba: `docs.wompi.co` → *Ambiente de pruebas*).
6. Comprobar en la base:
   ```sql
   select status, result, processed_at from public.webhook_events order by received_at desc limit 5;
   select status, paid_cents, amount_cents from public.invoices where id = '<uuid>';
   select method, amount_cents, provider_ref from public.payments where provider = 'wompi';
   ```
7. **Reenviar el mismo evento desde el panel de Wompi** y confirmar que sigue habiendo un solo
   pago. Esta prueba es la que importa.

---

## 5. Métodos de pago que quedan habilitados

El Checkout Web ofrece los que el comercio tenga activos en su panel de Wompi; no se eligen
desde este código. Los que traduce `apply_wompi_payment` a `payments.method`:

| Wompi (`payment_method_type`) | Nuestro `method` | Comentario |
|---|---|---|
| `CARD` | `card` | Visa, Mastercard, Amex |
| `NEQUI` | `nequi` | **El diferenciador.** Ningún competidor local lo tiene |
| `PSE` | `pse` | Débito desde cuenta bancaria |
| `DAVIPLATA` | `daviplata` | |
| `BANCOLOMBIA_TRANSFER` | `transfer` | Botón Bancolombia |
| `BANCOLOMBIA_QR` | `transfer` | |
| `BANCOLOMBIA_COLLECT` | `cash` | **Corresponsal bancario**: el atleta paga en efectivo en una tienda |
| cualquier otro | `other` | `PCOL`, `BANCOLOMBIA_BNPL`, `SU_PLUS`… se registran sin perder el pago |

Fuente: [docs.wompi.co · Métodos de pago](https://docs.wompi.co/docs/colombia/metodos-de-pago/).

> Lo de `BANCOLOMBIA_COLLECT` no es un detalle: en un box de barrio hay atletas sin tarjeta y
> sin cuenta. Pagar en efectivo en la tienda de la esquina y que la mensualidad se salde sola
> es justo lo que hoy se hace a mano con una foto del recibo por WhatsApp.

---

## 6. Tarifa vigente

Del centro de ayuda oficial de Wompi
([soporte.wompi.co](https://soporte.wompi.co/hc/es-419/articles/360020957133--Cu%C3%A1les-son-los-planes-y-tarifas-que-maneja-la-plataforma-Wompi)),
consultado el 2026-09-17:

| Plan | Tarifa |
|---|---|
| **Avanzado (agregador)** | **2,65 % + $700 + IVA** por transacción aprobada |
| Avanzado · Puntos Colombia (`PCOL`) | 4,43 % + $700 + IVA |
| **Gateway** | Sin costo de Wompi; se negocian las tarifas directamente con cada medio de pago a través del gerente de cuenta de Bancolombia |

Sobre una mensualidad de **$180.000**: 2,65 % = $4.770, más $700 = $5.470, más IVA (19 %) sobre
la comisión = **$6.509 aprox.**, o sea **~3,6 % del cobro**. Es un costo del box, no nuestro,
pero hay que decírselo de frente en la demo: **quien no cobre en línea no paga nada**, y esa
comparación va a salir.

**Verificar:** la tarifa cambia, y el plan Gateway depende de lo que negocie cada box con
Bancolombia. Confirmar la cifra vigente al abrir la cuenta y antes de ponerla en material
comercial. Los tiempos de desembolso (se menciona "día hábil siguiente" en fuentes de terceros)
**no se pudieron confirmar en documentación oficial**: preguntarlos al abrir la cuenta.

---

## Qué queda por verificar

Nada de esta lista se pudo comprobar: no hubo credenciales de Wompi durante el desarrollo. Está
marcado como `VERIFICAR` también en el código, junto a la línea que corresponde.

1. **Que Wompi acepte nuestra firma de integridad.** El orden documentado
   (`referencia + monto + moneda + [expiración] + secreto`, SHA-256) está implementado tal cual
   y probado contra vectores propios, pero solo un checkout real lo confirma.
   → `supabase/functions/_shared/wompi.ts`, `cadenaDeIntegridad`.
2. **Que nuestra verificación de la firma del evento acepte un evento real.** Aquí hay un
   problema concreto: **el ejemplo publicado por Wompi no es reproducible.** La página de
   [Eventos](https://docs.wompi.co/docs/colombia/eventos/) construye la cadena
   `1234-1610641025-49201APPROVED44900001530291411prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z`
   y afirma que su SHA-256 es `3476DDA5…`; el SHA-256 real de esa cadena es `5A18EC5E…`.
   Se probaron además el orden invertido, con separadores, sin el timestamp y HMAC: ninguno
   coincide. **El ejemplo de la documentación está desactualizado o el secreto que muestra no
   es el que usaron.** Se implementaron los pasos tal como están descritos, que es lo único
   sensato, pero **esto hay que confirmarlo con el primer evento de sandbox**, y es lo primero
   que hay que mirar si el webhook devuelve 401 con llaves buenas.
   → `supabase/functions/_shared/wompi.ts`, `verificarFirmaDeEvento`.
3. **Mayúsculas/minúsculas del checksum.** Wompi lo publica en mayúsculas; comparamos sin
   distinguir, así que por este lado no debería haber sorpresa.
4. **Formato de `customer-data:phone-number`.** La documentación no dice si espera el indicativo
   (`+573001234567`) o los diez dígitos. **Por eso hoy no se manda el teléfono**, solo correo y
   nombre. Prellenarlo le ahorraría un paso al atleta que paga con Nequi: vale la pena
   confirmarlo. → `armarEnlaceDeCheckout`.
5. **`redirect-url` con cadena de consulta.** Wompi le agrega `?id=<transacción>` al volver. No
   está documentado qué pasa si la URL ya trae parámetros. Mantener `WOMPI_REDIRECT_URL` sin
   cadena de consulta hasta comprobarlo.
6. **`expiration-time`.** Se manda en ISO 8601 UTC con milisegundos (`2026-09-20T15:00:00.000Z`),
   que es el formato del ejemplo oficial, y se incluye en la firma. Falta ver el comportamiento
   real cuando el enlace vence.
7. **Nombres de `signature.properties`.** El código **no los asume**: los lee de cada evento,
   como la propia documentación exige. No hay nada que verificar aquí, pero sí que recordar: no
   fijarlos nunca.
8. **Qué eventos manda Wompi además de `transaction.updated`.** Hoy se ignoran con 200 todos los
   que no empiecen por `transaction.`. Revisar en el panel qué más llega.
9. **Reintentos: cuántos y cada cuánto.** No se encontró la política documentada. Importa para
   saber cuánto tiempo tenemos para arreglar una caída antes de perder un evento.
10. **Tarifa y tiempos de desembolso** (sección anterior).

## Qué NO hace todavía

- **Débito recurrente.** Hoy cada mes se manda un enlace nuevo. El cobro automático con fuente
  de pago tokenizada (`payment_sources`) es lo que tienen todos los competidores y está
  pendiente. Requiere `WOMPI_PRIVATE_KEY` y la API de transacciones.
- **Conciliación de respaldo.** Si un evento se pierde, hoy nadie lo detecta. Falta un job que
  consulte por API las transacciones de los `payment_intents` que llevan horas en `pending`
  (`GET /v1/transactions/{id}`, con llave privada).
- **Llaves por box** (ver la decisión de la sección 1).
- **Devoluciones.** `payments.status` ya contempla `refunded`, pero nada lo escribe.
- **Cancelar los mensajes de cobro encolados** cuando entra el pago. Está descrito en
  [04](./04-automatizaciones.md) como crítico —"cobrarle a alguien que ya pagó"— y es del motor
  de automatizaciones, no de este módulo, pero se dispara desde aquí.

## Archivos

| Archivo | Qué contiene |
|---|---|
| `supabase/migrations/20260917120000_payments_wompi.sql` | `payment_intents`, `webhook_events`, `open_payment_intent`, `apply_wompi_payment`, RLS |
| `supabase/functions/_shared/wompi.ts` | Firmas, verificación del evento, armado del enlace, referencia |
| `supabase/functions/_shared/wompi_pruebas.ts` | Pruebas de lo anterior, sin red ni credenciales |
| `supabase/functions/_shared/{env,http,supabase}.ts` | Secretos, respuestas/CORS, clientes de Supabase |
| `supabase/functions/create-payment-link/index.ts` | Genera el enlace |
| `supabase/functions/wompi-webhook/index.ts` | Recibe y verifica el evento |
| `supabase/tests/wompi.sql` | Idempotencia, saldo, parcial, rechazo, aislamiento, referencia única |
