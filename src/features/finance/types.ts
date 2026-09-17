/**
 * Tipos del módulo de finanzas y logística.
 *
 * Viven aquí y no en src/types/database.ts porque ese archivo es el provisional
 * escrito a mano que se reemplaza por la versión generada; mientras tanto, cada
 * módulo declara lo suyo.
 *
 * Todo el dinero es `number` de CENTAVOS, igual que en la base. Las cantidades
 * de inventario sí son decimales (medio kilo de magnesio existe).
 */

export type ExpenseKind = 'operational' | 'payroll' | 'capex' | 'tax';

export type Recurrence =
  | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export interface ExpenseCategory {
  id: string;
  org_id: string;
  name: string;
  kind: ExpenseKind;
  is_active: boolean;
}

export interface Supplier {
  id: string;
  org_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface Supply {
  id: string;
  org_id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  avg_unit_cost_cents: number | null;
  default_supplier_id: string | null;
  reorder_every_days: number | null;
  last_purchased_on: string | null;
  notes: string | null;
  is_active: boolean;
}

/** Insumo con el nombre de su proveedor habitual ya resuelto. */
export interface SupplyWithSupplier extends Supply {
  suppliers: { name: string } | null;
}

export interface Expense {
  id: string;
  org_id: string;
  category_id: string | null;
  supplier_id: string | null;
  description: string;
  amount_cents: number;
  incurred_on: string;
  paid_on: string | null;
  is_recurring: boolean;
  recurrence: Recurrence | null;
  next_due_on: string | null;
  receipt_url: string | null;
  notes: string | null;
  parent_expense_id: string | null;
}

/** Gasto con categoría y proveedor, tal como lo lista la página. */
export interface ExpenseRow extends Expense {
  expense_categories: { name: string; kind: ExpenseKind } | null;
  suppliers: { name: string } | null;
}

export interface SupplyPurchase {
  id: string;
  org_id: string;
  supply_id: string;
  supplier_id: string | null;
  purchased_on: string;
  quantity: number;
  total_cents: number;
  invoice_url: string | null;
  notes: string | null;
  expense_id: string | null;
}

export interface PurchaseRow extends SupplyPurchase {
  supplies: { name: string; unit: string } | null;
  suppliers: { name: string } | null;
}

// ----------------------------------------------------------------- funciones

/** Una fila de public.monthly_pnl(). `month` es el primer día del mes. */
export interface PnlMonth {
  month: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
}

/** Una fila de public.supplies_low_stock(). */
export interface LowStockRow {
  supply_id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  last_purchased_on: string | null;
  last_supplier: string | null;
  last_quantity: number | null;
  last_total_cents: number | null;
  last_unit_cost_cents: number | null;
  suggested_reorder_on: string | null;
}

/** Una fila de public.upcoming_commitments(). */
export interface Commitment {
  kind: 'expense' | 'supply';
  ref_id: string;
  label: string;
  category: string | null;
  supplier: string | null;
  due_on: string;
  amount_cents: number | null;
}

export interface Mrr {
  mrr_cents: number;
  active_subscriptions: number;
}

/** Una fila de public.monthly_membership_report(). */
export interface MembershipMonth {
  month: string;
  altas: number;
  bajas: number;
  activos_inicio: number;
  /** Fracción 0..1. null cuando el mes empezó sin nadie: no hay qué retener. */
  retencion: number | null;
}

/** Una fila de public.athlete_sources(). */
export interface AthleteSource {
  source: string;
  total: number;
  activos: number;
}
