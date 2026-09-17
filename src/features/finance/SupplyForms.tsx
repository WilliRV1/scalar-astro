import { useState } from 'react';
import {
  Button, Drawer, ErrorNote, Field, Select, TextInput,
} from '../../shared/ui';
import { formatCents, parsePesosToCents } from '../../shared/lib/money';
import { useRegisterPurchase, useSaveSupply } from './mutations';
import { toISODate } from './pnl';
import type { Supplier, SupplyWithSupplier } from './types';

const UNIDADES = ['unidad', 'kg', 'libra', 'caja', 'bolsa', 'par', 'rollo', 'litro'];

/** Lee una cantidad con coma o punto decimal: "2,5" y "2.5" son lo mismo. */
function parseCantidad(input: string): number | null {
  const limpio = input.replace(/\s/g, '').replace(',', '.');
  if (limpio === '') return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------

export function SupplyForm({
  orgId, insumo, proveedores, onClose,
}: {
  orgId: string;
  insumo: SupplyWithSupplier | null;
  proveedores: Supplier[];
  onClose: () => void;
}) {
  const save = useSaveSupply();
  const [nombre, setNombre] = useState(insumo?.name ?? '');
  const [unidad, setUnidad] = useState(insumo?.unit ?? 'unidad');
  const [stock, setStock] = useState(insumo ? String(insumo.current_stock) : '0');
  const [minimo, setMinimo] = useState(insumo ? String(insumo.min_stock) : '0');
  const [proveedor, setProveedor] = useState(insumo?.default_supplier_id ?? '');
  const [cadaDias, setCadaDias] = useState(
    insumo?.reorder_every_days ? String(insumo.reorder_every_days) : '',
  );
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) return setError('Ponle nombre al insumo.');
    const actual = Number(stock.replace(',', '.'));
    const min = Number(minimo.replace(',', '.'));
    if (!Number.isFinite(actual) || !Number.isFinite(min) || min < 0) {
      return setError('El stock y el mínimo tienen que ser números.');
    }

    try {
      await save.mutateAsync({
        orgId,
        supplyId: insumo?.id,
        name: nombre.trim(),
        unit: unidad,
        currentStock: actual,
        minStock: min,
        defaultSupplierId: proveedor || null,
        reorderEveryDays: cadaDias ? Number(cadaDias) : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el insumo');
    }
  }

  return (
    <Drawer
      open
      title={insumo ? 'Editar insumo' : 'Nuevo insumo'}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-insumo" disabled={save.isPending} className="flex-1">
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-insumo" onSubmit={onSubmit} className="space-y-4">
        <Field label="Insumo" hint="Magnesio, tiza, cauchos, cintas, agarraderas…">
          <TextInput value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </Field>
        <Field label="Unidad">
          <Select value={unidad} onChange={(e) => setUnidad(e.target.value)}>
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stock actual">
            <TextInput inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} />
          </Field>
          <Field label="Mínimo" hint="Por debajo, alerta">
            <TextInput inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
          </Field>
        </div>
        <Field label="Proveedor habitual">
          <Select value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            <option value="">Sin proveedor fijo</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Se repone cada (días)" hint="Vacío si no tiene una frecuencia clara.">
          <TextInput inputMode="numeric" value={cadaDias}
            onChange={(e) => setCadaDias(e.target.value.replace(/\D/g, ''))} />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------

/**
 * Registrar una compra.
 *
 * Solo pide lo que el dueño tiene en la mano: qué, cuánto, a quién y la foto de
 * la factura. El gasto y el movimiento de stock los hace la base.
 */
export function PurchaseForm({
  orgId, insumos, insumoInicial, proveedores, onClose,
}: {
  orgId: string;
  insumos: SupplyWithSupplier[];
  insumoInicial?: string;
  proveedores: Supplier[];
  onClose: () => void;
}) {
  const registrar = useRegisterPurchase();
  const [insumoId, setInsumoId] = useState(insumoInicial ?? insumos[0]?.id ?? '');
  const insumo = insumos.find((i) => i.id === insumoId) ?? null;

  const [proveedor, setProveedor] = useState(insumo?.default_supplier_id ?? '');
  const [fecha, setFecha] = useState(toISODate(new Date()));
  const [cantidad, setCantidad] = useState('');
  const [total, setTotal] = useState('');
  const [factura, setFactura] = useState<File | null>(null);
  const [error, setError] = useState('');

  const cant = parseCantidad(cantidad);
  const centavos = parsePesosToCents(total);
  const unitario = cant && centavos !== null && cant > 0 ? Math.round(centavos / cant) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!insumoId) return setError('Escoge el insumo.');
    if (cant === null) return setError('La cantidad tiene que ser mayor que cero.');
    if (centavos === null || centavos < 0) return setError('El total no es válido.');

    try {
      await registrar.mutateAsync({
        orgId,
        supplyId: insumoId,
        supplierId: proveedor || null,
        purchasedOn: fecha,
        quantity: cant,
        totalCents: centavos,
        invoiceFile: factura,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la compra');
    }
  }

  return (
    <Drawer
      open
      title="Registrar compra"
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-compra" disabled={registrar.isPending} className="flex-1">
            {registrar.isPending ? 'Guardando…' : 'Registrar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-compra" onSubmit={onSubmit} className="space-y-4">
        <Field label="Insumo">
          <Select
            value={insumoId}
            onChange={(e) => {
              setInsumoId(e.target.value);
              const nuevo = insumos.find((i) => i.id === e.target.value);
              setProveedor(nuevo?.default_supplier_id ?? '');
            }}
          >
            {insumos.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Cantidad (${insumo?.unit ?? 'unidad'})`}>
            <TextInput inputMode="decimal" placeholder="10" value={cantidad}
              onChange={(e) => setCantidad(e.target.value)} autoFocus />
          </Field>
          <Field label="Total pagado" hint={unitario !== null ? `${formatCents(unitario)} c/u` : undefined}>
            <TextInput inputMode="decimal" placeholder="150.000" value={total}
              onChange={(e) => setTotal(e.target.value)} />
          </Field>
        </div>

        <Field label="Proveedor">
          <Select value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>

        <Field label="Fecha de la compra">
          <TextInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>

        <Field label="Foto de la factura" hint="Queda guardada con la compra y con el gasto.">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFactura(e.target.files?.[0] ?? null)}
            className="w-full text-xs text-gray-400 file:mr-3 file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:text-white"
          />
        </Field>

        <p className="text-xs text-gray-500">
          Al registrarla, el sistema suma el stock y crea el gasto en la categoría Insumos.
          Si la borras, deshace las dos cosas.
        </p>

        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
    </Drawer>
  );
}
