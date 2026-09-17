/**
 * Instalación de la aplicación en el teléfono.
 *
 * `beforeinstallprompt` lo dispara Chrome/Edge/Android cuando la página cumple
 * los requisitos de PWA. No existe en iOS (allí se instala con "Agregar a
 * pantalla de inicio" desde Safari) ni en Firefox de escritorio, así que esto
 * es un extra y nunca una condición para usar nada.
 */

/** El evento no está en lib.dom, así que se declara su forma exacta. */
export interface EventoDeInstalacion extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

/** Marca de "ya me lo ofreciste y dije que no". No se vuelve a insistir. */
export const CLAVE_RECHAZO = 'scalar.instalacion.rechazada';

/** ¿La aplicación ya está corriendo instalada (en su propia ventana)? */
export function corriendoInstalada(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

export function rechazoGuardado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_RECHAZO) === 'si';
  } catch {
    // Navegador en modo privado o con el almacenamiento bloqueado: se ofrece
    // otra vez, que es el mal menor.
    return false;
  }
}

export function guardarRechazo(): void {
  try {
    window.localStorage.setItem(CLAVE_RECHAZO, 'si');
  } catch {
    // Sin almacenamiento no se guarda la preferencia. No es grave.
  }
}
