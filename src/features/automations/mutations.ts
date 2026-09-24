import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { AjustesAutomatizacion } from './types';

/** Prender o apagar una regla. Es dato, no despliegue: efecto inmediato. */
export function useCambiarRegla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { orgId: string; ruleId: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('automation_rules')
        .update({ is_active: args.isActive })
        .eq('id', args.ruleId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No se encontró la regla o no tienes permiso para cambiarla.');
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['automation-rules', v.orgId] });
    },
  });
}

/**
 * Guardar el texto de una plantilla.
 *
 * Solo se pueden editar las plantillas PROPIAS del box (org_id = el suyo). Las
 * de fábrica son de todos y la RLS las protege; el box recibió su copia al
 * darse de alta, así que siempre hay una suya que tocar.
 */
export function useGuardarPlantilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      orgId: string;
      templateId: string;
      body: string;
      variables: string[];
    }) => {
      const { data, error } = await supabase
        .from('message_templates')
        .update({ body: args.body, variables: args.variables })
        .eq('id', args.templateId)
        .eq('org_id', args.orgId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No se encontró la plantilla del box o no tienes permiso para editarla.');
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['automation-rules', v.orgId] });
    },
  });
}

/**
 * Guardar los interruptores del box.
 *
 * `upsert` y no `update` porque un box dado de alta antes de esta migración
 * puede no tener fila todavía; la base responde con los valores por defecto
 * mientras tanto, pero para GUARDAR hace falta la fila.
 */
export function useGuardarAjustes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { orgId: string; cambios: Partial<AjustesAutomatizacion> }) => {
      const { error } = await supabase
        .from('automation_settings')
        .upsert({ org_id: args.orgId, ...args.cambios }, { onConflict: 'org_id' });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['automation-settings', v.orgId] });
    },
  });
}

/**
 * Cancelar a mano un mensaje encolado ("no le mandes eso a Juan").
 *
 * Solo tiene sentido sobre lo que todavía no salió. Un mensaje ya enviado no se
 * puede cancelar y la interfaz no debe ofrecerlo.
 */
export function useCancelarMensaje() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { orgId: string; messageId: string; motivo?: string }) => {
      const { data, error } = await supabase
        .from('message_outbox')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: args.motivo ?? 'Cancelado a mano desde el panel',
        })
        .eq('id', args.messageId)
        .eq('org_id', args.orgId)
        .in('status', ['queued', 'ready'])
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('El mensaje ya salió, no se puede cancelar.');
      }
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['message-outbox', v.orgId] });
    },
  });
}
