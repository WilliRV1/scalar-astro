import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireFinance, RequireRole } from '../features/auth/guards';
import { Spinner } from '../shared/ui';

// Cada módulo se carga solo cuando hace falta: el atleta no descarga el panel
// de administración, y el coach no descarga lo que nunca va a abrir.
const StaffLogin = lazy(() => import('./routes/public/StaffLogin'));
const AthleteAccess = lazy(() => import('./routes/public/AthleteAccess'));
const NoAccess = lazy(() => import('./routes/public/NoAccess'));
const AcceptInvitation = lazy(() => import('./routes/public/AcceptInvitation'));
const PublicLanding = lazy(() => import('./routes/public/Landing'));
const SuperadminHome = lazy(() => import('./routes/superadmin/SuperadminHome'));
const ReclamarPropiedad = lazy(() =>
  import('../features/superadmin').then((m) => ({ default: m.ReclamarPropiedad })),
);
const AppLayout = lazy(() => import('./routes/AppLayout'));
const Landing = lazy(() => import('./routes/Landing'));
const AdminHome = lazy(() => import('./routes/admin/AdminHome'));
const AthletesPage = lazy(() => import('./routes/coach/AthletesPage'));
const AthleteDetailPage = lazy(() => import('./routes/coach/AthleteDetailPage'));
const PlansPage = lazy(() => import('./routes/admin/PlansPage'));
const TeamPage = lazy(() => import('./routes/admin/TeamPage'));
const FieldsPage = lazy(() => import('./routes/admin/FieldsPage'));
const SettingsPage = lazy(() => import('./routes/admin/SettingsPage'));
const OnboardingPage = lazy(() => import('./routes/admin/OnboardingPage'));
const ExpensesPage = lazy(() => import('./routes/admin/ExpensesPage'));
const SuppliesPage = lazy(() => import('./routes/admin/SuppliesPage'));
const ReportsPage = lazy(() => import('./routes/admin/ReportsPage'));
const AutomationsPage = lazy(() => import('./routes/admin/AutomationsPage'));
const RiskPage = lazy(() => import('./routes/coach/RiskPage'));
const SchedulePage = lazy(() => import('./routes/coach/SchedulePage'));
const BookingPage = lazy(() => import('./routes/athlete/BookingPage'));
const PaymentMethodPage = lazy(() => import('./routes/athlete/PaymentMethodPage'));
const ImportPage = lazy(() => import('./routes/coach/ImportPage'));
const WodPage = lazy(() => import('./routes/coach/WodPage'));
const AttendancePage = lazy(() => import('./routes/coach/AttendancePage'));
const TodayPage = lazy(() => import('./routes/athlete/TodayPage'));
const AthleteHome = lazy(() => import('./routes/athlete/AthleteHome'));

export function AppRouter() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        {/* Públicas */}
        <Route path="/entrar" element={<StaffLogin />} />
        <Route path="/acceso" element={<AthleteAccess />} />
        <Route path="/sin-acceso" element={<NoAccess />} />
        <Route path="/invitacion/:token" element={<AcceptInvitation />} />
        <Route path="/inicio" element={<PublicLanding />} />
        {/* Canje del enlace con el que se le entrega un box nuevo a su dueño.
            Sin esta ruta, el enlace que genera el alta no sirve de nada. */}
        <Route path="/propiedad/:token" element={<ReclamarPropiedad />} />

        {/* Privadas */}
        <Route element={<RequireAuth />}>
          {/* Panel interno, fuera del layout del box: no pertenece a ninguno. */}
          <Route path="_admin" element={<SuperadminHome />} />

          <Route element={<AppLayout />}>
            <Route index element={<Landing />} />

            <Route element={<RequireRole roles={['owner', 'admin', 'coach']} />}>
              <Route path="admin" element={<AdminHome />} />
              <Route path="admin/planes" element={<PlansPage />} />
              <Route path="coach/atletas" element={<AthletesPage />} />
              <Route path="coach/atletas/:id" element={<AthleteDetailPage />} />
              <Route path="coach/importar" element={<ImportPage />} />
              <Route path="coach/wod" element={<WodPage />} />
              <Route path="coach/asistencia" element={<AttendancePage />} />
              <Route path="coach/riesgo" element={<RiskPage />} />
              <Route path="coach/horarios" element={<SchedulePage />} />
            </Route>

            <Route element={<RequireRole roles={['owner', 'admin']} />}>
              <Route path="admin/equipo" element={<TeamPage />} />
              <Route path="admin/automatizaciones" element={<AutomationsPage />} />
              <Route path="admin/campos" element={<FieldsPage />} />
              <Route path="admin/configuracion" element={<SettingsPage />} />
              <Route path="admin/puesta-en-marcha" element={<OnboardingPage />} />
            </Route>

            {/* Todo lo que muestra plata pasa por el permiso, no solo por el rol. */}
            <Route element={<RequireFinance />}>
              <Route path="admin/gastos" element={<ExpensesPage />} />
              <Route path="admin/insumos" element={<SuppliesPage />} />
              <Route path="admin/reportes" element={<ReportsPage />} />
            </Route>

            <Route element={<RequireRole roles={['athlete']} />}>
              <Route path="atleta" element={<AthleteHome />} />
              <Route path="atleta/hoy" element={<TodayPage />} />
              <Route path="atleta/reservar" element={<BookingPage />} />
              <Route path="atleta/pago" element={<PaymentMethodPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
