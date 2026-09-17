import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';
import type {
  BookingStatus,
  ClassRow,
  ClassTemplate,
  ReservationRow,
  ReservationSettings,
  RosterRow,
} from './types';

/**
 * Lecturas del módulo de reservas.
 *
 * El `.eq('org_id', …)` de cada consulta no es lo que aísla los boxes —eso lo
 * hace la RLS— sino lo que aprovecha los índices que empiezan por `org_id`.
 */

export const claveClases = (orgId: string | undefined, desde: string, hasta: string) =>
  ['clases', orgId, desde, hasta] as const;

/** Las clases de un rango de fechas. `desde`/`hasta` son ISO con zona. */
export function useClasses(orgId: string | undefined, desde: string, hasta: string) {
  return useQuery({
    queryKey: claveClases(orgId, desde, hasta),
    enabled: Boolean(orgId),
    // El cupo cambia mientras el atleta mira la pantalla: si se queda pegado,
    // toca "Reservar" sobre una clase que ya se llenó y recibe un error en vez
    // de una lista de espera.
    refetchInterval: 30_000,
    queryFn: async (): Promise<ClassRow[]> => {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('org_id', orgId!)
        .gte('starts_at', desde)
        .lt('starts_at', hasta)
        .order('starts_at');
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });
}

/** Los ajustes de reserva del box: ventanas, lista de espera, no-show. */
export function useReservationSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: ['ajustes-reserva', orgId],
    enabled: Boolean(orgId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ReservationSettings | null> => {
      const { data, error } = await supabase
        .from('reservation_settings')
        .select('*')
        .eq('org_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ReservationSettings | null;
    },
  });
}

/** Mis reservas: las de un atleta concreto, de hoy en adelante o todas. */
export function useMyReservations(orgId: string | undefined, athleteId: string | undefined) {
  return useQuery({
    queryKey: ['mis-reservas', orgId, athleteId],
    enabled: Boolean(orgId) && Boolean(athleteId),
    queryFn: async (): Promise<ReservationRow[]> => {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('org_id', orgId!)
        .eq('athlete_id', athleteId!)
        .order('booked_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReservationRow[];
    },
  });
}

interface FilaConAtleta {
  athletes: { first_name: string; last_name: string | null; phone: string | null } | null;
  [k: string]: unknown;
}

/**
 * La lista de una clase, con nombre y celular.
 *
 * Solo la ve el staff: la política del atleta sobre `reservations` lo limita a
 * las suyas, así que si esto lo pidiera un atleta volvería con sus propias
 * filas y nada más. El guarda de ruta decide qué se pinta; esto decide a qué
 * se accede.
 */
export function useClassRoster(orgId: string | undefined, classId: string | undefined) {
  return useQuery({
    queryKey: ['lista-clase', orgId, classId],
    enabled: Boolean(orgId) && Boolean(classId),
    queryFn: async (): Promise<RosterRow[]> => {
      const { data, error } = await supabase
        .from('reservations')
        .select('*, athletes(first_name, last_name, phone)')
        .eq('org_id', orgId!)
        .eq('class_id', classId!)
        .order('waitlist_pos', { nullsFirst: true })
        .order('booked_at');
      if (error) throw error;
      return ((data ?? []) as FilaConAtleta[]).map((fila) => {
        const a = fila.athletes;
        const { athletes: _omitido, ...reserva } = fila;
        void _omitido;
        return {
          ...(reserva as unknown as RosterRow),
          athlete_name: a ? `${a.first_name} ${a.last_name ?? ''}`.trim() : 'Atleta',
          athlete_phone: a?.phone ?? null,
        };
      });
    },
  });
}

/** La parrilla semanal del box. */
export function useClassTemplates(orgId: string | undefined) {
  return useQuery({
    queryKey: ['parrilla', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ClassTemplate[]> => {
      const { data, error } = await supabase
        .from('class_templates')
        .select('*')
        .eq('org_id', orgId!)
        .order('weekday')
        .order('start_time');
      if (error) throw error;
      return (data ?? []) as ClassTemplate[];
    },
  });
}

/**
 * Por qué NO puedo reservar, si es que no puedo.
 *
 * Lo responde la base con la misma función que usa `book_class()`, para que la
 * pantalla no tenga que reimplementar las reglas de mora, congelamiento y bono
 * —y no pueda desalinearse de ellas.
 */
export function useMyBookingStatus(orgId: string | undefined) {
  return useQuery({
    queryKey: ['puedo-reservar', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<BookingStatus> => {
      const { data, error } = await supabase.rpc('my_booking_status', { p_org_id: orgId! });
      if (error) throw error;
      const fila = (data as BookingStatus[] | null)?.[0];
      return fila ?? { reason: null, credits_left: null };
    },
  });
}
