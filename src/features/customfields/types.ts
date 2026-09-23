/**
 * Campos personalizados: los que cada box añade a la ficha del atleta.
 *
 * Espejo en el cliente de `public.custom_field_defs` (migración
 * 20260923110000_custom_fields.sql). Los tipos viven aquí y no en
 * `src/types/database.ts` porque este dominio se integra aparte; cuando se
 * regeneren los tipos de la base, estos siguen valiendo como contrato.
 */

/** Los tipos de campo que el dueño puede elegir. Mismo `check` que la base. */
export const TIPOS_CAMPO = [
  'text', 'number', 'date', 'select', 'multiselect', 'boolean', 'phone',
] as const;

export type TipoCampo = (typeof TIPOS_CAMPO)[number];

/** Etiquetas en español para el selector de tipo. */
export const ETIQUETA_TIPO: Record<TipoCampo, string> = {
  text: 'Texto',
  number: 'Número',
  date: 'Fecha',
  select: 'Lista (una opción)',
  multiselect: 'Lista (varias opciones)',
  boolean: 'Sí / No',
  phone: 'Celular',
};

export const AYUDA_TIPO: Record<TipoCampo, string> = {
  text: 'Talla de camiseta, nombre del acudiente, EPS…',
  number: 'Peso objetivo, número de camiseta. Se guarda como número, no como texto.',
  date: 'Fecha de la revisión médica, vencimiento del seguro.',
  select: 'Una sola opción de una lista que tú defines.',
  multiselect: 'Varias opciones de la misma lista.',
  boolean: 'Una casilla: firmó el consentimiento en papel, tiene llave del box…',
  phone: 'Se guarda en formato internacional (+573001234567), como el resto del sistema.',
};

/** Una definición de campo, tal como viene de la base. */
export interface DefinicionCampo {
  id: string;
  org_id: string;
  /** Clave dentro del jsonb. INMUTABLE: la base rechaza cambiarla. */
  key: string;
  label: string;
  field_type: TipoCampo;
  /** Solo para `select` y `multiselect`. */
  options: string[];
  is_required: boolean;
  /**
   * Dato sensible (lesión, condición médica). Cambia DÓNDE se guarda el valor:
   * en `athlete_custom_sensitive` y no en `athletes.custom`.
   * Ver docs/07-legal-colombia.md.
   */
  is_sensitive: boolean;
  help_text: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Lo que el usuario escribe: texto del formulario o celda del Excel. */
export type ValorCrudo = string | string[] | number | boolean | null | undefined;

/** Lo que se guarda en el jsonb, ya normalizado. */
export type ValorCampo = string | number | boolean | string[];

export type ValoresCrudos = Record<string, ValorCrudo>;
export type ValoresCampos = Record<string, ValorCampo>;

/** Qué campos pinta o valida una llamada: los normales, los sensibles o todos. */
export type AmbitoCampos = 'todos' | 'normales' | 'sensibles';

/** Tope de campos activos por box. Mismo número que el trigger de la base. */
export const MAXIMO_CAMPOS = 30;

/** Filtra las definiciones por ámbito. Los inactivos nunca se pintan. */
export function camposDelAmbito(
  defs: DefinicionCampo[],
  ambito: AmbitoCampos = 'todos',
): DefinicionCampo[] {
  return defs
    .filter((d) => d.is_active)
    .filter((d) =>
      ambito === 'todos' ? true : ambito === 'sensibles' ? d.is_sensitive : !d.is_sensitive)
    .sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key));
}
