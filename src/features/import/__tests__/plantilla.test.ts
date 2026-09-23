import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { mapearColumnas, sugerirCampo } from '../parse';
import { COLUMNAS_PLANTILLA, crearLibroPlantilla } from '../plantilla';

describe('plantilla de importación', () => {
  it('cada encabezado de la plantilla lo reconoce el importador solo', () => {
    for (const { encabezado, campo } of COLUMNAS_PLANTILLA) {
      expect(sugerirCampo(encabezado), encabezado).toBe(campo);
    }
  });

  it('la hoja de atletas va primero y trae exactamente esos encabezados', () => {
    const libro = crearLibroPlantilla();
    expect(libro.SheetNames[0]).toBe('Atletas');
    const filas = XLSX.utils.sheet_to_json<string[]>(libro.Sheets.Atletas, { header: 1 });
    expect(filas).toEqual([COLUMNAS_PLANTILLA.map((c) => c.encabezado)]);
  });
});

describe('Excel de la primera versión', () => {
  // Los encabezados que reconocía el importador del prototipo
  // (src/legacy/ExcelImport.tsx). El entrenador sube el mismo archivo de
  // siempre: ninguno de ellos puede quedar sin destino.
  const ENCABEZADOS_PROTOTIPO: Record<string, string> = {
    Clientes: 'full_name', Cliente: 'full_name', Nombre: 'full_name', Name: 'full_name',
    'Fecha de corte': 'billing_day', fecha_de_corte: 'billing_day', Corte: 'billing_day',
    'Como llego': 'referral_source', 'Cómo llegó': 'referral_source',
    Referido: 'referral_source', Referral: 'referral_source',
    'Back squat': 'marca:back_squat', Backsquat: 'marca:back_squat',
    'Bench press': 'marca:bench_press', Benchpress: 'marca:bench_press', Bench: 'marca:bench_press',
    Deadlift: 'marca:deadlift', 'Peso muerto': 'marca:deadlift',
    'Shoulder press': 'marca:shoulder_press', 'Shoulder P': 'marca:shoulder_press',
    'Press hombro': 'marca:shoulder_press',
    'Front squat': 'marca:front_squat', Frontsquat: 'marca:front_squat',
    Clean: 'marca:clean_rm', 'Clean RM': 'marca:clean_rm',
    'Push press': 'marca:push_press', Pushpress: 'marca:push_press',
    Karen: 'marca:karen',
    '100 burpees': 'marca:burpees_100', Burpees: 'marca:burpees_100', burpees_100: 'marca:burpees_100',
  };

  it('reconoce todos los encabezados que aceptaba el prototipo', () => {
    for (const [encabezado, campo] of Object.entries(ENCABEZADOS_PROTOTIPO)) {
      expect(sugerirCampo(encabezado), encabezado).toBe(campo);
    }
  });

  it('mapea la hoja completa tal como la llevaba el entrenador', () => {
    const mapeo = mapearColumnas([
      'Clientes', 'Fecha de corte', 'Como llego', 'Back squat', 'Bench press', 'Deadlift',
      'Shoulder press', 'Front squat', 'Clean', 'Push press', 'Karen', '100 burpees',
    ]);
    expect(Object.values(mapeo)).toEqual([
      'full_name', 'billing_day', 'referral_source', 'marca:back_squat', 'marca:bench_press',
      'marca:deadlift', 'marca:shoulder_press', 'marca:front_squat', 'marca:clean_rm',
      'marca:push_press', 'marca:karen', 'marca:burpees_100',
    ]);
  });
});
