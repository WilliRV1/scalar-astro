import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { Movement, PersonalRecord } from '../../types/database';

export interface RecordGroup {
  movement: Movement;
  records: PersonalRecord[];   // en orden cronológico
  current: PersonalRecord;     // la más reciente
}

export function useMovements(orgId: string | undefined) {
  return useQuery({
    queryKey: ['movements', orgId],
    enabled: Boolean(orgId),
    staleTime: 10 * 60_000,   // el catálogo casi nunca cambia
    queryFn: async (): Promise<Movement[]> => {
      const { data, error } = await supabase
        .from('movements').select('*').order('sort_order');
      if (error) throw error;
      return (data ?? []) as Movement[];
    },
  });
}

/** Marcas de un atleta, agrupadas por movimiento y en orden cronológico. */
export function useAthleteRecords(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: ['records', athleteId],
    enabled: Boolean(athleteId),
    queryFn: async (): Promise<RecordGroup[]> => {
      const { data, error } = await supabase
        .from('personal_records')
        .select('*, movements(*)')
        .eq('athlete_id', athleteId!)
        .order('achieved_on', { ascending: true });
      if (error) throw error;

      const filas = (data ?? []) as (PersonalRecord & { movements: Movement })[];
      const porMovimiento = new Map<string, RecordGroup>();

      for (const fila of filas) {
        const { movements, ...record } = fila;
        const grupo = porMovimiento.get(movements.id);
        if (grupo) {
          grupo.records.push(record);
          grupo.current = record;
        } else {
          porMovimiento.set(movements.id, {
            movement: movements,
            records: [record],
            current: record,
          });
        }
      }

      return [...porMovimiento.values()].sort(
        (a, b) => a.movement.sort_order - b.movement.sort_order,
      );
    },
  });
}
