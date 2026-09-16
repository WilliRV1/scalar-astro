-- =============================================================================
-- 0002 · Atletas
-- =============================================================================
-- Los datos sensibles (lesiones, notas médicas) y las notas privadas del coach
-- viven en tablas aparte. Motivo: RLS es por fila, no por columna. Si estuvieran
-- en `athletes`, o el atleta ve las notas privadas del coach, o no puede ver su
-- propia ficha. Separarlas también cumple lo de docs/07-legal-colombia.md:
-- dato sensible = tabla aparte, RLS más estricta, acceso auditable.
-- =============================================================================

create table public.athletes (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  first_name        text not null,
  last_name         text,
  document_id       text,
  birth_date        date,
  gender            text,
  -- Teléfono en E.164 (+573001234567). Es la llave del canal de WhatsApp, así
  -- que el formato se valida aquí y no se confía en el formulario.
  phone             text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email             text,
  avatar_url        text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  -- Comercial
  referral_source   text,
  referred_by_athlete_id uuid references public.athletes(id) on delete set null,
  joined_on         date not null default current_date,
  status            text not null default 'active'
                    check (status in ('lead','trial','active','frozen','overdue','churned')),
  churned_on        date,
  churn_reason      text,
  tags              text[] not null default '{}',
  -- Consentimientos: fecha = evidencia. Ver docs/07-legal-colombia.md
  consent_data_at     timestamptz,
  consent_whatsapp_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index athletes_org_status_idx on public.athletes (org_id, status)
  where deleted_at is null;
create index athletes_org_phone_idx on public.athletes (org_id, phone);
create unique index athletes_org_document_idx on public.athletes (org_id, document_id)
  where document_id is not null and deleted_at is null;

create trigger athletes_touch
  before update on public.athletes
  for each row execute function public.touch_updated_at();

-- Cierra la dependencia circular con memberships
alter table public.memberships
  add constraint memberships_athlete_fk
  foreign key (athlete_id) references public.athletes(id) on delete set null;

-- El atleta vinculado debe pertenecer al mismo box que la membresía.
create or replace function public.check_membership_athlete_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.athlete_id is not null then
    if not exists (
      select 1 from public.athletes a
      where a.id = new.athlete_id and a.org_id = new.org_id
    ) then
      raise exception 'El atleta % no pertenece al box %', new.athlete_id, new.org_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger memberships_athlete_org_check
  before insert or update on public.memberships
  for each row execute function public.check_membership_athlete_org();

-- -----------------------------------------------------------------------------
-- Salud: el atleta SÍ puede ver lo suyo (es su dato). Dato sensible.
-- -----------------------------------------------------------------------------
create table public.athlete_health (
  athlete_id        uuid primary key references public.athletes(id) on delete cascade,
  org_id            uuid not null references public.organizations(id) on delete cascade,
  injuries          text,
  medical_notes     text,
  -- Autorización separada y explícita, revocable. Ver docs/07.
  consent_health_at timestamptz,
  updated_at        timestamptz not null default now()
);
create index athlete_health_org_idx on public.athlete_health (org_id);

create trigger athlete_health_touch
  before update on public.athlete_health
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Notas del coach: privadas del staff. El atleta NUNCA las ve.
-- -----------------------------------------------------------------------------
create table public.athlete_coach_notes (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  notes      text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index athlete_coach_notes_org_idx on public.athlete_coach_notes (org_id);

create trigger athlete_coach_notes_touch
  before update on public.athlete_coach_notes
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.athletes            enable row level security;
alter table public.athlete_health      enable row level security;
alter table public.athlete_coach_notes enable row level security;

create policy "staff lee atletas de su box"
  on public.athletes for select
  to authenticated
  using (public.is_staff(org_id));

create policy "staff gestiona atletas de su box"
  on public.athletes for all
  to authenticated
  using (public.is_staff(org_id))
  with check (public.is_staff(org_id));

create policy "el atleta se lee a sí mismo"
  on public.athletes for select
  to authenticated
  using (id = public.current_athlete_id(org_id));

create policy "staff gestiona la salud del atleta"
  on public.athlete_health for all
  to authenticated
  using (public.is_staff(org_id))
  with check (public.is_staff(org_id));

create policy "el atleta ve su propia salud"
  on public.athlete_health for select
  to authenticated
  using (athlete_id = public.current_athlete_id(org_id));

create policy "solo el staff toca las notas del coach"
  on public.athlete_coach_notes for all
  to authenticated
  using (public.is_staff(org_id))
  with check (public.is_staff(org_id));
