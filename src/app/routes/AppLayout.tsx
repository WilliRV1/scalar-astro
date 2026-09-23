import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/useAuth';
import { canViewFinances, isStaff } from '../../features/auth/AuthContext';
import { AvisoNuevaVersion, InstalarApp } from '../../features/pwa';
import { Spinner } from '../../shared/ui';

interface Enlace {
  to: string;
  label: string;
  end?: boolean;
}

interface Grupo {
  titulo: string;
  enlaces: Enlace[];
}

export default function AppLayout() {
  const { activeMembership, memberships, setActiveOrg, signOut, loading } = useAuth();
  const { pathname } = useLocation();
  // El menú del celular se cierra solo al cambiar de pantalla: se guarda la
  // ruta en la que se abrió y deja de contar como abierto en cuanto cambia.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const menuAbierto = abiertoEn === pathname;

  if (loading && !activeMembership) return <Spinner />;

  const org = activeMembership?.organizations;
  const staff = isStaff(activeMembership);
  const finances = canViewFinances(activeMembership);
  const gestiona = activeMembership?.role === 'owner' || activeMembership?.role === 'admin';

  const grupos: Grupo[] = [
    ...(finances
      ? [{
          titulo: 'Plata',
          enlaces: [
            { to: '/admin', label: 'Cartera', end: true },
            { to: '/admin/planes', label: 'Planes' },
            { to: '/admin/gastos', label: 'Gastos' },
            { to: '/admin/insumos', label: 'Insumos' },
            { to: '/admin/reportes', label: 'Reportes' },
          ],
        }]
      : []),
    ...(staff
      ? [{
          titulo: 'Entrenamiento',
          enlaces: [
            { to: '/coach/wod', label: 'WOD' },
            { to: '/coach/horarios', label: 'Horarios' },
            { to: '/coach/asistencia', label: 'Asistencia' },
            { to: '/coach/atletas', label: 'Atletas' },
            { to: '/coach/riesgo', label: 'En riesgo' },
          ],
        }]
      : []),
    ...(gestiona
      ? [{
          titulo: 'Box',
          enlaces: [
            { to: '/admin/equipo', label: 'Equipo' },
            { to: '/admin/automatizaciones', label: 'Automatizaciones' },
            { to: '/admin/campos', label: 'Campos' },
            { to: '/admin/configuracion', label: 'Configuración' },
          ],
        }]
      : []),
    ...(!staff
      ? [{
          titulo: 'Mi box',
          enlaces: [
            { to: '/atleta/hoy', label: 'Hoy' },
            { to: '/atleta/reservar', label: 'Reservar' },
            { to: '/atleta/pago', label: 'Mi pago' },
            { to: '/atleta', label: 'Mi perfil', end: true },
          ],
        }]
      : []),
  ];

  const todos = grupos.flatMap((g) => g.enlaces);
  const actual = todos.find((e) => (e.end ? pathname === e.to : pathname.startsWith(e.to)));

  const linkEscritorio = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap px-3 py-2 text-xs font-bold uppercase tracking-widest transition ${
      isActive ? 'text-primary' : 'text-gray-500 hover:text-gray-300'
    }`;

  const linkMovil = ({ isActive }: { isActive: boolean }) =>
    `grunge-border block px-3 py-3 text-sm font-bold uppercase tracking-widest transition ${
      isActive ? 'border-primary text-primary' : 'text-gray-300 active:bg-white/5'
    }`;

  const selectorBox = memberships.length > 1 && (
    /* Un coach puede trabajar en dos boxes: aquí cambia entre ellos. */
    <select
      aria-label="Cambiar de box"
      value={activeMembership?.org_id ?? ''}
      onChange={(e) => setActiveOrg(e.target.value)}
      className="grunge-border max-w-full bg-transparent px-2 py-1 text-xs uppercase text-gray-400"
    >
      {memberships.map((m) => (
        <option key={m.org_id} value={m.org_id}>
          {m.organizations?.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background-light dark:bg-background-dark">
      <header className="grunge-border sticky top-0 z-40 bg-surface-light dark:bg-surface-dark">
        <div className="flex items-center gap-x-4 px-4 py-3">
          <span className="min-w-0 truncate font-display text-2xl text-black dark:text-white">
            {org?.name ?? 'Scalar'}
          </span>

          {/* Computador: todo el menú en línea; si no cabe, baja a otra fila. */}
          <nav className="hidden min-w-0 flex-1 flex-wrap items-center lg:flex">
            {todos.map((e) => (
              <NavLink key={e.to} to={e.to} end={e.end} className={linkEscritorio}>
                {e.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-4 lg:flex">
            {selectorBox}
            <button
              onClick={() => void signOut()}
              className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
            >
              Salir
            </button>
          </div>

          {/* Celular: la pantalla actual y un botón que abre el menú completo. */}
          <button
            type="button"
            onClick={() => setAbiertoEn(menuAbierto ? null : pathname)}
            aria-expanded={menuAbierto}
            aria-controls="menu-movil"
            className="ml-auto flex shrink-0 items-center gap-2 lg:hidden"
          >
            {actual && (
              <span className="text-xs font-bold uppercase tracking-widest text-primary">
                {actual.label}
              </span>
            )}
            <span className="material-icons text-3xl text-black dark:text-white">
              {menuAbierto ? 'close' : 'menu'}
            </span>
            <span className="sr-only">{menuAbierto ? 'Cerrar menú' : 'Abrir menú'}</span>
          </button>
        </div>

        {menuAbierto && (
          <nav
            id="menu-movil"
            className="max-h-[calc(100dvh-4rem)] space-y-5 overflow-y-auto border-t border-white/10 px-4 pb-6 pt-4 lg:hidden"
          >
            {grupos.map((g) => (
              <section key={g.titulo}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                  {g.titulo}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {g.enlaces.map((e) => (
                    <NavLink key={e.to} to={e.to} end={e.end} className={linkMovil}>
                      {e.label}
                    </NavLink>
                  ))}
                </div>
              </section>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              {selectorBox}
              <button
                onClick={() => void signOut()}
                className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary"
              >
                Salir
              </button>
            </div>
          </nav>
        )}
      </header>

      <AvisoNuevaVersion />

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      <InstalarApp />
    </div>
  );
}
