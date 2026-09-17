import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { Movement } from '../../types/database';
import type { AtletaExistente } from './parse';

/**
 * Los atletas que ya están en el box, con lo justo para cruzarlos contra el
 * archivo. Es la consulta que alimenta la detección de duplicados, así que trae
 * a todos (incluidos los retirados): si alguien vuelve, no se crea de nuevo.
 */
export function useAtletasExistentes(orgId: string | undefined) {
  return useQuery({
    queryKey: ['import-existentes', orgId],
    enabled: Boolean(orgId),
    staleTime: 60_000,
    queryFn: async (): Promise<AtletaExistente[]> => {
      const { data, error } = await supabase
        .from('athletes')
        .select('id, first_name, last_name, phone')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as AtletaExistente[];
    },
  });
}

/**
 * Catálogo de movimientos que tienen `legacy_key`: son exactamente los que el
 * importador sabe leer de una hoja de cálculo. Vienen el catálogo global y los
 * propios del box; si el box definió el suyo con la misma llave, manda el suyo.
 */
export function useMovimientosImportables(orgId: string | undefined) {
  return useQuery({
    queryKey: ['import-movimientos', orgId],
    enabled: Boolean(orgId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Movement[]> => {
      const { data, error } = await supabase
        .from('movements')
        .select('*')
        .not('legacy_key', 'is', null);
      if (error) throw error;
      return (data ?? []) as Movement[];
    },
  });
}
