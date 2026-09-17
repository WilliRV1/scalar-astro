import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../features/auth/useAuth';
import { canViewFinances, isStaff } from '../../features/auth/AuthContext';
import { Spinner } from '../../shared/ui';

export default function AppLayout() {
  const { activeMembership, memberships, setActiveOrg, signOut, loading } = useAuth();

  if (loading && !activeMembership) return <Spinner />;

  const org = activeMembership?.organizations;
  const staff = isStaff(activeMembership);
  const finances = canViewFinances(activeMembership);

  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 text-xs font-bold uppercase tracking-widest transition ${
      isActive ? 'text-primary' : 'text-gray-500 hover:text-gray-300'
    }`;

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <header className="grunge-border sticky top-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface-light px-4 py-3 dark:bg-surface-dark">
        <span className="font-display text-2xl text-black dark:text-white">
          {org?.name ?? 'Scalar'}
        </span>

        <nav className="flex flex-1 items-center">
          {finances && (
            <>
              <NavLink to="/admin" end className={link}>
                Cartera
              </NavLink>
              <NavLink to="/admin/planes" className={link}>
                Planes
              </NavLink>
            </>
          )}
          {staff && (
            <NavLink to="/coach/atletas" className={link}>
              Atletas
            </NavLink>
          )}
          {!staff && (
            <NavLink to="/atleta" className={link}>
              Mi perfil
            </NavLink>
          )}
        </nav>

        {/* Un coach puede trabajar en dos boxes: aquí cambia entre ellos. */}
        {memberships.length > 1 && (
          <select
            aria-label="Cambiar de box"
            value={activeMembership?.org_id ?? ''}
            onChange={(e) => setActiveOrg(e.target.value)}
            className="grunge-border bg-transparent px-2 py-1 text-xs uppercase text-gray-400"
          >
            {memberships.map((m) => (
              <option key={m.org_id} value={m.org_id}>
                {m.organizations?.name}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => void signOut()}
          className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
        >
          Salir
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
