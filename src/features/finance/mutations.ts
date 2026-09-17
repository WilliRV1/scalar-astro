import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { Recurrence } from './types';

/**
 * Escrituras del módulo.
 *
 * Dos cosas NO se hacen aquí a propósito, porque viven en la base:
 *  · una compra de insumo no crea el gasto ni suma el stock desde el cliente:
 *    lo hace un trigger, así vale igual si la compra entra por una importación;
 *  · pagar un gasto recurrente no calcula el próximo vencimiento aquí: lo
 *    avanza public.register_expense_payment().
 */

/** Sube la foto de la factura al bucket privado y devuelve su ruta. */
async function subirFactura(orgId: string, archivo: File): Promise<string> {
  // La ruta empieza por el org_id porque las políticas de Storage se apoyan en
  // eso para aislar los archivos entre boxes.
  const ext = archivo.name.split('.').pop() ?? 'jpg';
  const ruta = `${orgId}/gastos/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('receipts').upload(ruta, archivo, { upsert: false });
  if (error) throw error;
  return ruta;
}

export interface GuardarGasto {
  orgId: string;
  expenseId?: string;
  categoryId: string | null;
  supplierId: string | null;
  description: string;
  amountCents: number;
  incurredOn: string;
  paidOn: string | null;
  isRecurring: boolean;
  recurrence: Recurrence | null;
  nextDueOn: string | null;
  receiptFile?: File | null;
}

export function useSaveExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: GuardarGasto) => {
      const receiptUrl = args.receiptFile ? await subirFactura(args.orgId, args.receiptFile) : null;

      const fila = {
        org_id: args.orgId,
        category_id: args.categoryId,
        supplier_id: args.supplierId,
        description: args.description,
        amount_cents: args.amountCents,
        incurred_on: args.incurredOn,
        paid_on: args.paidOn,
        is_recurring: args.isRecurring,
        recurrence: args.isRecurring ? args.recurrence : null,
        next_due_on: args.isRecurring ? args.nextDueOn : null,
        ...(receiptUrl ? { receipt_url: receiptUrl } : {}),
      };

      const { error } = args.expenseId
        ? await supabase.from('expenses').update(fila).eq('id', args.expenseId)
        : await supabase.from('expenses').insert(fila);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gastos'] });
      void qc.invalidateQueries({ queryKey: ['gastos-recurrentes'] });
      void qc.invalidateQueries({ queryKey: ['compromisos'] });
      void qc.invalidateQueries({ queryKey: ['pnl'] });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gastos'] });
      void qc.invalidateQueries({ queryKey: ['gastos-recurrentes'] });
      void qc.invalidateQueries({ queryKey: ['compromisos'] });
      void qc.invalidateQueries({ queryKey: ['pnl'] });
    },
  });
}

/** Marca pagado el periodo de un gasto. La base avanza el próximo vencimiento. */
export function usePayExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { expenseId: string; paidOn: string }) => {
      const { error } = await supabase.rpc('register_expense_payment', {
        p_expense_id: args.expenseId,
        p_paid_on: args.paidOn,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gastos'] });
      void qc.invalidateQueries({ queryKey: ['gastos-recurrentes'] });
      void qc.invalidateQueries({ queryKey: ['compromisos'] });
      void qc.invalidateQueries({ queryKey: ['pnl'] });
    },
  });
}

export interface GuardarInsumo {
  orgId: string;
  supplyId?: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  defaultSupplierId: string | null;
  reorderEveryDays: number | null;
}

export function useSaveSupply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: GuardarInsumo) => {
      const fila = {
        org_id: args.orgId,
        name: args.name,
        unit: args.unit,
        current_stock: args.currentStock,
        min_stock: args.minStock,
        default_supplier_id: args.defaultSupplierId,
        reorder_every_days: args.reorderEveryDays,
      };
      const { error } = args.supplyId
        ? await supabase.from('supplies').update(fila).eq('id', args.supplyId)
        : await supabase.from('supplies').insert(fila);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['insumos'] });
      void qc.invalidateQueries({ queryKey: ['insumos-bajo-minimo'] });
    },
  });
}

export function useSaveSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { orgId: string; name: string; phone: string | null }) => {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({ org_id: args.orgId, name: args.name, phone: args.phone })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['proveedores'] });
    },
  });
}

export interface RegistrarCompra {
  orgId: string;
  supplyId: string;
  supplierId: string | null;
  purchasedOn: string;
  quantity: number;
  totalCents: number;
  invoiceFile?: File | null;
  notes?: string;
}

/**
 * Registra una compra de insumo. El gasto y el movimiento de stock los hace el
 * trigger `supply_purchases_sync_stock` en la base: aquí no se tocan.
 */
export function useRegisterPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: RegistrarCompra) => {
      const invoiceUrl = args.invoiceFile ? await subirFactura(args.orgId, args.invoiceFile) : null;

      const { error } = await supabase.from('supply_purchases').insert({
        org_id: args.orgId,
        supply_id: args.supplyId,
        supplier_id: args.supplierId,
        purchased_on: args.purchasedOn,
        quantity: args.quantity,
        total_cents: args.totalCents,
        invoice_url: invoiceUrl,
        notes: args.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['insumos'] });
      void qc.invalidateQueries({ queryKey: ['insumos-bajo-minimo'] });
      void qc.invalidateQueries({ queryKey: ['compras-insumo'] });
      void qc.invalidateQueries({ queryKey: ['gastos'] });
      void qc.invalidateQueries({ queryKey: ['pnl'] });
    },
  });
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (purchaseId: string) => {
      // Borrar la compra revierte el gasto y el stock: también lo hace el trigger.
      const { error } = await supabase.from('supply_purchases').delete().eq('id', purchaseId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['insumos'] });
      void qc.invalidateQueries({ queryKey: ['insumos-bajo-minimo'] });
      void qc.invalidateQueries({ queryKey: ['compras-insumo'] });
      void qc.invalidateQueries({ queryKey: ['gastos'] });
      void qc.invalidateQueries({ queryKey: ['pnl'] });
    },
  });
}
