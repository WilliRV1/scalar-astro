import { useAuth } from '../../../features/auth/useAuth';
import { useCartera } from '../../../features/billing/queries';
import { daysOverdue, formatCents } from '../../../shared/lib/money';
import { formatPhone, whatsappLink } from '../../../shared/lib/phone';
import { Card, EmptyState, ErrorNote, Spinner, Stat } from '../../../shared/ui';

/**
 * Tablero de cartera: quién debe, cuánto y hace cuántos días.
 * Ordenado por antigüedad de la deuda, no por nombre: lo primero que se ve es
 * lo que hay que perseguir.
 */
export default function AdminHome() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const { data: cartera, isLoading, error } = useCartera(orgId);

  if (isLoading) return <Spinner label="Cargando cartera" />;
  if (error) return <ErrorNote>No se pudo cargar la cartera: {String(error)}</ErrorNote>;

  const rows = cartera ?? [];
  const pendiente = rows.reduce((acc, r) => acc + (r.amount_cents - r.paid_cents), 0);
  const vencidos = rows.filter((r) => daysOverdue(r.due_on) > 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Por cobrar" value={formatCents(pendiente)} hint={`${rows.length} cobros abiertos`} />
        <Stat
          label="Vencidos"
          value={String(vencidos.length)}
          hint={vencidos.length ? 'Requieren gestión hoy' : 'Nadie en mora'}
        />
        <Stat label="Box" value={activeMembership?.organizations?.name ?? '—'} />
      </div>

      <section>
        <h2 className="mb-3 font-display text-2xl text-black dark:text-white">Cartera</h2>

        {rows.length === 0 ? (
          <EmptyState
            title="Nadie debe nada"
            hint="Cuando se generen los cobros del periodo aparecerán aquí, ordenados por antigüedad."
          />
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const mora = daysOverdue(r.due_on);
              const saldo = r.amount_cents - r.paid_cents;
              const nombre = [r.athletes?.first_name, r.athletes?.last_name]
                .filter(Boolean)
                .join(' ');
              return (
                <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-black dark:text-white">{nombre || 'Atleta'}</p>
                    <p className="text-xs text-gray-500">
                      {formatPhone(r.athletes?.phone)} · vence {r.due_on}
                      {mora > 0 && (
                        <span className="ml-2 font-bold text-primary">
                          {mora} {mora === 1 ? 'día' : 'días'} de mora
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-display text-2xl text-black dark:text-white">
                      {formatCents(saldo)}
                    </span>
                    {r.athletes?.phone && (
                      /* Etapa 0 de WhatsApp (docs/04): sin API, sin trámites.
                         El sistema decide a quién y redacta; el coach solo toca. */
                      <a
                        href={whatsappLink(
                          r.athletes.phone,
                          `Hola ${r.athletes.first_name}, te escribo del box. Tu mensualidad de ${formatCents(
                            saldo,
                          )} venció el ${r.due_on}. ¿Nos ayudas con el pago?`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="grunge-border px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-300 hover:border-primary hover:text-primary"
                      >
                        Escribir
                      </a>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
