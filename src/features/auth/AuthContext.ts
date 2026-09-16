import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { MembershipWithOrg, Permissions, Role } from '../../types/database';

export interface AuthState {
  /** null mientras carga; después, la sesión o undefined si no hay. */
  session: Session | null;
  loading: boolean;
  /** Todos los boxes a los que pertenece el usuario. */
  memberships: MembershipWithOrg[];
  /** El box activo: el del subdominio si coincide, si no el primero. */
  activeMembership: MembershipWithOrg | null;
  error: string | null;
  setActiveOrg: (orgId: string) => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

/** Rol efectivo dentro del box activo. */
export function roleOf(m: MembershipWithOrg | null): Role | null {
  return m?.role ?? null;
}

export function isStaff(m: MembershipWithOrg | null): boolean {
  return m != null && (m.role === 'owner' || m.role === 'admin' || m.role === 'coach');
}

/**
 * Espejo exacto de public.can_view_finances() en la base de datos.
 *
 * Ojo: esto es solo para decidir qué se pinta. La verdad la impone la RLS;
 * si esta función se equivocara, el servidor igual no devolvería los datos.
 */
export function canViewFinances(m: MembershipWithOrg | null): boolean {
  if (!m) return false;
  if (m.role === 'owner' || m.role === 'admin') return true;
  return m.role === 'coach' && (m.permissions as Permissions)?.can_view_finances === true;
}
