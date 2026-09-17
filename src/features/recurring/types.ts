/**
 * Tipos del débito recurrente.
 *
 * Viven aquí y no en `src/types/database.ts` porque ese archivo lo integra
 * quien coordina; cuando se regenere desde la base (`npm run types:gen`), estos
 * se reemplazan por los generados. Son el reflejo exacto de la migración
 * `20260918170000_recurring.sql`.
 */

/** Qué tokenizó el atleta. `nequi` es el diferenciador del producto. */
export type TipoDeMetodo = 'card' | 'nequi' | 'daviplata' | 'bancolombia_transfer';

export type EstadoDelMetodo = 'active' | 'revoked' | 'expired' | 'failed';

/**
 * Medio de pago tokenizado.
 *
 * OJO: aquí NO hay número de tarjeta ni CVV, y no los va a haber. Lo único que
 * viaja al navegador es lo necesario para que el atleta reconozca de dónde le
 * sale la plata.
 */
export interface MetodoDePago {
  id: string;
  org_id: string;
  athlete_id: string;
  provider: string;
  kind: TipoDeMetodo;
  brand: string | null;
  last_four: string | null;
  masked_phone: string | null;
  exp_month: number | null;
  exp_year: number | null;
  customer_email: string | null;
  status: EstadoDelMetodo;
  revoked_at: string | null;
  revoke_reason: string | null;
  is_default: boolean;
  created_at: string;
}

/** La autorización del atleta. La fecha es la evidencia. */
export interface AutorizacionDeDebito {
  id: string;
  org_id: string;
  athlete_id: string;
  payment_method_id: string;
  authorized_at: string;
  accepted_text: string;
  accepted_version: string;
  acceptance_permalink: string | null;
  max_amount_cents: number | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export type EstadoDelCobro =
  | 'queued'
  | 'processing'
  | 'approved'
  | 'declined'
  | 'exhausted'
  | 'failed'
  | 'cancelled';

export type CausaDelFallo =
  | 'insufficient_funds'
  | 'revoked_token'
  | 'expired_card'
  | 'invalid_source'
  | 'over_authorized_amount'
  | 'missing_email'
  | 'gateway_error'
  | 'declined'
  | 'other';

export interface CobroAutomatico {
  id: string;
  org_id: string;
  athlete_id: string;
  invoice_id: string;
  amount_cents: number;
  currency: string;
  period_start: string;
  status: EstadoDelCobro;
  attempt: number;
  max_attempts: number;
  next_attempt_at: string;
  last_attempt_at: string | null;
  charged_at: string | null;
  failure_kind: CausaDelFallo | null;
  last_error_message: string | null;
  cancel_reason: string | null;
  notice_pending: boolean;
  notice_kind: 'retries_exhausted' | 'needs_new_authorization' | null;
  created_at: string;
}

/** Lo que devuelve `tokenize-payment-method` en la acción `preparar`. */
export interface PreparacionDeAutorizacion {
  ok: boolean;
  athlete_id: string;
  org_id: string;
  version: string;
  texto_nequi: string;
  texto_tarjeta: string;
  telefono_sugerido: string | null;
  correo: string | null;
  politicas: { tipo: string; enlace: string }[];
  listo: boolean;
}

export interface InicioDeNequi {
  ok: boolean;
  token: string;
  estado: string;
  telefono_enmascarado: string;
}

export interface MetodoGuardado {
  ok: boolean;
  payment_method_id: string | null;
  authorization_id: string | null;
  reemplazado: boolean;
  kind: TipoDeMetodo;
  last_four: string | null;
  masked_phone: string | null;
}
