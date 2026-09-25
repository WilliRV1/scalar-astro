import { describe, expect, it } from 'vitest';
import { resumirTramos } from './totales';

describe('resumirTramos', () => {
  it('separa lo pendiente de lo vencido a partir de los 4 tramos', () => {
    const r = resumirTramos([
      { tramo: 'porVencer', cobros: 101, saldo_cents: 1_007_000 },
      { tramo: 'reciente',  cobros: 60,  saldo_cents: 900_000 },
      { tramo: 'seria',     cobros: 50,  saldo_cents: 1_500_000 },
      { tramo: 'critica',   cobros: 40,  saldo_cents: 1_600_000 },
    ]);
    expect(r.pendiente_cents).toBe(5_007_000);
    expect(r.cobros).toBe(251);
    expect(r.mora_cents).toBe(4_000_000);
    expect(r.enMora).toBe(150);
    expect(r.porTramo.seria).toEqual({ cobros: 50, saldo_cents: 1_500_000 });
  });

  it('un tramo que no venga vale cero, y uno desconocido se ignora', () => {
    const r = resumirTramos([
      { tramo: 'critica', cobros: 2, saldo_cents: 80_000 },
      { tramo: 'inventado' as never, cobros: 9, saldo_cents: 9 },
    ]);
    expect(r.porTramo.porVencer).toEqual({ cobros: 0, saldo_cents: 0 });
    expect(r.pendiente_cents).toBe(80_000);
    expect(r.enMora).toBe(2);
  });

  it('sin filas todo es cero', () => {
    const r = resumirTramos([]);
    expect(r.pendiente_cents).toBe(0);
    expect(r.cobros).toBe(0);
    expect(r.mora_cents).toBe(0);
    expect(r.enMora).toBe(0);
  });
});
