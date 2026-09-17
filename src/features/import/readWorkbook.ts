import * as XLSX from 'xlsx';
import { celdaATexto, filaVacia } from './parse';

/**
 * Lectura del archivo .xlsx/.csv. Lo único que hace es entregar una matriz de
 * celdas; interpretar lo que hay dentro es trabajo de `parse.ts`.
 *
 * Se leen los valores *formateados* (`raw: false`), es decir lo que la persona
 * ve en la celda. Es a propósito: un "8:30" que Excel guarda como 0,354 de día
 * significa ocho minutos y medio para el coach, no las 8:30 de la mañana, y lo
 * que hay que respetar es lo que el coach escribió.
 */

export interface HojaCruda {
  nombre: string;
  matriz: unknown[][];
}

/** Tope de filas por hoja. Un box con más de esto migra por soporte, no solo. */
export const MAXIMO_FILAS = 5000;

export async function leerArchivo(archivo: File): Promise<HojaCruda[]> {
  const datos = new Uint8Array(await archivo.arrayBuffer());
  const libro = XLSX.read(datos, { type: 'array' });

  return libro.SheetNames.map((nombre) => {
    const hoja = libro.Sheets[nombre];
    const matriz = XLSX.utils
      .sheet_to_json<unknown[]>(hoja, { header: 1, raw: false, defval: '', blankrows: false })
      .filter((fila) => Array.isArray(fila) && !filaVacia(fila))
      .slice(0, MAXIMO_FILAS)
      .map((fila) => fila.map((celda) => celdaATexto(celda)));
    return { nombre, matriz };
  });
}
