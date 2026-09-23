import { useState } from 'react';
import { Button, Card, Drawer, ErrorNote, Field, Select, Spinner, TextInput } from '../../shared/ui';
import { formatCents, parsePesosToCents } from '../../shared/lib/money';
import { usePlans } from '../billing/queries-athlete';
import { useSavePlan } from '../billing/mutations';
import type { Plan } from '../../types/database';
import { mensaje } from './errores';
import { useDesactivarPlan } from './mutations';
import { Nota } from './piezas';

/**
 * Los planes del box, dentro del asistente.
 *
 * Al dar de alta el box ya se le sembraron tres planes con precios parecidos a
 * los de Cali. No están ahí para que se queden: están para que el dueño tenga
 * algo que corregir en vez de una pantalla en blanco, que es donde la puesta en
 * marcha se atasca y nos llama.
 */

const PERIODOS = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
  { value: 'one_off', label: 'Pago único (bono)' },
];

export function SeccionPlanes({ orgId }: { orgId: string }) {
  const { data: planes, isLoading, error } = usePlans(orgId);
  const [editando, setEditando] = useState<Plan | null>(null);
  const [creando, setCreando] = useState(false);

  if (isLoading) return <Spinner label="Cargando tus planes" />;
  if (error) return <ErrorNote>No se pudieron cargar los planes: {mensaje(error)}</ErrorNote>;

  const activos = (planes ?? []).filter((p) => p.is_active);

  return (
    <div className="space-y-3">
      <Nota>
        Te dejamos tres para empezar, con precios parecidos a los de un box en Cali. Cámbialos por
        los tuyos: el precio se congela cuando se lo asignas a un atleta, así que subirlo después no
        le sube la cuota a quien ya lo tenía.
      </Nota>

      {activos.length === 0 && (
        <ErrorNote>
          No te queda ningún plan activo. Crea al menos la mensualidad o no vas a poder cobrarle a
          nadie.
        </ErrorNote>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {activos.map((p) => (
          <Card key={p.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-black dark:text-white">{p.name}</p>
              <p className="text-xs uppercase tracking-widest text-gray-500">
                {PERIODOS.find((x) => x.value === p.billing_period)?.label}
                {p.class_quota ? ` · ${p.class_quota} clases` : ' · ilimitado'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="font-display text-xl text-black dark:text-white">
                {formatCents(p.price_cents)}
              </span>
              <button
                type="button"
                onClick={() => setEditando(p)}
                className="text-xs font-bold uppercase text-gray-500 hover:text-primary"
              >
                Editar
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Button variant="ghost" onClick={() => setCreando(true)}>+ Otro plan</Button>

      {(creando || editando) && (
        <FormularioPlan
          key={editando?.id ?? 'nuevo'}
          orgId={orgId}
          plan={editando}
          onCerrar={() => { setCreando(false); setEditando(null); }}
        />
      )}
    </div>
  );
}

function FormularioPlan({
  orgId, plan, onCerrar,
}: {
  orgId: string;
  plan: Plan | null;
  onCerrar: () => void;
}) {
  const guardar = useSavePlan();
  const desactivar = useDesactivarPlan();
  const [nombre, setNombre] = useState(plan?.name ?? '');
  const [precio, setPrecio] = useState(plan ? String(plan.price_cents / 100) : '');
  const [periodo, setPeriodo] = useState(plan?.billing_period ?? 'monthly');
  const [cupo, setCupo] = useState(plan?.class_quota ? String(plan.class_quota) : '');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!nombre.trim()) { setError('Ponle un nombre al plan.'); return; }
    const centavos = parsePesosToCents(precio);
    if (centavos === null || centavos < 0) {
      setError(`No se entiende el precio "${precio}". Escríbelo así: 180.000`);
      return;
    }

    try {
      await guardar.mutateAsync({
        orgId,
        planId: plan?.id,
        name: nombre.trim(),
        priceCents: centavos,
        billingPeriod: periodo,
        classQuota: cupo ? Number(cupo) : null,
      });
      onCerrar();
    } catch (err) {
      setError(mensaje(err));
    }
  }

  async function onQuitar() {
    if (!plan) return;
    setError('');
    try {
      await desactivar.mutateAsync({ orgId, planId: plan.id });
      onCerrar();
    } catch (err) {
      setError(mensaje(err));
    }
  }

  return (
    <Drawer
      open
      title={plan ? 'Editar plan' : 'Nuevo plan'}
      onClose={onCerrar}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-plan-setup" disabled={guardar.isPending} className="flex-1">
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-plan-setup" onSubmit={onSubmit} className="space-y-4">
        <Field label="Nombre" hint="Mensualidad, Bono 8 clases, Estudiante…">
          <TextInput value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </Field>
        <Field label="Precio" hint="En pesos. 180.000 se escribe 180.000 o 180000.">
          <TextInput
            inputMode="decimal"
            placeholder="180.000"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </Field>
        <Field label="Cada cuánto se paga">
          <Select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as Plan['billing_period'])}
          >
            {PERIODOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label="Cupo de clases" hint="Vacío = puede venir todos los días.">
          <TextInput
            inputMode="numeric"
            value={cupo}
            onChange={(e) => setCupo(e.target.value.replace(/\D/g, ''))}
          />
        </Field>

        {plan && (
          <div className="grunge-border p-3">
            <p className="text-xs leading-relaxed text-gray-500">
              Quitarlo lo saca de la lista para los atletas nuevos. Los que ya lo tienen siguen
              igual, y tu historial de cobros no se toca.
            </p>
            <button
              type="button"
              onClick={onQuitar}
              disabled={desactivar.isPending}
              className="mt-2 text-xs font-bold uppercase tracking-widest text-primary hover:underline disabled:opacity-40"
            >
              {desactivar.isPending ? 'Quitando…' : 'Quitar este plan'}
            </button>
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
    </Drawer>
  );
}
