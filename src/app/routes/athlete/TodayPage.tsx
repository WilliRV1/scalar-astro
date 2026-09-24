import { useMemo } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import { Leaderboard } from '../../../features/wods/Leaderboard';
import { ResultForm } from '../../../features/wods/ResultForm';
import { useLeaderboard, useMyResults, useWodByDate } from '../../../features/wods/queries';
import { longDayLabel, todayInBox } from '../../../features/wods/dates';
import { SCALE_LABEL, SCORE_LABEL } from '../../../features/wods/score';
import type { Scale, WodBlock } from '../../../features/wods/types';
import { Card, EmptyState, ErrorNote, Spinner } from '../../../shared/ui';
import { mensajeAmigable } from '../../../shared/lib/errores';

const KIND_LABEL: Record<string, string> = {
  warmup: 'Calentamiento',
  strength: 'Fuerza',
  metcon: 'Metcon',
  accessory: 'Accesorio',
  cooldown: 'Vuelta a la calma',
};

const ESCALAS: Scale[] = ['rx', 'scaled', 'beginner'];

function Escalas({ block }: { block: WodBlock }) {
  const filas = ESCALAS.map((s) => [s, block.scaling?.[s]] as const).filter(([, v]) => Boolean(v));
  if (filas.length === 0) return null;

  return (
    <dl className="mt-3 space-y-1.5 border-l-2 border-gray-700 pl-3">
      {filas.map(([scale, texto]) => (
        <div key={scale}>
          <dt className="text-[10px] font-bold uppercase tracking-widest text-primary">
            {SCALE_LABEL[scale]}
          </dt>
          <dd className="text-sm text-gray-400">{texto}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Lo que toca hoy, para el atleta.
 *
 * Si no hay nada es porque el coach todavía no publicó: esta pantalla no filtra
 * por `published_at`, no le hace falta. La política de `wods` no le devuelve
 * borradores aunque los pidiera.
 */
export default function TodayPage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const athleteId = activeMembership?.athlete_id ?? null;
  const hoy = useMemo(
    () => todayInBox(activeMembership?.organizations?.timezone ?? undefined),
    [activeMembership],
  );

  const { data: wod, isLoading, error } = useWodByDate(orgId, hoy);
  const bloques = useMemo(() => wod?.blocks ?? [], [wod]);
  const { data: mios } = useMyResults(athleteId, bloques.map((b) => b.id));
  const { data: tablero } = useLeaderboard(wod?.id);

  if (isLoading) return <Spinner label="Cargando el WOD de hoy" />;

  if (!athleteId) {
    return (
      <EmptyState
        title="Tu ficha no está vinculada"
        hint="Pídele a tu coach que conecte tu usuario con tu ficha de atleta."
      />
    );
  }

  // Sin datos no hay nada que pintar. Si el WOD ya cargó y falla un refresco,
  // el aviso va arriba: desmontar la pantalla borraría el resultado que el
  // atleta está escribiendo.
  if (error && !wod) {
    return <ErrorNote>No se pudo cargar el WOD: {mensajeAmigable(error)}</ErrorNote>;
  }

  if (!wod) {
    return (
      <EmptyState
        title="Todavía no hay WOD de hoy"
        hint="El coach lo publica antes de la primera clase. Vuelve en un rato."
      />
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <ErrorNote>No se pudo actualizar el WOD: {mensajeAmigable(error)}</ErrorNote>
      )}
      <header>
        <p className="text-xs uppercase tracking-widest text-primary">Hoy</p>
        <h1 className="font-display text-4xl text-black dark:text-white">
          {wod.title || 'WOD del día'}
        </h1>
        <p className="text-xs capitalize text-gray-500">{longDayLabel(wod.date)}</p>
        {wod.notes && <p className="mt-2 text-sm text-gray-400">{wod.notes}</p>}
      </header>

      <div className="space-y-4">
        {bloques.map((b) => {
          const mio = (mios ?? []).find((r) => r.wod_block_id === b.id) ?? null;
          return (
            <Card key={b.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl text-black dark:text-white">
                  {b.title || KIND_LABEL[b.kind] || b.kind}
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  {KIND_LABEL[b.kind] ?? b.kind}
                  {b.score_type && ` · ${SCORE_LABEL[b.score_type]}`}
                  {b.time_cap_sec && ` · cap ${Math.round(b.time_cap_sec / 60)} min`}
                </span>
              </div>

              <p className="mt-2 whitespace-pre-line text-sm text-gray-300">{b.description}</p>
              <Escalas block={b} />

              {orgId && b.score_type && b.score_type !== 'not_scored' && (
                <div className="mt-4 border-t border-gray-800 pt-4">
                  <ResultForm
                    orgId={orgId}
                    wodId={wod.id}
                    block={b}
                    athleteId={athleteId}
                    existing={mio}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <section>
        <h2 className="mb-3 font-display text-2xl text-black dark:text-white">Tablero de hoy</h2>
        <Leaderboard rows={tablero ?? []} highlightAthleteId={athleteId} />
      </section>
    </div>
  );
}
