import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../features/auth/useAuth';
import {
  LIMITE_CARTERA, useCartera, useCarteraTotales, useMonthlyCollected, type CarteraRow,
} from '../../../features/billing/queries';
import type { Tramo } from '../../../features/billing/totales';
import { mensajeAmigable } from '../../../shared/lib/errores';
import { fechaCorta, fechaLarga } from '../../../shared/lib/fechas';
import { daysOverdue, formatCents } from '../../../shared/lib/money';
import { formatPhone, whatsappLink } from '../../../shared/lib/phone';
import { Card, EmptyState, ErrorNote, Spinner, Stat } from '../../../shared/ui';

/**
 * Tablero de cartera.
 *
 * Ordenado por antigüedad de la deuda, no por nombre: lo primero que ve el
 * dueño es lo que hay que perseguir hoy. Agrupado por tramos de mora porque no
 * se gestiona igual a quien debe desde ayer que a quien debe hace un mes.
 *
 * Los totales (por cobrar, en mora, cada tramo) vienen de la base y cubren
 * todos los cobros abiertos. La lista trae solo los primeros LIMITE_CARTERA:
 * es para escribirle a la gente, no para sumar.
 */

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
    ? `Hola ${nombre}, te recuerdo que tu mensualidad de ${formatCents(saldo)} vence el ${fechaLarga(row.due_on)}. ¡Nos vemos en el box!`
    : `Hola ${nombre}, tu mensualidad de ${formatCents(saldo)} venció el ${fechaLarga(row.due_on)}. ¿Nos ayudas con el pago?`;
}

export default function AdminHome() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const { data: cartera, isLoading, error } = useCartera(orgId);
  const { data: totales, error: errorTotales } = useCarteraTotales(orgId);
  const {
    data: recaudo,
    isLoading: cargandoRecaudo,
    error: errorRecaudo,
  } = useMonthlyCollected(orgId);
  const [tramoAbierto, setTramoAbierto] = useState<Tramo | 'todos'>('todos');

  const grupos = useMemo(() => {
    const base: Record<Tramo, CarteraRow[]> = {
      porVencer: [], reciente: [], seria: [], critica: [],
    };
    for (const r of cartera ?? []) {
      base[tramoDe(daysOverdue(r.due_on))].push(r);
    }
    return base;
  }, [cartera]);

  if (isLoading && !cartera) return <Spinner label="Cargando cartera" />;
  if (error && !cartera) {
    return <ErrorNote>No se pudo cargar la cartera: {mensajeAmigable(error)}</ErrorNote>;
  }

  const filas = cartera ?? [];
  const listaIncompleta = filas.length >= LIMITE_CARTERA;
  const visibles = tramoAbierto === 'todos' ? filas : grupos[tramoAbierto];
  // Mientras la base responde se muestra "…", y si falla "—": nunca un cero
  // que el dueño pueda leer como "nadie me debe".
  const cifra = (cents: number | undefined) =>
    errorTotales ? '—' : cents === undefined ? '…' : formatCents(cents);

  return (
    <div className="space-y-6">
      {error && (
        <ErrorNote>No se pudo actualizar la cartera: {mensajeAmigable(error)}</ErrorNote>
      )}
      {errorTotales && (
        <ErrorNote>No se pudieron calcular los totales: {mensajeAmigable(errorTotales)}</ErrorNote>
      )}
      {errorRecaudo && (
        <ErrorNote>No se pudo leer el recaudo del mes: {mensajeAmigable(errorRecaudo)}</ErrorNote>
      )}
      {listaIncompleta && (
        <ErrorNote>
          La lista muestra los {LIMITE_CARTERA} cobros más antiguos
          {totales ? ` de ${totales.cobros}` : ''}. Los totales de arriba sí incluyen todo.
        </ErrorNote>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Por cobrar"
          value={cifra(totales?.pendiente_cents)}
          hint={totales && `${totales.cobros} cobro(s) abierto(s)`}
        />
        <Stat
          label="En mora"
          value={cifra(totales?.mora_cents)}
          hint={
            totales && (totales.enMora ? `${totales.enMora} cobro(s) — gestionar hoy` : 'Nadie en mora')
          }
        />
        <Stat
          label="Recaudado este mes"
          value={errorRecaudo ? '—' : cargandoRecaudo ? '…' : formatCents(recaudo?.cents ?? 0)}
          hint={
            errorRecaudo
              ? 'No se pudo leer'
              : cargandoRecaudo
                ? 'Cargando…'
                : `${recaudo?.count ?? 0} pago(s) registrado(s)`
          }
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {TRAMOS.map((t) => {
          const g = totales?.porTramo[t.key];
          const activo = tramoAbierto === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={activo}
              onClick={() => setTramoAbierto(activo ? 'todos' : t.key)}
              className={`grunge-border min-h-11 p-3 text-left transition ${
                activo ? 'border-primary bg-primary/10' : 'hover:border-gray-500'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-widest ${t.className}`}>
                {t.label}
              </p>
              <p className="font-display text-2xl text-black dark:text-white">
                {cifra(g?.saldo_cents)}
              </p>
              <p className="text-[11px] text-gray-500">
                {g ? `${g.cobros} cobro(s) · ` : ''}{t.hint}
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
              type="button"
              onClick={() => setTramoAbierto('todos')}
              className="min-h-11 px-3 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
            >
              Ver todo
            </button>
          )}
        </div>

        {visibles.length === 0 ? (
          tramoAbierto === 'todos' ? (
            <EmptyState
              title="Nadie debe nada"
              hint="Cuando se generen los cobros del periodo aparecerán aquí, del más viejo al más nuevo."
            />
          ) : (
            <EmptyState
              title={`Nadie en el tramo "${TRAMOS.find((t) => t.key === tramoAbierto)?.label ?? ''}"`}
              hint="Hay cobros abiertos en otros tramos. Toca «Ver todo» para verlos."
            />
          )
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
                      {formatPhone(r.athletes?.phone)} · vence {fechaCorta(r.due_on)}
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
                        aria-label={`Escribir a ${nombre || 'atleta'} por WhatsApp`}
                        className="grunge-border inline-flex min-h-11 items-center px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-300 hover:border-primary hover:text-primary"
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
