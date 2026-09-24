import { useState } from 'react';
import {
  Button, Checkbox, Drawer, ErrorNote, Field, Select, TextInput,
} from '../../shared/ui';
import { mensajeAmigable } from '../../shared/lib/errores';
import { formatCents, parsePesosToCents } from '../../shared/lib/money';
import { RECURRENCIAS, TIPOS_DE_GASTO } from './catalogos';
import { useSaveCategory, useSaveExpense, useSaveSupplier } from './mutations';
import { SelectorConAlta } from './SelectorConAlta';
import { toISODate } from './pnl';
import type { ExpenseCategory, ExpenseKind, ExpenseRow, Recurrence, Supplier } from './types';

/** Tope de la factura, el mismo del bucket: así el error sale antes de subir nada. */
const TAMANO_MAXIMO = 5 * 1024 * 1024;

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
  const crearCategoria = useSaveCategory();
  const crearProveedor = useSaveSupplier();
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
  const [tipoNuevo, setTipoNuevo] = useState<ExpenseKind>('operational');
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
      setError(mensajeAmigable(err));
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

        <SelectorConAlta
          label="Categoría"
          value={categoria}
          options={categorias}
          vacio="Sin categoría"
          textoNuevo="+ Nueva categoría…"
          creando={crearCategoria.isPending}
          error={crearCategoria.error}
          onChange={setCategoria}
          onCreate={async (nombre) => {
            const { id } = await crearCategoria.mutateAsync({ orgId, name: nombre, kind: tipoNuevo });
            return id;
          }}
        >
          <Field label="Tipo de gasto">
            <Select value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value as ExpenseKind)}>
              {TIPOS_DE_GASTO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
        </SelectorConAlta>

        <SelectorConAlta
          label="Proveedor"
          value={proveedor}
          options={proveedores}
          vacio="Sin proveedor"
          textoNuevo="+ Nuevo proveedor…"
          creando={crearProveedor.isPending}
          error={crearProveedor.error}
          onChange={setProveedor}
          onCreate={async (nombre) => {
            const { id } = await crearProveedor.mutateAsync({ orgId, name: nombre });
            return id;
          }}
        />

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
            onChange={(e) => {
              const archivo = e.target.files?.[0] ?? null;
              if (archivo && archivo.size > TAMANO_MAXIMO) {
                setFactura(null);
                e.target.value = '';
                setError('La foto de la factura pesa más de 5 MB. Toma una más liviana o recórtala.');
                return;
              }
              setError('');
              setFactura(archivo);
            }}
            className="w-full text-xs text-gray-400 file:mr-3 file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:text-white"
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
    </Drawer>
  );
}
