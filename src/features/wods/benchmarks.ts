/**
 * Biblioteca de benchmarks.
 *
 * El catálogo `movements` ya dice CUÁLES son benchmarks (`is_benchmark = true`)
 * y con qué se miden (`metric`). Lo que no puede saber la base es cómo se
 * escriben: "21-15-9 Thrusters 43kg / Pull-ups" no es un dato del movimiento,
 * es la plantilla del bloque.
 *
 * Esa plantilla vive aquí, indexada por el nombre del movimiento. Si un box
 * agrega su propio benchmark y no está en esta lista, igual funciona: se
 * precarga un bloque vacío con el tipo de score que corresponda a su métrica,
 * y el coach escribe el texto.
 */

import type { BlockKind, ScoreType, Scaling } from './types';
import type { Metric } from '../performance/format';

export interface BenchmarkTemplate {
  kind: BlockKind;
  score_type: ScoreType;
  description: string;
  scaling: Scaling;
  time_cap_sec: number | null;
}

const CATALOGO: Record<string, BenchmarkTemplate> = {
  Fran: {
    kind: 'metcon',
    score_type: 'for_time',
    description: '21-15-9\nThrusters\nPull-ups',
    scaling: {
      rx: 'Thruster 43 kg (H) / 30 kg (M) · Pull-ups estrictos o kipping',
      scaled: 'Thruster 30 / 20 kg · Pull-ups con banda',
      beginner: 'Thruster con barra vacía · Ring rows',
    },
    time_cap_sec: 15 * 60,
  },
  Grace: {
    kind: 'metcon',
    score_type: 'for_time',
    description: '30 Clean & Jerk por tiempo',
    scaling: {
      rx: '61 kg (H) / 43 kg (M)',
      scaled: '43 / 30 kg',
      beginner: '30 / 20 kg',
    },
    time_cap_sec: 12 * 60,
  },
  Helen: {
    kind: 'metcon',
    score_type: 'for_time',
    description: '3 rondas por tiempo:\n400 m trote\n21 Kettlebell swings\n12 Pull-ups',
    scaling: {
      rx: 'KB 24 kg (H) / 16 kg (M) · Pull-ups',
      scaled: 'KB 16 / 12 kg · Pull-ups con banda',
      beginner: '200 m trote · KB 12 / 8 kg · Ring rows',
    },
    time_cap_sec: 20 * 60,
  },
  Karen: {
    kind: 'metcon',
    score_type: 'for_time',
    description: '150 Wall balls por tiempo',
    scaling: {
      rx: 'Balón 9 kg a 3 m (H) / 6 kg a 2,7 m (M)',
      scaled: 'Balón 6 / 4 kg',
      beginner: '100 wall balls con balón liviano',
    },
    time_cap_sec: 20 * 60,
  },
  Murph: {
    kind: 'metcon',
    score_type: 'for_time',
    description:
      '1.600 m trote\n100 Pull-ups\n200 Flexiones de pecho\n300 Sentadillas\n1.600 m trote',
    scaling: {
      rx: 'Con chaleco de 9 kg (H) / 6 kg (M), partiendo las repeticiones como quiera',
      scaled: 'Sin chaleco, repeticiones partidas 20 rondas de 5-10-15',
      beginner: 'Mitad de todo, pull-ups con banda',
    },
    time_cap_sec: 60 * 60,
  },
  Cindy: {
    kind: 'metcon',
    score_type: 'amrap',
    description: 'AMRAP 20 min:\n5 Pull-ups\n10 Flexiones de pecho\n15 Sentadillas',
    scaling: {
      rx: 'Pull-ups y flexiones estrictas',
      scaled: 'Pull-ups con banda, flexiones con rodillas apoyadas',
      beginner: 'Ring rows y flexiones inclinadas',
    },
    time_cap_sec: 20 * 60,
  },
  '100 Burpees': {
    kind: 'metcon',
    score_type: 'for_time',
    description: '100 Burpees por tiempo',
    scaling: { rx: 'Burpee con salto y palmada', scaled: '75 burpees', beginner: '50 burpees' },
    time_cap_sec: 15 * 60,
  },
  'Row 500m': {
    kind: 'metcon',
    score_type: 'for_time',
    description: '500 m en remo, todo lo rápido que se pueda',
    scaling: { rx: 'Damper 5-7', scaled: 'Damper libre', beginner: '250 m' },
    time_cap_sec: null,
  },
};

/** Tipo de score razonable para un movimiento que no está en la biblioteca. */
export function scoreTypeForMetric(metric: Metric): ScoreType {
  if (metric === 'time') return 'for_time';
  if (metric === 'weight') return 'load';
  if (metric === 'rounds_reps') return 'amrap';
  return 'for_time';
}

/**
 * La plantilla de un benchmark. Si no está en la biblioteca devuelve una base
 * coherente con su métrica en lugar de no hacer nada.
 */
export function templateFor(name: string, metric: Metric): BenchmarkTemplate {
  const conocido = CATALOGO[name];
  if (conocido) return conocido;
  return {
    kind: 'metcon',
    score_type: scoreTypeForMetric(metric),
    description: name,
    scaling: {},
    time_cap_sec: null,
  };
}

/** ¿Tenemos el texto oficial de este benchmark? Sirve para marcarlo en la lista. */
export function hasTemplate(name: string): boolean {
  return name in CATALOGO;
}
