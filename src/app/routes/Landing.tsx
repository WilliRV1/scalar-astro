import { Navigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/useAuth';
import { canViewFinances, isStaff } from '../../features/auth/AuthContext';
import { Spinner } from '../../shared/ui';

/** Manda a cada quien a su módulo según el rol que tenga en el box activo. */
export default function Landing() {
  const { activeMembership, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!activeMembership) return <Navigate to="/sin-acceso" replace />;
  if (canViewFinances(activeMembership)) return <Navigate to="/admin" replace />;
  if (isStaff(activeMembership)) return <Navigate to="/coach/atletas" replace />;
  return <Navigate to="/atleta" replace />;
}
