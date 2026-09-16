/**
 * Resolución del box a partir del subdominio.
 *
 * Cada box vive en <slug>.scalar.app. Un solo despliegue atiende a todos; el
 * subdominio solo decide qué box se muestra por defecto, NUNCA a qué datos se
 * puede acceder. Eso lo decide la RLS con el usuario autenticado: manipular el
 * subdominio no da acceso a nada.
 */

const RESERVED = new Set(['www', 'app', 'api', 'admin', 'demo', 'staging', 'localhost']);

/** Devuelve el slug del box según el host, o null si no aplica (local, dominio raíz). */
export function slugFromHost(host: string = window.location.hostname): string | null {
  const clean = host.split(':')[0];

  // Desarrollo: box-uno.localhost:5173
  if (clean.endsWith('.localhost')) {
    const sub = clean.slice(0, -'.localhost'.length);
    return RESERVED.has(sub) || !sub ? null : sub;
  }

  const parts = clean.split('.');
  if (parts.length < 3) return null; // scalar.app, localhost, 127.0.0.1

  const sub = parts[0];
  return RESERVED.has(sub) ? null : sub;
}
