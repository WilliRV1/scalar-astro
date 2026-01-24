-- Ensure athletes table exists
create table if not exists athletes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  avatar_url text,
  payment_status text default 'pending',
  cut_day text,
  snatch_rm text,
  clean_rm text,
  access_code text
);

-- Create workout_logs table if it doesn't exist
create table if not exists workout_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  athlete_id uuid references athletes(id) on delete cascade not null,
  energy int,
  rpe int,
  notes text,
  date text -- Using text for simple ISO date storage, or use timestamp
);
