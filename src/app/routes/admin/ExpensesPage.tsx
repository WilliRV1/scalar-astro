import { useMemo, useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import { BarrasOrdenadas, CasillaDato, Seccion } from '../../../features/finance/charts';
import { ExpenseForm } from '../../../features/finance/ExpenseForm';
import { ReceiptLink } from '../../../features/finance/ReceiptLink';
import { useDeleteExpense, usePayExpense } from '../../../features/finance/mutations';
import {
  finDeMes, formatMonthLong, toISODate, ultimosMeses,
} from '../../../features/finance/pnl';
import {
  useCommitments, useExpenseCategories, useExpenses, useSuppliers,
} from '../../../features/finance/queries';
import type { Commitment, ExpenseRow } from '../../../features/finance/types';
import { formatCents } from '../../../shared/lib/money';
import { Button, Card, EmptyState, ErrorNote, Select, Spinner } from '../../../shared/ui';

/**
 * Gastos del box.
 *
 * Dos listas y no una: arriba lo que VIENE (el calendario de compromisos del
 * mes: arriendo, seguro, mantenimiento, reposiciones) y abajo lo que YA salió.
 * Es la diferencia entre un registro contable y algo que sirve para no quedarse
 * sin plata el 30.
 */

const MESES_VISIBLES = 12;

export default function ExpensesPage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;

  const meses = useMemo(() => ultimosMeses(MESES_VISIBLES), []);
  const [mes, setMes] = useState(meses[meses.length - 1]);
  const hasta = finDeMes(mes);

  const { data: gastos, isLoading, error } = useExpenses(orgId, mes, hasta);
  const { data: categorias } = useExpenseCategories(orgId);
  const { data: proveedores } = useSuppliers(orgId);
  const { data: compromisos } = useCommitments(orgId, mes, hasta);
  const pagar = usePayExpense();
  const borrar = useDeleteExpense();

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<ExpenseRow | null>(null);

  const filas = useMemo(() => gastos ?? [], [gastos]);
  const total = filas.reduce((acc, g) => acc + g.amount_cents, 0);
  const sinPagar = filas.filter((g) => !g.paid_on);

  // Gasto por categoría del mes, de mayor a menor: el dueño quiere saber en qué
  // se le va la plata, no la lista alfabética de sus categorías.
  const porCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const g of filas) {
      const nombre = g.expense_categories?.name ?? 'Sin categoría';
      mapa.set(nombre, (mapa.get(nombre) ?? 0) + g.amount_cents);
    }
    return [...mapa.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [filas]);

  const pendientes = (compromisos ?? []).filter((c) => c.kind === 'expense');
  const totalCompromisos = (compromisos ?? []).reduce((a, c) => a + (c.amount_cents ?? 0), 0);

  if (isLoading) return <Spinner label="Cargando gastos" />;
  if (error) return <ErrorNote>No se pudieron cargar los gastos: {String(error)}</ErrorNote>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-black dark:text-white">Gastos</h1>
        <div className="flex items-center gap-2">
          <Select value={mes} onChange={(e) => setMes(e.target.value)} className="!w-auto !p-2 text-xs">
            {[...meses].reverse().map((m) => (
              <option key={m} value={m}>{formatMonthLong(m)}</option>
            ))}
          </Select>
          <Button onClick={() => setCreando(true)}>+ Gasto</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <CasillaDato
          label={`Gastado en ${formatMonthLong(mes).toLowerCase()}`}
          value={formatCents(total)}
          hint={`${filas.length} gasto(s)`}
        />
        <CasillaDato
          label="Sin pagar"
          value={formatCents(sinPagar.reduce((a, g) => a + g.amount_cents, 0))}
          hint={sinPagar.length ? `${sinPagar.length} por pagar` : 'Todo al día'}
        />
        <CasillaDato
          label="Compromisos del mes"
          value={formatCents(totalCompromisos)}
          hint={`${(compromisos ?? []).length} vencimiento(s)`}
        />
      </div>

      {/* ------------------------------------------------ calendario ------ */}
      <Seccion title="Qué vence este mes">
        {(compromisos ?? []).length === 0 ? (
          <EmptyState
            title="Nada pendiente este mes"
            hint="Marca un gasto como recurrente (arriendo, seguro, mantenimiento) y aparecerá aquí cada periodo."
          />
        ) : (
          <div className="space-y-2">
            {(compromisos ?? []).map((c) => (
              <FilaCompromiso
                key={`${c.kind}-${c.ref_id}`}
                compromiso={c}
                pagando={pagar.isPending}
                onPagar={() => pagar.mutate({ expenseId: c.ref_id, paidOn: toISODate(new Date()) })}
              />
            ))}
          </div>
        )}
        {pendientes.length > 0 && (
          <p className="text-xs text-gray-500">
            Al marcar pagado un compromiso, el gasto del periodo queda registrado y el
            vencimiento avanza solo al siguiente.
          </p>
        )}
      </Seccion>

      {/* ------------------------------------------------ por categoría --- */}
      {porCategoria.length > 0 && (
        <Seccion title="En qué se fue la plata">
          <Card>
            <BarrasOrdenadas
              items={porCategoria.map((c) => ({
                label: c.label,
                value: Math.round(c.value / 100),
              }))}
              total={Math.round(total / 100)}
            />
            {/* La tabla gemela: el color y el largo de la barra nunca son la
                única forma de leer la cifra. */}
            <ul className="mt-3 space-y-1 border-t border-gray-200 pt-3 dark:border-gray-800">
              {porCategoria.map((c) => (
                <li key={c.label} className="flex justify-between gap-3 text-sm">
                  <span className="text-gray-500">{c.label}</span>
                  <span className="tabular-nums text-black dark:text-white">
                    {formatCents(c.value)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Seccion>
      )}

      {/* ------------------------------------------------ gastos ---------- */}
      <Seccion title={`Gastos de ${formatMonthLong(mes).toLowerCase()}`}>
        {filas.length === 0 ? (
          <EmptyState
            title="Ningún gasto registrado este mes"
            hint="Arriendo, servicios, coaches, mantenimiento, insumos. Las compras de insumo entran solas desde la página de insumos."
          />
        ) : (
          <div className="space-y-2">
            {filas.map((g) => (
              <Card key={g.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-black dark:text-white">{g.description}</p>
                  <p className="text-xs text-gray-500">
                    {g.incurred_on}
                    {g.expense_categories?.name ? ` · ${g.expense_categories.name}` : ''}
                    {g.suppliers?.name ? ` · ${g.suppliers.name}` : ''}
                    {!g.paid_on && <span className="ml-2 font-bold text-primary">Sin pagar</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display text-2xl text-black dark:text-white">
                    {formatCents(g.amount_cents)}
                  </span>
                  <ReceiptLink path={g.receipt_url} />
                  <button
                    onClick={() => setEditando(g)}
                    className="text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => borrar.mutate(g.id)}
                    disabled={borrar.isPending}
                    className="text-[11px] font-bold uppercase tracking-widest text-gray-600 hover:text-primary"
                  >
                    Borrar
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Seccion>

      {orgId && (creando || editando) && (
        <ExpenseForm
          key={editando?.id ?? 'nuevo'}
          orgId={orgId}
          gasto={editando}
          categorias={categorias ?? []}
          proveedores={proveedores ?? []}
          onClose={() => { setCreando(false); setEditando(null); }}
        />
      )}
    </div>
  );
}

function FilaCompromiso({
  compromiso, pagando, onPagar,
}: {
  compromiso: Commitment;
  pagando: boolean;
  onPagar: () => void;
}) {
  const hoy = toISODate(new Date());
  const vencido = compromiso.due_on < hoy;

  return (
    <Card className={`flex flex-wrap items-center justify-between gap-3 ${
      vencido ? 'border-l-4 border-l-primary' : ''
    }`}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-black dark:text-white">{compromiso.label}</p>
        <p className="text-xs text-gray-500">
          Vence {compromiso.due_on}
          {compromiso.category ? ` · ${compromiso.category}` : ''}
          {compromiso.supplier ? ` · ${compromiso.supplier}` : ''}
          {vencido && <span className="ml-2 font-bold text-primary">Vencido</span>}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-display text-2xl text-black dark:text-white">
          {compromiso.amount_cents === null ? '—' : formatCents(compromiso.amount_cents)}
        </span>
        {compromiso.kind === 'expense' ? (
          <Button variant="ghost" onClick={onPagar} disabled={pagando} className="!py-2 !text-sm">
            Marcar pagado
          </Button>
        ) : (
          <span className="text-[11px] uppercase tracking-widest text-gray-600">Reponer</span>
        )}
      </div>
    </Card>
  );
}
