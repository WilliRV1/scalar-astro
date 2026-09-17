/**
 * Festivos colombianos en el cliente.
 *
 * Espejo exacto de `public.colombian_holidays()` (migración 0014). Se CALCULAN,
 * no se siembran: una lista a mano de 2026 y 2027 obliga a acordarse de 2028, y
 * el día que no se actualice la parrilla ofrece clase el 1 de enero.
 *
 * Aquí sirve para pintar: la parrilla del coach marca el día festivo antes de
 * que genere clases que después va a tener que cancelar. La decisión de verdad
 * —qué clases existen— la sigue tomando la base.
 *
 * Todas las fechas son texto AAAA-MM-DD, como en `src/features/wods/dates.ts`:
 * construir un Date desde "2026-01-12" lo lee como medianoche UTC y en Colombia
 * eso todavía es el 11.
 */

/** Suma días a una fecha AAAA-MM-DD sin salirse del calendario. */
function sumar(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

function fecha(anio: number, mes: number, dia: number): string {
  return new Date(Date.UTC(anio, mes - 1, dia)).toISOString().slice(0, 10);
}

/** El lunes siguiente, o la misma fecha si ya es lunes. Es la Ley Emiliani. */
export function siguienteLunes(f: string): string {
  const [y, m, d] = f.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  const isodow = dow === 0 ? 7 : dow;
  return sumar(f, (8 - isodow) % 7);
}

/**
 * Domingo de Pascua gregoriano (algoritmo de Meeus/Butcher).
 * De aquí salen los seis festivos móviles.
 */
export function pascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return fecha(anio, mes, dia);
}

/** Los 18 festivos colombianos de un año, ya corridos al lunes donde toca. */
export function festivosColombia(anio: number): string[] {
  const p = pascua(anio);
  return [
    // Fijos: la ley no los mueve nunca.
    fecha(anio, 1, 1), // Año Nuevo
    fecha(anio, 5, 1), // Día del Trabajo
    fecha(anio, 7, 20), // Independencia
    fecha(anio, 8, 7), // Batalla de Boyacá
    fecha(anio, 12, 8), // Inmaculada Concepción
    fecha(anio, 12, 25), // Navidad
    // Emiliani: al lunes siguiente.
    siguienteLunes(fecha(anio, 1, 6)), // Reyes Magos
    siguienteLunes(fecha(anio, 3, 19)), // San José
    siguienteLunes(fecha(anio, 6, 29)), // San Pedro y San Pablo
    siguienteLunes(fecha(anio, 8, 15)), // Asunción
    siguienteLunes(fecha(anio, 10, 12)), // Día de la Raza
    siguienteLunes(fecha(anio, 11, 1)), // Todos los Santos
    siguienteLunes(fecha(anio, 11, 11)), // Independencia de Cartagena
    // Semana Santa: caen donde caen.
    sumar(p, -3), // Jueves Santo
    sumar(p, -2), // Viernes Santo
    // Móviles con traslado al lunes.
    sumar(p, 43), // Ascensión del Señor
    sumar(p, 64), // Corpus Christi
    sumar(p, 71), // Sagrado Corazón de Jesús
  ].sort();
}

const cache = new Map<number, Set<string>>();

/** ¿Esa fecha AAAA-MM-DD es festivo en Colombia? */
export function esFestivo(f: string): boolean {
  const anio = Number(f.slice(0, 4));
  if (!Number.isInteger(anio)) return false;
  let set = cache.get(anio);
  if (!set) {
    set = new Set(festivosColombia(anio));
    cache.set(anio, set);
  }
  return set.has(f);
}
