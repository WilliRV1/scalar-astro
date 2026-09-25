import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { PagoScalar, SuscripcionScalar } from './types';

/**
 * La suscripción del box con Scalar. La RLS solo se la devuelve al dueño: para
 * un administrador o un coach llega vacía, y la pantalla lo dice.
 */
export function useSuscripcionScalar(orgId: string | undefined) {
  return useQuery({
    queryKey: ['suscripcion-scalar', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<SuscripcionScalar | null> => {
      const { data, error } = await supabase
        .from('platform_subscriptions')
        .select('*')
        .eq('org_id', orgId!)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SuscripcionScalar | null;
    },
  });
}

export function usePagosScalar(orgId: string | undefined) {
  return useQuery({
    queryKey: ['suscripcion-scalar', orgId, 'pagos'],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<PagoScalar[]> => {
      const { data, error } = await supabase
        .from('platform_payments')
        .select('id, amount_cents, method, paid_at, period_start, period_end, provider, status')
        .eq('org_id', orgId!)
        .order('paid_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as PagoScalar[];
    },
  });
}
