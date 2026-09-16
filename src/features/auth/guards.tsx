import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '../../shared/ui';
import { useAuth } from './useAuth';
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
  if (!session) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function RequireRole({ roles }: { roles: Role[] }) {
  const { activeMembership, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!activeMembership) return <Navigate to="/sin-acceso" replace />;
  if (!roles.includes(activeMembership.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
