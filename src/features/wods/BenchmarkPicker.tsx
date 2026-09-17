import { useState } from 'react';
import { Drawer, EmptyState, Spinner, TextInput } from '../../shared/ui';
import { useMovements } from '../performance/queries';
import { hasTemplate, templateFor } from './benchmarks';
import type { BlockDraft } from './types';

/**
 * Biblioteca de benchmarks.
 *
 * La lista sale del catálogo `movements` (`is_benchmark = true`), no de una
 * constante en el código: si el box agrega su propio benchmark aparece aquí sin
 * tocar nada. El TEXTO del WOD sí viene de benchmarks.ts, porque eso no es un
 * dato del movimiento.
 *
 * Al elegir uno se precarga el bloque entero —descripción, escalas, tipo de
 * score y time cap— y queda asociado al movimiento, que es lo que hace que el
 * resultado se convierta solo en marca personal.
 */
export function BenchmarkPicker({
  open,
  orgId,
  onClose,
  onPick,
}: {
  open: boolean;
  orgId: string;
  onClose: () => void;
  onPick: (draft: Omit<BlockDraft, 'position'>) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const { data: movimientos, isLoading } = useMovements(orgId);

  const lista = (movimientos ?? [])
    .filter((m) => m.is_benchmark)
    .filter((m) => m.name.toLowerCase().includes(busqueda.trim().toLowerCase()));

  return (
    <Drawer open={open} title="Benchmarks" onClose={onClose}>
      <div className="space-y-4">
        <TextInput
          type="search"
          placeholder="Buscar: Fran, Karen, Murph…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        {isLoading && <Spinner label="Cargando catálogo" />}

        {!isLoading && lista.length === 0 && (
          <EmptyState
            title="Sin benchmarks"
            hint="Agrega movimientos con la casilla de benchmark marcada y aparecerán aquí."
          />
        )}

        <div className="space-y-2">
          {lista.map((m) => {
            const plantilla = templateFor(m.name, m.metric);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onPick({
                    kind: plantilla.kind,
                    title: m.name,
                    description: plantilla.description,
                    score_type: plantilla.score_type,
                    time_cap_sec: plantilla.time_cap_sec,
                    scaling: plantilla.scaling,
                    movement_id: m.id,
                  });
                  onClose();
                }}
                className="grunge-border w-full px-4 py-3 text-left hover:border-primary"
              >
                <p className="font-display text-2xl text-black dark:text-white">{m.name}</p>
                <p className="mt-0.5 whitespace-pre-line text-xs text-gray-500">
                  {plantilla.description}
                </p>
                {!hasTemplate(m.name) && (
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                    Sin texto oficial · lo escribes tú
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}
