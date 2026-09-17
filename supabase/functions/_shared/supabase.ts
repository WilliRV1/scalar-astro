// =============================================================================
// Clientes de Supabase
// =============================================================================
// Dos clientes, dos propósitos, y no se confunden:
//
//   · clienteDelUsuario(): lleva el JWT de quien llama, así que TODA consulta
//     pasa por RLS. Es el que decide si esa persona puede ver esa factura.
//   · clienteDeServicio(): service_role, SALTA RLS. Solo se usa después de
//     haber comprobado el acceso con el cliente anterior, o en el webhook,
//     donde no hay usuario y la autorización es la firma de Wompi.
//
// La llave de servicio nunca sale de la función ni aparece en una respuesta.
// =============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { requiereEnv } from './env.ts';

/** Variables que la plataforma inyecta sola en toda Edge Function. */
const URL_SUPABASE = () => requiereEnv('SUPABASE_URL');

export function clienteDeServicio(): SupabaseClient {
  return createClient(URL_SUPABASE(), requiereEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function clienteDelUsuario(authorization: string): SupabaseClient {
  return createClient(URL_SUPABASE(), requiereEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
}
