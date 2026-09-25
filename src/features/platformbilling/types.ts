/**
 * Lo que el box le paga a Scalar. Distinto de `billing`, que es lo que el
 * atleta le paga al box. Todo el dinero en centavos.
 */

export type PlanScalar = 'trial' | 'starter' | 'box' | 'pro' | 'chain';
export type EstadoSuscripcion = 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled';

/** Una fila de platform_subscriptions. Solo la ve el dueño. */
export interface SuscripcionScalar {
  id: string;
  org_id: string;
  plan_tier: PlanScalar;
  is_founder: boolean;
  price_cents: number;
  setup_fee_cents: number;
  billing_period: 'monthly' | 'annual';
  status: EstadoSuscripcion;
  started_on: string;
  next_charge_on: string | null;
  grace_days: number;
  suspended_on: string | null;
}

/** Una fila de platform_payments. */
export interface PagoScalar {
  id: string;
  amount_cents: number;
  method: string;
  paid_at: string;
  period_start: string;
  period_end: string;
  provider: 'manual' | 'mercadopago';
  status: 'confirmed' | 'refunded';
}

/** Lo que devuelve la función platform-payment-link. */
export interface EnlaceDePagoScalar {
  checkout_url: string;
  amount_cents: number;
  period_start: string;
  period_end: string;
  plan_tier: PlanScalar;
  expires_at: string | null;
}
