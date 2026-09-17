import { useState } from 'react';
import { Button, Card, ErrorNote } from '../../shared/ui';
import { formatCents } from '../../shared/lib/money';
import { useRevocarAutorizacion } from './mutations';
import { describirMetodo, fechaLarga } from './textos';
import type { AutorizacionDeDebito, MetodoDePago } from './types';

/**
 * El débito activo: qué se cobra, cuándo, de dónde, y el botón para quitarlo.
 *
 * "Revocar en un toque" es literal: un botón, una confirmación, y se acabó.
 * Nada de "escríbele a tu box", nada de formularios. La base cancela los cobros
 * encolados en el mismo instante (trigger de la migración 0016), así que lo que
 * esta pantalla promete es verdad de inmediato.
 */
export function DebitoActivo({
  metodo,
  autorizacion,
  montoMensual,
  diaDeCorte,
}: {
  metodo: MetodoDePago;
  autorizacion: AutorizacionDeDebito;
  montoMensual: number | null;
  diaDeCorte: number | null;
}) {
  const revocar = useRevocarAutorizacion();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState('');

  async function alRevocar() {
    setError('');
    try {
      await revocar.mutateAsync({ autorizacionId: autorizacion.id });
      setConfirmando(false);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo quitar el débito automático.');
    }
  }

  return (
    <Card className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
            Pago automático activo
          </p>
          <h2 className="font-display text-2xl leading-tight text-black dark:text-white">
            {describirMetodo(metodo)}
          </h2>
        </div>
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="border-l-2 border-gray-300 pl-3 dark:border-gray-700">
          <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Cuánto</dt>
          <dd className="font-display text-xl text-black dark:text-white">
            {montoMensual ? formatCents(montoMensual) : 'Tu mensualidad'}
          </dd>
        </div>
        <div className="border-l-2 border-gray-300 pl-3 dark:border-gray-700">
          <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Cuándo</dt>
          <dd className="font-display text-xl text-black dark:text-white">
            {diaDeCorte ? `Cada día ${diaDeCorte}` : 'En tu fecha de corte'}
          </dd>
        </div>
        <div className="border-l-2 border-gray-300 pl-3 dark:border-gray-700">
          <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Tope</dt>
          <dd className="font-display text-xl text-black dark:text-white">
            {autorizacion.max_amount_cents
              ? formatCents(autorizacion.max_amount_cents)
              : 'Sin tope'}
          </dd>
        </div>
      </dl>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-gray-500">
          Autorizaste el {fechaLarga(autorizacion.authorized_at)}
        </summary>
        <p className="mt-3 leading-relaxed text-gray-600 dark:text-gray-400">
          {autorizacion.accepted_text}
        </p>
        {autorizacion.acceptance_permalink && (
          <a
            href={autorizacion.acceptance_permalink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs font-bold text-primary underline"
          >
            Política de la pasarela
          </a>
        )}
      </details>

      {error && <ErrorNote>{error}</ErrorNote>}

      {confirmando ? (
        <div className="space-y-3 border-t border-gray-300 pt-4 dark:border-gray-700">
          <p className="text-sm text-black dark:text-white">
            Si lo quitas, dejamos de cobrarte automáticamente <strong>desde ya</strong>. Tendrás
            que pagar cada mes por tu cuenta.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => void alRevocar()}
              disabled={revocar.isPending}
              className="w-full sm:w-auto"
            >
              {revocar.isPending ? 'Quitando…' : 'Sí, quitar el pago automático'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmando(false)}
              className="w-full sm:w-auto"
            >
              Dejarlo activo
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setConfirmando(true)} className="w-full">
          Quitar el pago automático
        </Button>
      )}
    </Card>
  );
}
