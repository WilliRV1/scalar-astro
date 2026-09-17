/**
 * Tipos del módulo de entrenamiento.
 *
 * Viven aquí y no en src/types/database.ts a propósito: son los de la migración
 * 20260918100000_wods.sql y se mueven con ella.
 */

export type BlockKind = 'warmup' | 'strength' | 'metcon' | 'accessory' | 'cooldown';
export type ScoreType = 'for_time' | 'amrap' | 'emom' | 'load' | 'not_scored';
export type Scale = 'rx' | 'scaled' | 'beginner';
export type AttendanceStatus = 'reserved' | 'attended' | 'no_show' | 'cancelled';

/** Las tres columnas de escala que el coach escribe en el bloque. */
export interface Scaling {
  rx?: string;
  scaled?: string;
  beginner?: string;
}

export interface Wod {
  id: string;
  org_id: string;
  /** Fecha calendario en formato AAAA-MM-DD. */
  date: string;
  title: string | null;
  notes: string | null;
  /** null = borrador. El atleta no lo ve. */
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WodBlock {
  id: string;
  org_id: string;
  wod_id: string;
  position: number;
  kind: BlockKind;
  title: string | null;
  description: string;
  score_type: ScoreType | null;
  time_cap_sec: number | null;
  scaling: Scaling;
  movement_id: string | null;
  created_at: string;
}

/** Un WOD con sus bloques ya ordenados por posición. */
export interface WodWithBlocks extends Wod {
  blocks: WodBlock[];
}

export interface Result {
  id: string;
  org_id: string;
  wod_block_id: string;
  athlete_id: string;
  value_numeric: number | null;
  display_value: string | null;
  scale: Scale;
  notes: string | null;
  rpe: number | null;
  energy: number | null;
  logged_by: 'athlete' | 'coach';
  created_at: string;
  updated_at: string;
}

/** Una fila de public.leaderboard(p_wod_id). */
export interface LeaderboardRow {
  block_id: string;
  block_position: number;
  block_title: string;
  score_type: ScoreType | null;
  result_id: string;
  athlete_id: string;
  athlete_name: string;
  value_numeric: number | null;
  display_value: string | null;
  scale: Scale;
  rpe: number | null;
  rank_overall: number;
  rank_in_scale: number;
}

export interface Attendance {
  id: string;
  org_id: string;
  athlete_id: string;
  date: string;
  status: AttendanceStatus;
  checked_in_at: string;
  checked_in_by: string | null;
  created_at: string;
}

/** Lo que el editor manda a la base para crear o actualizar un bloque. */
export interface BlockDraft {
  /** Sin id = bloque nuevo, todavía sin guardar. */
  id?: string;
  position: number;
  kind: BlockKind;
  title: string;
  description: string;
  score_type: ScoreType;
  time_cap_sec: number | null;
  scaling: Scaling;
  movement_id: string | null;
}
