import { useState } from 'react';
import { mensajeAmigable } from '../../shared/lib/errores';
import { fechaCorta } from '../../shared/lib/fechas';
import { formatCents } from '../../shared/lib/money';
import { Button, Card, EmptyState, ErrorNote, Spinner, Stat } from '../../shared/ui';
import { usePagarScalar } from './mutations';
import { usePagosScalar, useSuscripcionScalar } from './queries';
import type { EstadoSuscripcion, PlanScalar } from './types';

/**
 * Lo que el box le paga a Scalar: el plan, cuándo vence y el botón para pagar.
 *
 * El botón abre el checkout de Mercado Pago de SCALAR (no el del box). Cuando
 * Mercado Pago avisa que entró la plata, el periodo queda pago y la fecha del
 * próximo cobro avanza sola. Si el dueño prefiere Nequi, se lo registramos a
 * mano y aquí aparece igual.
 */

const NOMBRE_PLAN: Record<PlanScalar, string> = {
  trial: 'Prueba',
  starter: 'Starter',
  box: 'Box',
  pro: 'Pro',
  chain: 'Cadena',
};

const ESTADO: Record<EstadoSuscripcion, { texto: string; className: string }> = {
  trialing:  { texto: 'En prueba',  className: 'text-gray-400' },
  active:    { texto: 'Al día',     className: 'text-emerald-500' },
  past_due:  { texto: 'En mora',    className: 'text-primary' },
  suspended: { texto: 'Suspendido', className: 'text-primary' },
  cancelled: { texto: 'Cancelado',  className: 'text-gray-500' },
};

const METODO: Record<string, string> = {
  nequi: 'Nequi', transfer: 'Transferencia', cash: 'Efectivo', card: 'Tarjeta',
  pse: 'PSE', daviplata: 'Daviplata', other: 'Otro',
};

export function SeccionSuscripcion({ orgId }: { orgId: string }) {
  const { data: suscripcion, isLoading, error } = useSuscripcionScalar(orgId);
  const { data: pagos, error: errorPagos } = usePagosScalar(orgId);
  const pagar = usePagarScalar();
  const [errorPago, setErrorPago] = useState('');

  if (isLoading) return <Spinner label="Cargando tu plan" />;
  if (error) return <ErrorNote>No se pudo cargar tu plan: {mensajeAmigable(error)}</ErrorNote>;
  if (!suscripcion) {
    return (
      <EmptyState
        title="Solo el dueño ve esto"
        hint="El plan y los pagos a Scalar los maneja el dueño del box. Si eres tú y ves esto, escríbenos."
      />
    );
  }

  async function alPagar() {
    setErrorPago('');
    try {
      const enlace = await pagar.mutateAsync(orgId);
      // `assign` y no `location.href = …`: el enlace es de la pasarela, así que
      // se sale de la aplicación a propósito.
      window.location.assign(enlace.checkout_url);
    } catch (causa) {
      setErrorPago(causa instanceof Error ? causa.message : 'No se pudo abrir el enlace de pago.');
    }
  }

  const estado = ESTADO[suscripcion.status];
  const sinPrecio = suscripcion.price_cents <= 0;
  const historial = pagos ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Plan"
          value={NOMBRE_PLAN[suscripcion.plan_tier] ?? suscripcion.plan_tier}
          hint={suscripcion.is_founder ? 'Precio de fundador' : undefined}
        />
        <Stat
          label={suscripcion.billing_period === 'annual' ? 'Al año' : 'Al mes'}
          value={sinPrecio ? '—' : formatCents(suscripcion.price_cents)}
          hint={sinPrecio ? 'Sin precio asignado todavía' : undefined}
        />
        <Stat
          label="Próximo cobro"
          value={suscripcion.next_charge_on ? fechaCorta(suscripcion.next_charge_on) : '—'}
          hint={
            suscripcion.status === 'past_due'
              ? `Vencido · ${suscripcion.grace_days} días de gracia`
              : suscripcion.status === 'trialing'
                ? 'Termina la prueba'
                : undefined
          }
        />
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${estado.className}`}>
            {estado.texto}
          </p>
          <p className="mt-1 text-sm text-gray-400">
            {sinPrecio
              ? 'Cuando activemos tu plan, aquí aparece el botón para pagar en línea.'
              : 'Pagas con PSE, tarjeta o Efecty desde Mercado Pago. Apenas entre la plata, la fecha del próximo cobro avanza sola.'}
          </p>
        </div>
        <Button onClick={() => void alPagar()} disabled={sinPrecio || pagar.isPending}>
          {pagar.isPending ? 'Abriendo…' : 'Pagar con Mercado Pago'}
        </Button>
      </Card>
      {errorPago && <ErrorNote>{errorPago}</ErrorNote>}

      <p className="text-xs text-gray-500">
        ¿Prefieres Nequi o transferencia? Escríbenos y lo registramos a mano: queda en el mismo
        historial de abajo.
      </p>

      <section>
        <h3 className="mb-2 font-display text-2xl text-black dark:text-white">Pagos a Scalar</h3>
        {errorPagos && (
          <ErrorNote>No se pudieron cargar tus pagos: {mensajeAmigable(errorPagos)}</ErrorNote>
        )}
        {!errorPagos && historial.length === 0 && (
          <EmptyState title="Todavía no hay pagos" hint="El primero aparece aquí apenas se registre." />
        )}
        {historial.length > 0 && (
          <div className="space-y-2">
            {historial.map((p) => (
              <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-40 flex-1">
                  <p className="font-bold text-black dark:text-white">
                    {formatCents(p.amount_cents)}
                    {p.status === 'refunded' && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-primary">
                        Reembolsado
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    Del {fechaCorta(p.period_start)} al {fechaCorta(p.period_end)} ·{' '}
                    {p.provider === 'mercadopago' ? 'Mercado Pago' : METODO[p.method] ?? p.method}
                  </p>
                </div>
                <span className="text-xs text-gray-500">{fechaCorta(p.paid_at)}</span>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
