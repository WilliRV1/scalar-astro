import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { Attendance } from '../wods/types';

/**
 * La asistencia de un día.
 *
 * Igual que en el resto del proyecto, el `.eq('org_id', …)` no es lo que aísla
 * los boxes —eso lo hace la RLS— sino lo que aprovecha el índice
 * `(org_id, date desc)`.
 */
export function useAttendance(orgId: string | undefined, date: string) {
  return useQuery({
    queryKey: ['asistencia', orgId, date],
    enabled: Boolean(orgId) && Boolean(date),
    queryFn: async (): Promise<Attendance[]> => {
      const { data, error } = await supabase
        .from('attendances')
        .select('*')
        .eq('org_id', orgId!)
        .eq('date', date);
      if (error) throw error;
      return (data ?? []) as Attendance[];
    },
  });
}
