import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { Athlete } from '../../types/database';
import type { AthleteInput } from './schema';

interface SaveArgs {
  orgId: string;
  athleteId?: string;
  input: AthleteInput;
}

function toRow(orgId: string, input: AthleteInput) {
  const { consent_whatsapp, ...rest } = input;
  return {
    ...rest,
    org_id: orgId,
    joined_on: input.joined_on || undefined,
    // La fecha del consentimiento ES la evidencia. Si se marca, se sella ahora;
    // si se desmarca, se borra: el atleta retiró su autorización.
    consent_whatsapp_at: consent_whatsapp ? new Date().toISOString() : null,
  };
}

export function useSaveAthlete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, athleteId, input }: SaveArgs): Promise<Athlete> => {
      const row = toRow(orgId, input);

      if (athleteId) {
        const { data, error } = await supabase
          .from('athletes').update(row).eq('id', athleteId).select().single();
        if (error) throw error;
        return data as Athlete;
      }

      const { data, error } = await supabase
        .from('athletes').insert(row).select().single();
      if (error) throw error;
      return data as Athlete;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['athletes', vars.orgId] });
      void qc.invalidateQueries({ queryKey: ['athlete', vars.athleteId] });
    },
  });
}

/**
 * Borrado lógico. Un atleta que se va se marca, no se elimina: sus pagos y su
 * historial siguen contando para los reportes del box, y si vuelve en tres
 * meses —que es lo normal— recupera sus marcas.
 */
export function useArchiveAthlete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ athleteId, reason }: { orgId: string; athleteId: string; reason?: string }) => {
      const { error } = await supabase
        .from('athletes')
        .update({
          status: 'churned',
          churned_on: new Date().toISOString().slice(0, 10),
          churn_reason: reason ?? null,
        })
        .eq('id', athleteId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['athletes', vars.orgId] });
    },
  });
}
