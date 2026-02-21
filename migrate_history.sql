-- Create table for tracking PR and benchmark evolution
create table if not exists athlete_progress (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  athlete_id uuid references athletes(id) on delete cascade not null,
  field_name text not null, -- e.g., 'back_squat', 'deadlift', 'karen'
  value text not null
);

-- Enable access (disable RLS for simplicity in this MVP, matching previous tables)
alter table athlete_progress disable row level security;
