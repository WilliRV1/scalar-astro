import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type {
  AutorizacionDeDebito,
  CobroAutomatico,
  MetodoDePago,
  PreparacionDeAutorizacion,
} from './types';

/**
 * Estas consultas no filtran por box: la RLS devuelve únicamente las filas del
 * atleta autenticado. Si esta pantalla tuviera un bug y pidiera "todos los
 * métodos de pago", el servidor seguiría devolviendo solo el suyo.
 */

export interface DebitoDelAtleta {
  metodo: MetodoDePago | null;
  autorizacion: AutorizacionDeDebito | null;
}

/** El medio de pago activo y su autorización vigente. */
export function useMiDebito(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: ['mi-debito', athleteId],
    enabled: Boolean(athleteId),
    queryFn: async (): Promise<DebitoDelAtleta> => {
      const [metodoRes, autRes] = await Promise.all([
        supabase
          .from('payment_methods')
          .select('*')
          .eq('athlete_id', athleteId!)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('recurring_authorizations')
          .select('*')
          .eq('athlete_id', athleteId!)
          .is('revoked_at', null)
          .order('authorized_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (metodoRes.error) throw metodoRes.error;
      if (autRes.error) throw autRes.error;

      return {
        metodo: (metodoRes.data as MetodoDePago | null) ?? null,
        autorizacion: (autRes.data as AutorizacionDeDebito | null) ?? null,
      };
    },
  });
}

/** Los últimos cobros automáticos del atleta, para que vea qué pasó y por qué. */
export function useMisCobrosAutomaticos(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: ['mis-cobros-automaticos', athleteId],
    enabled: Boolean(athleteId),
    queryFn: async (): Promise<CobroAutomatico[]> => {
      const { data, error } = await supabase
        .from('recurring_charges')
        .select('*')
        .eq('athlete_id', athleteId!)
        .order('created_at', { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as CobroAutomatico[];
    },
  });
}

/**
 * El texto EXACTO que el atleta va a aceptar y los enlaces a las políticas de
 * la pasarela. Lo redacta el servidor a propósito: lo que se muestra y lo que
 * se guarda como evidencia tienen que ser lo mismo.
 */
export function usePreparacionDeAutorizacion(habilitado: boolean, athleteId?: string) {
  return useQuery({
    queryKey: ['preparar-autorizacion', athleteId ?? null],
    enabled: habilitado,
    // El token de aceptación de la pasarela caduca; no se cachea entre visitas.
    staleTime: 0,
    retry: false,
    queryFn: async (): Promise<PreparacionDeAutorizacion> => {
      const { data, error } = await supabase.functions.invoke<PreparacionDeAutorizacion>(
        'tokenize-payment-method',
        { body: { accion: 'preparar', ...(athleteId ? { athlete_id: athleteId } : {}) } },
      );
      if (error) throw error;
      if (!data) throw new Error('No se pudo preparar la autorización.');
      return data;
    },
  });
}
