import { useMemo, useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import { WodEditor } from '../../../features/wods/WodEditor';
import { WeekStrip } from '../../../features/wods/WeekStrip';
import { Leaderboard } from '../../../features/wods/Leaderboard';
import { useLeaderboard, useWodByDate, useWodsInRange } from '../../../features/wods/queries';
import { useDuplicateWod } from '../../../features/wods/mutations';
import { addDays, longDayLabel, todayInBox, weekDays, weekStart } from '../../../features/wods/dates';
import { Button, Drawer, EmptyState, ErrorNote, Spinner } from '../../../shared/ui';
import { mensajeAmigable } from '../../../shared/lib/errores';

/**
 * El WOD del día, para el coach.
 *
 * Tres cosas en una pantalla porque son las tres que hace todos los días:
 * programar la semana (la tira de arriba), escribir el WOD por bloques y ver
 * cómo va el tablero. Todo entra en el ancho de un celular.
 */
export default function WodPage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const hoy = useMemo(
    () => todayInBox(activeMembership?.organizations?.timezone ?? undefined),
    [activeMembership],
  );

  const [fecha, setFecha] = useState(hoy);
  const [duplicando, setDuplicando] = useState(false);

  const semana = weekDays(fecha);
  const { data: wodsSemana } = useWodsInRange(orgId, semana[0], semana[6]);
  const { data: wod, isLoading, error } = useWodByDate(orgId, fecha);
  const { data: tablero } = useLeaderboard(wod?.id);
  const duplicar = useDuplicateWod();

  // Para duplicar se ofrecen las cuatro semanas anteriores: es donde está la
  // programación que un box repite.
  const desde = addDays(weekStart(fecha), -28);
  const { data: recientes } = useWodsInRange(orgId, desde, addDays(fecha, -1));

  if (!orgId) return <EmptyState title="Sin box activo" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl capitalize text-black dark:text-white">
            {longDayLabel(fecha)}
          </h1>
          <p className="text-xs uppercase tracking-widest text-gray-500">
            {fecha === hoy ? 'Hoy' : 'Programación'}
          </p>
        </div>
        <div className="flex gap-2">
          {fecha !== hoy && (
            <Button variant="ghost" onClick={() => setFecha(hoy)}>Hoy</Button>
          )}
          <Button variant="ghost" onClick={() => setDuplicando(true)}>Duplicar</Button>
        </div>
      </div>

      <WeekStrip
        date={fecha}
        today={hoy}
        wods={wodsSemana ?? []}
        onPick={setFecha}
        onShiftWeek={(delta) => setFecha(addDays(fecha, delta * 7))}
      />

      {error && <ErrorNote>No se pudo cargar el WOD: {mensajeAmigable(error)}</ErrorNote>}
      {isLoading && <Spinner label="Cargando el WOD" />}

      {!isLoading && (
        <WodEditor key={`${fecha}-${wod?.id ?? 'nuevo'}`} orgId={orgId} date={fecha} wod={wod ?? null} />
      )}

      {wod && (
        <section>
          <h2 className="mb-3 font-display text-2xl text-black dark:text-white">Tablero del día</h2>
          <Leaderboard rows={tablero ?? []} />
        </section>
      )}

      <Drawer
        open={duplicando}
        title={`Duplicar en ${longDayLabel(fecha)}`}
        onClose={() => setDuplicando(false)}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Copia un WOD de otro día a este. Llega como <strong>borrador</strong>: se publica
            cuando esté revisado.
          </p>

          {(recientes ?? []).length === 0 && (
            <EmptyState title="No hay WOD anteriores" hint="Programa uno y después podrás copiarlo." />
          )}

          {(recientes ?? [])
            .slice()
            .reverse()
            .map((w) => (
              <button
                key={w.id}
                type="button"
                disabled={duplicar.isPending}
                onClick={() =>
                  duplicar.mutate(
                    { orgId, date: fecha, fromWodId: w.id },
                    { onSuccess: () => setDuplicando(false) },
                  )
                }
                className="grunge-border w-full px-4 py-3 text-left hover:border-primary disabled:opacity-50"
              >
                <p className="font-display text-2xl text-black dark:text-white">
                  {w.title || 'WOD'}
                </p>
                <p className="text-xs capitalize text-gray-500">{longDayLabel(w.date)}</p>
              </button>
            ))}

          {duplicar.error && (
            <ErrorNote>No se pudo duplicar: {mensajeAmigable(duplicar.error)}</ErrorNote>
          )}
        </div>
      </Drawer>
    </div>
  );
}
