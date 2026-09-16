import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase.
 *
 * Aquí vivía un mock de 163 líneas que reimplementaba el SDK cuando faltaban
 * las credenciales. Se eliminó a propósito: divergía del cliente real y producía
 * bugs que solo aparecían en producción. Para desarrollar sin tocar la nube se
 * usa el stack local (`npx supabase start`), que es Postgres de verdad con la
 * misma RLS.
 *
 * La llave anónima viaja al navegador por diseño. Eso es seguro ÚNICAMENTE
 * porque toda tabla tiene RLS: es la llave la que identifica, no la que
 * autoriza. Ver docs/02-arquitectura.md.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.\n' +
      'Copia .env.example a .env. Para desarrollo local: npx supabase start',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
