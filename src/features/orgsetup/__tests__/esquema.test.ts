import { describe, expect, it } from 'vitest';
import { erroresPorCampo, esquemaCobros, esquemaMensajes, esquemaReservas } from '../esquema';

/**
 * Lo que se prueba aquí es lo que se le escapa a `Number.isFinite()`.
 *
 * `Number('')` es 0, así que un campo vacío pasa como "cero" si se valida mal.
 * Un cero en "días de gracia" es defendible; un cero en "día de corte" no
 * existe, y un cero colado en el tope de mensajes apaga todos los avisos del
 * box sin que nadie lo haya pedido.
 */

const cobros = {
  default_billing_day: '5',
  grace_days: '3',
  accepts_online_payment: false,
  payment_link: '',
};

describe('esquemaCobros · números escritos por una persona', () => {
  it('acepta lo normal', () => {
    const r = esquemaCobros.safeParse(cobros);
    expect(r.success).toBe(true);
    expect(r.success && r.data.default_billing_day).toBe(5);
    expect(r.success && r.data.grace_days).toBe(3);
  });

  it('RECHAZA el campo vacío en vez de convertirlo en 0', () => {
    for (const campo of ['default_billing_day', 'grace_days'] as const) {
      const r = esquemaCobros.safeParse({ ...cobros, [campo]: '' });
      expect(r.success).toBe(false);
      expect(r.success === false && erroresPorCampo(r.error)[campo]).toContain('Falta');
    }
  });

  it('RECHAZA lo que parece un número y no lo es', () => {
    for (const valor of ['tres', '3 días', '5.5', '-1', '1e3', ' ']) {
      const r = esquemaCobros.safeParse({ ...cobros, grace_days: valor });
      expect(r.success, `"${valor}" no debería pasar`).toBe(false);
    }
  });

  it('acepta el 0 en días de gracia, que sí es un dato', () => {
    const r = esquemaCobros.safeParse({ ...cobros, grace_days: '0' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.grace_days).toBe(0);
  });

  it('rechaza un día de corte 40 con el rango en el mensaje', () => {
    const r = esquemaCobros.safeParse({ ...cobros, default_billing_day: '40' });
    expect(r.success).toBe(false);
    expect(r.success === false && erroresPorCampo(r.error).default_billing_day)
      .toContain('entre 1 y 31');
  });

  it('rechaza un día de corte 0: no existe', () => {
    const r = esquemaCobros.safeParse({ ...cobros, default_billing_day: '0' });
    expect(r.success).toBe(false);
  });

  it('deja el enlace de pago vacío, pero no uno a medias', () => {
    expect(esquemaCobros.safeParse({ ...cobros, payment_link: '' }).success).toBe(true);
    expect(esquemaCobros.safeParse({ ...cobros, payment_link: 'pagos.com' }).success).toBe(false);
    expect(
      esquemaCobros.safeParse({ ...cobros, payment_link: 'https://pagos.com/box' }).success,
    ).toBe(true);
  });
});

const mensajes = {
  is_enabled: true,
  simulation_mode: true,
  quiet_start_hour: '8',
  quiet_end_hour: '21',
  max_messages_per_athlete_per_month: '4',
  max_messages_per_athlete_per_day: '1',
  staff_phone: '',
};

describe('esquemaMensajes · el horario en el que se le escribe a un atleta', () => {
  it('acepta el horario normal de un box', () => {
    const r = esquemaMensajes.safeParse(mensajes);
    expect(r.success).toBe(true);
    expect(r.success && r.data.quiet_start_hour).toBe(8);
  });

  /**
   * De 21:00 a 8:00 no es un horario raro: es escribirle a los atletas de
   * madrugada, que es como un box pierde la confianza de su gente en una noche.
   */
  it('RECHAZA un horario invertido', () => {
    const r = esquemaMensajes.safeParse({
      ...mensajes,
      quiet_start_hour: '21',
      quiet_end_hour: '8',
    });
    expect(r.success).toBe(false);
    expect(r.success === false && erroresPorCampo(r.error).quiet_end_hour).toContain('al revés');
  });

  it('rechaza un tope diario mayor que el mensual', () => {
    const r = esquemaMensajes.safeParse({
      ...mensajes,
      max_messages_per_athlete_per_day: '9',
      max_messages_per_athlete_per_month: '4',
    });
    expect(r.success).toBe(false);
  });

  it('normaliza el teléfono de alertas a E.164 y anula el vacío', () => {
    const conNumero = esquemaMensajes.safeParse({ ...mensajes, staff_phone: '300 123 4567' });
    expect(conNumero.success && conNumero.data.staff_phone).toBe('+573001234567');

    const sinNumero = esquemaMensajes.safeParse({ ...mensajes, staff_phone: '' });
    expect(sinNumero.success && sinNumero.data.staff_phone).toBeNull();

    // Un número que no se entiende es un error, no un campo vacío: guardarlo
    // como null dejaría al dueño sin recibir ninguna alerta interna y sin saberlo.
    expect(esquemaMensajes.safeParse({ ...mensajes, staff_phone: '123' }).success).toBe(false);
  });
});

const reservas = {
  open_hours_before: '168',
  close_minutes_before: '30',
  cancel_minutes_before: '120',
  late_cancel_policy: 'consume_credit' as const,
  block_when_overdue: false,
  waitlist_enabled: true,
  waitlist_max: '10',
  no_show_policy: 'record' as const,
  no_show_consumes_credit: true,
  no_show_threshold: '3',
  no_show_window_days: '30',
  no_show_block_days: '7',
  skip_holidays: true,
  weeks_ahead: '4',
  allow_walk_in: true,
};

describe('esquemaReservas · ventanas coherentes', () => {
  it('acepta la configuración por defecto', () => {
    expect(esquemaReservas.safeParse(reservas).success).toBe(true);
  });

  /**
   * Si la reserva cierra antes de abrirse, la clase nunca es reservable y la
   * aplicación no da ninguna explicación: el atleta cree que está dañada.
   */
  it('RECHAZA una ventana que cierra antes de abrirse', () => {
    const r = esquemaReservas.safeParse({
      ...reservas,
      open_hours_before: '1',
      close_minutes_before: '120',
    });
    expect(r.success).toBe(false);
    expect(r.success === false && erroresPorCampo(r.error).close_minutes_before)
      .toContain('antes de abrirse');
  });

  it('rechaza un plazo de cancelación más largo que la ventana entera', () => {
    const r = esquemaReservas.safeParse({
      ...reservas,
      open_hours_before: '2',
      close_minutes_before: '30',
      cancel_minutes_before: '600',
    });
    expect(r.success).toBe(false);
  });
});
