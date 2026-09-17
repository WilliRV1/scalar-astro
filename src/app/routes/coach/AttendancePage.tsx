import { useMemo, useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import { fullName, useAthletes } from '../../../features/athletes/queries';
import { AttendanceRow } from '../../../features/attendance/AttendanceRow';
import { useAttendance } from '../../../features/attendance/queries';
import { useToggleAttendance } from '../../../features/attendance/mutations';
import { addDays, longDayLabel, todayInBox } from '../../../features/wods/dates';
import { Button, EmptyState, ErrorNote, Spinner, Stat } from '../../../shared/ui';

/**
 * Asistencia del día.
 *
 * Diseñada para usarse con UNA mano, de pie, mientras entra la clase: filas
 * altas, un toque marca y otro deshace, y el contador arriba siempre visible.
 * Nada de modales ni de confirmaciones: el coach no tiene la otra mano libre.
 */
export default function AttendancePage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const hoy = useMemo(
    () => todayInBox(activeMembership?.organizations?.timezone ?? undefined),
    [activeMembership],
  );

  const [fecha, setFecha] = useState(hoy);
  const [busqueda, setBusqueda] = useState('');

  const { data: atletas, isLoading, error } = useAthletes(orgId, busqueda);
  const { data: asistencia } = useAttendance(orgId, fecha);
  const marcar = useToggleAttendance();

  const porAtleta = useMemo(
    () => new Map((asistencia ?? []).map((a) => [a.athlete_id, a])),
    [asistencia],
  );

  // Los retirados no estorban la lista del día; si alguien vuelve, se reactiva
  // su ficha desde Atletas.
  const lista = (atletas ?? []).filter((a) => a.status !== 'churned');
  const vinieron = (asistencia ?? []).length;

  if (!orgId) return <EmptyState title="Sin box activo" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-black dark:text-white">Asistencia</h1>
          <p className="text-xs capitalize text-gray-500">{longDayLabel(fecha)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setFecha(addDays(fecha, -1))}>
            ‹ Ayer
          </Button>
          {fecha !== hoy && <Button variant="ghost" onClick={() => setFecha(hoy)}>Hoy</Button>}
        </div>
      </div>

      <Stat
        label="Vinieron"
        value={String(vinieron)}
        hint={lista.length > 0 ? `de ${lista.length} atletas activos` : undefined}
      />

      <input
        type="search"
        placeholder="Buscar por nombre o celular"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="grunge-border w-full bg-transparent px-3 py-3 text-sm focus:border-primary focus:outline-none"
      />

      {error && <ErrorNote>No se pudieron cargar los atletas: {String(error)}</ErrorNote>}
      {marcar.error && <ErrorNote>No se pudo marcar: {String(marcar.error)}</ErrorNote>}
      {isLoading && <Spinner label="Cargando atletas" />}

      {!isLoading && lista.length === 0 && (
        <EmptyState
          title={busqueda ? 'Sin resultados' : 'Todavía no hay atletas'}
          hint={busqueda ? 'Prueba con otro nombre o número.' : 'Crea el primero desde Atletas.'}
        />
      )}

      <div className="space-y-1.5">
        {lista.map((a) => {
          const fila = porAtleta.get(a.id) ?? null;
          return (
            <AttendanceRow
              key={a.id}
              name={fullName(a)}
              hint={a.status === 'overdue' ? 'En mora' : undefined}
              present={Boolean(fila)}
              disabled={marcar.isPending}
              onToggle={() =>
                marcar.mutate({ orgId, athleteId: a.id, date: fecha, existing: fila })
              }
            />
          );
        })}
      </div>
    </div>
  );
}
