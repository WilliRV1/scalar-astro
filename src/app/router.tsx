import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireRole } from '../features/auth/guards';
import { Spinner } from '../shared/ui';

// Cada módulo se carga solo cuando hace falta: el atleta no descarga el panel
// de administración, y el coach no descarga lo que nunca va a abrir.
const StaffLogin = lazy(() => import('./routes/public/StaffLogin'));
const AthleteAccess = lazy(() => import('./routes/public/AthleteAccess'));
const NoAccess = lazy(() => import('./routes/public/NoAccess'));
const AppLayout = lazy(() => import('./routes/AppLayout'));
const Landing = lazy(() => import('./routes/Landing'));
const AdminHome = lazy(() => import('./routes/admin/AdminHome'));
const AthletesPage = lazy(() => import('./routes/coach/AthletesPage'));
const AthleteDetailPage = lazy(() => import('./routes/coach/AthleteDetailPage'));
const PlansPage = lazy(() => import('./routes/admin/PlansPage'));
const AthleteHome = lazy(() => import('./routes/athlete/AthleteHome'));

export function AppRouter() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        {/* Públicas */}
        <Route path="/entrar" element={<StaffLogin />} />
        <Route path="/acceso" element={<AthleteAccess />} />
        <Route path="/sin-acceso" element={<NoAccess />} />

        {/* Privadas */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Landing />} />

            <Route element={<RequireRole roles={['owner', 'admin', 'coach']} />}>
              <Route path="admin" element={<AdminHome />} />
              <Route path="admin/planes" element={<PlansPage />} />
              <Route path="coach/atletas" element={<AthletesPage />} />
              <Route path="coach/atletas/:id" element={<AthleteDetailPage />} />
            </Route>

            <Route element={<RequireRole roles={['athlete']} />}>
              <Route path="atleta" element={<AthleteHome />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
