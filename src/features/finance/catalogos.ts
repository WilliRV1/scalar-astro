/**
 * Catálogos de la interfaz: los valores que acepta la base, con su nombre en
 * español. Viven aparte de los componentes para que el recargado en caliente de
 * Vite siga funcionando (un archivo de componentes solo exporta componentes).
 */

import type { ExpenseKind, Recurrence } from './types';

export const RECURRENCIAS: { value: Recurrence; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
];

export const TIPOS_DE_GASTO: { value: ExpenseKind; label: string }[] = [
  { value: 'operational', label: 'Operativo' },
  { value: 'payroll', label: 'Nómina' },
  { value: 'capex', label: 'Inversión' },
  { value: 'tax', label: 'Impuestos' },
];

/** Unidades con las que un box mide sus insumos. */
export const UNIDADES = ['unidad', 'kg', 'libra', 'caja', 'bolsa', 'par', 'rollo', 'litro'];
