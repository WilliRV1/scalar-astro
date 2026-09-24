import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { PaymentMethod } from '../../types/database';

/** Asigna (o reemplaza) la suscripción activa de un atleta. */
export function useAssignSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      orgId: string;
      athleteId: string;
      planId: string;
      priceCents: number;
      discountCents?: number;
      billingDay: number;
    }) => {
      // Solo puede haber una activa por atleta (lo impone un índice único en la
      // base), así que la anterior se cancela antes de crear la nueva.
      const { error: cancelError } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled', cancel_reason: 'Cambio de plan' })
        .eq('athlete_id', args.athleteId)
        .eq('status', 'active');
      if (cancelError) throw cancelError;

      const { error } = await supabase.from('subscriptions').insert({
        org_id: args.orgId,
        athlete_id: args.athleteId,
        plan_id: args.planId,
        price_cents: args.priceCents,
        discount_cents: args.discountCents ?? 0,
        billing_day: args.billingDay,
        status: 'active',
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      // 'athlete-billing' es la que de verdad lee la ficha del atleta
      // (useAthleteBilling); sin invalidarla, el plan asignado no aparecía
      // hasta recargar la página a mano.
      void qc.invalidateQueries({ queryKey: ['athlete-billing', v.athleteId] });
      void qc.invalidateQueries({ queryKey: ['athletes', v.orgId] });
      void qc.invalidateQueries({ queryKey: ['cartera', v.orgId] });
    },
  });
}

/**
 * Registra un pago. El saldo y el estado de la factura los recalcula un trigger
 * en la base, no este código: así el resultado es el mismo venga el pago del
 * panel, de un webhook de la pasarela o de una importación.
 */
export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      orgId: string;
      athleteId: string;
      invoiceId: string | null;
      amountCents: number;
      method: PaymentMethod;
      reference?: string;
      receiptFile?: File | null;
    }) => {
      let receiptUrl: string | null = null;

      if (args.receiptFile) {
        // La ruta empieza por el org_id porque las políticas de Storage se
        // apoyan en eso para aislar los archivos entre boxes.
        const ext = args.receiptFile.name.split('.').pop() ?? 'jpg';
        const path = `${args.orgId}/${args.athleteId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('receipts')
          .upload(path, args.receiptFile, { upsert: false });
        if (upErr) throw upErr;
        receiptUrl = path;
      }

      const { error } = await supabase.from('payments').insert({
        org_id: args.orgId,
        athlete_id: args.athleteId,
        invoice_id: args.invoiceId,
        amount_cents: args.amountCents,
        method: args.method,
        reference: args.reference ?? null,
        receipt_url: receiptUrl,
        provider: 'manual',
        status: 'confirmed',
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['cartera', v.orgId] });
      void qc.invalidateQueries({ queryKey: ['my-invoices', v.athleteId] });
      void qc.invalidateQueries({ queryKey: ['my-payments', v.athleteId] });
      void qc.invalidateQueries({ queryKey: ['athlete-billing', v.athleteId] });
    },
  });
}

export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      orgId: string;
      planId?: string;
      name: string;
      priceCents: number;
      billingPeriod: string;
      classQuota: number | null;
    }) => {
      const row = {
        org_id: args.orgId,
        name: args.name,
        price_cents: args.priceCents,
        billing_period: args.billingPeriod,
        class_quota: args.classQuota,
      };
      const q = args.planId
        ? supabase.from('plans').update(row).eq('id', args.planId)
        : supabase.from('plans').insert(row);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['plans', v.orgId] }),
  });
}
