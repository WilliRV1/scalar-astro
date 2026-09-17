import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type {
  AjustesAutomatizacion,
  EstadoMensaje,
  MensajeEnBitacora,
  ReglaConPlantilla,
  RiesgoAtleta,
} from './types';

/**
 * Las reglas del box con su plantilla.
 *
 * La RLS decide qué se ve: un coach las lee, solo dueño y administrador las
 * modifican. Este código no comprueba roles; si lo hiciera, habría dos fuentes
 * de verdad y una acabaría equivocándose.
 */
export function useReglas(orgId: string | undefined) {
  return useQuery({
    queryKey: ['automation-rules', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ReglaConPlantilla[]> => {
      const { data, error } = await supabase
        .from('automation_rules')
        .select('*, message_templates(*)')
        .eq('org_id', orgId!)
        .order('priority', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReglaConPlantilla[];
    },
  });
}

export function useAjustesAutomatizacion(orgId: string | undefined) {
  return useQuery({
    queryKey: ['automation-settings', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<AjustesAutomatizacion | null> => {
      const { data, error } = await supabase
        .from('automation_settings')
        .select('*')
        .eq('org_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AjustesAutomatizacion | null;
    },
  });
}

export interface FiltroBitacora {
  estado?: EstadoMensaje | 'todos';
  atletaId?: string;
  busqueda?: string;
}

/**
 * La bitácora: qué se le mandó a quién y cuándo.
 *
 * Sin esto no se puede responder al primer reclamo del producto ("me están
 * cobrando y yo ya pagué"), así que se ordena por lo más reciente y se muestra
 * también lo cancelado: el mensaje que NO salió es justamente la prueba.
 */
export function useBitacora(orgId: string | undefined, filtro: FiltroBitacora = {}) {
  return useQuery({
    queryKey: ['message-outbox', orgId, filtro.estado ?? 'todos', filtro.atletaId ?? '', filtro.busqueda ?? ''],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<MensajeEnBitacora[]> => {
      let consulta = supabase
        .from('message_outbox')
        .select('*, athletes(first_name, last_name)')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(200);

      if (filtro.estado && filtro.estado !== 'todos') consulta = consulta.eq('status', filtro.estado);
      if (filtro.atletaId) consulta = consulta.eq('athlete_id', filtro.atletaId);
      if (filtro.busqueda) consulta = consulta.ilike('rendered_body', `%${filtro.busqueda}%`);

      const { data, error } = await consulta;
      if (error) throw error;
      return (data ?? []) as unknown as MensajeEnBitacora[];
    },
  });
}

/**
 * Los atletas en riesgo de irse, de la foto MÁS RECIENTE.
 *
 * Dos consultas y no una: primero se busca de qué día es la última foto y
 * después se traen sus filas. Filtrar por `computed_on = hoy` fallaría el día
 * en que el trabajo nocturno no corrió, y el coach se encontraría la pantalla
 * vacía justo cuando más la necesita.
 */
export function useAtletasEnRiesgo(orgId: string | undefined, bandas?: string[]) {
  return useQuery({
    queryKey: ['risk-scores', orgId, (bandas ?? []).join(',')],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<{ fecha: string | null; lista: RiesgoAtleta[] }> => {
      const { data: ultima, error: errorFecha } = await supabase
        .from('athlete_risk_scores')
        .select('computed_on')
        .eq('org_id', orgId!)
        .order('computed_on', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (errorFecha) throw errorFecha;
      if (!ultima) return { fecha: null, lista: [] };

      let consulta = supabase
        .from('athlete_risk_scores')
        .select('*, athletes(first_name, last_name, phone, consent_whatsapp_at, tags)')
        .eq('org_id', orgId!)
        .eq('computed_on', (ultima as { computed_on: string }).computed_on)
        .order('score', { ascending: false })
        .limit(200);

      if (bandas && bandas.length > 0) consulta = consulta.in('band', bandas);

      const { data, error } = await consulta;
      if (error) throw error;
      return {
        fecha: (ultima as { computed_on: string }).computed_on,
        lista: (data ?? []) as unknown as RiesgoAtleta[],
      };
    },
  });
}

/** Lo que ya se le escribió a un atleta, para no repetirse al escribirle a mano. */
export function useUltimosMensajesDe(orgId: string | undefined, athleteId: string | undefined) {
  return useQuery({
    queryKey: ['outbox-athlete', orgId, athleteId],
    enabled: Boolean(orgId && athleteId),
    queryFn: async (): Promise<MensajeEnBitacora[]> => {
      const { data, error } = await supabase
        .from('message_outbox')
        .select('*, athletes(first_name, last_name)')
        .eq('org_id', orgId!)
        .eq('athlete_id', athleteId!)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as MensajeEnBitacora[];
    },
  });
}
