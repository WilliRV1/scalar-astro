import type { MembershipWithOrg, Permissions } from '../../types/database';
import type { InvitationRole, InvitationStatus, StaffRole } from './types';

/**
 * Quién puede abrir esta pantalla. Espejo en el cliente de
 * `private.auth_org_ids_with_role(array['owner','admin'])`.
 *
 * Decide qué se pinta, nada más: aunque alguien se salte el guarda, la RLS y
 * `public.org_team()` no le devuelven una sola fila.
 */
export function canManageTeam(m: MembershipWithOrg | null): boolean {
  return m != null && (m.role === 'owner' || m.role === 'admin') && m.status === 'active';
}

export const ETIQUETA_ROL: Record<StaffRole, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  coach: 'Coach',
};

export const DESCRIPCION_ROL: Record<StaffRole, string> = {
  owner: 'Manda en todo: plata, equipo y propiedad del box.',
  admin: 'Todo menos ser dueño: no transfiere la propiedad ni cierra el box.',
  coach: 'Atletas, WODs y asistencia. Sin acceso a la plata, salvo que se lo des abajo.',
};

/** Roles que se ofrecen al invitar. El dueño se nombra, no se invita. */
export const ROLES_INVITABLES: InvitationRole[] = ['coach', 'admin'];

/** Roles a los que se puede mover a alguien que ya está en el equipo. */
export const ROLES_DEL_EQUIPO: StaffRole[] = ['coach', 'admin', 'owner'];

export interface PermisoFino {
  key: keyof Permissions;
  label: string;
  hint: string;
}

/**
 * Los permisos finos. No son roles nuevos a propósito: cada combinación de
 * rol y permiso que se convierte en un rol multiplica la matriz y nadie la
 * entiende a los seis meses. Ver docs/02-arquitectura.md.
 */
export const PERMISOS_FINOS: PermisoFino[] = [
  {
    key: 'can_view_finances',
    label: 'Ver la plata del box',
    hint: 'Actívalo si este coach también administra la plata del box: verá cobros, pagos y cartera. Es el caso del dueño que además entrena.',
  },
  {
    key: 'can_edit_wods',
    label: 'Crear y editar WODs',
    hint: 'Puede programar el entrenamiento del día, no solo consultarlo.',
  },
  {
    key: 'can_manage_athletes',
    label: 'Gestionar atletas',
    hint: 'Puede crear, editar y retirar atletas, no solo verlos.',
  },
];

/** El dueño y el administrador ya lo tienen todo: los interruptores no aplican. */
export function rolConTodoIncluido(role: StaffRole | InvitationRole): boolean {
  return role === 'owner' || role === 'admin';
}

export const ETIQUETA_ESTADO_INVITACION: Record<InvitationStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  revoked: 'Cancelada',
  expired: 'Vencida',
};

/** Una invitación pendiente cuya fecha ya pasó sigue en 'pending' hasta que alguien la toca. */
export function invitacionVencida(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

/** Enlace que el box copia y manda por WhatsApp. */
export function enlaceInvitacion(token: string): string {
  const base = typeof window === 'undefined' ? '' : window.location.origin;
  return `${base}/invitacion/${token}`;
}

const FECHA = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : FECHA.format(d);
}

/** Los permisos concedidos, en texto, para pintarlos bajo el nombre. */
export function permisosConcedidos(role: StaffRole, permissions: Permissions): string[] {
  if (rolConTodoIncluido(role)) return ['Acceso completo'];
  return PERMISOS_FINOS.filter((p) => permissions?.[p.key] === true).map((p) => p.label);
}
