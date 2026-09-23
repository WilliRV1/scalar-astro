import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { DefinicionCampo, ValoresCampos } from './types';

/**
 * Las definiciones de campos del box.
 *
 * Quién ve qué lo decide la RLS, no esta consulta: el staff ve todas las de su
 * box; el atleta solo las activas y no sensibles; nadie ve las de otro box.
 * Por eso aquí no hay ni un `if (rol === …)`: si esta consulta se equivocara,
 * el servidor igual no devolvería una fila de más.
 *
 * @param incluirInactivos true solo en la pantalla de configuración, donde el
 *        dueño tiene que poder ver y reactivar lo que desactivó.
 */
export function useCustomFieldDefs(orgId: string | undefined, incluirInactivos = false) {
  return useQuery({
    queryKey: ['custom-field-defs', orgId, incluirInactivos],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<DefinicionCampo[]> => {
      let q = supabase
        .from('custom_field_defs')
        .select('*')
        .eq('org_id', orgId!)
        .order('sort_order', { ascending: true })
        .order('key', { ascending: true });

      if (!incluirInactivos) q = q.eq('is_active', true);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DefinicionCampo[];
    },
  });
}

/**
 * Los valores SENSIBLES de un atleta, que viven en su propia tabla.
 *
 * Un coach sin `can_manage_athletes` recibe cero filas —no un error— porque así
 * funciona la RLS. La pantalla debe tratarlo como "no hay nada que mostrar",
 * que es justo lo que se quiere: ni siquiera se entera de que existen.
 */
export function useAthleteSensitiveCustom(
  orgId: string | undefined,
  athleteId: string | undefined,
) {
  return useQuery({
    queryKey: ['athlete-custom-sensitive', orgId, athleteId],
    enabled: Boolean(orgId && athleteId),
    queryFn: async (): Promise<ValoresCampos> => {
      const { data, error } = await supabase
        .from('athlete_custom_sensitive')
        .select('custom')
        .eq('org_id', orgId!)
        .eq('athlete_id', athleteId!)
        .maybeSingle();
      if (error) throw error;
      return ((data?.custom ?? {}) as ValoresCampos);
    },
  });
}
