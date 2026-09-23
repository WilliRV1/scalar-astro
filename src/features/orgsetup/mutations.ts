import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { AjustesBox, ClaveCredencial, EstadoPaso, Paso } from './types';
import type { DatosBox } from './esquema';
import type { Reservas } from './esquema';

/**
 * Escrituras de la configuración del box.
 *
 * Todas comprueban `error` y lo propagan. Un `await` sin `if (error) throw` es
 * una pérdida de datos esperando a ocurrir: el prototipo guardaba las marcas
 * en una tabla inexistente sin mirar el resultado y no se enteró en meses.
 *
 * Los mensajes de la base vienen redactados en español (la migración
 * 20260923100000 los escribe pensando en el dueño del box), así que se muestran
 * tal cual y no se tapan con un "algo salió mal".
 */

export function useGuardarDatosBox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { orgId: string; datos: DatosBox }) => {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: args.datos.name,
          city: args.datos.city,
          phone: args.datos.phone,
          tax_id: args.datos.tax_id,
          timezone: args.datos.timezone,
          brand_color: args.datos.brand_color,
          logo_url: args.datos.logo_url,
        })
        .eq('id', args.orgId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['box', v.orgId] }),
  });
}

/**
 * Guardar los ajustes de cobro.
 *
 * Se manda el objeto COMPLETO, no un parche: `settings` es una sola columna y
 * mandar la mitad dejaría la otra mitad en su valor por defecto. Quien llama ya
 * tiene el objeto entero porque lo leyó para pintar el formulario.
 */
export function useGuardarAjustesBox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { orgId: string; ajustes: AjustesBox }) => {
      const { error } = await supabase
        .from('organizations')
        .update({ settings: args.ajustes })
        .eq('id', args.orgId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['box', v.orgId] }),
  });
}

export function useGuardarAjustesReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { orgId: string; ajustes: Reservas }) => {
      const { error } = await supabase
        .from('reservation_settings')
        .upsert({ org_id: args.orgId, ...args.ajustes }, { onConflict: 'org_id' });
      if (error) throw error;
    },
    onSuccess: (_d, v) =>
      void qc.invalidateQueries({ queryKey: ['reservation-settings', v.orgId] }),
  });
}

/**
 * Guardar una credencial del box.
 *
 * Pasa por `set_org_credential()` y no por un `update` directo por dos razones,
 * y las dos importan:
 *
 *   1. La función separa el secreto de su ficha de estado. Un `update` desde
 *      aquí tendría que decidir dónde va cada cosa, y el día que se equivoque
 *      el secreto queda en la tabla que sí se puede leer.
 *   2. La función comprueba por dentro que quien llama sea dueño o
 *      administrador de ESE box, y no devuelve nunca el valor.
 */
export function useGuardarCredencial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      orgId: string;
      clave: ClaveCredencial;
      valor: string;
      ambiente: 'test' | 'prod';
    }) => {
      const { error } = await supabase.rpc('set_org_credential', {
        p_org_id: args.orgId,
        p_clave: args.clave,
        p_valor: args.valor,
        p_environment: args.ambiente,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['org-credentials', v.orgId] }),
  });
}

export function useBorrarCredencial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { orgId: string; clave: ClaveCredencial }) => {
      const { error } = await supabase.rpc('clear_org_credential', {
        p_org_id: args.orgId,
        p_clave: args.clave,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['org-credentials', v.orgId] }),
  });
}

/**
 * Marcar un paso del asistente.
 *
 * Una sola ida y vuelta: la función marca el paso, calcula el siguiente
 * pendiente y cierra el asistente si era el último. Hacerlo en tres consultas
 * desde el celular deja la puesta en marcha a medias si se cae la señal entre
 * la primera y la tercera.
 */
export function useMarcarPaso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { orgId: string; paso: Paso; estado?: EstadoPaso }) => {
      const { error } = await supabase.rpc('mark_onboarding_step', {
        p_org_id: args.orgId,
        p_step: args.paso,
        p_state: args.estado ?? 'done',
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['org-onboarding', v.orgId] });
      void qc.invalidateQueries({ queryKey: ['box', v.orgId] });
    },
  });
}

/**
 * Sacar un plan de la lista.
 *
 * Se desactiva, no se borra: un plan borrado se llevaría por delante el
 * historial de quien lo tuvo, y la cartera del año pasado dejaría de cuadrar.
 * Para el dueño el efecto es el mismo (desaparece de donde se elige plan), y se
 * lo decimos con esas palabras en la pantalla.
 */
export function useDesactivarPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { orgId: string; planId: string }) => {
      const { error } = await supabase
        .from('plans')
        .update({ is_active: false })
        .eq('id', args.planId)
        .eq('org_id', args.orgId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['plans', v.orgId] }),
  });
}

/** Subir el logo al bucket privado del box. La ruta empieza por el org_id: así lo aísla la RLS de Storage. */
export function useSubirLogo() {
  return useMutation({
    mutationFn: async (args: { orgId: string; archivo: File }): Promise<string> => {
      const ext = args.archivo.name.split('.').pop()?.toLowerCase() ?? 'png';
      const ruta = `${args.orgId}/logo-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from('avatars')
        .upload(ruta, args.archivo, { upsert: false });
      if (error) throw error;
      return ruta;
    },
  });
}
