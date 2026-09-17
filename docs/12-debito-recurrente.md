# 12 — Débito recurrente (tokenización y cobro automático)

Este documento es el **runbook** del cobro automático: qué hay que activar en la cuenta de
Wompi, qué secretos configurar, cómo se prueba en sandbox y —sobre todo— **qué quedó sin
verificar y por qué**.

> **Estado: implementado y probado contra la base de datos; SIN probar contra Wompi.**
> No hubo credenciales durante el desarrollo. **Ninguna línea de este código ha hablado nunca
> con Wompi**: ni una tokenización, ni una fuente de pago, ni un cobro, ni en sandbox. Lo que
> sí está probado, y con qué, está en [Qué se probó de verdad](#qué-se-probó-de-verdad). Lo
> que no, está en [Qué queda por verificar](#qué-queda-por-verificar), una línea por supuesto.

## Por qué esto es el producto

De todo lo que se compara en [08 §5.2](./08-mercado-cali.md), **ningún competidor con venta
local en Colombia tiene débito automático sobre Nequi**: Trainingym solo mueve tarjetas (vía
Movii, sin PSE y sin Nequi), Fitco cobra con Stripe y Mercado Pago, Boxmagic ni siquiera vende
aquí, y WodBuster —el único que integra Wompi— es un producto español sin presencia comercial
en Cali.

El pitch de una frase ([08 §7.3](./08-mercado-cali.md)):

> *"Tus atletas pagan por Nequi el día 1 sin que tú escribas un solo mensaje."*

Lo que mata la morosidad no es un recordatorio más bonito: es que el cobro **no dependa de que
alguien se acuerde**.

---

## 1. Qué hay que activar en la cuenta de Wompi

Esto va **además** de lo de [10 §1](./10-wompi.md), que sigue aplicando entero (cuenta de
comercio, cuenta de desembolso, RUT, llaves).

| Qué | Dónde | Notas |
|---|---|---|
| **Llave privada** (`prv_test_…` / `prv_prod_…`) | Panel de Wompi | Hasta ahora no hacía falta: el enlace de pago solo usa la pública. El cobro recurrente **no funciona sin ella**. No sale jamás del servidor. |
| **Fuentes de pago habilitadas** | Soporte / gerente de cuenta de Wompi | Crear `payment_sources` y cobrar contra ellas puede requerir habilitación explícita del comercio. **Preguntarlo al abrir la cuenta**, no el día del lanzamiento. |
| **Nequi como método activo** | Panel de Wompi | Si Nequi no está activo en el comercio, la tokenización de Nequi no sirve para nada. |
| **Suscripciones / COF en Nequi** | Bancolombia–Nequi | El flujo de Nequi exige que el usuario **acepte la suscripción en su app**. Confirmar que el comercio lo tiene habilitado. |
| Webhook ya registrado | Panel de Wompi | El mismo de [10](./10-wompi.md). El cobro recurrente **no necesita otro**: concilia por la misma ruta. |

> **Antes de cobrarle a alguien de verdad**, léase la decisión pendiente de
> [10 §1](./10-wompi.md): hoy hay **una sola cuenta de Wompi para todos los boxes**. Con débito
> automático eso pesa más, no menos: es plata que entra sola, todos los meses, a una cuenta que
> no es la del box.

---

## 2. Secretos

Se cargan con la CLI, igual que los demás:

```bash
supabase secrets set WOMPI_PRIVATE_KEY=prv_test_xxxxx
supabase secrets set RECURRING_CRON_SECRET="$(openssl rand -hex 32)"
supabase secrets list
```

| Variable | Obligatoria | Para qué |
|---|---|---|
| `WOMPI_PUBLIC_KEY` | sí | Tokenizar Nequi y deducir el ambiente (sandbox vs producción) |
| `WOMPI_PRIVATE_KEY` | **sí (nueva)** | Crear la fuente de pago y ejecutar el cobro. **Nunca sale del servidor.** |
| `WOMPI_INTEGRITY_SECRET` | sí | Firma de integridad de la transacción (ver `WOMPI_TX_FIRMA`) |
| `WOMPI_EVENTS_SECRET` | sí | Verificar el webhook. Ya existía |
| `RECURRING_CRON_SECRET` | **sí (nueva)** | Autoriza a `charge-subscriptions`. **Es lo único que separa a un desconocido de poder disparar cobros.** Que sea largo y aleatorio |
| `WOMPI_API_URL` | opcional | Forzar la base de la API. Por defecto se deduce del prefijo de la llave pública: `pub_test_` → `https://sandbox.wompi.co/v1`, `pub_prod_` → `https://production.wompi.co/v1` ([Ambientes y llaves](https://docs.wompi.co/docs/colombia/ambientes-y-llaves/)) |
| `WOMPI_TX_FIRMA` | opcional | `no` para dejar de mandar `signature` en el cobro. Ver `VERIFICAR 3` |
| `RECURRING_BATCH_LIMIT` | opcional | Cobros por corrida. Por defecto 50 |
| `SITIO_PERMITIDO` | recomendada | Acota el CORS de `tokenize-payment-method`, que sí la llama el navegador |

**Nunca** en el código, nunca en `src/`, nunca en un commit. La llave privada y el secreto del
cron no viajan jamás al navegador.

### Lo que falta en `supabase/config.toml`

**Pendiente de integración; ese archivo quedó fuera de esta entrega:**

```toml
# La llama el programador de tareas, no un usuario: la autorización es
# RECURRING_CRON_SECRET, comparado en tiempo constante.
[functions.charge-subscriptions]
verify_jwt = false

# Esta sí exige sesión: el JWT decide, vía RLS, a quién se le puede guardar
# un medio de pago.
[functions.tokenize-payment-method]
verify_jwt = true
```

Y la ruta del atleta (`PaymentMethodPage`) tampoco está enrutada: la integra quien coordina.

---

## 3. Cómo funciona

### Autorizar (una vez)

```
El atleta abre "Mi pago automático" y escribe su celular de Nequi
  │
  ├─ tokenize-payment-method  { accion: "preparar" }
  │    · comprueba con la LLAVE DEL USUARIO quién es -> RLS decide
  │    · devuelve el TEXTO EXACTO que va a aceptar + los enlaces de política
  │
  ├─ tokenize-payment-method  { accion: "nequi_iniciar", phone }
  │    · POST /v1/tokens/nequi con la llave PÚBLICA -> token en estado PENDING
  │
  ├─ el atleta ACEPTA LA SUSCRIPCIÓN EN SU APP DE NEQUI
  │
  └─ tokenize-payment-method  { accion: "nequi_confirmar", token, acepto: true }
       1. GET /v1/tokens/nequi/{id}       -> tiene que estar APPROVED
       2. GET /merchants/info             -> tokens de aceptación
       3. POST /v1/payment_sources        -> con la llave PRIVADA
       4. register_payment_method()       -> método + autorización, en un solo acto
```

### Cobrar (todos los días)

```
El programador llama a charge-subscriptions (una vez al día, temprano)
  │
  ├─ charge_due_subscriptions()   encola lo que toca hoy
  │    · advisory lock por box (un solo proceso cobrando por box)
  │    · "hoy" en la zona horaria del box, no en UTC
  │    · índice único (org_id, invoice_id, period_start) -> NO cobra dos veces
  │
  ├─ claim_recurring_charges()    toma el trabajo
  │    · FOR UPDATE SKIP LOCKED: dos contenedores no cobran lo mismo
  │    · recalcula el saldo AHORA (pudo haber pagado en efectivo ayer)
  │    · crea el payment_intent con una referencia NUEVA por intento
  │
  ├─ POST /v1/transactions  { payment_source_id, recurrent: true, … }
  │
  ├─ si APPROVED -> apply_wompi_payment()   ← LA RUTA QUE YA EXISTE
  │                   · payments (provider, provider_ref) único
  │                   · el trigger payments_recalc_invoice salda la factura
  │
  └─ record_recurring_charge_result()  anota el resultado y programa el reintento
```

**El saldo de la factura no se toca a mano en ningún punto.** Lo recalcula el mismo trigger de
la migración 0003 que se usa cuando el pago entra en efectivo desde el panel. Un solo lugar
decide si una factura queda en `paid`, `partial` u `open`.

### Los reintentos

Escalera **día 1 · día 3 · día 7** medida desde que se encoló el cobro (no desde el último
intento: así la escalera es la misma aunque el job se caiga un día, y el atleta ve fechas
predecibles). Cuatro intentos en total y se acabó.

Y lo que de verdad importa: **no todos los fallos son iguales.**

| Causa | ¿Se reintenta? | Qué pasa |
|---|---|---|
| `insufficient_funds` | **sí** | Día 1, 3 y 7. La plata puede entrar mañana |
| `declined`, `gateway_error` | sí | Igual: un rechazo genérico puede ser transitorio |
| `revoked_token` | **no** | El atleta desvinculó Nequi, o el banco lo canceló. Reintentarlo no lo arregla nunca: se marca `needs_new_authorization` y se le pide que **vuelva a autorizar** |
| `expired_card` | no | La tarjeta venció. Igual: hay que registrar otra |
| `invalid_source` | no | La fuente de pago ya no sirve |
| `over_authorized_amount` | no | El cobro supera el tope que la persona autorizó. **No se intenta siquiera** |
| `missing_email` | no | La pasarela exige correo del pagador |

Agotados los reintentos, el cobro queda en `exhausted` con `notice_pending = true` y
`notice_kind = 'retries_exhausted'`. **Esa marca es el enganche con el motor de
automatizaciones** ([04](./04-automatizaciones.md)): quien mande el mensaje lee esa columna. El
envío en sí **no es de este módulo** y no está hecho aquí.

### Revocar

Una escritura sobre `recurring_authorizations.revoked_at` de la propia fila del atleta. Un
trigger, en la misma transacción:

1. deja el medio de pago en `revoked`,
2. cancela **todos** los cobros encolados o a la espera de reintento.

No "en la próxima corrida del job": en el acto. Un cobro ya enviado a la pasarela
(`processing`) **no se cancela**, porque esa plata ya va en camino y decir lo contrario sería
mentir.

La autorización **no se edita nunca**: otro trigger solo deja tocar las columnas de revocación
y prohíbe resucitar una revocada. Para volver a debitar hay que autorizar otra vez, y eso deja
otra fila con otra fecha. **La fecha es la evidencia** ([07](./07-legal-colombia.md)).

---

## 4. Lo que NUNCA entra a la base

```
                     NO                                    SÍ
  ┌────────────────────────────────┐    ┌────────────────────────────────────┐
  │ número de la tarjeta (PAN)     │    │ payment_source_id de Wompi         │
  │ CVV / CVC                      │    │ últimos 4 dígitos  ("4242")        │
  │ clave de Nequi                 │    │ teléfono enmascarado ("+57 *** ***  │
  │ teléfono sin enmascarar        │    │   4567")                           │
  └────────────────────────────────┘    │ marca, mes y año de vencimiento    │
                                        └────────────────────────────────────┘
```

Y no es una convención: `payment_methods` tiene CHECKs que lo hacen imposible.

- `last_four ~ '^[0-9]{4}$'` — un número de tarjeta completo no cabe.
- `masked_phone !~ '[0-9]{5}'` — cinco dígitos seguidos no pasan, así que un teléfono real
  tampoco.

Guardar un PAN convertiría esta base en un sistema sujeto a **PCI-DSS completo**. El modelo de
la pasarela existe justamente para que el dato sensible no pase por aquí. La advertencia está
escrita también dentro del SQL, junto a la tabla, para quien venga después con prisa.

---

## 5. Qué se probó de verdad

### Base de datos — 78 aserciones, sin Docker

```bash
BASE=$(mktemp -d) && chmod 711 $BASE && mkdir -p $BASE/data && chown postgres:postgres $BASE $BASE/data
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $BASE/data -U postgres --auth=trust" >/dev/null
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $BASE/data -o '-k $BASE -c listen_addresses=' -l $BASE/log start"
psql -h $BASE -U postgres -v ON_ERROR_STOP=1 -q -f supabase/tests/_local_auth_stub.sql
for f in supabase/migrations/*.sql; do psql -h $BASE -U postgres -v ON_ERROR_STOP=1 -q -f "$f"; done
psql -h $BASE -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/recurring.sql
```

Lo que cubre `supabase/tests/recurring.sql`:

- correr el job **dos veces no cobra dos veces** (y tampoco unas horas más tarde);
- un atleta **sin autorización vigente** no se cobra;
- **revocar detiene el débito en el acto**, y el job no lo vuelve a encolar;
- un cobro aprobado **salda la factura por la ruta existente** (`apply_wompi_payment` → el
  trigger de la 0003), y anotarlo dos veces no registra un segundo pago;
- un cobro rechazado **programa el reintento siguiente** (día 1 → 3 → 7); agotados, se marca
  `exhausted` con el aviso pendiente y no se vuelve a intentar solo;
- un **token revocado por el banco no se reintenta**: el método queda revocado y se pide nueva
  autorización;
- una **factura pagada a mano no se cobra por débito**, ni antes de encolar ni después (si el
  pago entra con el cobro ya encolado, el trigger lo cancela);
- la **autorización no es retroactiva**: no se debita deuda anterior a la fecha en que se
  autorizó;
- **no cabe un PAN ni un teléfono sin enmascarar** en la tabla;
- la autorización **no se puede editar ni resucitar**;
- **aislamiento entre boxes** y RLS: el atleta ve y revoca lo suyo, un coach sin permiso
  financiero no ve nada, el dueño del otro box tampoco.

Las suites existentes (`wompi.sql`, `billing_engine.sql`, `rls_guard.sql`, `rls_isolation.sql`,
`automations.sql`, `finance.sql`, `saas.sql`, `team.sql`, `wods.sql`, `legacy_migration.sql`)
**siguen pasando** con esta migración aplicada.

### Funciones puras de la integración — sin red, sin secretos

```bash
deno run supabase/functions/charge-subscriptions/wompi_recurrente_pruebas.ts
# también corre con:
node --experimental-strip-types supabase/functions/charge-subscriptions/wompi_recurrente_pruebas.ts
```

Comprueba el enmascarado del teléfono (que es lo que impide guardar un número completo), la
normalización a los diez dígitos que espera la API y la lectura de la respuesta del cobro
(aprobado / rechazado / pasarela caída). **No toca la red.**

---

## 6. Cómo se prueba en sandbox

Nada de lo de esta sección se ha ejecutado. Es el guion para la primera persona que tenga
llaves.

1. **Cargar las llaves de prueba** y desplegar:
   ```bash
   supabase secrets set WOMPI_PUBLIC_KEY=pub_test_xxx WOMPI_PRIVATE_KEY=prv_test_xxx \
     WOMPI_INTEGRITY_SECRET=test_integrity_xxx WOMPI_EVENTS_SECRET=test_events_xxx \
     WOMPI_ENVIRONMENT=test RECURRING_CRON_SECRET="$(openssl rand -hex 32)"
   supabase functions deploy tokenize-payment-method charge-subscriptions
   ```

2. **Comprobar los tokens de aceptación** (es lo primero que puede fallar, y sin ellos no se
   crea ninguna fuente de pago):
   ```bash
   curl -s https://sandbox.wompi.co/v1/merchants/info -H "x-merchant-public-key: pub_test_xxx" | jq .
   # si eso no responde, la forma histórica:
   curl -s https://sandbox.wompi.co/v1/merchants/pub_test_xxx | jq '.data.presigned_acceptance'
   ```
   Tienen que salir `presigned_acceptance` y `presigned_personal_data_auth`.

3. **Autorizar desde la aplicación** con un atleta de prueba, en el celular (la pantalla es
   móvil primero). Debe: mostrar el texto entero, pedir el celular, mandar a la app de Nequi y
   volver con el método guardado.

4. **Comprobar lo que quedó guardado** — y que no quedó nada más:
   ```sql
   select kind, provider_source_id, brand, last_four, masked_phone, status
     from public.payment_methods order by created_at desc limit 5;
   select authorized_at, accepted_version, max_amount_cents, left(accepted_text, 60)
     from public.recurring_authorizations order by authorized_at desc limit 5;
   ```

5. **Encolar y cobrar**, con una fecha inyectada para no esperar al día de corte:
   ```bash
   curl -X POST https://<ref>.supabase.co/functions/v1/charge-subscriptions \
     -H "x-cron-secret: <RECURRING_CRON_SECRET>" -H "Content-Type: application/json" \
     -d '{"now":"2026-10-05T12:00:00Z"}'
   ```
   ```sql
   select status, attempt, failure_kind, last_error_message, next_attempt_at
     from public.recurring_charges order by created_at desc limit 10;
   select attempt_no, status, error_code, error_message
     from public.recurring_charge_attempts order by started_at desc limit 10;
   ```

6. **Llamarla otra vez de inmediato.** Es LA prueba: no puede salir un segundo cobro.

7. **Comprobar la conciliación**: la factura tiene que quedar en `paid` y con **un solo**
   `payments` para esa transacción, aunque el webhook llegue después con su propio evento.

8. **Revocar desde la aplicación** y comprobar en la misma pantalla que el cobro encolado
   desaparece. En la base: `payment_methods.status = 'revoked'` y los cobros en `cancelled`.

9. **Forzar un rechazo.** Wompi publica datos de prueba por método en su sección
   *Ambiente de pruebas* (la URL que se probó, `docs.wompi.co/docs/colombia/ambiente-de-pruebas/`,
   devolvió 403 al escribir esto: **buscarla en el menú del sitio**). Provocar un rechazo y
   comprobar que el reintento queda programado al día 1 y que el historial de intentos crece.

### Programarlo

Una vez al día, temprano en Bogotá. La función es idempotente, así que correrla de más no
duplica nada:

```sql
-- pg_cron: 11:00 UTC = 06:00 en Bogotá
select cron.schedule(
  'cobros-automaticos', '0 11 * * *',
  $$select net.http_post(
      url    := 'https://<ref>.supabase.co/functions/v1/charge-subscriptions',
      headers:= '{"x-cron-secret":"<RECURRING_CRON_SECRET>","Content-Type":"application/json"}'::jsonb,
      body   := '{}'::jsonb)$$);
```

**Que corra después de `generate_invoices`**, no antes: si no hay factura, no hay nada que
cobrar y el día se pierde entero.

---

## Qué queda por verificar

Nada de esta lista se pudo comprobar: **no hubo credenciales de Wompi durante el desarrollo**.
Está marcado como `VERIFICAR` también en el código, junto a la línea que corresponde.

1. **Que el flujo entero de tokenización de Nequi funcione.** Lo documentado es
   `POST /v1/tokens/nequi` con `{"phone_number": "3017654321"}` y llave pública, token que nace
   `PENDING` y pasa a `APPROVED` cuando el usuario acepta en su app, comprobable con `GET`
   sobre el mismo recurso ([Fuentes de pago](https://docs.wompi.co/docs/colombia/fuentes-de-pago/)).
   Está implementado tal cual. **Cuánto tarda en aprobarse, qué pasa si el usuario no acepta y
   si el token caduca: no está documentado y hay que medirlo.** La pantalla asume que el atleta
   vuelve y pulsa "Ya la acepté en Nequi"; si Nequi tarda, esa espera hay que diseñarla mejor.
   → `charge-subscriptions/wompi_recurrente.ts`, `tokenizarNequi` / `consultarTokenNequi`.

2. **De dónde salen los tokens de aceptación.** La página de
   [Tokens de aceptación](https://docs.wompi.co/docs/colombia/tokens-de-aceptacion/) describe
   `GET /merchants/info` con la llave pública en la cabecera `x-merchant-public-key`; la forma
   histórica y más citada es `GET /v1/merchants/<llave_publica>`. **Se intentan las dos, en ese
   orden**, porque sin credenciales no hay manera de saber cuál responde. Si el primer intento
   de guardar un medio de pago devuelve `pasarela_no_disponible`, es aquí.
   → `obtenerInfoDelComercio`.

3. **Si el cobro contra una fuente de pago lleva `signature`.** La página de
   [Transacciones](https://docs.wompi.co/docs/colombia/transacciones/) lista `signature` como
   campo obligatorio de `POST /v1/transactions`; el ejemplo de cobro con `payment_source_id` de
   la página de [Fuentes de pago](https://docs.wompi.co/docs/colombia/fuentes-de-pago/) **no la
   incluye**. Hoy se manda (es lo que dice el contrato del endpoint) y se puede apagar con
   `WOMPI_TX_FIRMA=no`. **Si el sandbox responde 422 hablando de la firma, esa variable es el
   interruptor.** Y al revés: si responde 422 pidiéndola, ya está puesta.
   → `cobrarConFuenteDePago`.

4. **Si `acceptance_token` hay que repetirlo en cada transacción recurrente.** Se manda al
   crear la fuente de pago, que es donde la documentación lo exige, y **no** en cada cobro: la
   aceptación ya quedó atada a la fuente. Es lo razonable, pero no está dicho con todas las
   letras.

5. **El catálogo de códigos de rechazo.** No hay una lista publicada de `status_message` ni de
   códigos de error por método. La clasificación de `recurring_failure_kind` está hecha **por
   patrones de texto** (`INSUFFICIENT|FONDOS|SALDO`, `REVOK|REVOC|CANCEL|…`) y lo que no
   reconoce lo trata como **rechazo reintentable**, que es el lado seguro. **Hay que revisar los
   mensajes reales del sandbox y ajustar los patrones**: si un token revocado cayera en
   "reintentable", el atleta se comería cuatro intentos inútiles antes de que alguien le diga
   que vuelva a autorizar. → migración 0016, `recurring_failure_kind`.

6. **El tipo de `payment_source_id`.** La documentación lo muestra como entero (`3891`). Se
   guarda como texto en la base para no atarnos a su tipo y se convierte a entero al cobrar.
   Si algún día llegara un identificador no numérico, el cobro fallaría con
   `INVALID_PAYMENT_SOURCE` en vez de romperse en silencio, pero habría que cambiarlo.

7. **`recurrent: true` y las cuotas.** Se manda `recurrent: true` (transacción con credencial
   en archivo) y **no** se manda `payment_method.installments`: para Nequi no aplica y para
   tarjeta, cobrar a cuotas sin que el atleta lo haya pedido sería meterle un costo financiero
   por la puerta de atrás. El campo está soportado en el cliente por si se necesita.

8. **Qué eventos manda Wompi por un cobro recurrente.** Se asume que llega el mismo
   `transaction.updated` de siempre, con la referencia que nosotros generamos, y por eso la
   conciliación es la que ya existía. **Confirmarlo con el primer cobro de sandbox.** Si no
   llegara el evento, el cobro quedaría en `processing`: por eso `charge-subscriptions` también
   registra el pago cuando la API responde `APPROVED` en el acto, y los dos candados de la
   0009 impiden que se registre dos veces.

9. **El desembolso.** Se menciona "día hábil siguiente" en fuentes de terceros; **no se
   confirmó en documentación oficial** ([10 §6](./10-wompi.md)). Con débito automático importa
   más: el box va a preguntar cuándo ve la plata.

10. **La tarifa.** La misma de [10 §6](./10-wompi.md) (2,65 % + $700 + IVA en el plan
    Avanzado). Sobre una mensualidad de $180.000 son ~$6.509, o sea **~3,6 % del cobro**.
    Con débito automático eso se paga **todos los meses, de todos los atletas**: hay que
    decírselo al box de frente en la demo, porque la cuenta la va a hacer igual.

11. **El ejemplo de firma de eventos de Wompi no es reproducible.** Ya está documentado en
    [10 · Qué queda por verificar](./10-wompi.md) y no es de este módulo, pero es lo primero
    que hay que mirar si el webhook devuelve 401 con llaves buenas.

## Qué NO hace todavía

- **Tarjeta desde la pantalla del atleta.** El servidor ya guarda un token de tarjeta
  (`accion: "tarjeta_guardar"`), pero la interfaz solo ofrece Nequi. Para tarjeta hace falta
  el widget de Wompi en el navegador —el número de la tarjeta **no puede pasar por nuestro
  código**— y eso implica exponer la llave pública al frontend y montar el widget. Nequi es el
  diferenciador y es lo que tiene la gente de un box de barrio; la tarjeta es la segunda vuelta.
- **Avisarle al atleta.** Los cobros agotados o que necesitan nueva autorización quedan
  marcados con `notice_pending`, pero **quien manda el mensaje es el motor de automatizaciones**
  ([04](./04-automatizaciones.md)) y esa regla no está escrita. Hoy el atleta solo se entera si
  entra a la pantalla.
- **Cobro parcial.** Se cobra el saldo completo de la factura o no se cobra. No hay abonos
  automáticos.
- **Cambiar de medio de pago sin revocar.** Registrar uno nuevo revoca el anterior (queda la
  fila vieja con su fecha, como evidencia). No se pueden tener dos activos.
- **Devoluciones.** Si un cobro sale mal y hay que devolver, se hace en el panel de Wompi y se
  registra a mano. `payments.status` contempla `refunded` pero nada lo escribe.
- **Llaves por box.** Sigue pendiente de [10 §1](./10-wompi.md), y con débito automático pesa
  más.

## Archivos

| Archivo | Qué contiene |
|---|---|
| `supabase/migrations/20260918170000_recurring.sql` | `payment_methods`, `recurring_authorizations`, `recurring_charges`, `recurring_charge_attempts`, el job, la escalera de reintentos, los triggers de conciliación y la RLS |
| `supabase/tests/recurring.sql` | Idempotencia, revocación, reintentos, conciliación, aislamiento, RLS |
| `supabase/functions/charge-subscriptions/index.ts` | El job: encola, toma, cobra, concilia |
| `supabase/functions/charge-subscriptions/wompi_recurrente.ts` | Cliente de la API: aceptación, tokenización de Nequi, fuentes de pago, cobro |
| `supabase/functions/charge-subscriptions/wompi_recurrente_pruebas.ts` | Pruebas de lo anterior, sin red ni credenciales |
| `supabase/functions/tokenize-payment-method/index.ts` | Guarda el medio de pago y la autorización |
| `src/features/recurring/**` | Consultas, mutaciones y pantallas del atleta |
| `src/app/routes/athlete/PaymentMethodPage.tsx` | "Mi pago automático" |

Lo que **no** es de este módulo y se reutiliza tal cual: `supabase/functions/_shared/wompi.ts`
(firmas y verificación), `apply_wompi_payment` y `payment_intents` (migración 0009), el trigger
`payments_recalc_invoice` (migración 0003) y `create-payment-link` (para el botón de "pagar
ahora" cuando el débito falla).
