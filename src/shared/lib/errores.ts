/**
 * Un error, dicho como se le dice a una persona.
 *
 * Los mensajes que la base redacta en español se muestran tal cual: dicen qué
 * pasó y cómo arreglarlo. Lo que se traduce aquí es lo que NO viene redactado:
 * los errores genéricos de Postgres, de Storage y del navegador, que le
 * llegaban al coach en inglés ("duplicate key value violates unique
 * constraint", "Failed to fetch").
 */

interface ErrorConDatos {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  name?: unknown;
}

function datos(err: unknown): ErrorConDatos {
  return typeof err === 'object' && err !== null ? (err as ErrorConDatos) : {};
}

/** Texto crudo del error, sin traducir. */
export function textoDeError(err: unknown): string {
  const d = datos(err);
  if (typeof d.message === 'string' && d.message.length > 0) return d.message;
  return String(err ?? '');
}

/** true si el fallo fue de red o de sesión, no del servidor. */
export function esErrorDeRed(err: unknown): boolean {
  const t = textoDeError(err);
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(t)
    || datos(err).name === 'AbortError';
}

export function mensajeAmigable(err: unknown): string {
  const d = datos(err);
  const texto = textoDeError(err);
  const codigo = String(d.code ?? d.statusCode ?? '');

  if (esErrorDeRed(err)) {
    return 'Sin conexión. Revisa la señal e intenta de nuevo.';
  }

  // Un error escrito en español por nosotros: se muestra tal cual.
  if (/[áéíóúñ¿¡]|\b(el|la|los|las|no|del|que|para|con)\b/i.test(texto) && !/^[A-Za-z_]+Error:/.test(texto)) {
    return texto;
  }

  switch (codigo) {
    case '23505':
      return 'Ya existe un registro igual. Revisa que no esté repetido.';
    case '23503':
      return 'No se puede: hay otros datos que dependen de este.';
    case '42501':
      return 'No tienes permiso para hacer esto en este box.';
    case '23514':
      return 'Uno de los datos no tiene el formato que se espera.';
    case 'PGRST116':
      return 'No se encontró el registro. Puede que alguien lo haya borrado.';
    case '401':
    case 'PGRST301':
      return 'La sesión venció. Vuelve a entrar.';
    default:
      break;
  }

  if (/row-level security/i.test(texto)) return 'No tienes permiso para hacer esto en este box.';
  if (/duplicate key/i.test(texto)) return 'Ya existe un registro igual. Revisa que no esté repetido.';
  if (/jwt|token|expired/i.test(texto)) return 'La sesión venció. Vuelve a entrar.';
  if (/payload too large|exceeded the maximum allowed size|file size/i.test(texto)) {
    return 'El archivo es demasiado grande.';
  }
  if (/non-2xx|edge function/i.test(texto)) {
    return 'El servicio de pagos no está disponible en este momento.';
  }
  if (/^\[object Object\]$|^$/.test(texto)) return 'Algo falló. Intenta de nuevo.';

  return texto;
}
