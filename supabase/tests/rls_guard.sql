-- Prueba de seguridad: se ejecuta en CI contra la base ya migrada.
-- Falla (exit code distinto de 0) si alguna tabla de `public` quedó sin RLS
-- o si alguna tabla con RLS se quedó sin una sola política, que en la práctica
-- la vuelve invisible y suele indicar un descuido.

select public.assert_rls_enabled();

do $$
declare
  sin_politicas text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into sin_politicas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity
    and c.relname <> 'job_runs'  -- intencionalmente sin políticas: solo service_role
    and not exists (
      select 1 from pg_policy p where p.polrelid = c.oid
    );

  if sin_politicas is not null then
    raise exception 'Tablas con RLS pero sin ninguna política: %', sin_politicas;
  end if;
end $$;

select 'RLS OK' as resultado;
