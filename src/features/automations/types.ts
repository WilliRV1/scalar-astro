/**
 * Tipos del motor de automatizaciones.
 *
 * Viven aquí y no en `src/types/database.ts` porque ese archivo se regenera
 * desde el esquema (`npm run types:gen`) y esta funcionalidad todavía está
 * estabilizándose. Cuando se regenere, estos tipos se reemplazan por los
 * generados sin tocar ni un componente.
 */

export type CanalMensaje = 'whatsapp' | 'email' | 'sms';
export type CategoriaMensaje = 'utility' | 'marketing' | 'authentication' | 'internal';
export type TipoDisparador = 'schedule' | 'event';
export type TipoAccion =
  | 'send_message' | 'notify_staff' | 'create_task' | 'tag_athlete' | 'suspend_access';

/** Estados de `message_outbox`. `ready` es la etapa 0: listo para el clic del coach. */
export type EstadoMensaje =
  | 'queued' | 'sending' | 'ready' | 'sent' | 'delivered' | 'read'
  | 'failed' | 'cancelled' | 'simulated';

export type BandaRiesgo = 'ok' | 'watch' | 'at_risk' | 'critical';

export interface AjustesAutomatizacion {
  org_id: string;
  is_enabled: boolean;
  simulation_mode: boolean;
  quiet_start_hour: number;
  quiet_end_hour: number;
  max_messages_per_athlete_per_month: number;
  max_messages_per_athlete_per_day: number;
  provider: 'wa_me' | 'cloud_api';
  staff_phone: string | null;
}

export interface PlantillaMensaje {
  id: string;
  org_id: string | null;
  key: string;
  name: string;
  channel: CanalMensaje;
  category: CategoriaMensaje;
  body: string;
  variables: string[];
  is_active: boolean;
}

export interface ReglaAutomatizacion {
  id: string;
  org_id: string | null;
  key: string;
  name: string;
  description: string | null;
  trigger_type: TipoDisparador;
  trigger_config: Record<string, unknown>;
  action_type: TipoAccion;
  template_id: string | null;
  category: CategoriaMensaje;
  priority: number;
  is_active: boolean;
  last_run_at: string | null;
}

/** Una regla con su plantilla ya resuelta, que es como se pinta en pantalla. */
export interface ReglaConPlantilla extends ReglaAutomatizacion {
  message_templates: PlantillaMensaje | null;
}

export interface MensajeEnBitacora {
  id: string;
  org_id: string;
  athlete_id: string | null;
  rule_id: string | null;
  invoice_id: string | null;
  audience: 'athlete' | 'staff';
  channel: CanalMensaje;
  to_address: string;
  template_key: string | null;
  category: CategoriaMensaje;
  rendered_body: string;
  status: EstadoMensaje;
  simulated: boolean;
  scheduled_for: string;
  queued_for_day: string;
  sent_at: string | null;
  provider: string | null;
  provider_msg_id: string | null;
  error: string | null;
  attempts: number;
  cancel_reason: string | null;
  created_at: string;
  athletes: { first_name: string; last_name: string | null } | null;
}

/** Un motivo de riesgo, tal como lo escribe `refresh_risk_scores`. */
export interface MotivoRiesgo {
  codigo: string;
  texto: string;
  puntos: number;
}

export interface RiesgoAtleta {
  org_id: string;
  athlete_id: string;
  computed_on: string;
  days_since_last_visit: number | null;
  visits_last_30d: number;
  visits_prev_30d: number;
  days_overdue: number;
  no_shows_30d: number;
  tenure_days: number;
  never_logged_result: boolean;
  score: number;
  band: BandaRiesgo;
  reasons: MotivoRiesgo[];
  athletes: {
    first_name: string;
    last_name: string | null;
    phone: string | null;
    consent_whatsapp_at: string | null;
    tags: string[];
  } | null;
}
