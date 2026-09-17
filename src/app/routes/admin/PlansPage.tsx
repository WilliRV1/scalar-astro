import { useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import { usePlans } from '../../../features/billing/queries-athlete';
import { useSavePlan } from '../../../features/billing/mutations';
import { formatCents, parsePesosToCents } from '../../../shared/lib/money';
import {
  Button, Card, Drawer, EmptyState, ErrorNote, Field, Select, Spinner, TextInput,
} from '../../../shared/ui';
import type { Plan } from '../../../types/database';

const PERIODOS = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
  { value: 'one_off', label: 'Pago único (bono)' },
];

export default function PlansPage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const { data: planes, isLoading } = usePlans(orgId);
  const [editando, setEditando] = useState<Plan | null>(null);
  const [creando, setCreando] = useState(false);

  if (isLoading) return <Spinner label="Cargando planes" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-black dark:text-white">Planes</h1>
        <Button onClick={() => setCreando(true)}>+ Plan</Button>
      </div>

      <p className="text-sm text-gray-500">
        Los planes definen cuánto y cada cuánto se le cobra a un atleta. El precio se congela
        al asignarlo: si subes el plan, los atletas que ya lo tenían conservan el suyo.
      </p>

      {planes?.length === 0 && (
        <EmptyState
          title="Todavía no hay planes"
          hint="Crea al menos la mensualidad para poder generar cobros."
        />
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {planes?.map((p) => (
          <Card key={p.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-black dark:text-white">{p.name}</p>
              <p className="text-xs uppercase tracking-widest text-gray-500">
                {PERIODOS.find((x) => x.value === p.billing_period)?.label}
                {p.class_quota ? ` · ${p.class_quota} clases` : ' · ilimitado'}
                {!p.is_active && ' · inactivo'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl text-black dark:text-white">
                {formatCents(p.price_cents)}
              </span>
              <button
                onClick={() => setEditando(p)}
                className="text-xs font-bold uppercase text-gray-500 hover:text-primary"
              >
                Editar
              </button>
            </div>
          </Card>
        ))}
      </div>

      {orgId && (creando || editando) && (
        <PlanForm
          key={editando?.id ?? 'nuevo'}
          orgId={orgId}
          plan={editando}
          onClose={() => { setCreando(false); setEditando(null); }}
        />
      )}
    </div>
  );
}

function PlanForm({ orgId, plan, onClose }: { orgId: string; plan: Plan | null; onClose: () => void }) {
  const save = useSavePlan();
  const [nombre, setNombre] = useState(plan?.name ?? '');
  const [precio, setPrecio] = useState(plan ? String(plan.price_cents / 100) : '');
  const [periodo, setPeriodo] = useState(plan?.billing_period ?? 'monthly');
  const [cupo, setCupo] = useState(plan?.class_quota ? String(plan.class_quota) : '');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const cents = parsePesosToCents(precio);
    if (!nombre.trim()) return setError('Ponle un nombre al plan.');
    if (cents === null || cents < 0) return setError('El precio no es válido.');

    try {
      await save.mutateAsync({
        orgId,
        planId: plan?.id,
        name: nombre.trim(),
        priceCents: cents,
        billingPeriod: periodo,
        classQuota: cupo ? Number(cupo) : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }

  return (
    <Drawer
      open
      title={plan ? 'Editar plan' : 'Nuevo plan'}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-plan" disabled={save.isPending} className="flex-1">
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-plan" onSubmit={onSubmit} className="space-y-4">
        <Field label="Nombre" hint="Mensualidad ilimitada, Bono 8 clases, Estudiante…">
          <TextInput value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </Field>
        <Field label="Precio">
          <TextInput inputMode="decimal" placeholder="180.000" value={precio}
            onChange={(e) => setPrecio(e.target.value)} />
        </Field>
        <Field label="Periodicidad">
          <Select value={periodo} onChange={(e) => setPeriodo(e.target.value as Plan['billing_period'])}>
            {PERIODOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label="Cupo de clases" hint="Vacío = ilimitado">
          <TextInput inputMode="numeric" value={cupo}
            onChange={(e) => setCupo(e.target.value.replace(/\D/g, ''))} />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
    </Drawer>
  );
}
