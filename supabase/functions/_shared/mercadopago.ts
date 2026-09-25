// =============================================================================
// Mercado Pago · firma del webhook, preferencia de Checkout Pro y consulta de pagos
// =============================================================================
// Lo que hay aquí sale de la documentación oficial; lo que no se pudo confirmar
// contra la API real está marcado con VERIFICAR y recogido en
// docs/20-mercadopago.md, como se hizo con Wompi.
//
// Fuentes:
//   · Webhooks (firma x-signature)
//     mercadopago.com.co/developers/es/docs/checkout-api-payments/additional-content/your-integrations/notifications/webhooks
//   · Crear preferencia  mercadopago.com.co/developers/es/reference/preferences/_checkout_preferences/post
//   · Consultar pago     mercadopago.com.co/developers/es/reference/payments/_payments_id/get
//
// Principio que manda en todo el flujo: la notificación del webhook NO es la
// verdad. Solo trae el id del pago. El estado, el monto y la referencia se
// CONSULTAN en la API con el access token del box. Aunque alguien lograra
// firmar un aviso falso, lo único que consigue es que volvamos a leer un pago
// real.
// =============================================================================

import { igualesEnTiempoConstante } from './wompi.ts';

export const API_MERCADOPAGO = 'https://api.mercadopago.com';

/**
 * El ambiente lo dice el prefijo del access token: TEST- son las credenciales
 * de prueba de la aplicación; APP_USR- son las de producción (o las de un
 * usuario de prueba, que se comportan como producción dentro del sandbox).
 */
export type AmbienteMP = 'test' | 'prod' | 'desconocido';

export function ambienteDeToken(token: string): AmbienteMP {
  if (token.startsWith('TEST-')) return 'test';
  if (token.startsWith('APP_USR-')) return 'prod';
  return 'desconocido';
}

// -----------------------------------------------------------------------------
// Notificación y pago
// -----------------------------------------------------------------------------
/** Cuerpo de una notificación de webhook (tópico `payment`). */
export interface NotificacionMP {
  id?: number | string;
  live_mode?: boolean;
  type?: string;
  topic?: string;
  action?: string;
  api_version?: string;
  date_created?: string;
  user_id?: number | string;
  data?: { id?: string | number };
  [clave: string]: unknown;
}

/** Estados posibles de un pago. Fuente: Consultar pago. */
export type EstadoPagoMP =
  | 'pending' | 'approved' | 'authorized' | 'in_process' | 'in_mediation'
  | 'rejected' | 'cancelled' | 'refunded' | 'charged_back';

export interface PagoMP {
  id: number | string;
  status: EstadoPagoMP | string;
  status_detail?: string;
  /** En PESOS, con decimales. No en centavos. */
  transaction_amount: number;
  currency_id?: string;
  external_reference?: string | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  date_approved?: string | null;
  date_created?: string;
  date_last_updated?: string;
  live_mode?: boolean;
  metadata?: Record<string, unknown>;
  payer?: { email?: string | null; [clave: string]: unknown };
  order?: { type?: string; id?: string | number };
  [clave: string]: unknown;
}

// -----------------------------------------------------------------------------
// Dinero: la API trabaja en pesos, nosotros en centavos
// -----------------------------------------------------------------------------
export function centavosDesdeMonto(monto: number): number {
  return Math.round(monto * 100);
}

export function montoDesdeCentavos(centavos: number | bigint): number {
  return Number(centavos) / 100;
}

// -----------------------------------------------------------------------------
// Firma del webhook
// -----------------------------------------------------------------------------
// Cabeceras: `x-signature: ts=<epoch>,v1=<hmac hex>` y `x-request-id`.
// Manifiesto documentado: "id:[data.id];request-id:[x-request-id];ts:[ts];"
//   · data.id sale de la QUERY (?data.id=…), no del cuerpo;
//   · si data.id es alfanumérico va en minúsculas;
//   · los valores que falten se omiten con su tramo entero.
// HMAC-SHA256 con la "clave secreta" de Webhooks → Configurar notificaciones,
// en hexadecimal, comparado contra v1.
//
// VERIFICAR: la documentación se ha visto con y sin el ";" final y con y sin
// la nota de minúsculas. Se aceptan las cuatro variantes y se registra cuál
// coincidió, para fijarla en cuanto llegue el primer evento real.
// -----------------------------------------------------------------------------
export function parsearXSignature(cabecera: string | null): { ts: string; v1: string } | undefined {
  if (!cabecera) return undefined;
  const partes: Record<string, string> = {};
  for (const tramo of cabecera.split(',')) {
    const i = tramo.indexOf('=');
    if (i <= 0) continue;
    partes[tramo.slice(0, i).trim()] = tramo.slice(i + 1).trim();
  }
  if (!partes.ts || !partes.v1) return undefined;
  return { ts: partes.ts, v1: partes.v1 };
}

export function manifiestosPosibles(dataId: string, requestId: string | null, ts: string): string[] {
  const enMinusculas = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const armar = (id: string, puntoFinal: boolean) => {
    const tramos = [`id:${id}`];
    if (requestId) tramos.push(`request-id:${requestId}`);
    tramos.push(`ts:${ts}`);
    return tramos.join(';') + (puntoFinal ? ';' : '');
  };
  // La oficial primero; las demás solo por si la documentación cambió.
  return [...new Set([
    armar(enMinusculas, true),
    armar(dataId, true),
    armar(enMinusculas, false),
    armar(dataId, false),
  ])];
}

export async function hmacSha256Hex(secreto: string, mensaje: string): Promise<string> {
  const codificador = new TextEncoder();
  const llave = await crypto.subtle.importKey(
    'raw', codificador.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', llave, codificador.encode(mensaje));
  return Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type VerificacionMP =
  | { valido: true; variante: number; ts: string }
  | { valido: false; motivo: string };

export async function verificarFirmaMercadoPago(args: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secreto: string;
}): Promise<VerificacionMP> {
  const firma = parsearXSignature(args.xSignature);
  if (!firma) return { valido: false, motivo: 'falta x-signature o no trae ts y v1' };
  if (!args.dataId) return { valido: false, motivo: 'falta data.id en la URL' };
  if (!/^[0-9a-f]{64}$/i.test(firma.v1)) return { valido: false, motivo: 'v1 no es un HMAC-SHA256 en hexadecimal' };

  const candidatos = manifiestosPosibles(args.dataId, args.xRequestId, firma.ts);
  for (let i = 0; i < candidatos.length; i++) {
    const calculado = await hmacSha256Hex(args.secreto, candidatos[i]);
    if (igualesEnTiempoConstante(calculado, firma.v1.toLowerCase())) {
      return { valido: true, variante: i, ts: firma.ts };
    }
  }
  return { valido: false, motivo: 'la firma no coincide con ningún manifiesto' };
}

// -----------------------------------------------------------------------------
// Estado de Mercado Pago -> estado del intento
// -----------------------------------------------------------------------------
export type EstadoIntento = 'approved' | 'pending' | 'declined' | 'voided' | 'refunded';

export function estadoIntentoDesde(estado: string): EstadoIntento | undefined {
  switch (estado.toLowerCase()) {
    case 'approved': return 'approved';
    case 'pending':
    case 'in_process':
    case 'authorized':
    case 'in_mediation': return 'pending';
    case 'rejected': return 'declined';
    case 'cancelled': return 'voided';
    case 'refunded':
    case 'charged_back': return 'refunded';
    default: return undefined;
  }
}

// -----------------------------------------------------------------------------
// Fechas: la API pide ISO 8601 CON desplazamiento ("2026-09-28T10:00:00.000-05:00")
// -----------------------------------------------------------------------------
// VERIFICAR: la referencia muestra siempre un desplazamiento explícito; no
// se ha confirmado si acepta la "Z". Se manda en hora de Bogotá (-05:00).
export function fechaParaMercadoPago(fecha: Date, desplazamientoMinutos = -300): string {
  const local = new Date(fecha.getTime() + desplazamientoMinutos * 60_000);
  const dd = (n: number, largo = 2) => String(n).padStart(largo, '0');
  const signo = desplazamientoMinutos < 0 ? '-' : '+';
  const abs = Math.abs(desplazamientoMinutos);
  return (
    `${local.getUTCFullYear()}-${dd(local.getUTCMonth() + 1)}-${dd(local.getUTCDate())}` +
    `T${dd(local.getUTCHours())}:${dd(local.getUTCMinutes())}:${dd(local.getUTCSeconds())}` +
    `.${dd(local.getUTCMilliseconds(), 3)}${signo}${dd(Math.floor(abs / 60))}:${dd(abs % 60)}`
  );
}

// -----------------------------------------------------------------------------
// Crear una preferencia de Checkout Pro
// -----------------------------------------------------------------------------
export interface DatosPreferencia {
  token: string;
  itemId: string;
  titulo: string;
  descripcion?: string;
  montoCentavos: number | bigint;
  moneda: string;
  referencia: string;
  notificationUrl: string;
  /** A dónde vuelve la persona después de pagar. Sin esto no hay auto_return. */
  backUrl?: string;
  expiraISO?: string;
  correo?: string;
  nombre?: string;
  apellido?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface PreferenciaMP {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
  [clave: string]: unknown;
}

export function cuerpoDePreferencia(d: DatosPreferencia): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {
    items: [{
      id: d.itemId,
      title: d.titulo,
      description: d.descripcion,
      quantity: 1,
      unit_price: montoDesdeCentavos(d.montoCentavos),
      currency_id: d.moneda,
    }],
    external_reference: d.referencia,
    notification_url: d.notificationUrl,
    metadata: d.metadata ?? {},
  };
  if (d.backUrl) {
    cuerpo.back_urls = { success: d.backUrl, failure: d.backUrl, pending: d.backUrl };
    cuerpo.auto_return = 'approved';
  }
  if (d.expiraISO) {
    cuerpo.expires = true;
    cuerpo.expiration_date_to = d.expiraISO;
  }
  if (d.correo || d.nombre) {
    cuerpo.payer = { email: d.correo, name: d.nombre, surname: d.apellido };
  }
  return cuerpo;
}

/** Texto corto de un error de la API, sin el token ni el cuerpo entero. */
async function resumenDeError(respuesta: Response): Promise<string> {
  let detalle = '';
  try {
    const cuerpo = await respuesta.json() as { message?: string; error?: string; cause?: unknown };
    detalle = String(cuerpo.message ?? cuerpo.error ?? '').slice(0, 200);
  } catch {
    // sin cuerpo legible
  }
  return `Mercado Pago respondió ${respuesta.status}${detalle ? `: ${detalle}` : ''}`;
}

export async function crearPreferencia(
  d: DatosPreferencia,
  fetchImpl: typeof fetch = fetch,
): Promise<PreferenciaMP> {
  const cabeceras: Record<string, string> = {
    authorization: `Bearer ${d.token}`,
    'content-type': 'application/json',
  };
  if (d.idempotencyKey) cabeceras['x-idempotency-key'] = d.idempotencyKey;

  const respuesta = await fetchImpl(`${API_MERCADOPAGO}/checkout/preferences`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify(cuerpoDePreferencia(d)),
  });
  if (!respuesta.ok) throw new Error(await resumenDeError(respuesta));

  const pref = await respuesta.json() as PreferenciaMP;
  if (!pref?.id || !pref?.init_point) {
    throw new Error('Mercado Pago devolvió una preferencia sin id o sin init_point');
  }
  return pref;
}

// -----------------------------------------------------------------------------
// Consultar un pago: LA fuente de verdad
// -----------------------------------------------------------------------------
export async function consultarPago(
  token: string,
  pagoId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PagoMP> {
  if (!/^[0-9A-Za-z_-]{1,64}$/.test(pagoId)) {
    throw new Error('El id del pago no tiene una forma válida');
  }
  const respuesta = await fetchImpl(`${API_MERCADOPAGO}/v1/payments/${pagoId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) throw new Error(await resumenDeError(respuesta));

  const pago = await respuesta.json() as PagoMP;
  if (pago?.id === undefined || typeof pago.status !== 'string') {
    throw new Error('Mercado Pago devolvió un pago sin id o sin estado');
  }
  return pago;
}

/**
 * Lo que se guarda del pago en la bitácora: lo que hace falta para auditar,
 * sin el bloque del pagador (correo, documento).
 */
export function resumenDePago(pago: PagoMP): Record<string, unknown> {
  return {
    id: pago.id,
    status: pago.status,
    status_detail: pago.status_detail,
    transaction_amount: pago.transaction_amount,
    currency_id: pago.currency_id,
    external_reference: pago.external_reference,
    payment_method_id: pago.payment_method_id,
    payment_type_id: pago.payment_type_id,
    date_approved: pago.date_approved,
    date_created: pago.date_created,
    live_mode: pago.live_mode,
    order: pago.order,
  };
}
