-- Plate photos kept with the meals: a private bucket with one folder per user,
-- "<user id>/<photo id>.jpg". The app shrinks them to about 1280 px before uploading.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Read, upload (with upsert) and delete only inside the user's own folder.
drop policy if exists "fotos: so a propria pasta" on storage.objects;
create policy "fotos: so a propria pasta" on storage.objects
  for all to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
