import { useAuth } from '../../../features/auth/useAuth';
import { fullName, useAthlete } from '../../../features/athletes/queries';
import { useMyInvoices, useMyPayments } from '../../../features/billing/queries';
import { daysOverdue, formatCents } from '../../../shared/lib/money';
import { PersonalRecords } from '../../../features/performance/PersonalRecords';
import { Card, EmptyState, ErrorNote, Spinner, Stat } from '../../../shared/ui';
import { mensajeAmigable } from '../../../shared/lib/errores';
import { fechaCorta } from '../../../shared/lib/fechas';

/**
 * Vista del atleta. Todo lo que se ve aquí sale de consultas SIN filtro por
 * atleta más allá del suyo: es la RLS la que devuelve únicamente sus filas.
 * Si esta pantalla tuviera un bug y pidiera "todos los cobros", el servidor
 * seguiría devolviendo solo los de esta persona.
 */
export default function AthleteHome() {
  const { activeMembership } = useAuth();
  const athleteId = activeMembership?.athlete_id ?? null;

  const { data: athlete, isLoading, error: errorFicha } = useAthlete(athleteId);
  const { data: invoices, error: errorCobros } = useMyInvoices(athleteId);
  const { data: payments, isError: fallaronPagos, error: errorPagos } = useMyPayments(athleteId);

  if (isLoading) return <Spinner />;
  if (errorFicha) {
    return <ErrorNote>No se pudo cargar tu ficha: {mensajeAmigable(errorFicha)}</ErrorNote>;
  }
  if (!athlete) {
    return (
      <EmptyState
        title="Tu ficha no está vinculada"
        hint="Pídele a tu coach que conecte tu usuario con tu ficha de atleta."
      />
    );
  }

  const abiertas = (invoices ?? []).filter((i) => i.status !== 'paid' && i.status !== 'void');
  const saldo = abiertas.reduce((acc, i) => acc + (i.amount_cents - i.paid_cents), 0);
  const proxima = abiertas[abiertas.length - 1];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-black dark:text-white">{fullName(athlete)}</h1>
        <p className="text-xs uppercase tracking-widest text-gray-500">
          {activeMembership?.organizations?.name}
        </p>
      </div>

      {errorCobros && (
        <ErrorNote>No se pudo cargar tu saldo: {mensajeAmigable(errorCobros)}</ErrorNote>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          label="Mi saldo"
          value={errorCobros ? '—' : saldo > 0 ? formatCents(saldo) : 'Al día'}
          hint={
            errorCobros
              ? 'Sin conexión con el servidor'
              : proxima
                ? daysOverdue(proxima.due_on) > 0
                  ? `Venció el ${fechaCorta(proxima.due_on)}`
                  : `Vence el ${fechaCorta(proxima.due_on)}`
                : 'Sin cobros pendientes'
          }
        />
        <Stat label="Desde" value={fechaCorta(athlete.joined_on)} hint="Fecha de ingreso al box" />
      </div>

      {activeMembership && (
        <PersonalRecords
          orgId={activeMembership.org_id}
          athleteId={athlete.id}
          canEdit={false}
        />
      )}

      <section>
        <h2 className="mb-3 font-display text-2xl text-black dark:text-white">Mis pagos</h2>
        {fallaronPagos ? (
          <ErrorNote>No se pudieron cargar tus pagos: {mensajeAmigable(errorPagos)}</ErrorNote>
        ) : (payments ?? []).length === 0 ? (
          <EmptyState title="Todavía no hay pagos registrados" />
        ) : (
          <div className="space-y-2">
            {payments?.map((p) => (
              <Card key={p.id} className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-black dark:text-white">{formatCents(p.amount_cents)}</p>
                  <p className="text-xs uppercase tracking-widest text-gray-500">{p.method}</p>
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
