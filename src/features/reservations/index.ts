/**
 * Horarios y reservas de clase.
 *
 * Lo que hay que saber de este módulo antes de tocarlo: **reservar no es un
 * insert**. El atleta no tiene política de escritura sobre `reservations`
 * porque un `with check` no puede contar cupos ni tomar un candado de fila. La
 * única puerta es `public.book_class()`, que bloquea la fila de la clase y
 * cuenta bajo ese candado — es lo que impide vender el último cupo dos veces.
 *
 * Y la regla de producto que explica la mitad del código de `ventanas.ts`: si
 * el atleta no puede reservar, se le dice POR QUÉ. Mora, membresía congelada,
 * bono agotado, fuera de plazo. Un botón gris sin motivo termina en una llamada
 * al coach.
 */
export {
  useClasses,
  useClassRoster,
  useClassTemplates,
  useMyBookingStatus,
  useMyReservations,
  useReservationSettings,
} from './queries';

export {
  useBookClass,
  useCancelClass,
  useCancelReservation,
  useCheckIn,
  useCloseClass,
  useDeleteTemplate,
  useSaveTemplate,
  useUpdateClass,
} from './mutations';
export type { PlantillaForm } from './mutations';

export { ClassCard } from './ClassCard';
export { RosterList } from './RosterList';
export { TemplateEditor } from './TemplateEditor';

export {
  BOGOTA,
  DIAS_SEMANA,
  accionDeClase,
  agruparPorDia,
  cupoRestante,
  diaDeClase,
  estaLlena,
  etiquetaCupo,
  fechaHoraCorta,
  horaDeClase,
  horaDePlantilla,
  ordenarListaEspera,
  ventanaDeClase,
} from './ventanas';
export type { AccionReserva, ContextoReserva, VentanaClase } from './ventanas';

export { esFestivo, festivosColombia, pascua, siguienteLunes } from './festivos';

export { useAhora } from './useAhora';

export type {
  BookResult,
  BookingStatus,
  CancelResult,
  ClassRow,
  ClassStatus,
  ClassTemplate,
  LateCancelPolicy,
  NoShowPolicy,
  ReservationRow,
  ReservationSettings,
  ReservationSource,
  ReservationStatus,
  RosterRow,
  Weekday,
} from './types';
