// =============================================================================
// run-automations · evalúa las reglas activas del box y encola los mensajes
// =============================================================================
// Entrada:  POST { "org_id"?: "<uuid>", "now"?: "<ISO 8601>", "risk"?: bool }
// Salida:   { ok, resultados: [{ org_id, queued, evaluated, run_date }], riesgo }
//
// Quién la llama: el programador de tareas (pg_cron / Scheduler), cada hora.
// NO la llama un navegador: no lleva cabeceras CORS a propósito.
//
// La autorización es un secreto compartido (AUTOMATIONS_CRON_SECRET) comparado
// en tiempo constante, no el JWT: un JWT anónimo válido lo tiene cualquiera que
// abra la aplicación, y este trabajo le escribe a los atletas del box.
// Esta función debe declararse con `verify_jwt = false` en supabase/config.toml
// (la integra quien enruta; este archivo no lo toca).
//
// Toda la lógica de negocio vive en `public.run_automations` (migración 0011):
// idempotencia, horario silencioso, antifatiga y prioridad entre reglas. Aquí
// solo se orquesta y se deja rastro en `job_runs`, porque una Edge Function se
// reintenta, se despliega a mitad y puede correr dos veces en paralelo.
//
// `now` es inyectable para poder reproducir un día concreto en soporte
// ("¿por qué no le llegó el aviso el 15?"), igual que en el motor de cobros.
// =============================================================================

import { requiereEnv } from '../_shared/env.ts';
import { error, json, registrarFallo } from '../_shared/http.ts';
import { clienteDeServicio } from '../_shared/supabase.ts';
import { igualesEnTiempoConstante } from '../_shared/wompi.ts';

interface Peticion {
  org_id?: string;
  now?: string;
  /** Por defecto sí: la lista del coach tiene que estar lista antes de que abra el box. */
  risk?: boolean;
}

interface FilaAutomatizacion {
  org_id: string;
  queued: number;
  evaluated: number;
  run_date: string;
}

interface FilaRiesgo {
  org_id: string;
  athletes_scored: number;
  computed_on: string;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return error(405, 'metodo_no_permitido', 'Este recurso solo acepta POST.');
  }

  // ---------------------------------------------------------------------------
  // 1 · Autorización. Antes de esto, la petición es solo un POST de un
  //     desconocido que quiere hacerle escribir al box.
  // ---------------------------------------------------------------------------
  let secreto: string;
  try {
    secreto = requiereEnv('AUTOMATIONS_CRON_SECRET');
  } catch (causa) {
    registrarFallo('run-automations:config', causa);
    return error(500, 'configuracion', 'El servicio no está configurado.');
  }

  const enviado = req.headers.get('x-cron-secret') ?? '';
  if (!igualesEnTiempoConstante(enviado, secreto)) {
    return error(401, 'no_autorizado', 'Credencial inválida.');
  }

  let cuerpo: Peticion = {};
  if (req.headers.get('content-length') !== '0') {
    try {
      cuerpo = (await req.json()) as Peticion;
    } catch {
      // Un cuerpo vacío es lo normal cuando lo dispara el programador.
      cuerpo = {};
    }
  }

  if (cuerpo.org_id !== undefined && !ES_UUID.test(cuerpo.org_id)) {
    return error(400, 'org_invalida', 'El identificador del box no es válido.');
  }
  if (cuerpo.now !== undefined && Number.isNaN(Date.parse(cuerpo.now))) {
    return error(400, 'fecha_invalida', 'La fecha de referencia no es válida.');
  }

  const db = clienteDeServicio();
  const ahora = cuerpo.now ?? new Date().toISOString();
  const calcularRiesgo = cuerpo.risk !== false;

  // ---------------------------------------------------------------------------
  // 2 · Registrar que el trabajo empezó. Si la función muere a mitad, la fila
  //     queda en 'running' y eso mismo es la señal de que algo pasó.
  // ---------------------------------------------------------------------------
  const { data: corrida } = await db
    .from('job_runs')
    .insert({ job: 'run-automations', status: 'running' })
    .select('id')
    .single();

  try {
    // El riesgo se calcula ANTES de evaluar las reglas: así el reporte semanal
    // y las reglas que miran la banda usan la foto de hoy, no la de ayer.
    let riesgo: FilaRiesgo[] = [];
    if (calcularRiesgo) {
      const { data, error: fallo } = await db.rpc('refresh_risk_scores', {
        p_org_id: cuerpo.org_id ?? null,
        p_now: ahora,
      });
      if (fallo) throw fallo;
      riesgo = (data ?? []) as FilaRiesgo[];
    }

    const { data, error: fallo } = await db.rpc('run_automations', {
      p_org_id: cuerpo.org_id ?? null,
      p_now: ahora,
    });
    if (fallo) throw fallo;

    const resultados = (data ?? []) as FilaAutomatizacion[];
    const encolados = resultados.reduce((suma, r) => suma + (r.queued ?? 0), 0);

    if (corrida?.id) {
      await db
        .from('job_runs')
        .update({ status: 'ok', processed: encolados, finished_at: new Date().toISOString() })
        .eq('id', corrida.id);
    }

    return json({ ok: true, encolados, resultados, riesgo });
  } catch (causa) {
    registrarFallo('run-automations', causa);
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
    // 500 a propósito: que el programador lo reintente. Encolar es idempotente.
    return error(500, 'fallo_del_motor', 'No se pudieron evaluar las automatizaciones.');
  }
});
