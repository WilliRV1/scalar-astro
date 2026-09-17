import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import { Button, Drawer, ErrorNote, Field, Select, TextInput } from '../../shared/ui';
import { formatValue, parseValue, type Metric } from './format';
import { useMovements } from './queries';

export function RecordForm({
  open, onClose, orgId, athleteId,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  athleteId: string;
}) {
  const qc = useQueryClient();
  const { data: movimientos } = useMovements(orgId);

  const [movementId, setMovementId] = useState('');
  const [valor, setValor] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  const movimiento = movimientos?.find((m) => m.id === movementId);
  const metric = (movimiento?.metric ?? 'weight') as Metric;
  const parsed = valor ? parseValue(valor, metric) : null;

  const guardar = useMutation({
    mutationFn: async () => {
      if (!movimiento || parsed === null) throw new Error('Datos incompletos');
      const { error: err } = await supabase.from('personal_records').insert({
        org_id: orgId,
        athlete_id: athleteId,
        movement_id: movimiento.id,
        value_numeric: parsed,
        unit: movimiento.unit,
        achieved_on: fecha,
        source: 'manual',
      });
      if (err) throw err;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['records', athleteId] });
      onClose();
    },
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!movimiento) return setError('Elige un movimiento.');
    if (parsed === null) {
      return setError(
        metric === 'time'
          ? 'Escribe el tiempo como 8:30 o 1:02:30.'
          : 'Escribe solo el número, por ejemplo 120.',
      );
    }
    try {
      await guardar.mutateAsync();
    } catch (err) {
      // El índice único de la base impide dos marcas iguales el mismo día.
      const msg = err instanceof Error ? err.message : '';
      setError(
        msg.includes('duplicate') || msg.includes('unique')
          ? 'Ya hay una marca de ese movimiento en esa fecha.'
          : msg || 'No se pudo guardar',
      );
    }
  }

  return (
    <Drawer
      open={open}
      title="Registrar marca"
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-marca" disabled={guardar.isPending} className="flex-1">
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-marca" onSubmit={onSubmit} className="space-y-4">
        <Field label="Movimiento">
          <Select value={movementId} onChange={(e) => { setMovementId(e.target.value); setValor(''); }}>
            <option value="">— Elegir —</option>
            {movimientos?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}{m.is_benchmark ? ' (benchmark)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={metric === 'time' ? 'Tiempo' : 'Marca'}
          hint={
            metric === 'time'
              ? 'Formato 8:30 (minutos:segundos). En los benchmarks, menos es mejor.'
              : `En ${movimiento?.unit ?? 'kg'}`
          }
        >
          <TextInput
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={metric === 'time' ? '8:30' : '120'}
            disabled={!movimiento}
          />
        </Field>

        {parsed !== null && movimiento && (
          <p className="text-sm text-gray-500">
            Se guardará como{' '}
            <strong className="text-black dark:text-white">
              {formatValue(parsed, metric, movimiento.unit)}
            </strong>
          </p>
        )}

        <Field label="Fecha" hint="Cuándo lo logró. No tiene que ser hoy.">
          <TextInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
    </Drawer>
  );
}
