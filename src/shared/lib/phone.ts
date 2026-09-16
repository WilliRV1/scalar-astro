/**
 * Normalización de teléfonos a E.164.
 *
 * La base de datos rechaza cualquier teléfono que no sea E.164 porque es la
 * llave del canal de WhatsApp: un número mal formateado es un cobro que nunca
 * llega. Los boxes traen los números en todos los formatos imaginables
 * ("300 123 4567", "(+57) 300-1234567", "57 3001234567"), así que la
 * normalización tiene que pasar antes de guardar y antes de importar el Excel.
 */

const DEFAULT_COUNTRY_CODE = '57'; // Colombia

/**
 * Devuelve el número en E.164 (+573001234567) o null si no es reconocible.
 * Asume Colombia cuando el número viene sin indicativo.
 */
export function toE164(raw: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null;

  const hadPlus = raw.trim().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // 00 como prefijo internacional
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (!hadPlus && countryCode === '57') {
    // Celular colombiano suelto: 10 dígitos que empiezan por 3
    if (digits.length === 10 && digits.startsWith('3')) digits = countryCode + digits;
    // Fijo de Cali con indicativo de área (602 + 7 dígitos)
    else if (digits.length === 10 && digits.startsWith('60')) digits = countryCode + digits;
    // Ya trae el 57 al frente
    else if (digits.length === 12 && digits.startsWith('57')) { /* tal cual */ }
    // Fijo de 7 dígitos: sin indicativo de área no se puede inferir
    else if (digits.length === 7) return null;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** +573001234567 -> "300 123 4567" para mostrar en pantalla. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '—';
  const m = /^\+57(3\d{2})(\d{3})(\d{4})$/.exec(e164);
  if (m) return `${m[1]} ${m[2]} ${m[3]}`;
  return e164;
}

/** Enlace de WhatsApp con el mensaje ya redactado (etapa 0 de docs/04). */
export function whatsappLink(e164: string, message: string): string {
  return `https://wa.me/${e164.replace('+', '')}?text=${encodeURIComponent(message)}`;
}
