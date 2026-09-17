import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../features/auth/useAuth';
import { useCartera, useMonthlyCollected, type CarteraRow } from '../../../features/billing/queries';
import { daysOverdue, formatCents } from '../../../shared/lib/money';
import { formatPhone, whatsappLink } from '../../../shared/lib/phone';
import { Card, EmptyState, ErrorNote, Spinner, Stat } from '../../../shared/ui';

/**
 * Tablero de cartera.
 *
 * Ordenado por antigüedad de la deuda, no por nombre: lo primero que ve el
 * dueño es lo que hay que perseguir hoy. Agrupado por tramos de mora porque no
 * se gestiona igual a quien debe desde ayer que a quien debe hace un mes.
 */

type Tramo = 'porVencer' | 'reciente' | 'seria' | 'critica';

const TRAMOS: { key: Tramo; label: string; hint: string; className: string }[] = [
  { key: 'porVencer', label: 'Por vencer',       hint: 'Todavía no vence',        className: 'text-gray-400' },
  { key: 'reciente',  label: '1 a 7 días',       hint: 'Un recordatorio basta',   className: 'text-yellow-500' },
  { key: 'seria',     label: '8 a 30 días',      hint: 'Toca escribir en serio',  className: 'text-orange-500' },
  { key: 'critica',   label: 'Más de 30 días',   hint: 'Probablemente ya se fue', className: 'text-primary' },
];

function tramoDe(dias: number): Tramo {
  if (dias <= 0) return 'porVencer';
  if (dias <= 7) return 'reciente';
  if (dias <= 30) return 'seria';
  return 'critica';
}

function mensajeCobro(row: CarteraRow, saldo: number, dias: number): string {
  const nombre = row.athletes?.first_name ?? '';
  return dias <= 0
    ? `Hola ${nombre}, te recuerdo que tu mensualidad de ${formatCents(saldo)} vence el ${row.due_on}. ¡Nos vemos en el box!`
    : `Hola ${nombre}, tu mensualidad de ${formatCents(saldo)} venció el ${row.due_on}. ¿Nos ayudas con el pago?`;
}

export default function AdminHome() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const { data: cartera, isLoading, error } = useCartera(orgId);
  const { data: recaudo } = useMonthlyCollected(orgId);
  const [tramoAbierto, setTramoAbierto] = useState<Tramo | 'todos'>('todos');

  const grupos = useMemo(() => {
    const base: Record<Tramo, { rows: CarteraRow[]; total: number }> = {
      porVencer: { rows: [], total: 0 },
      reciente:  { rows: [], total: 0 },
      seria:     { rows: [], total: 0 },
      critica:   { rows: [], total: 0 },
    };
    for (const r of cartera ?? []) {
      const saldo = r.amount_cents - r.paid_cents;
      const g = base[tramoDe(daysOverdue(r.due_on))];
      g.rows.push(r);
      g.total += saldo;
    }
    return base;
  }, [cartera]);

  if (isLoading) return <Spinner label="Cargando cartera" />;
  if (error) return <ErrorNote>No se pudo cargar la cartera: {String(error)}</ErrorNote>;

  const filas = cartera ?? [];
  const pendiente = filas.reduce((acc, r) => acc + (r.amount_cents - r.paid_cents), 0);
  const enMora = filas.filter((r) => daysOverdue(r.due_on) > 0);
  const visibles = tramoAbierto === 'todos' ? filas : grupos[tramoAbierto].rows;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Por cobrar"
          value={formatCents(pendiente)}
          hint={`${filas.length} cobro(s) abierto(s)`}
        />
        <Stat
          label="En mora"
          value={formatCents(enMora.reduce((a, r) => a + (r.amount_cents - r.paid_cents), 0))}
          hint={enMora.length ? `${enMora.length} atleta(s) — gestionar hoy` : 'Nadie en mora'}
        />
        <Stat
          label="Recaudado este mes"
          value={formatCents(recaudo?.cents ?? 0)}
          hint={`${recaudo?.count ?? 0} pago(s) registrado(s)`}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {TRAMOS.map((t) => {
          const g = grupos[t.key];
          const activo = tramoAbierto === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTramoAbierto(activo ? 'todos' : t.key)}
              className={`grunge-border p-3 text-left transition ${
                activo ? 'border-primary bg-primary/10' : 'hover:border-gray-500'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-widest ${t.className}`}>
                {t.label}
              </p>
              <p className="font-display text-2xl text-black dark:text-white">
                {formatCents(g.total)}
              </p>
              <p className="text-[11px] text-gray-500">
                {g.rows.length} atleta(s) · {t.hint}
              </p>
            </button>
          );
        })}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-black dark:text-white">
            {tramoAbierto === 'todos'
              ? 'Cartera completa'
              : TRAMOS.find((t) => t.key === tramoAbierto)?.label}
          </h2>
          {tramoAbierto !== 'todos' && (
            <button
              onClick={() => setTramoAbierto('todos')}
              className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
            >
              Ver todo
            </button>
          )}
        </div>

        {visibles.length === 0 ? (
          <EmptyState
            title="Nadie debe nada"
            hint="Cuando se generen los cobros del periodo aparecerán aquí, del más viejo al más nuevo."
          />
        ) : (
          <div className="space-y-2">
            {visibles.map((r) => {
              const mora = daysOverdue(r.due_on);
              const saldo = r.amount_cents - r.paid_cents;
              const nombre = [r.athletes?.first_name, r.athletes?.last_name].filter(Boolean).join(' ');
              return (
                <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3">
                  <Link to={`/coach/atletas/${r.athlete_id}`} className="min-w-0 flex-1">
                    <p className="truncate font-bold text-black hover:text-primary dark:text-white">
                      {nombre || 'Atleta'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatPhone(r.athletes?.phone)} · vence {r.due_on}
                      {mora > 0 && (
                        <span className="ml-2 font-bold text-primary">
                          {mora} {mora === 1 ? 'día' : 'días'} de mora
                        </span>
                      )}
                    </p>
                  </Link>
                  <div className="flex items-center gap-4">
                    <span className="font-display text-2xl text-black dark:text-white">
                      {formatCents(saldo)}
                    </span>
                    {r.athletes?.phone ? (
                      /* Etapa 0 de WhatsApp: el sistema decide a quién y redacta;
                         el coach solo toca. Sin API y sin trámites con Meta. */
                      <a
                        href={whatsappLink(r.athletes.phone, mensajeCobro(r, saldo, mora))}
                        target="_blank"
                        rel="noreferrer"
                        className="grunge-border px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-300 hover:border-primary hover:text-primary"
                      >
                        Escribir
                      </a>
                    ) : (
                      <span className="text-[11px] text-gray-600">Sin celular</span>
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
