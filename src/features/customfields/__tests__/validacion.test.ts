import { describe, expect, it } from 'vitest';
import {
  estaVacio, textoDelValor, validarCampos, valoresParaFormulario,
} from '../validacion';
import type { DefinicionCampo, TipoCampo } from '../types';

/**
 * La misma regla que aplica el formulario, el importador de Excel y —en su
 * versión estricta— el trigger de la base. Lo que se prueba aquí es lo que
 * produce pérdida de datos: un número vacío que se vuelve 0, un teléfono que se
 * anula en silencio, un valor de un campo desactivado que desaparece al guardar.
 */

let n = 0;
function def(parcial: Partial<DefinicionCampo> & { key: string; field_type: TipoCampo }): DefinicionCampo {
  n += 1;
  return {
    id: `id-${n}`,
    org_id: 'org-1',
    label: parcial.label ?? parcial.key,
    options: [],
    is_required: false,
    is_sensitive: false,
    help_text: null,
    sort_order: n,
    is_active: true,
    created_at: '2026-09-23T00:00:00Z',
    updated_at: '2026-09-23T00:00:00Z',
    ...parcial,
  };
}

describe('validarCampos · texto', () => {
  const defs = [def({ key: 'acudiente', label: 'Acudiente', field_type: 'text' })];

  it('recorta los espacios que sobran', () => {
    const r = validarCampos(defs, { acudiente: '  María Pérez  ' });
    expect(r.ok).toBe(true);
    expect(r.valores.acudiente).toBe('María Pérez');
  });

  it('descarta la clave cuando no se escribió nada, en vez de guardar ""', () => {
    const r = validarCampos(defs, { acudiente: '   ' });
    expect(r.ok).toBe(true);
    expect('acudiente' in r.valores).toBe(false);
  });

  it('rechaza un texto desmesurado', () => {
    const r = validarCampos(defs, { acudiente: 'a'.repeat(501) });
    expect(r.ok).toBe(false);
    expect(r.errores.acudiente).toContain('500');
  });
});

describe('validarCampos · número', () => {
  const defs = [def({ key: 'peso', label: 'Peso objetivo', field_type: 'number' })];

  it('acepta la coma decimal que escribe media Colombia', () => {
    expect(validarCampos(defs, { peso: '72,5' }).valores.peso).toBe(72.5);
  });

  it('devuelve un número, no una cadena', () => {
    expect(typeof validarCampos(defs, { peso: '80' }).valores.peso).toBe('number');
  });

  /**
   * La trampa que ya costó cara: `Number('')` es 0. Un campo numérico vacío que
   * se guarde como 0 es una marca de 0 kg que arruina promedios y gráficas, y
   * que ninguna validación posterior atrapa porque parsea limpiamente.
   */
  it('NO convierte el vacío en 0', () => {
    const r = validarCampos(defs, { peso: '' });
    expect(r.ok).toBe(true);
    expect('peso' in r.valores).toBe(false);
  });

  it('respeta un 0 que la persona sí escribió', () => {
    expect(validarCampos(defs, { peso: '0' }).valores.peso).toBe(0);
  });

  it('rechaza un número con letras', () => {
    const r = validarCampos(defs, { peso: '72 kilos' });
    expect(r.ok).toBe(false);
    expect(r.errores.peso).toContain('espera un número');
  });

  it('rechaza un número con basura alrededor', () => {
    expect(validarCampos(defs, { peso: '~80' }).ok).toBe(false);
  });

  it('acepta negativos', () => {
    expect(validarCampos(defs, { peso: '-3' }).valores.peso).toBe(-3);
  });
});

describe('validarCampos · fecha', () => {
  const defs = [def({ key: 'revision', label: 'Revisión médica', field_type: 'date' })];

  it('acepta una fecha ISO', () => {
    expect(validarCampos(defs, { revision: '2026-03-15' }).valores.revision).toBe('2026-03-15');
  });

  it('rechaza el formato colombiano suelto', () => {
    const r = validarCampos(defs, { revision: '15/03/2026' });
    expect(r.ok).toBe(false);
    expect(r.errores.revision).toContain('AAAA-MM-DD');
  });

  it('rechaza una fecha que tiene forma de fecha pero no existe', () => {
    const r = validarCampos(defs, { revision: '2026-02-31' });
    expect(r.ok).toBe(false);
    expect(r.errores.revision).toContain('no existe');
  });
});

describe('validarCampos · sí/no', () => {
  const defs = [def({ key: 'firmo', label: 'Firmó en papel', field_type: 'boolean' })];

  it('entiende lo que la gente escribe en un Excel', () => {
    expect(validarCampos(defs, { firmo: 'Sí' }).valores.firmo).toBe(true);
    expect(validarCampos(defs, { firmo: 'no' }).valores.firmo).toBe(false);
    expect(validarCampos(defs, { firmo: 'X' }).valores.firmo).toBe(true);
  });

  it('acepta el booleano de la casilla del formulario', () => {
    expect(validarCampos(defs, { firmo: true }).valores.firmo).toBe(true);
    expect(validarCampos(defs, { firmo: false }).valores.firmo).toBe(false);
  });

  it('rechaza lo que no es ni sí ni no', () => {
    const r = validarCampos(defs, { firmo: 'quizás' });
    expect(r.ok).toBe(false);
    expect(r.errores.firmo).toContain('sí o no');
  });
});

describe('validarCampos · lista de una opción', () => {
  const defs = [def({
    key: 'talla', label: 'Talla', field_type: 'select', options: ['XS', 'S', 'M', 'L'],
  })];

  it('acepta una opción de la lista', () => {
    expect(validarCampos(defs, { talla: 'M' }).valores.talla).toBe('M');
  });

  it('rechaza una opción que no está, y dice cuáles valen', () => {
    const r = validarCampos(defs, { talla: 'XXXL' });
    expect(r.ok).toBe(false);
    expect(r.errores.talla).toContain('XS, S, M, L');
  });
});

describe('validarCampos · lista de varias opciones', () => {
  const defs = [def({
    key: 'clases', label: 'Clases favoritas', field_type: 'multiselect',
    options: ['Halterofilia', 'Gimnásticos', 'Resistencia'],
  })];

  it('acepta el arreglo del formulario', () => {
    expect(validarCampos(defs, { clases: ['Halterofilia', 'Resistencia'] }).valores.clases)
      .toEqual(['Halterofilia', 'Resistencia']);
  });

  it('parte la celda del Excel en opciones', () => {
    expect(validarCampos(defs, { clases: 'Halterofilia, Resistencia' }).valores.clases)
      .toEqual(['Halterofilia', 'Resistencia']);
  });

  it('empareja sin tildes ni mayúsculas y guarda la opción canónica', () => {
    expect(validarCampos(defs, { clases: 'gimnasticos' }).valores.clases)
      .toEqual(['Gimnásticos']);
  });

  it('no guarda la misma opción dos veces', () => {
    expect(validarCampos(defs, { clases: ['Resistencia', 'Resistencia'] }).valores.clases)
      .toEqual(['Resistencia']);
  });

  it('rechaza una opción inventada', () => {
    expect(validarCampos(defs, { clases: ['Zumba'] }).ok).toBe(false);
  });
});

describe('validarCampos · celular', () => {
  const defs = [def({ key: 'cel', label: 'Celular del acudiente', field_type: 'phone' })];

  it('normaliza a E.164 lo que escribe la gente', () => {
    expect(validarCampos(defs, { cel: '300 123 4567' }).valores.cel).toBe('+573001234567');
  });

  /**
   * La misma regresión que el teléfono del atleta: un número mal escrito que se
   * guarda como null deja a ese atleta sin recordatorio de pago y nadie se
   * entera. Escribir algo ilegible es un ERROR, no un campo vacío.
   */
  it('RECHAZA un celular que no se entiende en vez de anularlo', () => {
    const r = validarCampos(defs, { cel: '123' });
    expect(r.ok).toBe(false);
    expect(r.errores.cel).toContain('no se entiende');
  });

  it('acepta que no haya celular', () => {
    const r = validarCampos(defs, { cel: '' });
    expect(r.ok).toBe(true);
    expect('cel' in r.valores).toBe(false);
  });
});

describe('validarCampos · obligatorios', () => {
  const defs = [def({ key: 'talla', label: 'Talla', field_type: 'text', is_required: true })];

  it('exige el dato y nombra el campo tal como lo ve el usuario', () => {
    const r = validarCampos(defs, {});
    expect(r.ok).toBe(false);
    expect(r.errores.talla).toBe('El campo "Talla" es obligatorio.');
  });

  it('trata null, undefined y espacios como el mismo vacío', () => {
    expect(validarCampos(defs, { talla: null }).ok).toBe(false);
    expect(validarCampos(defs, { talla: undefined }).ok).toBe(false);
    expect(validarCampos(defs, { talla: '  ' }).ok).toBe(false);
  });

  it('pasa cuando el dato está', () => {
    expect(validarCampos(defs, { talla: 'M' }).ok).toBe(true);
  });
});

describe('validarCampos · campos desactivados y ámbitos', () => {
  const defs = [
    def({ key: 'talla', label: 'Talla', field_type: 'text' }),
    def({ key: 'acudiente', label: 'Acudiente', field_type: 'text', is_active: false, is_required: true }),
    def({ key: 'lesion', label: 'Lesión', field_type: 'text', is_sensitive: true }),
  ];

  /** Desactivar un campo no puede borrar lo que el box ya había escrito. */
  it('conserva intacto el valor de un campo desactivado', () => {
    const r = validarCampos(defs, { talla: 'M', acudiente: 'María' }, 'normales');
    expect(r.ok).toBe(true);
    expect(r.valores.acudiente).toBe('María');
  });

  it('y no le exige nada aunque estuviera marcado como obligatorio', () => {
    expect(validarCampos(defs, { talla: 'M' }, 'normales').ok).toBe(true);
  });

  it('conserva también una clave de un campo que ya ni existe', () => {
    const r = validarCampos(defs, { talla: 'M', campo_borrado_en_2025: 'algo' }, 'normales');
    expect(r.valores.campo_borrado_en_2025).toBe('algo');
  });

  it('el ámbito "normales" no toca los campos sensibles', () => {
    const r = validarCampos(defs, { talla: 'M', lesion: 'Hombro' }, 'normales');
    // Viaja sin validar: quien lo guarde en athletes.custom será rechazado por
    // la base, que es donde esa frontera se impone de verdad.
    expect(r.ok).toBe(true);
  });

  it('el ámbito "sensibles" valida solo los sensibles', () => {
    const r = validarCampos(defs, { lesion: '  Hombro derecho  ' }, 'sensibles');
    expect(r.valores.lesion).toBe('Hombro derecho');
  });
});

describe('utilidades', () => {
  it('estaVacio reconoce todas las caras del vacío', () => {
    expect(estaVacio('')).toBe(true);
    expect(estaVacio('   ')).toBe(true);
    expect(estaVacio(null)).toBe(true);
    expect(estaVacio(undefined)).toBe(true);
    expect(estaVacio([])).toBe(true);
    expect(estaVacio(['  '])).toBe(true);
    expect(estaVacio('0')).toBe(false);
    expect(estaVacio(false)).toBe(false);
  });

  it('valoresParaFormulario convierte lo guardado en lo que quieren los inputs', () => {
    const defs = [
      def({ key: 'peso', field_type: 'number' }),
      def({ key: 'firmo', field_type: 'boolean' }),
      def({ key: 'clases', field_type: 'multiselect', options: ['A'] }),
      def({ key: 'vacio', field_type: 'text' }),
    ];
    const v = valoresParaFormulario(defs, { peso: 72.5, firmo: true, clases: ['A'] });
    expect(v.peso).toBe('72.5');
    expect(v.firmo).toBe(true);
    expect(v.clases).toEqual(['A']);
    expect(v.vacio).toBe('');
  });

  it('textoDelValor deja la ficha legible', () => {
    const booleano = def({ key: 'firmo', field_type: 'boolean' });
    const lista = def({ key: 'clases', field_type: 'multiselect', options: ['A', 'B'] });
    const texto = def({ key: 'acudiente', field_type: 'text' });
    expect(textoDelValor(booleano, true)).toBe('Sí');
    expect(textoDelValor(booleano, false)).toBe('No');
    expect(textoDelValor(lista, ['A', 'B'])).toBe('A, B');
    expect(textoDelValor(texto, null)).toBe('—');
  });
});

describe('ida y vuelta', () => {
  /**
   * Lo que sale del formulario tiene que poder volver a entrar sin cambiar. Si
   * no, cada edición de la ficha degrada el dato un poco más.
   */
  it('validar dos veces da el mismo resultado', () => {
    const defs = [
      def({ key: 'peso', field_type: 'number' }),
      def({ key: 'cel', field_type: 'phone' }),
      def({ key: 'talla', field_type: 'select', options: ['S', 'M'] }),
      def({ key: 'firmo', field_type: 'boolean' }),
    ];
    const primera = validarCampos(defs, {
      peso: '72,5', cel: '300 123 4567', talla: 'M', firmo: 'sí',
    });
    const segunda = validarCampos(defs, primera.valores);
    expect(segunda.ok).toBe(true);
    expect(segunda.valores).toEqual(primera.valores);
  });
});
