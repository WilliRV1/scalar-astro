import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type { Attendance } from '../wods/types';

interface ToggleArgs {
  orgId: string;
  athleteId: string;
  date: string;
  /** La fila que ya existe, si el atleta estaba marcado. */
  existing: Attendance | null;
}

/**
 * Check-in de un toque.
 *
 * Toca una vez: marcado. Toca otra vez: se deshace. No hay confirmación de por
 * medio a propósito — esto se usa con una mano, con el celular en la otra y
 * veinte personas entrando al box. Equivocarse cuesta otro toque.
 *
 * La segunda marca del mismo día la impide el único
 * `(org_id, athlete_id, date)` de la base; aquí solo se evita la ida al
 * servidor cuando ya sabemos que existe.
 */
export function useToggleAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, athleteId, date, existing }: ToggleArgs) => {
      if (existing) {
        const { error } = await supabase.from('attendances').delete().eq('id', existing.id);
        if (error) throw error;
        return;
      }

      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from('attendances').insert({
        org_id: orgId,
        athlete_id: athleteId,
        date,
        status: 'attended',
        checked_in_by: user.user?.id ?? null,
      });
      if (error) {
        // Dos coaches marcando a la vez, o una lista vieja: la fila ya existe.
        // Se dice en español y se refresca la lista para que se vea marcado.
        if (error.code === '23505' || /duplicate key/i.test(error.message)) {
          void qc.invalidateQueries({ queryKey: ['asistencia', orgId, date] });
          throw new Error('Ya estaba marcado hoy. La lista se acaba de actualizar.');
        }
        throw error;
      }
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['asistencia', v.orgId, v.date] });
    },
  });
}
