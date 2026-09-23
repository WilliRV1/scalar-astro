// =============================================================================
// Credenciales por box
// =============================================================================
// Cada box cobra a SU cuenta de Wompi y escribe desde SU número de WhatsApp.
// Las llaves las mete el dueño desde la aplicación y se guardan de forma que
// ni él puede volver a leerlas desde el navegador (migración 0017).
//
// Esta es la única vía por la que una función del servidor las recupera:
// `public.org_secret_for_service`, que solo puede ejecutar `service_role`.
//
// Hay respaldo en variables de entorno **a propósito**, y conviene entender
// para qué sirve y para qué no:
//
//   · SIRVE para desarrollo, para pruebas en sandbox y para el periodo en que
//     un box todavía no ha configurado lo suyo.
//   · NO sirve como configuración definitiva: si dos boxes usan el respaldo,
//     la plata de los dos cae en la misma cuenta. Por eso `exigeCredencial`
//     avisa en el registro cada vez que un box cae al respaldo, con su id.
// =============================================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { env } from './env.ts';

export type ClaveCredencial =
  | 'wompi_public_key'
  | 'wompi_private_key'
  | 'wompi_integrity_secret'
  | 'wompi_events_secret'
  | 'whatsapp_token'
  | 'whatsapp_phone_number_id';

/** Variable de entorno de respaldo para cada credencial. */
const RESPALDO: Record<ClaveCredencial, string> = {
  wompi_public_key: 'WOMPI_PUBLIC_KEY',
  wompi_private_key: 'WOMPI_PRIVATE_KEY',
  wompi_integrity_secret: 'WOMPI_INTEGRITY_SECRET',
  wompi_events_secret: 'WOMPI_EVENTS_SECRET',
  whatsapp_token: 'WHATSAPP_TOKEN',
  whatsapp_phone_number_id: 'WHATSAPP_PHONE_NUMBER_ID',
};

/**
 * Credencial de un box, o el respaldo del entorno, o `undefined`.
 *
 * Nunca lanza por no encontrarla: quien llama decide si puede seguir sin ella.
 * Tampoco escribe el valor en el registro, jamás.
 */
export async function credencialDelBox(
  servicio: SupabaseClient,
  orgId: string,
  clave: ClaveCredencial,
): Promise<{ valor: string; origen: 'box' | 'entorno' } | undefined> {
  const { data, error } = await servicio.rpc('org_secret_for_service', {
    p_org_id: orgId,
    p_clave: clave,
  });

  if (error) {
    // Un fallo aquí no puede tumbar el cobro de todos los boxes: se registra
    // el motivo, sin el valor, y se intenta el respaldo.
    console.error(`[credenciales] no se pudo leer ${clave} del box ${orgId}: ${error.message}`);
  } else if (typeof data === 'string' && data.trim() !== '') {
    return { valor: data.trim(), origen: 'box' };
  }

  const respaldo = env(RESPALDO[clave]);
  return respaldo ? { valor: respaldo, origen: 'entorno' } : undefined;
}

/**
 * Igual que la anterior, pero obligatoria: lanza con un mensaje que dice qué
 * falta y a qué box, sin revelar nada.
 */
export async function exigeCredencial(
  servicio: SupabaseClient,
  orgId: string,
  clave: ClaveCredencial,
): Promise<string> {
  const encontrada = await credencialDelBox(servicio, orgId, clave);

  if (!encontrada) {
    throw new Error(
      `El box ${orgId} no tiene configurada la credencial "${clave}". ` +
        'El dueño la pone en Configuración → Integraciones.',
    );
  }

  if (encontrada.origen === 'entorno') {
    // Que esto aparezca en producción significa que el cobro de ese box está
    // cayendo en la cuenta del respaldo, no en la suya.
    console.warn(
      `[credenciales] el box ${orgId} usa el respaldo del entorno para "${clave}". ` +
        'En producción cada box debe tener la suya.',
    );
  }

  return encontrada.valor;
}
