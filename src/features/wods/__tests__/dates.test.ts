import { describe, expect, it } from 'vitest';
import { addDays, shortDayLabel, todayInBox, weekDays, weekStart } from '../dates';

/**
 * El desfase horario es el error clásico de este módulo: "2026-09-17" leído
 * como Date es medianoche UTC, y en Bogotá eso todavía es el 16. Estas pruebas
 * fijan que las fechas calendario se manejen como texto y nunca se corran un día.
 */

describe('addDays', () => {
  it('suma y resta sin correrse de día', () => {
    expect(addDays('2026-09-17', 1)).toBe('2026-09-18');
    expect(addDays('2026-09-17', -1)).toBe('2026-09-16');
    expect(addDays('2026-09-17', 0)).toBe('2026-09-17');
  });

  it('cruza fin de mes y fin de año', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('acierta el año bisiesto', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('weekStart', () => {
  it('la semana arranca el lunes', () => {
    // 2026-09-17 es jueves.
    expect(weekStart('2026-09-17')).toBe('2026-09-14');
    // Un lunes se queda donde está.
    expect(weekStart('2026-09-14')).toBe('2026-09-14');
    // Y el domingo pertenece a la semana que termina, no a la que empieza.
    expect(weekStart('2026-09-20')).toBe('2026-09-14');
  });
});

describe('weekDays', () => {
  it('devuelve los siete días, de lunes a domingo', () => {
    expect(weekDays('2026-09-17')).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
      '2026-09-18', '2026-09-19', '2026-09-20',
    ]);
  });
});

describe('shortDayLabel', () => {
  it('nombra el día en español', () => {
    expect(shortDayLabel('2026-09-14')).toBe('Lun 14');
    expect(shortDayLabel('2026-09-17')).toBe('Jue 17');
    expect(shortDayLabel('2026-09-20')).toBe('Dom 20');
  });
});

describe('todayInBox', () => {
  it('devuelve una fecha calendario AAAA-MM-DD', () => {
    expect(todayInBox('America/Bogota')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('a esta hora Bogotá va un día atrás de Tokio o el mismo', () => {
    const bogota = todayInBox('America/Bogota');
    const tokio = todayInBox('Asia/Tokyo');
    // Nunca al revés: Bogotá está a UTC-5 y Tokio a UTC+9.
    expect(bogota <= tokio).toBe(true);
  });
});
