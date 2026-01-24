-- NUCLEAR OPTION: Reset the table completely to ensure ALL columns exist.
-- Run this in Supabase SQL Editor.

DROP TABLE IF EXISTS workout_logs;

CREATE TABLE workout_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  athlete_id uuid references athletes(id) on delete cascade not null,
  energy int,
  rpe int,
  notes text,
  date text -- Stores the ISO date string
);

-- Turn off Row Level Security (RLS) for now to ensure we can read/write without policies
ALTER TABLE workout_logs DISABLE ROW LEVEL SECURITY;
