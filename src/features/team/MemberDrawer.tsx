import { useState } from 'react';
import {
  Button, Drawer, ErrorNote, Field, Select,
} from '../../shared/ui';
import { mensajeAmigable } from '../../shared/lib/errores';
import type { Permissions } from '../../types/database';
import { useSetMemberStatus, useUpdateMember } from './mutations';
import { PermissionSwitches } from './PermissionSwitches';
import {
  DESCRIPCION_ROL, ETIQUETA_ROL, ROLES_DEL_EQUIPO, fechaCorta,
} from './permissions';
import type { StaffRole, TeamMember } from './types';

export function MemberDrawer({
  orgId, member, esMiPropiaCuenta, open, onClose,
}: {
  orgId: string;
  member: TeamMember;
  esMiPropiaCuenta: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const guardar = useUpdateMember();
  const cambiarEstado = useSetMemberStatus();

  const [role, setRole] = useState<StaffRole>(member.role);
  const [permissions, setPermissions] = useState<Permissions>(member.permissions ?? {});
  const [error, setError] = useState('');

  const activo = member.status === 'active';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await guardar.mutateAsync({ orgId, membershipId: member.membership_id, role, permissions });
      onClose();
    } catch (err) {
      // Aquí llega, entre otros, el "no puedes quitarle la propiedad al único
      // dueño del box". Se muestra literal: el servidor ya lo explicó bien.
      setError(mensajeAmigable(err));
    }
  }

  async function alternarEstado() {
    setError('');
    const siguiente = activo ? 'disabled' : 'active';
    if (activo && !confirm(`¿Desactivar a ${member.display_name ?? member.email}? Pierde el acceso al box, pero su historial se conserva.`)) return;
    try {
      await cambiarEstado.mutateAsync({ orgId, membershipId: member.membership_id, status: siguiente });
      onClose();
    } catch (err) {
      setError(mensajeAmigable(err));
    }
  }

  return (
    <Drawer
      open={open}
      title={member.display_name ?? member.email}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button type="submit" form="form-miembro" disabled={guardar.isPending} className="flex-1">
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      }
    >
      <form id="form-miembro" onSubmit={onSubmit} className="space-y-4">
        <div className="grunge-border bg-black/20 p-3 text-xs text-gray-500">
          <p className="break-all text-gray-400">{member.email}</p>
          <p className="mt-1">
            {activo ? 'En el equipo desde' : 'Desactivado · entró el'} {fechaCorta(member.joined_at)}
          </p>
        </div>

        <Field label="Rol" hint={DESCRIPCION_ROL[role]}>
          <Select
            value={role}
            onChange={(e) => {
              const nuevo = e.target.value as StaffRole;
              setRole(nuevo);
              if (nuevo !== 'coach') setPermissions({});
            }}
          >
            {ROLES_DEL_EQUIPO.map((r) => (
              <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>
            ))}
          </Select>
        </Field>

        {esMiPropiaCuenta && role !== member.role && (
          <p className="border-l-4 border-yellow-600 bg-yellow-600/10 px-3 py-2 text-xs text-yellow-500">
            Estás cambiando tu propio rol. Si te bajas de dueño o administrador, pierdes
            esta pantalla y te toca pedirle a alguien más que te la devuelva.
          </p>
        )}

        <PermissionSwitches role={role} permissions={permissions} onChange={setPermissions} />

        {error && <ErrorNote>{error}</ErrorNote>}

        <button
          type="button"
          onClick={() => void alternarEstado()}
          disabled={cambiarEstado.isPending}
          className="min-h-11 px-3 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary disabled:opacity-40"
        >
          {activo ? 'Desactivar del equipo' : 'Reactivar en el equipo'}
        </button>
      </form>
    </Drawer>
  );
}
