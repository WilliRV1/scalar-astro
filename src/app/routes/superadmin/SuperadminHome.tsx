import { useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import { formatCents } from '../../../shared/lib/money';
import { Button, Card, EmptyState, ErrorNote, Spinner, Stat } from '../../../shared/ui';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_PLAN,
  NuevoBoxDrawer,
  SoporteDrawer,
  SuspenderDrawer,
  colorDeEstado,
  dominioDelBox,
  useBoxesDePlataforma,
  useEsSuperadmin,
  useMetricasDePlataforma,
  type BoxDePlataforma,
} from '../../../features/superadmin';

const FECHA = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

function fecha(iso: string | null): string {
  return iso ? FECHA.format(new Date(iso)) : '—';
}

/**
 * Panel de plataforma.
 *
 * Pantalla de operación, no de venta: acá se mira cuántos boxes hay, quién está
 * en mora, cuánto entra al mes y se entra a dar soporte. Prioriza la
 * información sobre la belleza — es la pantalla que se abre un domingo por la
 * noche cuando alguien escribe "no me deja entrar".
 *
 * Doble llave, como en el resto del producto: este guarda decide qué se pinta,
 * pero aunque fallara, las funciones de plataforma comprueban el permiso en su
 * cuerpo y la RLS de los boxes sigue cerrada para todo el mundo.
 */
export default function SuperadminHome() {
  const { session } = useAuth();
  const esSuperadmin = useEsSuperadmin(session?.user.id);
  const habilitado = esSuperadmin.data === true;

  const metricas = useMetricasDePlataforma(habilitado);
  const boxes = useBoxesDePlataforma(habilitado);

  const [creando, setCreando] = useState(false);
  const [soporteDe, setSoporteDe] = useState<BoxDePlataforma | null>(null);
  const [cobroDe, setCobroDe] = useState<BoxDePlataforma | null>(null);

  if (esSuperadmin.isLoading) return <Spinner label="Comprobando acceso" />;

  if (!habilitado) {
    return (
      <EmptyState
        title="Esta pantalla no es para ti"
        hint="El panel de plataforma es de Scalar. Si crees que deberías tener acceso, escríbele al equipo."
      />
    );
  }

  const lista = boxes.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-black dark:text-white">Plataforma</h1>
          <p className="text-xs text-gray-500">Todos los boxes, su estado y su plan.</p>
        </div>
        <Button onClick={() => setCreando(true)}>+ Dar de alta un box</Button>
      </div>

      {/* --------------------------------------------------------- métricas */}
      {metricas.error && (
        <ErrorNote>
          No se pudieron cargar las métricas:{' '}
          {metricas.error instanceof Error ? metricas.error.message : String(metricas.error)}
        </ErrorNote>
      )}
      {metricas.isLoading && <Spinner label="Contando" />}
      {metricas.data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Ingreso recurrente"
            value={formatCents(metricas.data.mrr_cents)}
            hint="Al mes, sin implementaciones. Meta año 1: 2.000.000"
          />
          <Stat
            label="Boxes activos"
            value={String(metricas.data.boxes_activos)}
            hint={`${metricas.data.boxes_totales} en total · ${metricas.data.boxes_en_prueba} en prueba`}
          />
          <Stat
            label="Atletas en la plataforma"
            value={String(metricas.data.atletas_totales)}
            hint="Sumando todos los boxes"
          />
          <Stat
            label="Mensajes enviados"
            value={String(metricas.data.mensajes_enviados)}
            hint="WhatsApp y correo"
          />
        </div>
      )}

      {metricas.data && (metricas.data.boxes_en_mora > 0 || metricas.data.boxes_suspendidos > 0) && (
        <p className="border-l-4 border-primary bg-primary/10 px-4 py-3 text-sm font-bold text-primary">
          {metricas.data.boxes_en_mora} en mora · {metricas.data.boxes_suspendidos} suspendidos.
          Dos cancelaciones seguidas no son un problema de precio: son de producto.
        </p>
      )}

      {/* ------------------------------------------------------------ boxes */}
      <section className="space-y-2">
        <h2 className="font-display text-2xl text-black dark:text-white">Boxes</h2>

        {boxes.error && (
          <ErrorNote>
            No se pudo cargar la lista:{' '}
            {boxes.error instanceof Error ? boxes.error.message : String(boxes.error)}
          </ErrorNote>
        )}
        {boxes.isLoading && <Spinner label="Cargando boxes" />}

        {!boxes.isLoading && lista.length === 0 && (
          <EmptyState
            title="Todavía no hay ningún box"
            hint="El primero es el de tu entrenador: gratis o a precio de fundador, y a cambio te presenta a otros dueños."
          />
        )}

        <div className="space-y-2">
          {lista.map((b) => (
            <Card key={b.org_id} className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-[14rem] flex-1">
                <p className="font-display text-2xl leading-tight text-black dark:text-white">
                  {b.name}
                </p>
                <p className="font-mono text-xs text-gray-500">{dominioDelBox(b.slug)}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {b.owner_email ?? 'sin dueño asignado'}
                  {b.city ? ` · ${b.city}` : ''}
                </p>
              </div>

              <dl className="grid min-w-[13rem] flex-1 grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-gray-500">Estado</dt>
                <dd className={`font-bold ${colorDeEstado(b.org_status)}`}>
                  {ETIQUETA_ESTADO[b.org_status]}
                </dd>

                <dt className="text-gray-500">Plan</dt>
                <dd className="text-gray-300">
                  {ETIQUETA_PLAN[b.plan_tier]}
                  {b.is_founder && <span className="text-primary"> · fundador</span>}
                </dd>

                <dt className="text-gray-500">Nos paga</dt>
                <dd className="text-gray-300">{formatCents(b.price_cents)}/mes</dd>

                <dt className="text-gray-500">Próximo cobro</dt>
                <dd className="text-gray-300">{fecha(b.next_charge_on)}</dd>

                <dt className="text-gray-500">Atletas</dt>
                <dd className="text-gray-300">{b.atletas_activos}</dd>
              </dl>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSoporteDe(b)}
                  className="grunge-border px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-300 transition hover:border-primary hover:text-primary"
                >
                  Soporte
                </button>
                <button
                  type="button"
                  onClick={() => setCobroDe(b)}
                  className="grunge-border px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-300 transition hover:border-primary hover:text-primary"
                >
                  {b.org_status === 'suspended' ? 'Reactivar' : 'Suspender'}
                </button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <p className="text-xs text-gray-600">
        Entrar a un box deja tu nombre y tu motivo en su bitácora, y el dueño lo puede leer. Así
        tiene que ser: es lo que nos deja dar soporte sin pedirle la contraseña a nadie. El runbook
        está en <span className="text-gray-500">docs/11-operacion.md</span>.
      </p>

      <NuevoBoxDrawer open={creando} onClose={() => setCreando(false)} />
      <SoporteDrawer box={soporteDe} open={soporteDe != null} onClose={() => setSoporteDe(null)} />
      <SuspenderDrawer box={cobroDe} open={cobroDe != null} onClose={() => setCobroDe(null)} />
    </div>
  );
}
