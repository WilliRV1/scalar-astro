/**
 * Render de plantillas de mensaje.
 *
 * Es el espejo EXACTO de `public.render_template` (migración 0011). Tiene que
 * serlo: la vista previa que ve el dueño antes de prender una regla es la
 * promesa de lo que va a recibir el atleta. Si divergen, el dueño aprueba un
 * texto y se manda otro, y eso se paga con la confianza del cliente.
 *
 * Lógica pura, sin React y sin Supabase, para poder probarla sola.
 */

import type { CategoriaMensaje, PlantillaMensaje } from './types';

const VARIABLE = /\{\{([a-z0-9_]+)\}\}/g;

/** Las variables que usa una plantilla, en orden de aparición y sin repetir. */
export function variablesDe(cuerpo: string): string[] {
  const vistas = new Set<string>();
  for (const [, nombre] of cuerpo.matchAll(VARIABLE)) vistas.add(nombre);
  return [...vistas];
}

/**
 * Reemplaza {{clave}} por su valor. Lo que no venga se BORRA, nunca se deja
 * literal: un mensaje con "{{nombre}}" a la vista es peor que uno con un hueco.
 */
export function renderizarPlantilla(
  cuerpo: string,
  variables: Record<string, string | null | undefined>,
): string {
  return cuerpo.replace(VARIABLE, (_, nombre: string) => variables[nombre] ?? '');
}

/** Variables de ejemplo para la vista previa. Nombres y cifras de Cali, no "Lorem". */
export const EJEMPLO: Record<string, string> = {
  nombre: 'Juan Camilo',
  box: 'Tu Box',
  fecha: '20/03/2026',
  valor: '$ 180.000',
  dias: '5',
  link: 'https://pagar.tubox.co/f-000123',
  movimiento: 'Back Squat',
  marca: '120 kg',
  clase: 'Funcional',
  hora: '06:00 AM',
  motivo: 'festivo',
  faltas: '3',
  insumo: 'magnesio',
  proveedor: 'Distribuidora del Valle',
  desde: '09/03',
  hasta: '16/03',
  ingresos: '$ 4.320.000',
  cartera: '$ 900.000',
  altas: '3',
  bajas: '1',
  asistencia: '42,0',
  riesgo: '· Ana Torres (72)\n· Luis Mera (61)',
};

/** Vista previa de una plantilla con datos de ejemplo. */
export function vistaPrevia(cuerpo: string): string {
  return renderizarPlantilla(cuerpo, EJEMPLO);
}

/**
 * Lo que a Meta le importa y lo que al box le cuesta.
 * Ver docs/04 §Costos reales: `utility` ≈ US$0,001 y `marketing` ≈ US$0,02.
 */
export function etiquetaDeCategoria(categoria: CategoriaMensaje): string {
  switch (categoria) {
    case 'utility': return 'Transaccional';
    case 'marketing': return 'Publicitario';
    case 'authentication': return 'Código de acceso';
    case 'internal': return 'Interno (al equipo)';
  }
}

/**
 * Una plantilla de marketing TIENE que decir cómo salirse (docs/04 §Reglas
 * duras, 3). Es requisito de Meta y de la ley colombiana de datos, y si falta,
 * lo barato no es la multa: es que el atleta reporte el número del box.
 */
export function avisosDePlantilla(plantilla: Pick<PlantillaMensaje, 'body' | 'category'>): string[] {
  const avisos: string[] = [];
  const cuerpo = plantilla.body.toLowerCase();

  if (plantilla.category === 'marketing'
      && !/(no quiero|no quieres|responde no|baja|dar de baja|no recibir)/.test(cuerpo)) {
    avisos.push('Un mensaje publicitario debe decir cómo pedir que no le escriban más.');
  }
  if (plantilla.body.trim().length === 0) {
    avisos.push('El mensaje está vacío.');
  }
  // WhatsApp no corta a los 1024, pero un mensaje largo no se lee.
  if (plantilla.body.length > 1024) {
    avisos.push('El mensaje es muy largo: pasa de 1.024 caracteres.');
  }
  if (/\{\{\s/.test(plantilla.body) || /\s\}\}/.test(plantilla.body)) {
    avisos.push('Hay una variable con espacios: se escribe {{nombre}}, sin espacios.');
  }
  return avisos;
}
