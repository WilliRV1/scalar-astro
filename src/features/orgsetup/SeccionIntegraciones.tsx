import { useState } from 'react';
import { Button, Card, Drawer, ErrorNote, Field, Select, Spinner, TextInput } from '../../shared/ui';
import { fechaCorta } from '../team/permissions';
import { mensaje } from './errores';
import { useCredenciales } from './queries';
import { useBorrarCredencial, useGuardarCredencial } from './mutations';
import { Nota } from './piezas';
import { AYUDA_PASARELA, CREDENCIALES, NOTA_SECRETOS } from './textos';
import type { Ambiente, ClaveCredencial, Credencial, Pasarela } from './types';

/**
 * Las llaves de cobro y de mensajería DE ESTE BOX.
 *
 * Hasta esta pantalla, las llaves de Wompi salían del entorno de la Edge
 * Function: una sola cuenta para todos los boxes, es decir, la plata de todos
 * los clientes entrando a la misma parte. Aquí cada box mete las suyas.
 *
 * Lo que esta pantalla NO puede hacer, y no puede hacerlo ni equivocándose: leer
 * un secreto. La tabla donde viven no tiene ningún privilegio para el rol del
 * navegador, así que lo único que llega hasta acá es la ficha de estado: si
 * está puesta, en qué termina y desde cuándo. Por eso un campo de secreto
 * siempre se pinta vacío: no es que no lo carguemos, es que no existe forma de
 * cargarlo.
 */

const CLAVES: Record<Pasarela, ClaveCredencial[]> = {
  mercadopago: ['mercadopago_access_token', 'mercadopago_webhook_secret'],
  wompi: [
    'wompi_public_key',
    'wompi_private_key',
    'wompi_integrity_secret',
    'wompi_events_secret',
  ],
  whatsapp_cloud: ['whatsapp_phone_number_id', 'whatsapp_token'],
};

const NOMBRE_PASARELA: Record<Pasarela, string> = {
  mercadopago: 'Mercado Pago · pagos en línea',
  wompi: 'Wompi · pagos en línea (alternativa)',
  whatsapp_cloud: 'WhatsApp · envío automático',
};

/** La URL que el dueño pega en el panel de Mercado Pago (Webhooks). */
function urlDelWebhook(orgId: string): string {
  return `${window.location.origin}/functions/v1/mercadopago-webhook/box/${orgId}`;
}

export function SeccionIntegraciones({ orgId }: { orgId: string }) {
  const { data, isLoading, error } = useCredenciales(orgId);
  const [editando, setEditando] = useState<ClaveCredencial | null>(null);

  if (isLoading) return <Spinner label="Cargando integraciones" />;
  if (error) return <ErrorNote>No se pudieron cargar las integraciones: {mensaje(error)}</ErrorNote>;

  const puestas = data ?? [];
  const porClave = new Map(puestas.map((c) => [c.key, c]));

  return (
    <div className="space-y-5">
      <Nota>{NOTA_SECRETOS}</Nota>

      {(Object.keys(CLAVES) as Pasarela[]).map((pasarela) => (
        <BloquePasarela
          key={pasarela}
          pasarela={pasarela}
          credenciales={CLAVES[pasarela].map((k) => porClave.get(k) ?? null)}
          claves={CLAVES[pasarela]}
          onEditar={setEditando}
          webhook={pasarela === 'mercadopago' ? urlDelWebhook(orgId) : undefined}
        />
      ))}

      {editando && (
        <FormularioCredencial
          key={editando}
          orgId={orgId}
          clave={editando}
          actual={porClave.get(editando) ?? null}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function BloquePasarela({
  pasarela, claves, credenciales, onEditar, webhook,
}: {
  pasarela: Pasarela;
  claves: ClaveCredencial[];
  credenciales: (Credencial | null)[];
  onEditar: (c: ClaveCredencial) => void;
  /** URL de avisos que el dueño pega en el panel de su pasarela. */
  webhook?: string;
}) {
  const puestas = credenciales.filter((c) => c?.is_set).length;
  const completa = puestas === claves.length;
  const ambientes = new Set(credenciales.filter((c) => c?.is_set).map((c) => c!.environment));
  const mezclada = ambientes.size > 1;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-2xl text-black dark:text-white">
          {NOMBRE_PASARELA[pasarela]}
        </h3>
        <span
          className={`text-[10px] font-bold uppercase tracking-widest ${
            completa ? 'text-emerald-500' : 'text-gray-500'
          }`}
        >
          {completa ? `Lista · ${[...ambientes][0] === 'prod' ? 'producción' : 'pruebas'}` : `${puestas} de ${claves.length}`}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-gray-500">{AYUDA_PASARELA[pasarela]}</p>

      {webhook && (
        <div className="grunge-border p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            URL para el webhook (Mercado Pago → Webhooks → Configurar notificaciones)
          </p>
          <p className="mt-1 break-all font-mono text-xs text-black dark:text-white">{webhook}</p>
        </div>
      )}

      {mezclada && (
        <ErrorNote>
          Tienes llaves de pruebas y de producción mezcladas. Así los cobros fallan sin decir por
          qué: deja las cuatro en el mismo ambiente.
        </ErrorNote>
      )}

      <ul className="divide-y divide-gray-200 dark:divide-gray-800">
        {claves.map((clave, i) => (
          <FilaCredencial
            key={clave}
            clave={clave}
            credencial={credenciales[i]}
            onEditar={() => onEditar(clave)}
          />
        ))}
      </ul>
    </Card>
  );
}

function FilaCredencial({
  clave, credencial, onEditar,
}: {
  clave: ClaveCredencial;
  credencial: Credencial | null;
  onEditar: () => void;
}) {
  const info = CREDENCIALES[clave];
  const puesta = credencial?.is_set === true;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-black dark:text-white">
          {info.etiqueta}
          {!info.secreta && (
            <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
              no es secreta
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{info.ayuda}</p>

        <p className="mt-1 font-mono text-xs text-gray-400">
          {!puesta && <span className="text-gray-500">Sin configurar</span>}
          {puesta && info.secreta && (
            <>
              ···· {credencial?.last4 ?? '????'}
              <span className="ml-2 font-sans text-gray-500">
                desde el {fechaCorta(credencial?.configured_at ?? null)}
              </span>
            </>
          )}
          {puesta && !info.secreta && (credencial?.public_value ?? '')}
        </p>
      </div>

      <button
        type="button"
        onClick={onEditar}
        className="shrink-0 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
      >
        {puesta ? 'Cambiar' : 'Configurar'}
      </button>
    </li>
  );
}

function FormularioCredencial({
  orgId, clave, actual, onCerrar,
}: {
  orgId: string;
  clave: ClaveCredencial;
  actual: Credencial | null;
  onCerrar: () => void;
}) {
  const guardar = useGuardarCredencial();
  const borrar = useBorrarCredencial();
  const info = CREDENCIALES[clave];
  // Siempre vacío: no hay de dónde precargarlo, y está bien que sea así.
  const [valor, setValor] = useState('');
  const [ambiente, setAmbiente] = useState<Ambiente>(actual?.environment ?? 'test');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (valor.trim() === '') {
      setError('Pega la credencial. Dejarla en blanco no la quita: para eso está el botón de abajo.');
      return;
    }
    try {
      await guardar.mutateAsync({ orgId, clave, valor: valor.trim(), ambiente });
      onCerrar();
    } catch (err) {
      setError(mensaje(err));
    }
  }

  async function onBorrar() {
    setError('');
    try {
      await borrar.mutateAsync({ orgId, clave });
      onCerrar();
    } catch (err) {
      setError(mensaje(err));
    }
  }

  return (
    <Drawer
      open
      title={info.etiqueta}
      onClose={onCerrar}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-credencial" disabled={guardar.isPending} className="flex-1">
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-credencial" onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm leading-relaxed text-gray-400">{info.ayuda}</p>

        <Field
          label={info.secreta ? 'Pega la llave' : 'Pega el valor'}
          hint={
            info.secreta
              ? 'No la vas a poder volver a ver. Si la pierdes, genera otra en tu proveedor.'
              : undefined
          }
        >
          <TextInput
            type={info.secreta ? 'password' : 'text'}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </Field>

        <Field
          label="Ambiente"
          hint="Pruebas: nada se cobra de verdad, sirve para ensayar. Producción: la plata se mueve."
        >
          <Select value={ambiente} onChange={(e) => setAmbiente(e.target.value as Ambiente)}>
            <option value="test">Pruebas</option>
            <option value="prod">Producción</option>
          </Select>
        </Field>

        {actual?.is_set && (
          <div className="grunge-border p-3">
            <p className="text-xs text-gray-500">
              Hoy hay una configurada
              {info.secreta && actual.last4 ? ` que termina en ${actual.last4}` : ''}, desde el{' '}
              {fechaCorta(actual.configured_at)}.
            </p>
            <button
              type="button"
              onClick={onBorrar}
              disabled={borrar.isPending}
              className="mt-2 text-xs font-bold uppercase tracking-widest text-primary hover:underline disabled:opacity-40"
            >
              {borrar.isPending ? 'Quitando…' : 'Quitar esta credencial'}
            </button>
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
    </Drawer>
  );
}
