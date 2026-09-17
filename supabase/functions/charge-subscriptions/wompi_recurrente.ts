// =============================================================================
// Wompi · fuentes de pago y cobro recurrente
// =============================================================================
// Este archivo vive aquí y no en `_shared/` porque `_shared/` no es de este
// módulo (lo integra quien coordina). `tokenize-payment-method` lo importa por
// ruta relativa. Lo que YA estaba en `_shared/wompi.ts` —firmas, verificación
// del evento, tipos del evento— NO se reimplementa: se importa.
//
// Todo lo de aquí sale de la documentación oficial. Cada bloque cita su fuente.
// Lo que no se pudo confirmar contra la API real está marcado VERIFICAR y
// recogido en docs/12-debito-recurrente.md. NADA de esto se ha ejecutado contra
// Wompi: durante el desarrollo no hubo credenciales.
//
// Fuentes:
//   · Fuentes de pago      https://docs.wompi.co/docs/colombia/fuentes-de-pago/
//   · Tokens de aceptación https://docs.wompi.co/docs/colombia/tokens-de-aceptacion/
//   · Transacciones        https://docs.wompi.co/docs/colombia/transacciones/
//   · Ambientes y llaves   https://docs.wompi.co/docs/colombia/ambientes-y-llaves/
// =============================================================================

import { env } from '../_shared/env.ts';
import { ambienteDeLlave } from '../_shared/wompi.ts';

/**
 * Base de la API. Fuente: Ambientes y llaves.
 *   Sandbox     https://sandbox.wompi.co/v1
 *   Producción  https://production.wompi.co/v1
 * Se deduce del prefijo de la llave pública para que no haya forma de cobrar de
 * verdad con llaves de prueba (ni al revés) por haber olvidado una variable.
 */
export function baseDeLaApi(llavePublica: string): string {
  const explicita = env('WOMPI_API_URL');
  if (explicita) return explicita.replace(/\/+$/, '');
  return ambienteDeLlave(llavePublica) === 'prod'
    ? 'https://production.wompi.co/v1'
    : 'https://sandbox.wompi.co/v1';
}

/** Ninguna llamada a la pasarela puede colgar el job entero. */
const TIEMPO_LIMITE_MS = 20_000;

export interface RespuestaApi<T> {
  ok: boolean;
  estado: number;
  datos: T | null;
  /** Mensaje ya legible, para guardar como causa del fallo. Nunca trae secretos. */
  mensaje: string | null;
}

interface SobreWompi<T> {
  data?: T;
  error?: { type?: string; reason?: string; messages?: Record<string, string[]> };
  // Algunas respuestas de error traen `messages` en la raíz.
  messages?: Record<string, string[]>;
}

/** Aplana {campo: ["error1","error2"]} a "campo: error1; error2". */
function mensajeDeErrores(messages?: Record<string, string[]>): string | null {
  if (!messages) return null;
  const partes: string[] = [];
  for (const [campo, lista] of Object.entries(messages)) {
    partes.push(`${campo}: ${(lista ?? []).join(', ')}`);
  }
  return partes.length > 0 ? partes.join(' · ') : null;
}

async function llamar<T>(
  url: string,
  opciones: { metodo: 'GET' | 'POST'; llave?: string; cabeceras?: Record<string, string>; cuerpo?: unknown },
): Promise<RespuestaApi<T>> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIEMPO_LIMITE_MS);

  try {
    const respuesta = await fetch(url, {
      method: opciones.metodo,
      signal: control.signal,
      headers: {
        'content-type': 'application/json',
        ...(opciones.llave ? { authorization: `Bearer ${opciones.llave}` } : {}),
        ...(opciones.cabeceras ?? {}),
      },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    });

    const texto = await respuesta.text();
    let sobre: SobreWompi<T> = {};
    try {
      sobre = texto.length > 0 ? (JSON.parse(texto) as SobreWompi<T>) : {};
    } catch {
      // Respuesta que no es JSON: se conserva un recorte como causa, nunca el
      // cuerpo entero (puede ser una página de error de varios kilobytes).
      return {
        ok: false,
        estado: respuesta.status,
        datos: null,
        mensaje: `Respuesta ilegible de la pasarela (${respuesta.status})`,
      };
    }

    const mensaje =
      sobre.error?.reason ??
      mensajeDeErrores(sobre.error?.messages ?? sobre.messages) ??
      sobre.error?.type ??
      null;

    return {
      ok: respuesta.ok,
      estado: respuesta.status,
      datos: sobre.data ?? null,
      mensaje: respuesta.ok ? null : (mensaje ?? `La pasarela respondió ${respuesta.status}`),
    };
  } catch (causa) {
    const esTiempo = causa instanceof DOMException && causa.name === 'AbortError';
    return {
      ok: false,
      estado: 0,
      datos: null,
      mensaje: esTiempo ? 'La pasarela no respondió a tiempo' : 'No se pudo contactar la pasarela',
    };
  } finally {
    clearTimeout(reloj);
  }
}

// -----------------------------------------------------------------------------
// Tokens de aceptación
// -----------------------------------------------------------------------------
// Fuente: Tokens de aceptación. La respuesta trae dos:
//   · presigned_acceptance          -> política de privacidad (END_USER_POLICY)
//   · presigned_personal_data_auth  -> tratamiento de datos (PERSONAL_DATA_AUTH)
// Los dos se mandan al crear la fuente de pago, como `acceptance_token` y
// `accept_personal_auth`.
//
// VERIFICAR: la documentación describe `GET /merchants/info` con la llave
// pública en la cabecera `x-merchant-public-key`, pero la forma histórica es
// `GET /v1/merchants/<llave_publica>`. Se intentan las dos, en ese orden,
// porque no hay manera de saber cuál responde sin credenciales.
// -----------------------------------------------------------------------------
export interface TokenDeAceptacion {
  acceptance_token: string;
  permalink: string;
  type: string;
}

export interface InfoDelComercio {
  presigned_acceptance?: TokenDeAceptacion;
  presigned_personal_data_auth?: TokenDeAceptacion;
  [clave: string]: unknown;
}

export async function obtenerInfoDelComercio(
  llavePublica: string,
): Promise<RespuestaApi<InfoDelComercio>> {
  const base = baseDeLaApi(llavePublica);

  const conCabecera = await llamar<InfoDelComercio>(`${base}/merchants/info`, {
    metodo: 'GET',
    cabeceras: { 'x-merchant-public-key': llavePublica },
  });
  if (conCabecera.ok && conCabecera.datos) return conCabecera;

  return await llamar<InfoDelComercio>(`${base}/merchants/${encodeURIComponent(llavePublica)}`, {
    metodo: 'GET',
  });
}

// -----------------------------------------------------------------------------
// Tokenización de Nequi
// -----------------------------------------------------------------------------
// Fuente: Fuentes de pago. `POST /v1/tokens/nequi` con la LLAVE PÚBLICA y
// `{"phone_number": "3017654321"}` (diez dígitos, sin indicativo).
//
// El token nace en `PENDING`: el atleta tiene que aceptar la suscripción EN SU
// APP de Nequi. Solo cuando pasa a `APPROVED` sirve para crear la fuente de
// pago. Por eso la interfaz pregunta y vuelve a consultar, en vez de dar por
// hecho que quedó.
// -----------------------------------------------------------------------------
export interface TokenNequi {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | string;
  phone_number?: string;
  [clave: string]: unknown;
}

/** "+573001234567" -> "3001234567". La API quiere los diez dígitos. */
export function telefonoNacional(e164: string): string | null {
  const limpio = e164.replace(/[^0-9]/g, '');
  const diez = limpio.length > 10 ? limpio.slice(-10) : limpio;
  return /^3[0-9]{9}$/.test(diez) ? diez : null;
}

/** "+573001234567" -> "+57 *** *** 4567". Lo único que se guarda para mostrar. */
export function enmascararTelefono(e164: string): string {
  const diez = telefonoNacional(e164);
  return diez ? `+57 *** *** ${diez.slice(-4)}` : '+57 *** *** ****';
}

export function tokenizarNequi(
  llavePublica: string,
  telefonoE164: string,
): Promise<RespuestaApi<TokenNequi>> {
  const diez = telefonoNacional(telefonoE164);
  if (!diez) {
    return Promise.resolve({
      ok: false,
      estado: 400,
      datos: null,
      mensaje: 'El número de celular no parece un Nequi colombiano',
    });
  }
  return llamar<TokenNequi>(`${baseDeLaApi(llavePublica)}/tokens/nequi`, {
    metodo: 'POST',
    llave: llavePublica,
    cuerpo: { phone_number: diez },
  });
}

export function consultarTokenNequi(
  llavePublica: string,
  tokenId: string,
): Promise<RespuestaApi<TokenNequi>> {
  return llamar<TokenNequi>(
    `${baseDeLaApi(llavePublica)}/tokens/nequi/${encodeURIComponent(tokenId)}`,
    { metodo: 'GET', llave: llavePublica },
  );
}

// -----------------------------------------------------------------------------
// Fuente de pago
// -----------------------------------------------------------------------------
// Fuente: Fuentes de pago. `POST /v1/payment_sources` con la LLAVE PRIVADA:
//   { type, token, customer_email, acceptance_token, accept_personal_auth }
// Devuelve `id` (el número con el que se cobra), `status` (sirve cuando es
// `AVAILABLE`) y `public_data`, que es lo ÚNICO que guardamos para mostrar.
//
// La llave privada no sale jamás del servidor. Esta llamada no se hace nunca
// desde el navegador.
// -----------------------------------------------------------------------------
export type TipoDeFuente = 'CARD' | 'NEQUI' | 'DAVIPLATA' | 'BANCOLOMBIA_TRANSFER';

export interface DatosPublicosDeFuente {
  type?: string;
  brand?: string;
  last_four?: string;
  exp_month?: string | number;
  exp_year?: string | number;
  phone_number?: string | number;
  [clave: string]: unknown;
}

export interface FuenteDePago {
  id: number | string;
  type?: string;
  status?: 'AVAILABLE' | 'PENDING' | 'VOIDED' | string;
  public_data?: DatosPublicosDeFuente;
  [clave: string]: unknown;
}

export function crearFuenteDePago(
  llavePublica: string,
  llavePrivada: string,
  datos: {
    tipo: TipoDeFuente;
    token: string;
    correo: string;
    tokenDeAceptacion: string;
    tokenDeDatosPersonales?: string;
  },
): Promise<RespuestaApi<FuenteDePago>> {
  return llamar<FuenteDePago>(`${baseDeLaApi(llavePublica)}/payment_sources`, {
    metodo: 'POST',
    llave: llavePrivada,
    cuerpo: {
      type: datos.tipo,
      token: datos.token,
      customer_email: datos.correo,
      acceptance_token: datos.tokenDeAceptacion,
      ...(datos.tokenDeDatosPersonales
        ? { accept_personal_auth: datos.tokenDeDatosPersonales }
        : {}),
    },
  });
}

// -----------------------------------------------------------------------------
// Cobro contra una fuente de pago
// -----------------------------------------------------------------------------
// Fuente: Fuentes de pago. `POST /v1/transactions` con la LLAVE PRIVADA:
//   { amount_in_cents, currency, customer_email, reference,
//     payment_source_id, recurrent: true }
//
// `recurrent: true` marca la transacción como cobro con credencial en archivo
// (COF). No es un detalle contable: es lo que la distingue de una compra hecha
// por el tarjetahabiente en ese momento.
//
// VERIFICAR · la firma de integridad. La página de Transacciones la lista como
// obligatoria; el ejemplo de cobro con fuente de pago de la página de Fuentes de
// pago NO la incluye. Se manda por defecto (es lo que dice el contrato del
// endpoint) y se puede apagar con WOMPI_TX_FIRMA=no si el sandbox la rechaza.
// Ver docs/12-debito-recurrente.md.
// -----------------------------------------------------------------------------
export interface TransaccionCreada {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | string;
  status_message?: string | null;
  reference?: string;
  amount_in_cents?: number;
  payment_method_type?: string | null;
  [clave: string]: unknown;
}

export function cobrarConFuenteDePago(
  llavePublica: string,
  llavePrivada: string,
  datos: {
    montoEnCentavos: number;
    moneda: string;
    correo: string;
    referencia: string;
    fuenteDePago: string;
    firma?: string;
    cuotas?: number;
  },
): Promise<RespuestaApi<TransaccionCreada>> {
  // La API espera un entero en `payment_source_id`. Se guarda como texto en la
  // base para no atarnos a su tipo, así que aquí se convierte una sola vez.
  const fuente = Number.parseInt(datos.fuenteDePago, 10);
  if (!Number.isFinite(fuente)) {
    return Promise.resolve({
      ok: false,
      estado: 400,
      datos: null,
      mensaje: 'INVALID_PAYMENT_SOURCE: el identificador de la fuente de pago no es un número',
    });
  }

  return llamar<TransaccionCreada>(`${baseDeLaApi(llavePublica)}/transactions`, {
    metodo: 'POST',
    llave: llavePrivada,
    cuerpo: {
      amount_in_cents: datos.montoEnCentavos,
      currency: datos.moneda,
      customer_email: datos.correo,
      reference: datos.referencia,
      payment_source_id: fuente,
      recurrent: true,
      ...(datos.firma ? { signature: datos.firma } : {}),
      ...(datos.cuotas ? { payment_method: { installments: datos.cuotas } } : {}),
    },
  });
}

// -----------------------------------------------------------------------------
// Qué le decimos a la base cuando algo falla
// -----------------------------------------------------------------------------
// La clasificación fina (¿se reintenta o no?) la hace la base con
// `recurring_failure_kind`. Aquí solo se arma un código y un mensaje estables a
// partir de lo que respondió la pasarela, sin inventarse nada.
// -----------------------------------------------------------------------------
export interface ResultadoDelCobro {
  estado: 'APPROVED' | 'PENDING' | 'DECLINED' | 'VOIDED' | 'ERROR';
  transaccionId: string | null;
  codigo: string | null;
  mensaje: string | null;
}

export function interpretarCobro(
  respuesta: RespuestaApi<TransaccionCreada>,
): ResultadoDelCobro {
  if (respuesta.ok && respuesta.datos) {
    const crudo = String(respuesta.datos.status ?? '').toUpperCase();
    const estado =
      crudo === 'APPROVED' || crudo === 'PENDING' || crudo === 'DECLINED' ||
      crudo === 'VOIDED' || crudo === 'ERROR'
        ? (crudo as ResultadoDelCobro['estado'])
        : 'ERROR';

    return {
      estado,
      transaccionId: String(respuesta.datos.id ?? '') || null,
      codigo: estado === 'APPROVED' ? null : crudo,
      mensaje: respuesta.datos.status_message ?? null,
    };
  }

  // Sin respuesta útil. Un 4xx es un rechazo del contrato (fuente inválida,
  // referencia repetida); un 5xx o un timeout es un problema de la pasarela,
  // que sí conviene reintentar.
  return {
    estado: respuesta.estado >= 400 && respuesta.estado < 500 ? 'DECLINED' : 'ERROR',
    transaccionId: null,
    codigo: respuesta.estado > 0 ? `HTTP_${respuesta.estado}` : 'SIN_RESPUESTA',
    mensaje: respuesta.mensaje,
  };
}
