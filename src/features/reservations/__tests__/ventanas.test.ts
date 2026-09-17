import { describe, expect, it } from 'vitest';
import {
  accionDeClase,
  agruparPorDia,
  cupoRestante,
  diaDeClase,
  estaLlena,
  etiquetaCupo,
  horaDeClase,
  horaDePlantilla,
  ordenarListaEspera,
  ventanaDeClase,
} from '../ventanas';
import type { ClassRow, ReservationRow, ReservationSettings } from '../types';

/**
 * Estas pruebas fijan que la pantalla diga lo mismo que va a hacer
 * `public.book_class()`. Si se separan, el atleta lee "Reservar" y al tocar
 * recibe un error — que es peor que no haber ofrecido el botón.
 *
 * La clase de referencia empieza el lunes 5 de octubre de 2026 a las 6:00 a. m.
 * de Bogotá, que en UTC son las 11:00.
 */

const AJUSTES: ReservationSettings = {
  org_id: 'org',
  open_hours_before: 168,
  close_minutes_before: 30,
  cancel_minutes_before: 120,
  late_cancel_policy: 'consume_credit',
  block_when_overdue: false,
  waitlist_enabled: true,
  waitlist_max: 3,
  no_show_policy: 'record',
  no_show_consumes_credit: true,
  no_show_threshold: 3,
  no_show_window_days: 30,
  no_show_block_days: 7,
  skip_holidays: true,
  weeks_ahead: 4,
  allow_walk_in: true,
};

const CLASE: ClassRow = {
  id: 'c1',
  org_id: 'org',
  template_id: null,
  name: 'WOD',
  starts_at: '2026-10-05T11:00:00.000Z',
  ends_at: '2026-10-05T12:00:00.000Z',
  capacity: 14,
  reserved_count: 10,
  waitlist_count: 0,
  coach_id: null,
  wod_id: null,
  status: 'scheduled',
  cancel_reason: null,
};

function reserva(over: Partial<ReservationRow>): ReservationRow {
  return {
    id: 'r1',
    org_id: 'org',
    class_id: 'c1',
    athlete_id: 'a1',
    subscription_id: null,
    status: 'booked',
    waitlist_pos: null,
    source: 'app',
    booked_at: '2026-10-04T12:00:00.000Z',
    promoted_at: null,
    cancelled_at: null,
    late_cancel: false,
    checked_in_at: null,
    consumed_credit: false,
    ...over,
  };
}

const EN_VENTANA = new Date('2026-10-05T01:00:00.000Z'); // 10 h antes

describe('ventanaDeClase', () => {
  it('abre, cierra y da el plazo de cancelación según los ajustes del box', () => {
    const v = ventanaDeClase(CLASE.starts_at, AJUSTES);
    expect(v.abre.toISOString()).toBe('2026-09-28T11:00:00.000Z'); // 168 h antes
    expect(v.cierra.toISOString()).toBe('2026-10-05T10:30:00.000Z'); // 30 min antes
    expect(v.limiteCancelacion.toISOString()).toBe('2026-10-05T09:00:00.000Z'); // 2 h antes
  });
});

describe('cupoRestante', () => {
  it('cuenta los que faltan', () => {
    expect(cupoRestante({ capacity: 14, reserved_count: 10 })).toBe(4);
    expect(estaLlena({ capacity: 14, reserved_count: 14 })).toBe(true);
  });

  it('nunca es negativo, aunque el contador venga raro', () => {
    // Si un día el contador desnormalizado se desincroniza, la pantalla no
    // puede llegar a decir "quedan -2".
    expect(cupoRestante({ capacity: 14, reserved_count: 16 })).toBe(0);
  });
});

describe('accionDeClase', () => {
  const base = { clase: CLASE, ajustes: AJUSTES, ahora: EN_VENTANA, miReserva: null };

  it('dentro de la ventana y con cupo, deja reservar', () => {
    expect(accionDeClase({ ...base, motivoDelServidor: null })).toEqual({ tipo: 'reservar' });
  });

  it('antes de que abra dice CUÁNDO abre, no "no disponible"', () => {
    const r = accionDeClase({
      ...base,
      ahora: new Date('2026-09-20T01:00:00.000Z'),
      motivoDelServidor: null,
    });
    expect(r.tipo).toBe('bloqueado');
    if (r.tipo === 'bloqueado') {
      expect(r.motivo).toContain('La reserva abre el 28/09');
    }
  });

  it('pasado el cierre explica cuántos minutos antes se cierra', () => {
    const r = accionDeClase({
      ...base,
      ahora: new Date('2026-10-05T10:45:00.000Z'),
      motivoDelServidor: null,
    });
    expect(r.tipo).toBe('bloqueado');
    if (r.tipo === 'bloqueado') {
      expect(r.motivo).toContain('30 minutos antes');
    }
  });

  it('el motivo del servidor (mora, bono, congelado) manda sobre el cupo', () => {
    const r = accionDeClase({
      ...base,
      motivoDelServidor: 'Tienes una mensualidad vencida desde el 05/09/2026.',
    });
    expect(r).toEqual({
      tipo: 'bloqueado',
      motivo: 'Tienes una mensualidad vencida desde el 05/09/2026.',
    });
  });

  it('llena y con lista de espera, ofrece el puesto que le tocaría', () => {
    const r = accionDeClase({
      ...base,
      clase: { ...CLASE, reserved_count: 14, waitlist_count: 1 },
      motivoDelServidor: null,
    });
    expect(r).toEqual({ tipo: 'lista_espera', posicion: 2 });
  });

  it('llena, con la lista llena también, lo dice', () => {
    const r = accionDeClase({
      ...base,
      clase: { ...CLASE, reserved_count: 14, waitlist_count: 3 },
      motivoDelServidor: null,
    });
    expect(r.tipo).toBe('bloqueado');
    if (r.tipo === 'bloqueado') {
      expect(r.motivo).toContain('lista de espera también');
    }
  });

  it('llena y sin lista de espera en el box, no inventa una', () => {
    const r = accionDeClase({
      ...base,
      ajustes: { ...AJUSTES, waitlist_enabled: false },
      clase: { ...CLASE, reserved_count: 14 },
      motivoDelServidor: null,
    });
    expect(r).toEqual({ tipo: 'bloqueado', motivo: 'La clase está llena.' });
  });

  it('una clase cancelada por el box lo dice con el motivo', () => {
    const r = accionDeClase({
      ...base,
      clase: { ...CLASE, status: 'cancelled', cancel_reason: 'el coach está enfermo' },
      motivoDelServidor: null,
    });
    expect(r.tipo).toBe('bloqueado');
    if (r.tipo === 'bloqueado') {
      expect(r.motivo).toContain('el coach está enfermo');
    }
  });

  describe('lo que ya está reservado', () => {
    it('dentro del plazo se cancela sin penalización', () => {
      const r = accionDeClase({
        ...base,
        miReserva: reserva({ status: 'booked' }),
        motivoDelServidor: null,
      });
      expect(r).toEqual({ tipo: 'cancelar', conPenalizacion: false, aviso: null });
    });

    it('fuera de plazo avisa que la clase se descuenta igual', () => {
      const r = accionDeClase({
        ...base,
        ahora: new Date('2026-10-05T10:00:00.000Z'),
        miReserva: reserva({ status: 'booked' }),
        motivoDelServidor: null,
      });
      expect(r.tipo).toBe('cancelar');
      if (r.tipo === 'cancelar') {
        expect(r.conPenalizacion).toBe(true);
        expect(r.aviso).toContain('se te descuenta igual');
      }
    });

    it('con la política del box en "cuenta como falta", lo dice así', () => {
      const r = accionDeClase({
        ...base,
        ajustes: { ...AJUSTES, late_cancel_policy: 'no_show' },
        ahora: new Date('2026-10-05T10:00:00.000Z'),
        miReserva: reserva({ status: 'booked' }),
        motivoDelServidor: null,
      });
      expect(r.tipo).toBe('cancelar');
      if (r.tipo === 'cancelar') expect(r.aviso).toContain('falta');
    });

    it('con la política en "gratis" no amenaza con nada', () => {
      const r = accionDeClase({
        ...base,
        ajustes: { ...AJUSTES, late_cancel_policy: 'free' },
        ahora: new Date('2026-10-05T10:00:00.000Z'),
        miReserva: reserva({ status: 'booked' }),
        motivoDelServidor: null,
      });
      expect(r).toEqual({ tipo: 'cancelar', conPenalizacion: false, aviso: null });
    });

    it('cancelar nunca se bloquea, ni estando en mora ni fuera de plazo', () => {
      // Soltar el cupo siempre tiene que poderse: si no, el que no puede ir
      // tampoco puede liberarlo y el box pierde la clase.
      const r = accionDeClase({
        ...base,
        ahora: new Date('2026-10-05T10:50:00.000Z'),
        miReserva: reserva({ status: 'booked' }),
        motivoDelServidor: 'Tienes una mensualidad vencida.',
      });
      expect(r.tipo).toBe('cancelar');
    });

    it('en lista de espera muestra el puesto', () => {
      const r = accionDeClase({
        ...base,
        miReserva: reserva({ status: 'waitlisted', waitlist_pos: 2 }),
        motivoDelServidor: null,
      });
      expect(r).toEqual({ tipo: 'en_espera', posicion: 2 });
    });

    it('lo ya asistido no se toca', () => {
      const r = accionDeClase({
        ...base,
        miReserva: reserva({ status: 'attended' }),
        motivoDelServidor: null,
      });
      expect(r).toEqual({ tipo: 'asistida' });
    });

    it('una reserva cancelada no estorba: se puede volver a reservar', () => {
      // La fila sigue existiendo por el único (org_id, class_id, athlete_id);
      // quien la pinte tiene que tratarla como si no hubiera reserva.
      const r = accionDeClase({ ...base, miReserva: null, motivoDelServidor: null });
      expect(r).toEqual({ tipo: 'reservar' });
    });
  });
});

describe('ordenarListaEspera', () => {
  it('ordena por puesto, no por cuándo se pidió', () => {
    const filas = [
      reserva({ id: 'b', waitlist_pos: 2, booked_at: '2026-10-01T00:00:00.000Z' }),
      reserva({ id: 'a', waitlist_pos: 1, booked_at: '2026-10-02T00:00:00.000Z' }),
    ];
    expect(ordenarListaEspera(filas).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('con puestos empatados gana quien llegó primero', () => {
    const filas = [
      reserva({ id: 'tarde', waitlist_pos: 1, booked_at: '2026-10-02T00:00:00.000Z' }),
      reserva({ id: 'temprano', waitlist_pos: 1, booked_at: '2026-10-01T00:00:00.000Z' }),
    ];
    expect(ordenarListaEspera(filas).map((f) => f.id)).toEqual(['temprano', 'tarde']);
  });

  it('un puesto sin número se va al final, no al principio', () => {
    const filas = [
      reserva({ id: 'sin', waitlist_pos: null }),
      reserva({ id: 'con', waitlist_pos: 5 }),
    ];
    expect(ordenarListaEspera(filas).map((f) => f.id)).toEqual(['con', 'sin']);
  });

  it('no muta el arreglo que recibe', () => {
    const filas = [reserva({ id: 'b', waitlist_pos: 2 }), reserva({ id: 'a', waitlist_pos: 1 })];
    ordenarListaEspera(filas);
    expect(filas.map((f) => f.id)).toEqual(['b', 'a']);
  });
});

describe('etiquetaCupo', () => {
  it('dice cuántos quedan', () => {
    expect(etiquetaCupo(CLASE)).toBe('Quedan 4 de 14');
  });

  it('llena, con y sin cola', () => {
    expect(etiquetaCupo({ ...CLASE, reserved_count: 14 })).toBe('Llena');
    expect(etiquetaCupo({ ...CLASE, reserved_count: 14, waitlist_count: 2 })).toBe(
      'Llena · 2 en espera',
    );
  });

  it('una clase cancelada no habla de cupos', () => {
    expect(etiquetaCupo({ ...CLASE, status: 'cancelled' })).toBe('Cancelada');
  });
});

describe('fechas en la hora del box', () => {
  it('una clase de 6 a. m. en Bogotá se lee como 6 a. m., no como 11', () => {
    expect(horaDeClase(CLASE.starts_at)).toMatch(/6:00/);
  });

  it('una clase de 7 p. m. sigue siendo del mismo día en el box', () => {
    // 2026-10-06T00:00Z son las 7 p. m. del 5 de octubre en Bogotá. Leerlo en
    // UTC la contaría en el día siguiente.
    expect(diaDeClase('2026-10-06T00:00:00.000Z')).toBe('2026-10-05');
  });
});

describe('horaDePlantilla', () => {
  it('convierte el time de Postgres a hora legible', () => {
    expect(horaDePlantilla('06:00:00')).toBe('6:00 a. m.');
    expect(horaDePlantilla('18:30:00')).toBe('6:30 p. m.');
    expect(horaDePlantilla('12:00:00')).toBe('12:00 p. m.');
    expect(horaDePlantilla('00:15:00')).toBe('12:15 a. m.');
  });

  it('con un valor ilegible devuelve lo que le dieron en vez de "NaN:NaN"', () => {
    expect(horaDePlantilla('')).toBe('');
  });
});

describe('agruparPorDia', () => {
  it('agrupa por el día del box y ordena por hora', () => {
    const clases: ClassRow[] = [
      { ...CLASE, id: 'tarde', starts_at: '2026-10-05T23:00:00.000Z' },
      { ...CLASE, id: 'manana', starts_at: '2026-10-05T11:00:00.000Z' },
      { ...CLASE, id: 'otroDia', starts_at: '2026-10-06T11:00:00.000Z' },
    ];
    const m = agruparPorDia(clases);
    expect([...m.keys()]).toEqual(['2026-10-05', '2026-10-06']);
    expect(m.get('2026-10-05')?.map((c) => c.id)).toEqual(['manana', 'tarde']);
  });
});
