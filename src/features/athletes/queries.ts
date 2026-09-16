import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { Athlete } from '../../types/database';

/**
 * Nota sobre multi-tenancy: el `.eq('org_id', orgId)` NO es lo que aísla los
 * datos — eso lo hace la RLS. Está ahí para no traerse los atletas de los otros
 * boxes del usuario (un coach que trabaja en dos) y para que el índice
 * (org_id, status) haga su trabajo.
 */
export function useAthletes(orgId: string | undefined, search = '') {
  return useQuery({
    queryKey: ['athletes', orgId, search],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Athlete[]> => {
      let q = supabase
        .from('athletes')
        .select('*')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order('first_name', { ascending: true })
        .limit(500);

      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Athlete[];
    },
  });
}

export function useAthlete(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: ['athlete', athleteId],
    enabled: Boolean(athleteId),
    queryFn: async (): Promise<Athlete | null> => {
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .eq('id', athleteId!)
        .maybeSingle();
      if (error) throw error;
      return (data as Athlete) ?? null;
    },
  });
}

export function fullName(a: Pick<Athlete, 'first_name' | 'last_name'>): string {
  return [a.first_name, a.last_name].filter(Boolean).join(' ');
}
