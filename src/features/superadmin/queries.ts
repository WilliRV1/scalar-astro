import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { BoxDePlataforma, DetalleDeBox, MetricasDePlataforma } from './types';

/**
 * Consultas del panel de plataforma.
 *
 * TODAS van por RPC y ninguna por `from('organizations')`. No es un capricho:
 * el superadministrador NO tiene acceso por RLS a los datos de los boxes, a
 * propósito (ver la cabecera de la migración 20260918150000_saas.sql). Si
 * alguien intenta `supabase.from('athletes').select('*')` desde aquí, recibe
 * cero filas, que es exactamente lo que debe pasar.
 */

/** ¿El usuario de esta sesión es del equipo de Scalar? */
export function useEsSuperadmin(userId: string | undefined) {
  return useQuery({
    queryKey: ['superadmin', userId],
    enabled: Boolean(userId),
    // La respuesta casi nunca cambia y decide si se pinta el panel entero.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      // La única política de `platform_admins` deja ver la propia fila. Si no
      // es superadmin, la consulta no falla: devuelve vacío.
      const { data, error } = await supabase
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data != null;
    },
  });
}

export function useMetricasDePlataforma(habilitado: boolean) {
  return useQuery({
    queryKey: ['plataforma', 'metricas'],
    enabled: habilitado,
    queryFn: async (): Promise<MetricasDePlataforma> => {
      const { data, error } = await supabase.rpc('platform_metrics');
      if (error) throw error;
      // La función devuelve una tabla de una sola fila.
      const filas = (data ?? []) as unknown as MetricasDePlataforma[];
      return (
        filas[0] ?? {
          boxes_totales: 0,
          boxes_activos: 0,
          boxes_en_prueba: 0,
          boxes_en_mora: 0,
          boxes_suspendidos: 0,
          mrr_cents: 0,
          atletas_totales: 0,
          mensajes_enviados: 0,
        }
      );
    },
  });
}

export function useBoxesDePlataforma(habilitado: boolean) {
  return useQuery({
    queryKey: ['plataforma', 'boxes'],
    enabled: habilitado,
    queryFn: async (): Promise<BoxDePlataforma[]> => {
      const { data, error } = await supabase.rpc('platform_boxes');
      if (error) throw error;
      return (data ?? []) as unknown as BoxDePlataforma[];
    },
  });
}

/**
 * Cifras agregadas de un box. Exige una sesión de soporte abierta: sin motivo
 * escrito, el servidor responde con error y aquí se ve el error tal cual.
 */
export function useDetalleDeBox(orgId: string | undefined) {
  return useQuery({
    queryKey: ['plataforma', 'detalle', orgId],
    enabled: Boolean(orgId),
    retry: false,
    queryFn: async (): Promise<DetalleDeBox | null> => {
      const { data, error } = await supabase.rpc('platform_org_detail', { p_org_id: orgId });
      if (error) throw error;
      const filas = (data ?? []) as unknown as DetalleDeBox[];
      return filas[0] ?? null;
    },
  });
}
