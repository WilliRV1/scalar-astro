import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { BlockDraft, Result, Scale, Wod, WodBlock } from './types';

interface WodKey {
  orgId: string;
  date: string;
}

function invalidarWod(qc: ReturnType<typeof useQueryClient>, orgId: string, date?: string) {
  void qc.invalidateQueries({ queryKey: ['wods', orgId] });
  void qc.invalidateQueries({ queryKey: ['wod', orgId, date] });
}

/** Crea el WOD del día si no existe; si existe, actualiza título y notas. */
export function useSaveWod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orgId,
      date,
      wodId,
      title,
      notes,
    }: WodKey & { wodId?: string; title: string; notes: string }): Promise<Wod> => {
      const fila = { title: title.trim() || null, notes: notes.trim() || null };

      if (wodId) {
        const { data, error } = await supabase
          .from('wods').update(fila).eq('id', wodId).select().single();
        if (error) throw error;
        return data as Wod;
      }

      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('wods')
        .insert({ ...fila, org_id: orgId, date, created_by: user.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as Wod;
    },
    onSuccess: (_d, v) => invalidarWod(qc, v.orgId, v.date),
  });
}

/**
 * Publicar / despublicar.
 *
 * Es el interruptor que decide si el atleta ve el WOD: mientras `published_at`
 * sea null, la RLS se lo esconde. Por eso es un botón aparte y bien visible, y
 * no una casilla perdida dentro del formulario.
 */
export function useTogglePublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wodId, publish }: WodKey & { wodId: string; publish: boolean }) => {
      const { error } = await supabase
        .from('wods')
        .update({ published_at: publish ? new Date().toISOString() : null })
        .eq('id', wodId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidarWod(qc, v.orgId, v.date),
  });
}

/**
 * Guarda los bloques de un WOD de un solo golpe: inserta los nuevos, actualiza
 * los que cambiaron y borra los que el coach quitó.
 *
 * Se manda la lista completa y no un diff por bloque porque reordenar cambia la
 * posición de TODOS: mandarlo bloque por bloque desde un celular con mala señal
 * deja el WOD a medio reordenar.
 */
export function useSaveBlocks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orgId,
      wodId,
      blocks,
      removedIds,
    }: WodKey & { wodId: string; blocks: BlockDraft[]; removedIds: string[] }) => {
      if (removedIds.length > 0) {
        const { error } = await supabase.from('wod_blocks').delete().in('id', removedIds);
        if (error) throw error;
      }

      const filas = blocks.map((b, i) => ({
        ...(b.id ? { id: b.id } : {}),
        org_id: orgId,
        wod_id: wodId,
        position: i,
        kind: b.kind,
        title: b.title.trim() || null,
        description: b.description,
        score_type: b.score_type,
        time_cap_sec: b.time_cap_sec,
        scaling: b.scaling,
        movement_id: b.movement_id,
      }));

      if (filas.length > 0) {
        const { error } = await supabase.from('wod_blocks').upsert(filas);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => invalidarWod(qc, v.orgId, v.date),
  });
}

/**
 * Duplica un WOD en otra fecha, sin publicar.
 *
 * Es la función que más usa un coach: la programación de un box se repite cada
 * pocas semanas. Se copia como BORRADOR a propósito — copiar y publicar de una
 * es la forma de que salga a la calle un WOD con la fecha o la carga mal.
 */
export function useDuplicateWod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orgId,
      fromWodId,
      date,
    }: WodKey & { fromWodId: string }): Promise<Wod> => {
      const { data: origen, error: errOrigen } = await supabase
        .from('wods')
        .select('*, wod_blocks(*)')
        .eq('id', fromWodId)
        .single();
      if (errOrigen) throw errOrigen;

      const { wod_blocks, ...wod } = origen as Wod & { wod_blocks: WodBlock[] };
      const { data: user } = await supabase.auth.getUser();

      const { data: creado, error } = await supabase
        .from('wods')
        .insert({
          org_id: orgId,
          date,
          title: wod.title,
          notes: wod.notes,
          published_at: null,
          created_by: user.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      const bloques = [...(wod_blocks ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((b, i) => ({
          org_id: orgId,
          wod_id: (creado as Wod).id,
          position: i,
          kind: b.kind,
          title: b.title,
          description: b.description,
          score_type: b.score_type,
          time_cap_sec: b.time_cap_sec,
          scaling: b.scaling,
          movement_id: b.movement_id,
        }));

      if (bloques.length > 0) {
        const { error: errBloques } = await supabase.from('wod_blocks').insert(bloques);
        if (errBloques) throw errBloques;
      }

      return creado as Wod;
    },
    onSuccess: (_d, v) => invalidarWod(qc, v.orgId, v.date),
  });
}

export function useDeleteWod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wodId }: WodKey & { wodId: string }) => {
      const { error } = await supabase.from('wods').delete().eq('id', wodId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidarWod(qc, v.orgId, v.date),
  });
}

export interface SaveResultArgs {
  orgId: string;
  wodId: string;
  blockId: string;
  athleteId: string;
  resultId?: string;
  value: number | null;
  display: string;
  scale: Scale;
  notes: string;
  rpe: number | null;
  energy: number | null;
  loggedBy: 'athlete' | 'coach';
}

/**
 * Registra o corrige un resultado.
 *
 * El único (wod_block_id, athlete_id) de la base es el que impide dos intentos
 * del mismo atleta en el mismo bloque, así que aquí se hace UPSERT sobre esas
 * dos columnas en vez de leer antes y escribir después (que es una carrera).
 *
 * Al guardar, el trigger `results_detecta_pr` decide solo si hay marca nueva:
 * la pantalla no calcula PRs, los consulta.
 */
export function useSaveResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveResultArgs): Promise<Result> => {
      const { data, error } = await supabase
        .from('results')
        .upsert(
          {
            org_id: args.orgId,
            wod_block_id: args.blockId,
            athlete_id: args.athleteId,
            value_numeric: args.value,
            display_value: args.display || null,
            scale: args.scale,
            notes: args.notes.trim() || null,
            rpe: args.rpe,
            energy: args.energy,
            logged_by: args.loggedBy,
          },
          { onConflict: 'wod_block_id,athlete_id' },
        )
        .select()
        .single();
      if (error) throw error;
      return data as Result;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['leaderboard', v.wodId] });
      void qc.invalidateQueries({ queryKey: ['mis-resultados', v.athleteId] });
      // El trigger pudo haber creado una marca nueva.
      void qc.invalidateQueries({ queryKey: ['records', v.athleteId] });
    },
  });
}
