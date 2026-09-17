/**
 * Fechas calendario del box.
 *
 * "Hoy" es hoy EN EL BOX, no en UTC ni en la zona del celular de quien viaja.
 * A las 7 p. m. de Bogotá ya es el día siguiente en UTC: sin esto, el coach
 * abriría la app en la tarde y vería el WOD de mañana.
 *
 * Todas las fechas se manejan como texto AAAA-MM-DD, que es lo que guarda
 * Postgres en un `date`. Nada de objetos Date sueltos: construir un Date desde
 * "2026-09-17" lo interpreta como medianoche UTC y en Colombia eso es el 16.
 */

export const BOGOTA = 'America/Bogota';

/** Hoy en la zona del box, como AAAA-MM-DD. */
export function todayInBox(timezone: string = BOGOTA): string {
  // 'en-CA' da exactamente AAAA-MM-DD, que es lo que espera Postgres.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Suma (o resta) días a una fecha AAAA-MM-DD sin salirse del calendario. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  // Date.UTC evita que el desfase horario mueva el día.
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** El lunes de la semana de esa fecha. En Colombia la semana arranca el lunes. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  const desdeLunes = (dow + 6) % 7;
  return addDays(date, -desdeLunes);
}

/** Los siete días de la semana de esa fecha, de lunes a domingo. */
export function weekDays(date: string): string[] {
  const lunes = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** "Mié 17" para el calendario semanal. */
export function shortDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[(dow + 6) % 7]} ${d}`;
}

/** "miércoles 17 de septiembre" para el encabezado del día. */
export function longDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
