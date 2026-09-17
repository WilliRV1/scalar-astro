import { shortDayLabel, weekDays } from './dates';
import type { Wod } from './types';

/**
 * Calendario semanal para programar por adelantado.
 *
 * Desplazable en horizontal: en un celular los siete días no caben, y partirlos
 * en dos filas hace perder la noción de semana. Cada día dice de un vistazo si
 * está publicado (rojo), en borrador (gris con punto) o vacío.
 */
export function WeekStrip({
  date,
  wods,
  today,
  onPick,
  onShiftWeek,
}: {
  date: string;
  wods: Wod[];
  today: string;
  onPick: (date: string) => void;
  onShiftWeek: (delta: -1 | 1) => void;
}) {
  const dias = weekDays(date);
  const porFecha = new Map(wods.map((w) => [w.date, w]));

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onShiftWeek(-1)}
        aria-label="Semana anterior"
        className="grunge-border h-14 w-10 shrink-0 text-lg text-gray-400 hover:border-primary hover:text-primary"
      >
        ‹
      </button>

      <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1">
        {dias.map((d) => {
          const wod = porFecha.get(d);
          const activo = d === date;
          const publicado = Boolean(wod?.published_at);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-current={activo ? 'date' : undefined}
              className={`flex h-14 min-w-[4.25rem] shrink-0 flex-col items-center justify-center px-2 text-[11px] font-bold uppercase tracking-widest transition ${
                activo
                  ? 'bg-primary text-white'
                  : 'grunge-border text-gray-500 hover:text-gray-300'
              }`}
            >
              <span>{shortDayLabel(d)}</span>
              <span className="mt-1 flex items-center gap-1 text-[9px]">
                {d === today && <span className={activo ? 'text-white' : 'text-primary'}>hoy</span>}
                {wod && (
                  <span
                    aria-hidden
                    className={`inline-block h-1.5 w-1.5 ${
                      publicado
                        ? activo ? 'bg-white' : 'bg-primary'
                        : 'border border-current'
                    }`}
                  />
                )}
              </span>
              <span className="sr-only">
                {wod ? (publicado ? 'publicado' : 'borrador') : 'sin WOD'}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onShiftWeek(1)}
        aria-label="Semana siguiente"
        className="grunge-border h-14 w-10 shrink-0 text-lg text-gray-400 hover:border-primary hover:text-primary"
      >
        ›
      </button>
    </div>
  );
}
