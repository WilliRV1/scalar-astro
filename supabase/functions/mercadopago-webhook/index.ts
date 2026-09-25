// =============================================================================
// mercadopago-webhook · recibe los avisos de Mercado Pago y concilia el pago
// =============================================================================
// Entrada: POST de Mercado Pago, SIN JWT (`verify_jwt = false` en config.toml).
// La URL dice de quién es el aviso:
//
//   /mercadopago-webhook/box/<org_id>   pagos de los atletas de ESE box
//                                       (cuenta de Mercado Pago del box)
//   /mercadopago-webhook/scalar         pagos de los boxes a Scalar
//                                       (cuenta de Mercado Pago de Scalar)
//
// Tres capas, en este orden, y ninguna se salta:
//
//   1. FIRMA. `x-signature` con la clave secreta del webhook (del box, o la
//      de Scalar). Sin firma válida: 401 y no se toca nada.
//   2. CONSULTA. El aviso solo trae el id del pago. Estado, monto y referencia
//      se leen de GET /v1/payments/{id} con el access token correspondiente.
//      Aunque alguien firmara un aviso falso, lo único que logra es que
//      volvamos a leer un pago real.
//   3. CONCILIACIÓN. `apply_mercadopago_payment` / `apply_platform_payment`
//      en la base, idempotentes por (provider, event_id) y por
//      (provider, provider_ref).
//
// Códigos de respuesta (Mercado Pago reintenta lo que no sea 2xx):
//   200 · procesado, duplicado o ignorado -> deja de reintentar
//   401 · firma inválida                  -> basura, no reintentar
//   400 · aviso ilegible                  -> no reintentar
//   500 · falló la consulta o la base     -> QUE REINTENTE
//
// Ver docs/20-mercadopago.md.
// =============================================================================

import { env } from '../_shared/env.ts';
import { credencialDelBox } from '../_shared/credenciales.ts';
import { error, json, registrarFallo } from '../_shared/http.ts';
import { clienteDeServicio } from '../_shared/supabase.ts';
import {
  centavosDesdeMonto,
  consultarPago,
  type NotificacionMP,
  type PagoMP,
  resumenDePago,
  verificarFirmaMercadoPago,
} from '../_shared/mercadopago.ts';

/** Un aviso de Mercado Pago pesa unos cientos de bytes. */
const MAXIMO_BYTES = 64 * 1024;
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Alcance = { tipo: 'box'; orgId: string } | { tipo: 'scalar' };

/**
 * De quién es el aviso, por la ruta o, como respaldo, por la query
 * (?org=<uuid> | ?scalar=1). Mercado Pago añade sus propios parámetros
 * (data.id, type) detrás de lo que ya tenga la URL.
 */
export function alcanceDe(url: URL): Alcance | undefined {
  const partes = url.pathname.split('/').filter(Boolean);
  const i = partes.indexOf('mercadopago-webhook');
  const resto = i >= 0 ? partes.slice(i + 1) : partes;

  if (resto[0] === 'scalar') return { tipo: 'scalar' };
  if (resto[0] === 'box' && resto[1] && ES_UUID.test(resto[1])) {
    return { tipo: 'box', orgId: resto[1].toLowerCase() };
  }
  const org = url.searchParams.get('org');
  if (org && ES_UUID.test(org)) return { tipo: 'box', orgId: org.toLowerCase() };
  if (url.searchParams.get('scalar')) return { tipo: 'scalar' };
  return undefined;
}

// Mercado Pago llama servidor a servidor: aquí NO hay cabeceras CORS a propósito.
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return error(405, 'metodo_no_permitido', 'Este recurso solo acepta POST.');
  }

  const url = new URL(req.url);
  const alcance = alcanceDe(url);
  if (!alcance) {
    return error(404, 'sin_alcance', 'La URL del webhook no dice de qué cuenta es el aviso.');
  }

  let crudo: string;
  try {
    crudo = await req.text();
  } catch (causa) {
    registrarFallo('mercadopago-webhook:lectura', causa);
    return error(400, 'cuerpo_ilegible', 'No se pudo leer el cuerpo del aviso.');
  }
  if (crudo.length > MAXIMO_BYTES) {
    return error(400, 'cuerpo_invalido', 'El cuerpo del aviso es demasiado grande.');
  }

  let notificacion: NotificacionMP = {};
  if (crudo.trim() !== '') {
    try {
      notificacion = JSON.parse(crudo) as NotificacionMP;
    } catch {
      return error(400, 'cuerpo_invalido', 'El cuerpo del aviso no es JSON válido.');
    }
  }

  // data.id sale de la QUERY: es lo que entra en la firma. El cuerpo es respaldo.
  const dataId = url.searchParams.get('data.id')
    ?? url.searchParams.get('id')
    ?? (notificacion.data?.id !== undefined ? String(notificacion.data.id) : null);
  const tipo = url.searchParams.get('type')
    ?? url.searchParams.get('topic')
    ?? notificacion.type
    ?? notificacion.topic
    ?? null;

  // ---------------------------------------------------------------------------
  // 1 · Credenciales según el alcance, y verificación de la firma.
  // ---------------------------------------------------------------------------
  const servicio = clienteDeServicio();
  let secreto: string | undefined;
  let token: string | undefined;
  try {
    if (alcance.tipo === 'box') {
      secreto = (await credencialDelBox(servicio, alcance.orgId, 'mercadopago_webhook_secret'))?.valor;
      token = (await credencialDelBox(servicio, alcance.orgId, 'mercadopago_access_token'))?.valor;
    } else {
      secreto = env('SCALAR_MP_WEBHOOK_SECRET');
      token = env('SCALAR_MP_ACCESS_TOKEN');
    }
  } catch (causa) {
    registrarFallo('mercadopago-webhook:config', causa);
  }

  if (!secreto || !token) {
    registrarFallo(
      'mercadopago-webhook:config',
      new Error(`sin credenciales de Mercado Pago para ${alcance.tipo === 'box' ? `el box ${alcance.orgId}` : 'Scalar'}`),
    );
    // 500 y no 401: el aviso puede ser legítimo; que reintente mientras se
    // arregla la configuración.
    return error(500, 'error_interno', 'No se pudo procesar el aviso.');
  }

  const verificacion = await verificarFirmaMercadoPago({
    xSignature: req.headers.get('x-signature'),
    xRequestId: req.headers.get('x-request-id'),
    dataId,
    secreto,
  });
  if (!verificacion.valido) {
    // El motivo se registra, no se devuelve: decirle a quien tantea POR QUÉ
    // falló su firma es ayudarle a acertar.
    registrarFallo('mercadopago-webhook:firma', new Error(verificacion.motivo));
    return error(401, 'firma_invalida', 'El aviso no está firmado correctamente.');
  }
  if (verificacion.variante > 0) {
    console.warn(
      `[mercadopago-webhook] la firma coincidió con la variante ${verificacion.variante} del manifiesto; ` +
        'conviene fijarla (docs/20-mercadopago.md, "Qué queda por verificar").',
    );
  }

  // ---------------------------------------------------------------------------
  // 2 · Solo nos interesan los pagos.
  // ---------------------------------------------------------------------------
  if (tipo !== 'payment') {
    // 200: el aviso es legítimo, simplemente no es de los nuestros.
    return json({ ok: true, resultado: 'evento_ignorado', tipo });
  }
  if (!dataId) {
    return error(400, 'sin_id', 'El aviso no trae el id del pago.');
  }

  // ---------------------------------------------------------------------------
  // 3 · Consultar el pago. Esto, y no el aviso, es la verdad.
  // ---------------------------------------------------------------------------
  let pago: PagoMP;
  try {
    pago = await consultarPago(token, dataId);
  } catch (causa) {
    registrarFallo('mercadopago-webhook:consulta', causa);
    return error(500, 'error_interno', 'No se pudo consultar el pago.');
  }

  const referencia = pago.external_reference;
  if (typeof referencia !== 'string' || referencia === '') {
    // Un pago de esa cuenta que no salió de Scalar (una venta suelta del box).
    return json({ ok: true, resultado: 'sin_referencia' });
  }

  // ---------------------------------------------------------------------------
  // 4 · Aplicar. La idempotencia y la conciliación son de la base.
  // ---------------------------------------------------------------------------
  const idDeAviso = notificacion.id !== undefined
    ? String(notificacion.id)
    : `${dataId}:${notificacion.action ?? 'payment'}:${verificacion.ts}`;
  const eventId = (alcance.tipo === 'scalar' ? 'scalar:' : '') + idDeAviso;

  const comunes = {
    p_event_id: eventId,
    p_payment_id: String(pago.id),
    p_reference: referencia,
    p_status: String(pago.status),
    p_amount_cents: centavosDesdeMonto(Number(pago.transaction_amount ?? 0)),
    p_payment_type: pago.payment_type_id ?? null,
    p_method_id: pago.payment_method_id ?? null,
    p_event_type: notificacion.action ?? 'payment.updated',
    p_payload: { notificacion, pago: resumenDePago(pago) },
    p_paid_at: pago.date_approved ?? pago.date_created ?? new Date().toISOString(),
  };

  try {
    const { data, error: errorRpc } = alcance.tipo === 'box'
      ? await servicio.rpc('apply_mercadopago_payment', { ...comunes, p_org_id: alcance.orgId })
      : await servicio.rpc('apply_platform_payment', comunes);

    if (errorRpc) {
      // 500 a propósito: que reintente. Un pago aprobado que no se pudo
      // registrar es plata que entró y el sistema no muestra.
      registrarFallo('mercadopago-webhook:aplicar', errorRpc);
      return error(500, 'error_interno', 'No se pudo procesar el aviso.');
    }

    const resultado = Array.isArray(data) ? data[0] : data;
    return json({ ok: true, resultado: resultado?.resultado ?? 'procesado' });
  } catch (causa) {
    registrarFallo('mercadopago-webhook', causa);
    return error(500, 'error_interno', 'No se pudo procesar el aviso.');
  }
});
