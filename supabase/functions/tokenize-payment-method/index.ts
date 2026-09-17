// =============================================================================
// tokenize-payment-method · guarda el medio de pago del atleta y su autorización
// =============================================================================
// Entrada:  POST con el JWT del usuario y una de estas acciones:
//
//   { "accion": "preparar", "athlete_id"?: uuid }
//       Devuelve el texto EXACTO que el atleta va a aceptar, su versión y los
//       enlaces a las políticas de la pasarela. La interfaz muestra este texto
//       tal cual: lo que se guarda como evidencia y lo que se enseña tienen que
//       ser lo mismo.
//
//   { "accion": "nequi_iniciar", "phone": "+573001234567" }
//       Tokeniza la cuenta Nequi. El token nace PENDING: el atleta tiene que
//       aceptar la suscripción EN SU APP de Nequi.
//
//   { "accion": "nequi_confirmar", "token": "...", "acepto": true, ... }
//       Comprueba que el token quedó APPROVED, crea la fuente de pago y guarda
//       método + autorización en un solo acto.
//
//   { "accion": "tarjeta_guardar", "token": "tok_...", "acepto": true, ... }
//       Igual, con un token de tarjeta ya generado por el widget de Wompi.
//       El número de la tarjeta NUNCA pasa por aquí.
//
// Quién puede: RLS decide. La ficha del atleta se lee con la llave del usuario;
// si la política no la devuelve, no hay autorización posible. Además se exige
// explícitamente ser ESE atleta o tener permiso financiero en el box: que un
// coach cualquiera pueda autorizar un débito en nombre de otro sería
// exactamente el abuso que esta función tiene que impedir.
//
// Secretos: WOMPI_PUBLIC_KEY, WOMPI_PRIVATE_KEY. Ver docs/12-debito-recurrente.md.
// =============================================================================

import { env, requiereEnv } from '../_shared/env.ts';
import { cabecerasCors, error, json, registrarFallo } from '../_shared/http.ts';
import { clienteDeServicio, clienteDelUsuario } from '../_shared/supabase.ts';
import { ambienteDeLlave } from '../_shared/wompi.ts';
import {
  consultarTokenNequi,
  crearFuenteDePago,
  enmascararTelefono,
  obtenerInfoDelComercio,
  type DatosPublicosDeFuente,
  type TipoDeFuente,
  tokenizarNequi,
} from '../charge-subscriptions/wompi_recurrente.ts';

/**
 * Versión del texto de autorización. Si el texto cambia, CAMBIA LA VERSIÓN:
 * las autorizaciones viejas quedan con la suya y se puede saber qué aceptó cada
 * quien. Nunca se reescribe una versión ya usada.
 */
const VERSION_DEL_TEXTO = '2026-09-18';

/** El texto que el atleta acepta. Es la evidencia, así que lo redacta el servidor. */
function textoDeAutorizacion(nombreDelBox: string, medio: string): string {
  return (
    `Autorizo a ${nombreDelBox} a debitar automáticamente de ${medio} el valor de ` +
    `mi mensualidad en la fecha de corte de cada periodo, mientras mi plan esté ` +
    `activo. Entiendo que solo se cobra lo que quede pendiente de cada factura, ` +
    `que puedo revocar esta autorización en cualquier momento desde la aplicación ` +
    `y que al revocarla el cobro automático se detiene de inmediato.`
  );
}

interface Peticion {
  accion?: string;
  athlete_id?: string;
  phone?: string;
  token?: string;
  acepto?: boolean;
  version?: string;
  tope_cents?: number;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ES_E164 = /^\+[1-9][0-9]{7,14}$/;

interface Contexto {
  orgId: string;
  athleteId: string;
  nombreDelBox: string;
  correo: string | null;
  telefono: string | null;
  userId: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // La llama el navegador del atleta: necesita preflight.
  const cors = cabecerasCors(env('SITIO_PERMITIDO'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return error(405, 'metodo_no_permitido', 'Este recurso solo acepta POST.', cors);
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) {
    return error(401, 'sin_sesion', 'Falta la sesión para guardar un medio de pago.', cors);
  }

  let cuerpo: Peticion;
  try {
    cuerpo = (await req.json()) as Peticion;
  } catch {
    return error(400, 'cuerpo_invalido', 'El cuerpo de la petición no es JSON válido.', cors);
  }

  const accion = (cuerpo.accion ?? '').trim();
  if (!['preparar', 'nequi_iniciar', 'nequi_confirmar', 'tarjeta_guardar'].includes(accion)) {
    return error(400, 'accion_invalida', 'Esa acción no existe.', cors);
  }
  if (cuerpo.athlete_id !== undefined && !ES_UUID.test(cuerpo.athlete_id)) {
    return error(400, 'atleta_invalido', 'El identificador del atleta no es válido.', cors);
  }

  try {
    // -------------------------------------------------------------------------
    // 1 · Quién es y a quién puede autorizarle. Lo decide RLS.
    // -------------------------------------------------------------------------
    const usuario = clienteDelUsuario(authorization);

    const { data: sesion, error: errorSesion } = await usuario.auth.getUser();
    if (errorSesion || !sesion?.user) {
      return error(401, 'sesion_invalida', 'La sesión no es válida o expiró.', cors);
    }

    const contexto = await resolverContexto(usuario, sesion.user.id, cuerpo.athlete_id);
    if ('codigo' in contexto) {
      return error(contexto.estado, contexto.codigo, contexto.mensaje, cors);
    }

    // -------------------------------------------------------------------------
    // 2 · Configuración de la pasarela. Se lee DESPUÉS de autorizar para no
    //     delatar un despliegue mal configurado a quien ni siquiera tiene acceso.
    // -------------------------------------------------------------------------
    const llavePublica = requiereEnv('WOMPI_PUBLIC_KEY');
    if (ambienteDeLlave(llavePublica) === 'desconocido') {
      registrarFallo(
        'tokenize-payment-method:config',
        new Error('WOMPI_PUBLIC_KEY no empieza por pub_test_ ni por pub_prod_'),
      );
      return error(500, 'error_interno', 'La pasarela no está bien configurada.', cors);
    }

    // -------------------------------------------------------------------------
    // 3 · Preparar: el texto que se va a aceptar y las políticas de la pasarela.
    // -------------------------------------------------------------------------
    if (accion === 'preparar') {
      const info = await obtenerInfoDelComercio(llavePublica);
      const politicas = [
        info.datos?.presigned_acceptance,
        info.datos?.presigned_personal_data_auth,
      ]
        .filter((p): p is NonNullable<typeof p> => Boolean(p?.permalink))
        .map((p) => ({ tipo: p.type, enlace: p.permalink }));

      return json(
        {
          ok: true,
          athlete_id: contexto.athleteId,
          org_id: contexto.orgId,
          version: VERSION_DEL_TEXTO,
          texto_nequi: textoDeAutorizacion(contexto.nombreDelBox, 'mi cuenta Nequi'),
          texto_tarjeta: textoDeAutorizacion(contexto.nombreDelBox, 'mi tarjeta'),
          telefono_sugerido: contexto.telefono,
          correo: contexto.correo,
          politicas,
          // Si la pasarela no devolvió las políticas no se puede autorizar: el
          // token de aceptación es obligatorio para crear la fuente de pago.
          listo: politicas.length > 0,
        },
        200,
        cors,
      );
    }

    // -------------------------------------------------------------------------
    // 4 · Tokenizar la cuenta Nequi. Solo con la llave PÚBLICA.
    // -------------------------------------------------------------------------
    if (accion === 'nequi_iniciar') {
      const telefono = (cuerpo.phone ?? contexto.telefono ?? '').trim();
      if (!ES_E164.test(telefono)) {
        return error(
          400,
          'telefono_invalido',
          'Escribe el celular con indicativo, así: +573001234567.',
          cors,
        );
      }

      const token = await tokenizarNequi(llavePublica, telefono);
      if (!token.ok || !token.datos) {
        registrarFallo('tokenize-payment-method:nequi', new Error(token.mensaje ?? 'sin detalle'));
        return error(
          502,
          'nequi_no_disponible',
          'Nequi no aceptó la suscripción en este momento. Intenta de nuevo en un minuto.',
          cors,
        );
      }

      return json(
        {
          ok: true,
          token: token.datos.id,
          estado: token.datos.status,
          telefono_enmascarado: enmascararTelefono(telefono),
        },
        200,
        cors,
      );
    }

    // -------------------------------------------------------------------------
    // 5 · Guardar. Aquí es donde nace la autorización, así que aquí es donde se
    //     exige el consentimiento explícito.
    // -------------------------------------------------------------------------
    if (cuerpo.acepto !== true) {
      return error(
        400,
        'sin_autorizacion',
        'Hay que aceptar la autorización de débito para guardar el medio de pago.',
        cors,
      );
    }
    if (cuerpo.version !== VERSION_DEL_TEXTO) {
      // La interfaz está mostrando un texto viejo. Se rechaza en vez de guardar
      // una autorización cuyo texto no es el que la persona leyó.
      return error(
        409,
        'texto_desactualizado',
        'La autorización cambió. Recarga la página y vuelve a intentarlo.',
        cors,
      );
    }

    const tokenEntrante = (cuerpo.token ?? '').trim();
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(tokenEntrante)) {
      return error(400, 'token_invalido', 'El medio de pago no llegó completo.', cors);
    }

    const llavePrivada = requiereEnv('WOMPI_PRIVATE_KEY');

    const correo = contexto.correo;
    if (!correo) {
      return error(
        409,
        'sin_correo',
        'Necesitamos tu correo para poder cobrar. Pídele a tu box que lo registre.',
        cors,
      );
    }

    let tipo: TipoDeFuente;
    let medio: string;
    let telefonoEnmascarado: string | null = null;

    if (accion === 'nequi_confirmar') {
      tipo = 'NEQUI';
      medio = 'mi cuenta Nequi';

      // El token solo sirve si el atleta ya aceptó la suscripción en su app.
      const estado = await consultarTokenNequi(llavePublica, tokenEntrante);
      if (!estado.ok || !estado.datos) {
        registrarFallo('tokenize-payment-method:nequi-estado', new Error(estado.mensaje ?? ''));
        return error(502, 'nequi_no_disponible', 'No se pudo confirmar con Nequi.', cors);
      }
      if (String(estado.datos.status).toUpperCase() !== 'APPROVED') {
        return error(
          409,
          'nequi_pendiente',
          'Todavía no aparece aprobado en Nequi. Abre la app, acepta la suscripción y vuelve a intentar.',
          cors,
        );
      }

      const telefono = (cuerpo.phone ?? contexto.telefono ?? '').trim();
      telefonoEnmascarado = ES_E164.test(telefono)
        ? enmascararTelefono(telefono)
        : enmascararTelefono(String(estado.datos.phone_number ?? ''));
    } else {
      tipo = 'CARD';
      medio = 'mi tarjeta';
    }

    // -------------------------------------------------------------------------
    // 6 · Tokens de aceptación + fuente de pago. Con la llave PRIVADA, que no
    //     sale nunca del servidor.
    // -------------------------------------------------------------------------
    const info = await obtenerInfoDelComercio(llavePublica);
    const aceptacion = info.datos?.presigned_acceptance?.acceptance_token;
    const datosPersonales = info.datos?.presigned_personal_data_auth?.acceptance_token;

    if (!aceptacion) {
      registrarFallo(
        'tokenize-payment-method:aceptacion',
        new Error(info.mensaje ?? 'la pasarela no devolvió el token de aceptación'),
      );
      return error(502, 'pasarela_no_disponible', 'La pasarela no está respondiendo.', cors);
    }

    const fuente = await crearFuenteDePago(llavePublica, llavePrivada, {
      tipo,
      token: tokenEntrante,
      correo,
      tokenDeAceptacion: aceptacion,
      tokenDeDatosPersonales: datosPersonales,
    });

    if (!fuente.ok || !fuente.datos) {
      registrarFallo('tokenize-payment-method:fuente', new Error(fuente.mensaje ?? 'sin detalle'));
      return error(
        502,
        'no_se_pudo_guardar',
        'La pasarela no aceptó ese medio de pago. Revisa los datos e intenta de nuevo.',
        cors,
      );
    }

    // -------------------------------------------------------------------------
    // 7 · Guardar. Lo ÚNICO que entra a nuestra base es el identificador de la
    //     fuente y lo justo para mostrar: últimos cuatro dígitos o teléfono
    //     enmascarado. Ni el número de la tarjeta ni el CVV pasan por aquí, y la
    //     migración 0016 tiene CHECKs que lo impiden.
    // -------------------------------------------------------------------------
    const publicos: DatosPublicosDeFuente = fuente.datos.public_data ?? {};
    const ultimos = typeof publicos.last_four === 'string' && /^[0-9]{4}$/.test(publicos.last_four)
      ? publicos.last_four
      : null;
    if (tipo === 'NEQUI' && !telefonoEnmascarado && publicos.phone_number) {
      telefonoEnmascarado = enmascararTelefono(String(publicos.phone_number));
    }

    const tope = Number.isInteger(cuerpo.tope_cents) && (cuerpo.tope_cents ?? 0) > 0
      ? cuerpo.tope_cents
      : null;

    const servicio = clienteDeServicio();
    const { data: guardado, error: errorGuardar } = await servicio.rpc('register_payment_method', {
      p_org_id: contexto.orgId,
      p_athlete_id: contexto.athleteId,
      p_kind: tipo === 'NEQUI' ? 'nequi' : 'card',
      p_provider_source_id: String(fuente.datos.id),
      p_accepted_text: textoDeAutorizacion(contexto.nombreDelBox, medio),
      p_accepted_version: VERSION_DEL_TEXTO,
      p_customer_email: correo,
      p_provider_token: tokenEntrante,
      p_brand: typeof publicos.brand === 'string' ? publicos.brand : null,
      p_last_four: ultimos,
      p_masked_phone: telefonoEnmascarado,
      p_exp_month: enteroONulo(publicos.exp_month),
      p_exp_year: anioCompleto(publicos.exp_year),
      p_acceptance_permalink: info.datos?.presigned_acceptance?.permalink ?? null,
      p_max_amount_cents: tope,
      p_authorized_by: sesion.user.id,
      p_user_agent: req.headers.get('user-agent'),
    });

    if (errorGuardar) {
      registrarFallo('tokenize-payment-method:register_payment_method', errorGuardar);
      return error(500, 'error_interno', 'No se pudo guardar el medio de pago.', cors);
    }

    const fila = Array.isArray(guardado) ? guardado[0] : guardado;

    return json(
      {
        ok: true,
        payment_method_id: fila?.payment_method_id ?? null,
        authorization_id: fila?.authorization_id ?? null,
        reemplazado: fila?.replaced === true,
        kind: tipo === 'NEQUI' ? 'nequi' : 'card',
        last_four: ultimos,
        masked_phone: telefonoEnmascarado,
      },
      200,
      cors,
    );
  } catch (causa) {
    registrarFallo('tokenize-payment-method', causa);
    return error(500, 'error_interno', 'No se pudo guardar el medio de pago.', cors);
  }
});

/** "28" -> 2028; "2028" -> 2028; cualquier otra cosa -> null. */
function anioCompleto(valor: unknown): number | null {
  const n = enteroONulo(valor);
  if (n === null) return null;
  return n < 100 ? 2000 + n : n;
}

function enteroONulo(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return Math.trunc(valor);
  if (typeof valor === 'string' && /^[0-9]{1,4}$/.test(valor)) return Number.parseInt(valor, 10);
  return null;
}

interface Rechazo {
  estado: number;
  codigo: string;
  mensaje: string;
}

/**
 * Resuelve a qué atleta se le va a guardar el medio de pago y comprueba que
 * quien lo pide tenga derecho a hacerlo.
 *
 * Dos caminos válidos y ninguno más:
 *   · el propio atleta (su membresía apunta a esa ficha)
 *   · alguien con permiso financiero en ese box (el dueño registrando el dato
 *     con el atleta delante)
 *
 * Un coach sin permiso financiero NO puede: autorizar un débito en nombre de
 * otra persona es justo lo que no puede pasar aquí.
 */
async function resolverContexto(
  usuario: ReturnType<typeof clienteDelUsuario>,
  userId: string,
  athleteIdPedido: string | undefined,
): Promise<Contexto | Rechazo> {
  const { data: membresias, error: errorMembresias } = await usuario
    .from('memberships')
    .select('org_id, role, permissions, athlete_id, status, organizations(name)')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (errorMembresias) {
    registrarFallo('tokenize-payment-method:membresias', errorMembresias);
    return { estado: 500, codigo: 'error_interno', mensaje: 'No se pudo comprobar tu acceso.' };
  }

  const lista = (membresias ?? []) as Array<{
    org_id: string;
    role: string;
    permissions: { can_view_finances?: boolean } | null;
    athlete_id: string | null;
    organizations: { name: string } | { name: string }[] | null;
  }>;

  if (lista.length === 0) {
    return { estado: 403, codigo: 'sin_acceso', mensaje: 'Tu usuario no pertenece a ningún box.' };
  }

  const nombreDe = (m: (typeof lista)[number]): string =>
    Array.isArray(m.organizations)
      ? (m.organizations[0]?.name ?? 'tu box')
      : (m.organizations?.name ?? 'tu box');

  // Sin athlete_id explícito: se usa la ficha del propio usuario.
  const objetivo = athleteIdPedido ?? lista.find((m) => m.athlete_id)?.athlete_id ?? null;
  if (!objetivo) {
    return {
      estado: 409,
      codigo: 'sin_ficha',
      mensaje: 'Tu usuario todavía no está vinculado a una ficha de atleta.',
    };
  }

  // La ficha se lee CON LA LLAVE DEL USUARIO: RLS decide si puede verla.
  const { data: atleta, error: errorAtleta } = await usuario
    .from('athletes')
    .select('id, org_id, email, phone')
    .eq('id', objetivo)
    .maybeSingle();

  if (errorAtleta) {
    registrarFallo('tokenize-payment-method:atleta', errorAtleta);
    return { estado: 500, codigo: 'error_interno', mensaje: 'No se pudo consultar tu ficha.' };
  }
  if (!atleta) {
    // Misma respuesta para "no existe" y "no tienes acceso".
    return { estado: 404, codigo: 'atleta_no_encontrado', mensaje: 'No se encontró esa ficha.' };
  }

  const membresia = lista.find((m) => m.org_id === atleta.org_id);
  if (!membresia) {
    return { estado: 403, codigo: 'sin_acceso', mensaje: 'No tienes acceso a ese box.' };
  }

  const esElMismoAtleta = membresia.athlete_id === atleta.id;
  const tienePermisoFinanciero =
    membresia.role === 'owner' ||
    membresia.role === 'admin' ||
    (membresia.role === 'coach' && membresia.permissions?.can_view_finances === true);

  if (!esElMismoAtleta && !tienePermisoFinanciero) {
    return {
      estado: 403,
      codigo: 'sin_permiso',
      mensaje: 'Solo el atleta o quien maneja las finanzas del box puede autorizar un débito.',
    };
  }

  return {
    orgId: atleta.org_id,
    athleteId: atleta.id,
    nombreDelBox: nombreDe(membresia),
    correo: atleta.email ?? null,
    telefono: atleta.phone ?? null,
    userId,
  };
}
