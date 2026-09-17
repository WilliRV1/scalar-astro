import type { MembershipStatus, Permissions, Role } from '../../types/database';

/** Los roles que forman el equipo del box. El atleta no sale en esta pantalla. */
export type StaffRole = Extract<Role, 'owner' | 'admin' | 'coach'>;

/**
 * A quién se puede invitar por enlace.
 *
 * `owner` no está a propósito: la propiedad del box se transfiere promoviendo a
 * alguien que ya está adentro, no repartiendo enlaces. La base de datos lo
 * impone con un CHECK, esto es solo su espejo en el cliente.
 */
export type InvitationRole = Extract<Role, 'admin' | 'coach'>;

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/** Fila de `public.org_team()`: la membresía junto al correo de auth.users. */
export interface TeamMember {
  membership_id: string;
  user_id: string;
  email: string;
  /** Nombre del perfil de Supabase Auth. Casi siempre falta: se cae al correo. */
  display_name: string | null;
  role: StaffRole;
  permissions: Permissions;
  status: MembershipStatus;
  invited_at: string | null;
  joined_at: string;
}

export interface Invitation {
  id: string;
  org_id: string;
  email: string;
  role: InvitationRole;
  permissions: Permissions;
  token: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  status: InvitationStatus;
  created_at: string;
  updated_at: string;
}
