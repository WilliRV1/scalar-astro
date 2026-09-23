import { useRef, useState } from 'react';
import { ErrorNote, Spinner } from '../../shared/ui';
import { descargarPlantilla } from './plantilla';

/**
 * Subida del archivo. Se rescató del prototipo lo que funcionaba: una zona
 * grande, arrastrar y soltar, y nada más en pantalla. El coach hace esto una
 * sola vez en su vida y normalmente con el celular en la otra mano.
 */
export function ZonaArchivo({
  onArchivo, error, cargando,
}: {
  onArchivo: (archivo: File) => void;
  error?: string;
  cargando?: boolean;
}) {
  const [encima, setEncima] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function tomar(archivo: File | undefined | null) {
    if (archivo) onArchivo(archivo);
  }

  if (cargando) return <Spinner label="Leyendo el archivo" />;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); tomar(e.dataTransfer.files?.[0]); }}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
        role="button"
        tabIndex={0}
        className={`grunge-border cursor-pointer bg-surface-dark px-6 py-14 text-center transition ${
          encima ? 'border-primary bg-primary/10' : 'hover:border-primary/60'
        }`}
      >
        <p className="font-display text-3xl text-white">Arrastra aquí el Excel del box</p>
        <p className="mt-2 text-sm text-gray-500">o toca para buscarlo en el dispositivo</p>
        <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-gray-600">
          .xlsx · .xls · .csv
        </p>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => tomar(e.target.files?.[0])}
        />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grunge-border bg-surface-dark p-4 text-sm text-gray-400">
        <p className="font-display text-xl text-white">Cómo debe venir la hoja</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
          <li>Una fila por atleta y una fila de encabezados (no importa si está abajo del título del box).</li>
          <li>Los nombres de las columnas se reconocen solos: «Nombre», «Celular», «Fecha de corte», «Valor», «Back Squat»…</li>
          <li>Lo que no se reconozca se puede asignar a mano en el siguiente paso.</li>
          <li>Nada se guarda hasta que revises la vista previa.</li>
        </ul>
        <button
          type="button"
          onClick={descargarPlantilla}
          className="mt-4 text-xs font-bold uppercase tracking-widest text-primary hover:underline"
        >
          Descargar plantilla de Excel
        </button>
        <p className="mt-1 text-xs text-gray-500">
          Trae las mismas columnas del Excel de la primera versión, más el celular. Si ya tienes
          tu archivo de siempre, súbelo tal cual: no hace falta pasarlo a la plantilla.
        </p>
      </div>
    </div>
  );
}
