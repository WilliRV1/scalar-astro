-- Migration: Add new athlete fields
-- Run this in Supabase SQL Editor to add new columns without losing existing data.

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS referral_source text;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS back_squat text;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS bench_press text;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS deadlift text;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS shoulder_press text;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS front_squat text;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS push_press text;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS karen text;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS burpees_100 text;
