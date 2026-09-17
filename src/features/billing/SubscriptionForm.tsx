import { useState } from 'react';
import { Button, Drawer, ErrorNote, Field, Select, TextInput } from '../../shared/ui';
import { formatCents, parsePesosToCents } from '../../shared/lib/money';
import { usePlans } from './queries-athlete';
import { useAssignSubscription } from './mutations';
import type { Subscription } from '../../types/database';

export function SubscriptionForm({
  open, onClose, orgId, athleteId, current,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  athleteId: string;
  current: Subscription | null;
}) {
  const { data: planes } = usePlans(orgId);
  const assign = useAssignSubscription();

  const [planId, setPlanId] = useState(current?.plan_id ?? '');
  const [precio, setPrecio] = useState(current ? String(current.price_cents / 100) : '');
  const [descuento, setDescuento] = useState(current ? String(current.discount_cents / 100) : '0');
  const [diaCorte, setDiaCorte] = useState(String(current?.billing_day ?? new Date().getDate()));
  const [error, setError] = useState('');

  function alElegirPlan(id: string) {
    setPlanId(id);
    // El precio se copia del plan pero queda editable: el precio de la
    // suscripción se congela, así que si el box sube el plan, este atleta
    // conserva el suyo.
    const plan = planes?.find((p) => p.id === id);
    if (plan) setPrecio(String(plan.price_cents / 100));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const cents = parsePesosToCents(precio);
    const desc = parsePesosToCents(descuento) ?? 0;
    const dia = Number(diaCorte);

    if (!planId) return setError('Elige un plan.');
    if (cents === null || cents < 0) return setError('El precio no es válido.');
    if (desc > cents) return setError('El descuento no puede superar el precio.');
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) return setError('La fecha de corte va del 1 al 31.');

    try {
      await assign.mutateAsync({
        orgId, athleteId, planId,
        priceCents: cents, discountCents: desc, billingDay: dia,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }

  const cents = parsePesosToCents(precio) ?? 0;
  const desc = parsePesosToCents(descuento) ?? 0;

  return (
    <Drawer
      open={open}
      title={current ? 'Cambiar plan' : 'Asignar plan'}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-suscripcion" disabled={assign.isPending} className="flex-1">
            {assign.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-suscripcion" onSubmit={onSubmit} className="space-y-4">
        <Field label="Plan">
          <Select value={planId} onChange={(e) => alElegirPlan(e.target.value)}>
            <option value="">— Elegir —</option>
            {planes?.filter((p) => p.is_active).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatCents(p.price_cents)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio" hint="Queda congelado para este atleta">
            <TextInput inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </Field>
          <Field label="Descuento">
            <TextInput inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value)} />
          </Field>
        </div>

        <Field
          label="Fecha de corte"
          hint="Día del mes en que se le genera el cobro. Si pones 31, en febrero se cobra el 28."
        >
          <TextInput
            inputMode="numeric"
            value={diaCorte}
            onChange={(e) => setDiaCorte(e.target.value.replace(/\D/g, '').slice(0, 2))}
          />
        </Field>

        <div className="grunge-border p-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Cobro mensual</p>
          <p className="font-display text-3xl text-black dark:text-white">
            {formatCents(Math.max(0, cents - desc))}
          </p>
        </div>

        {current && (
          <p className="text-xs text-gray-500">
            El plan anterior se cancela y se crea uno nuevo. El historial de cobros se conserva.
          </p>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
    </Drawer>
  );
}
