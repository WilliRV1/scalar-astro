import { useState } from 'react';
import { ErrorNote } from '../../shared/ui';
import { enlaceInvitacion } from './permissions';

/**
 * El enlace de la invitación, para copiarlo y mandarlo.
 *
 * Todavía no hay envío de correo (Resend entra en la fase 2, ver docs/02). Se
 * dice en pantalla en vez de simular que se mandó algo: un box que cree que el
 * correo salió se queda esperando y culpa al producto.
 */
export function InvitationLink({ token, email }: { token: string; email: string }) {
  const enlace = enlaceInvitacion(token);
  const [copiado, setCopiado] = useState(false);
  const [errorCopia, setErrorCopia] = useState('');

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setErrorCopia('');
    } catch {
      // Sin HTTPS o sin permiso del navegador no hay portapapeles.
      setErrorCopia('Tu navegador no dejó copiar. Selecciona el enlace y cópialo a mano.');
    }
  }

  const mensaje =
    `¡Bienvenido al equipo! Entra a este enlace con el correo ${email} para activar tu cuenta: ${enlace}`;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">
        Invitación creada para <span className="font-bold text-white">{email}</span>.
      </p>

      <div className="grunge-border bg-black/40 p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
          Enlace de invitación
        </p>
        <p className="select-all break-all font-mono text-xs text-gray-300">{enlace}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copiar()}
          className="grunge-border min-h-11 px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-300 hover:border-primary hover:text-primary"
        >
          {copiado ? 'Copiado ✓' : 'Copiar enlace'}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
          target="_blank"
          rel="noreferrer"
          className="grunge-border inline-flex min-h-11 items-center px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-300 hover:border-primary hover:text-primary"
        >
          Mandar por WhatsApp
        </a>
      </div>

      {errorCopia && <ErrorNote>{errorCopia}</ErrorNote>}

      <p className="border-l-4 border-gray-700 bg-black/20 px-3 py-2 text-xs text-gray-500">
        <span className="font-bold text-gray-400">Ojo:</span> todavía no mandamos el correo
        automáticamente. Copia el enlace y mándaselo tú por WhatsApp. Solo sirve para el correo{' '}
        <span className="text-gray-400">{email}</span> y vence en 14 días.
      </p>
    </div>
  );
}
