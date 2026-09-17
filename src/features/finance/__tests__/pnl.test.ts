import { describe, expect, it } from 'vitest';
import {
  esBuenaNoticia, finDeMes, formatMonth, formatPct, monthRange, resumirPnl,
  retencionPeriodo, toISODate, totalesPeriodo, ultimosMeses, variacion,
} from '../pnl';
import type { MembershipMonth, PnlMonth } from '../types';

const mes = (month: string, income: number, expense: number): PnlMonth => ({
  month,
  income_cents: income,
  expense_cents: expense,
  net_cents: income - expense,
});

describe('formatMonth', () => {
  it('nombra el mes en español', () => {
    expect(formatMonth('2026-03-01')).toBe('mar 2026');
    expect(formatMonth('2026-12-01')).toBe('dic 2026');
  });

  // El error que correría TODO el módulo un mes: new Date('2026-03-01') es
  // medianoche UTC, que en Colombia (UTC-5) es el 28 de febrero.
  it('no se corre un mes por la zona horaria', () => {
    expect(formatMonth('2026-01-01')).toBe('ene 2026');
    expect(formatMonth('2026-03-01')).not.toBe('feb 2026');
  });

  it('devuelve el texto tal cual si no es una fecha', () => {
    expect(formatMonth('no-es-fecha')).toBe('no-es-fecha');
    expect(formatMonth('2026-13-01')).toBe('2026-13-01');
  });
});

describe('toISODate y monthRange', () => {
  it('formatea en hora local, no en UTC', () => {
    expect(toISODate(new Date(2026, 2, 5))).toBe('2026-03-05');
    expect(toISODate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('el rango de 6 meses termina el último día del mes en curso', () => {
    expect(monthRange(6, new Date(2026, 8, 17))).toEqual({
      desde: '2026-04-01',
      hasta: '2026-09-30',
    });
  });

  it('cruza el cambio de año sin romperse', () => {
    expect(monthRange(3, new Date(2026, 0, 15))).toEqual({
      desde: '2025-11-01',
      hasta: '2026-01-31',
    });
  });

  it('febrero de un año bisiesto termina el 29', () => {
    expect(monthRange(1, new Date(2028, 1, 10)).hasta).toBe('2028-02-29');
  });
});

describe('variacion', () => {
  it('compara contra el mes anterior', () => {
    const v = variacion(12_000_00, 10_000_00);
    expect(v.absCents).toBe(2_000_00);
    expect(v.pct).toBeCloseTo(0.2);
    expect(v.direction).toBe('up');
  });

  // Dividir por cero aquí es un "Infinity%" en la cara del dueño.
  it('sin mes anterior con plata, no inventa un porcentaje', () => {
    expect(variacion(500_000_00, 0).pct).toBeNull();
    expect(variacion(500_000_00, 0).direction).toBe('up');
  });

  it('un mes anterior en pérdida no invierte el signo de la variación', () => {
    const v = variacion(-50_000_00, -100_000_00);
    expect(v.absCents).toBe(50_000_00);
    expect(v.pct).toBeCloseTo(0.5);
    expect(v.direction).toBe('up');
  });
});

describe('formatPct', () => {
  it('escribe el porcentaje como se lee en Colombia', () => {
    expect(formatPct(0.1523)).toBe('+15,2%');
    expect(formatPct(-0.08)).toBe('-8,0%');
    expect(formatPct(0)).toBe('0,0%');
  });
  it('sin base con qué comparar, una raya', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatPct(Infinity)).toBe('—');
  });
});

describe('resumirPnl', () => {
  const serie = [
    mes('2026-01-01', 800_000_00, 350_000_00),
    mes('2026-02-01', 900_000_00, 400_000_00),
    mes('2026-03-01', 1_000_000_00, 380_000_00),
  ];

  it('toma el último mes y lo compara con el anterior', () => {
    const r = resumirPnl(serie);
    expect(r.actual?.month).toBe('2026-03-01');
    expect(r.anterior?.month).toBe('2026-02-01');
    expect(r.ingresos.absCents).toBe(100_000_00);
    expect(r.egresos.direction).toBe('down');
    expect(r.neto.absCents).toBe(120_000_00);
  });

  it('calcula el margen del mes', () => {
    expect(resumirPnl(serie).margen).toBeCloseTo(0.62);
  });

  it('con un solo mes no finge una comparación', () => {
    const r = resumirPnl([serie[0]]);
    expect(r.anterior).toBeNull();
    expect(r.ingresos.pct).toBeNull();
    expect(r.ingresos.absCents).toBe(0);
  });

  it('sin datos no explota', () => {
    const r = resumirPnl([]);
    expect(r.actual).toBeNull();
    expect(r.margen).toBeNull();
  });

  it('un mes sin ingresos no tiene margen', () => {
    expect(resumirPnl([mes('2026-03-01', 0, 200_000_00)]).margen).toBeNull();
  });
});

describe('esBuenaNoticia', () => {
  // Pintar de verde un mes en que subió el arriendo es el error clásico.
  it('subir es bueno en ingresos y malo en egresos', () => {
    expect(esBuenaNoticia(variacion(10, 5), 'ingreso')).toBe(true);
    expect(esBuenaNoticia(variacion(10, 5), 'egreso')).toBe(false);
    expect(esBuenaNoticia(variacion(5, 10), 'egreso')).toBe(true);
  });
  it('sin cambio no hay noticia', () => {
    expect(esBuenaNoticia(variacion(10, 10), 'ingreso')).toBeNull();
  });
});

describe('totalesPeriodo', () => {
  it('suma todo el rango', () => {
    expect(totalesPeriodo([mes('2026-01-01', 100, 40), mes('2026-02-01', 200, 60)])).toEqual({
      ingresos: 300, egresos: 100, neto: 200,
    });
  });
  it('sin filas, ceros', () => {
    expect(totalesPeriodo([])).toEqual({ ingresos: 0, egresos: 0, neto: 0 });
  });
});

describe('retencionPeriodo', () => {
  const m = (activos: number, bajas: number): MembershipMonth => ({
    month: '2026-03-01', altas: 0, bajas, activos_inicio: activos, retencion: null,
  });

  // El promedio simple diría 75%: un mes de 4 atletas pesaría igual que uno de 100.
  it('pondera por el tamaño del box, no promedia porcentajes', () => {
    expect(retencionPeriodo([m(4, 2), m(100, 0)])).toBeCloseTo(1 - 2 / 104);
  });

  it('un box que arranca vacío no tiene retención que mostrar', () => {
    expect(retencionPeriodo([m(0, 0)])).toBeNull();
    expect(retencionPeriodo([])).toBeNull();
  });
});

describe('ultimosMeses y finDeMes', () => {
  it('lista los últimos meses del más viejo al más nuevo', () => {
    expect(ultimosMeses(3, new Date(2026, 8, 17))).toEqual([
      '2026-07-01', '2026-08-01', '2026-09-01',
    ]);
  });

  it('cierra el mes en su último día, bisiesto incluido', () => {
    expect(finDeMes('2026-02-01')).toBe('2026-02-28');
    expect(finDeMes('2028-02-01')).toBe('2028-02-29');
    expect(finDeMes('2026-12-01')).toBe('2026-12-31');
  });

  it('con un mes inválido devuelve lo que le dieron', () => {
    expect(finDeMes('cualquier-cosa')).toBe('cualquier-cosa');
  });
});
