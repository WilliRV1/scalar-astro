// =============================================================================
// create-payment-link · genera el enlace de pago de una factura
// =============================================================================
// Entrada:  POST { "invoice_id": "<uuid>" }  con el JWT del usuario.
// Salida:   { checkout_url, reference, amount_cents, expires_at, intent_id }
//
// Quién puede pedirlo lo decide RLS, no este código: la factura se lee con la
// llave del usuario. Si la política no la devuelve, no hay enlace. Así el
// atleta puede generar el enlace de SU factura y el coach sin permiso de
// finanzas no puede generar el de nadie.
//
// El MONTO no viene del cliente. Lo calcula `open_payment_intent` en la base
// (saldo = amount_cents - paid_cents). Quien firma el enlace no elige cuánto
// se cobra.
//
// Secretos: WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY_SECRET (ver docs/10-wompi.md).
// =============================================================================

import { env, envEntero, requiereEnv } from '../_shared/env.ts';
import { cabecerasCors, error, json, registrarFallo } from '../_shared/http.ts';
import { clienteDeServicio, clienteDelUsuario } from '../_shared/supabase.ts';
import {
  ambienteDeLlave,
  armarEnlaceDeCheckout,
  firmaDeIntegridad,
  generarReferencia,
} from '../_shared/wompi.ts';

/** Vigencia del enlace. 72 h por defecto: el cobro se manda con días de gracia. */
const MINUTOS_DE_VIGENCIA = () => envEntero('WOMPI_LINK_TTL_MINUTES', 72 * 60);

interface Peticion {
  invoice_id?: string;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request): Promise<Response> => {
  // Esta función SÍ la llama el navegador del panel: necesita preflight.
  const cors = cabecerasCors(env('SITIO_PERMITIDO'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return error(405, 'metodo_no_permitido', 'Este recurso solo acepta POST.', cors);
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) {
    return error(401, 'sin_sesion', 'Falta la sesión para pedir el enlace de pago.', cors);
  }

  let cuerpo: Peticion;
  try {
    cuerpo = await req.json();
  } catch {
    return error(400, 'cuerpo_invalido', 'El cuerpo de la petición no es JSON válido.', cors);
  }

  const invoiceId = cuerpo.invoice_id?.trim();
  if (!invoiceId || !ES_UUID.test(invoiceId)) {
    return error(400, 'factura_invalida', 'Hay que indicar un invoice_id válido.', cors);
  }

  try {
    // -----------------------------------------------------------------------
    // 1 · Autorización. La hace RLS.
    // -----------------------------------------------------------------------
    const usuario = clienteDelUsuario(authorization);

    const { data: sesion, error: errorSesion } = await usuario.auth.getUser();
    if (errorSesion || !sesion?.user) {
      return error(401, 'sesion_invalida', 'La sesión no es válida o expiró.', cors);
    }

    const { data: factura, error: errorFactura } = await usuario
      .from('invoices')
      .select('id, org_id, athlete_id, number, amount_cents, paid_cents, status')
      .eq('id', invoiceId)
      .maybeSingle();

    if (errorFactura) {
      registrarFallo('create-payment-link:lectura-factura', errorFactura);
      return error(500, 'error_interno', 'No se pudo consultar la factura.', cors);
    }
    // Misma respuesta para "no existe" y "no tienes acceso": no se confirma la
    // existencia de facturas ajenas.
    if (!factura) {
      return error(404, 'factura_no_encontrada', 'No se encontró esa factura.', cors);
    }
    if (factura.status === 'void') {
      return error(409, 'factura_anulada', 'Esa factura está anulada.', cors);
    }
    if (factura.amount_cents - factura.paid_cents <= 0) {
      return error(409, 'factura_saldada', 'Esa factura ya está paga.', cors);
    }

    // -----------------------------------------------------------------------
    // 2 · Configuración de Wompi. Se lee después de autorizar para no delatar
    //     un despliegue mal configurado a quien ni siquiera tiene acceso.
    // -----------------------------------------------------------------------
    const llavePublica = requiereEnv('WOMPI_PUBLIC_KEY');
    const secretoDeIntegridad = requiereEnv('WOMPI_INTEGRITY_SECRET');

    if (ambienteDeLlave(llavePublica) === 'desconocido') {
      registrarFallo(
        'create-payment-link:config',
        new Error('WOMPI_PUBLIC_KEY no empieza por pub_test_ ni por pub_prod_'),
      );
      return error(500, 'error_interno', 'La pasarela no está bien configurada.', cors);
    }

    // -----------------------------------------------------------------------
    // 3 · Abrir el intento. Monto y referencia quedan fijados en la base.
    // -----------------------------------------------------------------------
    const servicio = clienteDeServicio();

    const vence = new Date(Date.now() + MINUTOS_DE_VIGENCIA() * 60_000).toISOString();
    const referencia = generarReferencia(factura.org_id, factura.number);

    const { data: intentos, error: errorIntento } = await servicio.rpc('open_payment_intent', {
      p_invoice_id: invoiceId,
      p_reference: referencia,
      p_expires_at: vence,
      p_created_by: sesion.user.id,
    });

    if (errorIntento) {
      registrarFallo('create-payment-link:open_payment_intent', errorIntento);
      return error(409, 'no_se_pudo_abrir', 'No se pudo generar el enlace para esa factura.', cors);
    }

    const intento = Array.isArray(intentos) ? intentos[0] : intentos;
    if (!intento) {
      return error(500, 'error_interno', 'No se pudo generar el enlace de pago.', cors);
    }

    // -----------------------------------------------------------------------
    // 4 · Firmar y armar el enlace.
    // -----------------------------------------------------------------------
    // `expires_at` viene de la base, no de la variable local: si se reutilizó
    // un intento vivo, la expiración es la suya. La firma tiene que cubrir
    // EXACTAMENTE lo que va en la URL.
    const expiracion = intento.expires_at
      ? new Date(intento.expires_at).toISOString()
      : undefined;

    const firma = await firmaDeIntegridad(
      intento.reference,
      intento.amount_cents,
      intento.currency,
      secretoDeIntegridad,
      expiracion,
    );

    // Datos del atleta para prellenar el checkout. Si fallan, no es motivo para
    // no cobrar: se sigue sin ellos.
    let correo: string | undefined;
    let nombre: string | undefined;
    const { data: atleta } = await servicio
      .from('athletes')
      .select('first_name, last_name, email')
      .eq('id', intento.athlete_id)
      .maybeSingle();
    if (atleta) {
      correo = atleta.email ?? undefined;
      nombre = [atleta.first_name, atleta.last_name].filter(Boolean).join(' ') || undefined;
    }

    const enlace = armarEnlaceDeCheckout({
      llavePublica,
      referencia: intento.reference,
      montoEnCentavos: Number(intento.amount_cents),
      moneda: intento.currency,
      firmaDeIntegridad: firma,
      // Solo del entorno: aceptar la URL de retorno del cliente sería un
      // redirector abierto con el logo del box encima.
      urlDeRetorno: env('WOMPI_REDIRECT_URL'),
      expiracionISO: expiracion,
      correoDelCliente: correo,
      nombreDelCliente: nombre,
    });

    // -----------------------------------------------------------------------
    // 5 · Guardar el enlace en el intento.
    // -----------------------------------------------------------------------
    const { error: errorGuardar } = await servicio
      .from('payment_intents')
      .update({ checkout_url: enlace })
      .eq('id', intento.intent_id);

    if (errorGuardar) {
      // El enlace es válido aunque no se haya podido guardar: se registra y se
      // devuelve igual, porque el webhook resuelve por referencia.
      registrarFallo('create-payment-link:guardar-enlace', errorGuardar);
    }

    return json(
      {
        ok: true,
        intent_id: intento.intent_id,
        reference: intento.reference,
        amount_cents: Number(intento.amount_cents),
        currency: intento.currency,
        checkout_url: enlace,
        expires_at: intento.expires_at,
        reused: intento.reused === true,
      },
      200,
      cors,
    );
  } catch (causa) {
    registrarFallo('create-payment-link', causa);
    return error(500, 'error_interno', 'No se pudo generar el enlace de pago.', cors);
  }
});
