import { useState } from 'react';
import { Navigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '../../../shared/lib/supabase';
import { useAuth } from '../../../features/auth/useAuth';
import { Button, ErrorNote } from '../../../shared/ui';

/**
 * Entrada del staff (dueño, administrador, coach).
 *
 * Reemplaza el `prompt('Ingrese Clave de Coach:')` contra la cadena 'admin123'
 * que estaba escrita en el código del prototipo y que cualquiera podía leer
 * abriendo el bundle.
 */
export default function StaffLogin() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // A dónde quería ir antes de que lo mandáramos a entrar. Sin esto, quien
  // abre un enlace de invitación o de propiedad entra y se queda mirando su
  // panel, teniendo que volver a abrir el enlace del correo.
  const desde = (location.state as { from?: string } | null)?.from;
  const volver = params.get('volver') ?? desde ?? '/';
  // Solo rutas internas: un `volver` con dominio ajeno sería un redirector
  // abierto, que es un clásico para robar sesiones.
  const destino = volver.startsWith('/') && !volver.startsWith('//') ? volver : '/';

  if (session) return <Navigate to={destino} replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    // Mensaje deliberadamente genérico: no se le confirma a nadie si un correo
    // existe o no en el sistema.
    if (err) setError('Correo o contraseña incorrectos.');
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background-light p-4 dark:bg-background-dark">
      <div className="w-full max-w-md border-t-4 border-primary bg-surface-light p-8 shadow-2xl dark:bg-surface-dark">
        <h1 className="mb-1 font-display text-4xl text-black dark:text-white">Entrar</h1>
        <p className="mb-8 text-xs uppercase tracking-widest text-gray-500">
          Dueño · Administrador · Coach
        </p>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-xs font-bold uppercase text-gray-500">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 bg-gray-100 p-3 text-base sm:text-sm focus:border-primary focus:outline-none dark:border-gray-700 dark:bg-black"
            />
          </div>

          <div>
            <label htmlFor="pw" className="mb-2 block text-xs font-bold uppercase text-gray-500">
              Contraseña
            </label>
            <input
              id="pw"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 bg-gray-100 p-3 text-base sm:text-sm focus:border-primary focus:outline-none dark:border-gray-700 dark:bg-black"
            />
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Validando…' : 'Ingresar'}
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-gray-500">
          ¿Eres atleta?{' '}
          <Link to="/acceso" className="font-bold text-primary hover:underline">
            Entra con tu celular
          </Link>
        </p>
        <p className="mt-3 text-center text-sm text-gray-500">
          ¿Tienes un box y aún no usas Scalar?{' '}
          <Link to="/registro" className="font-bold text-primary hover:underline">
            Regístralo
          </Link>
        </p>
      </div>
    </div>
  );
}
