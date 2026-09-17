/**
 * La aplicación instalable (PWA).
 *
 * Tres piezas y ninguna obligatoria:
 *   · `registrarServiceWorker()` — se llama una vez desde `main.tsx`.
 *   · `<InstalarApp />`          — ofrece instalarla; se puede decir que no.
 *   · `<AvisoNuevaVersion />`    — avisa cuando hay versión nueva.
 *
 * Lo que el service worker guarda y lo que jamás guarda está explicado en
 * `public/sw.js`. Resumen: el cascarón sí, los datos de atletas no.
 */
export { registrarServiceWorker, aplicarVersionNueva, versionNuevaDisponible, alHaberVersionNueva } from './registro';
export { InstalarApp } from './InstalarApp';
export { AvisoNuevaVersion } from './AvisoNuevaVersion';
export { corriendoInstalada } from './instalacion';
export type { EventoDeInstalacion } from './instalacion';
