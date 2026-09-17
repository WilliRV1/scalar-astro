import { describe, expect, it } from 'vitest';
import { formatValue, isImprovement, parseValue, progressSince } from '../format';

describe('formatValue', () => {
  it('muestra los tiempos como los lee el atleta', () => {
    expect(formatValue(510, 'time', 'sec')).toBe('8:30');
    expect(formatValue(3750, 'time', 'sec')).toBe('1:02:30');
    expect(formatValue(65, 'time', 'sec')).toBe('1:05');
    expect(formatValue(600, 'time', 'sec')).toBe('10:00');
  });
  it('muestra los pesos con su unidad', () => {
    expect(formatValue(120, 'weight', 'kg')).toBe('120 kg');
    expect(formatValue(85.5, 'weight', 'kg')).toBe('85.5 kg');
  });
});

describe('parseValue', () => {
  it('lee los tiempos en los dos formatos', () => {
    expect(parseValue('8:30', 'time')).toBe(510);
    expect(parseValue('1:02:30', 'time')).toBe(3750);
    expect(parseValue('510', 'time')).toBe(510);
  });
  it('lee pesos con coma decimal', () => {
    expect(parseValue('85,5', 'weight')).toBe(85.5);
    expect(parseValue('120 kg', 'weight')).toBe(120);
  });
  it('rechaza lo que no entiende', () => {
    expect(parseValue('muchos', 'weight')).toBeNull();
    expect(parseValue('', 'weight')).toBeNull();
    expect(parseValue('8.30', 'time')).toBeNull();
  });
});

describe('isImprovement', () => {
  it('en peso, más es mejor', () => {
    expect(isImprovement(110, 120, 'weight')).toBe(true);
    expect(isImprovement(120, 110, 'weight')).toBe(false);
  });

  // El error que haría que la app felicite al revés.
  it('en tiempo, MENOS es mejor', () => {
    expect(isImprovement(550, 510, 'time')).toBe(true);
    expect(isImprovement(510, 550, 'time')).toBe(false);
  });
});

describe('progressSince', () => {
  it('resume la evolución del peso', () => {
    const p = progressSince([110, 115, 120], 'weight', 'kg');
    expect(p?.improved).toBe(true);
    expect(p?.label).toBe('+10 kg');
  });

  it('resume la evolución del tiempo con el signo correcto', () => {
    // De 9:10 a 8:30 son 40 segundos MENOS, y eso es mejorar.
    const p = progressSince([550, 510], 'time', 'sec');
    expect(p?.improved).toBe(true);
    expect(p?.label).toBe('−0:40');
  });

  it('marca el retroceso', () => {
    const p = progressSince([120, 110], 'weight', 'kg');
    expect(p?.improved).toBe(false);
    expect(p?.label).toBe('−10 kg');
  });

  it('no inventa evolución con un solo dato', () => {
    expect(progressSince([120], 'weight', 'kg')).toBeNull();
  });

  it('no muestra variación si no cambió', () => {
    expect(progressSince([120, 120], 'weight', 'kg')).toBeNull();
  });
});
