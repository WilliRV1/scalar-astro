/**
 * Configuración de la ficha del atleta.
 *
 * Aquí el dueño decide qué le pregunta a sus atletas: la talla de la camiseta,
 * el nombre del acudiente, si ya firmó el consentimiento en papel. Sin que
 * nadie toque el código ni despliegue nada, que es lo que separa un SaaS de un
 * software hecho a la medida de un solo cliente.
 *
 * El guarda de esta pantalla decide qué se PINTA; a qué se accede lo decide la
 * RLS: si alguien llega por la URL siendo coach, verá la pantalla vacía y
 * cualquier escritura le será rechazada por el servidor.
 */

import { useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import { mensajeAmigable } from '../../../shared/lib/errores';
import {
  Button, Card, Drawer, EmptyState, ErrorNote, Field, Select, Spinner, TextInput,
} from '../../../shared/ui';
import { Checkbox } from '../../../shared/ui';
import {
  CamposPersonalizados,
  useCustomFieldDefs,
  useDeleteFieldDef,
  useReorderFieldDefs,
  useSaveFieldDef,
  useToggleFieldDef,
  AYUDA_TIPO,
  ETIQUETA_TIPO,
  MAXIMO_CAMPOS,
  TIPOS_CAMPO,
} from '../../../features/customfields';
import type {
  DefinicionCampo, TipoCampo, ValoresCrudos,
} from '../../../features/customfields';

export default function FieldsPage() {
  const { activeMembership } = useAuth();
  const orgId = activeMembership?.org_id;
  const puedeConfigurar =
    activeMembership?.role === 'owner' || activeMembership?.role === 'admin';

  const { data: defs, isLoading, error: errorCarga } = useCustomFieldDefs(orgId, true);
  const reordenar = useReorderFieldDefs();
  const alternar = useToggleFieldDef();

  const [editando, setEditando] = useState<DefinicionCampo | null>(null);
  const [creando, setCreando] = useState(false);
  const [vistaPrevia, setVistaPrevia] = useState<ValoresCrudos>({});
  const [error, setError] = useState('');

  if (!puedeConfigurar) {
    return (
      <EmptyState
        title="Esta pantalla es del dueño"
        hint="La ficha del atleta la configura el dueño o un administrador del box."
      />
    );
  }

  if (isLoading) return <Spinner label="Cargando los campos" />;
  if (errorCarga && !defs) {
    return <ErrorNote>No se pudieron cargar los campos: {mensajeAmigable(errorCarga)}</ErrorNote>;
  }

  const todos = defs ?? [];
  const activos = todos.filter((d) => d.is_active);
  const inactivos = todos.filter((d) => !d.is_active);

  async function mover(indice: number, direccion: -1 | 1) {
    const destino = indice + direccion;
    // Dos toques seguidos mandarían dos reordenes con la misma foto de la
    // lista y el segundo desharía el primero.
    if (!orgId || reordenar.isPending || destino < 0 || destino >= activos.length) return;
    const ids = activos.map((d) => d.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    setError('');
    try {
      await reordenar.mutateAsync({ orgId, ids });
    } catch (err) {
      setError(mensajeAmigable(err));
    }
  }

  async function cambiarActivo(def: DefinicionCampo, activo: boolean) {
    if (!orgId) return;
    setError('');
    try {
      await alternar.mutateAsync({ orgId, defId: def.id, isActive: activo });
    } catch (err) {
      setError(mensajeAmigable(err));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-black dark:text-white">Ficha del atleta</h1>
        <Button onClick={() => setCreando(true)} disabled={activos.length >= MAXIMO_CAMPOS}>
          + Campo
        </Button>
      </div>

      <p className="text-sm text-gray-500">
        Estos campos se suman a los que ya trae la ficha (nombre, celular, documento…).
        Llevas <strong>{activos.length}</strong> de {MAXIMO_CAMPOS}. Un campo que ya tiene
        datos no se borra: se desactiva, y lo que los atletas ya tenían escrito se conserva.
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}
      {errorCarga && (
        <ErrorNote>No se pudieron actualizar los campos: {mensajeAmigable(errorCarga)}</ErrorNote>
      )}

      {!errorCarga && activos.length === 0 && (
        <EmptyState
          title="La ficha está como viene de fábrica"
          hint="Agrega lo que tu box sí anota: talla de camiseta, acudiente, EPS, si firmó el consentimiento en papel."
        />
      )}

      <div className="space-y-2">
        {activos.map((def, i) => (
          <FilaCampo
            key={def.id}
            def={def}
            primero={i === 0}
            ultimo={i === activos.length - 1}
            moviendo={reordenar.isPending}
            onSubir={() => void mover(i, -1)}
            onBajar={() => void mover(i, 1)}
            onEditar={() => setEditando(def)}
            onDesactivar={() => void cambiarActivo(def, false)}
          />
        ))}
      </div>

      {inactivos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
            Desactivados · sus datos siguen guardados
          </h2>
          {inactivos.map((def) => (
            <Card key={def.id} className="flex items-center justify-between gap-3 opacity-60">
              <div>
                <p className="font-bold text-black dark:text-white">{def.label}</p>
                <p className="text-xs uppercase tracking-widest text-gray-500">
                  {ETIQUETA_TIPO[def.field_type]} · {def.key}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void cambiarActivo(def, true)}
                disabled={alternar.isPending}
                aria-label={`Reactivar ${def.label}`}
                className="min-h-11 px-3 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary disabled:opacity-40"
              >
                Reactivar
              </button>
            </Card>
          ))}
        </section>
      )}

      {activos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
            Así lo verá quien llene la ficha
          </h2>
          <Card>
            <CamposPersonalizados
              defs={todos}
              valores={vistaPrevia}
              onChange={setVistaPrevia}
              ambito="todos"
              idPrefijo="previa"
            />
          </Card>
        </section>
      )}

      {orgId && (creando || editando) && (
        <CampoForm
          key={editando?.id ?? 'nuevo'}
          orgId={orgId}
          def={editando}
          siguienteOrden={activos.length + 1}
          clavesUsadas={todos.map((d) => d.key)}
          onClose={() => { setCreando(false); setEditando(null); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FilaCampo({
  def, primero, ultimo, moviendo, onSubir, onBajar, onEditar, onDesactivar,
}: {
  def: DefinicionCampo;
  primero: boolean;
  ultimo: boolean;
  moviendo: boolean;
  onSubir: () => void;
  onBajar: () => void;
  onEditar: () => void;
  onDesactivar: () => void;
}) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-bold text-black dark:text-white">
          {def.label}
          {def.is_required && <Sello texto="Obligatorio" />}
          {def.is_sensitive && <Sello texto="Sensible" destacado />}
        </p>
        <p className="truncate text-xs uppercase tracking-widest text-gray-500">
          {ETIQUETA_TIPO[def.field_type]} · {def.key}
          {def.options.length > 0 && ` · ${def.options.length} opciones`}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <BotonOrden
          etiqueta={`Subir ${def.label}`}
          simbolo="↑"
          onClick={onSubir}
          disabled={primero || moviendo}
        />
        <BotonOrden
          etiqueta={`Bajar ${def.label}`}
          simbolo="↓"
          onClick={onBajar}
          disabled={ultimo || moviendo}
        />
        <button
          type="button"
          onClick={onEditar}
          aria-label={`Editar ${def.label}`}
          className="min-h-11 px-3 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={onDesactivar}
          aria-label={`Desactivar ${def.label}`}
          className="min-h-11 px-3 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
        >
          Desactivar
        </button>
      </div>
    </Card>
  );
}

function BotonOrden({
  etiqueta, simbolo, onClick, disabled,
}: { etiqueta: string; simbolo: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      title={etiqueta}
      className="grunge-border min-h-11 min-w-11 text-lg leading-none text-gray-400 hover:border-primary hover:text-primary disabled:opacity-25"
    >
      {simbolo}
    </button>
  );
}

function Sello({ texto, destacado = false }: { texto: string; destacado?: boolean }) {
  return (
    <span
      className={`ml-2 border px-1 text-[9px] font-bold uppercase tracking-widest ${
        destacado ? 'border-primary text-primary' : 'border-gray-600 text-gray-500'
      }`}
    >
      {texto}
    </span>
  );
}

// ---------------------------------------------------------------------------

/** "Talla de camiseta" -> "talla_de_camiseta". Misma forma que exige la base. */
function claveDesdeEtiqueta(etiqueta: string): string {
  const base = etiqueta
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return /^[a-z]/.test(base) ? base : `campo_${base}`.slice(0, 40);
}

function CampoForm({
  orgId, def, siguienteOrden, clavesUsadas, onClose,
}: {
  orgId: string;
  def: DefinicionCampo | null;
  siguienteOrden: number;
  clavesUsadas: string[];
  onClose: () => void;
}) {
  const guardar = useSaveFieldDef();
  const borrar = useDeleteFieldDef();

  const [label, setLabel] = useState(def?.label ?? '');
  const [key, setKey] = useState(def?.key ?? '');
  const [tipo, setTipo] = useState<TipoCampo>(def?.field_type ?? 'text');
  const [opciones, setOpciones] = useState((def?.options ?? []).join('\n'));
  const [obligatorio, setObligatorio] = useState(def?.is_required ?? false);
  const [sensible, setSensible] = useState(def?.is_sensitive ?? false);
  const [ayuda, setAyuda] = useState(def?.help_text ?? '');
  const [error, setError] = useState('');

  const esNuevo = def === null;
  const necesitaOpciones = tipo === 'select' || tipo === 'multiselect';
  const claveFinal = esNuevo ? (key || claveDesdeEtiqueta(label)) : def.key;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!label.trim()) return setError('Ponle un nombre al campo: es lo que se lee en la ficha.');
    if (esNuevo && !/^[a-z][a-z0-9_]{1,39}$/.test(claveFinal)) {
      return setError(
        'La clave debe empezar por letra y llevar solo minúsculas, números y guion bajo.',
      );
    }
    if (esNuevo && clavesUsadas.includes(claveFinal)) {
      return setError(`Ya existe un campo con la clave "${claveFinal}".`);
    }

    const listaOpciones = necesitaOpciones
      ? opciones.split('\n').map((o) => o.trim()).filter((o) => o !== '')
      : [];
    if (necesitaOpciones && listaOpciones.length === 0) {
      return setError('Una lista necesita al menos una opción, una por línea.');
    }
    if (new Set(listaOpciones).size !== listaOpciones.length) {
      return setError('Hay dos opciones repetidas en la lista.');
    }

    try {
      await guardar.mutateAsync({
        orgId,
        defId: def?.id,
        key: claveFinal,
        label,
        fieldType: tipo,
        options: listaOpciones,
        isRequired: obligatorio,
        isSensitive: sensible,
        helpText: ayuda,
        sortOrder: def?.sort_order ?? siguienteOrden,
      });
      onClose();
    } catch (err) {
      // El mensaje viene de la base, en español y explicando qué pasó.
      setError(mensajeAmigable(err));
    }
  }

  return (
    <Drawer
      open
      title={esNuevo ? 'Nuevo campo' : 'Editar campo'}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-campo" disabled={guardar.isPending} className="flex-1">
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-campo" onSubmit={onSubmit} className="space-y-4">
        <Field label="Nombre del campo" hint="Es lo que se lee en la ficha del atleta.">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </Field>

        <Field
          label="Clave"
          hint={
            esNuevo
              ? 'Con la que se guarda el dato. No se podrá cambiar después.'
              : 'No se puede cambiar: los datos ya guardados quedarían huérfanos.'
          }
        >
          <TextInput
            value={claveFinal}
            disabled={!esNuevo}
            onChange={(e) => setKey(claveDesdeEtiqueta(e.target.value))}
          />
        </Field>

        <Field
          label="Tipo"
          hint={esNuevo ? AYUDA_TIPO[tipo] : 'El tipo no se cambia: desactiva el campo y crea otro.'}
        >
          <Select
            value={tipo}
            disabled={!esNuevo}
            onChange={(e) => setTipo(e.target.value as TipoCampo)}
          >
            {TIPOS_CAMPO.map((t) => (
              <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>
            ))}
          </Select>
        </Field>

        {necesitaOpciones && (
          <Field label="Opciones" hint="Una por línea. El orden es el que verá el coach.">
            <textarea
              value={opciones}
              onChange={(e) => setOpciones(e.target.value)}
              rows={5}
              placeholder={'XS\nS\nM\nL\nXL'}
              className="w-full border border-gray-300 bg-gray-100 p-3 text-base sm:text-sm text-sm focus:border-primary dark:border-gray-700 dark:bg-black"
            />
          </Field>
        )}

        <Field label="Texto de ayuda" hint="Opcional. Sale debajo del campo.">
          <TextInput value={ayuda} onChange={(e) => setAyuda(e.target.value)} />
        </Field>

        <Checkbox
          label="Obligatorio"
          checked={obligatorio}
          onChange={setObligatorio}
          hint="No se podrá guardar un atleta sin este dato."
        />

        <Checkbox
          label="Dato sensible"
          checked={sensible}
          onChange={setSensible}
          hint="Lesiones, condiciones médicas. Se guarda aparte: no lo ve el atleta ni un coach sin permiso para gestionar atletas. Requiere autorización propia del titular (Ley 1581)."
        />

        {error && <ErrorNote>{error}</ErrorNote>}

        {!esNuevo && (
          <button
            type="button"
            onClick={async () => {
              if (!confirm(`¿Borrar "${def.label}"? Solo se puede si ningún atleta tiene ese dato.`)) return;
              setError('');
              try {
                await borrar.mutateAsync({ orgId, defId: def.id });
                onClose();
              } catch (err) {
                setError(mensajeAmigable(err));
              }
            }}
            disabled={borrar.isPending}
            className="min-h-11 px-3 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary disabled:opacity-40"
          >
            Borrar el campo
          </button>
        )}
      </form>
    </Drawer>
  );
}
