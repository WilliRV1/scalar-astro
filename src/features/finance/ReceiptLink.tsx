import { useState } from 'react';
import { supabase } from '../../shared/lib/supabase';

/**
 * Enlace a la foto de la factura.
 *
 * El bucket es privado, así que no hay una URL fija que poner en un href: se
 * pide una URL firmada con vencimiento en el momento del clic. Un minuto basta
 * para abrirla y no deja un enlace vivo circulando por ahí.
 *
 * La pestaña se abre ANTES del await: iOS bloquea un `window.open` que no
 * ocurra dentro del mismo tic del toque. Si aun así no abre, se muestra el
 * enlace para que la persona lo toque ella misma.
 */
export function ReceiptLink({ path, label = 'Factura' }: { path: string | null; label?: string }) {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState(false);
  const [enlace, setEnlace] = useState<string | null>(null);

  if (!path) return null;

  async function abrir() {
    if (!path) return;
    setAbriendo(true);
    setError(false);
    const ventana = window.open('', '_blank', 'noopener,noreferrer');
    const { data, error: err } = await supabase.storage.from('receipts').createSignedUrl(path, 60);
    setAbriendo(false);
    if (err || !data) {
      ventana?.close();
      return setError(true);
    }
    if (ventana) {
      ventana.location.href = data.signedUrl;
    } else {
      setEnlace(data.signedUrl);
    }
  }

  if (enlace) {
    return (
      <a
        href={enlace}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setEnlace(null)}
        className="inline-flex min-h-11 items-center px-3 text-[11px] font-bold uppercase tracking-widest text-primary underline"
      >
        Abrir {label.toLowerCase()}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void abrir()}
      disabled={abriendo}
      aria-label={`Ver ${label.toLowerCase()}`}
      className={`min-h-11 px-3 text-[11px] font-bold uppercase tracking-widest ${
        error ? 'text-primary' : 'text-gray-500 hover:text-primary'
      }`}
    >
      {abriendo ? 'Abriendo…' : error ? 'No se pudo abrir' : label}
    </button>
  );
}
