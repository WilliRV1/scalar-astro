-- Run this if you are using a real Supabase instance and your changes aren't saving.
-- This disables Row Level Security (RLS) for the athletes table, allowing any entry to be updated without authentication.

ALTER TABLE athletes DISABLE ROW LEVEL SECURITY;
