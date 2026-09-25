# 20 — Mercado Pago: cobro en línea del box y cobro de Scalar a los boxes

> Estado: **construido y probado sin credenciales** (2026-09-25). Falta la
> primera transacción real en sandbox: ver "Qué queda por verificar".

## Por qué Mercado Pago y no Wompi

Decisión del 2026-09-25 (ver [17](./17-viabilidad-tecnica.md) §3): un box abre
su cuenta de Mercado Pago con la cédula en minutos; Wompi pide RUT y días de
aprobación. Wompi sigue construido y disponible como alternativa (Nequi nativo
y comisión más baja), pero el arranque es con Mercado Pago. Si un box configura
las dos, manda Mercado Pago.

Hay **dos flujos** sobre el mismo molde, y no se mezclan:

| | El box cobra a sus atletas | Scalar cobra al box |
|---|---|---|
| Cuenta de Mercado Pago | La del box (Configuración → Integraciones) | La de Scalar (`SCALAR_MP_*` en el entorno) |
| Función que arma el enlace | `create-payment-link` | `platform-payment-link` |
| Webhook | `/functions/v1/mercadopago-webhook/box/<org_id>` | `/functions/v1/mercadopago-webhook/scalar` |
| Conciliación | `apply_mercadopago_payment` → `payments`, factura del atleta | `apply_platform_payment` → `platform_payments`, `next_charge_on` |
| Alternativa sin pasarela | Pago manual con comprobante (ya existía) | `register_platform_payment` (Nequi a mano, superadmin) |

## 1. Qué hay que conseguir

### Para cada box (lo hace el dueño, 10 minutos)

1. Cuenta de Mercado Pago (persona natural con cédula sirve para arrancar; para
   operar en regla, RUT).
2. En [mercadopago.com.co/developers](https://www.mercadopago.com.co/developers)
   → **Tus integraciones → Crear aplicación** (tipo "Pagos en línea", Checkout Pro).
3. **Credenciales de producción → Access token** (`APP_USR-…`). Para ensayar,
   las de prueba (`TEST-…`).
4. **Webhooks → Configurar notificaciones**: pegar la URL que muestra Scalar
   en Integraciones (`…/mercadopago-webhook/box/<org_id>`), marcar el evento
   **Pagos**, y copiar la **clave secreta** que aparece.
5. Pegar access token y clave secreta en Scalar → Configuración → Integraciones.

### Para Scalar (una vez)

Lo mismo, con la cuenta de Scalar, y las dos llaves en el `.env` de widawi:

```
SCALAR_MP_ACCESS_TOKEN=APP_USR-…
SCALAR_MP_WEBHOOK_SECRET=…
```

con la URL de webhook `https://scalar.widawi.online/functions/v1/mercadopago-webhook/scalar`.
Después: `docker compose up -d functions`.

Mientras no estén puestas, el botón "Pagar con Mercado Pago" de Mi plan
responde "Scalar todavía no tiene activado el pago en línea" y el pago se
registra a mano (Nequi), que es como se arranca en Fase 0.

## 2. Cómo funciona

1. **Enlace.** La función abre un `payment_intent` (monto = saldo de la factura,
   lo fija la base) y crea una **preferencia de Checkout Pro**
   (`POST /checkout/preferences`) con `external_reference` = nuestra
   referencia y `notification_url` = el webhook del box. Devuelve `init_point`.
2. **Pago.** El atleta paga en Mercado Pago (PSE, tarjeta, Efecty, saldo).
3. **Aviso.** Mercado Pago llama al webhook con `?data.id=<pago>&type=payment`
   y las cabeceras `x-signature` y `x-request-id`.
4. **Firma.** Se verifica HMAC-SHA256 del manifiesto
   `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con la clave secreta del
   box. Sin firma válida: 401 y nada se toca.
5. **Consulta.** El aviso solo trae el id. Estado, monto y referencia se leen
   de `GET /v1/payments/{id}` con el access token del box. **El aviso nunca es
   la verdad**: aunque alguien firmara uno falso, solo logra que releamos un
   pago real.
6. **Conciliación**, en la base y en una sola transacción: candado por aviso
   (`webhook_events (provider, event_id)`) y por pago
   (`payments (provider, provider_ref)`). `approved` registra el pago y el
   trigger salda la factura; `refunded`/`charged_back` marca el pago como
   reembolsado y la factura vuelve a abrirse; el resto deja el intento en
   pendiente/declinado sin plata.

El flujo hacia Scalar es igual, con `platform_payment_intents` y
`platform_payments`. Un pago aprobado avanza `next_charge_on` al día siguiente
del periodo pagado y, si el box estaba en mora o suspendido, lo reactiva. Un
pago por debajo del valor del periodo se anota pero **no** lo da por pago
(`pago_insuficiente`); un reembolso se anota y **no** revierte el periodo:
las dos cosas las decide una persona.

## 3. Probar en sandbox

1. Con las credenciales de prueba (`TEST-…`) o con un **usuario de prueba**
   vendedor (Tus integraciones → Cuentas de prueba) puestas en Integraciones.
2. Desde la app del atleta: **Pagar en línea**. Debe abrir el checkout de
   Mercado Pago.
3. Pagar con un usuario de prueba comprador y las tarjetas de prueba del panel
   (APRO para aprobado, OTHE/CONT para rechazado/pendiente).
4. En `webhook_events` debe aparecer el aviso con `result = pago_registrado` y
   la factura en `paid`. Si el aviso llega con `status = ignored` y
   `result = referencia_desconocida`, el `external_reference` no coincide.
5. **Reenviar el aviso** desde el panel de Webhooks (Simulador): la segunda
   vez el resultado es `evento_duplicado` y sigue habiendo un pago.
6. Reembolsar el pago desde el panel: la factura vuelve a `open`.

El simulador del panel permite firmar un aviso con la clave secreta: sirve
para confirmar el manifiesto exacto (ver abajo) sin mover plata.

## 4. Comisiones (consultado 2026-09-25)

Mercado Pago Colombia: ~2,89 % + IVA en PSE y datáfono, ~3,29 % + IVA en link
de pago (Checkout Pro). La paga **quien cobra**: el box por sus atletas, Scalar
por sus boxes. Sobre una mensualidad de Scalar de $49.900, son unos $1.950 por
box al mes. Fuentes en [16](./16-viabilidad-financiera.md).

## Qué queda por verificar

Marcado como `VERIFICAR` en el código. Nada de esto se puede cerrar sin un
evento real de sandbox:

- **El manifiesto de la firma.** La documentación se ha visto con y sin el
  `;` final y con y sin la nota de "data.id en minúsculas". El verificador
  acepta las cuatro variantes y **registra cuál coincidió**
  (`variante N` en los logs). Con el primer aviso real, fijar la oficial y
  quitar las otras (`_shared/mercadopago.ts`, `manifiestosPosibles`).
- **Formato de `expiration_date_to`.** Se manda con desplazamiento explícito
  (`2026-09-28T10:00:00.000-05:00`), como en la referencia. Sin confirmar si
  acepta `Z`.
- **`notification_url` con ruta extra.** Se asume que Mercado Pago añade
  `?data.id=…&type=…` a `…/mercadopago-webhook/box/<org_id>`. Si no, el
  webhook también acepta `?org=<uuid>` / `?scalar=1`.
- **`init_point` vs `sandbox_init_point`.** Se devuelve siempre `init_point`
  (con credenciales de prueba también funciona, según la documentación
  reciente). Si el checkout de prueba no abre, probar `sandbox_init_point`.
- **`auto_return`** solo se manda cuando hay `back_urls`; con `PUBLIC_URL`
  puesta siempre las hay. Sin confirmar que Mercado Pago acepte la misma URL
  para success/failure/pending.
- **Medios disponibles en Colombia.** PSE, tarjetas y Efecty están
  documentados; Nequi solo por PSE. El mapeo a `payments.method` cubre los
  `payment_type_id` documentados y cae a `other`.
- **Débito automático.** No implementado con Mercado Pago (existe con Wompi,
  ver [12](./12-debito-recurrente.md)). Mercado Pago lo ofrece como
  "Suscripciones" (preapproval); queda para después.

## Archivos

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/20260925120000_mercadopago.sql` | Credenciales `mercadopago_*`, `open_payment_intent` con pasarela, `apply_mercadopago_payment`, tablas e RPC de pagos a Scalar, `register_platform_payment` |
| `supabase/functions/_shared/mercadopago.ts` (+ `_pruebas.ts`) | Firma, preferencia, consulta del pago, conversión pesos↔centavos, fechas |
| `supabase/functions/create-payment-link/` | Elige la pasarela del box y arma el enlace |
| `supabase/functions/mercadopago-webhook/` | Firma → consulta → conciliación |
| `supabase/functions/platform-payment-link/` | Enlace para pagarle a Scalar |
| `supabase/tests/mercadopago.sql` | 50+ aserciones: idempotencia, aislamiento, reembolsos, cobro a Scalar, pago a mano, RLS |
| `src/features/orgsetup/SeccionIntegraciones.tsx` | Llaves del box y URL del webhook |
| `src/features/platformbilling/` | Pestaña "Mi plan": plan, próximo cobro, botón de pago, historial |
| `src/app/routes/athlete/AthleteHome.tsx` | Botón "Pagar en línea" del atleta |
| `deploy/widawi/` | Edge-runtime autoalojado (`functions`), nginx `/functions/v1/`, `desplegar.sh` |
