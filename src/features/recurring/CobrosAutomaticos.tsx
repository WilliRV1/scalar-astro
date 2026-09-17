import { useState } from 'react';
import { Card, EmptyState, ErrorNote } from '../../shared/ui';
import { formatCents } from '../../shared/lib/money';
import { usePagarAMano } from './mutations';
import { etiquetaDelEstado, explicarFallo, fechaCorta } from './textos';
import type { CobroAutomatico } from './types';

/**
 * Historial de los cobros automáticos del atleta.
 *
 * Si un cobro falló hay que decírselo con el motivo y con una salida, no con un
 * ícono rojo. Alguien que no sabe por qué le rechazaron el cobro termina en mora
 * sin enterarse, y el box acaba escribiéndole por WhatsApp: justo el trabajo
 * manual que este módulo existe para quitar.
 */
export function CobrosAutomaticos({ cobros }: { cobros: CobroAutomatico[] }) {
  const pagar = usePagarAMano();
  const [error, setError] = useState('');

  async function alPagar(invoiceId: string) {
    setError('');
    try {
      const url = await pagar.mutateAsync(invoiceId);
      // `assign` y no `location.href = …`: el enlace de pago es de la pasarela,
      // así que se sale de la aplicación a propósito.
      window.location.assign(url);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo abrir el enlace de pago.');
    }
  }

  if (cobros.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay cobros automáticos"
        hint="Aquí verás cada cobro, cuándo salió y qué pasó."
      />
    );
  }

  return (
    <div className="space-y-2">
      {error && <ErrorNote>{error}</ErrorNote>}

      {cobros.map((c) => {
        const fallo =
          c.status === 'declined' || c.status === 'exhausted' || c.status === 'failed'
            ? explicarFallo(c.failure_kind)
            : null;

        return (
          <Card key={c.id} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl leading-tight text-black dark:text-white">
                  {formatCents(c.amount_cents)}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  {etiquetaDelEstado(c.status)}
                  {c.attempt > 1 && ` · intento ${c.attempt} de ${c.max_attempts}`}
                </p>
              </div>
              <span className="shrink-0 text-xs text-gray-500">
                {fechaCorta(c.charged_at ?? c.last_attempt_at ?? c.created_at)}
              </span>
            </div>

            {c.status === 'declined' && (
              <p className="text-xs text-gray-500">
                Lo volvemos a intentar el {fechaCorta(c.next_attempt_at)}.
              </p>
            )}

            {c.status === 'cancelled' && c.cancel_reason && (
              <p className="text-xs text-gray-500">{c.cancel_reason}</p>
            )}

            {fallo && (
              <div className="border-l-4 border-primary bg-primary/10 px-3 py-2">
                <p className="text-sm font-bold text-black dark:text-white">{fallo.titulo}</p>
                <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{fallo.queHacer}</p>
                <button
                  type="button"
                  onClick={() => void alPagar(c.invoice_id)}
                  disabled={pagar.isPending}
                  className="mt-2 font-display text-lg text-primary underline disabled:opacity-40"
                >
                  {pagar.isPending ? 'Abriendo…' : 'Pagar esta mensualidad ahora'}
                </button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
