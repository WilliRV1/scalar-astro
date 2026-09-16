import { describe, expect, it } from 'vitest';
import { daysOverdue, formatCents, parsePesosToCents } from '../money';

describe('formatCents', () => {
  it('formatea pesos colombianos sin decimales', () => {
    // 180.000 pesos = 18.000.000 centavos
    expect(formatCents(18_000_000).replace(/\s/g, ' ')).toContain('180.000');
  });
  it('maneja el cero', () => {
    expect(formatCents(0).replace(/\s/g, ' ')).toContain('0');
  });
});

describe('parsePesosToCents', () => {
  it('lee los formatos que escribe la gente', () => {
    expect(parsePesosToCents('180000')).toBe(18_000_000);
    expect(parsePesosToCents('180.000')).toBe(18_000_000);
    expect(parsePesosToCents('$ 180.000')).toBe(18_000_000);
  });
  it('rechaza lo que no es un número', () => {
    expect(parsePesosToCents('')).toBeNull();
    expect(parsePesosToCents('gratis')).toBeNull();
  });
  it('no pierde precisión en el redondeo', () => {
    // El clásico: 0.1 + 0.2 en coma flotante. Trabajando en centavos no ocurre.
    expect(parsePesosToCents('0,1')! + parsePesosToCents('0,2')!).toBe(30);
  });
});

describe('daysOverdue', () => {
  const hoy = new Date(2026, 8, 16); // 16 de septiembre de 2026

  it('cuenta los días desde el vencimiento', () => {
    expect(daysOverdue('2026-09-10', hoy)).toBe(6);
  });
  it('da cero el mismo día del vencimiento', () => {
    expect(daysOverdue('2026-09-16', hoy)).toBe(0);
  });
  it('da negativo si aún no vence', () => {
    expect(daysOverdue('2026-09-20', hoy)).toBe(-4);
  });
  it('cruza el cambio de mes sin equivocarse', () => {
    expect(daysOverdue('2026-08-31', hoy)).toBe(16);
  });
});
