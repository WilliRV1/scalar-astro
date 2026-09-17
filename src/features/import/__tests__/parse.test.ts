import { describe, expect, it } from 'vitest';
import {
  analizarArchivo,
  claveNombre,
  detectarDuplicados,
  esCeldaVacia,
  mapearColumnas,
  normalizarCapitalizacion,
  normalizarEncabezado,
  normalizarFila,
  parseDiaDeCorte,
  parseEstado,
  parseFechaISO,
  parsePrecioCents,
  parseValorMarca,
  partirNombre,
  resumirFilas,
  sugerirCampo,
} from '../parse';
import type { AtletaExistente, MapeoColumnas } from '../parse';

// ---------------------------------------------------------------------------
// Encabezados y mapeo automático
// ---------------------------------------------------------------------------

describe('normalizarEncabezado', () => {
  it('quita tildes, signos y mayúsculas', () => {
    expect(normalizarEncabezado('¿Cómo llegó?')).toBe('como llego');
    expect(normalizarEncabezado('  FECHA DE CORTE  ')).toBe('fecha de corte');
    expect(normalizarEncabezado('Back Squat (Kg)')).toBe('back squat kg');
  });
});

describe('sugerirCampo', () => {
  it('reconoce las variantes en español del nombre', () => {
    expect(sugerirCampo('Nombre')).toBe('full_name');
    expect(sugerirCampo('Nombre completo')).toBe('full_name');
    expect(sugerirCampo('CLIENTES')).toBe('full_name');
    expect(sugerirCampo('Atleta')).toBe('full_name');
  });

  it('reconoce el celular escrito de cualquier forma', () => {
    expect(sugerirCampo('celular')).toBe('phone');
    expect(sugerirCampo('Teléfono')).toBe('phone');
    expect(sugerirCampo('WhatsApp')).toBe('phone');
    expect(sugerirCampo('Número de contacto')).toBe('phone');
    expect(sugerirCampo('Cel.')).toBe('phone');
  });

  it('reconoce la fecha de corte y el valor de la mensualidad', () => {
    expect(sugerirCampo('Fecha de corte')).toBe('billing_day');
    expect(sugerirCampo('Corte')).toBe('billing_day');
    expect(sugerirCampo('Día de pago')).toBe('billing_day');
    expect(sugerirCampo('Valor')).toBe('price');
    expect(sugerirCampo('Mensualidad')).toBe('price');
    expect(sugerirCampo('Valor mensualidad')).toBe('price');
    expect(sugerirCampo('Plan')).toBe('plan_name');
  });

  it('el alias más específico le gana al más corto', () => {
    // "Nombre del plan" contiene "nombre", pero es el plan.
    expect(sugerirCampo('Nombre del plan')).toBe('plan_name');
    // "Fecha de pago" contiene "pago", pero es la fecha de corte.
    expect(sugerirCampo('Fecha de pago')).toBe('billing_day');
  });

  it('reconoce los movimientos en inglés y en español', () => {
    expect(sugerirCampo('Back Squat')).toBe('marca:back_squat');
    expect(sugerirCampo('SENTADILLA')).toBe('marca:back_squat');
    expect(sugerirCampo('1RM Back Squat (kg)')).toBe('marca:back_squat');
    expect(sugerirCampo('Sentadilla frontal')).toBe('marca:front_squat');
    expect(sugerirCampo('Peso muerto')).toBe('marca:deadlift');
    expect(sugerirCampo('Press de banca')).toBe('marca:bench_press');
    expect(sugerirCampo('Shoulder P')).toBe('marca:shoulder_press');
    expect(sugerirCampo('Karen')).toBe('marca:karen');
    expect(sugerirCampo('100 Burpees')).toBe('marca:burpees_100');
    expect(sugerirCampo('Arranque')).toBe('marca:snatch_rm');
  });

  it('ignora lo que no reconoce', () => {
    expect(sugerirCampo('Observaciones del coach')).toBe('ignorar');
    expect(sugerirCampo('')).toBe('ignorar');
  });
});

describe('mapearColumnas', () => {
  it('mapea una hoja real de un box', () => {
    const mapeo = mapearColumnas([
      'Clientes', 'Celular', 'Fecha de Corte', 'Valor Mensualidad',
      'Cómo llegó', 'Back Squat', 'Karen', 'Notas',
    ]);
    expect(mapeo).toEqual({
      0: 'full_name',
      1: 'phone',
      2: 'billing_day',
      3: 'price',
      4: 'referral_source',
      5: 'marca:back_squat',
      6: 'marca:karen',
      7: 'ignorar',
    });
  });

  it('si dos columnas apuntan al mismo campo se queda la primera', () => {
    const mapeo = mapearColumnas(['Celular', 'Teléfono']);
    expect(mapeo[0]).toBe('phone');
    expect(mapeo[1]).toBe('ignorar');
  });
});

// ---------------------------------------------------------------------------
// Conversión de valores de marcas
// ---------------------------------------------------------------------------

describe('parseValorMarca', () => {
  it('lee pesos con y sin unidad', () => {
    expect(parseValorMarca('120', 'weight')).toBe(120);
    expect(parseValorMarca('120 kg', 'weight')).toBe(120);
    expect(parseValorMarca('120kg', 'weight')).toBe(120);
    expect(parseValorMarca(' 120 Kg ', 'weight')).toBe(120);
  });

  it('acepta la coma decimal colombiana', () => {
    expect(parseValorMarca('85,5', 'weight')).toBe(85.5);
    expect(parseValorMarca('85.5', 'weight')).toBe(85.5);
    expect(parseValorMarca('85,5 kg', 'weight')).toBe(85.5);
  });

  it('convierte tiempos a segundos', () => {
    expect(parseValorMarca('8:30', 'time')).toBe(510);
    expect(parseValorMarca('1:02:30', 'time')).toBe(3750);
    expect(parseValorMarca('12:00', 'time')).toBe(720);
    expect(parseValorMarca('8:30 min', 'time')).toBe(510);
    // Un tiempo sin dos puntos ya viene en segundos, como en la migración SQL.
    expect(parseValorMarca('510', 'time')).toBe(510);
  });

  it('descarta el texto que no es un número, nunca lo vuelve 0', () => {
    for (const sucio of ['muchos', 'n/a', 'N/A', '-', '', '   ', 'no tiene', '?', 'pendiente por medir']) {
      expect(parseValorMarca(sucio, 'weight')).toBeNull();
      expect(parseValorMarca(sucio, 'time')).toBeNull();
    }
  });

  it('un tiempo ilegible no se convierte en peso', () => {
    expect(parseValorMarca('rápido', 'time')).toBeNull();
    expect(parseValorMarca('8.30', 'time')).toBeNull();
  });

  it('entiende las horas que Excel guarda como fracción de día', () => {
    // 8:30 = 510 s = 510/86400 de día
    expect(parseValorMarca(510 / 86400, 'time')).toBe(510);
  });

  it('acepta celdas que ya vienen numéricas', () => {
    expect(parseValorMarca(102.5, 'weight')).toBe(102.5);
    expect(parseValorMarca(0, 'weight')).toBe(0);
  });
});

describe('esCeldaVacia', () => {
  it('reconoce las formas de decir "no hay dato"', () => {
    expect(esCeldaVacia('')).toBe(true);
    expect(esCeldaVacia(null)).toBe(true);
    expect(esCeldaVacia(undefined)).toBe(true);
    expect(esCeldaVacia('-')).toBe(true);
    expect(esCeldaVacia('N/A')).toBe(true);
    expect(esCeldaVacia('S/D')).toBe(true);
    expect(esCeldaVacia('120')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fecha de corte, precio, fechas, estado
// ---------------------------------------------------------------------------

describe('parseDiaDeCorte', () => {
  it('lee el día tal cual cuando está en rango', () => {
    expect(parseDiaDeCorte('5')).toEqual({ dia: 5, ajustado: false });
    expect(parseDiaDeCorte('día 15')).toEqual({ dia: 15, ajustado: false });
    expect(parseDiaDeCorte(15)).toEqual({ dia: 15, ajustado: false });
    expect(parseDiaDeCorte('5 de cada mes')).toEqual({ dia: 5, ajustado: false });
  });

  it('ajusta lo que está fuera de 1–31 y lo reporta', () => {
    expect(parseDiaDeCorte('35')).toEqual({ dia: 31, ajustado: true });
    expect(parseDiaDeCorte('0')).toEqual({ dia: 1, ajustado: true });
  });

  it('devuelve null cuando no hay número', () => {
    expect(parseDiaDeCorte('')).toEqual({ dia: null, ajustado: false });
    expect(parseDiaDeCorte('cuando puede')).toEqual({ dia: null, ajustado: false });
  });
});

describe('parsePrecioCents', () => {
  it('lee los formatos colombianos', () => {
    expect(parsePrecioCents('180.000')).toBe(18_000_000);
    expect(parsePrecioCents('$ 180.000')).toBe(18_000_000);
    expect(parsePrecioCents('180000')).toBe(18_000_000);
    expect(parsePrecioCents(180000)).toBe(18_000_000);
  });

  it('no confunde el separador de miles en inglés con decimales', () => {
    expect(parsePrecioCents('180,000')).toBe(18_000_000);
    expect(parsePrecioCents('$180,000.00')).toBe(18_000_000);
  });

  it('descarta lo que no es plata', () => {
    expect(parsePrecioCents('gratis')).toBeNull();
    expect(parsePrecioCents('-')).toBeNull();
  });
});

describe('parseFechaISO', () => {
  it('lee el formato colombiano día/mes/año', () => {
    expect(parseFechaISO('15/03/2024')).toBe('2024-03-15');
    expect(parseFechaISO('01-02-2023')).toBe('2023-02-01');
    expect(parseFechaISO('2024-03-15')).toBe('2024-03-15');
  });

  it('invierte cuando el archivo venía en formato gringo', () => {
    expect(parseFechaISO('3/15/2024')).toBe('2024-03-15');
  });

  it('completa los años de dos cifras', () => {
    expect(parseFechaISO('10/07/85')).toBe('1985-07-10');
    expect(parseFechaISO('10/07/05')).toBe('2005-07-10');
  });

  it('rechaza fechas imposibles y basura', () => {
    expect(parseFechaISO('31/02/2024')).toBeNull();
    expect(parseFechaISO('el año pasado')).toBeNull();
    expect(parseFechaISO('')).toBeNull();
  });
});

describe('parseEstado', () => {
  it('traduce lo que escriben los boxes', () => {
    expect(parseEstado('Activo')).toBe('active');
    expect(parseEstado('al día')).toBe('active');
    expect(parseEstado('EN MORA')).toBe('overdue');
    expect(parseEstado('congelado')).toBe('frozen');
    expect(parseEstado('Retirado')).toBe('churned');
    expect(parseEstado('prueba')).toBe('trial');
    expect(parseEstado('quién sabe')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Nombres
// ---------------------------------------------------------------------------

describe('partirNombre', () => {
  it('parte nombre y apellidos como se escribe en Colombia', () => {
    expect(partirNombre('Ana Pérez')).toEqual({ first_name: 'Ana', last_name: 'Pérez' });
    expect(partirNombre('Ana Pérez Gómez')).toEqual({ first_name: 'Ana', last_name: 'Pérez Gómez' });
    expect(partirNombre('Juan Carlos Pérez Gómez'))
      .toEqual({ first_name: 'Juan Carlos', last_name: 'Pérez Gómez' });
  });

  it('mantiene las partículas con el apellido', () => {
    expect(partirNombre('Juan Pérez de la Cruz'))
      .toEqual({ first_name: 'Juan', last_name: 'Pérez de la Cruz' });
  });

  it('entiende "Apellidos, Nombres"', () => {
    expect(partirNombre('Pérez Gómez, Ana María'))
      .toEqual({ first_name: 'Ana María', last_name: 'Pérez Gómez' });
  });

  it('un solo nombre se queda sin apellido', () => {
    expect(partirNombre('Maicol')).toEqual({ first_name: 'Maicol', last_name: null });
    expect(partirNombre('')).toEqual({ first_name: '', last_name: null });
  });

  it('arregla las mayúsculas sostenidas del Excel', () => {
    expect(normalizarCapitalizacion('JUAN PEREZ')).toBe('Juan Perez');
    expect(normalizarCapitalizacion('juan de la cruz')).toBe('Juan de la Cruz');
    // Lo que ya viene mezclado se respeta.
    expect(normalizarCapitalizacion('McDonald')).toBe('McDonald');
  });
});

describe('claveNombre', () => {
  it('compara nombres sin importar tildes ni mayúsculas', () => {
    expect(claveNombre('Ana María', 'Pérez')).toBe(claveNombre('ANA MARIA', 'perez'));
  });
});

// ---------------------------------------------------------------------------
// Normalización de filas y clasificación
// ---------------------------------------------------------------------------

const MAPEO: MapeoColumnas = {
  0: 'full_name',
  1: 'phone',
  2: 'billing_day',
  3: 'price',
  4: 'marca:back_squat',
  5: 'marca:karen',
  6: 'status',
};

describe('normalizarFila', () => {
  it('deja lista una fila completa y correcta', () => {
    const fila = normalizarFila(
      ['JUAN CARLOS PEREZ GOMEZ', '300 123 4567', '5', '180.000', '120 kg', '8:30', 'Activo'],
      MAPEO,
      2,
    );
    expect(fila.estado).toBe('lista');
    expect(fila.errores).toHaveLength(0);
    expect(fila.atleta?.first_name).toBe('Juan Carlos');
    expect(fila.atleta?.last_name).toBe('Perez Gomez');
    expect(fila.atleta?.phone).toBe('+573001234567');
    expect(fila.atleta?.status).toBe('active');
    expect(fila.suscripcion).toEqual({ billing_day: 5, price_cents: 18_000_000, plan_name: null });
    expect(fila.marcas).toEqual([
      { clave: 'back_squat', metrica: 'weight', valor: 120, unidad: 'kg' },
      { clave: 'karen', metrica: 'time', valor: 510, unidad: 'sec' },
    ]);
  });

  it('una fila sin nombre es un error y no se importa', () => {
    const fila = normalizarFila(['', '3001234567', '5', '180000', '', '', ''], MAPEO, 3);
    expect(fila.estado).toBe('error');
    expect(fila.errores[0].campo).toBe('nombre');
    expect(fila.atleta).toBeNull();
  });

  it('un teléfono ilegible es un error: perderlo en silencio es peor', () => {
    const fila = normalizarFila(['Ana Pérez', '12345', '5', '180000', '', '', ''], MAPEO, 4);
    expect(fila.estado).toBe('error');
    expect(fila.errores.some((e) => e.campo === 'phone')).toBe(true);
  });

  it('acumula avisos pero deja la fila importable', () => {
    const fila = normalizarFila(['Ana Pérez', '', '35', '180000', 'muchos', '', 'raro'], MAPEO, 5);
    expect(fila.estado).toBe('aviso');
    expect(fila.atleta?.phone).toBeNull();
    const campos = fila.avisos.map((a) => a.campo);
    expect(campos).toContain('phone');          // sin celular
    expect(campos).toContain('billing_day');    // fecha de corte ajustada
    expect(campos).toContain('marca:back_squat'); // marca ilegible
    expect(campos).toContain('status');         // estado desconocido
    expect(fila.suscripcion?.billing_day).toBe(31);
    expect(fila.marcas).toHaveLength(0);
    expect(fila.atleta?.status).toBe('active');
  });

  it('no crea suscripción si falta el valor, salvo que haya uno por defecto', () => {
    const sinValor = normalizarFila(['Ana Pérez', '3001234567', '5', '', '', '', ''], MAPEO, 6);
    expect(sinValor.suscripcion).toBeNull();
    expect(sinValor.avisos.some((a) => a.campo === 'price')).toBe(true);

    const conDefecto = normalizarFila(
      ['Ana Pérez', '3001234567', '5', '', '', '', ''],
      MAPEO,
      6,
      { precioPorDefectoCents: 18_000_000 },
    );
    expect(conDefecto.suscripcion).toEqual({
      billing_day: 5, price_cents: 18_000_000, plan_name: null,
    });
  });

  it('un 0 en una marca significa "sin medir", no una marca de cero', () => {
    const fila = normalizarFila(['Ana Pérez', '3001234567', '5', '180000', '0', '', ''], MAPEO, 7);
    expect(fila.marcas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------

describe('detectarDuplicados', () => {
  const existentes: AtletaExistente[] = [
    { id: 'a1', first_name: 'Ana', last_name: 'Pérez', phone: '+573001234567' },
    { id: 'a2', first_name: 'Carlos', last_name: 'Ruiz', phone: null },
  ];

  function filaDe(nombre: string, telefono: string, indice: number) {
    return normalizarFila([nombre, telefono, '', '', '', '', ''], MAPEO, indice);
  }

  it('detecta por teléfono normalizado aunque esté escrito distinto', () => {
    const [fila] = detectarDuplicados([filaDe('Otra Persona', '(300) 123-4567', 2)], existentes);
    expect(fila.duplicado?.motivo).toBe('telefono');
    expect(fila.duplicado?.athleteId).toBe('a1');
    expect(fila.estado).toBe('aviso');
  });

  it('detecta por nombre completo sin tildes ni mayúsculas', () => {
    const [fila] = detectarDuplicados([filaDe('CARLOS RUIZ', '', 2)], existentes);
    expect(fila.duplicado?.motivo).toBe('nombre');
    expect(fila.duplicado?.athleteId).toBe('a2');
  });

  it('detecta repeticiones dentro del mismo archivo', () => {
    const filas = detectarDuplicados(
      [filaDe('Laura Gómez', '3019998877', 2), filaDe('Laura Gómez', '3019998877', 3)],
      existentes,
    );
    expect(filas[0].duplicado).toBeNull();
    expect(filas[1].duplicado?.motivo).toBe('repetido');
    expect(filas[1].duplicado?.athleteId).toBeNull();
  });

  it('no marca como duplicado a quien no lo es', () => {
    const [fila] = detectarDuplicados([filaDe('Pedro Nel Osorio', '3155554444', 2)], existentes);
    expect(fila.duplicado).toBeNull();
    expect(fila.estado).toBe('lista');
  });
});

// ---------------------------------------------------------------------------
// Análisis completo
// ---------------------------------------------------------------------------

describe('analizarArchivo', () => {
  const encabezados = [
    'Clientes', 'Celular', 'Fecha de Corte', 'Valor Mensualidad',
    'Cómo llegó', 'Back Squat', 'Karen', 'Notas',
  ];
  const celdas: unknown[][] = [
    ['JUAN CARLOS PEREZ GOMEZ', '300 123 4567', '5', '180.000', 'Instagram', '120 kg', '8:30', 'ok'],
    ['ana lópez', '', '35', '', 'Referido', 'muchos', '', ''],
    ['', '3009998888', '10', '180000', '', '', '', 'fila sin nombre'],
    ['', '', '', '', '', '', '', ''],
    ['Juan Carlos Pérez Gómez', '3001234567', '5', '180000', '', '', '', 'repetido'],
  ];

  const mapeo = mapearColumnas(encabezados);
  const analisis = analizarArchivo(encabezados, celdas, mapeo, { precioPorDefectoCents: null });

  it('salta las filas completamente vacías', () => {
    expect(analisis.filas).toHaveLength(4);
  });

  it('numera las filas como las ve el coach en Excel', () => {
    expect(analisis.filas[0].indice).toBe(2);
    expect(analisis.filas[2].indice).toBe(4);
  });

  it('clasifica y cuenta todo lo que hay que mostrar antes de importar', () => {
    expect(analisis.resumen.total).toBe(4);
    expect(analisis.resumen.listas).toBe(1);
    expect(analisis.resumen.avisos).toBe(2);
    expect(analisis.resumen.errores).toBe(1);
    expect(analisis.resumen.importables).toBe(3);
    // Solo dos filas traen corte y valor: la de "ana lópez" trae corte sin valor.
    expect(analisis.resumen.suscripciones).toBe(2);
    expect(analisis.resumen.marcas).toBe(2);
  });

  it('marca la fila repetida dentro del archivo', () => {
    const repetida = analisis.filas[3];
    expect(repetida.duplicado?.motivo).toBe('repetido');
    expect(repetida.duplicado?.etiqueta).toContain('fila 2');
  });

  it('cuenta los duplicados contra el box y no los deja en "listas"', () => {
    const conExistentes = analizarArchivo(encabezados, celdas, mapeo, {
      existentes: [{ id: 'a9', first_name: 'Juan Carlos', last_name: 'Perez Gomez', phone: null }],
    });
    expect(conExistentes.resumen.duplicados).toBe(2);
    expect(conExistentes.resumen.listas).toBe(0);
  });

  it('resumirFilas es coherente con lo que devuelve el análisis', () => {
    expect(resumirFilas(analisis.filas)).toEqual(analisis.resumen);
  });
});
