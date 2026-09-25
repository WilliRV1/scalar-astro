import { useEffect, useState } from 'react';
import {
  corriendoInstalada,
  guardarRechazo,
  rechazoGuardado,
  type EventoDeInstalacion,
} from './instalacion';

/**
 * Ofrece instalar la aplicación. Una franja discreta abajo, nunca un modal.
 *
 * Regla de producto (docs/08 § 7.3): **el atleta no tiene que instalar nada**.
 * Reservar, entrar a la lista de espera y pagar se hacen por WhatsApp. Esto es
 * una comodidad para quien entra todos los días —el dueño y los coaches—, no un
 * peaje. Por eso: se ofrece una vez, se puede cerrar, y cerrarlo es definitivo.
 */
export function InstalarApp({ className = '' }: { className?: string }) {
  const [evento, setEvento] = useState<EventoDeInstalacion | null>(null);
  const [oculto, setOculto] = useState(() => corriendoInstalada() || rechazoGuardado());

  useEffect(() => {
    const alPoderInstalar = (e: Event) => {
      // Sin esto el navegador muestra su propia barra, que aparece y desaparece
      // sin control y encima de la interfaz.
      e.preventDefault();
      setEvento(e as EventoDeInstalacion);
    };
    const alInstalar = () => {
      setEvento(null);
      setOculto(true);
    };

    window.addEventListener('beforeinstallprompt', alPoderInstalar);
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alPoderInstalar);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  if (oculto || !evento) return null;

  const instalar = async () => {
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === 'dismissed') guardarRechazo();
    setEvento(null);
    setOculto(true);
  };

  const noGracias = () => {
    guardarRechazo();
    setOculto(true);
  };

  return (
    <div
      className={`grunge-border flex flex-wrap items-center gap-3 bg-surface-dark p-4 ${className}`}
      role="region"
      aria-label="Instalar la aplicación"
    >
      <div className="min-w-[12rem] flex-1">
        <p className="font-display text-xl text-white">Ten el box a un toque</p>
        <p className="text-xs text-gray-400">
          Instálala en tu celular para abrirla sin buscar el navegador. Es opcional: todo lo
          importante te sigue llegando por WhatsApp.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void instalar()}
          className="bg-primary px-4 py-2 font-display text-lg tracking-wide text-sobre-primario transition hover:bg-primario-flotante"
        >
          Instalar
        </button>
        <button
          type="button"
          onClick={noGracias}
          className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-500 transition hover:text-gray-300"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
