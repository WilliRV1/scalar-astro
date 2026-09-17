-- =============================================================================
-- 0008 · Almacenamiento: comprobantes de pago y avatares
-- =============================================================================
-- Las rutas SIEMPRE empiezan por el org_id: `receipts/<org_id>/<archivo>`. Las
-- políticas se apoyan en eso, así que un box no puede ni listar los archivos de
-- otro. Los buckets son privados: se sirve todo con URL firmada y vencimiento.
--
-- Va entre guardas porque el esquema `storage` solo existe en un proyecto de
-- Supabase real; en el Postgres pelado de las pruebas no está y esta migración
-- simplemente no hace nada.
-- =============================================================================

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sin esquema storage (Postgres pelado): se omite.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('receipts', 'receipts', false, 5242880,
     array['image/jpeg','image/png','image/webp','application/pdf']),
    ('avatars',  'avatars',  false, 2097152,
     array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;

  -- El primer segmento de la ruta es el org_id.
  execute $pol$
    create policy "el staff lee los archivos de su box"
      on storage.objects for select
      to authenticated
      using (
        bucket_id in ('receipts','avatars')
        and (storage.foldername(name))[1]::uuid in (select private.auth_staff_org_ids())
      );
  $pol$;

  execute $pol$
    create policy "el staff sube archivos a su box"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id in ('receipts','avatars')
        and (storage.foldername(name))[1]::uuid in (select private.auth_staff_org_ids())
      );
  $pol$;

  execute $pol$
    create policy "el staff borra archivos de su box"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id in ('receipts','avatars')
        and (storage.foldername(name))[1]::uuid in (select private.auth_staff_org_ids())
      );
  $pol$;

  -- El atleta puede subir SU comprobante de transferencia, que es justo lo que
  -- hoy se manda por WhatsApp y nadie sabe dónde quedó.
  execute $pol$
    create policy "el atleta sube su propio comprobante"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'receipts'
        and (storage.foldername(name))[2] = (
          select m.athlete_id::text from public.memberships m
          where m.user_id = (select auth.uid())
            and m.org_id = (storage.foldername(name))[1]::uuid
            and m.role = 'athlete'
        )
      );
  $pol$;

exception
  when duplicate_object then
    raise notice 'Las políticas de storage ya existían.';
end $$;
