import type { RosterRow } from './types';
import { ordenarListaEspera } from './ventanas';

/**
 * La lista de la clase, para el celular del coach.
 *
 * Check-in masivo de un toque por persona: filas de 64 px, sin confirmación de
 * por medio. El coach hace esto de pie, con una mano y veinte personas
 * entrando; equivocarse cuesta otro toque, no un modal.
 *
 * Reservados arriba, lista de espera abajo y separada: si no se separan, el
 * coach le hace check-in a alguien que en realidad no tiene cupo.
 */
export function RosterList({
  filas,
  ocupado,
  onCheckIn,
}: {
  filas: RosterRow[];
  ocupado: boolean;
  onCheckIn: (athleteId: string, presente: boolean) => void;
}) {
  const dentro = filas.filter((f) => f.status === 'booked' || f.status === 'attended');
  const espera = ordenarListaEspera(filas.filter((f) => f.status === 'waitlisted'));
  const fuera = filas.filter((f) => f.status === 'no_show' || f.status === 'cancelled');

  if (filas.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-gray-500">
        Todavía nadie reservó esta clase.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <Seccion titulo={`En la clase · ${dentro.length}`}>
        {dentro.map((f) => (
          <FilaDeLista
            key={f.id}
            fila={f}
            ocupado={ocupado}
            onToggle={() => onCheckIn(f.athlete_id, f.status !== 'attended')}
          />
        ))}
      </Seccion>

      {espera.length > 0 && (
        <Seccion titulo={`Lista de espera · ${espera.length}`}>
          {espera.map((f) => (
            <div
              key={f.id}
              className="flex h-14 items-center gap-3 border-l-4 border-gray-700 bg-black/20 px-4 dark:bg-white/5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-gray-700 font-display text-lg text-white">
                {f.waitlist_pos ?? '·'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-300">
                {f.athlete_name}
              </span>
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                Esperando
              </span>
            </div>
          ))}
        </Seccion>
      )}

      {fuera.length > 0 && (
        <Seccion titulo={`Faltaron o cancelaron · ${fuera.length}`}>
          {fuera.map((f) => (
            <div
              key={f.id}
              className="flex h-12 items-center gap-3 px-4 text-sm text-gray-500"
            >
              <span className="min-w-0 flex-1 truncate line-through">{f.athlete_name}</span>
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest">
                {f.status === 'no_show'
                  ? 'No vino'
                  : f.late_cancel
                    ? 'Canceló tarde'
                    : 'Canceló'}
              </span>
            </div>
          ))}
        </Seccion>
      )}
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
        {titulo}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function FilaDeLista({
  fila,
  ocupado,
  onToggle,
}: {
  fila: RosterRow;
  ocupado: boolean;
  onToggle: () => void;
}) {
  const vino = fila.status === 'attended';
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={ocupado}
      aria-pressed={vino}
      className={`flex h-16 w-full items-center gap-3 border-l-4 px-4 text-left transition disabled:opacity-50 ${
        vino
          ? 'border-green-500 bg-green-500/10'
          : 'border-transparent bg-black/20 hover:border-primary dark:bg-white/5'
      }`}
    >
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center text-xl ${
          vino ? 'bg-green-500 text-black' : 'border-2 border-gray-600 text-transparent'
        }`}
      >
        ✓
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-black dark:text-white">
          {fila.athlete_name}
        </span>
        <span className="block truncate text-xs text-gray-500">
          {fila.promoted_at
            ? 'Entró desde la lista de espera'
            : fila.source === 'walk_in'
              ? 'Llegó sin reservar'
              : fila.source === 'whatsapp'
                ? 'Reservó por WhatsApp'
                : 'Reservó'}
        </span>
      </span>
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-gray-500">
        {vino ? 'Vino' : 'Marcar'}
      </span>
    </button>
  );
}
