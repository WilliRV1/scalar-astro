import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { supabase } from '../../../shared/lib/supabase';
import { useAuth } from '../../../features/auth/useAuth';
import { toE164 } from '../../../shared/lib/phone';
import { Button, ErrorNote } from '../../../shared/ui';

/**
 * Entrada del atleta: código de un solo uso al celular.
 *
 * Reemplaza el login del prototipo, que mostraba un desplegable con los nombres
 * de TODOS los atletas del box sin estar autenticado y aceptaba el PIN '0000'
 * para cualquiera de ellos.
 *
 * El atleta no tiene contraseña que recordar. Su número ya está en la base del
 * box, así que el celular es la credencial natural.
 */
export default function AthleteAccess() {
  const { session } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const e164 = toE164(phone);
    if (!e164) {
      setError('Revisa el número. Ejemplo: 300 123 4567');
      return;
    }
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    if (err) setError('No pudimos enviar el código. Habla con tu box.');
    else setStep('code');
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const e164 = toE164(phone)!;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
    if (err) setError('Código incorrecto o vencido.');
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background-light p-4 dark:bg-background-dark">
      <div className="w-full max-w-md border-t-4 border-primary bg-surface-light p-8 shadow-2xl dark:bg-surface-dark">
        <h1 className="mb-1 font-display text-4xl text-black dark:text-white">Tu cuenta</h1>
        <p className="mb-8 text-xs uppercase tracking-widest text-gray-500">Atleta</p>

        {step === 'phone' ? (
          <form onSubmit={sendCode} className="space-y-5">
            <div>
              <label htmlFor="tel" className="mb-2 block text-xs font-bold uppercase text-gray-500">
                Tu celular
              </label>
              <input
                id="tel"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                placeholder="300 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-gray-300 bg-gray-100 p-3 text-base sm:text-sm text-center text-lg tracking-widest focus:border-primary dark:border-gray-700 dark:bg-black"
              />
              <p className="mt-2 text-xs text-gray-500">
                Te enviamos un código. Debe ser el mismo número que tiene tu box.
              </p>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Enviando…' : 'Enviar código'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-5">
            <div>
              <label htmlFor="otp" className="mb-2 block text-xs font-bold uppercase text-gray-500">
                Código recibido
              </label>
              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-gray-300 bg-gray-100 p-3 text-base sm:text-sm text-center text-2xl tracking-[0.5em] focus:border-primary dark:border-gray-700 dark:bg-black"
              />
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Validando…' : 'Entrar'}
            </Button>
            <Button variant="ghost" onClick={() => setStep('phone')} className="w-full">
              Cambiar número
            </Button>
          </form>
        )}

        <p className="mt-8 text-center text-sm text-gray-500">
          ¿Eres del equipo del box?{' '}
          <Link to="/entrar" className="font-bold text-primary hover:underline">
            Entra aquí
          </Link>
        </p>
      </div>
    </div>
  );
}
