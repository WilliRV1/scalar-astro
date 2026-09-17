/**
 * Registro del service worker.
 *
 * El archivo del worker (`public/sw.js`) está escrito a mano a propósito: no se
 * instaló `vite-plugin-pwa`. Una dependencia menos que actualizar, y sobre todo
 * un archivo que se puede LEER para saber qué se está guardando en el teléfono
 * del cliente. En una aplicación con datos de personas eso no es un detalle.
 *
 * `main.tsx` llama a `registrarServiceWorker()` una vez, al arrancar.
 *
 * La PWA nunca es obligatoria: si el navegador no soporta service workers o el
 * registro falla, aquí no pasa nada y la aplicación funciona igual.
 */

type Escucha = () => void;

let registro: ServiceWorkerRegistration | null = null;
let hayVersionNueva = false;
let recargando = false;
const escuchas = new Set<Escucha>();

function avisar(): void {
  for (const escucha of escuchas) escucha();
}

function vigilarInstalacion(reg: ServiceWorkerRegistration): void {
  // Un worker en `waiting` es una versión nueva lista y esperando. Solo se
  // avisa si YA había uno controlando la página: la primera instalación no es
  // una "versión nueva", es la primera.
  if (reg.waiting && navigator.serviceWorker.controller) {
    hayVersionNueva = true;
    avisar();
  }

  reg.addEventListener('updatefound', () => {
    const entrante = reg.installing;
    if (!entrante) return;
    entrante.addEventListener('statechange', () => {
      if (entrante.state === 'installed' && navigator.serviceWorker.controller) {
        hayVersionNueva = true;
        avisar();
      }
    });
  });
}

/**
 * Registra el service worker. Idempotente: llamarlo dos veces no hace nada.
 *
 * Solo en producción. En desarrollo un service worker sirviendo el cascarón
 * desde la caché pelea con el recargado en caliente de Vite y produce el peor
 * bug posible: "a mí no me aparece el cambio".
 */
export function registrarServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;
  if (registro) return;

  // Cuando el worker nuevo toma el control, se recarga una sola vez para que la
  // página quede servida por la versión que el usuario acaba de aceptar.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return;
    recargando = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        registro = reg;
        vigilarInstalacion(reg);
      })
      .catch(() => {
        // Sin service worker se vive perfectamente. No se molesta al usuario.
      });
  });
}

/** ¿Hay una versión nueva instalada esperando a que el usuario la acepte? */
export function versionNuevaDisponible(): boolean {
  return hayVersionNueva;
}

/** Se suscribe a los cambios de "hay versión nueva". Devuelve cómo darse de baja. */
export function alHaberVersionNueva(escucha: Escucha): () => void {
  escuchas.add(escucha);
  return () => {
    escuchas.delete(escucha);
  };
}

/**
 * Aplica la versión nueva: le dice al worker en espera que tome el control.
 * La recarga la dispara `controllerchange`, arriba.
 */
export function aplicarVersionNueva(): void {
  const esperando = registro?.waiting;
  if (!esperando) {
    window.location.reload();
    return;
  }
  esperando.postMessage('SALTAR_ESPERA');
}
