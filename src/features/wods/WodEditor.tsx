import { useState } from 'react';
import { Button, ErrorNote, Field, TextInput } from '../../shared/ui';
import { mensajeAmigable } from '../../shared/lib/errores';
import { useMovements } from '../performance/queries';
import { BlockEditor } from './BlockEditor';
import { BenchmarkPicker } from './BenchmarkPicker';
import { useSaveBlocks, useSaveWod, useTogglePublish } from './mutations';
import type { BlockDraft, WodWithBlocks } from './types';

const textarea =
  'w-full border border-gray-300 bg-gray-100 p-3 text-base focus:border-primary sm:text-sm dark:border-gray-700 dark:bg-black';

function bloqueVacio(position: number): BlockDraft {
  return {
    position,
    kind: 'metcon',
    title: '',
    description: '',
    score_type: 'for_time',
    time_cap_sec: null,
    scaling: {},
    movement_id: null,
  };
}

function aDrafts(wod: WodWithBlocks | null): BlockDraft[] {
  return (wod?.blocks ?? []).map((b) => ({
    id: b.id,
    position: b.position,
    kind: b.kind,
    title: b.title ?? '',
    description: b.description,
    score_type: b.score_type ?? 'not_scored',
    time_cap_sec: b.time_cap_sec,
    scaling: b.scaling ?? {},
    movement_id: b.movement_id,
  }));
}

/**
 * Editor del WOD de un día.
 *
 * Todo el trabajo se hace en memoria y se guarda de un golpe: reordenar bloques
 * con una mano, en el piso del box y con mala señal, no puede depender de que
 * cada movimiento llegue al servidor.
 *
 * Publicar es un botón aparte, no una casilla del formulario: es lo que decide
 * si el atleta ve el WOD, y tiene que verse desde el otro lado del box.
 */
export function WodEditor({
  orgId,
  date,
  wod,
}: {
  orgId: string;
  date: string;
  wod: WodWithBlocks | null;
}) {
  const [titulo, setTitulo] = useState(wod?.title ?? '');
  const [notas, setNotas] = useState(wod?.notes ?? '');
  const [bloques, setBloques] = useState<BlockDraft[]>(() => aDrafts(wod));
  const [eliminados, setEliminados] = useState<string[]>([]);
  const [biblioteca, setBiblioteca] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);

  // No hay useEffect que resincronice el borrador con el servidor a propósito:
  // la página monta este editor con una `key` que incluye la fecha y el id del
  // WOD, así que cambiar de día ya arranca un editor nuevo. Copiar las props al
  // estado en un efecto, además de provocar renders en cascada, le borraría al
  // coach lo que está escribiendo cada vez que se refresca la consulta.

  const { data: movimientos } = useMovements(orgId);
  const nombreDe = (id: string | null) =>
    id ? movimientos?.find((m) => m.id === id)?.name ?? null : null;

  const guardarWod = useSaveWod();
  const guardarBloques = useSaveBlocks();
  const publicar = useTogglePublish();

  const publicado = Boolean(wod?.published_at);
  const ocupado = guardarWod.isPending || guardarBloques.isPending || publicar.isPending;

  function mover(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= bloques.length) return;
    const copia = [...bloques];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    setBloques(copia.map((b, k) => ({ ...b, position: k })));
    setGuardado(false);
  }

  function quitar(i: number) {
    const b = bloques[i];
    if (b.id) setEliminados((prev) => [...prev, b.id!]);
    setBloques(bloques.filter((_, k) => k !== i).map((x, k) => ({ ...x, position: k })));
    setGuardado(false);
  }

  async function guardar() {
    setError('');
    try {
      const creado = await guardarWod.mutateAsync({
        orgId, date, wodId: wod?.id, title: titulo, notes: notas,
      });
      await guardarBloques.mutateAsync({
        orgId, date, wodId: creado.id, blocks: bloques, removedIds: eliminados,
      });
      setEliminados([]);
      setGuardado(true);
    } catch (err) {
      setError(`No se pudo guardar el WOD: ${mensajeAmigable(err)}`);
    }
  }

  async function alternarPublicacion() {
    if (!wod) {
      setError('Guarda el WOD antes de publicarlo.');
      return;
    }
    setError('');
    try {
      await publicar.mutateAsync({ orgId, date, wodId: wod.id, publish: !publicado });
    } catch (err) {
      setError(`No se pudo cambiar la publicación: ${mensajeAmigable(err)}`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Estado de publicación: lo primero que se ve. */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-l-4 px-4 py-3 ${
          publicado
            ? 'border-green-500 bg-green-500/10'
            : 'border-gray-600 bg-black/20 dark:bg-white/5'
        }`}
      >
        <div>
          <p className={`font-display text-2xl ${publicado ? 'text-green-500' : 'text-gray-400'}`}>
            {publicado ? 'Publicado' : 'Borrador'}
          </p>
          <p className="text-xs text-gray-500">
            {publicado
              ? 'Los atletas ya lo ven y pueden registrar resultado.'
              : 'Solo lo ve el equipo del box.'}
          </p>
        </div>
        <Button
          variant={publicado ? 'ghost' : 'primary'}
          onClick={() => void alternarPublicacion()}
          disabled={ocupado || !wod}
        >
          {publicado ? 'Despublicar' : 'Publicar'}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Título del día">
          <TextInput
            value={titulo}
            placeholder="WOD del día"
            onChange={(e) => { setTitulo(e.target.value); setGuardado(false); }}
          />
        </Field>
        <Field label="Notas del coach" hint="Las ve el atleta junto al WOD">
          <textarea
            rows={2}
            className={textarea}
            value={notas}
            placeholder="Hoy calentamos con movilidad de cadera"
            onChange={(e) => { setNotas(e.target.value); setGuardado(false); }}
          />
        </Field>
      </div>

      <div className="space-y-3">
        {bloques.map((b, i) => (
          <BlockEditor
            key={b.id ?? `nuevo-${i}`}
            block={b}
            index={i}
            total={bloques.length}
            movementName={nombreDe(b.movement_id)}
            onChange={(next) => {
              setBloques(bloques.map((x, k) => (k === i ? next : x)));
              setGuardado(false);
            }}
            onMove={(delta) => mover(i, delta)}
            onRemove={() => quitar(i)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            setBloques([...bloques, bloqueVacio(bloques.length)]);
            setGuardado(false);
          }}
        >
          + Bloque
        </Button>
        <Button variant="ghost" onClick={() => setBiblioteca(true)}>
          Benchmarks
        </Button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {guardado && !error && (
        <p className="text-xs font-bold uppercase tracking-widest text-green-500">
          Cambios guardados
        </p>
      )}

      {/* Barra fija: el coach edita desde el celular y no debería tener que
          bajar hasta el final para guardar. */}
      <div className="sticky bottom-0 -mx-1 bg-background-light/95 px-1 py-3 dark:bg-background-dark/95">
        <Button onClick={() => void guardar()} disabled={ocupado} className="w-full">
          {ocupado ? 'Guardando…' : 'Guardar WOD'}
        </Button>
      </div>

      <BenchmarkPicker
        open={biblioteca}
        orgId={orgId}
        onClose={() => setBiblioteca(false)}
        onPick={(draft) => {
          setBloques([...bloques, { ...draft, position: bloques.length }]);
          setGuardado(false);
        }}
      />
    </div>
  );
}
