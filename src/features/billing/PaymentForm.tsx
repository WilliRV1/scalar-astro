import { useState } from 'react';
import { Button, Drawer, ErrorNote, Field, Select, TextInput } from '../../shared/ui';
import { mensajeAmigable } from '../../shared/lib/errores';
import { fechaCorta } from '../../shared/lib/fechas';
import { formatCents, parsePesosToCents } from '../../shared/lib/money';
import { useRecordPayment } from './mutations';
import type { Invoice, PaymentMethod } from '../../types/database';

const METODOS: { value: PaymentMethod; label: string }[] = [
  { value: 'nequi', label: 'Nequi' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'daviplata', label: 'Daviplata' },
  { value: 'card', label: 'Datáfono' },
  { value: 'pse', label: 'PSE' },
  { value: 'other', label: 'Otro' },
];

export function PaymentForm({
  open, onClose, orgId, athleteId, invoice,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  athleteId: string;
  invoice: Invoice | null;
}) {
  const saldo = invoice ? invoice.amount_cents - invoice.paid_cents : 0;
  const record = useRecordPayment();

  const [monto, setMonto] = useState(saldo > 0 ? String(saldo / 100) : '');
  const [metodo, setMetodo] = useState<PaymentMethod>('nequi');
  const [referencia, setReferencia] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const cents = parsePesosToCents(monto);
    if (cents === null || cents <= 0) {
      setError('El monto no es válido.');
      return;
    }
    // Se avisa, pero no se bloquea: un box a veces recibe un abono de más para
    // dejar saldo a favor, y el sistema no debería impedírselo.
    if (invoice && cents > saldo && !confirm(
      `El pago (${formatCents(cents)}) supera el saldo (${formatCents(saldo)}). ¿Registrarlo de todos modos?`,
    )) return;

    try {
      await record.mutateAsync({
        orgId,
        athleteId,
        invoiceId: invoice?.id ?? null,
        amountCents: cents,
        method: metodo,
        reference: referencia || undefined,
        receiptFile: archivo,
      });
      onClose();
    } catch (err) {
      setError(mensajeAmigable(err));
    }
  }

  return (
    <Drawer
      open={open}
      title="Registrar pago"
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-pago" disabled={record.isPending} className="flex-1">
            {record.isPending ? 'Registrando…' : 'Registrar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-pago" onSubmit={onSubmit} className="space-y-4">
        {invoice && (
          <div className="grunge-border p-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
              Factura {invoice.number}
            </p>
            <p className="font-display text-3xl text-black dark:text-white">{formatCents(saldo)}</p>
            <p className="text-xs text-gray-500">
              Periodo {fechaCorta(invoice.period_start)} a {fechaCorta(invoice.period_end)} · vence {fechaCorta(invoice.due_on)}
            </p>
          </div>
        )}

        <Field label="Monto recibido" hint="En pesos. Puede ser un abono parcial.">
          <TextInput
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="180.000"
            autoFocus
          />
        </Field>

        <Field label="Medio de pago">
          <Select value={metodo} onChange={(e) => setMetodo(e.target.value as PaymentMethod)}>
            {METODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </Field>

        <Field label="Referencia" hint="Número de transacción, opcional">
          <TextInput value={referencia} onChange={(e) => setReferencia(e.target.value)} />
        </Field>

        <Field
          label="Comprobante"
          hint="Foto de la transferencia. Queda guardada y deja de perderse en el WhatsApp."
        >
          {/* Sin `capture`: con él, iOS abre la cámara directo y no deja
              adjuntar el pantallazo de Nequi que ya está en la galería. */}
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-500 file:mr-3 file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sobre-primario"
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <p className="text-xs text-gray-500">
          Al registrar el pago, el saldo de la factura se recalcula solo y el atleta deja de
          aparecer en la lista de cobro.
        </p>
      </form>
    </Drawer>
  );
}
