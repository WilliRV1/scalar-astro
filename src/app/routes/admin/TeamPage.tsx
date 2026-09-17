import { useState } from 'react';
import { useAuth } from '../../../features/auth/useAuth';
import { useInvitations, useTeam } from '../../../features/team/queries';
import { useRevokeInvitation } from '../../../features/team/mutations';
import { InviteDrawer } from '../../../features/team/InviteDrawer';
import { InvitationLink } from '../../../features/team/InvitationLink';
import { MemberDrawer } from '../../../features/team/MemberDrawer';
import {
  ETIQUETA_ESTADO_INVITACION, ETIQUETA_ROL, canManageTeam, fechaCorta,
  invitacionVencida, permisosConcedidos,
} from '../../../features/team/permissions';
import type { Invitation, TeamMember } from '../../../features/team/types';
import { Button, Card, EmptyState, ErrorNote, Spinner, Stat } from '../../../shared/ui';

/**
 * Equipo del box: quién trabaja acá, con qué rol y con qué permisos.
 *
 * La pantalla resuelve el caso que más se pregunta en un box pequeño: el dueño
 * que además da las clases. No se arregla con un rol nuevo, sino con
 * `coach` + "Ver la plata del box", y el interruptor lo explica ahí mismo.
 */
export default function TeamPage() {
  const { activeMembership, session } = useAuth();
  const orgId = activeMembership?.org_id;
  const puedeGestionar = canManageTeam(activeMembership);

  const [invitando, setInvitando] = useState(false);
  const [editando, setEditando] = useState<TeamMember | null>(null);

  const equipo = useTeam(puedeGestionar ? orgId : undefined);
  const invitaciones = useInvitations(puedeGestionar ? orgId : undefined);

  // Doble llave: el guarda de la ruta decide la navegación, esto decide el
  // render. Aunque fallaran los dos, `org_team()` y la RLS no sueltan un dato.
  if (!puedeGestionar) {
    return (
      <EmptyState
        title="Solo el dueño y el administrador"
        hint="Esta pantalla maneja los accesos al box, así que la ve quien responde por él. Pídele a tu dueño que te cambie el rol si te toca gestionarlo."
      />
    );
  }

  const miembros = equipo.data ?? [];
  const activos = miembros.filter((m) => m.status === 'active');
  const pendientes = (invitaciones.data ?? []).filter(
    (i) => i.status === 'pending' && !invitacionVencida(i.expires_at),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-black dark:text-white">Equipo</h1>
        <Button onClick={() => setInvitando(true)}>+ Invitar</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="En el equipo" value={String(activos.length)} hint="Con acceso hoy" />
        <Stat
          label="Invitaciones"
          value={String(pendientes.length)}
          hint={pendientes.length ? 'Esperando que acepten' : 'Ninguna pendiente'}
        />
        <Stat
          label="Ven la plata"
          value={String(activos.filter((m) => permisosConcedidos(m.role, m.permissions).length > 0
            && (m.role !== 'coach' || m.permissions?.can_view_finances === true)).length)}
          hint="Dueños, administradores y coaches con el permiso"
        />
      </div>

      {/* ----------------------------------------------------------- equipo */}
      <section className="space-y-2">
        <h2 className="font-display text-2xl text-black dark:text-white">Quién trabaja acá</h2>

        {equipo.error && (
          <ErrorNote>
            No se pudo cargar el equipo: {equipo.error instanceof Error ? equipo.error.message : String(equipo.error)}
          </ErrorNote>
        )}
        {equipo.isLoading && <Spinner label="Cargando equipo" />}

        {!equipo.isLoading && miembros.length === 0 && !equipo.error && (
          <EmptyState title="Todavía estás solo" hint="Invita a tu primer coach con el botón de arriba." />
        )}

        {miembros.map((m) => (
          <MemberRow
            key={m.membership_id}
            member={m}
            esYo={session?.user.id === m.user_id}
            onEdit={() => setEditando(m)}
          />
        ))}
      </section>

      {/* ---------------------------------------------------- invitaciones */}
      <section className="space-y-2">
        <h2 className="font-display text-2xl text-black dark:text-white">Invitaciones pendientes</h2>

        {invitaciones.error && (
          <ErrorNote>
            No se pudieron cargar las invitaciones:{' '}
            {invitaciones.error instanceof Error ? invitaciones.error.message : String(invitaciones.error)}
          </ErrorNote>
        )}

        {!invitaciones.isLoading && pendientes.length === 0 && (
          <EmptyState
            title="Nada pendiente"
            hint="Cuando invites a alguien, aquí queda su enlace para volverlo a mandar por WhatsApp."
          />
        )}

        {pendientes.map((inv) => (
          <InvitationRow key={inv.id} invitacion={inv} orgId={orgId!} />
        ))}
      </section>

      {orgId && invitando && (
        <InviteDrawer orgId={orgId} open onClose={() => setInvitando(false)} />
      )}

      {orgId && editando && (
        <MemberDrawer
          key={editando.membership_id}
          orgId={orgId}
          member={editando}
          esMiPropiaCuenta={session?.user.id === editando.user_id}
          open
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function MemberRow({
  member, esYo, onEdit,
}: {
  member: TeamMember;
  esYo: boolean;
  onEdit: () => void;
}) {
  const activo = member.status === 'active';
  const permisos = permisosConcedidos(member.role, member.permissions);

  return (
    <Card className={`flex flex-wrap items-center justify-between gap-3 ${activo ? '' : 'opacity-60'}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-black dark:text-white">
          {member.display_name ?? member.email}
          {esYo && <span className="ml-2 text-[10px] uppercase tracking-widest text-gray-500">(tú)</span>}
        </p>
        <p className="truncate text-xs text-gray-500">{member.email}</p>
        <p className="mt-1 text-xs text-gray-600">
          {permisos.length ? permisos.join(' · ') : 'Sin permisos extra'}
          {' · '}
          {activo ? `desde ${fechaCorta(member.joined_at)}` : 'desactivado'}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`text-[10px] font-bold uppercase tracking-widest ${
            member.role === 'owner' ? 'text-primary' : activo ? 'text-gray-300' : 'text-gray-600'
          }`}
        >
          {ETIQUETA_ROL[member.role]}
        </span>
        <button
          onClick={onEdit}
          aria-label={`Editar a ${member.display_name ?? member.email}`}
          className="text-xs font-bold uppercase text-gray-500 hover:text-primary"
        >
          Editar
        </button>
      </div>
    </Card>
  );
}

function InvitationRow({ invitacion, orgId }: { invitacion: Invitation; orgId: string }) {
  const revocar = useRevokeInvitation();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState('');

  async function onRevocar() {
    setError('');
    if (!confirm(`¿Cancelar la invitación de ${invitacion.email}? El enlace deja de servir.`)) return;
    try {
      await revocar.mutateAsync({ orgId, invitationId: invitacion.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cancelar la invitación');
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-black dark:text-white">{invitacion.email}</p>
          <p className="text-xs text-gray-500">
            {ETIQUETA_ROL[invitacion.role]} · {ETIQUETA_ESTADO_INVITACION[invitacion.status]} ·
            vence {fechaCorta(invitacion.expires_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={() => setAbierto((v) => !v)}
            className="text-xs font-bold uppercase text-gray-500 hover:text-primary"
          >
            {abierto ? 'Ocultar enlace' : 'Ver enlace'}
          </button>
          <button
            onClick={() => void onRevocar()}
            disabled={revocar.isPending}
            className="text-xs font-bold uppercase text-gray-500 hover:text-primary disabled:opacity-40"
          >
            Cancelar
          </button>
        </div>
      </div>

      {abierto && <InvitationLink token={invitacion.token} email={invitacion.email} />}
      {error && <ErrorNote>{error}</ErrorNote>}
    </Card>
  );
}
