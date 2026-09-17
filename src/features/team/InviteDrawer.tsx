import { useState } from 'react';
import {
  Button, Drawer, ErrorNote, Field, Select, TextInput,
} from '../../shared/ui';
import type { Permissions } from '../../types/database';
import { useInviteMember } from './mutations';
import { InvitationLink } from './InvitationLink';
import { PermissionSwitches } from './PermissionSwitches';
import {
  DESCRIPCION_ROL, ETIQUETA_ROL, ROLES_INVITABLES,
} from './permissions';
import type { Invitation, InvitationRole } from './types';

/** Mismo criterio que el CHECK de la tabla: ni más estricto ni más laxo. */
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function InviteDrawer({
  orgId, open, onClose,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
}) {
  const invitar = useInviteMember();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitationRole>('coach');
  const [permissions, setPermissions] = useState<Permissions>({});
  const [errorCorreo, setErrorCorreo] = useState('');
  const [errorServidor, setErrorServidor] = useState('');
  const [creada, setCreada] = useState<Invitation | null>(null);

  function limpiar() {
    setEmail('');
    setRole('coach');
    setPermissions({});
    setErrorCorreo('');
    setErrorServidor('');
    setCreada(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorCorreo('');
    setErrorServidor('');

    if (!CORREO.test(email.trim())) {
      setErrorCorreo('Escribe un correo válido: es con el que va a entrar.');
      return;
    }

    try {
      const inv = await invitar.mutateAsync({ orgId, email, role, permissions });
      setCreada(inv);
    } catch (err) {
      // El mensaje del servidor se muestra tal cual: "ya hay una invitación
      // pendiente para ese correo" explica el problema mejor que un genérico.
      setErrorServidor(err instanceof Error ? err.message : 'No se pudo crear la invitación');
    }
  }

  return (
    <Drawer
      open={open}
      title={creada ? 'Invitación lista' : 'Invitar al equipo'}
      onClose={onClose}
      footer={
        creada ? (
          <div className="flex gap-3">
            <Button onClick={limpiar} variant="ghost" className="flex-1">
              Invitar a alguien más
            </Button>
            <Button onClick={onClose} className="flex-1">Listo</Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button type="submit" form="form-invitar" disabled={invitar.isPending} className="flex-1">
              {invitar.isPending ? 'Creando…' : 'Crear invitación'}
            </Button>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          </div>
        )
      }
    >
      {creada ? (
        <InvitationLink token={creada.token} email={creada.email} />
      ) : (
        <form id="form-invitar" onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Correo"
            error={errorCorreo}
            hint="Tiene que ser el mismo con el que va a iniciar sesión: si no coincide, el enlace no la deja entrar."
          >
            <TextInput
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="coach@tubox.co"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </Field>

          <Field label="Rol" hint={DESCRIPCION_ROL[role]}>
            <Select
              value={role}
              onChange={(e) => {
                const nuevo = e.target.value as InvitationRole;
                setRole(nuevo);
                if (nuevo === 'admin') setPermissions({});
              }}
            >
              {ROLES_INVITABLES.map((r) => (
                <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>
              ))}
            </Select>
          </Field>

          <PermissionSwitches role={role} permissions={permissions} onChange={setPermissions} />

          <p className="text-xs text-gray-600">
            ¿Quieres otro dueño del box? Invítalo primero como administrador y, cuando
            acepte, cámbiale el rol a dueño desde la lista del equipo.
          </p>

          {errorServidor && <ErrorNote>{errorServidor}</ErrorNote>}
        </form>
      )}
    </Drawer>
  );
}
