/**
 * Tipos de la base de datos.
 *
 * Provisional y escrito a mano para arrancar. En cuanto haya un proyecto de
 * Supabase enlazado se reemplaza por la versión generada:
 *
 *   npm run types:gen
 *
 * Regla: nunca editar a mano el archivo generado. Si falta un campo, se corrige
 * en una migración y se regenera.
 */

export type Role = 'owner' | 'admin' | 'coach' | 'athlete';
export type MembershipStatus = 'active' | 'invited' | 'disabled';
export type AthleteStatus = 'lead' | 'trial' | 'active' | 'frozen' | 'overdue' | 'churned';
export type InvoiceStatus = 'open' | 'partial' | 'paid' | 'overdue' | 'void';
export type SubscriptionStatus = 'active' | 'paused' | 'overdue' | 'cancelled';
export type PaymentMethod =
  | 'cash' | 'transfer' | 'nequi' | 'daviplata' | 'card' | 'pse' | 'other';

/** Permisos finos sobre el rol. Ver docs/02-arquitectura.md */
export interface Permissions {
  can_view_finances?: boolean;
  can_edit_wods?: boolean;
  can_manage_athletes?: boolean;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  logo_url: string | null;
  brand_color: string;
  city: string | null;
  plan_tier: 'trial' | 'starter' | 'box' | 'pro' | 'chain';
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'churned';
}

export interface Membership {
  id: string;
  org_id: string;
  user_id: string;
  role: Role;
  permissions: Permissions;
  athlete_id: string | null;
  status: MembershipStatus;
}

export interface Athlete {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  birth_date: string | null;
  referral_source: string | null;
  joined_on: string;
  status: AthleteStatus;
  tags: string[];
  /**
   * Valores de los campos que definió el box. Ver `features/customfields`.
   *
   * Se escribe estructuralmente en vez de importar `ValoresCampos`: los tipos
   * de la base no deben depender de un módulo de features, que es la capa de
   * arriba. Los dos tipos tienen que coincidir, y el compilador lo comprueba
   * en cada sitio donde se pasan el uno al otro.
   */
  custom: Record<string, string | number | boolean | string[]>;
  consent_data_at: string | null;
  consent_whatsapp_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Plan {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_period: 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'one_off';
  duration_days: number | null;
  class_quota: number | null;
  is_active: boolean;
}

export interface Movement {
  id: string;
  org_id: string | null;
  name: string;
  category: string | null;
  metric: 'weight' | 'time' | 'reps' | 'rounds_reps' | 'distance' | 'calories';
  unit: string;
  is_benchmark: boolean;
  legacy_key: string | null;
  sort_order: number;
}

export interface PersonalRecord {
  id: string;
  org_id: string;
  athlete_id: string;
  movement_id: string;
  value_numeric: number;
  unit: string;
  reps: number;
  achieved_on: string;
  source: 'manual' | 'wod_result' | 'import' | 'legacy';
  notes: string | null;
}

export interface Subscription {
  id: string;
  org_id: string;
  athlete_id: string;
  plan_id: string;
  price_cents: number;
  discount_cents: number;
  started_on: string;
  ends_on: string | null;
  billing_day: number;
  status: SubscriptionStatus;
}

export interface Invoice {
  id: string;
  org_id: string;
  athlete_id: string;
  subscription_id: string | null;
  number: string;
  period_start: string;
  period_end: string;
  issued_on: string;
  due_on: string;
  amount_cents: number;
  paid_cents: number;
  status: InvoiceStatus;
}

export interface Payment {
  id: string;
  org_id: string;
  athlete_id: string;
  invoice_id: string | null;
  amount_cents: number;
  method: PaymentMethod;
  paid_at: string;
  provider: 'manual' | 'wompi' | 'mercadopago';
  status: 'pending' | 'confirmed' | 'rejected' | 'refunded';
}

/** La membresía tal como la devuelve la consulta con el box embebido. */
export interface MembershipWithOrg extends Membership {
  organizations: Organization;
}
