import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { BookResult, CancelResult, ClassTemplate, Weekday } from './types';

/**
 * Escrituras del módulo de reservas.
 *
 * Reservar, cancelar, cerrar y hacer check-in NO son `insert`/`update`: son
 * llamadas a funciones de la base. El cupo no se puede validar con un `with
 * check` —hay que contar bajo un candado— así que el atleta ni siquiera tiene
 * política de `insert` sobre `reservations`. Intentarlo desde aquí devolvería
 * "new row violates row-level security policy".
 *
 * Los mensajes de error de esas funciones vienen redactados en español y se le
 * muestran al usuario tal cual: "Ya cerró la reserva para esa clase", "Tienes
 * una mensualidad vencida desde el 05/09/2026". Taparlos con un "algo salió
 * mal" es perder justo la información por la que se escribieron.
 */

function refrescar(qc: ReturnType<typeof useQueryClient>, orgId: string) {
  void qc.invalidateQueries({ queryKey: ['clases', orgId] });
  void qc.invalidateQueries({ queryKey: ['mis-reservas', orgId] });
  void qc.invalidateQueries({ queryKey: ['lista-clase', orgId] });
  void qc.invalidateQueries({ queryKey: ['puedo-reservar', orgId] });
}

interface ReservarArgs {
  orgId: string;
  classId: string;
  /** null = yo mismo. El staff puede reservar a nombre de un atleta. */
  athleteId?: string | null;
  /** Solo staff: saltarse mora, congelamiento o bono agotado. */
  forzar?: boolean;
}

export function useBookClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ classId, athleteId, forzar }: ReservarArgs): Promise<BookResult> => {
      const { data, error } = await supabase.rpc('book_class', {
        p_class_id: classId,
        p_athlete_id: athleteId ?? null,
        p_source: athleteId ? 'staff' : 'app',
        p_force: forzar ?? false,
      });
      if (error) throw error;
      const fila = (data as BookResult[] | null)?.[0];
      if (!fila) throw new Error('La reserva no devolvió resultado.');
      return fila;
    },
    onSuccess: (_d, v) => refrescar(qc, v.orgId),
  });
}

export function useCancelReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reservationId,
    }: {
      orgId: string;
      reservationId: string;
    }): Promise<CancelResult> => {
      const { data, error } = await supabase.rpc('cancel_reservation', {
        p_reservation_id: reservationId,
      });
      if (error) throw error;
      const fila = (data as CancelResult[] | null)?.[0];
      if (!fila) throw new Error('La cancelación no devolvió resultado.');
      return fila;
    },
    onSuccess: (_d, v) => refrescar(qc, v.orgId),
  });
}

/** Cancelar la clase entera: avisa a todos y devuelve los créditos. */
export function useCancelClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ classId, motivo }: { orgId: string; classId: string; motivo: string }) => {
      const { error } = await supabase.rpc('cancel_class', {
        p_class_id: classId,
        p_reason: motivo,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => refrescar(qc, v.orgId),
  });
}

/** Check-in de un toque. `presente: false` lo deshace. */
export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      classId,
      athleteId,
      presente,
    }: {
      orgId: string;
      classId: string;
      athleteId: string;
      presente: boolean;
    }) => {
      const { error } = await supabase.rpc('check_in', {
        p_class_id: classId,
        p_athlete_id: athleteId,
        p_present: presente,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => refrescar(qc, v.orgId),
  });
}

/** Cerrar la clase: lo que quedó reservado y no llegó pasa a falta. */
export function useCloseClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ classId }: { orgId: string; classId: string }) => {
      const { error } = await supabase.rpc('close_class', { p_class_id: classId });
      if (error) throw error;
    },
    onSuccess: (_d, v) => refrescar(qc, v.orgId),
  });
}

export interface PlantillaForm {
  id?: string;
  name: string;
  weekday: Weekday;
  start_time: string;
  duration_min: number;
  capacity: number;
  coach_id: string | null;
  is_active: boolean;
}

/** Alta o edición de una franja de la parrilla semanal. */
export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orgId,
      plantilla,
    }: {
      orgId: string;
      plantilla: PlantillaForm;
    }): Promise<ClassTemplate> => {
      const fila = {
        org_id: orgId,
        name: plantilla.name,
        weekday: plantilla.weekday,
        start_time: plantilla.start_time,
        duration_min: plantilla.duration_min,
        capacity: plantilla.capacity,
        coach_id: plantilla.coach_id,
        is_active: plantilla.is_active,
      };
      const q = plantilla.id
        ? supabase.from('class_templates').update(fila).eq('id', plantilla.id).select().single()
        : supabase.from('class_templates').insert(fila).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return data as ClassTemplate;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['parrilla', v.orgId] });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId }: { orgId: string; templateId: string }) => {
      // Se desactiva, no se borra: las clases ya generadas apuntan a ella y el
      // historial de quién entrenó cuándo no se tira por cambiar el horario.
      const { error } = await supabase
        .from('class_templates')
        .update({ is_active: false })
        .eq('id', templateId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['parrilla', v.orgId] });
    },
  });
}

/** Ajustar una clase suelta: cupo o coach de ese día, sin tocar la parrilla. */
export function useUpdateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      classId,
      cambios,
    }: {
      orgId: string;
      classId: string;
      cambios: { capacity?: number; coach_id?: string | null };
    }) => {
      const { error } = await supabase.from('classes').update(cambios).eq('id', classId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => refrescar(qc, v.orgId),
  });
}
