/**
 * El score de un WOD: leerlo, escribirlo y ordenarlo.
 *
 * Es la única parte del módulo que no habla con la base, y es justo la que más
 * fácil se rompe: en `for_time` MENOS es mejor y en `amrap` o `load` MÁS es
 * mejor. Por eso vive aparte y tiene pruebas propias
 * (src/features/wods/__tests__/score.test.ts) — es el espejo exacto del ORDER BY
 * de public.leaderboard() en 20260918100000_wods.sql.
 *
 * El formato de tiempo y de peso NO se reimplementa: se reusa el de
 * src/features/performance/format.ts, que ya lo hace bien y ya está probado.
 */

import { formatValue, parseValue, type Metric } from '../performance/format';
import type { LeaderboardRow, Scale, ScoreType } from './types';

export const SCORE_LABEL: Record<ScoreType, string> = {
  for_time: 'Por tiempo',
  amrap: 'AMRAP (rondas + reps)',
  emom: 'EMOM',
  load: 'Carga máxima',
  not_scored: 'Sin puntaje',
};

export const SCALE_LABEL: Record<Scale, string> = {
  rx: 'RX',
  scaled: 'Scaled',
  beginner: 'Principiante',
};

export const SCALE_ORDER: Scale[] = ['rx', 'scaled', 'beginner'];

/** Qué escribe el atleta en la casilla, según el tipo de score. */
export const SCORE_HINT: Record<ScoreType, string> = {
  for_time: 'Tu tiempo, como 8:42 o 1:02:30',
  amrap: 'Rondas y repeticiones, como 5+13',
  emom: 'Tu tiempo, como 8:42',
  load: 'Los kilos, como 100 o 97.5',
  not_scored: 'Este bloque no se puntúa',
};

/** El `metric` de performance/format.ts que corresponde a cada tipo de score. */
export function metricForScore(scoreType: ScoreType): Metric {
  if (scoreType === 'for_time' || scoreType === 'emom') return 'time';
  if (scoreType === 'amrap') return 'rounds_reps';
  return 'weight';
}

/**
 * ¿Gana el número más pequeño?
 *
 * Solo el tiempo. Confundirlo deja el leaderboard al revés y le dice al atleta
 * que empeoró justo el día que mejoró.
 */
export function lowerIsBetter(scoreType: ScoreType | null): boolean {
  return scoreType === 'for_time' || scoreType === 'emom';
}

/**
 * "5+13" -> 5.13
 *
 * Las rondas van en la parte entera y las repeticiones en dos decimales, de
 * modo que ordenar por el número ordena por rondas y luego por reps. Asume
 * menos de 100 repeticiones sueltas, que es lo que cabe en una ronda de un
 * AMRAP real.
 */
function parseRoundsReps(raw: string): number | null {
  const m = /^(\d+)\s*(?:\+|-|\s)\s*(\d{1,2})$/.exec(raw.trim());
  if (m) return Number(m[1]) + Number(m[2]) / 100;
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

/** 5.13 -> "5+13" */
function formatRoundsReps(value: number): string {
  const rondas = Math.floor(value + 1e-9);
  const reps = Math.round((value - rondas) * 100);
  return reps > 0 ? `${rondas}+${reps}` : String(rondas);
}

export interface ParsedScore {
  /** Lo que se guarda en results.value_numeric. */
  value: number;
  /** Lo que se guarda en results.display_value y lee el atleta. */
  display: string;
}

/** Lo que el atleta escribió -> lo que se guarda. null si no se entiende. */
export function parseScore(raw: string, scoreType: ScoreType): ParsedScore | null {
  const limpio = raw.trim();
  if (!limpio) return null;

  if (scoreType === 'amrap') {
    const value = parseRoundsReps(limpio);
    return value === null ? null : { value, display: formatRoundsReps(value) };
  }

  const metric = metricForScore(scoreType);
  const value = parseValue(limpio, metric);
  if (value === null) return null;
  return { value, display: formatScore(value, scoreType) };
}

/** Lo guardado -> lo que se pinta en pantalla. */
export function formatScore(value: number, scoreType: ScoreType): string {
  if (scoreType === 'amrap') return formatRoundsReps(value);
  const metric = metricForScore(scoreType);
  return formatValue(value, metric, metric === 'weight' ? 'kg' : 'reps');
}

/**
 * Orden del leaderboard, igual que en la base.
 *
 *   1. RX antes que Scaled antes que Principiante.
 *   2. for_time / emom ascendente; amrap / load descendente.
 *   3. Sin marca (no terminó) al final.
 *
 * El servidor ya devuelve las filas ordenadas; esto es para reordenar en el
 * cliente sin ir y volver (al filtrar por escala, por ejemplo) y para poder
 * probar la regla sin levantar Postgres.
 */
export function compareRows(a: LeaderboardRow, b: LeaderboardRow): number {
  const escala = SCALE_ORDER.indexOf(a.scale) - SCALE_ORDER.indexOf(b.scale);
  if (escala !== 0) return escala;

  // Quien no marcó número va al final, en cualquier tipo de score.
  if (a.value_numeric === null && b.value_numeric === null) return 0;
  if (a.value_numeric === null) return 1;
  if (b.value_numeric === null) return -1;

  const diff = a.value_numeric - b.value_numeric;
  if (diff === 0) return 0;
  return lowerIsBetter(a.score_type) ? diff : -diff;
}

/** Las filas de un bloque, ya ordenadas y partidas por escala. */
export function splitByScale(rows: LeaderboardRow[]): { scale: Scale; rows: LeaderboardRow[] }[] {
  return SCALE_ORDER.map((scale) => ({
    scale,
    rows: rows.filter((r) => r.scale === scale).sort(compareRows),
  })).filter((g) => g.rows.length > 0);
}

/** Agrupa el leaderboard por bloque, conservando el orden de programación. */
export function groupByBlock(rows: LeaderboardRow[]): { blockId: string; title: string; scoreType: ScoreType | null; rows: LeaderboardRow[] }[] {
  const porBloque = new Map<string, { blockId: string; title: string; scoreType: ScoreType | null; position: number; rows: LeaderboardRow[] }>();

  for (const row of rows) {
    const grupo = porBloque.get(row.block_id);
    if (grupo) {
      grupo.rows.push(row);
    } else {
      porBloque.set(row.block_id, {
        blockId: row.block_id,
        title: row.block_title,
        scoreType: row.score_type,
        position: row.block_position,
        rows: [row],
      });
    }
  }

  return [...porBloque.values()]
    .sort((a, b) => a.position - b.position)
    .map(({ blockId, title, scoreType, rows: filas }) => ({
      blockId,
      title,
      scoreType,
      rows: [...filas].sort(compareRows),
    }));
}

/** Etiqueta de un marcador, con su escala. "8:42 · RX" */
export function scoreLabel(row: LeaderboardRow): string {
  const valor =
    row.display_value ??
    (row.value_numeric !== null && row.score_type
      ? formatScore(row.value_numeric, row.score_type)
      : '—');
  return `${valor} · ${SCALE_LABEL[row.scale]}`;
}
