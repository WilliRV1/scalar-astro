import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { MembershipStatus, Permissions } from '../../types/database';
import type { Invitation, InvitationRole, StaffRole } from './types';

interface InvitarArgs {
  orgId: string;
  email: string;
  role: InvitationRole;
  permissions: Permissions;
}

/**
 * Crea la invitación y devuelve la fila COMPLETA, con el token: es lo que la
 * pantalla convierte en enlace para mandar por WhatsApp. El `invited_by` y el
 * token los pone la base de datos, no el cliente.
 */
export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, email, role, permissions }: InvitarArgs): Promise<Invitation> => {
      const { data, error } = await supabase
        .from('invitations')
        .insert({
          org_id: orgId,
          email: email.trim().toLowerCase(),
          role,
          permissions,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Invitation;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['invitations', vars.orgId] });
    },
  });
}

/**
 * Cancelar una invitación no la borra: queda el rastro de a quién se invitó y
 * quién se arrepintió. El enlace deja de servir en el acto.
 */
export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invitationId }: { orgId: string; invitationId: string }) => {
      const { error } = await supabase
        .from('invitations')
        .update({ status: 'revoked' })
        .eq('id', invitationId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['invitations', vars.orgId] });
    },
  });
}

interface CambiarArgs {
  orgId: string;
  membershipId: string;
  role: StaffRole;
  permissions: Permissions;
}

/**
 * Cambia rol y permisos de alguien que ya está en el equipo.
 *
 * Si es el último dueño del box, el trigger `memberships_protege_ultimo_owner`
 * levanta una excepción y el mensaje llega tal cual al usuario. Eso es
 * deliberado: el error del servidor explica el problema mejor que cualquier
 * texto genérico que pongamos aquí.
 */
export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ membershipId, role, permissions }: CambiarArgs) => {
      const { error } = await supabase
        .from('memberships')
        .update({ role, permissions })
        .eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['team', vars.orgId] });
    },
  });
}

/**
 * Desactivar en vez de borrar. Un coach que se va deja atrás WODs que programó
 * y notas que escribió; si se borra la membresía, ese historial queda huérfano.
 * Y si vuelve —que pasa— se reactiva con un clic.
 */
export function useSetMemberStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      membershipId,
      status,
    }: {
      orgId: string;
      membershipId: string;
      status: MembershipStatus;
    }) => {
      const { error } = await supabase
        .from('memberships')
        .update({ status })
        .eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['team', vars.orgId] });
    },
  });
}
