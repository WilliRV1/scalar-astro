import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import { monthRange } from './pnl';
import type {
  AthleteSource, CategoryTotal, Commitment, ExpenseCategory, ExpenseRow, ExpenseTotals,
  LowStockRow, MembershipMonth, Mrr, PnlMonth, PurchaseRow, Supplier, SupplyWithSupplier,
} from './types';

/**
 * Lecturas del módulo de finanzas.
 *
 * Ninguna comprueba permisos: eso lo hace la RLS. Si quien consulta es un coach
 * sin `can_view_finances`, la base devuelve cero filas y la página muestra su
 * estado vacío. No hay una segunda copia de la regla de acceso en el cliente,
 * que es como se terminan escapando los datos.
 */

/**
 * Tope de gastos que se traen por mes para la LISTA. Los totales no dependen
 * de él: los calcula la base con `gastos_totales`, sobre todas las filas.
 */
export const LIMITE_GASTOS = 300;

const SIN_GASTOS: ExpenseTotals = { total_cents: 0, gastos: 0, sin_pagar_cents: 0, sin_pagar: 0 };

/**
 * Totales del mes, calculados por la base. Cuelgan de la raíz `['gastos']`,
 * que es la que invalidan todas las mutaciones de gastos y compras.
 */
export function useExpenseTotals(orgId: string | undefined, desde: string, hasta: string) {
  return useQuery({
    queryKey: ['gastos', orgId, desde, hasta, 'totales'],
    enabled: Boolean(orgId),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ExpenseTotals> => {
      const { data, error } = await supabase.rpc('gastos_totales', {
        p_org_id: orgId!, p_desde: desde, p_hasta: hasta,
      });
      if (error) throw error;
      return ((data ?? []) as ExpenseTotals[])[0] ?? SIN_GASTOS;
    },
  });
}

export function useExpensesByCategory(orgId: string | undefined, desde: string, hasta: string) {
  return useQuery({
    queryKey: ['gastos', orgId, desde, hasta, 'categorias'],
    enabled: Boolean(orgId),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CategoryTotal[]> => {
      const { data, error } = await supabase.rpc('gastos_por_categoria', {
        p_org_id: orgId!, p_desde: desde, p_hasta: hasta,
      });
      if (error) throw error;
      return (data ?? []) as CategoryTotal[];
    },
  });
}

export function useExpenses(orgId: string | undefined, desde: string, hasta: string) {
  return useQuery({
    queryKey: ['gastos', orgId, desde, hasta],
    enabled: Boolean(orgId),
    // Al cambiar de mes se conserva el anterior en pantalla en vez de un spinner.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ExpenseRow[]> => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, expense_categories(name, kind), suppliers(name)')
        .eq('org_id', orgId!)
        .eq('is_recurring', false)
        .gte('incurred_on', desde)
        .lte('incurred_on', hasta)
        .order('incurred_on', { ascending: false })
        .limit(LIMITE_GASTOS);
      if (error) throw error;
      return (data ?? []) as unknown as ExpenseRow[];
    },
  });
}

/** Los compromisos recurrentes: arriendo, seguro, mantenimiento. */
export function useRecurringExpenses(orgId: string | undefined) {
  return useQuery({
    queryKey: ['gastos-recurrentes', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ExpenseRow[]> => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, expense_categories(name, kind), suppliers(name)')
        .eq('org_id', orgId!)
        .eq('is_recurring', true)
        .order('next_due_on', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ExpenseRow[];
    },
  });
}

export function useExpenseCategories(orgId: string | undefined) {
  return useQuery({
    queryKey: ['categorias-gasto', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ExpenseCategory[]> => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('org_id', orgId!)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ExpenseCategory[];
    },
  });
}

export function useSuppliers(orgId: string | undefined) {
  return useQuery({
    queryKey: ['proveedores', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('org_id', orgId!)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });
}

export function useSupplies(orgId: string | undefined) {
  return useQuery({
    queryKey: ['insumos', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<SupplyWithSupplier[]> => {
      const { data, error } = await supabase
        .from('supplies')
        .select('*, suppliers:default_supplier_id(name)')
        .eq('org_id', orgId!)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as SupplyWithSupplier[];
    },
  });
}

/** Insumos en o por debajo del mínimo, con la última compra. */
export function useLowStock(orgId: string | undefined) {
  return useQuery({
    queryKey: ['insumos-bajo-minimo', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<LowStockRow[]> => {
      const { data, error } = await supabase.rpc('supplies_low_stock', { p_org_id: orgId! });
      if (error) throw error;
      return (data ?? []) as LowStockRow[];
    },
  });
}

export function usePurchases(orgId: string | undefined, supplyId?: string) {
  return useQuery({
    queryKey: ['compras-insumo', orgId, supplyId ?? 'todas'],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<PurchaseRow[]> => {
      let q = supabase
        .from('supply_purchases')
        .select('*, supplies(name, unit), suppliers(name)')
        .eq('org_id', orgId!)
        .order('purchased_on', { ascending: false })
        .limit(100);
      if (supplyId) q = q.eq('supply_id', supplyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PurchaseRow[];
    },
  });
}

/** P&L de los últimos `meses` meses, ya agrupado por la base. */
export function useMonthlyPnl(orgId: string | undefined, meses = 6) {
  const { desde, hasta } = monthRange(meses);
  return useQuery({
    queryKey: ['pnl', orgId, desde, hasta],
    enabled: Boolean(orgId),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PnlMonth[]> => {
      const { data, error } = await supabase.rpc('monthly_pnl', {
        p_org_id: orgId!, p_desde: desde, p_hasta: hasta,
      });
      if (error) throw error;
      return (data ?? []) as PnlMonth[];
    },
  });
}

export function useCommitments(orgId: string | undefined, desde: string, hasta: string) {
  return useQuery({
    queryKey: ['compromisos', orgId, desde, hasta],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Commitment[]> => {
      const { data, error } = await supabase.rpc('upcoming_commitments', {
        p_org_id: orgId!, p_desde: desde, p_hasta: hasta,
      });
      if (error) throw error;
      return (data ?? []) as Commitment[];
    },
  });
}

export function useMrr(orgId: string | undefined) {
  return useQuery({
    queryKey: ['mrr', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Mrr> => {
      const { data, error } = await supabase.rpc('org_mrr', { p_org_id: orgId! });
      if (error) throw error;
      const filas = (data ?? []) as Mrr[];
      return filas[0] ?? { mrr_cents: 0, active_subscriptions: 0 };
    },
  });
}

export function useMembershipReport(orgId: string | undefined, meses = 6) {
  const { desde, hasta } = monthRange(meses);
  return useQuery({
    queryKey: ['reporte-membresias', orgId, desde, hasta],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<MembershipMonth[]> => {
      const { data, error } = await supabase.rpc('monthly_membership_report', {
        p_org_id: orgId!, p_desde: desde, p_hasta: hasta,
      });
      if (error) throw error;
      return (data ?? []) as MembershipMonth[];
    },
  });
}

export function useAthleteSources(orgId: string | undefined) {
  return useQuery({
    queryKey: ['origen-atletas', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<AthleteSource[]> => {
      const { data, error } = await supabase.rpc('athlete_sources', { p_org_id: orgId! });
      if (error) throw error;
      return (data ?? []) as AthleteSource[];
    },
  });
}
