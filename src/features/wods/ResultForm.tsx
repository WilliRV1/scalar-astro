import { useState } from 'react';
import confetti from 'canvas-confetti';
import { Button, ErrorNote, Field, Select, TextInput } from '../../shared/ui';
import { SCALE_LABEL, SCORE_HINT, SCORE_LABEL, parseScore } from './score';
import { willBeRecord } from './pr';
import { useSaveResult } from './mutations';
import type { Result, Scale, WodBlock } from './types';

const SCALES: Scale[] = ['rx', 'scaled', 'beginner'];

const textarea =
  'w-full border border-gray-300 bg-gray-100 p-3 text-sm focus:border-primary focus:outline-none dark:border-gray-700 dark:bg-black';

/** Fiesta. Es publicidad gratis para el box y engancha al atleta. */
function celebrar() {
  void confetti({ particleCount: 140, spread: 80, origin: { y: 0.7 } });
  window.setTimeout(() => {
    void confetti({ particleCount: 80, spread: 110, origin: { y: 0.6 } });
  }, 220);
}

/**
 * Registro del resultado de UN bloque.
 *
 * La casilla se adapta al tipo de score: en `for_time` pide 8:42, en `amrap`
 * pide 5+13 y en `load` pide kilos. Se guarda el número (para ordenar) y el
 * texto (para leer), que es exactamente lo que espera la tabla `results`.
 */
export function ResultForm({
  orgId,
  wodId,
  block,
  athleteId,
  existing,
  loggedBy = 'athlete',
}: {
  orgId: string;
  wodId: string;
  block: WodBlock;
  athleteId: string;
  existing: Result | null;
  loggedBy?: 'athlete' | 'coach';
}) {
  const scoreType = block.score_type ?? 'not_scored';
  const [valor, setValor] = useState(existing?.display_value ?? '');
  const [scale, setScale] = useState<Scale>(existing?.scale ?? 'rx');
  const [notas, setNotas] = useState(existing?.notes ?? '');
  const [rpe, setRpe] = useState(existing?.rpe ? String(existing.rpe) : '');
  const [error, setError] = useState('');
  const [pr, setPr] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const guardar = useSaveResult();

  if (scoreType === 'not_scored') {
    return (
      <p className="text-xs uppercase tracking-widest text-gray-500">
        Este bloque no se puntúa.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPr(false);

    const parsed = parseScore(valor, scoreType);
    if (!parsed) {
      setError(`No entendí el marcador. ${SCORE_HINT[scoreType]}.`);
      return;
    }

    try {
      // Se pregunta ANTES de guardar: después ya existiría la marca nueva y
      // toda marca parecería un récord.
      const esRecord = await willBeRecord({
        athleteId,
        movementId: block.movement_id,
        scoreType,
        scale,
        value: parsed.value,
      });

      await guardar.mutateAsync({
        orgId,
        wodId,
        blockId: block.id,
        athleteId,
        value: parsed.value,
        display: parsed.display,
        scale,
        notes: notas,
        rpe: rpe ? Number(rpe) : null,
        energy: null,
        loggedBy,
      });

      setGuardado(true);
      if (esRecord) {
        setPr(true);
        celebrar();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(
        msg.includes('duplicate') || msg.includes('unique')
          ? 'Ya tienes un resultado en este bloque; se actualizó el que había.'
          : msg || 'No se pudo guardar el resultado.',
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label={`Tu marcador · ${SCORE_LABEL[scoreType]}`} hint={SCORE_HINT[scoreType]}>
        <TextInput
          value={valor}
          inputMode={scoreType === 'load' ? 'decimal' : 'text'}
          placeholder={scoreType === 'load' ? '100' : scoreType === 'amrap' ? '5+13' : '8:42'}
          onChange={(e) => { setValor(e.target.value); setGuardado(false); }}
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-500">
          Escala
        </legend>
        <div className="flex gap-2">
          {SCALES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setScale(s); setGuardado(false); }}
              aria-pressed={scale === s}
              className={`min-h-11 flex-1 px-2 py-2 text-[11px] font-bold uppercase tracking-widest transition ${
                scale === s ? 'bg-primary text-white' : 'grunge-border text-gray-500'
              }`}
            >
              {SCALE_LABEL[s]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="RPE" hint="Del 1 al 10, opcional">
          <Select value={rpe} onChange={(e) => setRpe(e.target.value)}>
            <option value="">—</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </Field>
        <Field label="Notas">
          <textarea
            rows={2}
            className={textarea}
            value={notas}
            placeholder="Se me fue el hombro en la última ronda"
            onChange={(e) => setNotas(e.target.value)}
          />
        </Field>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {pr && (
        <p className="border-l-4 border-green-500 bg-green-500/10 px-4 py-3 font-display text-2xl text-green-500">
          ¡Marca personal!
        </p>
      )}
      {guardado && !pr && (
        <p className="text-xs font-bold uppercase tracking-widest text-green-500">
          Resultado guardado
        </p>
      )}

      <Button type="submit" disabled={guardar.isPending} className="w-full">
        {guardar.isPending ? 'Guardando…' : existing ? 'Actualizar resultado' : 'Registrar resultado'}
      </Button>
    </form>
  );
}
