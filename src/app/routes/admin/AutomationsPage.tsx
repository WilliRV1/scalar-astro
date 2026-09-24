import { useDeferredValue, useMemo, useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import {
  useAjustesAutomatizacion,
  useBitacora,
  useReglas,
} from '../../../features/automations/queries';
import {
  useCambiarRegla,
  useCancelarMensaje,
  useGuardarAjustes,
  useGuardarPlantilla,
} from '../../../features/automations/mutations';
import {
  avisosDePlantilla,
  etiquetaDeCategoria,
  variablesDe,
  vistaPrevia,
} from '../../../features/automations/plantillas';
import type {
  EstadoMensaje,
  MensajeEnBitacora,
  ReglaConPlantilla,
} from '../../../features/automations/types';
import { mensajeAmigable } from '../../../shared/lib/errores';
import { fechaYHora } from '../../../shared/lib/fechas';
import { formatPhone } from '../../../shared/lib/phone';
import {
  Button, Card, Drawer, EmptyState, ErrorNote, Field, Select, Spinner, TextInput,
} from '../../../shared/ui';

/**
 * Automatizaciones.
 *
 * Esta pantalla es el producto: las reglas son datos, así que el box las
 * prende, las apaga y les cambia el texto sin que nosotros despleguemos nada.
 *
 * Tres cosas tienen que verse SIN buscarlas, porque son las que evitan los
 * reclamos: el modo simulación, el tope antifatiga y el horario silencioso.
 * Y abajo la bitácora, que es lo único que permite responder al primer reclamo
 * de verdad: "me están cobrando y yo ya pagué".
 */

const ESTADO: Record<EstadoMensaje, { label: string; clase: string }> = {
  queued:    { label: 'En cola',    clase: 'text-gray-400' },
  sending:   { label: 'Saliendo',   clase: 'text-blue-400' },
  ready:     { label: 'Listo',      clase: 'text-amber-400' },
  sent:      { label: 'Enviado',    clase: 'text-emerald-500' },
  delivered: { label: 'Entregado',  clase: 'text-emerald-500' },
  read:      { label: 'Leído',      clase: 'text-emerald-400' },
  failed:    { label: 'Falló',      clase: 'text-primary' },
  cancelled: { label: 'Cancelado',  clase: 'text-gray-500 line-through' },
  simulated: { label: 'Simulado',   clase: 'text-purple-400' },
};

const FILTROS: { key: EstadoMensaje | 'todos'; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'queued', label: 'En cola' },
  { key: 'ready', label: 'Listos' },
  { key: 'sent', label: 'Enviados' },
  { key: 'cancelled', label: 'Cancelados' },
  { key: 'simulated', label: 'Simulados' },
  { key: 'failed', label: 'Fallidos' },
];

const HORAS = Array.from({ length: 24 }, (_, i) => i);

export default function AutomationsPage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;

  const { data: reglas, isLoading, error } = useReglas(orgId);
  const {
    data: ajustes,
    isLoading: cargandoAjustes,
    error: errorAjustes,
  } = useAjustesAutomatizacion(orgId);
  const guardarAjustes = useGuardarAjustes();
  const cambiarRegla = useCambiarRegla();

  const [editando, setEditando] = useState<ReglaConPlantilla | null>(null);
  const [filtro, setFiltro] = useState<EstadoMensaje | 'todos'>('todos');
  const [busqueda, setBusqueda] = useState('');
  // La búsqueda se difiere: se escribe fluido y la consulta va detrás.
  const busquedaDiferida = useDeferredValue(busqueda.trim());

  const {
    data: bitacora,
    isLoading: cargandoBitacora,
    error: errorBitacora,
  } = useBitacora(orgId, {
    estado: filtro,
    busqueda: busquedaDiferida || undefined,
  });

  // Mientras no se sepa el estado real NO se asume nada: asumir "simulación"
  // hace creer que no sale nada cuando sí está saliendo.
  const estadoDesconocido = cargandoAjustes || Boolean(errorAjustes);
  // Un box sin fila todavía arranca en simulación (es el defecto de la base);
  // ese defecto solo se aplica cuando la lectura SÍ llegó.
  const simulacion = estadoDesconocido ? false : (ajustes?.simulation_mode ?? true);
  const ajustesBloqueados = estadoDesconocido || guardarAjustes.isPending;
  const activas = useMemo(() => (reglas ?? []).filter((r) => r.is_active).length, [reglas]);

  function cambiarAjuste(cambios: Record<string, unknown>) {
    if (!orgId) return;
    guardarAjustes.mutate({ orgId, cambios });
  }

  if (isLoading) return <Spinner label="Cargando automatizaciones" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-black dark:text-white">Automatizaciones</h1>
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
          {activas} de {reglas?.length ?? 0} encendidas
        </span>
      </div>

      <p className="max-w-2xl text-sm text-gray-500">
        Cada regla es <strong>cuándo</strong> pasa algo, <strong>a quién</strong> se le avisa y{' '}
        <strong>qué</strong> dice. Puedes prenderlas, apagarlas y cambiarles el texto aquí mismo;
        no hay que esperar a nadie.
      </p>

      {error && <ErrorNote>No se pudieron cargar las reglas: {mensajeAmigable(error)}</ErrorNote>}
      {errorAjustes && (
        <ErrorNote>No se pudo leer el estado de las automatizaciones: {mensajeAmigable(errorAjustes)}</ErrorNote>
      )}
      {guardarAjustes.isError && (
        <ErrorNote>No se pudo guardar el ajuste: {mensajeAmigable(guardarAjustes.error)}</ErrorNote>
      )}
      {cambiarRegla.isError && (
        <ErrorNote>No se pudo cambiar la regla: {mensajeAmigable(cambiarRegla.error)}</ErrorNote>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Modo simulación. Va arriba, grande y con color: mientras está      */}
      {/* encendido NO sale ni un mensaje, y si alguien lo olvida el box     */}
      {/* cree que el sistema no sirve.                                      */}
      {/* ----------------------------------------------------------------- */}
      <div
        className={`grunge-border p-5 ${
          simulacion ? 'border-l-4 border-l-amber-400 bg-amber-400/10' : 'bg-surface-light dark:bg-surface-dark'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[16rem] flex-1">
            <p className="font-display text-2xl text-black dark:text-white">
              {estadoDesconocido
                ? (errorAjustes ? 'No se pudo leer el estado' : 'Leyendo el estado…')
                : simulacion ? 'Modo simulación ENCENDIDO' : 'Envío real activo'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {estadoDesconocido
                ? 'Hasta que se lea el estado no se sabe si los mensajes salen o no. Recarga la página.'
                : simulacion
                  ? 'Los mensajes se preparan y quedan en la bitácora, pero NO se envía ninguno. Úsalo la primera semana para ver qué habría pasado.'
                  : 'Los mensajes salen de verdad hacia los atletas, respetando el horario y el tope por persona.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={simulacion}
            aria-label="Modo simulación"
            disabled={ajustesBloqueados}
            onClick={() => cambiarAjuste({ simulation_mode: !simulacion })}
            className={`relative h-11 w-20 shrink-0 border transition disabled:cursor-not-allowed disabled:opacity-40 ${
              simulacion ? 'border-amber-400 bg-amber-400/30' : 'border-gray-600 bg-black/40'
            }`}
          >
            <span
              className={`absolute top-1.5 h-8 w-8 transition-all ${
                simulacion ? 'left-11 bg-amber-400' : 'left-1 bg-gray-500'
              }`}
            />
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Reglas duras del box                                               */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <p className="font-display text-2xl text-black dark:text-white">Reglas de convivencia</p>
        <p className="mt-1 text-sm text-gray-500">
          Se aplican a TODAS las reglas automáticas. Son las que evitan que el número del box
          termine bloqueado.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field
            label="Tope por atleta al mes"
            hint="Antifatiga. Por encima de esto no se encola nada."
          >
            <Select
              value={String(ajustes?.max_messages_per_athlete_per_month ?? 4)}
              disabled={ajustesBloqueados}
              onChange={(e) =>
                cambiarAjuste({ max_messages_per_athlete_per_month: Number(e.target.value) })}
            >
              {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>{n} mensajes</option>
              ))}
            </Select>
          </Field>

          <Field label="No escribir antes de" hint="Hora del box, no UTC.">
            <Select
              value={String(ajustes?.quiet_start_hour ?? 8)}
              disabled={ajustesBloqueados}
              onChange={(e) => cambiarAjuste({ quiet_start_hour: Number(e.target.value) })}
            >
              {HORAS.map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </Select>
          </Field>

          <Field label="Ni después de" hint="Lo que caiga fuera se corre a la mañana siguiente.">
            <Select
              value={String(ajustes?.quiet_end_hour ?? 21)}
              disabled={ajustesBloqueados}
              onChange={(e) => cambiarAjuste({ quiet_end_hour: Number(e.target.value) })}
            >
              {HORAS.slice(1).concat(24).map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </Select>
          </Field>
        </div>

        {(ajustes?.is_enabled === false) && (
          <div className="mt-4">
            <ErrorNote>
              Las automatizaciones están APAGADAS por completo para este box: no se encola nada.
            </ErrorNote>
          </div>
        )}
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Las reglas                                                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid gap-2 lg:grid-cols-2">
        {(reglas ?? []).map((regla) => (
          <FilaDeRegla
            key={regla.id}
            regla={regla}
            onEditar={() => setEditando(regla)}
            cambiando={cambiarRegla.isPending && cambiarRegla.variables?.ruleId === regla.id}
            onCambiar={(activa) =>
              orgId && cambiarRegla.mutate({ orgId, ruleId: regla.id, isActive: activa })}
          />
        ))}
      </div>

      {!error && (reglas?.length ?? 0) === 0 && (
        <EmptyState
          title="Este box todavía no tiene reglas"
          hint="Se copian solas al dar de alta el box. Si no aparecen, avísanos."
        />
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Bitácora                                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="pt-4">
        <h2 className="font-display text-2xl text-black dark:text-white">Bitácora de mensajes</h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Todo lo que el sistema preparó o envió, con su estado. Es lo que te permite responder
          cuando un atleta dice "me están cobrando y yo ya pagué": si el pago entró, verás el
          mensaje <span className="font-bold">cancelado</span>.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filtro === f.key}
              onClick={() => setFiltro(f.key)}
              className={`grunge-border min-h-11 px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition ${
                filtro === f.key ? 'border-primary text-primary' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="min-w-[12rem] flex-1">
            <TextInput
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en el texto del mensaje…"
            />
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {cargandoBitacora && <Spinner label="Cargando bitácora" />}
          {errorBitacora && (
            <ErrorNote>No se pudo cargar la bitácora: {mensajeAmigable(errorBitacora)}</ErrorNote>
          )}
          {!cargandoBitacora && !errorBitacora && (bitacora?.length ?? 0) === 0 && (
            <EmptyState
              title="Todavía no hay mensajes"
              hint="Aparecerán en cuanto el motor corra por primera vez."
            />
          )}
          {(bitacora ?? []).map((m) => (
            <FilaDeBitacora key={m.id} mensaje={m} orgId={orgId} />
          ))}
        </div>
      </div>

      {orgId && editando && (
        <EditorDePlantilla
          key={editando.id}
          orgId={orgId}
          regla={editando}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function FilaDeRegla({
  regla, onEditar, onCambiar, cambiando,
}: {
  regla: ReglaConPlantilla;
  onEditar: () => void;
  onCambiar: (activa: boolean) => void;
  cambiando: boolean;
}) {
  const plantilla = regla.message_templates;
  const avisos = plantilla ? avisosDePlantilla(plantilla) : [];

  return (
    <Card className={regla.is_active ? '' : 'opacity-60'}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-black dark:text-white">{regla.name}</p>
          <p className="mt-0.5 text-xs text-gray-500">{regla.description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={regla.is_active}
          aria-label={`Regla ${regla.name}`}
          disabled={cambiando}
          onClick={() => onCambiar(!regla.is_active)}
          className={`relative h-11 w-16 shrink-0 border transition disabled:cursor-not-allowed disabled:opacity-40 ${
            regla.is_active ? 'border-primary bg-primary/30' : 'border-gray-600 bg-black/40'
          }`}
        >
          <span
            className={`absolute top-1.5 h-7 w-7 transition-all ${
              regla.is_active ? 'left-8 bg-primary' : 'left-1 bg-gray-500'
            }`}
          />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
        <span className="grunge-border px-2 py-1">{etiquetaDeCategoria(regla.category)}</span>
        <span className="grunge-border px-2 py-1">
          {regla.trigger_type === 'schedule' ? 'Por horario' : 'Por evento'}
        </span>
        <span className="grunge-border px-2 py-1">Prioridad {regla.priority}</span>
      </div>

      {plantilla && (
        <p className="mt-3 line-clamp-2 border-l-2 border-gray-700 pl-3 text-xs italic text-gray-400">
          {vistaPrevia(plantilla.body)}
        </p>
      )}

      {avisos.length > 0 && (
        <p className="mt-2 text-[11px] font-bold text-amber-400">⚠ {avisos[0]}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-gray-600">
          {regla.last_run_at
            ? `Última evaluación: ${fechaYHora(regla.last_run_at)}`
            : 'Todavía no se ha evaluado'}
        </span>
        {plantilla && (
          <button
            type="button"
            onClick={onEditar}
            aria-label={`Editar mensaje de ${regla.name}`}
            className="min-h-11 px-3 text-xs font-bold uppercase text-gray-500 hover:text-primary"
          >
            Editar mensaje
          </button>
        )}
      </div>
    </Card>
  );
}

function FilaDeBitacora({ mensaje, orgId }: { mensaje: MensajeEnBitacora; orgId: string | undefined }) {
  const cancelar = useCancelarMensaje();
  const estado = ESTADO[mensaje.status];
  const cancelable = mensaje.status === 'queued' || mensaje.status === 'ready';
  const nombre = mensaje.athletes
    ? `${mensaje.athletes.first_name} ${mensaje.athletes.last_name ?? ''}`.trim()
    : 'Equipo del box';

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-black dark:text-white">
            {nombre}
            <span className="ml-2 text-xs font-normal text-gray-500">
              {formatPhone(mensaje.to_address)}
            </span>
          </p>
          <p className="mt-1 whitespace-pre-line text-xs text-gray-400">{mensaje.rendered_body}</p>
          {mensaje.cancel_reason && (
            <p className="mt-1 text-[11px] font-bold text-emerald-500">{mensaje.cancel_reason}</p>
          )}
          {mensaje.error && (
            <p className="mt-1 text-[11px] font-bold text-primary">{mensaje.error}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-[11px] font-bold uppercase tracking-widest ${estado.clase}`}>
            {estado.label}
            {mensaje.simulated && mensaje.status !== 'simulated' && ' · simulado'}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-gray-600">
            {fechaYHora(mensaje.sent_at ?? mensaje.scheduled_for)}
          </p>
          {cancelable && orgId && (
            <button
              type="button"
              onClick={() => cancelar.mutate({ orgId, messageId: mensaje.id })}
              disabled={cancelar.isPending}
              aria-label={`No mandar el mensaje a ${nombre}`}
              className="mt-1 min-h-11 px-3 text-[11px] font-bold uppercase text-gray-500 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cancelar.isPending ? 'Cancelando…' : 'No mandarlo'}
            </button>
          )}
          {cancelar.isError && (
            <p role="alert" className="mt-1 text-[11px] font-bold text-primary">
              {mensajeAmigable(cancelar.error)}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function EditorDePlantilla({
  orgId, regla, onClose,
}: {
  orgId: string;
  regla: ReglaConPlantilla;
  onClose: () => void;
}) {
  const plantilla = regla.message_templates!;
  const guardar = useGuardarPlantilla();
  const [cuerpo, setCuerpo] = useState(plantilla.body);

  const usadas = variablesDe(cuerpo);
  const avisos = avisosDePlantilla({ body: cuerpo, category: plantilla.category });
  // Las que la regla sabe llenar: las que trae la plantilla de fábrica.
  const disponibles = plantilla.variables ?? [];
  const desconocidas = usadas.filter((v) => !disponibles.includes(v));

  return (
    <Drawer
      open
      title={regla.name}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() =>
              guardar.mutate(
                { orgId, templateId: plantilla.id, body: cuerpo, variables: usadas },
                { onSuccess: onClose },
              )}
            disabled={guardar.isPending || cuerpo.trim() === ''}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Este es el texto que recibe el atleta. Las variables entre llaves se reemplazan solas;
          lo que no exista se borra, así que nunca le llega un hueco a la vista.
        </p>

        <Field label="Mensaje" hint={`Categoría: ${etiquetaDeCategoria(plantilla.category)}`}>
          <textarea
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            rows={7}
            className="w-full border border-gray-300 bg-gray-100 p-3 text-base sm:text-sm text-sm focus:border-primary focus:outline-none dark:border-gray-700 dark:bg-black"
          />
        </Field>

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-500">
            Variables disponibles
          </p>
          <div className="flex flex-wrap gap-2">
            {disponibles.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setCuerpo((c) => `${c}{{${v}}}`)}
                className={`grunge-border px-2 py-1 text-[11px] font-bold ${
                  usadas.includes(v) ? 'border-primary text-primary' : 'text-gray-400 hover:text-primary'
                }`}
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>

        {desconocidas.length > 0 && (
          <ErrorNote>
            Estas variables no las sabe llenar esta regla y saldrán vacías:{' '}
            {desconocidas.map((v) => `{{${v}}}`).join(', ')}
          </ErrorNote>
        )}

        {avisos.map((a) => (
          <p key={a} className="text-xs font-bold text-amber-400">⚠ {a}</p>
        ))}

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-500">
            Así lo va a ver el atleta
          </p>
          <div className="grunge-border bg-emerald-950/30 p-3">
            <p className="whitespace-pre-line text-sm text-gray-200">{vistaPrevia(cuerpo)}</p>
          </div>
        </div>

        {guardar.isError && <ErrorNote>No se pudo guardar: {mensajeAmigable(guardar.error)}</ErrorNote>}
      </div>
    </Drawer>
  );
}
