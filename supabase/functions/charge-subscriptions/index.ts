// =============================================================================
// charge-subscriptions · ejecuta los cobros automáticos encolados
// =============================================================================
// Entrada:  POST { "org_id"?: uuid, "now"?: ISO 8601, "limit"?: int,
//                  "encolar"?: bool }
// Salida:   { ok, encolados, intentados, aprobados, rechazados, resultados }
//
// Quién la llama: el programador de tareas (pg_cron / Scheduler), una vez al
// día por la mañana. NO la llama un navegador: no lleva cabeceras CORS a
// propósito.
//
// La autorización es un secreto compartido (RECURRING_CRON_SECRET) comparado en
// tiempo constante, no el JWT: un JWT anónimo lo tiene cualquiera que abra la
// aplicación, y esta función MUEVE PLATA de la cuenta de los atletas. Debe
// declararse con `verify_jwt = false` en supabase/config.toml (lo integra quien
// enruta; este archivo no lo toca).
//
// Toda la lógica de negocio vive en la migración 0016: idempotencia, escalera de
// reintentos, revocación y conciliación. Aquí solo se orquesta:
//
//   1. charge_due_subscriptions  -> encola lo que toca hoy (idempotente)
//   2. claim_recurring_charges   -> toma el trabajo (FOR UPDATE SKIP LOCKED)
//   3. POST /v1/transactions     -> golpea la pasarela, uno por uno
//   4. apply_wompi_payment       -> si aprobó, el pago entra POR LA RUTA QUE YA
//                                   EXISTE y el trigger de la 0003 salda la
//                                   factura. Aquí no se recalcula nada.
//   5. record_recurring_charge_result -> anota el resultado y programa (o no)
//                                   el siguiente intento
//
// `now` es inyectable para poder reproducir un día concreto en soporte
// ("¿por qué no le cobró el día 1?"), igual que en el motor de cobros.
//
// Secretos: RECURRING_CRON_SECRET del entorno (es nuestro, no de un box).
// Las llaves de Wompi salen del BOX que cobra (Configuración → Integraciones),
// con respaldo en WOMPI_* para desarrollo. Ver docs/12-debito-recurrente.md.
// =============================================================================

import { env, envEntero, requiereEnv } from '../_shared/env.ts';
import { exigeCredencial } from '../_shared/credenciales.ts';
import { error, json, registrarFallo } from '../_shared/http.ts';
import { clienteDeServicio } from '../_shared/supabase.ts';
import { ambienteDeLlave, firmaDeIntegridad, igualesEnTiempoConstante } from '../_shared/wompi.ts';
import { cobrarConFuenteDePago, interpretarCobro } from './wompi_recurrente.ts';

interface Peticion {
  org_id?: string;
  now?: string;
  limit?: number;
  /** Por defecto sí: encolar es idempotente y así una sola tarea basta. */
  encolar?: boolean;
}

interface FilaEncolado {
  org_id: string;
  charges_queued: number;
  retries_ready: number;
  cancelled: number;
  run_date: string;
}

interface CobroTomado {
  charge_id: string;
  org_id: string;
  athlete_id: string;
  invoice_id: string;
  invoice_number: string;
  amount_cents: number;
  currency: string;
  reference: string;
  intent_id: string;
  kind: string;
  provider_source_id: string;
  customer_email: string;
  attempt: number;
  max_attempts: number;
}

interface ResultadoDelCobro {
  charge_id: string;
  estado: string;
  reintenta: boolean;
  causa: string | null;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tope por corrida. Un box grande se termina en varias vueltas del programador. */
const TOPE_POR_CORRIDA = () => envEntero('RECURRING_BATCH_LIMIT', 50);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return error(405, 'metodo_no_permitido', 'Este recurso solo acepta POST.');
  }

  // ---------------------------------------------------------------------------
  // 1 · Autorización. Antes de esto, la petición es un POST de un desconocido
  //     que quiere debitarle la cuenta a los atletas de un box.
  // ---------------------------------------------------------------------------
  let secreto: string;
  try {
    secreto = requiereEnv('RECURRING_CRON_SECRET');
  } catch (causa) {
    registrarFallo('charge-subscriptions:config', causa);
    return error(500, 'configuracion', 'El servicio no está configurado.');
  }

  if (!igualesEnTiempoConstante(req.headers.get('x-cron-secret') ?? '', secreto)) {
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

  // ---------------------------------------------------------------------------
  // 2 · Las llaves ya NO se leen aquí.
  //
  //     Cada box cobra a su propia cuenta de Wompi, y un lote puede traer
  //     cobros de varios boxes. Leer un juego de llaves al arrancar habría
  //     cobrado todo con la misma cuenta, que es exactamente el problema que
  //     la configuración por box vino a resolver. Se resuelven por cobro,
  //     abajo, con caché por box dentro de esta corrida.
  // ---------------------------------------------------------------------------

  // VERIFICAR: ver wompi_recurrente.ts. Se manda la firma de integridad salvo
  // que se apague a propósito.
  const firmarTransaccion = (env('WOMPI_TX_FIRMA') ?? 'si').toLowerCase() !== 'no';

  const db = clienteDeServicio();
  const ahora = cuerpo.now ?? new Date().toISOString();
  const tope = Math.min(Math.max(cuerpo.limit ?? TOPE_POR_CORRIDA(), 1), 200);

  const { data: corrida } = await db
    .from('job_runs')
    .insert({ job: 'charge-subscriptions', status: 'running' })
    .select('id')
    .single();

  let intentados = 0;
  let aprobados = 0;

  try {
    // -------------------------------------------------------------------------
    // 3 · Encolar. Idempotente: correrlo dos veces no encola dos cobros.
    // -------------------------------------------------------------------------
    let encolados = 0;
    if (cuerpo.encolar !== false) {
      const { data, error: fallo } = await db.rpc('charge_due_subscriptions', {
        p_org_id: cuerpo.org_id ?? null,
        p_now: ahora,
      });
      if (fallo) throw fallo;
      encolados = ((data ?? []) as FilaEncolado[]).reduce(
        (suma, f) => suma + (f.charges_queued ?? 0),
        0,
      );
    }

    // -------------------------------------------------------------------------
    // 4 · Tomar el trabajo. Cada cobro queda en `processing` con su referencia y
    //     su intento de pago ya creados: si esta función muere aquí, esos cobros
    //     quedan a la vista en vez de perderse.
    // -------------------------------------------------------------------------
    const { data: tomadosCrudos, error: falloTomar } = await db.rpc('claim_recurring_charges', {
      p_org_id: cuerpo.org_id ?? null,
      p_limit: tope,
      p_now: ahora,
    });
    if (falloTomar) throw falloTomar;

    const tomados = (tomadosCrudos ?? []) as CobroTomado[];
    const resultados: ResultadoDelCobro[] = [];

    // -------------------------------------------------------------------------
    // 5 · Cobrar, uno por uno. En serie a propósito: son pocos por box y en
    //     paralelo se pierde el control de cuántas peticiones le caen encima a
    //     la pasarela.
    // -------------------------------------------------------------------------
    // Una llamada a la base por box, no por cobro: un lote de 50 cobros de un
    // mismo box no hace 50 consultas de credenciales.
    const cacheLlaves = new Map<
      string,
      { publica: string; privada: string; integridad: string } | null
    >();

    async function llavesDelBox(orgId: string) {
      const enCache = cacheLlaves.get(orgId);
      if (enCache !== undefined) return enCache;

      let llaves: { publica: string; privada: string; integridad: string } | null = null;
      try {
        llaves = {
          publica: await exigeCredencial(db, orgId, 'wompi_public_key'),
          privada: await exigeCredencial(db, orgId, 'wompi_private_key'),
          integridad: await exigeCredencial(db, orgId, 'wompi_integrity_secret'),
        };
        if (ambienteDeLlave(llaves.publica) === 'desconocido') {
          registrarFallo(
            'charge-subscriptions:config',
            new Error(`La llave pública del box ${orgId} no empieza por pub_test_ ni pub_prod_`),
          );
          llaves = null;
        }
      } catch (causa) {
        registrarFallo('charge-subscriptions:credenciales', causa);
      }

      cacheLlaves.set(orgId, llaves);
      return llaves;
    }

    for (const cobro of tomados) {
      // Un box sin pasarela configurada no tumba la corrida de los demás: su
      // cobro se devuelve a la cola y el resto sigue.
      const llaves = await llavesDelBox(cobro.org_id);
      if (!llaves) {
        await db.rpc('record_recurring_charge_result', {
          p_charge_id: cobro.id,
          p_provider_status: 'ERROR',
          p_error_code: 'box_sin_pasarela',
          p_error_message: 'El box no tiene configurada la pasarela de pagos',
        }).catch(() => undefined);
        continue;
      }
      const { publica: llavePublica, privada: llavePrivada, integridad: secretoDeIntegridad } =
        llaves;
      intentados += 1;

      const monto = Number(cobro.amount_cents);
      const firma = firmarTransaccion
        ? await firmaDeIntegridad(cobro.reference, monto, cobro.currency, secretoDeIntegridad)
        : undefined;

      const respuesta = await cobrarConFuenteDePago(llavePublica, llavePrivada, {
        montoEnCentavos: monto,
        moneda: cobro.currency,
        correo: cobro.customer_email,
        referencia: cobro.reference,
        fuenteDePago: cobro.provider_source_id,
        firma,
      });

      const resultado = interpretarCobro(respuesta);

      // ---------------------------------------------------------------------
      // 5.1 · Aprobado: el pago entra por apply_wompi_payment, que es la ruta
      //       que ya existe. El webhook llegará después con el mismo
      //       provider_ref y la función lo reconocerá como duplicado: los dos
      //       candados de la 0009 lo garantizan. NO se toca `invoices` aquí.
      // ---------------------------------------------------------------------
      if (resultado.estado === 'APPROVED' && resultado.transaccionId) {
        const { error: falloPago } = await db.rpc('apply_wompi_payment', {
          p_event_id: `cobro-recurrente:${resultado.transaccionId}`,
          p_transaction_id: resultado.transaccionId,
          p_reference: cobro.reference,
          p_status: 'APPROVED',
          p_amount_cents: monto,
          p_method_type: cobro.kind.toUpperCase(),
          p_event_type: 'recurring.charge',
          p_payload: { origen: 'charge-subscriptions', charge_id: cobro.charge_id },
          p_paid_at: new Date().toISOString(),
        });

        if (falloPago) {
          // Plata cobrada que no quedó registrada: es lo más grave que puede
          // pasar aquí. Se deja rastro y el cobro NO se marca como aprobado,
          // para que el webhook (o la siguiente corrida) lo concilie.
          registrarFallo('charge-subscriptions:apply_wompi_payment', falloPago);
        } else {
          aprobados += 1;
        }
      }

      // ---------------------------------------------------------------------
      // 5.2 · Anotar el resultado. La base decide si hay reintento y cuándo.
      // ---------------------------------------------------------------------
      const { data: anotado, error: falloAnotar } = await db.rpc(
        'record_recurring_charge_result',
        {
          p_charge_id: cobro.charge_id,
          p_provider_status: resultado.estado,
          p_transaction_id: resultado.transaccionId,
          p_error_code: resultado.codigo,
          p_error_message: resultado.mensaje,
          p_now: new Date().toISOString(),
        },
      );

      if (falloAnotar) {
        registrarFallo('charge-subscriptions:record_recurring_charge_result', falloAnotar);
        resultados.push({
          charge_id: cobro.charge_id,
          estado: resultado.estado,
          reintenta: false,
          causa: 'no se pudo anotar el resultado',
        });
        continue;
      }

      const fila = (Array.isArray(anotado) ? anotado[0] : anotado) as
        | { charge_status: string; failure_kind: string | null; will_retry: boolean }
        | undefined;

      resultados.push({
        charge_id: cobro.charge_id,
        estado: fila?.charge_status ?? resultado.estado,
        reintenta: fila?.will_retry === true,
        causa: fila?.failure_kind ?? null,
      });
    }

    if (corrida?.id) {
      await db
        .from('job_runs')
        .update({ status: 'ok', processed: intentados, finished_at: new Date().toISOString() })
        .eq('id', corrida.id);
    }

    return json({
      ok: true,
      encolados,
      intentados,
      aprobados,
      rechazados: intentados - aprobados,
      resultados,
    });
  } catch (causa) {
    registrarFallo('charge-subscriptions', causa);
    if (corrida?.id) {
      await db
        .from('job_runs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          processed: intentados,
          error: causa instanceof Error ? causa.message : String(causa),
        })
        .eq('id', corrida.id);
    }
    // 500 a propósito: que el programador lo reintente. Encolar y tomar son
    // idempotentes, y un cobro ya enviado no se vuelve a enviar porque quedó
    // en `processing`.
    return error(500, 'fallo_del_cobro', 'No se pudieron ejecutar los cobros automáticos.');
  }
});
