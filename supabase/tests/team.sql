-- =============================================================================
-- Prueba del equipo del box: invitaciones, permisos y el último dueño
-- =============================================================================
-- Dos cosas que no pueden fallar nunca:
--   · que el enlace de invitación, que se manda por WhatsApp y termina en un
--     grupo, no sirva para meter a quien no era;
--   · que nadie deje un box sin dueño.
-- Cualquier fallo levanta excepción y aborta con código distinto de 0.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- semilla ---
insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'dueno@boxequipo.co'),
  ('e1000000-0000-4000-8000-000000000002', 'admin@boxequipo.co'),
  ('e1000000-0000-4000-8000-000000000003', 'coach@boxequipo.co'),
  ('e1000000-0000-4000-8000-000000000004', 'coachfin@boxequipo.co'),
  ('e1000000-0000-4000-8000-000000000005', 'dueno@boxajeno.co'),
  ('e1000000-0000-4000-8000-000000000006', 'nuevo@coach.co'),
  ('e1000000-0000-4000-8000-000000000007', 'vencido@coach.co'),
  ('e1000000-0000-4000-8000-000000000008', 'intruso@coach.co'),
  ('e1000000-0000-4000-8000-000000000009', 'socio@boxequipo.co'),
  ('e1000000-0000-4000-8000-00000000000a', 'atleta@boxequipo.co');

insert into public.organizations (id, slug, name) values
  ('0e000000-0000-4000-8000-000000000001', 'box-equipo', 'Box Equipo'),
  ('0e000000-0000-4000-8000-000000000002', 'box-ajeno',  'Box Ajeno');

insert into public.athletes (id, org_id, first_name, last_name) values
  ('ae000000-0000-4000-8000-000000000001', '0e000000-0000-4000-8000-000000000001', 'Ana', 'Equipo');

insert into public.memberships (org_id, user_id, role, permissions, athlete_id) values
  ('0e000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'owner',   '{}', null),
  ('0e000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'admin',   '{}', null),
  ('0e000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'coach',   '{}', null),
  ('0e000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004', 'coach',   '{"can_view_finances": true}', null),
  ('0e000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-00000000000a', 'athlete', '{}', 'ae000000-0000-4000-8000-000000000001'),
  ('0e000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000005', 'owner',   '{}', null);

-- Un cobro para comprobar que el permiso financiero sigue funcionando.
insert into public.invoices (org_id, athlete_id, number, period_start, period_end, due_on, amount_cents) values
  ('0e000000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001',
   'F-0001', '2026-09-01', '2026-09-30', '2026-09-08', 18000000);

-- Invitaciones con token fijo para poder canjearlas en la prueba.
insert into public.invitations (org_id, email, role, permissions, token, expires_at, status, invited_by) values
  ('0e000000-0000-4000-8000-000000000001', 'nuevo@coach.co',   'coach', '{"can_view_finances": true}',
   'tok-vigente',  now() + interval '7 days', 'pending',  'e1000000-0000-4000-8000-000000000001'),
  ('0e000000-0000-4000-8000-000000000001', 'vencido@coach.co', 'coach', '{}',
   'tok-vencida',  now() - interval '1 day',  'pending',  'e1000000-0000-4000-8000-000000000001'),
  ('0e000000-0000-4000-8000-000000000001', 'intruso@coach.co', 'admin', '{}',
   'tok-revocada', now() + interval '7 days', 'revoked',  'e1000000-0000-4000-8000-000000000001');

create or replace function pg_temp.chk(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not cond then raise exception 'FALLO [%]', label; end if;
  raise notice '  ok · %', label;
end $$;

-- ============================ 1 · Quién puede invitar =======================
set session role authenticated;

set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000003';  -- coach del box
do $$
declare bloqueado boolean := false;
begin
  begin
    insert into public.invitations (org_id, email, role)
    values ('0e000000-0000-4000-8000-000000000001', 'amigo@coach.co', 'coach');
  exception when insufficient_privilege then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'un coach NO puede invitar a nadie');
  perform pg_temp.chk((select count(*) from public.invitations) = 0,
    'un coach ni siquiera ve las invitaciones de su box (el token es secreto)');
end $$;

set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000005';  -- dueño del Box Ajeno
do $$
declare bloqueado boolean := false;
begin
  begin
    insert into public.invitations (org_id, email, role)
    values ('0e000000-0000-4000-8000-000000000001', 'colado@coach.co', 'admin');
  exception when insufficient_privilege then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'un dueño NO puede invitar a un box que no es suyo');
  perform pg_temp.chk((select count(*) from public.invitations) = 0,
    'el dueño del otro box tampoco ve las invitaciones ajenas');
end $$;

set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000002';  -- administrador del box
do $$
declare inv public.invitations%rowtype;
begin
  insert into public.invitations (org_id, email, role, permissions)
  values ('0e000000-0000-4000-8000-000000000001', '  Sofia@Coach.CO ', 'coach',
          '{"can_edit_wods": true}')
  returning * into inv;

  perform pg_temp.chk(inv.email = 'sofia@coach.co',
    'el correo se normaliza a minúsculas y sin espacios al guardarlo');
  perform pg_temp.chk(length(inv.token) = 64 and inv.token ~ '^[0-9a-f]+$',
    'la invitación nace con un token aleatorio de 64 hex');
  perform pg_temp.chk(inv.status = 'pending' and inv.expires_at > now(),
    'la invitación nace pendiente y con vencimiento');
  perform pg_temp.chk(inv.invited_by = 'e1000000-0000-4000-8000-000000000002',
    'queda registrado quién invitó');
  perform pg_temp.chk((select count(*) from public.invitations) = 4,
    'el administrador sí ve las invitaciones de su box');
end $$;

-- ============================ 2 · Aceptar la invitación =====================
set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000008';  -- intruso@coach.co
do $$
declare bloqueado boolean := false;
begin
  begin
    perform public.accept_invitation('tok-vigente');   -- es para nuevo@coach.co
  exception when others then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado,
    'aceptar con un correo distinto al invitado falla');
end $$;

set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000007';  -- vencido@coach.co
do $$
declare bloqueado boolean := false;
begin
  begin
    perform public.accept_invitation('tok-vencida');
  exception when others then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'aceptar una invitación vencida falla');
end $$;

set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000008';  -- intruso@coach.co
do $$
declare bloqueado boolean := false;
begin
  begin
    perform public.accept_invitation('tok-revocada');
  exception when others then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'aceptar una invitación revocada falla');

  bloqueado := false;
  begin
    perform public.accept_invitation('token-que-no-existe');
  exception when others then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'un token inventado falla');
end $$;

reset role;
do $$ begin
  perform pg_temp.chk(
    (select count(*) from public.memberships
      where user_id in ('e1000000-0000-4000-8000-000000000007',
                        'e1000000-0000-4000-8000-000000000008')) = 0,
    'ningún intento fallido dejó membresía a medias');
end $$;
set session role authenticated;

set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000006';  -- nuevo@coach.co
do $$
declare m1 public.memberships%rowtype;
        m2 public.memberships%rowtype;
begin
  m1 := public.accept_invitation('tok-vigente');

  perform pg_temp.chk(m1.org_id = '0e000000-0000-4000-8000-000000000001'
                      and m1.role = 'coach' and m1.status = 'active',
    'aceptar crea la membresía con el rol de la invitación');
  perform pg_temp.chk((m1.permissions->>'can_view_finances')::boolean,
    'los permisos finos de la invitación viajan a la membresía');

  -- Idempotencia: el usuario toca el enlace dos veces, o se le va la señal.
  m2 := public.accept_invitation('tok-vigente');
  perform pg_temp.chk(m1.id = m2.id, 'aceptar dos veces devuelve la misma membresía');
end $$;

reset role;
do $$ begin
  perform pg_temp.chk(
    (select count(*) from public.memberships
      where org_id = '0e000000-0000-4000-8000-000000000001'
        and user_id = 'e1000000-0000-4000-8000-000000000006') = 1,
    'aceptar dos veces NO crea dos membresías');
  perform pg_temp.chk(
    (select status from public.invitations where token = 'tok-vigente') = 'accepted',
    'la invitación queda marcada como aceptada');
  perform pg_temp.chk(
    (select accepted_by from public.invitations where token = 'tok-vigente')
      = 'e1000000-0000-4000-8000-000000000006',
    'queda registrado quién la aceptó');
end $$;

-- ============================ 3 · Finanzas por permiso (regresión) ==========
-- El caso del dueño-coach de un box pequeño. Ya funcionaba; se comprueba que
-- las invitaciones no lo rompieron y que el permiso concedido AL INVITAR manda.
set session role authenticated;

set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000003';  -- coach sin permiso
do $$ begin
  perform pg_temp.chk((select count(*) from public.invoices) = 0,
    'un coach sin can_view_finances NO ve los cobros');
end $$;

set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000004';  -- coach con permiso
do $$ begin
  perform pg_temp.chk((select count(*) from public.invoices) = 1,
    'un coach con can_view_finances SÍ ve los cobros');
end $$;

set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000006';  -- coach recién invitado
do $$ begin
  perform pg_temp.chk((select count(*) from public.invoices) = 1,
    'el coach invitado con el permiso financiero ve los cobros desde el primer día');
end $$;

-- ============================ 4 · La lista del equipo =======================
set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000002';  -- administrador
do $$
declare n int; correo text;
begin
  select count(*) into n from public.org_team('0e000000-0000-4000-8000-000000000001');
  perform pg_temp.chk(n = 5,
    'el equipo son los 5 del staff: el atleta no sale ahí');

  select t.email into correo
  from public.org_team('0e000000-0000-4000-8000-000000000001') t
  where t.role = 'owner';
  perform pg_temp.chk(correo = 'dueno@boxequipo.co',
    'la lista trae el correo de cada uno (auth.users no se lee desde el cliente)');
end $$;

set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000003';  -- coach
do $$
declare bloqueado boolean := false;
begin
  begin
    perform count(*) from public.org_team('0e000000-0000-4000-8000-000000000001');
  exception when others then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'un coach NO puede listar el equipo con sus correos');
end $$;

set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000005';  -- dueño del Box Ajeno
do $$
declare bloqueado boolean := false;
begin
  begin
    perform count(*) from public.org_team('0e000000-0000-4000-8000-000000000001');
  exception when others then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'un dueño NO puede listar el equipo de otro box');
end $$;

-- ============================ 5 · El último dueño no se toca ================
set request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000002';  -- administrador del box
do $$
declare bloqueado boolean; mensaje text;
begin
  bloqueado := false;
  begin
    update public.memberships set role = 'coach'
     where org_id = '0e000000-0000-4000-8000-000000000001'
       and user_id = 'e1000000-0000-4000-8000-000000000001';
  exception when others then
    bloqueado := true; mensaje := sqlerrm;
  end;
  perform pg_temp.chk(bloqueado, 'no se puede degradar al último dueño');
  perform pg_temp.chk(mensaje like '%único dueño%',
    'y el error lo explica en español, no con un código de Postgres');

  bloqueado := false;
  begin
    update public.memberships set status = 'disabled'
     where org_id = '0e000000-0000-4000-8000-000000000001'
       and user_id = 'e1000000-0000-4000-8000-000000000001';
  exception when others then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'no se puede desactivar al último dueño');

  bloqueado := false;
  begin
    delete from public.memberships
     where org_id = '0e000000-0000-4000-8000-000000000001'
       and user_id = 'e1000000-0000-4000-8000-000000000001';
  exception when others then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'tampoco se puede borrar la membresía del último dueño');

  -- Con un segundo dueño sí se puede: es como se transfiere la propiedad.
  update public.memberships set role = 'owner'
   where org_id = '0e000000-0000-4000-8000-000000000001'
     and user_id = 'e1000000-0000-4000-8000-000000000006';

  update public.memberships set role = 'admin'
   where org_id = '0e000000-0000-4000-8000-000000000001'
     and user_id = 'e1000000-0000-4000-8000-000000000001';
  perform pg_temp.chk(
    (select role from public.memberships
      where org_id = '0e000000-0000-4000-8000-000000000001'
        and user_id = 'e1000000-0000-4000-8000-000000000001') = 'admin',
    'SÍ se puede degradar a un dueño cuando hay otro');

  -- Y el que queda vuelve a estar protegido.
  bloqueado := false;
  begin
    update public.memberships set status = 'disabled'
     where org_id = '0e000000-0000-4000-8000-000000000001'
       and user_id = 'e1000000-0000-4000-8000-000000000006';
  exception when others then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado, 'el dueño que queda hereda la protección');
end $$;

reset role;

-- Cerrar el box sí tiene que funcionar: si la guarda bloqueara el CASCADE,
-- ningún box se podría eliminar nunca.
do $$ begin
  delete from public.organizations where id = '0e000000-0000-4000-8000-000000000002';
  perform pg_temp.chk(
    (select count(*) from public.memberships
      where org_id = '0e000000-0000-4000-8000-000000000002') = 0,
    'borrar el box arrastra a su dueño sin que la guarda lo impida');
end $$;

-- ============================ 6 · Integridad de la invitación ===============
do $$
declare bloqueado boolean;
begin
  bloqueado := false;
  begin
    insert into public.invitations (org_id, email, role)
    values ('0e000000-0000-4000-8000-000000000001', 'sofia@coach.co', 'admin');
  exception when unique_violation then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado,
    'no puede haber dos invitaciones vivas para el mismo correo en el mismo box');

  bloqueado := false;
  begin
    insert into public.invitations (org_id, email, role, permissions)
    values ('0e000000-0000-4000-8000-000000000001', 'otra@coach.co', 'coach',
            '{"can_ver_plata": true}');
  exception when check_violation then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado,
    'un permiso mal escrito se rechaza en vez de guardarse sin conceder nada');

  bloqueado := false;
  begin
    insert into public.invitations (org_id, email, role)
    values ('0e000000-0000-4000-8000-000000000001', 'jefe@coach.co', 'owner');
  exception when check_violation then
    bloqueado := true;
  end;
  perform pg_temp.chk(bloqueado,
    'no se invita a nadie como dueño: la propiedad se transfiere, no se reparte');
end $$;

reset request.jwt.claim.sub;

rollback;

select 'EQUIPO DEL BOX OK' as resultado;
