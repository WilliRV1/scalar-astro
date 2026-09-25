import { useEffect, useState } from 'react';
import { alHaberVersionNueva, aplicarVersionNueva, versionNuevaDisponible } from './registro';

/**
 * Avisa cuando hay una versión nueva de la aplicación instalada y esperando.
 *
 * Por qué se pregunta en vez de recargar solo: la app se usa con el celular en
 * la mano mientras alguien registra un pago o marca asistencia. Recargar por
 * sorpresa le borra a esa persona el formulario que estaba llenando, y el que
 * queda mal es el software. Se avisa, y recarga quien quiera cuando pueda.
 */
export function AvisoNuevaVersion({ className = '' }: { className?: string }) {
  const [hay, setHay] = useState(versionNuevaDisponible);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => alHaberVersionNueva(() => setHay(versionNuevaDisponible())), []);

  if (!hay) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 border-l-4 border-primary bg-primary/10 px-4 py-3 ${className}`}
      role="status"
    >
      <p className="min-w-[10rem] flex-1 text-sm font-bold text-primary">
        Hay una versión nueva de Scalar.
      </p>
      <button
        type="button"
        disabled={aplicando}
        onClick={() => {
          setAplicando(true);
          aplicarVersionNueva();
        }}
        className="bg-primary px-4 py-2 font-display text-lg tracking-wide text-sobre-primario transition hover:bg-primario-flotante disabled:opacity-40"
      >
        {aplicando ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  );
}
