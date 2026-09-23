-- =============================================================================
-- Semilla de desarrollo
-- =============================================================================
-- Lo que se carga es el box de demostración completo: ~40 atletas con un año de
-- historia, cobros, mora, asistencia, WODs, reservas y gastos. Vive en
-- `seed_demo.sql` para poder aplicarlo también sobre un proyecto de Supabase
-- real sin arrastrar nada de desarrollo:
--
--   ./scripts/setup-demo.sh                 (migraciones + semilla)
--   psql "$SUPABASE_DB_URL" -f supabase/seed_demo.sql
--
-- `\ir` es una instrucción de psql, no SQL. Funciona con `supabase db reset` y
-- con `psql -f`, pero NO en el editor SQL del panel de Supabase: allá se pega
-- el contenido de `seed_demo.sql` directamente.
-- =============================================================================

\ir seed_demo.sql

-- -----------------------------------------------------------------------------
-- El segundo box, a propósito
-- -----------------------------------------------------------------------------
-- No tiene usuarios ni sirve para la demostración: está para que cualquier fuga
-- de aislamiento se vea a simple vista. Si Zulma Delgado aparece alguna vez en
-- una pantalla del Box La Ladera, hay un bug de RLS y no hace falta ni abrir una
-- prueba para saberlo.
-- -----------------------------------------------------------------------------
insert into public.organizations (id, slug, name, city, status, plan_tier) values
  ('0e000000-0000-4000-8000-000000000002', 'otro-box', 'Otro Box', 'Palmira', 'trial', 'trial')
on conflict (id) do nothing;

insert into public.athletes (id, org_id, first_name, last_name, phone, status, joined_on, referral_source) values
  ('a0000000-0000-4000-8000-000000000009', '0e000000-0000-4000-8000-000000000002',
   'Zulma', 'Delgado', '+573009998877', 'active', current_date - 30, 'Instagram')
on conflict (id) do nothing;
