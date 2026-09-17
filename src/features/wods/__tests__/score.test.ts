import { describe, expect, it } from 'vitest';
import {
  compareRows,
  formatScore,
  groupByBlock,
  lowerIsBetter,
  metricForScore,
  parseScore,
  splitByScale,
} from '../score';
import type { LeaderboardRow, Scale, ScoreType } from '../types';

/**
 * Estas pruebas son el espejo en el cliente del ORDER BY de
 * public.leaderboard(). Si una de las dos cambia y la otra no, el atleta ve un
 * orden en la pantalla y otro al refrescar.
 */

function fila(over: Partial<LeaderboardRow> & { scale?: Scale }): LeaderboardRow {
  return {
    block_id: 'b1',
    block_position: 0,
    block_title: 'Fran',
    score_type: 'for_time',
    result_id: Math.random().toString(36).slice(2),
    athlete_id: 'a1',
    athlete_name: 'Atleta',
    value_numeric: 0,
    display_value: null,
    scale: 'rx',
    rpe: null,
    rank_overall: 1,
    rank_in_scale: 1,
    ...over,
  };
}

describe('metricForScore', () => {
  it('traduce el tipo de score a la métrica de performance/format', () => {
    expect(metricForScore('for_time')).toBe('time');
    expect(metricForScore('emom')).toBe('time');
    expect(metricForScore('load')).toBe('weight');
    expect(metricForScore('amrap')).toBe('rounds_reps');
  });
});

describe('lowerIsBetter', () => {
  it('solo en tiempo gana el número menor', () => {
    expect(lowerIsBetter('for_time')).toBe(true);
    expect(lowerIsBetter('emom')).toBe(true);
    expect(lowerIsBetter('load')).toBe(false);
    expect(lowerIsBetter('amrap')).toBe(false);
    expect(lowerIsBetter(null)).toBe(false);
  });
});

describe('parseScore', () => {
  it('lee un tiempo en mm:ss y en h:mm:ss', () => {
    expect(parseScore('8:42', 'for_time')).toEqual({ value: 522, display: '8:42' });
    expect(parseScore('1:02:30', 'for_time')).toEqual({ value: 3750, display: '1:02:30' });
  });

  it('lee una carga con coma o con punto', () => {
    expect(parseScore('100', 'load')).toEqual({ value: 100, display: '100 kg' });
    expect(parseScore('97,5', 'load')).toEqual({ value: 97.5, display: '97.5 kg' });
  });

  it('lee rondas + repeticiones', () => {
    expect(parseScore('5+13', 'amrap')).toEqual({ value: 5.13, display: '5+13' });
    expect(parseScore('5 + 13', 'amrap')).toEqual({ value: 5.13, display: '5+13' });
    expect(parseScore('7', 'amrap')).toEqual({ value: 7, display: '7' });
  });

  it('rechaza lo que no es un marcador en vez de guardar un cero', () => {
    expect(parseScore('muchos', 'load')).toBeNull();
    expect(parseScore('', 'for_time')).toBeNull();
    expect(parseScore('rapidísimo', 'for_time')).toBeNull();
  });

  it('ida y vuelta: lo que se guarda se vuelve a leer igual', () => {
    const casos: [string, ScoreType][] = [
      ['8:42', 'for_time'],
      ['100 kg', 'load'],
      ['5+13', 'amrap'],
    ];
    for (const [texto, tipo] of casos) {
      const p = parseScore(texto, tipo);
      expect(p).not.toBeNull();
      expect(formatScore(p!.value, tipo)).toBe(p!.display);
    }
  });
});

describe('compareRows', () => {
  it('en for_time gana el tiempo MENOR', () => {
    const rapido = fila({ value_numeric: 522 });
    const lento = fila({ value_numeric: 550 });
    expect([lento, rapido].sort(compareRows)[0]).toBe(rapido);
  });

  it('en load gana la carga MAYOR', () => {
    const poco = fila({ score_type: 'load', value_numeric: 100 });
    const mucho = fila({ score_type: 'load', value_numeric: 110 });
    expect([poco, mucho].sort(compareRows)[0]).toBe(mucho);
  });

  it('en amrap gana quien hizo más rondas', () => {
    const cinco = fila({ score_type: 'amrap', value_numeric: 5.13 });
    const seis = fila({ score_type: 'amrap', value_numeric: 6.01 });
    expect([cinco, seis].sort(compareRows)[0]).toBe(seis);
  });

  it('RX va antes que Scaled aunque el escalado tenga mejor número', () => {
    const rx = fila({ value_numeric: 550, scale: 'rx' });
    const scaled = fila({ value_numeric: 400, scale: 'scaled' });
    const beginner = fila({ value_numeric: 300, scale: 'beginner' });
    expect([beginner, scaled, rx].sort(compareRows)).toEqual([rx, scaled, beginner]);
  });

  it('quien no marcó número queda de último', () => {
    const conMarca = fila({ value_numeric: 900 });
    const sinMarca = fila({ value_numeric: null });
    expect([sinMarca, conMarca].sort(compareRows)).toEqual([conMarca, sinMarca]);
  });
});

describe('splitByScale', () => {
  it('parte el bloque por escala y no deja grupos vacíos', () => {
    const grupos = splitByScale([
      fila({ value_numeric: 550, scale: 'rx' }),
      fila({ value_numeric: 522, scale: 'rx' }),
      fila({ value_numeric: 400, scale: 'scaled' }),
    ]);

    expect(grupos.map((g) => g.scale)).toEqual(['rx', 'scaled']);
    expect(grupos[0].rows.map((r) => r.value_numeric)).toEqual([522, 550]);
  });
});

describe('groupByBlock', () => {
  it('agrupa por bloque y respeta el orden en que se programaron', () => {
    const grupos = groupByBlock([
      fila({ block_id: 'metcon', block_position: 1, block_title: 'Fran', value_numeric: 522 }),
      fila({
        block_id: 'fuerza',
        block_position: 0,
        block_title: 'Back Squat',
        score_type: 'load',
        value_numeric: 100,
      }),
      fila({
        block_id: 'fuerza',
        block_position: 0,
        block_title: 'Back Squat',
        score_type: 'load',
        value_numeric: 110,
      }),
    ]);

    expect(grupos.map((g) => g.title)).toEqual(['Back Squat', 'Fran']);
    expect(grupos[0].rows.map((r) => r.value_numeric)).toEqual([110, 100]);
  });
});
