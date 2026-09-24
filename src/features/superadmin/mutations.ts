import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { AltaDeBox, SesionDeSoporte, TramoDePlan } from './types';

/**
 * Acciones del panel de plataforma. Todas son RPC a funciones SECURITY DEFINER
 * que comprueban en su cuerpo que quien llama sea del equipo de Scalar. Lo que
 * se valida aquí es para dar buenos mensajes, no para autorizar: la autorización
 * está en la base de datos y no se puede saltar desde el navegador.
 */

export interface ArgsAltaDeBox {
  slug: string;
  nombre: string;
  correoDelDueno: string;
  plan: TramoDePlan;
  ciudad?: string;
  telefono?: string;
  esFundador: boolean;
}

export function useCrearBox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: ArgsAltaDeBox): Promise<AltaDeBox> => {
      const { data, error } = await supabase.rpc('create_organization', {
        p_slug: a.slug.trim().toLowerCase(),
        p_name: a.nombre.trim(),
        p_owner_email: a.correoDelDueno.trim().toLowerCase(),
        p_plan_tier: a.plan,
        p_city: a.ciudad?.trim() || null,
        p_phone: a.telefono?.trim() || null,
        p_is_founder: a.esFundador,
      });
      if (error) throw error;
      const filas = (data ?? []) as unknown as AltaDeBox[];
      if (!filas[0]) {
        throw new Error('El box no se creó: la base no devolvió ningún registro. Revisa si ya existe ese dominio.');
      }
      return filas[0];
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plataforma'] });
    },
  });
}

export function useSuspenderBox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, motivo }: { orgId: string; motivo: string }) => {
      const { error } = await supabase.rpc('suspend_org_for_nonpayment', {
        p_org_id: orgId,
        p_reason: motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plataforma'] });
    },
  });
}

export function useReactivarBox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, motivo }: { orgId: string; motivo: string }) => {
      const { error } = await supabase.rpc('reactivate_org', {
        p_org_id: orgId,
        p_reason: motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plataforma'] });
    },
  });
}

/**
 * Abre una sesión de soporte sobre un box. El motivo es obligatorio y queda en
 * `audit_log`, donde lo puede leer el dueño del box. Eso es intencional: la
 * confianza del cliente se sostiene en que lo que hacemos adentro se puede ver.
 */
export function useSuplantar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orgId,
      motivo,
    }: {
      orgId: string;
      motivo: string;
    }): Promise<SesionDeSoporte> => {
      const { data, error } = await supabase.rpc('impersonate', {
        p_org_id: orgId,
        p_reason: motivo.trim(),
      });
      if (error) throw error;
      return data as unknown as SesionDeSoporte;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['plataforma', 'detalle', vars.orgId] });
    },
  });
}

export function useCerrarSuplantacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sesionId }: { sesionId: string; orgId: string }) => {
      const { error } = await supabase.rpc('end_impersonation', { p_id: sesionId });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['plataforma', 'detalle', vars.orgId] });
    },
  });
}
