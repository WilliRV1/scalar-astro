// =============================================================================
// weekly-report · el reporte del lunes para el dueño
// =============================================================================
// Entrada:  POST { "org_id"?: "<uuid>", "now"?: "<ISO>", "enqueue"?: bool }
// Salida:   { ok, reportes: [{ org_id, nombre, reporte, encolado }] }
//
// Regla 10 de docs/04: lunes 07:00, al dueño — ingresos de la semana, cartera
// pendiente, altas y bajas, asistencia promedio y los 3 atletas en mayor
// riesgo. Es el único momento de la semana en que el dueño mira el negocio
// completo, así que los números tienen que salir de UNA sola fuente: la función
// `public.weekly_report` de la base, la misma que usa la pantalla.
//
// `enqueue` (por defecto true) lo deja en `message_outbox` como cualquier otro
// mensaje: respeta el horario silencioso del box y el modo simulación, y queda
// en la bitácora. Con `enqueue: false` solo devuelve los números, que es lo que
// necesita la interfaz para mostrar el reporte sin volver a mandarlo.
//
// Se autoriza con el mismo secreto compartido que los otros dos trabajos y debe
// declararse con `verify_jwt = false`.
// =============================================================================

import { requiereEnv } from '../_shared/env.ts';
import { error, json, registrarFallo } from '../_shared/http.ts';
import { clienteDeServicio } from '../_shared/supabase.ts';
import { igualesEnTiempoConstante } from '../_shared/wompi.ts';

interface Peticion {
  org_id?: string;
  now?: string;
  enqueue?: boolean;
}

interface Box {
  id: string;
  name: string;
}

/** Las variables que rellenan la plantilla `weekly_report`. */
interface Reporte {
  box: string;
  desde: string;
  hasta: string;
  ingresos: string;
  cartera: string;
  altas: string;
  bajas: string;
  asistencia: string;
  riesgo: string;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Semana ISO del día de referencia: es la unidad del dedupe_key. */
function semanaIso(fecha: Date): string {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicioDeAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioDeAnio.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-S${String(semana).padStart(2, '0')}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return error(405, 'metodo_no_permitido', 'Este recurso solo acepta POST.');
  }

  let secreto: string;
  try {
    secreto = requiereEnv('AUTOMATIONS_CRON_SECRET');
  } catch (causa) {
    registrarFallo('weekly-report:config', causa);
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
  const encolar = cuerpo.enqueue !== false;
  const semana = semanaIso(new Date(ahora));

  try {
    let consulta = db
      .from('organizations')
      .select('id, name')
      .in('status', ['trial', 'active', 'past_due']);
    if (cuerpo.org_id) consulta = consulta.eq('id', cuerpo.org_id);

    const { data: boxes, error: falloBoxes } = await consulta;
    if (falloBoxes) throw falloBoxes;

    const reportes: Array<{ org_id: string; nombre: string; reporte: Reporte | null; encolado: boolean }> = [];

    for (const box of (boxes ?? []) as Box[]) {
      const { data, error: falloReporte } = await db.rpc('weekly_report', {
        p_org_id: box.id,
        p_now: ahora,
      });
      if (falloReporte) throw falloReporte;

      const reporte = (data ?? null) as Reporte | null;
      let encolado = false;

      if (encolar && reporte) {
        // La regla del catálogo es la dueña del mensaje; si el box la apagó,
        // `queue_automation_message` devuelve null y no se encola nada.
        const { data: regla } = await db
          .from('automation_rules')
          .select('id, is_active')
          .eq('org_id', box.id)
          .eq('key', 'weekly_report')
          .maybeSingle();

        if (regla?.is_active) {
          const { data: encolado_id, error: falloCola } = await db.rpc('queue_automation_message', {
            p_org_id: box.id,
            p_rule_id: regla.id,
            p_athlete_id: null,
            p_template_key: 'weekly_report',
            // Mismo dedupe_key que usa `run_automations`: si el job del lunes ya
            // lo mandó, esta llamada no lo manda otra vez.
            p_dedupe_key: `weekly_report:${semana}`,
            p_vars: reporte,
            p_now: ahora,
            p_invoice_id: null,
            p_audience: 'staff',
          });
          if (falloCola) throw falloCola;
          encolado = encolado_id != null;
        }
      }

      reportes.push({ org_id: box.id, nombre: box.name, reporte, encolado });
    }

    return json({ ok: true, semana, reportes });
  } catch (causa) {
    registrarFallo('weekly-report', causa);
    return error(500, 'fallo_del_reporte', 'No se pudo armar el reporte semanal.');
  }
});
