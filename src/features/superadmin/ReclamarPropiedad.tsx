import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '../../shared/lib/supabase';
import { useAuth } from '../auth/useAuth';
import { Button, ErrorNote, Spinner } from '../../shared/ui';

/**
 * El dueño de un box nuevo reclama su propiedad.
 *
 * Es la otra mitad del alta: nosotros creamos el box y le mandamos un enlace;
 * él entra con SU correo y canjea el token por la membresía de dueño. La
 * comprobación de que el correo coincide la hace `accept_owner_invitation()` en
 * la base, no esta pantalla: un enlace reenviado por WhatsApp a un grupo no
 * mete a nadie al box.
 *
 * Se enruta así, sin archivo nuevo:
 *   <Route path="/propiedad/:token" element={<ReclamarPropiedad />} />
 */
export function ReclamarPropiedad({ token }: { token?: string } = {}) {
  const params = useParams<{ token: string }>();
  const codigo = token ?? params.token ?? '';
  const { session, loading } = useAuth();
  const yaIntentado = useRef(false);

  const canjear = useMutation({
    mutationFn: async (p_token: string) => {
      const { error } = await supabase.rpc('accept_owner_invitation', { p_token });
      if (error) throw error;
    },
  });

  // El canje es un efecto de verdad: se dispara una sola vez, contra el
  // servidor, en cuanto hay sesión y token. El estado lo lleva la mutación.
  useEffect(() => {
    if (loading || !session || !codigo || yaIntentado.current) return;
    yaIntentado.current = true;
    canjear.mutate(codigo);
  }, [loading, session, codigo, canjear]);

  if (loading) return <Spinner label="Un momento" />;

  if (!session) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-5 py-16 text-center">
        <h1 className="font-display text-3xl text-white">Tu box te está esperando</h1>
        <p className="text-sm text-gray-400">
          Entra con el correo al que te mandamos este enlace y el box queda a tu nombre.
        </p>
        <a
          href={`/entrar?volver=${encodeURIComponent(`/propiedad/${codigo}`)}`}
          className="inline-block bg-primary px-6 py-3 font-display text-xl tracking-wide text-sobre-primario transition hover:bg-primario-flotante"
        >
          Entrar
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-5 py-16 text-center">
      {canjear.isPending && <Spinner label="Activando tu box" />}

      {canjear.isSuccess && (
        <>
          <h1 className="font-display text-3xl text-white">Listo, el box es tuyo</h1>
          <p className="text-sm text-gray-400">
            Ya puedes entrar, invitar a tu equipo y revisar los planes que dejamos configurados.
          </p>
          <Button onClick={() => window.location.assign('/admin')}>Ir a mi box</Button>
        </>
      )}

      {canjear.error && (
        <div className="space-y-3">
          <ErrorNote>
            {canjear.error instanceof Error ? canjear.error.message : 'No se pudo activar el box'}
          </ErrorNote>
          <p className="text-xs text-gray-500">
            Si el enlace venció o es para otro correo, escríbenos por WhatsApp y te mandamos uno
            nuevo.
          </p>
        </div>
      )}
    </div>
  );
}
