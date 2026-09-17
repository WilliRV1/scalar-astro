// =============================================================================
// wompi-webhook · recibe los eventos de Wompi y concilia el pago
// =============================================================================
// Entrada: POST con el cuerpo del evento de Wompi. SIN JWT (Wompi no lo tiene),
// así que esta función DEBE declararse con `verify_jwt = false` en
// supabase/config.toml. Ver docs/10-wompi.md.
//
// La autorización es la FIRMA, no la red: sin `signature.checksum` válido se
// responde 401 y no se toca la base. Esa es la única defensa; si se relaja,
// cualquiera en internet puede saldar facturas ajenas mandando un JSON.
//
// Idempotencia: Wompi REINTENTA hasta recibir un 200. Toda la lógica de "este
// evento ya lo procesé" vive en `apply_wompi_payment` (migración 0009), que es
// donde puede ser transaccional de verdad.
//
// Códigos de respuesta, y por qué importan:
//   200 · procesado (o ya procesado, o ignorado) -> Wompi deja de reintentar
//   401 · firma inválida                         -> no reintentar, es basura
//   400 · cuerpo ilegible                        -> no reintentar
//   500 · falló la base                          -> QUE REINTENTE
//
// Secretos: WOMPI_EVENTS_SECRET (ver docs/10-wompi.md).
// =============================================================================

import { env, requiereEnv } from '../_shared/env.ts';
import { error, json, registrarFallo } from '../_shared/http.ts';
import { clienteDeServicio } from '../_shared/supabase.ts';
import {
  type EventoWompi,
  igualesEnTiempoConstante,
  verificarFirmaDeEvento,
} from '../_shared/wompi.ts';

/** Tope de tamaño del cuerpo: un evento de Wompi son unos pocos kilobytes. */
const MAXIMO_BYTES = 128 * 1024;

// Wompi llama servidor a servidor: aquí NO hay cabeceras CORS a propósito.
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return error(405, 'metodo_no_permitido', 'Este recurso solo acepta POST.');
  }

  let crudo: string;
  try {
    crudo = await req.text();
  } catch (causa) {
    registrarFallo('wompi-webhook:lectura', causa);
    return error(400, 'cuerpo_ilegible', 'No se pudo leer el cuerpo del evento.');
  }

  if (crudo.length === 0 || crudo.length > MAXIMO_BYTES) {
    return error(400, 'cuerpo_invalido', 'El cuerpo del evento no tiene un tamaño válido.');
  }

  let evento: EventoWompi;
  try {
    evento = JSON.parse(crudo) as EventoWompi;
  } catch {
    return error(400, 'cuerpo_invalido', 'El cuerpo del evento no es JSON válido.');
  }

  // ---------------------------------------------------------------------------
  // 1 · Verificar la firma. Antes de esto, el evento no es más que un texto que
  //     mandó un desconocido.
  // ---------------------------------------------------------------------------
  let secretoDeEventos: string;
  try {
    secretoDeEventos = requiereEnv('WOMPI_EVENTS_SECRET');
  } catch (causa) {
    registrarFallo('wompi-webhook:config', causa);
    // 500 y no 401: el evento puede ser legítimo; que Wompi reintente mientras
    // se arregla la configuración.
    return error(500, 'error_interno', 'No se pudo procesar el evento.');
  }

  const verificacion = await verificarFirmaDeEvento(evento, secretoDeEventos);
  if (!verificacion.valido) {
    // El motivo se registra, no se devuelve: decirle a quien tantea POR QUÉ
    // falló su firma es ayudarle a acertar.
    registrarFallo('wompi-webhook:firma', new Error(verificacion.motivo));
    return error(401, 'firma_invalida', 'El evento no está firmado correctamente.');
  }

  // La documentación dice que el checksum viaja también en la cabecera
  // `X-Event-Checksum`. Si viene y no coincide con el del cuerpo, algo se
  // manipuló por el camino.
  const checksumDeCabecera = req.headers.get('X-Event-Checksum');
  if (
    checksumDeCabecera &&
    !igualesEnTiempoConstante(
      checksumDeCabecera.toLowerCase(),
      String(evento.signature.checksum).toLowerCase(),
    )
  ) {
    registrarFallo('wompi-webhook:firma', new Error('X-Event-Checksum no coincide con el cuerpo'));
    return error(401, 'firma_invalida', 'El evento no está firmado correctamente.');
  }

  // Un evento de sandbox llegando al webhook de producción (o al revés) no se
  // procesa. Solo se comprueba si se configuró WOMPI_ENVIRONMENT.
  const ambienteEsperado = env('WOMPI_ENVIRONMENT');
  if (ambienteEsperado && evento.environment && evento.environment !== ambienteEsperado) {
    registrarFallo(
      'wompi-webhook:ambiente',
      new Error(`evento de ambiente '${evento.environment}', se esperaba '${ambienteEsperado}'`),
    );
    return error(401, 'ambiente_incorrecto', 'El evento no corresponde a este ambiente.');
  }

  // ---------------------------------------------------------------------------
  // 2 · Solo nos interesan los eventos de transacción.
  // ---------------------------------------------------------------------------
  const transaccion = evento.data?.transaction;
  if (!evento.event?.startsWith('transaction.') || !transaccion) {
    // 200: el evento es legítimo, simplemente no es de los nuestros. Un 4xx
    // haría que Wompi lo reintentara para siempre.
    return json({ ok: true, resultado: 'evento_ignorado', evento: evento.event ?? null });
  }

  if (!transaccion.id || !transaccion.reference || !transaccion.status) {
    registrarFallo('wompi-webhook:forma', new Error('la transacción llegó incompleta'));
    return error(400, 'transaccion_incompleta', 'El evento no trae una transacción completa.');
  }

  // ---------------------------------------------------------------------------
  // 3 · Aplicar. La idempotencia y la conciliación son de la base.
  // ---------------------------------------------------------------------------
  try {
    const servicio = clienteDeServicio();

    const { data, error: errorRpc } = await servicio.rpc('apply_wompi_payment', {
      p_event_id: evento.signature.checksum,
      p_transaction_id: String(transaccion.id),
      p_reference: String(transaccion.reference),
      p_status: String(transaccion.status),
      p_amount_cents: Number(transaccion.amount_in_cents ?? 0),
      p_method_type: transaccion.payment_method_type ?? null,
      p_event_type: evento.event,
      p_payload: evento,
      p_paid_at: transaccion.finalized_at ?? evento.sent_at ?? new Date().toISOString(),
    });

    if (errorRpc) {
      // 500 a propósito: que Wompi reintente. Un pago aprobado que no se pudo
      // registrar es plata que el box recibió y su sistema no muestra.
      registrarFallo('wompi-webhook:apply_wompi_payment', errorRpc);
      return error(500, 'error_interno', 'No se pudo procesar el evento.');
    }

    const resultado = Array.isArray(data) ? data[0] : data;
    return json({ ok: true, resultado: resultado?.resultado ?? 'procesado' });
  } catch (causa) {
    registrarFallo('wompi-webhook', causa);
    return error(500, 'error_interno', 'No se pudo procesar el evento.');
  }
});
