import { useAuth } from '../../../features/auth/useAuth';
import { Button } from '../../../shared/ui';

/**
 * El usuario se autenticó pero no pertenece a ningún box. Pasa cuando lo
 * invitaron y aún no lo vincularon, o cuando le quitaron el acceso.
 */
export default function NoAccess() {
  const { signOut, error } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background-light p-6 text-center dark:bg-background-dark">
      <h1 className="font-display text-4xl text-black dark:text-white">Sin acceso todavía</h1>
      <p className="max-w-md text-gray-500">
        Tu cuenta no está vinculada a ningún box. Pídele a tu coach o al dueño que te invite
        desde el panel.
      </p>
      {error && <p className="text-xs text-gray-600">Detalle técnico: {error}</p>}
      <Button variant="ghost" onClick={() => void signOut()}>
        Salir
      </Button>
    </div>
  );
}
