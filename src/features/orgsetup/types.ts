/**
 * Tipos de la configuración del box.
 *
 * Escritos a mano, igual que los de `reservations` y `automations`: mientras no
 * haya un proyecto de Supabase enlazado no hay tipos generados. Cuando los
 * haya (`npm run types:gen`), esto se reemplaza sin tocar ni un componente.
 *
 * `src/types/database.ts` tiene una `Organization` recortada (lo que necesitaba
 * la cabecera). Aquí hace falta la fila entera, porque esta es la pantalla
 * donde el dueño la edita.
 */

/** Los pasos del asistente, en el orden en que se hacen. */
export const PASOS = ['box', 'plans', 'billing', 'athletes', 'automations'] as const;
export type Paso = (typeof PASOS)[number];
export type PasoActual = Paso | 'done';
export type EstadoPaso = 'done' | 'skipped' | 'pending';

/** Lo que guarda `organizations.settings`. La base valida estos mismos rangos. */
export interface AjustesBox {
  /** Días entre el corte y la mora. 0 = en mora el mismo día. */
  grace_days: number;
  /** Día del mes que se propone al asignarle un plan a un atleta nuevo. */
  default_billing_day: number;
  /** ¿El atleta puede pagar desde la aplicación? */
  accepts_online_payment: boolean;
  /** Enlace de pago manual (Nequi, Daviplata, Bold) para los mensajes de cobro. */
  payment_link: string;
}

export interface Box {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  timezone: string;
  currency: string;
  logo_url: string | null;
  brand_color: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  settings: AjustesBox;
  onboarded_at: string | null;
}

export interface AvanceOnboarding {
  org_id: string;
  current_step: PasoActual;
  steps_done: Paso[];
  steps_skipped: Paso[];
  completed_at: string | null;
}

export type Pasarela = 'mercadopago' | 'wompi' | 'whatsapp_cloud';
export type Ambiente = 'test' | 'prod';

export type ClaveCredencial =
  | 'mercadopago_access_token'
  | 'mercadopago_webhook_secret'
  | 'wompi_public_key'
  | 'wompi_private_key'
  | 'wompi_integrity_secret'
  | 'wompi_events_secret'
  | 'whatsapp_phone_number_id'
  | 'whatsapp_token';

/**
 * El ESTADO de una credencial. Nunca el secreto.
 *
 * No existe un tipo "CredencialConValor" a propósito: si algún día alguien
 * quiere escribirlo, que tenga que inventárselo y explicar por qué.
 */
export interface Credencial {
  org_id: string;
  key: ClaveCredencial;
  provider: Pasarela;
  environment: Ambiente;
  /** Solo para las credenciales que NO son secretas. */
  public_value: string | null;
  /** Los últimos 4 caracteres del secreto. Es todo lo que se puede mostrar. */
  last4: string | null;
  is_set: boolean;
  configured_at: string | null;
}
