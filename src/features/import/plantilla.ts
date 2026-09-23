import * as XLSX from 'xlsx';
import type { CampoDestino } from './parse';

/**
 * Plantilla de Excel para migrar un box. Las columnas son las mismas del Excel
 * con el que se llevaba el box en la primera versión (Clientes, Fecha de corte,
 * Cómo llegó y las marcas), más el celular, que esa versión nunca guardó y sin
 * el cual no hay cobro por WhatsApp ni acceso del atleta.
 *
 * Cada encabezado está escrito para que el importador lo reconozca solo: la
 * prueba de `plantilla.test.ts` lo garantiza, para que nadie renombre una
 * columna aquí y la deje huérfana.
 */
export const COLUMNAS_PLANTILLA: Array<{ encabezado: string; campo: CampoDestino; ancho: number }> = [
  { encabezado: 'Clientes', campo: 'full_name', ancho: 28 },
  { encabezado: 'Celular', campo: 'phone', ancho: 16 },
  { encabezado: 'Fecha de corte', campo: 'billing_day', ancho: 14 },
  { encabezado: 'Valor mensualidad', campo: 'price', ancho: 18 },
  { encabezado: 'Cómo llegó', campo: 'referral_source', ancho: 18 },
  { encabezado: 'Back Squat', campo: 'marca:back_squat', ancho: 12 },
  { encabezado: 'Front Squat', campo: 'marca:front_squat', ancho: 12 },
  { encabezado: 'Deadlift', campo: 'marca:deadlift', ancho: 12 },
  { encabezado: 'Bench Press', campo: 'marca:bench_press', ancho: 12 },
  { encabezado: 'Shoulder Press', campo: 'marca:shoulder_press', ancho: 14 },
  { encabezado: 'Push Press', campo: 'marca:push_press', ancho: 12 },
  { encabezado: 'Clean', campo: 'marca:clean_rm', ancho: 10 },
  { encabezado: 'Snatch', campo: 'marca:snatch_rm', ancho: 10 },
  { encabezado: 'Karen', campo: 'marca:karen', ancho: 10 },
  { encabezado: '100 Burpees', campo: 'marca:burpees_100', ancho: 12 },
];

const INSTRUCCIONES: string[][] = [
  ['Cómo llenar la hoja «Atletas»'],
  [''],
  ['Una fila por atleta. No cambies los encabezados; las columnas que no uses, déjalas vacías.'],
  [''],
  ['Clientes', 'Nombre y apellido. Ej.: Ana María Restrepo'],
  ['Celular', 'Con o sin +57. Ej.: 300 123 4567. Sin celular no se le puede cobrar por WhatsApp'],
  ['Fecha de corte', 'El día del mes en que paga, de 1 a 31. Ej.: 5'],
  ['Valor mensualidad', 'En pesos, sin decimales. Ej.: 180000'],
  ['Cómo llegó', 'Instagram, referido, pasó por el frente…'],
  ['Marcas de peso', 'En kilos. Sirve 120, 120 kg o 85,5'],
  ['Karen y 100 Burpees', 'Tiempo en minutos:segundos. Ej.: 8:30 (o 1:02:30 si pasa de una hora)'],
  [''],
  ['Si no tienes un dato, deja la celda vacía. Nunca escribas 0: una marca de 0 kg arruina las gráficas.'],
  ['Antes de guardar, la aplicación te muestra una vista previa y marca las filas con problemas.'],
];

/** Arma el libro de la plantilla. Separado de la descarga para poder probarlo. */
export function crearLibroPlantilla(): XLSX.WorkBook {
  const libro = XLSX.utils.book_new();

  const atletas = XLSX.utils.aoa_to_sheet([COLUMNAS_PLANTILLA.map((c) => c.encabezado)]);
  atletas['!cols'] = COLUMNAS_PLANTILLA.map((c) => ({ wch: c.ancho }));
  XLSX.utils.book_append_sheet(libro, atletas, 'Atletas');

  const instrucciones = XLSX.utils.aoa_to_sheet(INSTRUCCIONES);
  instrucciones['!cols'] = [{ wch: 22 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(libro, instrucciones, 'Instrucciones');

  return libro;
}

export function descargarPlantilla() {
  XLSX.writeFile(crearLibroPlantilla(), 'plantilla-atletas-scalar.xlsx');
}
