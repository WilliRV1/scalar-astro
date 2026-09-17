/**
 * Lógica pura del P&L: agrupar meses, comparar contra el anterior y decidir
 * qué se puede comparar y qué no.
 *
 * Está aparte de los componentes a propósito. Es la parte que, si se equivoca,
 * le dice al dueño que ganó plata el mes que perdió, así que se prueba sola
 * (src/features/finance/__tests__/pnl.test.ts) sin montar React ni Supabase.
 */

import type { MembershipMonth, PnlMonth } from './types';

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/**
 * '2026-03-01' -> 'mar 2026'.
 *
 * Se parte el texto a mano en vez de usar `new Date('2026-03-01')`: ese
 * constructor interpreta la fecha en UTC y en Colombia (UTC-5) devuelve el 28
 * de febrero. Todo el módulo se correría un mes.
 */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return month;
  return `${MESES[m - 1]} ${y}`;
}

/** '2026-03-01' -> 'marzo' con mayúscula, para los títulos. */
export function formatMonthLong(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return month;
  const largo = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return `${largo[m - 1]} de ${y}`;
}

/** Date -> '2026-03-01', en hora local (nunca toISOString, que pasa a UTC). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Rango [primer día del mes hace `meses`, último día del mes de `today`]. */
export function monthRange(meses: number, today = new Date()): { desde: string; hasta: string } {
  const desde = new Date(today.getFullYear(), today.getMonth() - (meses - 1), 1);
  const hasta = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { desde: toISODate(desde), hasta: toISODate(hasta) };
}

export interface Variacion {
  /** Diferencia en centavos. Positiva = creció. */
  absCents: number;
  /**
   * Variación porcentual (0.15 = +15%). null cuando el mes anterior fue cero:
   * "infinito por ciento" no es una cifra que se le pueda mostrar a nadie.
   */
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
}

export function variacion(actual: number, anterior: number): Variacion {
  const absCents = actual - anterior;
  return {
    absCents,
    pct: anterior === 0 ? null : absCents / Math.abs(anterior),
    direction: absCents > 0 ? 'up' : absCents < 0 ? 'down' : 'flat',
  };
}

/** 0.1523 -> '+15,2%'. Devuelve '—' cuando no hay base con qué comparar. */
export function formatPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return '—';
  const signo = pct > 0 ? '+' : '';
  return `${signo}${(pct * 100).toFixed(1).replace('.', ',')}%`;
}

export interface ResumenPnl {
  actual: PnlMonth | null;
  anterior: PnlMonth | null;
  ingresos: Variacion;
  egresos: Variacion;
  neto: Variacion;
  /** Margen del mes actual (neto / ingresos). null si no hubo ingresos. */
  margen: number | null;
}

const VACIA: Variacion = { absCents: 0, pct: null, direction: 'flat' };

/**
 * Resume la serie del P&L: el último mes contra el anterior.
 *
 * Asume la serie ordenada de más viejo a más nuevo, que es como la devuelve
 * public.monthly_pnl(). Con un solo mes no hay con qué comparar y las
 * variaciones salen vacías en lugar de fingir un +100%.
 */
export function resumirPnl(rows: PnlMonth[]): ResumenPnl {
  const actual = rows.length > 0 ? rows[rows.length - 1] : null;
  const anterior = rows.length > 1 ? rows[rows.length - 2] : null;

  if (!actual) {
    return { actual: null, anterior: null, ingresos: VACIA, egresos: VACIA, neto: VACIA, margen: null };
  }

  return {
    actual,
    anterior,
    ingresos: anterior ? variacion(actual.income_cents, anterior.income_cents) : VACIA,
    egresos: anterior ? variacion(actual.expense_cents, anterior.expense_cents) : VACIA,
    neto: anterior ? variacion(actual.net_cents, anterior.net_cents) : VACIA,
    margen: actual.income_cents === 0 ? null : actual.net_cents / actual.income_cents,
  };
}

/**
 * Para el gasto de egresos: crecer es MALO. Esta función traduce la dirección
 * de la variación a "bueno / malo" según la métrica, para no pintar de verde un
 * mes en que el arriendo subió.
 */
export function esBuenaNoticia(v: Variacion, metrica: 'ingreso' | 'egreso'): boolean | null {
  if (v.direction === 'flat') return null;
  return metrica === 'ingreso' ? v.direction === 'up' : v.direction === 'down';
}

/** Suma de los meses del rango, para los totales del periodo. */
export function totalesPeriodo(rows: PnlMonth[]): { ingresos: number; egresos: number; neto: number } {
  return rows.reduce(
    (acc, r) => ({
      ingresos: acc.ingresos + r.income_cents,
      egresos: acc.egresos + r.expense_cents,
      neto: acc.neto + r.net_cents,
    }),
    { ingresos: 0, egresos: 0, neto: 0 },
  );
}

/**
 * Retención promedio del periodo, ponderada por el tamaño del box cada mes.
 *
 * El promedio simple de porcentajes miente: un mes con 3 atletas pesaría igual
 * que uno con 80. Se calcula sobre el total de bajas y de activos.
 */
export function retencionPeriodo(rows: MembershipMonth[]): number | null {
  let bajas = 0;
  let base = 0;
  for (const r of rows) {
    if (r.activos_inicio > 0) {
      bajas += r.bajas;
      base += r.activos_inicio;
    }
  }
  return base === 0 ? null : 1 - bajas / base;
}

/** Los últimos `n` meses, del más viejo al más nuevo: ['2026-04-01', …]. */
export function ultimosMeses(n: number, today = new Date()): string[] {
  const meses: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    meses.push(toISODate(new Date(today.getFullYear(), today.getMonth() - i, 1)));
  }
  return meses;
}

/**
 * Último día del mes: '2026-02-01' -> '2026-02-28'.
 * El día 0 del mes siguiente es el último del actual, y así el bisiesto sale
 * solo sin tabla de días por mes.
 */
export function finDeMes(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return month;
  return toISODate(new Date(y, m, 0));
}
