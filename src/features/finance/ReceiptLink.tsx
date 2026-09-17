import { useState } from 'react';
import { supabase } from '../../shared/lib/supabase';

/**
 * Enlace a la foto de la factura.
 *
 * El bucket es privado, así que no hay una URL fija que poner en un href: se
 * pide una URL firmada con vencimiento en el momento del clic. Un minuto basta
 * para abrirla y no deja un enlace vivo circulando por ahí.
 */
export function ReceiptLink({ path, label = 'Factura' }: { path: string | null; label?: string }) {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState(false);

  if (!path) return null;

  async function abrir() {
    if (!path) return;
    setAbriendo(true);
    setError(false);
    const { data, error: err } = await supabase.storage.from('receipts').createSignedUrl(path, 60);
    setAbriendo(false);
    if (err || !data) return setError(true);
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      type="button"
      onClick={() => void abrir()}
      disabled={abriendo}
      className={`text-[11px] font-bold uppercase tracking-widest ${
        error ? 'text-primary' : 'text-gray-500 hover:text-primary'
      }`}
    >
      {abriendo ? 'Abriendo…' : error ? 'No se pudo abrir' : label}
    </button>
  );
}
