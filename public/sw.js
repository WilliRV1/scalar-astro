/* =============================================================================
 * Service worker de Scalar — escrito a mano, sin plugin
 * =============================================================================
 * Objetivo: que la aplicación ABRA aunque el celular esté sin señal (en un box
 * el wifi se cae y hay sótanos sin datos), sin que eso signifique dejar datos
 * personales de atletas guardados en un dispositivo que suele ser compartido:
 * el celular del mostrador lo usa quien esté de turno.
 *
 * ESTRATEGIA, en tres reglas:
 *
 *   1. EL CASCARÓN, EN CACHÉ. El HTML, el JS y el CSS de la aplicación se
 *      guardan y se sirven desde la caché. Son públicos, iguales para todos los
 *      boxes y no dicen nada de nadie.
 *
 *   2. LOS DATOS, SIEMPRE DE LA RED Y NUNCA GUARDADOS. Toda petición a Supabase
 *      (`/rest/v1`, `/auth/v1`, `/storage/v1`, `/functions/v1`) pasa derecho al
 *      servidor y su respuesta NO se guarda. Un nombre, un teléfono o una deuda
 *      no se quedan en el disco del teléfono esperando a que lo tome otro.
 *      Tampoco se cachea nada que no sea GET.
 *
 *   3. SIN MODO "OFFLINE" FALSO. Sin red, la aplicación abre y dice que no hay
 *      conexión. No se muestran datos viejos como si fueran de hoy: un cobro
 *      desactualizado hace que el box le reclame plata a quien ya pagó.
 *
 * La PWA NUNCA es obligatoria: si el navegador no soporta service workers, o el
 * usuario no instala nada, todo sigue funcionando igual. Lo esencial del
 * negocio pasa por WhatsApp (docs/08 § 7.3).
 * ========================================================================== */

// Subir esta versión invalida la caché anterior. El aviso de "hay versión
// nueva" que ve el usuario lo dispara el navegador al detectar que este archivo
// cambió, así que basta con cambiar el número.
const VERSION = 'v1';
const CACHE_CASCARON = `scalar-cascaron-${VERSION}`;

// Lo mínimo para que la aplicación arranque sin red.
const CASCARON = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png'];

// Rutas de datos: jamás se guardan.
const RUTAS_DE_DATOS = ['/rest/v1', '/auth/v1', '/storage/v1', '/functions/v1', '/realtime/v1'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_CASCARON);
      // addAll falla entero si un recurso falla; se agregan de a uno para que
      // un icono perdido no deje al usuario sin service worker.
      await Promise.all(
        CASCARON.map((ruta) => cache.add(ruta).catch(() => undefined)),
      );
    })(),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(
        nombres.filter((n) => n !== CACHE_CASCARON).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/** ¿Esta petición lleva o trae datos de personas? */
function esPeticionDeDatos(url) {
  return RUTAS_DE_DATOS.some((ruta) => url.pathname.startsWith(ruta));
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;

  // Solo GET. Un POST de cobro no se toca jamás.
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);

  // Otro origen (Supabase, Wompi, fuentes de Google): pasa derecho, sin caché.
  if (url.origin !== self.location.origin) return;

  // Datos del propio origen (si algún día hay un proxy): también derecho.
  if (esPeticionDeDatos(url)) return;

  // Navegación (abrir la app, recargar, volver): RED PRIMERO, para que un
  // despliegue nuevo se vea de una y no haya que "limpiar el caché".
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      (async () => {
        try {
          const respuesta = await fetch(peticion);
          const cache = await caches.open(CACHE_CASCARON);
          cache.put('/index.html', respuesta.clone());
          return respuesta;
        } catch {
          const cache = await caches.open(CACHE_CASCARON);
          const guardado = (await cache.match('/index.html')) || (await cache.match('/'));
          if (guardado) return guardado;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Sin conexión</title>' +
              '<body style="background:#000;color:#fff;font-family:system-ui;padding:2rem">' +
              '<h1>Sin conexión</h1><p>Vuelve a intentarlo cuando tengas señal. ' +
              'Si es urgente, escríbele al box por WhatsApp.</p></body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }
      })(),
    );
    return;
  }

  // Recursos estáticos de la aplicación (JS, CSS, iconos, fuentes locales):
  // se responde con lo guardado y se refresca por detrás. Vite les pone un
  // hash en el nombre, así que una versión nueva es una URL nueva y nunca se
  // sirve JS viejo con datos nuevos.
  evento.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_CASCARON);
      const guardado = await cache.match(peticion);
      const red = fetch(peticion)
        .then((respuesta) => {
          if (respuesta && respuesta.ok && respuesta.type === 'basic') {
            cache.put(peticion, respuesta.clone());
          }
          return respuesta;
        })
        .catch(() => undefined);
      return guardado || (await red) || Response.error();
    })(),
  );
});

// El usuario tocó "Actualizar" en el aviso de versión nueva.
self.addEventListener('message', (evento) => {
  if (evento.data === 'SALTAR_ESPERA') self.skipWaiting();
});
