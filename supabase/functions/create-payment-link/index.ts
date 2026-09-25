// =============================================================================
// create-payment-link · genera el enlace de pago de una factura
// =============================================================================
// Entrada:  POST { "invoice_id": "<uuid>" }  con el JWT del usuario.
// Salida:   { provider, checkout_url, reference, amount_cents, expires_at, intent_id }
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
// La PASARELA la decide lo que el box configuró en Configuración →
// Integraciones: Mercado Pago si tiene su access token; si no, Wompi. Las
// credenciales son del BOX, con respaldo en el entorno solo para desarrollo.
// Ver docs/20-mercadopago.md y docs/10-wompi.md.
// =============================================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { env, envEntero } from '../_shared/env.ts';
import { exigeCredencial } from '../_shared/credenciales.ts';
import { cabecerasCors, error, json, registrarFallo } from '../_shared/http.ts';
import { clienteDeServicio, clienteDelUsuario } from '../_shared/supabase.ts';
import {
  ambienteDeLlave,
  armarEnlaceDeCheckout,
  firmaDeIntegridad,
  generarReferencia,
} from '../_shared/wompi.ts';
import { ambienteDeToken, crearPreferencia, fechaParaMercadoPago } from '../_shared/mercadopago.ts';

/** Vigencia del enlace. 72 h por defecto: el cobro se manda con días de gracia. */
const MINUTOS_DE_VIGENCIA = () =>
  envEntero('PAYMENT_LINK_TTL_MINUTES', envEntero('WOMPI_LINK_TTL_MINUTES', 72 * 60));

type Pasarela = 'mercadopago' | 'wompi';

interface Peticion {
  invoice_id?: string;
}

interface Factura {
  id: string;
  org_id: string;
  athlete_id: string;
  number: string;
  amount_cents: number;
  paid_cents: number;
  status: string;
}

interface Intento {
  intent_id: string;
  org_id: string;
  athlete_id: string;
  invoice_id: string;
  amount_cents: number;
  currency: string;
  reference: string;
  expires_at: string | null;
  reused: boolean;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Qué pasarela tiene puesta el box. Si tiene las dos, manda Mercado Pago. Se
 * mira la ficha de estado (`is_set`), nunca el secreto.
 */
async function pasarelaDelBox(servicio: SupabaseClient, orgId: string): Promise<Pasarela> {
  const { data, error: fallo } = await servicio
    .from('org_credentials')
    .select('key')
    .eq('org_id', orgId)
    .eq('is_set', true);
  if (fallo) registrarFallo('create-payment-link:pasarela', fallo);

  const claves = new Set((data ?? []).map((fila: { key: string }) => fila.key));
  if (claves.has('mercadopago_access_token')) return 'mercadopago';
  if (claves.has('wompi_public_key')) return 'wompi';
  // Respaldo del entorno, solo para desarrollo y sandbox.
  if (env('MERCADOPAGO_ACCESS_TOKEN')) return 'mercadopago';
  return 'wompi';
}

async function abrirIntento(
  servicio: SupabaseClient,
  factura: Factura,
  pasarela: Pasarela,
  creadoPor: string,
): Promise<Intento> {
  const vence = new Date(Date.now() + MINUTOS_DE_VIGENCIA() * 60_000).toISOString();
  const { data, error: fallo } = await servicio.rpc('open_payment_intent', {
    p_invoice_id: factura.id,
    p_reference: generarReferencia(factura.org_id, factura.number),
    p_expires_at: vence,
    p_created_by: creadoPor,
    p_provider: pasarela,
  });
  if (fallo) throw fallo;
  const intento = (Array.isArray(data) ? data[0] : data) as Intento | undefined;
  if (!intento) throw new Error('open_payment_intent no devolvió el intento');
  return intento;
}

/** Nombre y correo del atleta para prellenar el checkout. Si falla, se cobra igual. */
async function datosDelAtleta(servicio: SupabaseClient, athleteId: string) {
  const { data } = await servicio
    .from('athletes')
    .select('first_name, last_name, email')
    .eq('id', athleteId)
    .maybeSingle();
  return {
    correo: data?.email ?? undefined,
    nombre: data?.first_name ?? undefined,
    apellido: data?.last_name ?? undefined,
  };
}

// -----------------------------------------------------------------------------
// Mercado Pago · preferencia de Checkout Pro
// -----------------------------------------------------------------------------
async function enlaceMercadoPago(
  servicio: SupabaseClient,
  factura: Factura,
  creadoPor: string,
  cors: Record<string, string>,
): Promise<Response> {
  let token: string;
  try {
    token = await exigeCredencial(servicio, factura.org_id, 'mercadopago_access_token');
  } catch (causa) {
    registrarFallo('create-payment-link:credenciales', causa);
    return error(
      409, 'pasarela_sin_configurar',
      'Este box todavía no tiene configurado el cobro en línea. ' +
        'El dueño lo activa en Configuración → Integraciones.',
      cors,
    );
  }
  if (ambienteDeToken(token) === 'desconocido') {
    registrarFallo('create-payment-link:config', new Error('El access token no empieza por TEST- ni APP_USR-'));
    return error(500, 'error_interno', 'La pasarela no está bien configurada.', cors);
  }

  // A dónde vuelve la persona y a dónde avisa Mercado Pago. Siempre del
  // entorno: aceptar una URL del cliente sería un redirector abierto.
  const sitio = (env('PUBLIC_URL') ?? env('SITIO_PERMITIDO') ?? '').replace(/\/$/, '');
  if (!sitio) {
    registrarFallo('create-payment-link:config', new Error('Falta PUBLIC_URL para armar la URL del webhook'));
    return error(500, 'error_interno', 'La pasarela no está bien configurada.', cors);
  }

  const intento = await abrirIntento(servicio, factura, 'mercadopago', creadoPor);

  // Si el intento ya tenía enlace, es el mismo: la preferencia sigue viva.
  if (intento.reused) {
    const { data: previo } = await servicio
      .from('payment_intents')
      .select('checkout_url')
      .eq('id', intento.intent_id)
      .maybeSingle();
    if (previo?.checkout_url) {
      return json({
        ok: true,
        provider: 'mercadopago',
        intent_id: intento.intent_id,
        reference: intento.reference,
        amount_cents: Number(intento.amount_cents),
        currency: intento.currency,
        checkout_url: previo.checkout_url,
        expires_at: intento.expires_at,
        reused: true,
      }, 200, cors);
    }
  }

  const [atleta, { data: box }] = await Promise.all([
    datosDelAtleta(servicio, intento.athlete_id),
    servicio.from('organizations').select('name').eq('id', factura.org_id).maybeSingle(),
  ]);

  let preferencia;
  try {
    preferencia = await crearPreferencia({
      token,
      itemId: factura.number,
      titulo: `Mensualidad · ${box?.name ?? 'tu box'}`,
      descripcion: `Factura ${factura.number}`,
      montoCentavos: intento.amount_cents,
      moneda: intento.currency,
      referencia: intento.reference,
      notificationUrl: `${sitio}/functions/v1/mercadopago-webhook/box/${factura.org_id}`,
      backUrl: env('MERCADOPAGO_BACK_URL') ?? sitio,
      expiraISO: intento.expires_at ? fechaParaMercadoPago(new Date(intento.expires_at)) : undefined,
      correo: atleta.correo,
      nombre: atleta.nombre,
      apellido: atleta.apellido,
      metadata: {
        scalar: 'box',
        org_id: factura.org_id,
        intent_id: intento.intent_id,
        invoice_id: factura.id,
      },
      idempotencyKey: intento.intent_id,
    });
  } catch (causa) {
    registrarFallo('create-payment-link:mercadopago', causa);
    return error(502, 'pasarela_no_responde', 'Mercado Pago no respondió. Intenta de nuevo en un momento.', cors);
  }

  const { error: errorGuardar } = await servicio
    .from('payment_intents')
    .update({ checkout_url: preferencia.init_point, provider_checkout_id: String(preferencia.id) })
    .eq('id', intento.intent_id);
  if (errorGuardar) {
    // El enlace sirve aunque no se haya podido guardar: el webhook resuelve
    // por referencia. Se registra y se devuelve igual.
    registrarFallo('create-payment-link:guardar-enlace', errorGuardar);
  }

  return json({
    ok: true,
    provider: 'mercadopago',
    intent_id: intento.intent_id,
    reference: intento.reference,
    amount_cents: Number(intento.amount_cents),
    currency: intento.currency,
    checkout_url: preferencia.init_point,
    expires_at: intento.expires_at,
    reused: false,
  }, 200, cors);
}

// -----------------------------------------------------------------------------
// Wompi · enlace firmado al Checkout Web
// -----------------------------------------------------------------------------
async function enlaceWompi(
  servicio: SupabaseClient,
  factura: Factura,
  creadoPor: string,
  cors: Record<string, string>,
): Promise<Response> {
  let llavePublica: string;
  let secretoDeIntegridad: string;
  try {
    llavePublica = await exigeCredencial(servicio, factura.org_id, 'wompi_public_key');
    secretoDeIntegridad = await exigeCredencial(servicio, factura.org_id, 'wompi_integrity_secret');
  } catch (causa) {
    registrarFallo('create-payment-link:credenciales', causa);
    return error(
      409, 'pasarela_sin_configurar',
      'Este box todavía no tiene configurado el cobro en línea. ' +
        'El dueño lo activa en Configuración → Integraciones.',
      cors,
    );
  }

  if (ambienteDeLlave(llavePublica) === 'desconocido') {
    registrarFallo(
      'create-payment-link:config',
      new Error('La llave pública del box no empieza por pub_test_ ni por pub_prod_'),
    );
    return error(500, 'error_interno', 'La pasarela no está bien configurada.', cors);
  }

  const intento = await abrirIntento(servicio, factura, 'wompi', creadoPor);

  // `expires_at` viene de la base: si se reutilizó un intento vivo, la
  // expiración es la suya. La firma tiene que cubrir EXACTAMENTE lo que va en
  // la URL.
  const expiracion = intento.expires_at ? new Date(intento.expires_at).toISOString() : undefined;
  const firma = await firmaDeIntegridad(
    intento.reference, intento.amount_cents, intento.currency, secretoDeIntegridad, expiracion,
  );

  const atleta = await datosDelAtleta(servicio, intento.athlete_id);
  const enlace = armarEnlaceDeCheckout({
    llavePublica,
    referencia: intento.reference,
    montoEnCentavos: Number(intento.amount_cents),
    moneda: intento.currency,
    firmaDeIntegridad: firma,
    urlDeRetorno: env('WOMPI_REDIRECT_URL'),
    expiracionISO: expiracion,
    correoDelCliente: atleta.correo,
    nombreDelCliente: [atleta.nombre, atleta.apellido].filter(Boolean).join(' ') || undefined,
  });

  const { error: errorGuardar } = await servicio
    .from('payment_intents')
    .update({ checkout_url: enlace })
    .eq('id', intento.intent_id);
  if (errorGuardar) registrarFallo('create-payment-link:guardar-enlace', errorGuardar);

  return json({
    ok: true,
    provider: 'wompi',
    intent_id: intento.intent_id,
    reference: intento.reference,
    amount_cents: Number(intento.amount_cents),
    currency: intento.currency,
    checkout_url: enlace,
    expires_at: intento.expires_at,
    reused: intento.reused === true,
  }, 200, cors);
}

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
    // 1 · Autorización. La hace RLS.
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

    // 2 · Pasarela del box. Se lee después de autorizar para no delatar un
    //     despliegue mal configurado a quien ni siquiera tiene acceso.
    const servicio = clienteDeServicio();
    const pasarela = await pasarelaDelBox(servicio, factura.org_id);

    try {
      return pasarela === 'mercadopago'
        ? await enlaceMercadoPago(servicio, factura as Factura, sesion.user.id, cors)
        : await enlaceWompi(servicio, factura as Factura, sesion.user.id, cors);
    } catch (causa) {
      // open_payment_intent lanza con mensajes en español (factura saldada,
      // anulada…): se propagan tal cual.
      registrarFallo('create-payment-link:intento', causa);
      const mensaje = causa instanceof Error && causa.message
        ? causa.message
        : 'No se pudo generar el enlace para esa factura.';
      return error(409, 'no_se_pudo_abrir', mensaje, cors);
    }
  } catch (causa) {
    registrarFallo('create-payment-link', causa);
    return error(500, 'error_interno', 'No se pudo generar el enlace de pago.', cors);
  }
});
