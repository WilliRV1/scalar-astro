// =============================================================================
// Proveedores de mensajería
// =============================================================================
// El camino de WhatsApp tiene tres etapas (docs/04 §El camino en tres etapas) y
// el producto tiene que funcionar en la primera, hoy, sin trámites con Meta.
// Por eso el envío está detrás de una interfaz y no repartido por el código:
// cambiar de etapa es cambiar una variable de entorno, no reescribir el job.
//
//   Etapa 0 · `wa.me` de un clic  — PROBADA. Sin costo, sin API, sin
//     verificación de negocio. El sistema decide a quién escribirle y redacta
//     el texto; el coach toca un botón y se abre WhatsApp con el mensaje ya
//     escrito. No es automático, pero elimina el 90% del trabajo (decidir a
//     quién, buscar el chat, redactar) y funciona desde el día uno.
//
//   Etapa 1 · Cloud API oficial de Meta — IMPLEMENTADA, **SIN VERIFICAR**.
//     Requiere cuenta de WhatsApp Business, verificación del negocio, número
//     dedicado y plantillas aprobadas. Sin esas credenciales no se puede probar
//     contra el servicio real: la implementación de abajo está escrita contra la
//     documentación de Graph API, NO contra una respuesta real. Ver la nota
//     VERIFICAR en `ProveedorCloudApi`.
//
// REGLA DURA (docs/04 §Reglas duras, 1): NUNCA una librería no oficial
// (Baileys, Venom, whatsapp-web.js). Violan los términos de WhatsApp y el
// número del CLIENTE termina baneado. Eso no es un bug: es perder al cliente y
// su reputación con sus atletas.
//
// Ningún secreto vive aquí: todo sale del entorno de la función.
// =============================================================================

/** Un mensaje tal como sale de `message_outbox`. */
export interface MensajeSaliente {
  id: string;
  org_id: string;
  to_address: string;
  rendered_body: string;
  category: string;
  channel: string;
  template_key: string | null;
  attempts: number;
}

export interface ResultadoEnvio {
  /**
   * `sent`   · salió de verdad hacia el proveedor.
   * `ready`  · quedó listo para el clic del coach (etapa 0). No se envió solo.
   * `failed` · no se pudo. La base decide si se reintenta o se da por perdido.
   */
  estado: 'sent' | 'ready' | 'failed';
  proveedor: string;
  idProveedor?: string;
  /** Enlace de un clic, solo en la etapa 0. */
  enlace?: string;
  error?: string;
  costoMicros?: number;
}

export interface ProveedorMensajeria {
  readonly nombre: string;
  enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio>;
}

/** Quita todo lo que no sea dígito: wa.me no admite el '+' ni espacios. */
function soloDigitos(e164: string): string {
  return e164.replace(/\D/g, '');
}

/**
 * Etapa 0 · un clic.
 *
 * No envía: PREPARA. Deja el mensaje en estado `ready` con el enlace
 * `https://wa.me/57300…?text=…` para que la interfaz lo muestre como un botón.
 * Muchos clientes se quedan felices aquí y nunca piden más.
 */
export class ProveedorWaMe implements ProveedorMensajeria {
  readonly nombre = 'wa_me';

  enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio> {
    const numero = soloDigitos(mensaje.to_address);
    if (numero.length < 8) {
      return Promise.resolve({
        estado: 'failed',
        proveedor: this.nombre,
        error: 'El destinatario no es un teléfono en E.164',
      });
    }
    return Promise.resolve({
      estado: 'ready',
      proveedor: this.nombre,
      enlace: `https://wa.me/${numero}?text=${encodeURIComponent(mensaje.rendered_body)}`,
    });
  }
}

interface RespuestaCloudApi {
  messages?: Array<{ id?: string }>;
  error?: { message?: string; code?: number };
}

/**
 * Etapa 1 · Cloud API oficial de Meta.
 *
 * VERIFICAR — esta clase NO se ha ejecutado contra el servicio real. No hay
 * cuenta de WhatsApp Business ni número verificado en este entorno, así que no
 * se puede afirmar que funcione. Lo que sí está probado es que el resto del
 * motor la trata igual que a la etapa 0 (misma interfaz, mismos estados).
 *
 * Antes de darla por buena hay que comprobar, con credenciales de verdad:
 *   · que el `phone_number_id` y el token sean del mismo WABA;
 *   · que la plantilla exista y esté APROBADA en Meta con ese `name` y ese
 *     idioma, porque un mensaje iniciado por el negocio FUERA de la ventana de
 *     24 h solo sale por plantilla, nunca como texto libre;
 *   · que el orden de las variables de la plantilla coincida con el orden en
 *     que se mandan aquí (Meta las numera 1..n, no las nombra);
 *   · qué error devuelve un número que nunca escribió al box.
 *
 * Mientras tanto, el proveedor por defecto es `wa_me`.
 */
export class ProveedorCloudApi implements ProveedorMensajeria {
  readonly nombre = 'cloud_api';

  constructor(
    private readonly phoneNumberId: string,
    private readonly token: string,
    private readonly version = 'v21.0',
    private readonly idioma = 'es',
  ) {}

  async enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio> {
    const url = `https://graph.facebook.com/${this.version}/${this.phoneNumberId}/messages`;

    // Sin plantilla aprobada no hay mensaje iniciado por el negocio. Se manda
    // como texto solo si el box declaró que la conversación está abierta.
    const cuerpo = mensaje.template_key
      ? {
          messaging_product: 'whatsapp',
          to: soloDigitos(mensaje.to_address),
          type: 'template',
          template: {
            name: mensaje.template_key,
            language: { code: this.idioma },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: mensaje.rendered_body }],
              },
            ],
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: soloDigitos(mensaje.to_address),
          type: 'text',
          text: { body: mensaje.rendered_body },
        };

    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(cuerpo),
      });

      const datos = (await respuesta.json()) as RespuestaCloudApi;

      if (!respuesta.ok) {
        return {
          estado: 'failed',
          proveedor: this.nombre,
          // El texto del error de Meta se guarda para poder depurar; no viaja
          // a ningún cliente.
          error: datos.error?.message ?? `HTTP ${respuesta.status}`,
        };
      }

      return {
        estado: 'sent',
        proveedor: this.nombre,
        idProveedor: datos.messages?.[0]?.id,
      };
    } catch (causa) {
      return {
        estado: 'failed',
        proveedor: this.nombre,
        error: causa instanceof Error ? causa.message : 'fallo de red',
      };
    }
  }
}

/**
 * Elige el proveedor según el entorno.
 *
 * Por defecto `wa_me`: es el único que se puede afirmar que funciona sin
 * trámites. Para pasar a la etapa 1 hay que poner WHATSAPP_PROVIDER=cloud_api
 * y los dos secretos; si falta alguno se cae a la etapa 0 en vez de quedarse
 * sin mandar nada.
 */
export function proveedorDelEntorno(
  leer: (nombre: string) => string | undefined,
): ProveedorMensajeria {
  if (leer('WHATSAPP_PROVIDER') === 'cloud_api') {
    const phoneNumberId = leer('WHATSAPP_PHONE_NUMBER_ID');
    const token = leer('WHATSAPP_TOKEN');
    if (phoneNumberId && token) {
      return new ProveedorCloudApi(
        phoneNumberId,
        token,
        leer('WHATSAPP_API_VERSION') ?? 'v21.0',
        leer('WHATSAPP_TEMPLATE_LANG') ?? 'es',
      );
    }
    console.warn('[process-outbox] WHATSAPP_PROVIDER=cloud_api sin credenciales: se usa wa.me');
  }
  return new ProveedorWaMe();
}
