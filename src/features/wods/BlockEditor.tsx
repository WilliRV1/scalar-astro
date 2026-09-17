import { Field, Select, TextInput } from '../../shared/ui';
import { SCORE_LABEL } from './score';
import type { BlockDraft, BlockKind, ScoreType } from './types';

const KIND_LABEL: Record<BlockKind, string> = {
  warmup: 'Calentamiento',
  strength: 'Fuerza',
  metcon: 'Metcon',
  accessory: 'Accesorio',
  cooldown: 'Vuelta a la calma',
};

const KINDS = Object.keys(KIND_LABEL) as BlockKind[];
const SCORES = Object.keys(SCORE_LABEL) as ScoreType[];

const textarea =
  'w-full border border-gray-300 bg-gray-100 p-3 text-sm focus:border-primary focus:outline-none dark:border-gray-700 dark:bg-black';

/** Un bloque del WOD en modo edición. El coach lo usa desde el celular. */
export function BlockEditor({
  block,
  index,
  total,
  movementName,
  onChange,
  onMove,
  onRemove,
}: {
  block: BlockDraft;
  index: number;
  total: number;
  movementName: string | null;
  onChange: (next: BlockDraft) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof BlockDraft>(key: K, value: BlockDraft[K]) =>
    onChange({ ...block, [key]: value });

  const capMin = block.time_cap_sec ? String(Math.round(block.time_cap_sec / 60)) : '';

  return (
    <div className="grunge-border bg-surface-light p-4 dark:bg-surface-dark">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-display text-2xl text-primary">{index + 1}</span>
        <Select
          aria-label="Tipo de bloque"
          value={block.kind}
          onChange={(e) => set('kind', e.target.value as BlockKind)}
          className="flex-1"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </Select>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Subir el bloque ${index + 1}`}
            className="grunge-border h-11 w-11 text-lg text-gray-400 disabled:opacity-30 hover:enabled:border-primary hover:enabled:text-primary"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Bajar el bloque ${index + 1}`}
            className="grunge-border h-11 w-11 text-lg text-gray-400 disabled:opacity-30 hover:enabled:border-primary hover:enabled:text-primary"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Eliminar el bloque ${index + 1}`}
            className="grunge-border h-11 w-11 text-lg text-gray-400 hover:border-primary hover:text-primary"
          >
            ×
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <Field label="Título">
          <TextInput
            value={block.title}
            placeholder="Fran, Back Squat 5x5…"
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>

        <Field label="Qué se hace">
          <textarea
            rows={4}
            className={textarea}
            value={block.description}
            placeholder={'21-15-9\nThrusters 43 kg\nPull-ups'}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cómo se puntúa">
            <Select
              value={block.score_type}
              onChange={(e) => set('score_type', e.target.value as ScoreType)}
            >
              {SCORES.map((s) => (
                <option key={s} value={s}>{SCORE_LABEL[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Time cap (minutos)" hint="Déjalo vacío si no hay tope">
            <TextInput
              inputMode="numeric"
              value={capMin}
              placeholder="15"
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ''));
                set('time_cap_sec', n > 0 ? n * 60 : null);
              }}
            />
          </Field>
        </div>

        {movementName && (
          <p className="text-[11px] font-bold uppercase tracking-widest text-green-500">
            Cuenta para la marca de {movementName}
          </p>
        )}

        <fieldset className="space-y-2 border-l-2 border-gray-700 pl-3">
          <legend className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
            Escalas
          </legend>
          <Field label="RX">
            <TextInput
              value={block.scaling.rx ?? ''}
              placeholder="43 kg / pull-ups"
              onChange={(e) => set('scaling', { ...block.scaling, rx: e.target.value })}
            />
          </Field>
          <Field label="Scaled">
            <TextInput
              value={block.scaling.scaled ?? ''}
              placeholder="30 kg / banda"
              onChange={(e) => set('scaling', { ...block.scaling, scaled: e.target.value })}
            />
          </Field>
          <Field label="Principiante">
            <TextInput
              value={block.scaling.beginner ?? ''}
              placeholder="Barra vacía / ring rows"
              onChange={(e) => set('scaling', { ...block.scaling, beginner: e.target.value })}
            />
          </Field>
        </fieldset>
      </div>
    </div>
  );
}
