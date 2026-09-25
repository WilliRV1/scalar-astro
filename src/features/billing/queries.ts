import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { Invoice, Payment } from '../../types/database';
import { resumirTramos, type CarteraTotales, type TramoCartera } from './totales';

/**
 * Tope de cobros abiertos que se traen para la LISTA. Los totales no dependen
 * de él: los calcula la base con `cartera_totales`, sobre todas las filas.
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

/**
 * Totales de la cartera, calculados por la base sobre todos los cobros abiertos.
 *
 * Cuelga de la misma raíz que la lista (`['cartera', orgId]`): registrar un
 * pago invalida esa raíz y refresca las dos cosas a la vez.
 */
export function useCarteraTotales(orgId: string | undefined) {
  return useQuery({
    queryKey: ['cartera', orgId, 'totales'],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<CarteraTotales> => {
      const { data, error } = await supabase.rpc('cartera_totales', { p_org_id: orgId! });
      if (error) throw error;
      return resumirTramos((data ?? []) as TramoCartera[]);
    },
  });
}

/** Recaudo del mes en curso, en la zona horaria del box (lo calcula la base). */
export function useMonthlyCollected(orgId: string | undefined) {
  return useQuery({
    queryKey: ['cartera', orgId, 'recaudo'],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<{ cents: number; count: number }> => {
      const { data, error } = await supabase.rpc('recaudo_mes', { p_org_id: orgId! });
      if (error) throw error;
      const fila = ((data ?? []) as { cents: number; pagos: number }[])[0];
      return { cents: fila?.cents ?? 0, count: fila?.pagos ?? 0 };
    },
  });
}
