import { useMemo, useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import { BarrasOrdenadas, CasillaDato, NetoPorMes, Seccion } from '../../../features/finance/charts';
import {
  formatMonth, formatMonthLong, formatPct, resumirPnl, retencionPeriodo,
  totalesPeriodo, variacion,
} from '../../../features/finance/pnl';
import {
  useAthleteSources, useMembershipReport, useMonthlyPnl, useMrr,
} from '../../../features/finance/queries';
import { formatCents } from '../../../shared/lib/money';
import { Card, EmptyState, ErrorNote, Spinner } from '../../../shared/ui';

/**
 * Reportes del dueño.
 *
 * El P&L manda: ingresos menos egresos, este mes contra el anterior. Debajo, lo
 * que explica ese número: cuánto entra todos los meses pase lo que pase (el
 * ingreso recurrente), quién entró y quién se fue, y de dónde están llegando
 * los atletas.
 *
 * Sobre las gráficas: una sola serie por gráfica y nunca dos ejes Y. El
 * ingreso y el egreso NO comparten dibujo (escalas distintas = correlación
 * inventada); el neto se ve en barras y el detalle mes a mes en la tabla.
 */

const RANGOS = [6, 12];

export default function ReportsPage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const [meses, setMeses] = useState(6);

  const { data: pnl, isLoading, error } = useMonthlyPnl(orgId, meses);
  const { data: mrr } = useMrr(orgId);
  const { data: membresias } = useMembershipReport(orgId, meses);
  const { data: origenes } = useAthleteSources(orgId);

  const filas = useMemo(() => pnl ?? [], [pnl]);
  const resumen = useMemo(() => resumirPnl(filas), [filas]);
  const totales = useMemo(() => totalesPeriodo(filas), [filas]);

  const membresiasFilas = useMemo(() => membresias ?? [], [membresias]);
  const mesActual = membresiasFilas.length > 0 ? membresiasFilas[membresiasFilas.length - 1] : null;
  const mesAnterior = membresiasFilas.length > 1 ? membresiasFilas[membresiasFilas.length - 2] : null;
  const retencion = retencionPeriodo(membresiasFilas);

  const totalAtletas = (origenes ?? []).reduce((a, o) => a + o.total, 0);

  if (isLoading) return <Spinner label="Cargando reportes" />;
  if (error) return <ErrorNote>No se pudieron cargar los reportes: {String(error)}</ErrorNote>;

  if (filas.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay nada que reportar"
        hint="Cuando entren pagos y se registren gastos, aquí aparece el P&L del box."
      />
    );
  }

  const actual = resumen.actual;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-black dark:text-white">Reportes</h1>
        <div className="flex gap-1">
          {RANGOS.map((r) => (
            <button
              key={r}
              onClick={() => setMeses(r)}
              className={`grunge-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition ${
                meses === r ? 'border-primary text-primary' : 'text-gray-500 hover:text-primary'
              }`}
            >
              {r} meses
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500">
        {actual ? formatMonthLong(actual.month) : ''} comparado con{' '}
        {resumen.anterior ? formatMonthLong(resumen.anterior.month).toLowerCase() : 'nada todavía'}.
        Los ingresos son pagos confirmados, no facturas emitidas.
      </p>

      {/* ------------------------------------------------- P&L del mes ---- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CasillaDato
          label="Ingresos del mes"
          value={formatCents(actual?.income_cents ?? 0)}
          variacion={resumen.ingresos}
          metrica="ingreso"
          trend={filas.map((f) => f.income_cents)}
          trendLabels={filas.map((f) => `${formatMonth(f.month)}: ${formatCents(f.income_cents)}`)}
        />
        <CasillaDato
          label="Egresos del mes"
          value={formatCents(actual?.expense_cents ?? 0)}
          variacion={resumen.egresos}
          metrica="egreso"
          trend={filas.map((f) => f.expense_cents)}
          trendLabels={filas.map((f) => `${formatMonth(f.month)}: ${formatCents(f.expense_cents)}`)}
        />
        <CasillaDato
          label="Neto del mes"
          value={formatCents(actual?.net_cents ?? 0)}
          variacion={resumen.neto}
          metrica="ingreso"
          hint={resumen.margen === null ? 'Sin ingresos' : `Margen ${formatPct(resumen.margen)}`}
        />
        <CasillaDato
          label="Ingreso recurrente"
          value={formatCents(mrr?.mrr_cents ?? 0)}
          hint={`${mrr?.active_subscriptions ?? 0} suscripción(es) activa(s)`}
        />
      </div>

      {/* ------------------------------------------------- neto por mes --- */}
      <Seccion title="Resultado mes a mes">
        <Card className="space-y-4">
          <NetoPorMes rows={filas} />

          {/* Tabla gemela de la gráfica: todo valor se puede leer sin depender
              del color ni del tamaño de la barra. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-gray-500">
                  <th className="py-1 font-bold">Mes</th>
                  <th className="py-1 text-right font-bold">Ingresos</th>
                  <th className="py-1 text-right font-bold">Egresos</th>
                  <th className="py-1 text-right font-bold">Neto</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.month} className="border-t border-gray-200 dark:border-gray-800">
                    <td className="py-1.5 text-gray-500">{formatMonth(f.month)}</td>
                    <td className="py-1.5 text-right tabular-nums text-black dark:text-white">
                      {formatCents(f.income_cents)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-black dark:text-white">
                      {formatCents(f.expense_cents)}
                    </td>
                    <td className={`py-1.5 text-right font-bold tabular-nums ${
                      f.net_cents < 0 ? 'text-primary' : 'text-black dark:text-white'
                    }`}>
                      {formatCents(f.net_cents)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 dark:border-gray-700">
                  <td className="py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    Periodo
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-black dark:text-white">
                    {formatCents(totales.ingresos)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-black dark:text-white">
                    {formatCents(totales.egresos)}
                  </td>
                  <td className={`py-1.5 text-right font-bold tabular-nums ${
                    totales.neto < 0 ? 'text-primary' : 'text-black dark:text-white'
                  }`}>
                    {formatCents(totales.neto)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </Seccion>

      {/* ------------------------------------------------- membresías ----- */}
      <Seccion title="Altas, bajas y retención">
        <div className="grid gap-3 sm:grid-cols-3">
          <CasillaDato
            label="Altas del mes"
            value={String(mesActual?.altas ?? 0)}
            variacion={mesAnterior ? variacion(mesActual?.altas ?? 0, mesAnterior.altas) : undefined}
            metrica="ingreso"
            trend={membresiasFilas.map((m) => m.altas)}
            trendLabels={membresiasFilas.map((m) => `${formatMonth(m.month)}: ${m.altas} alta(s)`)}
          />
          <CasillaDato
            label="Bajas del mes"
            value={String(mesActual?.bajas ?? 0)}
            variacion={mesAnterior ? variacion(mesActual?.bajas ?? 0, mesAnterior.bajas) : undefined}
            metrica="egreso"
            trend={membresiasFilas.map((m) => m.bajas)}
            trendLabels={membresiasFilas.map((m) => `${formatMonth(m.month)}: ${m.bajas} baja(s)`)}
          />
          <CasillaDato
            label="Retención del mes"
            value={mesActual?.retencion === null || mesActual === null
              ? '—'
              : formatPct(mesActual.retencion).replace('+', '')}
            hint={retencion === null
              ? 'Sin base para comparar'
              : `Periodo: ${formatPct(retencion).replace('+', '')}`}
          />
        </div>
        <p className="text-xs text-gray-500">
          La retención del periodo pondera por el tamaño del box cada mes: un mes con 4
          atletas no puede pesar igual que uno con 80.
        </p>
      </Seccion>

      {/* ------------------------------------------------- origen --------- */}
      <Seccion title="De dónde salen los atletas">
        {(origenes ?? []).length === 0 ? (
          <EmptyState
            title="Sin datos de origen"
            hint="Anota de dónde llegó cada atleta en su ficha y aquí verás qué canal funciona."
          />
        ) : (
          <Card className="space-y-3">
            <BarrasOrdenadas
              items={(origenes ?? []).map((o) => ({ label: o.source, value: o.total }))}
              total={totalAtletas}
            />
            <ul className="space-y-1 border-t border-gray-200 pt-3 dark:border-gray-800">
              {(origenes ?? []).map((o) => (
                <li key={o.source} className="flex justify-between gap-3 text-sm">
                  <span className="text-gray-500">{o.source}</span>
                  <span className="tabular-nums text-black dark:text-white">
                    {o.total} · {o.activos} activo(s)
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Seccion>
    </div>
  );
}
