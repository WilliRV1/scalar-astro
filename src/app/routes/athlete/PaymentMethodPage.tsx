import { useAuth } from '../../../features/auth/useAuth';
import { useAthlete } from '../../../features/athletes/queries';
import { useAthleteBilling } from '../../../features/billing/queries-athlete';
import { formatCents } from '../../../shared/lib/money';
import { Card, EmptyState, Spinner } from '../../../shared/ui';
import {
  AutorizarDebito,
  CobrosAutomaticos,
  DebitoActivo,
  useMiDebito,
  useMisCobrosAutomaticos,
} from '../../../features/recurring';

/**
 * Mi pago automático · pantalla del atleta.
 *
 * Es la cara visible del mayor diferenciador del producto: "tus atletas pagan
 * por Nequi el día 1 sin que tú escribas un solo mensaje"
 * (docs/08-mercado-cali.md §7.3).
 *
 * Tres cosas tienen que quedar claras sin desplazarse:
 *   · QUÉ se cobra, CUÁNDO y DE DÓNDE. Autorizar sin eso es firmar en blanco.
 *   · Cómo se quita. Un botón, un toque, sin escribirle a nadie.
 *   · Si un cobro falló: por qué, y qué hacer ahora.
 *
 * Todo lo que se ve sale de consultas SIN filtro por atleta más allá del suyo:
 * es la RLS la que devuelve únicamente sus filas.
 */
export default function PaymentMethodPage() {
  const { activeMembership } = useAuth();
  const athleteId = activeMembership?.athlete_id ?? null;

  const { data: athlete, isLoading: cargandoAtleta } = useAthlete(athleteId);
  const { data: debito, isLoading: cargandoDebito } = useMiDebito(athleteId);
  const { data: cobros } = useMisCobrosAutomaticos(athleteId);
  const { data: facturacion } = useAthleteBilling(athleteId);

  if (cargandoAtleta || cargandoDebito) return <Spinner />;

  if (!athlete || !athleteId) {
    return (
      <EmptyState
        title="Tu ficha no está vinculada"
        hint="Pídele a tu coach que conecte tu usuario con tu ficha de atleta."
      />
    );
  }

  const suscripcion = facturacion?.subscription ?? null;
  const montoMensual = suscripcion
    ? suscripcion.price_cents - suscripcion.discount_cents
    : null;
  const diaDeCorte = suscripcion?.billing_day ?? null;

  const abiertas = (facturacion?.invoices ?? []).filter(
    (i) => i.status !== 'paid' && i.status !== 'void',
  );
  const saldo = abiertas.reduce((acc, i) => acc + (i.amount_cents - i.paid_cents), 0);

  const activo = debito?.metodo != null && debito?.autorizacion != null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-black dark:text-white">Mi pago automático</h1>
        <p className="text-xs uppercase tracking-widest text-gray-500">
          {activeMembership?.organizations?.name}
        </p>
      </div>

      {activo && debito?.metodo && debito?.autorizacion ? (
        <DebitoActivo
          metodo={debito.metodo}
          autorizacion={debito.autorizacion}
          montoMensual={montoMensual}
          diaDeCorte={diaDeCorte}
        />
      ) : (
        <AutorizarDebito
          athleteId={athleteId}
          telefonoDelAtleta={athlete.phone}
          montoMensual={montoMensual}
          diaDeCorte={diaDeCorte}
        />
      )}

      {saldo > 0 && (
        <Card>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Pendiente hoy
          </p>
          <p className="font-display text-3xl text-black dark:text-white">{formatCents(saldo)}</p>
          <p className="mt-1 text-xs text-gray-500">
            {activo
              ? 'Se cobra solo en tu fecha de corte. No tienes que hacer nada.'
              : 'Mientras no actives el pago automático, esto se paga a mano.'}
          </p>
        </Card>
      )}

      <section>
        <h2 className="mb-3 font-display text-2xl text-black dark:text-white">
          Mis cobros automáticos
        </h2>
        <CobrosAutomaticos cobros={cobros ?? []} />
      </section>

      <p className="text-xs leading-relaxed text-gray-500">
        Nunca guardamos el número de tu tarjeta ni tu clave. La pasarela nos devuelve un
        identificador con el que solo se puede cobrar lo que tú autorizaste, y eso es lo único
        que queda en el sistema.
      </p>
    </div>
  );
}
