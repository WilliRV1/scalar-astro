// =============================================================================
// Respuestas HTTP y CORS
// =============================================================================
// Regla de oro de este archivo: al cliente se le devuelve un mensaje corto y
// en español; el detalle técnico se queda en los registros del servidor. Un
// mensaje de error nunca debe permitir deducir si un secreto está mal
// configurado, qué factura existe o qué box es cuál.
// =============================================================================

/**
 * CORS solo donde hace falta: `create-payment-link` la llama el navegador del
 * panel, así que necesita preflight. El webhook lo llama Wompi servidor a
 * servidor y NO lleva cabeceras CORS: abrirlo no aporta nada y confunde.
 *
 * `SITIO_PERMITIDO` acota el origen en producción. Sin la variable se cae a
 * '*', que sirve para desarrollo pero conviene fijar antes de salir a vivo.
 */
export function cabecerasCors(origenPermitido?: string): Record<string, string> {
  return {
    'access-control-allow-origin': origenPermitido ?? '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

export function json(
  cuerpo: unknown,
  estado = 200,
  cabeceras: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cabeceras },
  });
}

/**
 * Error hacia el cliente. `detalle` NO viaja: se registra aparte.
 * `codigo` es una etiqueta estable que el frontend puede usar para decidir
 * qué mostrar, sin tener que leer el texto.
 */
export function error(
  estado: number,
  codigo: string,
  mensaje: string,
  cabeceras: Record<string, string> = {},
): Response {
  return json({ ok: false, codigo, mensaje }, estado, cabeceras);
}

/** Registra el detalle técnico sin filtrarlo en la respuesta. */
export function registrarFallo(contexto: string, causa: unknown): void {
  const detalle = causa instanceof Error ? `${causa.name}: ${causa.message}` : String(causa);
  console.error(`[${contexto}] ${detalle}`);
}
