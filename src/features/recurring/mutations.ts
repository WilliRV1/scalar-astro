import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../shared/lib/supabase';
import type { InicioDeNequi, MetodoGuardado } from './types';

/**
 * Llama a una Edge Function y propaga SU mensaje, no uno genérico.
 *
 * Por defecto el SDK se queda con un "Edge Function returned a non-2xx status
 * code" y se pierde el texto en español que la función preparó para el usuario
 * ("Todavía no aparece aprobado en Nequi…"). Aquí se lee el cuerpo del error,
 * que es justo lo que hay que mostrarle a la persona.
 */
export async function invocar<T>(nombre: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(nombre, { body });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const cuerpo = (await error.context.json()) as { mensaje?: string; codigo?: string };
        if (cuerpo?.mensaje) throw new Error(cuerpo.mensaje);
      } catch (causa) {
        if (causa instanceof Error && causa.message) throw causa;
      }
    }
    throw error;
  }
  if (!data) throw new Error('La pasarela no respondió.');
  return data;
}

/**
 * Paso 1: tokenizar la cuenta Nequi.
 * El token nace pendiente: el atleta tiene que aceptar la suscripción en SU app
 * de Nequi. Por eso hay un paso 2 y no se da por hecho que quedó.
 */
export function useIniciarNequi() {
  return useMutation({
    mutationFn: (args: { telefono: string; athleteId?: string }) =>
      invocar<InicioDeNequi>('tokenize-payment-method', {
        accion: 'nequi_iniciar',
        phone: args.telefono,
        ...(args.athleteId ? { athlete_id: args.athleteId } : {}),
      }),
  });
}

/** Paso 2: confirmar que Nequi aprobó y guardar método + autorización. */
export function useConfirmarNequi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      token: string;
      telefono: string;
      version: string;
      topeCents?: number | null;
      athleteId?: string;
    }) =>
      invocar<MetodoGuardado>('tokenize-payment-method', {
        accion: 'nequi_confirmar',
        token: args.token,
        phone: args.telefono,
        acepto: true,
        version: args.version,
        ...(args.topeCents ? { tope_cents: args.topeCents } : {}),
        ...(args.athleteId ? { athlete_id: args.athleteId } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mi-debito'] });
      void qc.invalidateQueries({ queryKey: ['mis-cobros-automaticos'] });
    },
  });
}

/**
 * Revocar. Es UNA escritura sobre la fila del propio atleta: la RLS le deja
 * tocar la suya y solo la suya, y un trigger en la base desactiva el medio de
 * pago y cancela los cobros encolados EN EL ACTO. El atleta no tiene que
 * escribirle a nadie.
 */
export function useRevocarAutorizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { autorizacionId: string; motivo?: string }) => {
      const { error } = await supabase
        .from('recurring_authorizations')
        .update({
          revoked_at: new Date().toISOString(),
          revoke_reason: args.motivo ?? 'El atleta revocó el débito automático desde la app',
        })
        .eq('id', args.autorizacionId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mi-debito'] });
      void qc.invalidateQueries({ queryKey: ['mis-cobros-automaticos'] });
    },
  });
}

/**
 * Pagar a mano una factura que el débito no pudo cobrar. Reutiliza el enlace de
 * pago que ya existe (`create-payment-link`): no se duplica nada de eso aquí.
 */
export function usePagarAMano() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const respuesta = await invocar<{ checkout_url: string }>('create-payment-link', {
        invoice_id: invoiceId,
      });
      return respuesta.checkout_url;
    },
  });
}
