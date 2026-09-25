// =============================================================================
// Enrutador del edge-runtime autoalojado (widawi)
// =============================================================================
// Hace lo mismo que el `main` del docker-compose oficial de Supabase: recibe
// /<funcion>/... y levanta un worker con supabase/functions/<funcion>.
//
// Aquí NO se verifica el JWT: cada función autentica lo suyo, igual que en la
// nube con `verify_jwt`. create-payment-link y platform-payment-link validan
// la sesión con auth.getUser(); los webhooks, la firma de la pasarela; los
// jobs, el secreto x-cron-secret. Un JWT verificado aquí no añadiría nada y
// rompería los webhooks, que llegan sin sesión.
// =============================================================================

declare const EdgeRuntime: {
  userWorkers: {
    create(opciones: Record<string, unknown>): Promise<{ fetch(req: Request): Promise<Response> }>;
  };
};

const RAIZ = '/home/deno/functions';
const NOMBRE_VALIDO = /^[a-z0-9][a-z0-9-]{1,63}$/;

function respuesta(estado: number, codigo: string, mensaje: string): Response {
  return new Response(JSON.stringify({ ok: false, codigo, mensaje }), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const nombre = url.pathname.split('/').filter(Boolean)[0];

  if (!nombre) return respuesta(400, 'sin_funcion', 'Falta el nombre de la función.');
  if (nombre === 'health') return new Response('ok');
  if (nombre === 'main' || nombre.startsWith('_') || !NOMBRE_VALIDO.test(nombre)) {
    return respuesta(404, 'funcion_desconocida', 'No existe esa función.');
  }

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `${RAIZ}/${nombre}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 60_000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(Deno.env.toObject()),
    });
    return await worker.fetch(req);
  } catch (causa) {
    const detalle = causa instanceof Error ? `${causa.name}: ${causa.message}` : String(causa);
    console.error(`[main] ${nombre}: ${detalle}`);
    return respuesta(500, 'error_interno', 'La función no pudo arrancar.');
  }
});
