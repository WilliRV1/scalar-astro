import { useState } from 'react';
import {
  Button, Checkbox, Drawer, ErrorNote, Field, Select, TextInput,
} from '../../shared/ui';
import { formatCents, parsePesosToCents } from '../../shared/lib/money';
import { RECURRENCIAS } from './catalogos';
import { useSaveExpense } from './mutations';
import { toISODate } from './pnl';
import type { ExpenseCategory, ExpenseRow, Recurrence, Supplier } from './types';

/** Alta y edición de un gasto. El mismo formulario sirve para un compromiso. */
export function ExpenseForm({
  orgId, gasto, categorias, proveedores, onClose,
}: {
  orgId: string;
  gasto: ExpenseRow | null;
  categorias: ExpenseCategory[];
  proveedores: Supplier[];
  onClose: () => void;
}) {
  const save = useSaveExpense();
  const hoy = toISODate(new Date());

  const [descripcion, setDescripcion] = useState(gasto?.description ?? '');
  const [monto, setMonto] = useState(gasto ? String(gasto.amount_cents / 100) : '');
  const [categoria, setCategoria] = useState(gasto?.category_id ?? '');
  const [proveedor, setProveedor] = useState(gasto?.supplier_id ?? '');
  const [fecha, setFecha] = useState(gasto?.incurred_on ?? hoy);
  const [pagado, setPagado] = useState(Boolean(gasto?.paid_on));
  const [recurrente, setRecurrente] = useState(gasto?.is_recurring ?? false);
  const [recurrencia, setRecurrencia] = useState<Recurrence>(gasto?.recurrence ?? 'monthly');
  const [vence, setVence] = useState(gasto?.next_due_on ?? hoy);
  const [factura, setFactura] = useState<File | null>(null);
  const [error, setError] = useState('');

  const centavos = parsePesosToCents(monto);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!descripcion.trim()) return setError('Escribe qué se pagó.');
    if (centavos === null || centavos < 0) return setError('El monto no es válido.');

    try {
      await save.mutateAsync({
        orgId,
        expenseId: gasto?.id,
        categoryId: categoria || null,
        supplierId: proveedor || null,
        description: descripcion.trim(),
        amountCents: centavos,
        incurredOn: fecha,
        paidOn: pagado ? fecha : null,
        isRecurring: recurrente,
        recurrence: recurrente ? recurrencia : null,
        nextDueOn: recurrente ? vence : null,
        receiptFile: factura,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el gasto');
    }
  }

  return (
    <Drawer
      open
      title={gasto ? 'Editar gasto' : 'Nuevo gasto'}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-gasto" disabled={save.isPending} className="flex-1">
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-gasto" onSubmit={onSubmit} className="space-y-4">
        <Field label="Concepto" hint="Arriendo de octubre, recibo de energía, coach del sábado…">
          <TextInput value={descripcion} onChange={(e) => setDescripcion(e.target.value)} autoFocus />
        </Field>

        <Field
          label="Monto"
          hint={centavos !== null && monto !== '' ? formatCents(centavos) : 'En pesos: 1.200.000'}
        >
          <TextInput inputMode="decimal" placeholder="1.200.000" value={monto}
            onChange={(e) => setMonto(e.target.value)} />
        </Field>

        <Field label="Categoría">
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>

        <Field label="Proveedor">
          <Select value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>

        <Field label="Fecha del gasto">
          <TextInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>

        <Checkbox label="Ya está pagado" checked={pagado} onChange={setPagado} />

        <Checkbox
          label="Es un gasto recurrente"
          hint="Arriendo, seguro, mantenimiento. Aparecerá en el calendario de compromisos."
          checked={recurrente}
          onChange={setRecurrente}
        />

        {recurrente && (
          <div className="space-y-4 border-l-2 border-primary/40 pl-4">
            <Field label="Cada cuánto">
              <Select value={recurrencia}
                onChange={(e) => setRecurrencia(e.target.value as Recurrence)}>
                {RECURRENCIAS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </Field>
            <Field label="Próximo vencimiento" hint="Cada vez que lo marques pagado, avanza solo.">
              <TextInput type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
            </Field>
          </div>
        )}

        <Field label="Foto de la factura" hint="JPG, PNG o PDF, hasta 5 MB.">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFactura(e.target.files?.[0] ?? null)}
            className="w-full text-xs text-gray-400 file:mr-3 file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:text-white"
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
    </Drawer>
  );
}
