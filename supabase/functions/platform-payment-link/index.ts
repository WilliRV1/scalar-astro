// =============================================================================
// platform-payment-link · el enlace para que un box le pague a Scalar
// =============================================================================
// Entrada:  POST { "org_id": "<uuid>" }  con el JWT del dueño.
// Salida:   { checkout_url, amount_cents, period_start, period_end, plan_tier, expires_at }
//
// Quién puede pedirlo lo decide RLS: `platform_subscriptions` solo la ve el
// dueño del box. Si la política no devuelve la suscripción, no hay enlace.
//
// El monto y el periodo los fija `open_platform_payment_intent` en la base
// (precio del plan + cuota de implementación si es el primer pago). La cuenta
// que cobra es la de SCALAR (SCALAR_MP_ACCESS_TOKEN), nunca la de un box.
// =============================================================================

import { env, envEntero } from '../_shared/env.ts';
import { cabecerasCors, error, json, registrarFallo } from '../_shared/http.ts';
import { clienteDeServicio, clienteDelUsuario } from '../_shared/supabase.ts';
import { sufijoAleatorio } from '../_shared/wompi.ts';
import { ambienteDeToken, crearPreferencia, fechaParaMercadoPago } from '../_shared/mercadopago.ts';

/** Vigencia del enlace: 7 días. El dueño paga cuando le queda bien. */
const MINUTOS_DE_VIGENCIA = () => envEntero('PLATFORM_LINK_TTL_MINUTES', 7 * 24 * 60);

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOMBRE_PLAN: Record<string, string> = {
  starter: 'Starter',
  box: 'Box',
  pro: 'Pro',
  chain: 'Cadena',
  trial: 'Prueba',
};

interface Intento {
  intent_id: string;
  org_id: string;
  amount_cents: number;
  currency: string;
  reference: string;
  expires_at: string | null;
  period_start: string;
  period_end: string;
  plan_tier: string;
  checkout_url: string | null;
  reused: boolean;
}

function generarReferenciaDePlataforma(orgId: string): string {
  return `SCL-PLAT-${orgId.replace(/-/g, '').slice(0, 8).toUpperCase()}-${sufijoAleatorio()}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
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

  let cuerpo: { org_id?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return error(400, 'cuerpo_invalido', 'El cuerpo de la petición no es JSON válido.', cors);
  }
  const orgId = cuerpo.org_id?.trim().toLowerCase();
  if (!orgId || !ES_UUID.test(orgId)) {
    return error(400, 'box_invalido', 'Hay que indicar un org_id válido.', cors);
  }

  try {
    // 1 · Autorización: la suscripción solo la devuelve la RLS al dueño.
    const usuario = clienteDelUsuario(authorization);
    const { data: sesion, error: errorSesion } = await usuario.auth.getUser();
    if (errorSesion || !sesion?.user) {
      return error(401, 'sesion_invalida', 'La sesión no es válida o expiró.', cors);
    }

    const { data: suscripcion, error: errorSub } = await usuario
      .from('platform_subscriptions')
      .select('id, org_id, plan_tier, price_cents, status')
      .eq('org_id', orgId)
      .neq('status', 'cancelled')
      .maybeSingle();
    if (errorSub) {
      registrarFallo('platform-payment-link:suscripcion', errorSub);
      return error(500, 'error_interno', 'No se pudo consultar la suscripción.', cors);
    }
    if (!suscripcion) {
      return error(404, 'sin_suscripcion', 'No encontramos la suscripción de tu box. Solo el dueño puede pagarla.', cors);
    }

    // 2 · La cuenta de Scalar. Se lee después de autorizar.
    const token = env('SCALAR_MP_ACCESS_TOKEN');
    if (!token || ambienteDeToken(token) === 'desconocido') {
      registrarFallo('platform-payment-link:config', new Error('SCALAR_MP_ACCESS_TOKEN falta o no empieza por TEST-/APP_USR-'));
      return error(
        409, 'pasarela_sin_configurar',
        'Scalar todavía no tiene activado el pago en línea. Escríbenos por WhatsApp y lo registramos a mano.',
        cors,
      );
    }
    const sitio = (env('PUBLIC_URL') ?? env('SITIO_PERMITIDO') ?? '').replace(/\/$/, '');
    if (!sitio) {
      registrarFallo('platform-payment-link:config', new Error('Falta PUBLIC_URL para armar la URL del webhook'));
      return error(500, 'error_interno', 'La pasarela no está bien configurada.', cors);
    }

    // 3 · Abrir el intento. Monto y periodo quedan fijados en la base.
    const servicio = clienteDeServicio();
    const vence = new Date(Date.now() + MINUTOS_DE_VIGENCIA() * 60_000).toISOString();
    const { data: intentos, error: errorIntento } = await servicio.rpc('open_platform_payment_intent', {
      p_org_id: orgId,
      p_reference: generarReferenciaDePlataforma(orgId),
      p_expires_at: vence,
      p_created_by: sesion.user.id,
    });
    if (errorIntento) {
      // Los mensajes de la base están redactados para la persona ("todavía no
      // tiene un plan con precio asignado"): se muestran tal cual.
      registrarFallo('platform-payment-link:open_platform_payment_intent', errorIntento);
      return error(409, 'no_se_pudo_abrir', errorIntento.message || 'No se pudo generar el enlace de pago.', cors);
    }
    const intento = (Array.isArray(intentos) ? intentos[0] : intentos) as Intento | undefined;
    if (!intento) {
      return error(500, 'error_interno', 'No se pudo generar el enlace de pago.', cors);
    }

    const respuesta = (checkoutUrl: string, reused: boolean) => json({
      ok: true,
      provider: 'mercadopago',
      intent_id: intento.intent_id,
      reference: intento.reference,
      amount_cents: Number(intento.amount_cents),
      currency: intento.currency,
      period_start: intento.period_start,
      period_end: intento.period_end,
      plan_tier: intento.plan_tier,
      checkout_url: checkoutUrl,
      expires_at: intento.expires_at,
      reused,
    }, 200, cors);

    if (intento.reused && intento.checkout_url) {
      return respuesta(intento.checkout_url, true);
    }

    // 4 · La preferencia, a nombre de Scalar.
    const plan = NOMBRE_PLAN[intento.plan_tier] ?? intento.plan_tier;
    let preferencia;
    try {
      preferencia = await crearPreferencia({
        token,
        itemId: `scalar-${intento.plan_tier}`,
        titulo: `Scalar · plan ${plan}`,
        descripcion: `Del ${intento.period_start} al ${intento.period_end}`,
        montoCentavos: intento.amount_cents,
        moneda: intento.currency,
        referencia: intento.reference,
        notificationUrl: `${sitio}/functions/v1/mercadopago-webhook/scalar`,
        backUrl: env('MERCADOPAGO_BACK_URL') ?? `${sitio}/admin/configuracion`,
        expiraISO: intento.expires_at ? fechaParaMercadoPago(new Date(intento.expires_at)) : undefined,
        correo: sesion.user.email ?? undefined,
        metadata: { scalar: 'platform', org_id: orgId, intent_id: intento.intent_id },
        idempotencyKey: intento.intent_id,
      });
    } catch (causa) {
      registrarFallo('platform-payment-link:mercadopago', causa);
      return error(502, 'pasarela_no_responde', 'Mercado Pago no respondió. Intenta de nuevo en un momento.', cors);
    }

    const { error: errorGuardar } = await servicio
      .from('platform_payment_intents')
      .update({ checkout_url: preferencia.init_point, provider_checkout_id: String(preferencia.id) })
      .eq('id', intento.intent_id);
    if (errorGuardar) registrarFallo('platform-payment-link:guardar-enlace', errorGuardar);

    return respuesta(preferencia.init_point, false);
  } catch (causa) {
    registrarFallo('platform-payment-link', causa);
    return error(500, 'error_interno', 'No se pudo generar el enlace de pago.', cors);
  }
});
