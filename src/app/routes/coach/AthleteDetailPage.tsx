import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../../features/auth/useAuth';
import { canViewFinances } from '../../../features/auth/AuthContext';
import { fullName, useAthlete } from '../../../features/athletes/queries';
import { AthleteForm } from '../../../features/athletes/AthleteForm';
import { useAthleteBilling } from '../../../features/billing/queries-athlete';
import { PaymentForm } from '../../../features/billing/PaymentForm';
import { SubscriptionForm } from '../../../features/billing/SubscriptionForm';
import { PersonalRecords } from '../../../features/performance/PersonalRecords';
import { daysOverdue, formatCents } from '../../../shared/lib/money';
import { formatPhone, whatsappLink } from '../../../shared/lib/phone';
import { Button, Card, EmptyState, Spinner, Stat } from '../../../shared/ui';
import type { Invoice } from '../../../types/database';

export default function AthleteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const verFinanzas = canViewFinances(activeMembership);

  const { data: athlete, isLoading } = useAthlete(id);
  const { data: billing } = useAthleteBilling(id);

  const [editando, setEditando] = useState(false);
  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [facturaElegida, setFacturaElegida] = useState<Invoice | null>(null);
  const [cambiandoPlan, setCambiandoPlan] = useState(false);

  if (isLoading) return <Spinner />;
  if (!athlete) return <EmptyState title="Atleta no encontrado" />;

  const abiertas = (billing?.invoices ?? []).filter(
    (i) => i.status !== 'paid' && i.status !== 'void',
  );
  const saldo = abiertas.reduce((acc, i) => acc + (i.amount_cents - i.paid_cents), 0);

  return (
    <div className="space-y-6">
      <Link to="/coach/atletas" className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary">
        ← Atletas
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-black dark:text-white">{fullName(athlete)}</h1>
          <p className="text-sm text-gray-500">
            {formatPhone(athlete.phone)} · desde {athlete.joined_on}
            {athlete.referral_source && ` · llegó por ${athlete.referral_source}`}
          </p>
        </div>
        <div className="flex gap-2">
          {athlete.phone && (
            <a
              href={whatsappLink(athlete.phone, `Hola ${athlete.first_name}, te escribo del box.`)}
              target="_blank"
              rel="noreferrer"
              className="grunge-border px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-400 hover:border-primary hover:text-primary"
            >
              WhatsApp
            </a>
          )}
          <Button variant="ghost" onClick={() => setEditando(true)}>Editar</Button>
        </div>
      </div>

      {verFinanzas && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Saldo pendiente"
              value={saldo > 0 ? formatCents(saldo) : 'Al día'}
              hint={abiertas.length ? `${abiertas.length} cobro(s) abierto(s)` : undefined}
            />
            <Stat
              label="Plan"
              value={billing?.subscription?.plans?.name ?? 'Sin plan'}
              hint={
                billing?.subscription
                  ? `${formatCents(billing.subscription.price_cents - billing.subscription.discount_cents)} · corte el ${billing.subscription.billing_day}`
                  : 'Asígnale uno para que se le generen los cobros'
              }
            />
            <Card className="flex flex-col justify-center gap-2">
              <Button onClick={() => { setFacturaElegida(abiertas[0] ?? null); setPagoAbierto(true); }}>
                Registrar pago
              </Button>
              <Button variant="ghost" onClick={() => setCambiandoPlan(true)}>
                {billing?.subscription ? 'Cambiar plan' : 'Asignar plan'}
              </Button>
            </Card>
          </div>

          <section>
            <h2 className="mb-3 font-display text-2xl text-black dark:text-white">Cobros</h2>
            {(billing?.invoices ?? []).length === 0 ? (
              <EmptyState
                title="Sin cobros todavía"
                hint="Se generan solos en la fecha de corte del atleta."
              />
            ) : (
              <div className="space-y-2">
                {billing?.invoices.map((i) => {
                  const mora = daysOverdue(i.due_on);
                  const pendiente = i.amount_cents - i.paid_cents;
                  return (
                    <Card key={i.id} className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-black dark:text-white">{i.number}</p>
                        <p className="text-xs text-gray-500">
                          {i.period_start} a {i.period_end} · vence {i.due_on}
                          {i.status !== 'paid' && mora > 0 && (
                            <span className="ml-2 font-bold text-primary">{mora} días de mora</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-display text-xl text-black dark:text-white">
                          {formatCents(i.amount_cents)}
                        </span>
                        {i.status === 'paid' ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest text-green-500">
                            Pagada
                          </span>
                        ) : (
                          <button
                            onClick={() => { setFacturaElegida(i); setPagoAbierto(true); }}
                            className="text-xs font-bold uppercase text-gray-500 hover:text-primary"
                          >
                            Cobrar {formatCents(pendiente)}
                          </button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-display text-2xl text-black dark:text-white">Pagos recibidos</h2>
            {(billing?.payments ?? []).length === 0 ? (
              <EmptyState title="Sin pagos registrados" />
            ) : (
              <div className="space-y-2">
                {billing?.payments.map((p) => (
                  <Card key={p.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-black dark:text-white">{formatCents(p.amount_cents)}</p>
                      <p className="text-xs uppercase tracking-widest text-gray-500">{p.method}</p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(p.paid_at).toLocaleDateString('es-CO')}
                    </span>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {orgId && <PersonalRecords orgId={orgId} athleteId={athlete.id} canEdit />}

      {!verFinanzas && (
        <Card>
          <p className="text-sm text-gray-500">
            No tienes acceso a la información financiera de este box. Si la necesitas, pídele
            al dueño que te active el permiso.
          </p>
        </Card>
      )}

      {orgId && editando && (
        <AthleteForm orgId={orgId} athlete={athlete} open onClose={() => setEditando(false)} />
      )}
      {orgId && pagoAbierto && (
        <PaymentForm
          key={facturaElegida?.id ?? 'suelto'}
          open
          orgId={orgId}
          athleteId={athlete.id}
          invoice={facturaElegida}
          onClose={() => { setPagoAbierto(false); setFacturaElegida(null); }}
        />
      )}
      {orgId && cambiandoPlan && (
        <SubscriptionForm
          open
          orgId={orgId}
          athleteId={athlete.id}
          current={billing?.subscription ?? null}
          onClose={() => setCambiandoPlan(false)}
        />
      )}
    </div>
  );
}
