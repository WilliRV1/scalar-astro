import { EmptyState } from '../../shared/ui';
import { SCALE_LABEL, groupByBlock, splitByScale } from './score';
import type { LeaderboardRow } from './types';

/**
 * Tablero del día.
 *
 * RX y Scaled van SEPARADOS, no mezclados con una etiqueta al lado: comparar un
 * Fran a 43 kg con uno a 30 kg no quiere decir nada, y el atleta que escaló se
 * desanima de gratis. La base ya los devuelve en orden (RX primero, y dentro de
 * cada escala el mejor arriba según el tipo de score); aquí solo se parten.
 */
export function Leaderboard({
  rows,
  highlightAthleteId,
}: {
  rows: LeaderboardRow[];
  highlightAthleteId?: string | null;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Todavía nadie marcó"
        hint="El primero que registre su resultado abre el tablero."
      />
    );
  }

  return (
    <div className="space-y-6">
      {groupByBlock(rows).map((bloque) => (
        <section key={bloque.blockId}>
          <h3 className="mb-2 font-display text-2xl text-black dark:text-white">{bloque.title}</h3>

          <div className="space-y-4">
            {splitByScale(bloque.rows).map((grupo) => (
              <div key={grupo.scale}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                  {SCALE_LABEL[grupo.scale]}
                </p>
                <ol className="space-y-1">
                  {grupo.rows.map((fila, i) => {
                    const yo = fila.athlete_id === highlightAthleteId;
                    return (
                      <li
                        key={fila.result_id}
                        className={`flex items-center gap-3 px-3 py-2 ${
                          yo
                            ? 'border-l-4 border-primary bg-primary/10'
                            : 'border-l-4 border-transparent bg-black/20 dark:bg-white/5'
                        }`}
                      >
                        <span className="w-6 shrink-0 font-display text-xl text-gray-500">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-black dark:text-white">
                          {fila.athlete_name}
                          {yo && <span className="ml-1 text-xs text-primary">· tú</span>}
                        </span>
                        <span className="shrink-0 font-display text-2xl text-black dark:text-white">
                          {fila.display_value ?? '—'}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
