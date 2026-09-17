import { CAMPOS } from './parse';
import type { CampoDestino, GrupoCampo, MapeoColumnas as Mapeo } from './parse';
import { Select } from '../../shared/ui';

const GRUPOS: GrupoCampo[] = ['Atleta', 'Cobro', 'Marcas'];

/**
 * Mapeo de columnas, editable. El automático acierta casi siempre, pero
 * "casi siempre" no sirve cuando lo que se está migrando son los datos con los
 * que un box le cobra a su gente: el coach tiene que poder corregirlo y ver de
 * una vez qué dato hay en esa columna.
 */
export function MapeoColumnas({
  encabezados, mapeo, muestras, onCambio,
}: {
  encabezados: string[];
  mapeo: Mapeo;
  /** Primer valor no vacío de cada columna, para no mapear a ciegas. */
  muestras: string[];
  onCambio: (columna: number, campo: CampoDestino) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {encabezados.map((encabezado, columna) => {
        const campo = mapeo[columna] ?? 'ignorar';
        const ignorada = campo === 'ignorar';
        return (
          <div
            key={`${encabezado}-${columna}`}
            className={`grunge-border bg-surface-dark p-3 ${ignorada ? 'opacity-60' : ''}`}
          >
            <p className="truncate text-[11px] font-bold uppercase tracking-widest text-gray-500">
              {encabezado || `Columna ${columna + 1}`}
            </p>
            <p className="mb-2 truncate text-xs text-gray-600" title={muestras[columna]}>
              {muestras[columna] ? `ej.: ${muestras[columna]}` : 'sin datos en esta columna'}
            </p>
            <Select
              aria-label={`Campo para la columna ${encabezado || columna + 1}`}
              value={campo}
              onChange={(e) => onCambio(columna, e.target.value as CampoDestino)}
            >
              <option value="ignorar">— No importar —</option>
              {GRUPOS.map((grupo) => (
                <optgroup key={grupo} label={grupo}>
                  {CAMPOS.filter((c) => c.grupo === grupo).map((c) => (
                    <option key={c.campo} value={c.campo}>{c.etiqueta}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        );
      })}
    </div>
  );
}
