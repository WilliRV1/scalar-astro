import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { DefinicionCampo, TipoCampo, ValoresCampos } from './types';

/**
 * Escrituras de los campos personalizados.
 *
 * Todas comprueban el error y lo propagan. Un `await` sin `if (error) throw` es
 * una pérdida de datos esperando a ocurrir: el prototipo insertaba en una tabla
 * inexistente sin mirar el resultado y perdió todas las marcas durante meses.
 *
 * Los mensajes que levanta la base vienen redactados en español y explican qué
 * pasó ("La clave de un campo no se puede cambiar…", "Este box ya tiene 30
 * campos…"). Se muestran tal cual: taparlos con un "algo salió mal" sería
 * quitarle al dueño la única pista que tiene.
 */

interface GuardarCampoArgs {
  orgId: string;
  /** Sin id = campo nuevo. */
  defId?: string;
  key: string;
  label: string;
  fieldType: TipoCampo;
  options: string[];
  isRequired: boolean;
  isSensitive: boolean;
  helpText: string | null;
  sortOrder: number;
}

/**
 * Crea o actualiza una definición.
 *
 * Al actualizar NO se manda `key` ni `field_type`: los dos son inmutables y la
 * base rechaza el cambio. Mandarlos iguales funcionaría, pero dejarlos fuera
 * hace evidente en el código que ahí no se toca.
 */
export function useSaveFieldDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: GuardarCampoArgs): Promise<DefinicionCampo> => {
      const comun = {
        label: args.label.trim(),
        options: args.options,
        is_required: args.isRequired,
        is_sensitive: args.isSensitive,
        help_text: args.helpText?.trim() || null,
        sort_order: args.sortOrder,
      };

      if (args.defId) {
        const { data, error } = await supabase
          .from('custom_field_defs')
          .update(comun)
          .eq('id', args.defId)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as DefinicionCampo;
      }

      const { data, error } = await supabase
        .from('custom_field_defs')
        .insert({
          org_id: args.orgId,
          key: args.key,
          field_type: args.fieldType,
          ...comun,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as DefinicionCampo;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['custom-field-defs', vars.orgId] });
    },
  });
}

/**
 * Activa o desactiva un campo.
 *
 * Desactivar es lo que hay que hacer en vez de borrar: los valores de los
 * atletas se conservan enteros y vuelven a verse el día que se reactive. La
 * base lo garantiza; esto solo mueve el interruptor.
 */
export function useToggleFieldDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ defId, isActive }: { orgId: string; defId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('custom_field_defs')
        .update({ is_active: isActive })
        .eq('id', defId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['custom-field-defs', vars.orgId] });
    },
  });
}

/**
 * Reordena: recibe los ids en el orden nuevo y les asigna 1, 2, 3…
 *
 * Se hace una escritura por campo y se corta en la primera que falle. No es
 * atómico —quedaría un orden a medias, que es feo pero inofensivo— y no vale
 * la pena una función en la base para algo que solo cambia cómo se ven.
 */
export function useReorderFieldDefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids }: { orgId: string; ids: string[] }) => {
      for (let i = 0; i < ids.length; i += 1) {
        const { error } = await supabase
          .from('custom_field_defs')
          .update({ sort_order: i + 1 })
          .eq('id', ids[i]);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['custom-field-defs', vars.orgId] });
    },
  });
}

/**
 * Borra una definición.
 *
 * Solo funciona si NINGÚN atleta tiene un valor guardado para ese campo; si lo
 * tiene, la base lo impide y manda desactivarlo. Es decir: esto sirve para
 * deshacer un campo recién creado por error, no para "limpiar" la ficha.
 */
export function useDeleteFieldDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ defId }: { orgId: string; defId: string }) => {
      const { error } = await supabase.from('custom_field_defs').delete().eq('id', defId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['custom-field-defs', vars.orgId] });
    },
  });
}

/**
 * Guarda los valores SENSIBLES de un atleta en su tabla aparte.
 *
 * Se usa `upsert` sobre la clave primaria (athlete_id): el atleta puede no
 * tener todavía fila. Los valores normales NO van aquí: la base rechaza mezclar
 * los dos almacenes, en las dos direcciones.
 */
export function useSaveAthleteSensitiveCustom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orgId, athleteId, custom,
    }: { orgId: string; athleteId: string; custom: ValoresCampos }) => {
      const { error } = await supabase
        .from('athlete_custom_sensitive')
        .upsert({ athlete_id: athleteId, org_id: orgId, custom }, { onConflict: 'athlete_id' });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({
        queryKey: ['athlete-custom-sensitive', vars.orgId, vars.athleteId],
      });
    },
  });
}
