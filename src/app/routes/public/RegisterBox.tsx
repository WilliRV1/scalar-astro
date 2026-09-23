import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../shared/lib/supabase';
import { useAuth } from '../../../features/auth/useAuth';
import { Button, ErrorNote, Spinner } from '../../../shared/ui';
import { Field, TextInput } from '../../../shared/ui/Field';

const MINIMO_CLAVE = 8;

interface Datos {
  box: string;
  ciudad: string;
  nombre: string;
  email: string;
  clave: string;
}

type Resultado =
  | { tipo: 'listo'; orgId: string }
  | { tipo: 'confirmar_correo' };

/**
 * "Registra tu box": el coach crea su cuenta con correo y contraseña y, en el
 * mismo paso, su box queda creado vacío, en prueba, con él como dueño.
 *
 * Si ya tiene sesión (por ejemplo, coach de otro box que abre el suyo), solo se
 * le pide el nombre del box: la cuenta ya existe.
 */
export default function RegisterBox() {
  const { session, loading, memberships, setActiveOrg } = useAuth();
  const queryClient = useQueryClient();
  const [datos, setDatos] = useState<Datos>({ box: '', ciudad: '', nombre: '', email: '', clave: '' });
  const [errorForm, setErrorForm] = useState('');

  const registrar = useMutation({
    mutationFn: async (d: Datos): Promise<Resultado> => {
      if (!session) {
        const { data, error } = await supabase.auth.signUp({
          email: d.email.trim(),
          password: d.clave,
          options: { data: { full_name: d.nombre.trim() } },
        });
        if (error) {
          if (/already registered|already exists/i.test(error.message)) {
            throw new Error('Ese correo ya tiene cuenta. Entra con él y vuelve a esta página para registrar tu box.');
          }
          throw new Error(error.message);
        }
        // Proyectos que exigen confirmar el correo no devuelven sesión: sin
        // ella no hay a nombre de quién crear el box todavía.
        if (!data.session) return { tipo: 'confirmar_correo' };
      }

      const { data, error } = await supabase.rpc('register_my_box', {
        p_name: d.box.trim(),
        p_city: d.ciudad.trim() || null,
      });
      if (error) throw new Error(error.message);
      const fila = (Array.isArray(data) ? data[0] : data) as { org_id: string } | undefined;
      if (!fila) throw new Error('El box no quedó creado. Intenta de nuevo.');
      return { tipo: 'listo', orgId: fila.org_id };
    },
    onSuccess: async (r) => {
      if (r.tipo !== 'listo') return;
      await queryClient.invalidateQueries({ queryKey: ['memberships'] });
      setActiveOrg(r.orgId);
    },
  });

  if (loading && session) return <Spinner label="Cargando" />;

  // Terminado: al asistente de puesta en marcha del box recién creado. Se
  // espera a que aparezca entre sus boxes para no rebotar en /sin-acceso.
  if (registrar.data?.tipo === 'listo') {
    const creado = memberships.some((m) => m.org_id === (registrar.data as { orgId: string }).orgId);
    return creado ? <Navigate to="/admin/configuracion" replace /> : <Spinner label="Preparando tu box" />;
  }

  function set<K extends keyof Datos>(k: K, v: string) {
    setDatos((d) => ({ ...d, [k]: v }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorForm('');
    if (datos.box.trim().length < 3) {
      setErrorForm('Escribe el nombre del box (mínimo 3 letras).');
      return;
    }
    if (!session && datos.clave.length < MINIMO_CLAVE) {
      setErrorForm(`La contraseña debe tener al menos ${MINIMO_CLAVE} caracteres.`);
      return;
    }
    registrar.mutate(datos);
  }

  if (registrar.data?.tipo === 'confirmar_correo') {
    return (
      <Marco titulo="Revisa tu correo">
        <p className="text-sm text-gray-400">
          Te enviamos un enlace a <strong className="text-white">{datos.email}</strong> para
          confirmar la cuenta. Ábrelo, entra y vuelve a esta página: tu box se registra en un paso.
        </p>
      </Marco>
    );
  }

  const error = errorForm || (registrar.error instanceof Error ? registrar.error.message : '');

  return (
    <Marco titulo="Registra tu box">
      <p className="mb-6 text-sm text-gray-400">
        {session
          ? 'Ya tienes cuenta. Solo falta el nombre del box.'
          : 'Crea tu cuenta y tu box en un paso. Son 14 días de prueba, sin tarjeta.'}
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nombre del box">
          <TextInput
            required
            value={datos.box}
            onChange={(e) => set('box', e.target.value)}
            placeholder="Ej.: Box La Ladera"
            maxLength={80}
          />
        </Field>

        <Field label="Ciudad" hint="Opcional">
          <TextInput value={datos.ciudad} onChange={(e) => set('ciudad', e.target.value)} placeholder="Cali" />
        </Field>

        {!session && (
          <>
            <Field label="Tu nombre">
              <TextInput
                required
                autoComplete="name"
                value={datos.nombre}
                onChange={(e) => set('nombre', e.target.value)}
              />
            </Field>
            <Field label="Correo" hint="Con este correo entras a la aplicación">
              <TextInput
                required
                type="email"
                autoComplete="email"
                value={datos.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </Field>
            <Field label="Contraseña" hint={`Mínimo ${MINIMO_CLAVE} caracteres`}>
              <TextInput
                required
                type="password"
                autoComplete="new-password"
                minLength={MINIMO_CLAVE}
                value={datos.clave}
                onChange={(e) => set('clave', e.target.value)}
              />
            </Field>
          </>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" disabled={registrar.isPending} className="w-full">
          {registrar.isPending ? 'Registrando…' : 'Registrar mi box'}
        </Button>
      </form>

      {!session && (
        <p className="mt-8 text-center text-sm text-gray-500">
          ¿Ya tienes cuenta?{' '}
          <Link to="/entrar" className="font-bold text-primary hover:underline">
            Entra
          </Link>
        </p>
      )}
    </Marco>
  );
}

function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background-light p-4 dark:bg-background-dark">
      <div className="w-full max-w-md border-t-4 border-primary bg-surface-light p-6 shadow-2xl sm:p-8 dark:bg-surface-dark">
        <h1 className="mb-1 font-display text-4xl text-black dark:text-white">{titulo}</h1>
        {children}
      </div>
    </div>
  );
}
