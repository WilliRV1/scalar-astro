/**
 * Tipos de la capa de plataforma (lo que vemos NOSOTROS, no el cliente).
 *
 * Espejo de las funciones de `supabase/migrations/20260918150000_saas.sql`.
 * Van aquí y no en `src/types/database.ts` porque ese archivo se regenera con
 * `supabase gen types` y no se edita a mano.
 */

/** Estado del box con nosotros. `organizations.status`. */
export type EstadoDeBox = 'trial' | 'active' | 'past_due' | 'suspended' | 'churned';

/** Tramo de precio. `organizations.plan_tier`. */
export type TramoDePlan = 'trial' | 'starter' | 'box' | 'pro' | 'chain';

/** Estado de la suscripción que el box tiene con Scalar. */
export type EstadoDeSuscripcion =
  | 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled' | 'sin suscripción';

/** Un renglón de `public.platform_boxes()`. */
export interface BoxDePlataforma {
  org_id: string;
  slug: string;
  name: string;
  city: string | null;
  org_status: EstadoDeBox;
  plan_tier: TramoDePlan;
  is_founder: boolean;
  price_cents: number;
  sub_status: EstadoDeSuscripcion;
  next_charge_on: string | null;
  atletas_activos: number;
  owner_email: string | null;
  created_at: string;
}

/** Lo que devuelve `public.platform_metrics()`. */
export interface MetricasDePlataforma {
  boxes_totales: number;
  boxes_activos: number;
  boxes_en_prueba: number;
  boxes_en_mora: number;
  boxes_suspendidos: number;
  mrr_cents: number;
  atletas_totales: number;
  mensajes_enviados: number;
}

/** Lo que devuelve `public.create_organization()`. */
export interface AltaDeBox {
  org_id: string;
  slug: string;
  owner_user_id: string | null;
  /** Solo si el dueño todavía no tenía cuenta. Es el enlace que se le manda. */
  invite_token: string | null;
  plans_created: number;
}

/** Una sesión de soporte abierta: `public.impersonate()`. */
export interface SesionDeSoporte {
  id: string;
  org_id: string;
  admin_user_id: string;
  reason: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
}

/** Cifras agregadas de un box, solo con sesión de soporte abierta. */
export interface DetalleDeBox {
  atletas_activos: number;
  atletas_en_mora: number;
  cartera_cents: number;
  cobros_del_mes: number;
  ultimo_pago_at: string | null;
  miembros_staff: number;
}

export const ETIQUETA_ESTADO: Record<EstadoDeBox, string> = {
  trial: 'En prueba',
  active: 'Activo',
  past_due: 'En mora',
  suspended: 'Suspendido',
  churned: 'Se fue',
};

export const ETIQUETA_PLAN: Record<TramoDePlan, string> = {
  trial: 'Prueba',
  starter: 'Starter · hasta 40',
  box: 'Box · hasta 120',
  pro: 'Pro · hasta 300',
  chain: 'Cadena · cotización',
};

/** Color del estado. Rojo = hay que hacer algo hoy. */
export function colorDeEstado(estado: EstadoDeBox): string {
  switch (estado) {
    case 'active':
      return 'text-emerald-400';
    case 'trial':
      return 'text-sky-400';
    case 'past_due':
      return 'text-amber-400';
    case 'suspended':
      return 'text-primary';
    case 'churned':
      return 'text-gray-500';
  }
}
