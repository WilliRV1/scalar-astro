import type { ReactNode } from 'react';
import { Field } from '../../shared/ui';

/**
 * Piezas sueltas de la configuración.
 *
 * Lo que tienen en común: TODAS llevan una frase que explica qué hace la opción
 * en el box. Es la diferencia entre una pantalla que el dueño puede usar solo y
 * una que nos obliga a estar al teléfono con cada cliente nuevo.
 */

/** Un campo con su explicación. La explicación no es opcional a propósito. */
export function Opcion({
  etiqueta, ayuda, error, children,
}: {
  etiqueta: string;
  ayuda: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <Field label={etiqueta} hint={ayuda} error={error}>
      {children}
    </Field>
  );
}

/** Un interruptor con su explicación, para las opciones de sí/no. */
export function Interruptor({
  etiqueta, ayuda, activo, onCambiar, destacado = false,
}: {
  etiqueta: string;
  ayuda: string;
  activo: boolean;
  onCambiar: (v: boolean) => void;
  /** Para los interruptores que cambian qué reciben los atletas. */
  destacado?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 p-3 transition ${
        destacado ? 'grunge-border bg-primary/5' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={activo}
        onChange={(e) => onCambiar(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[#FF0000]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-black dark:text-white">{etiqueta}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{ayuda}</span>
      </span>
    </label>
  );
}

/** Aviso informativo. No es un error: es contexto que evita una llamada. */
export function Nota({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-4 border-gray-600 bg-gray-500/10 px-4 py-3 text-xs leading-relaxed text-gray-400">
      {children}
    </p>
  );
}

/** Confirmación de que lo que el dueño acaba de tocar quedó guardado. */
export function Guardado({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="text-xs font-bold uppercase tracking-widest text-emerald-500">
      Guardado
    </span>
  );
}

/**
 * Cuánto falta para terminar la puesta en marcha.
 *
 * Una serie sola, sin números encima de nada y sin leyenda: lo único que tiene
 * que comunicar es "voy por aquí, me falta esto".
 */
export function BarraProgreso({
  hechos, saltados, total,
}: {
  hechos: number;
  saltados: number;
  total: number;
}) {
  const pctHechos = Math.round((hechos / total) * 100);
  const pctSaltados = Math.round((saltados / total) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Paso {Math.min(hechos + saltados + 1, total)} de {total}
        </span>
        <span className="font-display text-xl text-black dark:text-white">{pctHechos}%</span>
      </div>
      <div
        className="mt-1.5 flex h-2 w-full overflow-hidden bg-gray-300 dark:bg-gray-800"
        role="progressbar"
        aria-valuenow={pctHechos}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Avance de la puesta en marcha"
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${pctHechos}%` }} />
        {/* Lo saltado se ve, pero apagado: falta, y el dueño tiene que notarlo. */}
        <div
          className="h-full bg-gray-500 transition-all"
          style={{ width: `${pctSaltados}%` }}
        />
      </div>
    </div>
  );
}
