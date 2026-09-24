import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { Invoice, Payment } from '../../types/database';

/**
 * Tope de cobros abiertos que se traen. Los totales se suman en el cliente,
 * así que si llegan exactamente este número el tablero avisa que puede haber más.
 */
export const LIMITE_CARTERA = 200;

export interface CarteraRow extends Invoice {
  athletes: { first_name: string; last_name: string | null; phone: string | null } | null;
}

/**
 * Cartera: quién debe y desde cuándo, ordenado por antigüedad de la deuda.
 * Se ordena por `due_on` ascendente a propósito: lo más viejo primero es lo que
 * hay que perseguir, no lo más reciente.
 *
 * Si el usuario es un coach sin permiso financiero, la RLS devuelve 0 filas.
 */
export function useCartera(orgId: string | undefined) {
  return useQuery({
    queryKey: ['cartera', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<CarteraRow[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, athletes(first_name, last_name, phone)')
        .eq('org_id', orgId!)
        .in('status', ['open', 'partial', 'overdue'])
        .order('due_on', { ascending: true })
        .limit(LIMITE_CARTERA);
      if (error) throw error;
      return (data ?? []) as unknown as CarteraRow[];
    },
  });
}

/** Cobros y pagos del atleta autenticado. */
export function useMyInvoices(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: ['my-invoices', athleteId],
    enabled: Boolean(athleteId),
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('athlete_id', athleteId!)
        .order('issued_on', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });
}

export function useMyPayments(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: ['my-payments', athleteId],
    enabled: Boolean(athleteId),
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('athlete_id', athleteId!)
        .eq('status', 'confirmed')
        .order('paid_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
  });
}

/** Recaudo del mes en curso, para el tablero del dueño. */
export function useMonthlyCollected(orgId: string | undefined) {
  return useQuery({
    queryKey: ['recaudo-mes', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<{ cents: number; count: number }> => {
      const inicio = new Date();
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('payments')
        .select('amount_cents')
        .eq('org_id', orgId!)
        .eq('status', 'confirmed')
        .gte('paid_at', inicio.toISOString());
      if (error) throw error;

      const filas = (data ?? []) as { amount_cents: number }[];
      return {
        cents: filas.reduce((acc, p) => acc + p.amount_cents, 0),
        count: filas.length,
      };
    },
  });
}
