import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../features/auth/useAuth';
import { mensajeAmigable } from '../../../shared/lib/errores';
import { Button } from '../../../shared/ui';

/**
 * El usuario se autenticó pero no pertenece a ningún box. Pasa cuando lo
 * invitaron y aún no lo vincularon, o cuando le quitaron el acceso.
 *
 * Si además hubo un error al consultar las membresías, puede que sí pertenezca
 * y solo falló la red: se ofrece reintentar antes que salir.
 */
export default function NoAccess() {
  const { signOut, error } = useAuth();
  const qc = useQueryClient();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background-light p-6 text-center dark:bg-background-dark">
      <h1 className="font-display text-4xl text-black dark:text-white">Sin acceso todavía</h1>
      <p className="max-w-md text-gray-500">
        Tu cuenta no está vinculada a ningún box. Pídele a tu coach o al dueño que te invite
        desde el panel.
      </p>
      {error && <p className="max-w-md text-xs text-gray-500">{mensajeAmigable(error)}</p>}
      <div className="flex flex-wrap justify-center gap-3">
        {error && (
          <Button onClick={() => void qc.invalidateQueries({ queryKey: ['memberships'] })}>
            Reintentar
          </Button>
        )}
        <Button variant="ghost" onClick={() => void signOut()}>
          Salir
        </Button>
      </div>
    </div>
  );
}
