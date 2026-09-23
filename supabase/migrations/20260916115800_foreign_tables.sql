-- =============================================================================
-- 0000a · Convivir con otros proyectos en la misma base
-- =============================================================================
-- Este proyecto puede vivir en un Supabase donde ya hay tablas de OTRA cosa.
-- Dos problemas que eso causa, y que aquí se resuelven:
--
--   1. La guarda `assert_rls_enabled()` revisa todas las tablas de `public` y
--      aborta si alguna no tiene RLS. Sin esto, unas tablas ajenas sin RLS
--      impedirían aplicar CUALQUIER migración de Scalar.
--   2. Hay que poder decir "esta tabla no es mía" sin relajar la regla para las
--      propias.
--
-- La polaridad importa: **se revisa todo por defecto y se excluye lo ajeno de
-- forma explícita**. Al revés —una lista de lo propio— una tabla nueva de
-- Scalar que a alguien se le olvidara registrar quedaría sin vigilar, que es
-- justo el fallo que la guarda existe para impedir.
-- =============================================================================

create table if not exists public.scalar_foreign_tables (
  table_name text primary key,
  note       text,
  added_at   timestamptz not null default now()
);

comment on table public.scalar_foreign_tables is
  'Tablas de public que NO son de Scalar. La guarda de RLS las ignora. Registrar aquí solo lo que pertenece a otro proyecto.';

alter table public.scalar_foreign_tables enable row level security;

-- RLS activada y SIN políticas a propósito, igual que `job_runs`: nadie la lee
-- ni la escribe desde el navegador. Excluir una tabla de la guarda de seguridad
-- no puede ser un clic; es una operación deliberada con `service_role`.
