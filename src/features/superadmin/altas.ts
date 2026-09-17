/**
 * Reglas del alta de un box que también viven en el cliente.
 *
 * La verdad está en `public.create_organization()`; esto es solo para avisarle
 * al operador antes de mandar la petición. Si alguna vez se separan, manda la
 * base de datos.
 */

import type { TramoDePlan } from './types';

/** Mismo CHECK que `organizations.slug`. */
export const SLUG_VALIDO = /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/;

/** Espejo de `private.slug_reservado()`. */
export const SLUGS_RESERVADOS = [
  'www', 'app', 'api', 'admin', 'demo', 'staging', 'localhost',
  'scalar', 'soporte', 'ayuda', 'blog', 'status', 'mail', 'cdn', 'dev', 'test',
];

/** Mismo criterio que el CHECK de la tabla: ni más estricto ni más laxo. */
export const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Precio de lista en centavos. Fuente: docs/05-negocio-precio-gtm.md */
export const PRECIO_CENTAVOS: Record<TramoDePlan, number> = {
  trial: 0,
  starter: 9_900_000,
  box: 17_900_000,
  pro: 32_900_000,
  chain: 0,
};

export const PRECIO_FUNDADOR_CENTAVOS = 4_000_000;
export const ENTRADA_FUNDADOR_CENTAVOS = 15_000_000;
export const IMPLEMENTACION_CENTAVOS = 45_000_000;

/** "Box Rubio Cali" -> "box-rubio-cali". Sugerencia, el operador la puede cambiar. */
export function slugSugerido(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/** Devuelve el problema del slug en español, o null si está bien. */
export function problemaDelSlug(slug: string): string | null {
  const limpio = slug.trim().toLowerCase();
  if (!limpio) return 'El slug es el subdominio del box. Sin él no hay dónde entrar.';
  if (!SLUG_VALIDO.test(limpio)) {
    return 'Solo minúsculas, números y guiones; entre 3 y 50 caracteres, sin empezar ni terminar en guion.';
  }
  if (SLUGS_RESERVADOS.includes(limpio)) return `"${limpio}" está reservado por la plataforma.`;
  return null;
}

/** La dirección donde va a vivir el box. */
export function dominioDelBox(slug: string): string {
  return `${slug || 'tu-box'}.scalar.app`;
}

/**
 * Enlace con el que el dueño reclama su box.
 *
 * La ruta `/propiedad/:token` la enruta la aplicación a una pantalla que llama
 * a `public.accept_owner_invitation(token)`.
 */
export function enlaceDePropiedad(token: string): string {
  const base = typeof window === 'undefined' ? '' : window.location.origin;
  return `${base}/propiedad/${token}`;
}
