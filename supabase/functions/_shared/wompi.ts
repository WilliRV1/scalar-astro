// =============================================================================
// Wompi · tipos, firmas y armado del enlace de checkout
// =============================================================================
// TODO lo de este archivo sale de la documentación oficial. Cada bloque cita su
// fuente. Lo que no se pudo confirmar contra la API real está marcado con
// VERIFICAR y recogido en docs/10-wompi.md.
//
// Fuentes:
//   · Widget & Checkout Web   https://docs.wompi.co/docs/colombia/widget-checkout-web/
//   · Eventos                 https://docs.wompi.co/docs/colombia/eventos/
//   · Ambientes y llaves      https://docs.wompi.co/docs/colombia/ambientes-y-llaves/
//   · Métodos de pago         https://docs.wompi.co/docs/colombia/metodos-de-pago/
// =============================================================================

/** URL del Checkout Web. Fuente: Widget & Checkout Web (form action, method GET). */
export const CHECKOUT_URL = 'https://checkout.wompi.co/p/';

/**
 * No hay una URL de checkout distinta para pruebas: el ambiente lo determina el
 * prefijo de la llave pública (`pub_test_` vs `pub_prod_`).
 * Fuente: Ambientes y llaves + Widget & Checkout Web.
 */
export type AmbienteWompi = 'test' | 'prod';

export function ambienteDeLlave(llavePublica: string): AmbienteWompi | 'desconocido' {
  if (llavePublica.startsWith('pub_test_')) return 'test';
  if (llavePublica.startsWith('pub_prod_')) return 'prod';
  return 'desconocido';
}

// -----------------------------------------------------------------------------
// Estructura del evento
// -----------------------------------------------------------------------------
// Fuente: Eventos. El cuerpo es:
//   { event, data, environment, signature: { properties, checksum }, timestamp, sent_at }
// OJO: el evento NO trae identificador propio. Por eso usamos
// `signature.checksum` como clave de idempotencia (ver la migración 0009).
// -----------------------------------------------------------------------------

/** Estados finales de una transacción. Fuente: Eventos / Transacciones. */
export type EstadoWompi = 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';

export interface TransaccionWompi {
  id: string;
  amount_in_cents: number;
  reference: string;
  customer_email?: string | null;
  currency?: string;
  payment_method_type?: string | null;
  redirect_url?: string | null;
  status: EstadoWompi | string;
  finalized_at?: string | null;
  [clave: string]: unknown;
}

export interface EventoWompi {
  event: string;
  data: { transaction?: TransaccionWompi; [clave: string]: unknown };
  environment?: string;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
  sent_at?: string;
}

// -----------------------------------------------------------------------------
// SHA-256 en hexadecimal
// -----------------------------------------------------------------------------
export async function sha256Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(resumen))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Comparación en tiempo constante.
 * Comparar hashes con `===` filtra información por el tiempo de respuesta:
 * quien tantea la firma puede ir adivinándola byte a byte.
 */
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

// -----------------------------------------------------------------------------
// Firma de integridad (la que va EN el enlace)
// -----------------------------------------------------------------------------
// Fuente: Widget & Checkout Web. SHA-256 de la concatenación, en este orden:
//   referencia + monto_en_centavos + moneda + [tiempo_de_expiracion] + secreto
// El tiempo de expiración SOLO entra si se manda `expiration-time`.
// -----------------------------------------------------------------------------
export function cadenaDeIntegridad(
  referencia: string,
  montoEnCentavos: number | bigint,
  moneda: string,
  secretoDeIntegridad: string,
  expiracionISO?: string,
): string {
  return expiracionISO
    ? `${referencia}${montoEnCentavos}${moneda}${expiracionISO}${secretoDeIntegridad}`
    : `${referencia}${montoEnCentavos}${moneda}${secretoDeIntegridad}`;
}

export function firmaDeIntegridad(
  referencia: string,
  montoEnCentavos: number | bigint,
  moneda: string,
  secretoDeIntegridad: string,
  expiracionISO?: string,
): Promise<string> {
  return sha256Hex(
    cadenaDeIntegridad(referencia, montoEnCentavos, moneda, secretoDeIntegridad, expiracionISO),
  );
}

// -----------------------------------------------------------------------------
// Verificación de la firma del EVENTO
// -----------------------------------------------------------------------------
// Fuente: Eventos. Pasos documentados:
//   1. tomar los valores de los campos que lista `signature.properties`, EN ESE
//      ORDEN. Las rutas ("transaction.id") son relativas a `data`.
//   2. concatenarlos sin separadores
//   3. concatenar `timestamp`
//   4. concatenar el secreto de eventos
//   5. SHA-256 y comparar contra `signature.checksum`
//
// La documentación insiste en que `properties` PUEDE CAMBIAR con el tiempo y
// entre eventos, así que se leen del evento y nunca se fijan en el código.
//
// VERIFICAR: el ejemplo publicado por Wompi no es reproducible — el hash que
// muestra no sale de la cadena que la misma página construye. Se implementaron
// los pasos tal como están descritos, pero esto solo queda confirmado con un
// evento real de sandbox. Ver docs/10-wompi.md.
// -----------------------------------------------------------------------------

/** Resuelve "transaction.amount_in_cents" dentro de `data`. */
export function valorPorRuta(raiz: unknown, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((actual, tramo) => {
    if (actual === null || actual === undefined || typeof actual !== 'object') return undefined;
    return (actual as Record<string, unknown>)[tramo];
  }, raiz);
}

export type ResultadoVerificacion =
  | { valido: true }
  | { valido: false; motivo: string };

export async function verificarFirmaDeEvento(
  evento: EventoWompi,
  secretoDeEventos: string,
): Promise<ResultadoVerificacion> {
  const propiedades = evento?.signature?.properties;
  const checksum = evento?.signature?.checksum;

  if (!Array.isArray(propiedades) || propiedades.length === 0) {
    return { valido: false, motivo: 'el evento no trae signature.properties' };
  }
  if (typeof checksum !== 'string' || checksum.length === 0) {
    return { valido: false, motivo: 'el evento no trae signature.checksum' };
  }
  if (typeof evento.timestamp !== 'number' || !Number.isFinite(evento.timestamp)) {
    return { valido: false, motivo: 'el evento no trae timestamp' };
  }

  let concatenado = '';
  for (const ruta of propiedades) {
    const valor = valorPorRuta(evento.data, ruta);
    // Si falta una propiedad firmada no se puede reconstruir la firma. Se
    // rechaza: nunca "se asume vacío".
    if (valor === undefined || valor === null) {
      return { valido: false, motivo: `falta la propiedad firmada ${ruta}` };
    }
    concatenado += String(valor);
  }
  concatenado += String(evento.timestamp);
  concatenado += secretoDeEventos;

  const calculado = await sha256Hex(concatenado);

  // Wompi publica el checksum en mayúsculas; se compara sin distinguir
  // may/min para no depender de eso.
  return igualesEnTiempoConstante(calculado.toLowerCase(), checksum.toLowerCase())
    ? { valido: true }
    : { valido: false, motivo: 'la firma no coincide' };
}

// -----------------------------------------------------------------------------
// Armado del enlace de checkout
// -----------------------------------------------------------------------------
// El formulario documentado es <form action="https://checkout.wompi.co/p/"
// method="GET"> con campos ocultos, lo que el navegador convierte exactamente
// en esta cadena de consulta. `signature:integrity` lleva dos puntos en el
// nombre: URLSearchParams lo codifica como corresponde.
// -----------------------------------------------------------------------------
export interface DatosDelEnlace {
  llavePublica: string;
  referencia: string;
  montoEnCentavos: number;
  moneda: string;
  firmaDeIntegridad: string;
  urlDeRetorno?: string;
  expiracionISO?: string;
  correoDelCliente?: string;
  nombreDelCliente?: string;
}

export function armarEnlaceDeCheckout(d: DatosDelEnlace): string {
  const p = new URLSearchParams();
  p.set('public-key', d.llavePublica);
  p.set('currency', d.moneda);
  p.set('amount-in-cents', String(d.montoEnCentavos));
  p.set('reference', d.referencia);
  p.set('signature:integrity', d.firmaDeIntegridad);

  if (d.urlDeRetorno) p.set('redirect-url', d.urlDeRetorno);
  if (d.expiracionISO) p.set('expiration-time', d.expiracionISO);
  // Prellenar estos campos le ahorra escribirlos al atleta. Solo se mandan si
  // el box los tiene.
  // VERIFICAR: `customer-data:phone-number` no se envía porque la
  // documentación no precisa si espera el indicativo (+57) o solo los 10
  // dígitos. Ver docs/10-wompi.md.
  if (d.correoDelCliente) p.set('customer-data:email', d.correoDelCliente);
  if (d.nombreDelCliente) p.set('customer-data:full-name', d.nombreDelCliente);

  return `${CHECKOUT_URL}?${p.toString()}`;
}

// -----------------------------------------------------------------------------
// Referencia de pago
// -----------------------------------------------------------------------------
// Wompi solo admite alfanuméricos, guion y guion bajo, y una referencia ya
// usada en una transacción completada NO se puede reutilizar.
// Fuente: Widget & Checkout Web.
//
// La referencia lleva el box dentro a propósito: es única por box en nuestra
// base, y el prefijo evita que dos boxes generen la misma cadena (cosa que
// `apply_wompi_payment` rechaza ruidosamente).
// -----------------------------------------------------------------------------
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin I, L, O, 0, 1

export function sufijoAleatorio(largo = 10): string {
  const bytes = new Uint8Array(largo);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

export function generarReferencia(orgId: string, numeroDeFactura: string): string {
  const box = orgId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const factura = numeroDeFactura.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 20);
  return `SCL-${box}-${factura}-${sufijoAleatorio()}`;
}
