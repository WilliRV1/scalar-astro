import { useMemo, useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import { addDays, longDayLabel, shortDayLabel, todayInBox } from '../../../features/wods/dates';
import {
  BOGOTA,
  ClassCard,
  accionDeClase,
  diaDeClase,
  esFestivo,
  horaDeClase,
  useBookClass,
  useCancelReservation,
  useClasses,
  useAhora,
  useMyBookingStatus,
  useMyReservations,
  useReservationSettings,
} from '../../../features/reservations';
import type { ClassRow, ReservationRow } from '../../../features/reservations';
import { Button, EmptyState, ErrorNote, Spinner } from '../../../shared/ui';

/**
 * Reservas del atleta.
 *
 * Esta pantalla se usa de pie, con una mano, antes de entrenar: días en una
 * tira horizontal, clases en tarjetas altas y el cupo restante siempre a la
 * vista. Se refresca sola cada 30 segundos porque el cupo cambia mientras se
 * mira.
 *
 * Lo que la separa de la competencia no es reservar: es que cuando NO se puede
 * reservar diga por qué. Mora, membresía congelada, bono agotado o fuera de
 * plazo salen escritos en la tarjeta, con el mismo texto que devolvería el
 * servidor si tocara el botón.
 */
export default function BookingPage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const athleteId = activeMembership?.athlete_id ?? undefined;
  const timezone = activeMembership?.organizations?.timezone ?? BOGOTA;

  // Un "ahora" estable dentro del render pero que avanza solo: la ventana de
  // reserva se cierra mientras el atleta tiene la pantalla abierta.
  const ahora = useAhora();
  const hoy = useMemo(() => todayInBox(timezone), [timezone]);
  const [dia, setDia] = useState(hoy);
  const [aviso, setAviso] = useState<string | null>(null);

  // Ventana de consulta: dos semanas, con un día de holgura a cada lado. Los
  // límites van en UTC y se estiran a propósito en vez de intentar clavar el
  // desfase del box: lo que se pinta lo decide `diaDeClase`, que sí usa la zona
  // horaria, y traer una clase de más no cuesta nada.
  const desde = useMemo(() => `${addDays(hoy, -1)}T00:00:00.000Z`, [hoy]);
  const hasta = useMemo(() => `${addDays(hoy, 16)}T00:00:00.000Z`, [hoy]);

  const { data: clases, isLoading, error } = useClasses(orgId, desde, hasta);
  const { data: ajustes } = useReservationSettings(orgId);
  const { data: estado } = useMyBookingStatus(orgId);
  const { data: misReservas } = useMyReservations(orgId, athleteId);

  const reservar = useBookClass();
  const cancelar = useCancelReservation();
  const ocupado = reservar.isPending || cancelar.isPending;

  const porClase = useMemo(() => {
    const m = new Map<string, ReservationRow>();
    for (const r of misReservas ?? []) {
      // Solo las vigentes mandan: una cancelada vieja no puede pintar la clase
      // como "ya la tienes".
      if (r.status === 'cancelled') continue;
      m.set(r.class_id, r);
    }
    return m;
  }, [misReservas]);

  const dias = useMemo(() => Array.from({ length: 8 }, (_, i) => addDays(hoy, i)), [hoy]);

  const delDia = useMemo(
    () => (clases ?? []).filter((c) => diaDeClase(c.starts_at, timezone) === dia),
    [clases, dia, timezone],
  );

  const proximas = useMemo(() => {
    const porId = new Map((clases ?? []).map((c) => [c.id, c]));
    const corte = ahora.getTime();
    return (misReservas ?? [])
      .filter((r) => r.status === 'booked' || r.status === 'waitlisted')
      .map((r) => ({ reserva: r, clase: porId.get(r.class_id) }))
      .filter(
        (x): x is { reserva: ReservationRow; clase: ClassRow } =>
          x.clase != null && new Date(x.clase.starts_at).getTime() > corte,
      )
      .sort((a, b) => a.clase.starts_at.localeCompare(b.clase.starts_at));
  }, [misReservas, clases, ahora]);

  if (!orgId) return <EmptyState title="Sin box activo" />;
  if (!athleteId) {
    return (
      <EmptyState
        title="Tu usuario no está ligado a una ficha de atleta"
        hint="Pídele al box que vincule tu cuenta para poder reservar."
      />
    );
  }

  const errorDeAccion = reservar.error ?? cancelar.error;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-3xl text-black dark:text-white">Reservar clase</h1>
        <p className="text-xs capitalize text-gray-500">{longDayLabel(dia)}</p>
      </header>

      {estado?.credits_left != null && (
        <p className="grunge-border bg-surface-light px-4 py-3 text-sm dark:bg-surface-dark">
          Te quedan{' '}
          <strong className="font-display text-2xl text-primary">{estado.credits_left}</strong>{' '}
          clases de tu plan este periodo.
        </p>
      )}

      {estado?.reason && (
        <ErrorNote>
          {estado.reason}
        </ErrorNote>
      )}

      {proximas.length > 0 && (
        <section className="grunge-border bg-surface-light p-4 dark:bg-surface-dark">
          <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Tus próximas reservas
          </h2>
          <ul className="space-y-1.5">
            {proximas.map(({ reserva, clase }) => (
              <li key={reserva.id} className="flex items-baseline gap-2 text-sm">
                <span className="font-display text-xl text-black dark:text-white">
                  {horaDeClase(clase.starts_at, timezone)}
                </span>
                <span className="capitalize text-gray-400">
                  {longDayLabel(diaDeClase(clase.starts_at, timezone))}
                </span>
                {reserva.status === 'waitlisted' && (
                  <span className="text-xs font-bold text-primary">
                    en espera{reserva.waitlist_pos ? ` · puesto ${reserva.waitlist_pos}` : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tira de días: en un celular los ocho no caben, y partirlos en dos filas
          hace perder la noción de semana. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {dias.map((d) => {
          const activo = d === dia;
          const festivo = esFestivo(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDia(d)}
              aria-current={activo ? 'date' : undefined}
              className={`flex h-14 min-w-[4.25rem] shrink-0 flex-col items-center justify-center px-2 text-[11px] font-bold uppercase tracking-widest transition ${
                activo ? 'bg-primary text-white' : 'grunge-border text-gray-500 hover:text-gray-300'
              }`}
            >
              <span>{shortDayLabel(d)}</span>
              <span className="mt-1 text-[9px]">
                {d === hoy ? 'hoy' : festivo ? 'festivo' : ''}
              </span>
            </button>
          );
        })}
      </div>

      {error && <ErrorNote>No se pudieron cargar los horarios: {String(error)}</ErrorNote>}
      {errorDeAccion && <ErrorNote>{mensajeDeError(errorDeAccion)}</ErrorNote>}
      {aviso && (
        <p className="border-l-4 border-green-500 bg-green-500/10 px-4 py-3 text-sm font-bold text-green-500">
          {aviso}
        </p>
      )}

      {isLoading && <Spinner label="Cargando horarios" />}

      {!isLoading && delDia.length === 0 && (
        <EmptyState
          title={esFestivo(dia) ? 'Festivo: el box no programó clases' : 'No hay clases ese día'}
          hint="Prueba con otro día de la tira de arriba."
        />
      )}

      <div className="space-y-2">
        {ajustes &&
          delDia.map((c) => (
            <ClassCard
              key={c.id}
              clase={c}
              timezone={timezone}
              ocupado={ocupado}
              accion={accionDeClase({
                clase: c,
                ajustes,
                ahora,
                miReserva: porClase.get(c.id) ?? null,
                motivoDelServidor: estado?.reason ?? null,
              })}
              onReservar={() => {
                setAviso(null);
                reservar.mutate(
                  { orgId, classId: c.id },
                  { onSuccess: (r) => setAviso(r.message) },
                );
              }}
              onCancelar={() => {
                const r = porClase.get(c.id);
                if (!r) return;
                setAviso(null);
                cancelar.mutate(
                  { orgId, reservationId: r.id },
                  { onSuccess: (res) => setAviso(res.message) },
                );
              }}
            />
          ))}
      </div>

      {ajustes && (
        <p className="pt-2 text-xs text-gray-500">
          La reserva abre {ajustes.open_hours_before} horas antes y cierra{' '}
          {ajustes.close_minutes_before} minutos antes de empezar. Puedes cancelar sin
          costo hasta {ajustes.cancel_minutes_before} minutos antes.
        </p>
      )}

      {!ajustes && !isLoading && (
        <Button variant="ghost" onClick={() => window.location.reload()}>
          Recargar
        </Button>
      )}
    </div>
  );
}

/**
 * Los mensajes de la base vienen redactados en español y para el usuario
 * ("Ya cerró la reserva para esa clase"). Se muestran tal cual: taparlos con un
 * "algo salió mal" es perder la única información útil que hay.
 */
function mensajeDeError(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.length > 0) return m;
  }
  return String(e);
}
