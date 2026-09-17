import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { Invitation, TeamMember } from './types';

/**
 * El equipo del box con el correo de cada uno.
 *
 * Va por RPC y no por `from('memberships')` porque el correo vive en
 * `auth.users`, que no está expuesto por la API y que `authenticated` no puede
 * leer. `public.org_team()` es SECURITY DEFINER y comprueba en su cuerpo que
 * quien pregunta sea dueño o administrador DE ESE box; si no, levanta error.
 */
export function useTeam(orgId: string | undefined) {
  return useQuery({
    queryKey: ['team', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase.rpc('org_team', { p_org_id: orgId });
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
  });
}

/**
 * Invitaciones del box, la más reciente primero.
 *
 * Aquí viaja el `token`, que es el secreto del enlace. Lo protege la RLS: la
 * única política de la tabla es para owner/admin del box. Un coach que llame a
 * esta consulta recibe cero filas, no un error.
 */
export function useInvitations(orgId: string | undefined) {
  return useQuery({
    queryKey: ['invitations', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Invitation[]> => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Invitation[];
    },
  });
}
