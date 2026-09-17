/**
 * ¿Este resultado es marca personal?
 *
 * La marca la crea el trigger `results_detecta_pr` en la base — aquí NO se
 * duplica esa lógica. Lo único que se hace es preguntar por la mejor marca
 * anterior ANTES de guardar, para saber si hay que sacar el confeti.
 *
 * La comparación se delega en isImprovement() de performance/format.ts, que ya
 * sabe que en tiempo menos es mejor. Si algún día cambia la regla, cambia en un
 * solo sitio.
 */

import { supabase } from '../../shared/lib/supabase';
import { isImprovement, type Metric } from '../performance/format';
import type { ScoreType } from './types';
import { metricForScore } from './score';

/** La mejor marca previa del atleta en ese movimiento, o null si no tiene. */
export async function bestRecord(
  athleteId: string,
  movementId: string,
  metric: Metric,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('personal_records')
    .select('value_numeric')
    .eq('athlete_id', athleteId)
    .eq('movement_id', movementId)
    .eq('reps', 1)
    // En tiempo la mejor es la más pequeña; en peso, la más grande.
    .order('value_numeric', { ascending: metric === 'time' })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const fila = data as { value_numeric: number } | null;
  return fila ? Number(fila.value_numeric) : null;
}

/**
 * ¿Guardar este score va a crear una marca nueva?
 *
 * Mismas condiciones que el trigger: el bloque tiene que apuntar a un
 * movimiento, puntuarse por carga o por tiempo, y el resultado ser RX.
 */
export async function willBeRecord(args: {
  athleteId: string;
  movementId: string | null;
  scoreType: ScoreType | null;
  scale: string;
  value: number | null;
}): Promise<boolean> {
  const { athleteId, movementId, scoreType, scale, value } = args;
  if (!movementId || value === null) return false;
  if (scale !== 'rx') return false;
  if (scoreType !== 'load' && scoreType !== 'for_time') return false;

  const metric = metricForScore(scoreType);
  const previa = await bestRecord(athleteId, movementId, metric);
  return previa === null || isImprovement(previa, value, metric);
}
