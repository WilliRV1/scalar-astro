/**
 * Fechas como las lee la gente, no como las guarda la base.
 *
 * Todo entra como ISO (`2026-09-23`, o un timestamp) y sale en español de
 * Colombia. Las fechas sin hora se interpretan como día calendario, sin
 * zona horaria: `2026-09-23` es el 23 en Cali aunque el celular esté en UTC.
 */

function aFecha(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const soloDia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (soloDia) {
    return new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3]));
  }
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `2026-09-23` -> "23 sep 2026". */
export function fechaCorta(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(d).replace(/\./g, '');
}

/** `2026-09-23` -> "23 de septiembre". Para mensajes que se le mandan a alguien. */
export function fechaLarga(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' }).format(d);
}

/** `2026-09` o `2026-09-01` -> "septiembre de 2026". */
export function mesLargo(valor: string | Date | null | undefined): string {
  const d = aFecha(typeof valor === 'string' && /^\d{4}-\d{2}$/.test(valor) ? `${valor}-01` : valor);
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(d);
}

/** Timestamp -> "23 sep, 4:05 p. m.". */
export function fechaYHora(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(d).replace(/\./g, '');
}
