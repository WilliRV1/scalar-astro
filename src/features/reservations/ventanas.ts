/**
 * Ventanas de tiempo, cupos y lista de espera — la lógica pura del módulo.
 *
 * Espejo en el cliente de lo que decide `public.book_class()`. Quien manda es
 * la base: aquí no se autoriza nada, se EXPLICA. La regla que justifica este
 * archivo entero es de producto: si el atleta no puede reservar, hay que
 * decirle por qué, no pintarle un botón gris. Un botón gris sin motivo termina
 * en una llamada al coach, que es justo el trabajo que el producto promete
 * quitar.
 *
 * Si el orden de los motivos de aquí y el de `book_class()` se separan, el
 * atleta lee una cosa en la pantalla y recibe otra al tocar el botón. Por eso
 * el orden es el mismo: clase cancelada, ventana de tiempo, estado del atleta
 * (mora, congelado, bono), y por último el cupo.
 */

import type { ClassRow, ReservationRow, ReservationSettings } from './types';

export const BOGOTA = 'America/Bogota';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

export interface VentanaClase {
  /** Desde cuándo se puede reservar. */
  abre: Date;
  /** Hasta cuándo se puede reservar. */
  cierra: Date;
  /** Hasta cuándo se cancela sin penalización. */
  limiteCancelacion: Date;
}

export function ventanaDeClase(
  inicioISO: string,
  ajustes: ReservationSettings,
): VentanaClase {
  const inicio = new Date(inicioISO).getTime();
  return {
    abre: new Date(inicio - ajustes.open_hours_before * HORA),
    cierra: new Date(inicio - ajustes.close_minutes_before * MINUTO),
    limiteCancelacion: new Date(inicio - ajustes.cancel_minutes_before * MINUTO),
  };
}

/** Cupos libres de verdad. Nunca negativo, aunque el contador venga raro. */
export function cupoRestante(clase: Pick<ClassRow, 'capacity' | 'reserved_count'>): number {
  return Math.max(0, clase.capacity - clase.reserved_count);
}

export function estaLlena(clase: Pick<ClassRow, 'capacity' | 'reserved_count'>): boolean {
  return cupoRestante(clase) === 0;
}

/**
 * La lista de espera, en el orden en que va a ascender.
 *
 * Por `waitlist_pos` y, si dos empataran, por quién llegó primero. El desempate
 * no es decorativo: es el mismo `order by` de `cancel_reservation()`, y es lo
 * que hace que el atleta vea en la pantalla el puesto que de verdad tiene.
 */
export function ordenarListaEspera<T extends Pick<ReservationRow, 'waitlist_pos' | 'booked_at'>>(
  filas: T[],
): T[] {
  return [...filas].sort((a, b) => {
    const pa = a.waitlist_pos ?? Number.MAX_SAFE_INTEGER;
    const pb = b.waitlist_pos ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return a.booked_at.localeCompare(b.booked_at);
  });
}

export type AccionReserva =
  | { tipo: 'reservar' }
  | { tipo: 'lista_espera'; posicion: number }
  | { tipo: 'cancelar'; conPenalizacion: boolean; aviso: string | null }
  | { tipo: 'en_espera'; posicion: number | null }
  | { tipo: 'asistida' }
  | { tipo: 'bloqueado'; motivo: string };

export interface ContextoReserva {
  clase: ClassRow;
  ajustes: ReservationSettings;
  ahora: Date;
  /** La reserva que ya tengo en esa clase, si tengo alguna. */
  miReserva: ReservationRow | null;
  /**
   * El motivo que devolvió `public.my_booking_status()`: mora, membresía
   * congelada o bono agotado. null = el servidor dice que sí puedo.
   */
  motivoDelServidor: string | null;
}

/** Qué puede hacer este atleta con esta clase, y si no puede nada, por qué. */
export function accionDeClase(ctx: ContextoReserva): AccionReserva {
  const { clase, ajustes, ahora, miReserva, motivoDelServidor } = ctx;
  const ventana = ventanaDeClase(clase.starts_at, ajustes);

  if (miReserva?.status === 'attended') {
    return { tipo: 'asistida' };
  }

  // Lo que ya está reservado se puede soltar aunque la clase esté cancelada o
  // fuera de plazo: cancelar nunca se bloquea, solo cuesta.
  if (miReserva?.status === 'booked') {
    const tarde = ahora > ventana.limiteCancelacion;
    return {
      tipo: 'cancelar',
      conPenalizacion: tarde && ajustes.late_cancel_policy !== 'free',
      aviso: tarde ? avisoDeCancelacionTardia(ajustes) : null,
    };
  }
  if (miReserva?.status === 'waitlisted') {
    return { tipo: 'en_espera', posicion: miReserva.waitlist_pos };
  }

  if (clase.status === 'cancelled') {
    return {
      tipo: 'bloqueado',
      motivo: clase.cancel_reason
        ? `El box canceló esta clase: ${clase.cancel_reason}.`
        : 'El box canceló esta clase.',
    };
  }

  if (ahora < ventana.abre) {
    return {
      tipo: 'bloqueado',
      // Sin punto final: `horaDeClase` ya termina en "a. m." y quedarían dos.
      motivo: `La reserva abre el ${fechaHoraCorta(ventana.abre)}`,
    };
  }
  if (ahora > ventana.cierra) {
    return {
      tipo: 'bloqueado',
      motivo:
        ajustes.close_minutes_before > 0
          ? `Ya cerró la reserva: se cierra ${ajustes.close_minutes_before} minutos antes de empezar.`
          : 'Esa clase ya empezó.',
    };
  }

  if (motivoDelServidor) {
    return { tipo: 'bloqueado', motivo: motivoDelServidor };
  }

  if (!estaLlena(clase)) {
    return { tipo: 'reservar' };
  }
  if (ajustes.waitlist_enabled && clase.waitlist_count < ajustes.waitlist_max) {
    return { tipo: 'lista_espera', posicion: clase.waitlist_count + 1 };
  }
  return {
    tipo: 'bloqueado',
    motivo: ajustes.waitlist_enabled
      ? 'La clase está llena y la lista de espera también.'
      : 'La clase está llena.',
  };
}

function avisoDeCancelacionTardia(ajustes: ReservationSettings): string | null {
  switch (ajustes.late_cancel_policy) {
    case 'free':
      return null;
    case 'consume_credit':
      return 'Estás fuera del plazo: la clase se te descuenta igual.';
    case 'no_show':
      return 'Estás fuera del plazo: el box la cuenta como falta.';
  }
}

/** "6:00 a. m." en la hora del box. */
export function horaDeClase(iso: string, timezone: string = BOGOTA): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

/** "AAAA-MM-DD" del día DEL BOX en que empieza la clase. */
export function diaDeClase(iso: string, timezone: string = BOGOTA): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/**
 * "28/09 a las 6:00 a. m." — para decir cuándo abre la reserva.
 *
 * El día y el mes se arman a mano desde `en-CA` (que siempre da AAAA-MM-DD) en
 * vez de pedirle a `es-CO` un formato corto: con `month: '2-digit'` el ICU
 * decide por su cuenta y devuelve "28/9", y el texto queda descuadrado según la
 * versión del navegador.
 */
export function fechaHoraCorta(d: Date, timezone: string = BOGOTA): string {
  const [, mes, dia] = diaDeClase(d.toISOString(), timezone).split('-');
  return `${dia}/${mes} a las ${horaDeClase(d.toISOString(), timezone)}`;
}

/** "Quedan 3 de 14" / "Llena · 2 en espera". Lo que se lee de un vistazo. */
export function etiquetaCupo(clase: ClassRow): string {
  if (clase.status === 'cancelled') return 'Cancelada';
  const libres = cupoRestante(clase);
  if (libres > 0) return `Quedan ${libres} de ${clase.capacity}`;
  return clase.waitlist_count > 0
    ? `Llena · ${clase.waitlist_count} en espera`
    : 'Llena';
}

/** 'HH:MM:SS' de Postgres → "6:00 a. m.". Para la parrilla, que no tiene fecha. */
export function horaDePlantilla(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return time;
  const sufijo = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`;
}

export const DIAS_SEMANA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

/** Agrupa las clases por día del box, en orden de hora. */
export function agruparPorDia(
  clases: ClassRow[],
  timezone: string = BOGOTA,
): Map<string, ClassRow[]> {
  const mapa = new Map<string, ClassRow[]>();
  for (const c of [...clases].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const dia = diaDeClase(c.starts_at, timezone);
    const lista = mapa.get(dia);
    if (lista) lista.push(c);
    else mapa.set(dia, [c]);
  }
  return mapa;
}
