import { useMemo, useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import { CasillaDato, Seccion } from '../../../features/finance/charts';
import { ReceiptLink } from '../../../features/finance/ReceiptLink';
import { PurchaseForm, SupplyForm } from '../../../features/finance/SupplyForms';
import { useDeletePurchase } from '../../../features/finance/mutations';
import {
  useLowStock, usePurchases, useSupplies, useSuppliers,
} from '../../../features/finance/queries';
import type { LowStockRow, SupplyWithSupplier } from '../../../features/finance/types';
import { mensajeAmigable } from '../../../shared/lib/errores';
import { fechaCorta } from '../../../shared/lib/fechas';
import { formatCents } from '../../../shared/lib/money';
import {
  Button, Card, ConfirmarBoton, EmptyState, ErrorNote, Spinner,
} from '../../../shared/ui';

/**
 * Insumos del box: magnesio, tiza, cauchos, cintas.
 *
 * Lo que está bajo mínimo va ARRIBA y destacado. El resto es consulta; eso es
 * lo que hay que comprar esta semana. De cada uno se ve lo que el dueño
 * pregunta de verdad: cuándo lo compré, a quién y a cuánto.
 */

function cantidad(valor: number, unidad: string): string {
  const n = Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace('.', ',');
  return `${n} ${unidad}`;
}

export default function SuppliesPage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;

  const { data: insumos, isLoading, error } = useSupplies(orgId);
  const {
    data: bajoMinimo,
    isLoading: cargandoAlertas,
    error: errorAlertas,
  } = useLowStock(orgId);
  const { data: proveedores } = useSuppliers(orgId);
  const {
    data: compras,
    isLoading: cargandoCompras,
    error: errorCompras,
  } = usePurchases(orgId);
  const borrarCompra = useDeletePurchase();

  const [comprando, setComprando] = useState<string | null>(null);
  const [creandoInsumo, setCreandoInsumo] = useState(false);
  const [editando, setEditando] = useState<SupplyWithSupplier | null>(null);

  const lista = useMemo(() => insumos ?? [], [insumos]);
  const alertas = bajoMinimo ?? [];
  const idsEnAlerta = new Set(alertas.map((a) => a.supply_id));
  // Si la lectura de alertas falló no se puede separar nada: se muestra todo
  // el inventario y el error arriba, en vez de fingir que todo tiene stock.
  const resto = errorAlertas ? lista : lista.filter((i) => !idsEnAlerta.has(i.id));

  const valorInventario = lista.reduce(
    (acc, i) => acc + (i.avg_unit_cost_cents ?? 0) * i.current_stock, 0,
  );
  const gastoCompras = (compras ?? []).reduce((acc, c) => acc + c.total_cents, 0);

  if (isLoading && !insumos) return <Spinner label="Cargando insumos" />;
  if (error && !insumos) {
    return <ErrorNote>No se pudieron cargar los insumos: {mensajeAmigable(error)}</ErrorNote>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-black dark:text-white">Insumos</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setCreandoInsumo(true)}>+ Insumo</Button>
          <Button onClick={() => setComprando('')} disabled={lista.length === 0}>
            Registrar compra
          </Button>
        </div>
      </div>

      {error && (
        <ErrorNote>No se pudieron actualizar los insumos: {mensajeAmigable(error)}</ErrorNote>
      )}
      {errorAlertas && (
        <ErrorNote>
          No se pudo leer qué está bajo mínimo: {mensajeAmigable(errorAlertas)}
        </ErrorNote>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <CasillaDato
          label="Bajo mínimo"
          value={errorAlertas ? '—' : cargandoAlertas ? '…' : String(alertas.length)}
          hint={
            errorAlertas
              ? 'No se pudo leer'
              : cargandoAlertas
                ? 'Cargando…'
                : alertas.length ? 'Hay que comprar' : 'Todo con stock'
          }
        />
        <CasillaDato
          label="Valor del inventario"
          value={formatCents(Math.round(valorInventario))}
          hint="Al costo promedio de compra"
        />
        <CasillaDato
          label="Comprado (últimas 100)"
          value={errorCompras ? '—' : formatCents(gastoCompras)}
          hint={
            errorCompras
              ? 'No se pudieron leer'
              : cargandoCompras
                ? 'Cargando…'
                : `${(compras ?? []).length} compra(s)`
          }
        />
      </div>

      {/* --------------------------------------------- bajo mínimo ------- */}
      {alertas.length > 0 && (
        <Seccion title="Hay que comprar">
          <div className="space-y-2">
            {alertas.map((a) => (
              <FilaAlerta key={a.supply_id} alerta={a} onComprar={() => setComprando(a.supply_id)} />
            ))}
          </div>
        </Seccion>
      )}

      {/* --------------------------------------------- inventario -------- */}
      <Seccion title="Inventario">
        {lista.length === 0 ? (
          <EmptyState
            title="Todavía no hay insumos"
            hint="Crea el magnesio, la tiza y los cauchos con su stock mínimo y el sistema te avisa cuándo reponer."
          />
        ) : resto.length === 0 ? (
          <p className="text-sm text-gray-500">Todos los insumos están bajo mínimo (arriba).</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {resto.map((i) => (
              <Card key={i.id} className="space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-black dark:text-white">{i.name}</p>
                    <p className="text-xs text-gray-500">
                      Mínimo {cantidad(i.min_stock, i.unit)}
                      {i.suppliers?.name ? ` · ${i.suppliers.name}` : ''}
                    </p>
                  </div>
                  <span className="font-display text-2xl text-black dark:text-white">
                    {cantidad(i.current_stock, i.unit)}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {i.last_purchased_on
                    ? `Última compra ${fechaCorta(i.last_purchased_on)}`
                    : 'Sin compras registradas'}
                  {i.avg_unit_cost_cents !== null
                    ? ` · ${formatCents(i.avg_unit_cost_cents)} por ${i.unit}`
                    : ''}
                </p>
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setComprando(i.id)}
                    aria-label={`Comprar ${i.name}`}
                    className="min-h-11 px-3 text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
                  >
                    Comprar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(i)}
                    aria-label={`Editar ${i.name}`}
                    className="min-h-11 px-3 text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
                  >
                    Editar
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Seccion>

      {/* --------------------------------------------- compras ----------- */}
      <Seccion title="Últimas compras">
        {errorCompras && (
          <ErrorNote>No se pudieron cargar las compras: {mensajeAmigable(errorCompras)}</ErrorNote>
        )}
        {borrarCompra.isError && (
          <ErrorNote>No se pudo borrar la compra: {mensajeAmigable(borrarCompra.error)}</ErrorNote>
        )}
        {cargandoCompras && !compras && <Spinner label="Cargando compras" />}
        {!cargandoCompras && !errorCompras && (compras ?? []).length === 0 && (
          <EmptyState
            title="Sin compras registradas"
            hint="Cada compra que registres suma el stock y queda como gasto en la categoría Insumos."
          />
        )}
        {(compras ?? []).length > 0 && (
          <div className="space-y-2">
            {(compras ?? []).slice(0, 20).map((c) => (
              <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-40 flex-1">
                  <p className="truncate font-bold text-black dark:text-white">
                    {c.supplies?.name ?? 'Insumo'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {fechaCorta(c.purchased_on)} · {cantidad(c.quantity, c.supplies?.unit ?? 'unidad')}
                    {c.suppliers?.name ? ` · ${c.suppliers.name}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="font-display text-2xl text-black dark:text-white">
                    {formatCents(c.total_cents)}
                  </span>
                  <ReceiptLink path={c.invoice_url} />
                  <ConfirmarBoton
                    onConfirm={() => borrarCompra.mutate(c.id)}
                    disabled={borrarCompra.isPending}
                    ariaLabel={`Borrar compra de ${c.supplies?.name ?? 'insumo'} del ${fechaCorta(c.purchased_on)}`}
                  >
                    Borrar
                  </ConfirmarBoton>
                </div>
              </Card>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500">
          Borrar una compra devuelve el stock y elimina su gasto: el reporte de ganancias y
          pérdidas no queda contando plata que nunca salió.
        </p>
      </Seccion>

      {orgId && comprando !== null && lista.length > 0 && (
        <PurchaseForm
          orgId={orgId}
          insumos={lista}
          insumoInicial={comprando || undefined}
          proveedores={proveedores ?? []}
          onClose={() => setComprando(null)}
        />
      )}

      {orgId && (creandoInsumo || editando) && (
        <SupplyForm
          key={editando?.id ?? 'nuevo'}
          orgId={orgId}
          insumo={editando}
          proveedores={proveedores ?? []}
          onClose={() => { setCreandoInsumo(false); setEditando(null); }}
        />
      )}
    </div>
  );
}

/** Insumo en o por debajo del mínimo: lo primero que se ve al entrar. */
function FilaAlerta({ alerta, onComprar }: { alerta: LowStockRow; onComprar: () => void }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-primary">
      <div className="min-w-40 flex-1">
        <p className="font-bold text-black dark:text-white">{alerta.name}</p>
        <p className="text-xs text-gray-500">
          Quedan {cantidad(alerta.current_stock, alerta.unit)} · mínimo{' '}
          {cantidad(alerta.min_stock, alerta.unit)}
        </p>
        {/* Exactamente lo que pregunta el dueño: cuándo lo compré y a cuánto. */}
        <p className="mt-1 text-xs text-gray-400">
          {alerta.last_purchased_on
            ? `Última compra: ${fechaCorta(alerta.last_purchased_on)}` +
              (alerta.last_supplier ? ` a ${alerta.last_supplier}` : '') +
              (alerta.last_total_cents !== null
                ? ` · ${formatCents(alerta.last_total_cents)}`
                : '') +
              (alerta.last_unit_cost_cents !== null
                ? ` (${formatCents(alerta.last_unit_cost_cents)} por ${alerta.unit})`
                : '')
            : 'Nunca se ha registrado una compra de este insumo'}
        </p>
        {alerta.suggested_reorder_on && (
          <p className="text-xs text-gray-500">
            Toca reponer sobre el {fechaCorta(alerta.suggested_reorder_on)}
          </p>
        )}
      </div>
      <Button onClick={onComprar} className="min-h-11 !py-2 !text-base">Comprar</Button>
    </Card>
  );
}
