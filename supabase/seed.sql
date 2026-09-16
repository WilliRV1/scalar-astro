-- =============================================================================
-- Semilla de desarrollo: dos boxes con datos realistas.
-- =============================================================================
-- Se aplica sola con `supabase db reset`. Son DOS boxes a propósito: trabajar
-- siempre con dos es la única forma de notar de inmediato si una consulta se
-- escapa del aislamiento.
--
-- Usuarios (contraseña de todos: `scalar123`):
--   dueno@boxdemo.co     owner  del Box Demo
--   coach@boxdemo.co     coach  del Box Demo (SIN acceso financiero)
--   dueno@otrobox.co     owner  del Otro Box
-- El atleta entra con OTP al celular, así que no lleva contraseña.
-- =============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'dueno@boxdemo.co', crypt('scalar123', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'coach@boxdemo.co', crypt('scalar123', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'dueno@otrobox.co', crypt('scalar123', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

-- ------------------------------------------------------------------ boxes ---
insert into public.organizations (id, slug, name, city, status, plan_tier) values
  ('0e000000-0000-4000-8000-000000000001', 'box-demo', 'Box Demo', 'Cali', 'active', 'box'),
  ('0e000000-0000-4000-8000-000000000002', 'otro-box', 'Otro Box', 'Cali', 'trial', 'trial')
on conflict (id) do nothing;

-- -------------------------------------------------------------- atletas -----
insert into public.athletes (id, org_id, first_name, last_name, phone, status, joined_on, referral_source) values
  ('a0000000-0000-4000-8000-000000000001', '0e000000-0000-4000-8000-000000000001', 'Ana',   'Restrepo', '+573001110001', 'active',  current_date - 400, 'Instagram'),
  ('a0000000-0000-4000-8000-000000000002', '0e000000-0000-4000-8000-000000000001', 'Brayan','Lozano',   '+573001110002', 'overdue', current_date - 120, 'Referido'),
  ('a0000000-0000-4000-8000-000000000003', '0e000000-0000-4000-8000-000000000001', 'Carolina','Mejía',  '+573001110003', 'active',  current_date - 45,  'Pasó por el frente'),
  ('a0000000-0000-4000-8000-000000000004', '0e000000-0000-4000-8000-000000000001', 'Daniel','Ocampo',   '+573001110004', 'frozen',  current_date - 600, 'Google'),
  -- El atleta del otro box: si alguna vez aparece en el Box Demo, hay un bug de aislamiento.
  ('a0000000-0000-4000-8000-000000000009', '0e000000-0000-4000-8000-000000000002', 'Zulma','Delgado',   '+573002220001', 'active',  current_date - 30,  'Instagram')
on conflict (id) do nothing;

-- ----------------------------------------------------------- membresías -----
insert into public.memberships (org_id, user_id, role, permissions, athlete_id) values
  ('0e000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'owner', '{}', null),
  ('0e000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'coach', '{}', null),
  ('0e000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'owner', '{}', null)
on conflict (org_id, user_id) do nothing;

-- --------------------------------------------------------------- planes -----
insert into public.plans (id, org_id, name, price_cents, billing_period) values
  ('91a00000-0000-4000-8000-000000000001', '0e000000-0000-4000-8000-000000000001', 'Mensualidad ilimitada', 18000000, 'monthly'),
  ('91a00000-0000-4000-8000-000000000002', '0e000000-0000-4000-8000-000000000001', 'Bono 8 clases',        13000000, 'one_off')
on conflict (id) do nothing;

-- --------------------------------------------------------- suscripciones -----
insert into public.subscriptions (id, org_id, athlete_id, plan_id, price_cents, billing_day, started_on) values
  ('5b000000-0000-4000-8000-000000000001', '0e000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '91a00000-0000-4000-8000-000000000001', 18000000, 5,  current_date - 400),
  ('5b000000-0000-4000-8000-000000000002', '0e000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '91a00000-0000-4000-8000-000000000001', 18000000, 15, current_date - 120),
  ('5b000000-0000-4000-8000-000000000003', '0e000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', '91a00000-0000-4000-8000-000000000001', 18000000, 1,  current_date - 45)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- cobros -----
-- Uno vencido hace días (Brayan), uno por vencer (Carolina), uno pagado (Ana).
insert into public.invoices (id, org_id, athlete_id, subscription_id, number, period_start, period_end, issued_on, due_on, amount_cents) values
  ('c0b00000-0000-4000-8000-000000000001', '0e000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000002', 'F-0001', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, current_date - 14, current_date - 11, 18000000),
  ('c0b00000-0000-4000-8000-000000000002', '0e000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', '5b000000-0000-4000-8000-000000000003', 'F-0002', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, current_date - 1,  current_date + 3,  18000000),
  ('c0b00000-0000-4000-8000-000000000003', '0e000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', 'F-0003', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, current_date - 10, current_date - 7,  18000000)
on conflict (id) do nothing;

-- El pago dispara el trigger que salda la factura de Ana automáticamente.
insert into public.payments (org_id, athlete_id, invoice_id, amount_cents, method, paid_at) values
  ('0e000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'c0b00000-0000-4000-8000-000000000003', 18000000, 'nequi', now() - interval '6 days')
on conflict do nothing;
