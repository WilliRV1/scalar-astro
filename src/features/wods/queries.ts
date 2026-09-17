import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { LeaderboardRow, Result, Wod, WodBlock, WodWithBlocks } from './types';

/**
 * Nota sobre multi-tenancy, igual que en athletes/queries.ts: el
 * `.eq('org_id', orgId)` NO es lo que aísla los datos — eso lo hace la RLS.
 * Está ahí para no traerse los WOD de los otros boxes del usuario y para que
 * los índices `(org_id, …)` hagan su trabajo.
 *
 * Y lo mismo con `published_at`: la pantalla del atleta no filtra por publicado.
 * No hace falta: la política de `wods` no le devuelve borradores aunque los pida.
 */

/** Los WOD de un rango de fechas. Alimenta el calendario semanal del coach. */
export function useWodsInRange(orgId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ['wods', orgId, from, to],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Wod[]> => {
      const { data, error } = await supabase
        .from('wods')
        .select('*')
        .eq('org_id', orgId!)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Wod[];
    },
  });
}

/**
 * El WOD de un día con sus bloques, en una sola ida al servidor.
 *
 * Dos consultas separadas (WOD y luego bloques) serían un N+1 disfrazado y, en
 * el celular del coach con datos móviles, se nota.
 */
export function useWodByDate(orgId: string | undefined, date: string) {
  return useQuery({
    queryKey: ['wod', orgId, date],
    enabled: Boolean(orgId) && Boolean(date),
    queryFn: async (): Promise<WodWithBlocks | null> => {
      const { data, error } = await supabase
        .from('wods')
        .select('*, wod_blocks(*)')
        .eq('org_id', orgId!)
        .eq('date', date)
        // Un box puede programar dos sesiones el mismo día ("WOD" y "Open Gym").
        // La pantalla del día trabaja sobre la primera que se creó.
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const { wod_blocks, ...wod } = data as Wod & { wod_blocks: WodBlock[] };
      return {
        ...wod,
        blocks: [...(wod_blocks ?? [])].sort((a, b) => a.position - b.position),
      };
    },
  });
}

/**
 * El leaderboard del día, ya ordenado por la base.
 *
 * Se llama por RPC y no con un `select` porque el nombre del atleta no está al
 * alcance de sus compañeros: la política de `athletes` solo le deja a cada uno
 * leerse a sí mismo. `public.leaderboard()` es la ventana estrecha que expone
 * id, nombre y score, y nada más.
 */
export function useLeaderboard(wodId: string | null | undefined) {
  return useQuery({
    queryKey: ['leaderboard', wodId],
    enabled: Boolean(wodId),
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase.rpc('leaderboard', { p_wod_id: wodId! });
      if (error) throw error;
      return (data ?? []) as LeaderboardRow[];
    },
  });
}

/** Los resultados propios del atleta en un WOD, para precargar el formulario. */
export function useMyResults(athleteId: string | null | undefined, blockIds: string[]) {
  const clave = [...blockIds].sort().join(',');
  return useQuery({
    queryKey: ['mis-resultados', athleteId, clave],
    enabled: Boolean(athleteId) && blockIds.length > 0,
    queryFn: async (): Promise<Result[]> => {
      const { data, error } = await supabase
        .from('results')
        .select('*')
        .eq('athlete_id', athleteId!)
        .in('wod_block_id', blockIds);
      if (error) throw error;
      return (data ?? []) as Result[];
    },
  });
}
