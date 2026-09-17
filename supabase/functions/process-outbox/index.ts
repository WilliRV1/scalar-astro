// =============================================================================
// process-outbox · envía lo que el motor dejó encolado
// =============================================================================
// Entrada:  POST { "org_id"?: "<uuid>", "limit"?: number, "now"?: "<ISO>" }
// Salida:   { ok, tomados, enviados, listos, fallidos, simulados }
//
// Quién la llama: el programador de tareas, cada pocos minutos. No la llama un
// navegador: sin CORS a propósito. Debe declararse con `verify_jwt = false` y
// se autoriza con el mismo secreto compartido que `run-automations`.
//
// Tres cosas que esta función NO decide, porque viven en la base:
//   · a quién se le manda (eso ya lo filtró `queue_automation_message`);
//   · si un fallo se reintenta (lo decide `mark_outbox_result`, con espera
//     creciente);
//   · si el box está en simulación (los mensajes simulados ni siquiera salen
//     en el lote: se liquidan aparte y se registra qué habría pasado).
//
// El lote se toma con `for update skip locked`, así que dos instancias del job
// corriendo a la vez NUNCA mandan el mismo mensaje dos veces.
//
// Control de frecuencia: se espera un momento entre mensajes. Escupir 300
// mensajes en tres segundos desde un número nuevo es la mejor forma de que Meta
// limite al CLIENTE, y ese daño no se deshace.
// =============================================================================

import { env, envEntero, requiereEnv } from '../_shared/env.ts';
import { error, json, registrarFallo } from '../_shared/http.ts';
import { clienteDeServicio } from '../_shared/supabase.ts';
import { igualesEnTiempoConstante } from '../_shared/wompi.ts';
import { type MensajeSaliente, proveedorDelEntorno } from './mensajeria.ts';

interface Peticion {
  org_id?: string;
  limit?: number;
  now?: string;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tope duro del lote: una Edge Function tiene tiempo de ejecución limitado. */
const TOPE_DEL_LOTE = 200;

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return error(405, 'metodo_no_permitido', 'Este recurso solo acepta POST.');
  }

  let secreto: string;
  try {
    secreto = requiereEnv('AUTOMATIONS_CRON_SECRET');
  } catch (causa) {
    registrarFallo('process-outbox:config', causa);
    return error(500, 'configuracion', 'El servicio no está configurado.');
  }

  if (!igualesEnTiempoConstante(req.headers.get('x-cron-secret') ?? '', secreto)) {
    return error(401, 'no_autorizado', 'Credencial inválida.');
  }

  let cuerpo: Peticion = {};
  try {
    cuerpo = (await req.json()) as Peticion;
  } catch {
    cuerpo = {};
  }

  if (cuerpo.org_id !== undefined && !ES_UUID.test(cuerpo.org_id)) {
    return error(400, 'org_invalida', 'El identificador del box no es válido.');
  }

  const db = clienteDeServicio();
  const ahora = cuerpo.now ?? new Date().toISOString();
  const tope = Math.min(Math.max(cuerpo.limit ?? envEntero('OUTBOX_BATCH_SIZE', 50), 1), TOPE_DEL_LOTE);
  const pausaMs = envEntero('OUTBOX_DELAY_MS', 350);
  const proveedor = proveedorDelEntorno(env);

  const { data: corrida } = await db
    .from('job_runs')
    .insert({ job: 'process-outbox', status: 'running' })
    .select('id')
    .single();

  let enviados = 0;
  let listos = 0;
  let fallidos = 0;
  let simulados = 0;
  let tomados = 0;

  try {
    // 1 · Modo simulación: no sale nada, pero queda registrado qué habría
    //     pasado. Es lo que ve el cliente en su primera semana y en la demo.
    const { data: simulacion, error: falloSim } = await db.rpc('settle_simulated_messages', {
      p_org_id: cuerpo.org_id ?? null,
      p_limit: TOPE_DEL_LOTE,
      p_now: ahora,
    });
    if (falloSim) throw falloSim;
    simulados = typeof simulacion === 'number' ? simulacion : 0;

    // 2 · El lote real.
    const { data: lote, error: falloLote } = await db.rpc('claim_outbox_batch', {
      p_org_id: cuerpo.org_id ?? null,
      p_limit: tope,
      p_now: ahora,
    });
    if (falloLote) throw falloLote;

    const mensajes = (lote ?? []) as MensajeSaliente[];
    tomados = mensajes.length;

    for (const mensaje of mensajes) {
      const resultado = await proveedor.enviar(mensaje);

      const { error: falloMarca } = await db.rpc('mark_outbox_result', {
        p_id: mensaje.id,
        p_status: resultado.estado,
        p_provider: resultado.proveedor,
        // En la etapa 0 el "identificador del proveedor" es el enlace de un
        // clic: es lo que la interfaz necesita para pintar el botón.
        p_provider_msg_id: resultado.idProveedor ?? resultado.enlace ?? null,
        p_error: resultado.error ?? null,
        p_cost_micros: resultado.costoMicros ?? null,
        p_now: new Date().toISOString(),
      });
      if (falloMarca) {
        // Si no se pudo marcar, el mensaje se queda en 'sending' y lo rescata
        // el siguiente lote. Preferible a marcarlo enviado sin estar seguro.
        registrarFallo('process-outbox:marca', falloMarca);
      }

      if (resultado.estado === 'sent') enviados += 1;
      else if (resultado.estado === 'ready') listos += 1;
      else fallidos += 1;

      // Control de frecuencia.
      if (pausaMs > 0) await esperar(pausaMs);
    }

    if (corrida?.id) {
      await db
        .from('job_runs')
        .update({
          status: 'ok',
          processed: enviados + listos,
          finished_at: new Date().toISOString(),
        })
        .eq('id', corrida.id);
    }

    return json({ ok: true, proveedor: proveedor.nombre, tomados, enviados, listos, fallidos, simulados });
  } catch (causa) {
    registrarFallo('process-outbox', causa);
    if (corrida?.id) {
      await db
        .from('job_runs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          error: causa instanceof Error ? causa.message : String(causa),
        })
        .eq('id', corrida.id);
    }
    return error(500, 'fallo_de_envio', 'No se pudo procesar la bandeja de salida.');
  }
});
