import { describe, expect, it } from 'vitest';
import { esFestivo, festivosColombia, pascua, siguienteLunes } from '../festivos';

/**
 * Estas pruebas son el espejo en el cliente de `public.colombian_holidays()`.
 * Si una de las dos cambia y la otra no, el coach ve un día marcado como
 * festivo en la parrilla y la base le genera clase igual (o al revés).
 *
 * Las fechas de 2026 están contrastadas contra el calendario oficial.
 */

describe('pascua', () => {
  it('acierta el Domingo de Pascua de varios años', () => {
    expect(pascua(2024)).toBe('2024-03-31');
    expect(pascua(2025)).toBe('2025-04-20');
    expect(pascua(2026)).toBe('2026-04-05');
    expect(pascua(2027)).toBe('2027-03-28');
  });
});

describe('siguienteLunes', () => {
  it('un lunes se queda donde está', () => {
    // 2026-06-29 es lunes.
    expect(siguienteLunes('2026-06-29')).toBe('2026-06-29');
  });

  it('un martes se corre seis días', () => {
    // 2026-01-06 es martes: Reyes se celebra el 12.
    expect(siguienteLunes('2026-01-06')).toBe('2026-01-12');
  });

  it('un domingo se corre un día', () => {
    // 2026-11-01 es domingo.
    expect(siguienteLunes('2026-11-01')).toBe('2026-11-02');
  });

  it('cruza el fin de mes sin correrse de día', () => {
    // 2026-08-15 es sábado: la Asunción se celebra el lunes 17.
    expect(siguienteLunes('2026-08-15')).toBe('2026-08-17');
  });
});

describe('festivosColombia', () => {
  it('son 18 cada año', () => {
    expect(festivosColombia(2026)).toHaveLength(18);
    expect(festivosColombia(2027)).toHaveLength(18);
  });

  it('coincide con el calendario oficial de 2026', () => {
    expect(festivosColombia(2026)).toEqual([
      '2026-01-01', // Año Nuevo
      '2026-01-12', // Reyes (corrido)
      '2026-03-23', // San José (corrido)
      '2026-04-02', // Jueves Santo
      '2026-04-03', // Viernes Santo
      '2026-05-01', // Trabajo
      '2026-05-18', // Ascensión (corrida)
      '2026-06-08', // Corpus Christi (corrido)
      '2026-06-15', // Sagrado Corazón (corrido)
      '2026-06-29', // San Pedro y San Pablo
      '2026-07-20', // Independencia
      '2026-08-07', // Boyacá
      '2026-08-17', // Asunción (corrida)
      '2026-10-12', // Día de la Raza
      '2026-11-02', // Todos los Santos (corrido)
      '2026-11-16', // Cartagena (corrida)
      '2026-12-08', // Inmaculada
      '2026-12-25', // Navidad
    ]);
  });

  it('no repite fechas aunque dos festivos caigan cerca', () => {
    const f = festivosColombia(2027);
    expect(new Set(f).size).toBe(f.length);
  });
});

describe('esFestivo', () => {
  it('los fijos no se corren nunca', () => {
    expect(esFestivo('2026-08-07')).toBe(true);
    // El 7 de agosto de 2026 es viernes; el lunes siguiente es día normal.
    expect(esFestivo('2026-08-10')).toBe(false);
  });

  it('los de la Ley Emiliani sí', () => {
    expect(esFestivo('2026-01-06')).toBe(false);
    expect(esFestivo('2026-01-12')).toBe(true);
  });

  it('un día cualquiera no es festivo', () => {
    expect(esFestivo('2026-09-17')).toBe(false);
  });

  it('no se cae con una fecha ilegible', () => {
    expect(esFestivo('')).toBe(false);
    expect(esFestivo('no-es-fecha')).toBe(false);
  });
});
