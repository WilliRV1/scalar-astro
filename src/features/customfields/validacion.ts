/**
 * Validación de los campos personalizados · lógica pura.
 *
 * Aquí no entra React ni Supabase: entran datos y salen datos. Es la MISMA
 * regla para el formulario del atleta y para el importador de Excel, igual que
 * `athletes/schema.ts`. Si se separaran, el Excel acabaría metiendo valores que
 * el formulario rechaza —y que la base rechazaría después con un error que
 * nadie sabe de dónde salió.
 *
 * Es un espejo de `public.validate_custom_fields()` (migración
 * 20260923110000_custom_fields.sql), con UNA diferencia deliberada: aquí se
 * NORMALIZA lo que la gente escribe ("300 123 4567" -> "+573001234567",
 * "sí" -> true, "72,5" -> 72.5) y allá solo se valida. La base no adivina; es
 * la última defensa, no la primera. Es el mismo reparto que ya existe con
 * `athletes.phone`.
 *
 * Lo que este módulo NO hace: tocar los valores de campos que ya no están
 * activos. Se conservan tal cual, porque desactivar un campo no puede perder
 * los datos que el box ya había escrito.
 */

import { z } from 'zod';
import { toE164 } from '../../shared/lib/phone';
import { camposDelAmbito } from './types';
import type {
  AmbitoCampos, DefinicionCampo, ValorCampo, ValorCrudo, ValoresCampos, ValoresCrudos,
} from './types';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** "Halterofília" -> "halterofilia". Para comparar lo que escribió la gente. */
function clave(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/**
 * Las muchas caras de "no escribió nada": ausente, null, "", "   " y [].
 *
 * Esta comprobación va SIEMPRE antes de convertir a número. `Number('')` es 0,
 * así que un campo numérico vacío se guardaría como un 0 perfectamente válido,
 * y un 0 no es un dato: es una casilla vacía disfrazada que arruina promedios
 * y gráficas (ver CLAUDE.md).
 */
export function estaVacio(valor: ValorCrudo): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === 'string') return valor.trim() === '';
  if (Array.isArray(valor)) return valor.filter((v) => v.trim() !== '').length === 0;
  return false;
}

/** Lo que la gente escribe para decir sí o no, en un Excel o en un formulario. */
const VERDADEROS = new Set(['si', 'sí', 's', 'true', 'verdadero', 'x', '1', 'ok']);
const FALSOS = new Set(['no', 'n', 'false', 'falso', '0', '']);

/** Busca la opción canónica: exacta primero, y si no, sin tildes ni mayúsculas. */
function resolverOpcion(texto: string, opciones: string[]): string | null {
  const limpio = texto.trim();
  const exacta = opciones.find((o) => o === limpio);
  if (exacta !== undefined) return exacta;
  const laxa = opciones.find((o) => clave(o) === clave(limpio));
  return laxa ?? null;
}

/** Una fecha con forma de fecha puede no existir: el 31 de febrero, por ejemplo. */
function fechaReal(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
  );
}

// ---------------------------------------------------------------------------
// Esquema de un campo
// ---------------------------------------------------------------------------

/**
 * Esquema zod de UN campo, construido a partir de su definición.
 *
 * El error se emite DENTRO del transform, que es el único sitio donde se
 * distingue "no escribió nada" de "escribió algo que no se entiende". Es la
 * misma lección que costó el bug del teléfono en `athletes/schema.ts`.
 *
 * Devuelve `undefined` cuando el campo quedó vacío y no era obligatorio: la
 * clave no se guarda, en vez de guardar una cadena vacía.
 */
export function esquemaDeCampo(def: DefinicionCampo) {
  return z.unknown().transform((entrada, ctx): ValorCampo | undefined => {
    const valor = entrada as ValorCrudo;

    const falla = (mensaje: string) => {
      ctx.addIssue({ code: 'custom', message: mensaje });
      return z.NEVER;
    };

    if (estaVacio(valor)) {
      if (def.is_required) return falla(`El campo "${def.label}" es obligatorio.`);
      return undefined;
    }

    switch (def.field_type) {
      case 'text': {
        const texto = String(valor).trim();
        if (texto.length > 500) {
          return falla(`El campo "${def.label}" no puede pasar de 500 caracteres.`);
        }
        return texto;
      }

      case 'number': {
        if (typeof valor === 'number') {
          if (!Number.isFinite(valor)) return falla(`El campo "${def.label}" espera un número.`);
          return valor;
        }
        // Se comprueba el PATRÓN antes de convertir. `Number.isFinite()` sobre
        // el resultado no basta: Number('') es 0 y Number(' 12 ') es 12.
        const texto = String(valor).trim().replace(',', '.');
        if (!/^-?\d+(\.\d+)?$/.test(texto)) {
          return falla(`El campo "${def.label}" espera un número. Se recibió "${String(valor).trim()}".`);
        }
        return Number(texto);
      }

      case 'date': {
        const texto = String(valor).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
          return falla(
            `El campo "${def.label}" espera una fecha con formato AAAA-MM-DD. Se recibió "${texto}".`,
          );
        }
        if (!fechaReal(texto)) {
          return falla(`El campo "${def.label}" tiene una fecha que no existe: "${texto}".`);
        }
        return texto;
      }

      case 'boolean': {
        if (typeof valor === 'boolean') return valor;
        const texto = clave(String(valor));
        if (VERDADEROS.has(texto)) return true;
        if (FALSOS.has(texto)) return false;
        return falla(`El campo "${def.label}" solo acepta sí o no. Se recibió "${String(valor).trim()}".`);
      }

      case 'select': {
        const texto = String(valor).trim();
        const opcion = resolverOpcion(texto, def.options);
        if (opcion === null) {
          return falla(
            `El campo "${def.label}" no acepta "${texto}". Opciones válidas: ${def.options.join(', ')}.`,
          );
        }
        return opcion;
      }

      case 'multiselect': {
        // El formulario manda un arreglo; el Excel manda "A, B; C" en una celda.
        const crudos = Array.isArray(valor)
          ? valor
          : String(valor).split(/[,;|]/);
        const salida: string[] = [];
        for (const bruto of crudos) {
          const texto = String(bruto).trim();
          if (texto === '') continue;
          const opcion = resolverOpcion(texto, def.options);
          if (opcion === null) {
            return falla(
              `El campo "${def.label}" no acepta "${texto}". Opciones válidas: ${def.options.join(', ')}.`,
            );
          }
          if (!salida.includes(opcion)) salida.push(opcion);
        }
        if (salida.length === 0) {
          if (def.is_required) return falla(`El campo "${def.label}" es obligatorio.`);
          return undefined;
        }
        return salida;
      }

      case 'phone': {
        const texto = String(valor).trim();
        const e164 = toE164(texto);
        // Un teléfono escrito que no se puede normalizar es un ERROR, no un
        // campo vacío: guardarlo como null perdería el dato en silencio.
        if (!e164) {
          return falla(
            `El campo "${def.label}" no se entiende como celular: "${texto}". Ejemplo: 300 123 4567`,
          );
        }
        return e164;
      }
    }
  });
}

/** Esquema del objeto completo, por si se quiere validar de una sola pasada. */
export function esquemaDeCampos(defs: DefinicionCampo[], ambito: AmbitoCampos = 'todos') {
  const forma: Record<string, ReturnType<typeof esquemaDeCampo>> = {};
  for (const def of camposDelAmbito(defs, ambito)) forma[def.key] = esquemaDeCampo(def);
  return z.object(forma);
}

// ---------------------------------------------------------------------------
// La función que usan el formulario y el importador
// ---------------------------------------------------------------------------

export interface ResultadoCampos {
  /** true si no hubo ni un error. */
  ok: boolean;
  /** Los valores ya normalizados, listos para el jsonb. */
  valores: ValoresCampos;
  /** Mensaje de error por clave de campo. Vacío si `ok`. */
  errores: Record<string, string>;
}

/**
 * Valida y normaliza los valores de los campos personalizados de un box.
 *
 * @param defs    Definiciones del box. Las inactivas se ignoran a propósito.
 * @param valores Lo que escribió la gente, por clave de campo.
 * @param ambito  'normales' para lo que va en `athletes.custom`, 'sensibles'
 *                para lo que va en `athlete_custom_sensitive`. Guardar el
 *                resultado en la tabla que no le toca lo rechaza la base.
 *
 * Los valores cuya clave no corresponde a ningún campo ACTIVO se conservan tal
 * cual y sin validar. No es un descuido: es lo que hace que desactivar un campo
 * —o borrar su definición— no borre lo que el box ya había escrito. La base
 * sigue exactamente la misma regla.
 */
export function validarCampos(
  defs: DefinicionCampo[],
  valores: ValoresCrudos,
  ambito: AmbitoCampos = 'todos',
): ResultadoCampos {
  const activos = camposDelAmbito(defs, ambito);
  const conocidas = new Set(activos.map((d) => d.key));

  const salida: ValoresCampos = {};
  const errores: Record<string, string> = {};

  // Primero lo que no tiene definición activa: viaja intacto.
  for (const [clave_, valor] of Object.entries(valores)) {
    if (conocidas.has(clave_)) continue;
    if (valor === null || valor === undefined) continue;
    salida[clave_] = valor;
  }

  for (const def of activos) {
    const r = esquemaDeCampo(def).safeParse(valores[def.key]);
    if (!r.success) {
      errores[def.key] = r.error.issues[0]?.message ?? `El campo "${def.label}" no es válido.`;
      continue;
    }
    if (r.data !== undefined) salida[def.key] = r.data;
  }

  return { ok: Object.keys(errores).length === 0, valores: salida, errores };
}

/**
 * Los valores guardados, convertidos a lo que espera el formulario.
 * (El jsonb trae números y booleanos; los `<input>` quieren texto.)
 */
export function valoresParaFormulario(
  defs: DefinicionCampo[],
  guardados: ValoresCampos | null | undefined,
  ambito: AmbitoCampos = 'todos',
): ValoresCrudos {
  const salida: ValoresCrudos = {};
  const fuente = guardados ?? {};
  for (const def of camposDelAmbito(defs, ambito)) {
    const v = fuente[def.key];
    if (v === undefined || v === null) {
      salida[def.key] = def.field_type === 'multiselect' ? [] : def.field_type === 'boolean' ? false : '';
      continue;
    }
    if (def.field_type === 'multiselect') salida[def.key] = Array.isArray(v) ? v : [String(v)];
    else if (def.field_type === 'boolean') salida[def.key] = v === true;
    else salida[def.key] = String(v);
  }
  return salida;
}

/** Cómo se lee un valor guardado en la ficha del atleta. */
export function textoDelValor(def: DefinicionCampo, valor: ValorCampo | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (def.field_type === 'boolean') return valor === true ? 'Sí' : 'No';
  if (Array.isArray(valor)) return valor.length > 0 ? valor.join(', ') : '—';
  return String(valor);
}
