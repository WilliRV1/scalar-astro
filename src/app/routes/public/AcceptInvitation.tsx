import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../shared/lib/supabase';
import { mensajeAmigable } from '../../../shared/lib/errores';
import { useAuth } from '../../../features/auth/useAuth';
import { Button, ErrorNote, Field, Spinner, TextInput } from '../../../shared/ui';

/**
 * Canje de una invitación al equipo del box.
 *
 * El token se guarda en sessionStorage antes de pedir el enlace mágico: el
 * correo devuelve al usuario a esta misma ruta, pero pasando por el proveedor de
 * autenticación, y sin guardarlo el token se perdería en el camino.
 *
 * Quien acepta no consulta la tabla de invitaciones —solo la leen el dueño y los
 * administradores del box—: canjea el token por una función que valida que su
 * correo coincide con el de la invitación.
 */

const CLAVE_TOKEN = 'scalar.invitacion_pendiente';

export default function AcceptInvitation() {
  const { token: tokenUrl } = useParams<{ token: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [correo, setCorreo] = useState('');
  const [correoEnviado, setCorreoEnviado] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');
  const [enviando, setEnviando] = useState(false);

  // El token viene en la URL, o quedó guardado antes de salir al enlace mágico.
  const token = tokenUrl ?? sessionStorage.getItem(CLAVE_TOKEN) ?? '';

  const canje = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('accept_invitation', { p_token: token });
      if (error) throw error;
    },
    onSuccess: async () => {
      sessionStorage.removeItem(CLAVE_TOKEN);
      // La membresía nueva cambia todo lo que este usuario puede ver.
      await qc.invalidateQueries();
      setTimeout(() => navigate('/', { replace: true }), 1200);
    },
  });

  // El efecto puede dispararse dos veces en StrictMode; la invitación se canjea
  // una sola vez. La función es idempotente en la base, pero no hay motivo para
  // provocar la segunda llamada.
  const lanzado = useRef(false);
  const lanzar = canje.mutate;

  useEffect(() => {
    if (!token || !session || lanzado.current) return;
    lanzado.current = true;
    lanzar();
  }, [token, session, lanzar]);

  async function enviarEnlace(e: React.FormEvent) {
    e.preventDefault();
    // Dos toques seguidos mandarían dos correos y el segundo enlace invalida
    // el primero: se bloquea el botón mientras responde el servidor.
    if (enviando) return;
    setEnviando(true);
    setErrorEnvio('');
    sessionStorage.setItem(CLAVE_TOKEN, token);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: correo.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/invitacion/${token}`,
        },
      });

      if (error) setErrorEnvio('No pudimos enviar el enlace. Revisa el correo e intenta de nuevo.');
      else setCorreoEnviado(true);
    } catch (err) {
      setErrorEnvio(mensajeAmigable(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background-light p-4 dark:bg-background-dark">
      <div className="w-full max-w-md border-t-4 border-primary bg-surface-light p-8 shadow-2xl dark:bg-surface-dark">
        <h1 className="mb-1 font-display text-4xl text-black dark:text-white">Invitación</h1>
        <p className="mb-8 text-xs uppercase tracking-widest text-gray-500">Equipo del box</p>

        {!token && <ErrorNote>El enlace de invitación está incompleto.</ErrorNote>}

        {token && session && canje.isPending && <Spinner label="Aceptando invitación" />}

        {token && session && canje.isSuccess && (
          <div className="space-y-3">
            <p className="font-display text-2xl text-black dark:text-white">¡Ya estás dentro!</p>
            <p className="text-sm text-gray-500">Te llevamos a tu panel…</p>
          </div>
        )}

        {token && session && canje.isError && (
          <div className="space-y-4">
            {/* Los mensajes de la función son explícitos y están en español:
                se muestran tal cual en vez de taparlos con un "algo salió mal". */}
            <ErrorNote>{mensajeAmigable(canje.error)}</ErrorNote>
            <p className="text-sm text-gray-500">
              Las invitaciones vencen, y solo sirven para el correo al que se enviaron. Si el
              tuyo es distinto, pídele al box que te mande una nueva.
            </p>
            <Link to="/" className="block text-sm font-bold text-primary hover:underline">
              Ir a mi panel
            </Link>
          </div>
        )}

        {token && !session && correoEnviado && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Listo. Revisa <strong className="text-black dark:text-white">{correo}</strong> y
              abre el enlace que te mandamos. Al entrar quedas dentro del box automáticamente.
            </p>
            <p className="text-xs text-gray-600">
              Si no llega en unos minutos, mira en spam o pídele al box que te reenvíe la
              invitación.
            </p>
          </div>
        )}

        {token && !session && !correoEnviado && (
          <form onSubmit={enviarEnlace} className="space-y-5">
            <p className="text-sm text-gray-500">
              Escribe el correo al que te llegó la invitación. Te mandamos un enlace para
              entrar; no necesitas contraseña.
            </p>
            <Field label="Tu correo">
              <TextInput
                type="email"
                autoComplete="email"
                required
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
              />
            </Field>
            {errorEnvio && <ErrorNote>{errorEnvio}</ErrorNote>}
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar enlace'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
