import { useState } from 'react';
import { Button, Card, EmptyState, ErrorNote, Spinner } from '../../shared/ui';
import { mensajeAmigable } from '../../shared/lib/errores';
import { fechaCorta } from '../../shared/lib/fechas';
import { formatValue, progressSince, type Metric } from './format';
import { useAthleteRecords } from './queries';
import { Sparkline } from './Sparkline';
import { RecordForm } from './RecordForm';

/**
 * Marcas del atleta como casillas de dato: valor actual, variación y sparkline.
 * No es un gráfico grande porque el dato es "un número actual más su tendencia",
 * y para eso la casilla se lee mejor que una gráfica.
 */
export function PersonalRecords({
  orgId, athleteId, canEdit,
}: {
  orgId: string;
  athleteId: string;
  canEdit: boolean;
}) {
  const { data: grupos, isLoading, isError, error } = useAthleteRecords(athleteId);
  const [registrando, setRegistrando] = useState(false);

  if (isLoading) return <Spinner label="Cargando marcas" />;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-black dark:text-white">Marcas</h2>
        {canEdit && <Button variant="ghost" onClick={() => setRegistrando(true)}>+ Marca</Button>}
      </div>

      {isError && (
        <ErrorNote>No se pudieron cargar las marcas: {mensajeAmigable(error)}</ErrorNote>
      )}

      {!isError && (!grupos || grupos.length === 0) && (
        <EmptyState
          title="Todavía no hay marcas"
          hint="Registra la primera y la evolución empieza a dibujarse sola."
        />
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {grupos?.map(({ movement, records, current }) => {
          const metric = movement.metric as Metric;
          const valores = records.map((r) => r.value_numeric);
          const etiquetas = records.map(
            (r) => `${formatValue(r.value_numeric, metric, movement.unit)} · ${fechaCorta(r.achieved_on)}`,
          );
          const progreso = progressSince(valores, metric, movement.unit);

          return (
            <Card key={movement.id}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                {movement.name}
              </p>

              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="font-display text-4xl leading-tight text-black dark:text-white">
                    {formatValue(current.value_numeric, metric, movement.unit)}
                  </p>
                  {progreso ? (
                    // Flecha + texto: la dirección no depende solo del color.
                    <p className={`text-xs font-bold ${progreso.improved ? 'text-[#4ADE80]' : 'text-gray-500'}`}>
                      {progreso.improved ? '▲' : '▼'} {progreso.label}
                      <span className="ml-1 font-normal text-gray-500">
                        desde {fechaCorta(records[0].achieved_on)}
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">{fechaCorta(current.achieved_on)}</p>
                  )}
                </div>

                <Sparkline
                  values={valores}
                  labels={etiquetas}
                  invert={metric === 'time'}
                />
              </div>

              {current.notes && (
                <p className="mt-2 text-[11px] text-gray-500">{current.notes}</p>
              )}
            </Card>
          );
        })}
      </div>

      {registrando && (
        <RecordForm open orgId={orgId} athleteId={athleteId} onClose={() => setRegistrando(false)} />
      )}
    </section>
  );
}
