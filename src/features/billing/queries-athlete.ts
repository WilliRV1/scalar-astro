import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { Invoice, Payment, Plan, Subscription } from '../../types/database';

export function usePlans(orgId: string | undefined) {
  return useQuery({
    queryKey: ['plans', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from('plans').select('*').eq('org_id', orgId!).order('price_cents');
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
}

export interface AthleteBilling {
  subscription: (Subscription & { plans: { name: string } | null }) | null;
  invoices: Invoice[];
  payments: Payment[];
}

/** Todo el estado de cobro de un atleta, para el panel del coach. */
export function useAthleteBilling(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: ['athlete-billing', athleteId],
    enabled: Boolean(athleteId),
    queryFn: async (): Promise<AthleteBilling> => {
      const [subRes, invRes, payRes] = await Promise.all([
        supabase.from('subscriptions').select('*, plans(name)')
          .eq('athlete_id', athleteId!).eq('status', 'active').maybeSingle(),
        supabase.from('invoices').select('*')
          .eq('athlete_id', athleteId!).order('issued_on', { ascending: false }).limit(12),
        supabase.from('payments').select('*')
          .eq('athlete_id', athleteId!).eq('status', 'confirmed')
          .order('paid_at', { ascending: false }).limit(12),
      ]);

      if (subRes.error) throw subRes.error;
      if (invRes.error) throw invRes.error;
      if (payRes.error) throw payRes.error;

      return {
        subscription: (subRes.data as AthleteBilling['subscription']) ?? null,
        invoices: (invRes.data ?? []) as Invoice[],
        payments: (payRes.data ?? []) as Payment[],
      };
    },
  });
}
