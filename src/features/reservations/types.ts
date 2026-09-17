/**
 * Tipos del módulo de horarios y reservas.
 *
 * Escritos a mano igual que `src/types/database.ts`: mientras no haya un
 * proyecto de Supabase enlazado no hay tipos generados. Cuando los haya, esto
 * se reemplaza por lo que salga de `npm run types:gen`.
 */

/** 0 = domingo … 6 = sábado. Igual que `extract(dow)` y `Date.getUTCDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ClassStatus = 'scheduled' | 'cancelled';

export type ReservationStatus =
  | 'booked'
  | 'waitlisted'
  | 'attended'
  | 'no_show'
  | 'cancelled';

export type ReservationSource = 'app' | 'staff' | 'whatsapp' | 'walk_in';

export type LateCancelPolicy = 'free' | 'consume_credit' | 'no_show';
export type NoShowPolicy = 'record' | 'notify' | 'block';

export interface ReservationSettings {
  org_id: string;
  /** Con cuántas horas de antelación se abre la reserva. */
  open_hours_before: number;
  /** Cuántos minutos antes de la clase se cierra la reserva. */
  close_minutes_before: number;
  /** Hasta cuántos minutos antes se cancela sin penalización. */
  cancel_minutes_before: number;
  late_cancel_policy: LateCancelPolicy;
  block_when_overdue: boolean;
  waitlist_enabled: boolean;
  waitlist_max: number;
  no_show_policy: NoShowPolicy;
  no_show_consumes_credit: boolean;
  no_show_threshold: number;
  no_show_window_days: number;
  no_show_block_days: number;
  skip_holidays: boolean;
  weeks_ahead: number;
  allow_walk_in: boolean;
}

export interface ClassTemplate {
  id: string;
  org_id: string;
  name: string;
  weekday: Weekday;
  /** 'HH:MM:SS' tal como lo devuelve Postgres para un `time`. */
  start_time: string;
  duration_min: number;
  capacity: number;
  coach_id: string | null;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
}

export interface ClassRow {
  id: string;
  org_id: string;
  template_id: string | null;
  name: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  /** Desnormalizado y mantenido por trigger. Sirve para pintar, no para decidir. */
  reserved_count: number;
  waitlist_count: number;
  coach_id: string | null;
  wod_id: string | null;
  status: ClassStatus;
  cancel_reason: string | null;
}

export interface ReservationRow {
  id: string;
  org_id: string;
  class_id: string;
  athlete_id: string;
  subscription_id: string | null;
  status: ReservationStatus;
  waitlist_pos: number | null;
  source: ReservationSource;
  booked_at: string;
  promoted_at: string | null;
  cancelled_at: string | null;
  late_cancel: boolean;
  checked_in_at: string | null;
  consumed_credit: boolean;
}

/** Una fila de la lista de la clase: la reserva con el nombre de quien la hizo. */
export interface RosterRow extends ReservationRow {
  athlete_name: string;
  athlete_phone: string | null;
}

/** Lo que devuelve `public.book_class()`. */
export interface BookResult {
  reservation_id: string;
  status: ReservationStatus;
  waitlist_pos: number | null;
  message: string;
}

/** Lo que devuelve `public.cancel_reservation()`. */
export interface CancelResult {
  cancelled: boolean;
  late: boolean;
  credit_returned: boolean;
  counted_as_no_show: boolean;
  promoted_id: string | null;
  promoted_athlete: string | null;
  message: string;
}

/** Lo que devuelve `public.my_booking_status()`. */
export interface BookingStatus {
  /** null = puede reservar. Si no, el motivo ya redactado para mostrárselo. */
  reason: string | null;
  /** Clases que le quedan del bono este periodo. null = plan ilimitado. */
  credits_left: number | null;
}
