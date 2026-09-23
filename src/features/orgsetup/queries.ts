import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { AjustesBox, AvanceOnboarding, Box, Credencial } from './types';

/**
 * Lecturas de la configuración del box.
 *
 * Ninguna de estas consultas filtra por rol: la RLS decide qué vuelve. Si este
 * código comprobara permisos habría dos fuentes de verdad y una acabaría
 * equivocándose; lo que sí hace la interfaz es no pintar lo que no llegó.
 *
 * Para los ajustes de mensajería y de reserva se reutilizan los hooks que ya
 * existen (`useAjustesAutomatizacion`, `useReservationSettings`): son las
 * mismas tablas y duplicarlos sería tener dos cachés de lo mismo.
 */

const AJUSTES_POR_DEFECTO: AjustesBox = {
  grace_days: 3,
  default_billing_day: 5,
  accepts_online_payment: false,
  payment_link: '',
};

/** Completa lo que falte. Un box dado de alta antes de la migración no tiene todas las claves. */
function normalizarAjustes(crudo: unknown): AjustesBox {
  const s = (crudo ?? {}) as Partial<AjustesBox>;
  return {
    grace_days: typeof s.grace_days === 'number' ? s.grace_days : AJUSTES_POR_DEFECTO.grace_days,
    default_billing_day:
      typeof s.default_billing_day === 'number'
        ? s.default_billing_day
        : AJUSTES_POR_DEFECTO.default_billing_day,
    accepts_online_payment:
      typeof s.accepts_online_payment === 'boolean'
        ? s.accepts_online_payment
        : AJUSTES_POR_DEFECTO.accepts_online_payment,
    payment_link: typeof s.payment_link === 'string' ? s.payment_link : '',
  };
}

export function useBox(orgId: string | undefined) {
  return useQuery({
    queryKey: ['box', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Box | null> => {
      const { data, error } = await supabase
        .from('organizations')
        .select(
          'id, slug, name, legal_name, tax_id, timezone, currency, logo_url, brand_color, phone, address, city, settings, onboarded_at',
        )
        .eq('id', orgId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const fila = data as unknown as Omit<Box, 'settings'> & { settings: unknown };
      return { ...fila, settings: normalizarAjustes(fila.settings) };
    },
  });
}

export function useOnboarding(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-onboarding', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<AvanceOnboarding | null> => {
      const { data, error } = await supabase
        .from('org_onboarding')
        .select('org_id, current_step, steps_done, steps_skipped, completed_at')
        .eq('org_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AvanceOnboarding | null;
    },
  });
}

/**
 * El ESTADO de las credenciales del box.
 *
 * Esta consulta no puede devolver un secreto ni equivocándose: la tabla que los
 * guarda (`org_secret_values`) no tiene ningún privilegio para el rol del
 * navegador. Lo que vuelve es en qué terminan y desde cuándo están puestas.
 */
export function useCredenciales(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-credentials', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Credencial[]> => {
      const { data, error } = await supabase
        .from('org_credentials')
        .select('org_id, key, provider, environment, public_value, last4, is_set, configured_at')
        .eq('org_id', orgId!);
      if (error) throw error;
      return (data ?? []) as unknown as Credencial[];
    },
  });
}

/**
 * URL para mostrar el logo.
 *
 * `logo_url` guarda dos cosas distintas según de dónde salió: una dirección
 * completa si el dueño la pegó, o una ruta dentro del bucket `avatars` si la
 * subió. El bucket es privado, así que esa segunda hay que firmarla. Se firma
 * aquí y en un solo sitio para que quien pinte el logo no tenga que saberlo.
 */
export function useLogo(logoUrl: string | null | undefined) {
  return useQuery({
    queryKey: ['org-logo', logoUrl],
    enabled: Boolean(logoUrl),
    // Las URL firmadas vencen; una hora de caché deja margen de sobra.
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const valor = logoUrl!;
      if (/^https?:\/\//.test(valor)) return valor;

      const { data, error } = await supabase.storage
        .from('avatars')
        .createSignedUrl(valor, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}
