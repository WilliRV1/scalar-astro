/**
 * Presentación de marcas.
 *
 * Las marcas se guardan siempre numéricas (kilos o segundos) para poder
 * ordenarlas y graficarlas, pero el atleta las lee en su formato de siempre:
 * "120 kg" y "8:30".
 */

export type Metric = 'weight' | 'time' | 'reps' | 'rounds_reps' | 'distance' | 'calories';

/** 510 + 'time' -> "8:30" · 120 + 'weight' -> "120 kg" */
export function formatValue(value: number, metric: Metric, unit: string): string {
  if (metric === 'time') {
    const total = Math.round(value);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${n} ${unit}`;
}

/** "8:30" -> 510 · "120" -> 120 · null si no se entiende. */
export function parseValue(raw: string, metric: Metric): number | null {
  const limpio = raw.trim();
  if (!limpio) return null;

  if (metric === 'time') {
    const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(limpio);
    if (m) {
      return m[3] !== undefined
        ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
        : Number(m[1]) * 60 + Number(m[2]);
    }
    return /^\d+$/.test(limpio) ? Number(limpio) : null;
  }

  // Ojo: Number('') es 0. Sin esta comprobación, "muchos" se guardaría como
  // una marca de 0 y hundiría la gráfica de evolución del atleta.
  const limpiado = limpio.replace(/[^0-9,.]/g, '').replace(',', '.');
  if (!/^\d*\.?\d+$/.test(limpiado)) return null;

  const n = Number(limpiado);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * ¿Mejoró?
 *
 * En peso, más es mejor. En tiempo, MENOS es mejor: bajar de 9:10 a 8:30 en
 * Karen es un PR, aunque el número sea más pequeño. Confundir esto haría que la
 * app le dijera al atleta que empeoró justo cuando mejoró.
 */
export function isImprovement(previous: number, current: number, metric: Metric): boolean {
  return metric === 'time' ? current < previous : current > previous;
}

export interface Progress {
  /** Diferencia absoluta con la primera marca registrada. */
  delta: number;
  improved: boolean;
  label: string;
}

/** Variación entre la primera y la última marca, ya redactada para mostrar. */
export function progressSince(
  values: number[],
  metric: Metric,
  unit: string,
): Progress | null {
  if (values.length < 2) return null;

  const first = values[0];
  const last = values[values.length - 1];
  if (first === last) return null;

  const improved = isImprovement(first, last, metric);
  const delta = Math.abs(last - first);

  const cantidad =
    metric === 'time'
      ? formatValue(delta, 'time', unit)
      : `${Number.isInteger(delta) ? delta : delta.toFixed(1)} ${unit}`;

  return {
    delta,
    improved,
    // El texto dice la dirección, para no depender solo del color.
    label: metric === 'time'
      ? `${improved ? '−' : '+'}${cantidad}`
      : `${improved ? '+' : '−'}${cantidad}`,
  };
}
