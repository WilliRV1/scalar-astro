/**
 * Importador de Excel · lógica pura.
 *
 * Aquí no entra React, ni Supabase, ni `xlsx`: solo datos que entran y datos
 * que salen. Es a propósito. El importador es la herramienta con la que se
 * migra cada box nuevo, y una migración que sale mal es un cliente que se
 * pierde: todo lo que decide qué se guarda tiene que poder probarse sin montar
 * un navegador ni una base de datos.
 *
 * Reutiliza la validación compartida (`athletes/schema.ts`) para que el Excel
 * no pueda meter datos que el formulario rechazaría.
 */

import { parsePesosToCents } from '../../shared/lib/money';
import { athleteSchema, validatePhone } from '../athletes/schema';
import type { AthleteInput } from '../athletes/schema';
import type { AthleteStatus } from '../../types/database';

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** Cualquier celda del archivo a texto limpio. Las fechas se vuelven ISO. */
export function celdaATexto(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (raw instanceof Date) return fechaAISO(raw);
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : '';
  return String(raw).trim();
}

export function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** "¿Cómo llegó?" -> "como llego". La llave con la que se comparan encabezados. */
export function normalizarEncabezado(raw: unknown): string {
  return sinTildes(celdaATexto(raw))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Lo que la gente escribe cuando una celda no tiene dato. */
const CELDAS_VACIAS = new Set([
  '', '-', 'n a', 'na', 'n d', 'nd', 's d', 'sd', 'x', 'ninguno', 'ninguna',
  'sin dato', 'sin datos', 'no tiene', 'no aplica', 'pendiente por medir',
]);

/** true si la celda no trae información (vacía, "n/a", "-", "s/d"…). */
export function esCeldaVacia(raw: unknown): boolean {
  const texto = celdaATexto(raw);
  if (texto === '') return true;
  if (texto === '?' || texto === '–' || texto === '—') return true;
  return CELDAS_VACIAS.has(normalizarEncabezado(texto));
}

// ---------------------------------------------------------------------------
// Catálogo de marcas
// ---------------------------------------------------------------------------

/** Las mismas `legacy_key` del catálogo `public.movements`. */
export const CLAVES_MARCA = [
  'back_squat', 'front_squat', 'deadlift', 'bench_press', 'shoulder_press',
  'push_press', 'clean_rm', 'snatch_rm', 'karen', 'burpees_100',
] as const;

export type ClaveMarca = (typeof CLAVES_MARCA)[number];
export type Metrica = 'weight' | 'time';

/** Peso (kg) o tiempo (segundos). Es lo que decide cómo se lee el valor. */
export const METRICA_MARCA: Record<ClaveMarca, Metrica> = {
  back_squat: 'weight',
  front_squat: 'weight',
  deadlift: 'weight',
  bench_press: 'weight',
  shoulder_press: 'weight',
  push_press: 'weight',
  clean_rm: 'weight',
  snatch_rm: 'weight',
  karen: 'time',
  burpees_100: 'time',
};

export const UNIDAD_METRICA: Record<Metrica, string> = { weight: 'kg', time: 'sec' };

// ---------------------------------------------------------------------------
// Campos destino y mapeo automático de columnas
// ---------------------------------------------------------------------------

export type CampoAtleta =
  | 'full_name' | 'first_name' | 'last_name' | 'phone' | 'email'
  | 'document_id' | 'birth_date' | 'status' | 'referral_source' | 'joined_on';

export type CampoCobro = 'billing_day' | 'price' | 'plan_name';

export type CampoMarca = `marca:${ClaveMarca}`;

export type CampoDestino = 'ignorar' | CampoAtleta | CampoCobro | CampoMarca;

export type GrupoCampo = 'Atleta' | 'Cobro' | 'Marcas';

export interface DefinicionCampo {
  campo: CampoDestino;
  etiqueta: string;
  grupo: GrupoCampo;
  /** Variantes que se han visto en los archivos reales de los boxes. */
  alias: string[];
}

export const CAMPOS: DefinicionCampo[] = [
  {
    campo: 'full_name', etiqueta: 'Nombre completo', grupo: 'Atleta',
    alias: [
      'nombre completo', 'nombre y apellido', 'nombres y apellidos',
      'nombre del atleta', 'nombre', 'nombres', 'atleta', 'cliente', 'clientes',
      'alumno', 'alumna', 'deportista', 'socio', 'miembro', 'name', 'full name',
    ],
  },
  {
    campo: 'first_name', etiqueta: 'Nombre (solo)', grupo: 'Atleta',
    alias: ['primer nombre', 'first name', 'nombre de pila'],
  },
  {
    campo: 'last_name', etiqueta: 'Apellido', grupo: 'Atleta',
    alias: ['apellido', 'apellidos', 'primer apellido', 'last name'],
  },
  {
    campo: 'phone', etiqueta: 'Celular (WhatsApp)', grupo: 'Atleta',
    alias: [
      'celular', 'cel', 'telefono', 'telefono celular', 'tel', 'whatsapp', 'wpp',
      'wasap', 'movil', 'numero', 'numero de celular', 'numero de contacto',
      'contacto', 'phone', 'mobile',
    ],
  },
  {
    campo: 'email', etiqueta: 'Correo', grupo: 'Atleta',
    alias: ['correo', 'correo electronico', 'email', 'e mail', 'mail'],
  },
  {
    campo: 'document_id', etiqueta: 'Documento', grupo: 'Atleta',
    alias: ['cedula', 'documento', 'numero de documento', 'cc', 'identificacion', 'nit', 'dni'],
  },
  {
    campo: 'birth_date', etiqueta: 'Fecha de nacimiento', grupo: 'Atleta',
    alias: ['fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'cumpleanos', 'birth date'],
  },
  {
    campo: 'status', etiqueta: 'Estado', grupo: 'Atleta',
    alias: ['estado', 'estado del atleta', 'estado de pago', 'status'],
  },
  {
    campo: 'referral_source', etiqueta: 'Cómo llegó', grupo: 'Atleta',
    alias: [
      'como llego', 'como nos conocio', 'como se entero', 'referido',
      'referido por', 'fuente', 'canal', 'referral', 'referral source',
    ],
  },
  {
    campo: 'joined_on', etiqueta: 'Fecha de ingreso', grupo: 'Atleta',
    alias: [
      'fecha de ingreso', 'fecha de inicio', 'fecha de registro', 'ingreso',
      'inicio', 'desde', 'antiguedad', 'fecha de matricula',
    ],
  },
  {
    campo: 'billing_day', etiqueta: 'Fecha de corte (día)', grupo: 'Cobro',
    alias: [
      'fecha de corte', 'fecha corte', 'dia de corte', 'corte', 'dia de pago',
      'dia de cobro', 'fecha de pago', 'dia', 'cut day', 'cut off',
    ],
  },
  {
    campo: 'price', etiqueta: 'Valor de la mensualidad', grupo: 'Cobro',
    alias: [
      'valor mensualidad', 'valor de la mensualidad', 'valor del plan', 'valor',
      'mensualidad', 'precio', 'cuota', 'tarifa', 'monto', 'costo', 'pago mensual',
    ],
  },
  {
    campo: 'plan_name', etiqueta: 'Nombre del plan', grupo: 'Cobro',
    alias: ['nombre del plan', 'plan', 'membresia', 'tipo de plan', 'paquete', 'modalidad'],
  },
  {
    campo: 'marca:back_squat', etiqueta: 'Back Squat', grupo: 'Marcas',
    alias: ['back squat', 'backsquat', 'sentadilla trasera', 'sentadilla', 'squat'],
  },
  {
    campo: 'marca:front_squat', etiqueta: 'Front Squat', grupo: 'Marcas',
    alias: ['front squat', 'frontsquat', 'sentadilla frontal'],
  },
  {
    campo: 'marca:deadlift', etiqueta: 'Deadlift', grupo: 'Marcas',
    alias: ['deadlift', 'peso muerto', 'dead lift'],
  },
  {
    campo: 'marca:bench_press', etiqueta: 'Bench Press', grupo: 'Marcas',
    alias: ['bench press', 'benchpress', 'press de banca', 'press banca', 'banca', 'bench'],
  },
  {
    campo: 'marca:shoulder_press', etiqueta: 'Shoulder Press', grupo: 'Marcas',
    alias: [
      'shoulder press', 'shoulder p', 'press de hombro', 'press hombro',
      'press militar', 'strict press',
    ],
  },
  {
    campo: 'marca:push_press', etiqueta: 'Push Press', grupo: 'Marcas',
    alias: ['push press', 'pushpress'],
  },
  {
    campo: 'marca:clean_rm', etiqueta: 'Clean', grupo: 'Marcas',
    alias: ['clean rm', 'power clean', 'clean', 'cargada'],
  },
  {
    campo: 'marca:snatch_rm', etiqueta: 'Snatch', grupo: 'Marcas',
    alias: ['snatch rm', 'power snatch', 'snatch', 'arranque'],
  },
  {
    campo: 'marca:karen', etiqueta: 'Karen (tiempo)', grupo: 'Marcas',
    alias: ['karen'],
  },
  {
    campo: 'marca:burpees_100', etiqueta: '100 Burpees (tiempo)', grupo: 'Marcas',
    alias: ['100 burpees', 'burpees 100', 'cien burpees', 'burpees'],
  },
];

export const ETIQUETA_CAMPO: Record<string, string> = Object.fromEntries(
  CAMPOS.map((c) => [c.campo, c.etiqueta]),
);

const ALIAS_NORMALIZADOS: Array<{ campo: CampoDestino; alias: string }> = CAMPOS.flatMap((d) =>
  d.alias.map((a) => ({ campo: d.campo, alias: normalizarEncabezado(a) })),
);

function contieneSecuencia(texto: string, secuencia: string): boolean {
  return ` ${texto} `.includes(` ${secuencia} `);
}

/**
 * Adivina a qué campo corresponde un encabezado del archivo.
 *
 * Gana el alias más largo, y el que calza exacto le gana a cualquiera que solo
 * aparezca dentro del encabezado. Por eso "Nombre del plan" es el plan y no el
 * nombre del atleta, y "Fecha de pago" es la fecha de corte y no el valor.
 * Los alias de tres letras o menos ("cc", "tel", "dia") solo calzan exactos:
 * si no, aparecerían dentro de media hoja de cálculo.
 */
export function sugerirCampo(encabezado: unknown): CampoDestino {
  const h = normalizarEncabezado(encabezado);
  if (h === '') return 'ignorar';

  let campoElegido: CampoDestino = 'ignorar';
  let mejorPuntaje = 0;

  for (const { campo, alias } of ALIAS_NORMALIZADOS) {
    if (alias === '') continue;
    let puntaje = 0;
    if (h === alias) puntaje = 1000 + alias.length;
    else if (alias.length > 3 && contieneSecuencia(h, alias)) puntaje = alias.length;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      campoElegido = campo;
    }
  }

  return campoElegido;
}

/** Columna del archivo (por índice) -> campo destino. */
export type MapeoColumnas = Record<number, CampoDestino>;

/**
 * Mapeo automático de todas las columnas. Si dos columnas apuntan al mismo
 * campo (pasa con "Celular" y "Teléfono fijo"), se queda la primera: es
 * preferible ignorar una columna a pisar el dato bueno con el malo.
 */
export function mapearColumnas(encabezados: unknown[]): MapeoColumnas {
  const mapeo: MapeoColumnas = {};
  const usados = new Set<CampoDestino>();

  encabezados.forEach((encabezado, indice) => {
    const campo = sugerirCampo(encabezado);
    if (campo === 'ignorar' || usados.has(campo)) {
      mapeo[indice] = 'ignorar';
      return;
    }
    usados.add(campo);
    mapeo[indice] = campo;
  });

  return mapeo;
}

// ---------------------------------------------------------------------------
// Conversión de valores de marcas
// ---------------------------------------------------------------------------

const SEGUNDOS_POR_DIA = 86_400;

/**
 * Convierte el valor de una marca a número, igual que `legacy.parse_value` en
 * la migración del prototipo:
 *
 *   "120" / "120 kg" -> 120      "85,5"    -> 85.5
 *   "8:30"           -> 510      "1:02:30" -> 3750
 *   "muchos" / "n/a" / "-"       -> null
 *
 * Devolver null y no 0 es la regla importante: un 0 en `personal_records` es
 * una marca real de cero kilos, entra en las gráficas y arruina los promedios
 * del box. Lo ilegible se reporta y se deja por fuera.
 */
export function parseValorMarca(raw: unknown, metrica: Metrica): number | null {
  if (esCeldaVacia(raw)) return null;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    // Excel guarda las horas como fracción de día: 8:30 se vuelve 0.00590…
    if (metrica === 'time' && raw > 0 && raw < 1) return Math.round(raw * SEGUNDOS_POR_DIA);
    return raw;
  }

  const texto = celdaATexto(raw);
  if (texto === '') return null;

  if (metrica === 'time') return parseTiempoASegundos(texto);
  return parsePesoANumero(texto);
}

/** "8:30" -> 510 · "1:02:30" -> 3750 · "45" -> 45 (ya son segundos). */
export function parseTiempoASegundos(texto: string): number | null {
  // Se quita la unidad escrita a mano ("8:30 min") y se acepta 8'30 como mm:ss.
  const limpio = texto
    .replace(/\s*(minutos?|mins?|segundos?|segs?|sec|m|s)\.?$/i, '')
    .replace(/[′'"]/g, ':')
    .trim();

  const m = /^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/.exec(limpio);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (m[3] !== undefined) return a * 3600 + b * 60 + Number(m[3]);
    return a * 60 + b;
  }

  // Solo dígitos en un campo de tiempo: se asume que ya vienen en segundos.
  if (/^\d+$/.test(limpio)) return Number(limpio);
  return null;
}

/** "120 kg" -> 120 · "85,5" -> 85.5 · "muchos" -> null. */
export function parsePesoANumero(texto: string): number | null {
  const soloNumero = texto.replace(/[^0-9,.]/g, '').replace(',', '.');
  if (soloNumero === '' || !/^\d*\.?\d+$/.test(soloNumero)) return null;
  const valor = Number(soloNumero);
  return Number.isFinite(valor) ? valor : null;
}

// ---------------------------------------------------------------------------
// Fecha de corte, precio, fechas, estado
// ---------------------------------------------------------------------------

export interface DiaDeCorte {
  dia: number | null;
  /** true si venía fuera de 1..31 y hubo que traerlo al rango. */
  ajustado: boolean;
}

/**
 * La "fecha de corte" es un día del mes (1..31). Llega de todas las formas:
 * "5", "día 15", "15/03/2024", "0", "35". Se toma el primer número de uno o
 * dos dígitos y se lleva al rango que acepta la base (CHECK 1..31).
 */
export function parseDiaDeCorte(raw: unknown): DiaDeCorte {
  if (esCeldaVacia(raw)) return { dia: null, ajustado: false };

  let numero: number | null = null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    numero = Math.round(raw);
  } else {
    const m = /(\d{1,2})(?!\d)/.exec(celdaATexto(raw));
    if (m) numero = Number(m[1]);
  }

  if (numero === null) return { dia: null, ajustado: false };
  if (numero < 1) return { dia: 1, ajustado: true };
  if (numero > 31) return { dia: 31, ajustado: true };
  return { dia: numero, ajustado: false };
}

/**
 * Valor de la mensualidad a centavos. Se apoya en `parsePesosToCents`, pero
 * antes arregla el caso del Excel configurado en inglés ("180,000"), que de
 * otro modo se leería como 180 pesos con 0 centavos.
 */
export function parsePrecioCents(raw: unknown): number | null {
  if (esCeldaVacia(raw)) return null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw >= 0 ? Math.round(raw * 100) : null;
  }

  let texto = celdaATexto(raw);
  if (/^\$?\s*\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(texto)) {
    // Formato gringo ("180,000.50"): se pasa al colombiano antes de leerlo.
    texto = texto.replace(/,/g, '').replace('.', ',');
  }
  const cents = parsePesosToCents(texto);
  if (cents === null || cents < 0) return null;
  return cents;
}

function fechaAISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function fechaValida(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(anio, mes - 1, dia);
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return fechaAISO(d);
}

/**
 * Fecha a ISO (YYYY-MM-DD), que es lo que espera `date` en Postgres.
 *
 * En Colombia se escribe día/mes/año, así que ese es el orden por defecto;
 * si el primer número no puede ser un día y el segundo sí, se asume que el
 * archivo venía con el Excel en inglés y se invierten.
 */
export function parseFechaISO(raw: unknown): string | null {
  if (esCeldaVacia(raw)) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : fechaAISO(raw);

  // Número de serie de Excel (días desde el 30/12/1899).
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw < 1 || raw > 80_000) return null;
    return fechaAISO(new Date(Date.UTC(1899, 11, 30) + raw * SEGUNDOS_POR_DIA * 1000));
  }

  const texto = celdaATexto(raw);

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(texto);
  if (iso) return fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(texto);
  if (dmy) {
    let dia = Number(dmy[1]);
    let mes = Number(dmy[2]);
    if (mes > 12 && dia <= 12) {
      const tmp = dia;
      dia = mes;
      mes = tmp;
    }
    let anio = Number(dmy[3]);
    if (anio < 100) anio += anio < 30 ? 2000 : 1900;
    return fechaValida(anio, mes, dia);
  }

  return null;
}

const ESTADOS_CONOCIDOS: Record<string, AthleteStatus> = {
  'activo': 'active', 'activa': 'active', 'active': 'active', 'al dia': 'active',
  'ok': 'active', 'paz y salvo': 'active', 'pago': 'active', 'pagado': 'active',
  'mora': 'overdue', 'en mora': 'overdue', 'moroso': 'overdue', 'debe': 'overdue',
  'vencido': 'overdue', 'overdue': 'overdue', 'pendiente': 'overdue',
  'congelado': 'frozen', 'congelada': 'frozen', 'frozen': 'frozen',
  'pausa': 'frozen', 'pausado': 'frozen', 'en pausa': 'frozen',
  'prueba': 'trial', 'en prueba': 'trial', 'trial': 'trial', 'clase de prueba': 'trial',
  'prospecto': 'lead', 'lead': 'lead', 'interesado': 'lead', 'contacto': 'lead',
  'retirado': 'churned', 'retirada': 'churned', 'inactivo': 'churned',
  'inactiva': 'churned', 'churned': 'churned', 'cancelado': 'churned', 'se retiro': 'churned',
};

/** "Al día" -> 'active' · "en mora" -> 'overdue' · desconocido -> null. */
export function parseEstado(raw: unknown): AthleteStatus | null {
  const clave = normalizarEncabezado(raw);
  if (clave === '') return null;
  return ESTADOS_CONOCIDOS[clave] ?? null;
}

// ---------------------------------------------------------------------------
// Nombres
// ---------------------------------------------------------------------------

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'das', 'di', 'do', 'van', 'von', 'san', 'santa', 'y']);

function capitalizarPalabra(p: string): string {
  if (PARTICULAS.has(sinTildes(p).toLowerCase())) return p.toLowerCase();
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/**
 * "JUAN PEREZ" y "juan perez" se arreglan; "McDonald" o "Ana MarÍa" se dejan
 * como están, porque quien mezcló mayúsculas probablemente lo hizo a propósito.
 */
export function normalizarCapitalizacion(texto: string): string {
  if (texto !== texto.toUpperCase() && texto !== texto.toLowerCase()) return texto;
  return texto.split(' ').filter(Boolean).map(capitalizarPalabra).join(' ');
}

export interface NombrePartido {
  first_name: string;
  last_name: string | null;
}

/**
 * Parte un nombre completo en nombre y apellidos.
 *
 * Es una heurística, igual que en la migración del prototipo: con dos palabras
 * es nombre + apellido, con tres es nombre + dos apellidos y con cuatro son dos
 * nombres y dos apellidos, que es como se escribe en Colombia. Las partículas
 * ("de la Cruz") viajan pegadas a la palabra que siguen. Después de importar
 * hay que revisar los nombres compuestos; por eso el nombre crudo queda a la
 * vista en la previsualización.
 */
export function partirNombre(raw: unknown): NombrePartido {
  const texto = normalizarCapitalizacion(celdaATexto(raw).replace(/\s+/g, ' ').trim());
  if (texto === '') return { first_name: '', last_name: null };

  // "Pérez Gómez, Ana María" -> apellidos primero.
  if (texto.includes(',')) {
    const [apellidos, nombres] = texto.split(',');
    const ap = (apellidos ?? '').trim();
    const no = (nombres ?? '').trim();
    if (ap !== '' && no !== '') return { first_name: no, last_name: ap };
  }

  const palabras = texto.split(' ').filter(Boolean);
  const grupos: string[] = [];
  let pendiente: string[] = [];
  for (const palabra of palabras) {
    pendiente.push(palabra);
    if (!PARTICULAS.has(sinTildes(palabra).toLowerCase())) {
      grupos.push(pendiente.join(' '));
      pendiente = [];
    }
  }
  if (pendiente.length > 0) grupos.push(pendiente.join(' '));

  if (grupos.length === 1) return { first_name: grupos[0], last_name: null };
  if (grupos.length === 2) return { first_name: grupos[0], last_name: grupos[1] };
  if (grupos.length === 3) {
    return { first_name: grupos[0], last_name: grupos.slice(1).join(' ') };
  }
  return { first_name: grupos.slice(0, 2).join(' '), last_name: grupos.slice(2).join(' ') };
}

/** Llave para comparar nombres entre el archivo y lo que ya está en el box. */
export function claveNombre(nombre: string, apellido?: string | null): string {
  return normalizarEncabezado([nombre, apellido].filter(Boolean).join(' '));
}

// ---------------------------------------------------------------------------
// Normalización de filas
// ---------------------------------------------------------------------------

export type EstadoFila = 'lista' | 'aviso' | 'error';

export interface Incidencia {
  campo: string;
  mensaje: string;
}

export interface MarcaNormalizada {
  clave: ClaveMarca;
  metrica: Metrica;
  /** Kilos o segundos, nunca texto. */
  valor: number;
  unidad: string;
}

export interface SuscripcionNormalizada {
  billing_day: number;
  price_cents: number;
  plan_name: string | null;
}

export interface Duplicado {
  motivo: 'telefono' | 'nombre' | 'repetido';
  /** Id del atleta que ya existe en el box; null si el choque es dentro del archivo. */
  athleteId: string | null;
  etiqueta: string;
}

export interface FilaNormalizada {
  /** Número de fila tal como se ve en Excel (la 1 es el encabezado). */
  indice: number;
  /** El nombre como venía escrito, para que el coach reconozca la fila. */
  nombreCrudo: string;
  atleta: AthleteInput | null;
  suscripcion: SuscripcionNormalizada | null;
  marcas: MarcaNormalizada[];
  avisos: Incidencia[];
  errores: Incidencia[];
  estado: EstadoFila;
  duplicado: Duplicado | null;
}

export interface OpcionesAnalisis {
  /** Valor de la mensualidad para las filas que no lo traen. */
  precioPorDefectoCents?: number | null;
  /** Estado con el que entran los atletas cuyo archivo no dice nada. */
  estadoPorDefecto?: AthleteStatus;
  /** Atletas que ya están en el box, para detectar duplicados. */
  existentes?: AtletaExistente[];
}

export interface AtletaExistente {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
}

/** true si la fila no tiene un solo dato aprovechable. */
export function filaVacia(celdas: unknown[]): boolean {
  return celdas.every((c) => esCeldaVacia(c));
}

function recortar(texto: string, largo: number): string {
  return texto.length > largo ? texto.slice(0, largo).trim() : texto;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Convierte una fila cruda del archivo en lo que se va a guardar, y deja por
 * escrito todo lo que hubo que suponer o corregir.
 *
 * Regla de clasificación:
 *  - error  → la fila no se importa (sin nombre, teléfono ilegible).
 *  - aviso  → la fila se importa, pero hay que revisarla después.
 *  - lista  → entra tal cual.
 */
export function normalizarFila(
  celdas: unknown[],
  mapeo: MapeoColumnas,
  indice: number,
  opciones: OpcionesAnalisis = {},
): FilaNormalizada {
  const errores: Incidencia[] = [];
  const avisos: Incidencia[] = [];

  const valores = new Map<CampoDestino, unknown>();
  const marcasCrudas: Array<{ clave: ClaveMarca; raw: unknown }> = [];

  for (const [columna, campo] of Object.entries(mapeo)) {
    if (campo === 'ignorar') continue;
    const raw = celdas[Number(columna)];
    if (campo.startsWith('marca:')) {
      marcasCrudas.push({ clave: campo.slice('marca:'.length) as ClaveMarca, raw });
      continue;
    }
    if (!valores.has(campo)) valores.set(campo, raw);
  }

  /** Texto de un campo, o '' si la celda no trae nada ("-", "n/a"…). */
  const crudo = (campo: CampoDestino): string => {
    const raw = valores.get(campo);
    return esCeldaVacia(raw) ? '' : celdaATexto(raw);
  };

  // --- Nombre -------------------------------------------------------------
  const completo = crudo('full_name');
  let first = normalizarCapitalizacion(crudo('first_name'));
  let last = normalizarCapitalizacion(crudo('last_name'));

  if (first === '' && completo !== '') {
    const partido = partirNombre(completo);
    first = partido.first_name;
    if (last === '') last = partido.last_name ?? '';
  }

  const nombreCrudo = completo !== '' ? completo : [first, last].filter(Boolean).join(' ');
  if (first === '') {
    errores.push({ campo: 'nombre', mensaje: 'La fila no tiene nombre: no se puede importar' });
  }

  // --- Teléfono -----------------------------------------------------------
  // Un teléfono escrito pero ilegible es un error y no un campo vacío: si se
  // guardara como null, ese atleta no recibiría nunca un cobro y nadie se
  // enteraría. Es la misma regla que aplica el formulario.
  const telefono = validatePhone(crudo('phone'));
  if (!telefono.ok) {
    errores.push({
      campo: 'phone',
      mensaje: `${telefono.error}. Corrígelo en el archivo o deja la celda vacía.`,
    });
  } else if (telefono.value === null) {
    avisos.push({
      campo: 'phone',
      mensaje: 'Sin celular: a este atleta no se le podrá cobrar por WhatsApp',
    });
  }

  // --- Correo -------------------------------------------------------------
  const correoCrudo = crudo('email');
  let email = '';
  if (correoCrudo !== '') {
    if (CORREO.test(correoCrudo)) email = correoCrudo.toLowerCase();
    else avisos.push({ campo: 'email', mensaje: `El correo "${correoCrudo}" no es válido: se importa sin correo` });
  }

  // --- Fechas -------------------------------------------------------------
  const nacimientoCrudo = crudo('birth_date');
  const birthDate = parseFechaISO(nacimientoCrudo);
  if (nacimientoCrudo !== '' && birthDate === null) {
    avisos.push({ campo: 'birth_date', mensaje: `No se entiende la fecha de nacimiento "${nacimientoCrudo}"` });
  }

  const ingresoCrudo = crudo('joined_on');
  const joinedOn = parseFechaISO(ingresoCrudo);
  if (ingresoCrudo !== '' && joinedOn === null) {
    avisos.push({ campo: 'joined_on', mensaje: `No se entiende la fecha de ingreso "${ingresoCrudo}"` });
  }

  // --- Estado -------------------------------------------------------------
  const estadoCrudo = crudo('status');
  const estadoPorDefecto = opciones.estadoPorDefecto ?? 'active';
  let status: AthleteStatus = estadoPorDefecto;
  if (estadoCrudo !== '') {
    const leido = parseEstado(estadoCrudo);
    if (leido) status = leido;
    else avisos.push({ campo: 'status', mensaje: `Estado "${estadoCrudo}" no reconocido: entra como ${estadoPorDefecto}` });
  }

  // --- Cobro --------------------------------------------------------------
  const corteCrudo = valores.get('billing_day');
  const corte = parseDiaDeCorte(corteCrudo);
  if (corte.ajustado) {
    avisos.push({
      campo: 'billing_day',
      mensaje: `La fecha de corte "${celdaATexto(corteCrudo)}" está fuera de 1–31: se ajusta al día ${corte.dia}`,
    });
  } else if (corte.dia === null && !esCeldaVacia(corteCrudo)) {
    avisos.push({ campo: 'billing_day', mensaje: `No se entiende la fecha de corte "${celdaATexto(corteCrudo)}"` });
  }

  const precioCrudo = valores.get('price');
  const precioArchivo = parsePrecioCents(precioCrudo);
  if (precioArchivo === null && !esCeldaVacia(precioCrudo)) {
    avisos.push({ campo: 'price', mensaje: `No se entiende el valor "${celdaATexto(precioCrudo)}"` });
  }
  const precio = precioArchivo ?? opciones.precioPorDefectoCents ?? null;

  let suscripcion: SuscripcionNormalizada | null = null;
  if (corte.dia !== null && precio !== null) {
    suscripcion = {
      billing_day: corte.dia,
      price_cents: precio,
      plan_name: crudo('plan_name') || null,
    };
  } else if (corte.dia !== null && precio === null) {
    avisos.push({
      campo: 'price',
      mensaje: 'Hay fecha de corte pero no valor de mensualidad: no se crea la suscripción',
    });
  } else if (corte.dia === null && precioArchivo !== null) {
    avisos.push({
      campo: 'billing_day',
      mensaje: 'Hay valor de mensualidad pero no fecha de corte: no se crea la suscripción',
    });
  }

  // --- Marcas -------------------------------------------------------------
  const marcas: MarcaNormalizada[] = [];
  for (const { clave, raw } of marcasCrudas) {
    const metrica = METRICA_MARCA[clave];
    const valor = parseValorMarca(raw, metrica);
    if (valor === null) {
      if (!esCeldaVacia(raw)) {
        avisos.push({
          campo: `marca:${clave}`,
          mensaje: `No se entiende la marca de ${ETIQUETA_CAMPO[`marca:${clave}`]} ("${celdaATexto(raw)}"): se importa sin ella`,
        });
      }
      continue;
    }
    // Un 0 en la hoja quiere decir "todavía no la ha medido", no una marca de
    // cero kilos: guardarla dañaría los promedios del box.
    if (valor <= 0) continue;
    marcas.push({ clave, metrica, valor, unidad: UNIDAD_METRICA[metrica] });
  }

  // --- Validación compartida ---------------------------------------------
  // `consent_whatsapp` siempre en false: importar una lista no es una
  // autorización de la persona (Ley 1581). El consentimiento se recoge después.
  const parsed = athleteSchema.safeParse({
    first_name: recortar(first, 80),
    last_name: recortar(last, 80),
    phone: telefono.value,
    email,
    document_id: recortar(crudo('document_id'), 32),
    birth_date: birthDate,
    status,
    referral_source: recortar(crudo('referral_source'), 60),
    joined_on: joinedOn,
    consent_whatsapp: false,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errores.push({ campo: String(issue.path[0] ?? 'general'), mensaje: issue.message });
    }
  }

  const estado: EstadoFila = errores.length > 0 ? 'error' : avisos.length > 0 ? 'aviso' : 'lista';

  return {
    indice,
    nombreCrudo,
    atleta: parsed.success ? parsed.data : null,
    suscripcion: parsed.success ? suscripcion : null,
    marcas: parsed.success ? marcas : [],
    avisos,
    errores,
    estado,
    duplicado: null,
  };
}

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------

/**
 * Marca las filas que ya existen en el box —por celular normalizado o por
 * nombre completo— y también las que están repetidas dentro del mismo archivo,
 * que es lo que pasa cuando el box lleva dos hojas y las pega.
 *
 * No decide nada: solo avisa. Omitir o crear de todos modos lo elige el coach,
 * que es quien sabe si son dos personas distintas con el mismo nombre.
 */
export function detectarDuplicados(
  filas: FilaNormalizada[],
  existentes: AtletaExistente[],
): FilaNormalizada[] {
  const porTelefono = new Map<string, AtletaExistente>();
  const porNombre = new Map<string, AtletaExistente>();
  for (const a of existentes) {
    if (a.phone) porTelefono.set(a.phone, a);
    const clave = claveNombre(a.first_name, a.last_name);
    if (clave !== '' && !porNombre.has(clave)) porNombre.set(clave, a);
  }

  const telefonosVistos = new Map<string, number>();
  const nombresVistos = new Map<string, number>();

  return filas.map((fila) => {
    if (!fila.atleta) return { ...fila, duplicado: null };

    const tel = fila.atleta.phone;
    const nombre = claveNombre(fila.atleta.first_name, fila.atleta.last_name);
    const etiquetaNombre = [fila.atleta.first_name, fila.atleta.last_name].filter(Boolean).join(' ');

    let duplicado: Duplicado | null = null;
    const yaPorTelefono = tel ? porTelefono.get(tel) : undefined;
    const yaPorNombre = nombre !== '' ? porNombre.get(nombre) : undefined;

    if (yaPorTelefono) {
      duplicado = {
        motivo: 'telefono',
        athleteId: yaPorTelefono.id,
        etiqueta: `Ya hay un atleta en el box con el celular ${tel}`,
      };
    } else if (yaPorNombre) {
      duplicado = {
        motivo: 'nombre',
        athleteId: yaPorNombre.id,
        etiqueta: `Ya hay un atleta en el box que se llama ${etiquetaNombre}`,
      };
    } else if (tel && telefonosVistos.has(tel)) {
      duplicado = {
        motivo: 'repetido',
        athleteId: null,
        etiqueta: `El celular ${tel} ya aparece en la fila ${telefonosVistos.get(tel)} del archivo`,
      };
    } else if (nombre !== '' && nombresVistos.has(nombre)) {
      duplicado = {
        motivo: 'repetido',
        athleteId: null,
        etiqueta: `${etiquetaNombre} ya aparece en la fila ${nombresVistos.get(nombre)} del archivo`,
      };
    }

    if (tel && !telefonosVistos.has(tel)) telefonosVistos.set(tel, fila.indice);
    if (nombre !== '' && !nombresVistos.has(nombre)) nombresVistos.set(nombre, fila.indice);

    if (!duplicado) return { ...fila, duplicado: null };

    return {
      ...fila,
      duplicado,
      avisos: [...fila.avisos, { campo: 'duplicado', mensaje: duplicado.etiqueta }],
      estado: fila.estado === 'error' ? 'error' : 'aviso',
    };
  });
}

// ---------------------------------------------------------------------------
// Análisis completo del archivo
// ---------------------------------------------------------------------------

export interface ResumenAnalisis {
  total: number;
  listas: number;
  avisos: number;
  errores: number;
  duplicados: number;
  /** Filas que sí se van a importar (todas menos las que tienen error). */
  importables: number;
  suscripciones: number;
  marcas: number;
}

export function resumirFilas(filas: FilaNormalizada[]): ResumenAnalisis {
  const resumen: ResumenAnalisis = {
    total: filas.length,
    listas: 0,
    avisos: 0,
    errores: 0,
    duplicados: 0,
    importables: 0,
    suscripciones: 0,
    marcas: 0,
  };

  for (const fila of filas) {
    if (fila.estado === 'error') {
      resumen.errores += 1;
      continue;
    }
    if (fila.estado === 'aviso') resumen.avisos += 1;
    else resumen.listas += 1;
    if (fila.duplicado) resumen.duplicados += 1;
    resumen.importables += 1;
    if (fila.suscripcion) resumen.suscripciones += 1;
    resumen.marcas += fila.marcas.length;
  }

  return resumen;
}

export interface ArchivoAnalizado {
  encabezados: string[];
  mapeo: MapeoColumnas;
  filas: FilaNormalizada[];
  resumen: ResumenAnalisis;
}

/**
 * Analiza el archivo completo: normaliza cada fila, detecta duplicados y saca
 * los contadores que se muestran antes de importar. El índice de cada fila es
 * el número de fila de Excel (la 1 es el encabezado), para que el coach pueda
 * abrir su archivo y corregir exactamente donde le decimos.
 */
export function analizarArchivo(
  encabezados: unknown[],
  celdas: unknown[][],
  mapeo: MapeoColumnas,
  opciones: OpcionesAnalisis = {},
): ArchivoAnalizado {
  const filas: FilaNormalizada[] = [];

  celdas.forEach((fila, i) => {
    if (filaVacia(fila)) return;
    filas.push(normalizarFila(fila, mapeo, i + 2, opciones));
  });

  const conDuplicados = detectarDuplicados(filas, opciones.existentes ?? []);

  return {
    encabezados: encabezados.map((h) => celdaATexto(h)),
    mapeo,
    filas: conDuplicados,
    resumen: resumirFilas(conDuplicados),
  };
}

// ---------------------------------------------------------------------------
// Detección de la fila de encabezados
// ---------------------------------------------------------------------------

/**
 * Encuentra en qué fila están los encabezados.
 *
 * Casi ningún archivo de un box empieza en A1: arriba suele haber el nombre del
 * box, una fila en blanco o un "ACTUALIZADO A SEPTIEMBRE". Se busca, entre las
 * primeras filas, la que más columnas conocidas reconoce; se exigen al menos
 * dos para no confundir una fila de datos donde alguien se llama "Karen".
 */
export function detectarFilaEncabezado(matriz: unknown[][], maximoFilas = 10): number {
  let mejorFila = 0;
  let mejorPuntaje = 0;

  const hasta = Math.min(matriz.length, maximoFilas);
  for (let i = 0; i < hasta; i += 1) {
    const fila = matriz[i] ?? [];
    const reconocidas = fila.filter((c) => sugerirCampo(c) !== 'ignorar').length;
    if (reconocidas < 2) continue;
    const llenas = fila.filter((c) => !esCeldaVacia(c)).length;
    const puntaje = reconocidas * 10 + llenas;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorFila = i;
    }
  }

  return mejorFila;
}

export interface HojaSeparada {
  encabezados: string[];
  filas: unknown[][];
  /** Fila (base 0) donde estaban los encabezados dentro del archivo. */
  filaEncabezado: number;
}

/** Parte la matriz cruda de la hoja en encabezados + filas de datos. */
export function separarEncabezados(matriz: unknown[][]): HojaSeparada {
  const filaEncabezado = detectarFilaEncabezado(matriz);
  const encabezados = (matriz[filaEncabezado] ?? []).map((h) => celdaATexto(h));
  const filas = matriz.slice(filaEncabezado + 1).filter((f) => !filaVacia(f));
  return { encabezados, filas, filaEncabezado };
}
