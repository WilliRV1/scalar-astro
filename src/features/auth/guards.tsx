import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '../../shared/ui';
import { slugFromHost } from '../org/subdomain';
import { useAuth } from './useAuth';
import { canViewFinances } from './AuthContext';
import type { Role } from '../../types/database';

/**
 * Estos guardas deciden qué se PINTA, no a qué datos se accede.
 * El acceso lo decide la RLS en Postgres. Si alguien saltara un guarda
 * manipulando la URL, vería una pantalla vacía: el servidor no le devuelve nada.
 */

export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading && !session) return <Spinner label="Verificando sesión" />;

  if (!session) {
    // En el subdominio de un box, quien llega sin sesión va a entrar. En el
    // dominio raíz no hay box que abrir, así que ve la portada de ventas.
    const destino = slugFromHost() ? '/entrar' : '/inicio';
    return <Navigate to={destino} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function RequireRole({ roles }: { roles: Role[] }) {
  const { activeMembership, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!activeMembership) return <Navigate to="/sin-acceso" replace />;
  if (!roles.includes(activeMembership.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * Rutas con información financiera.
 *
 * Es espejo de `private.auth_finance_org_ids()` en la base: dueño y
 * administrador siempre, un coach solo si el box se lo concedió. La RLS ya
 * impediría ver los datos, pero sin este guarda el coach llegaría a una
 * pantalla vacía sin entender por qué.
 */
export function RequireFinance() {
  const { activeMembership, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!activeMembership) return <Navigate to="/sin-acceso" replace />;
  if (!canViewFinances(activeMembership)) {
    return (
      <div className="grunge-border bg-surface-light p-6 dark:bg-surface-dark">
        <p className="font-display text-2xl text-black dark:text-white">
          Sin acceso a la información financiera
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Esta sección la ven el dueño y los administradores del box. Si necesitas entrar,
          pídele al dueño que te active el permiso desde Equipo.
        </p>
      </div>
    );
  }
  return <Outlet />;
}
