-- Apply before deploying watermarked full-resolution free-download copies.
-- Keeps uploaded source originals private and stores separate full-resolution
-- watermarked JPEG download copies in the private `photo-downloads` bucket.
-- Does not alter `vw_public_photos` or existing `photo_license_history` triggers/RLS.

update storage.buckets
set public = false
where id = 'originals';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photo-downloads', 'photo-downloads', false, 52428800, array['image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "photo download insert own" on storage.objects for insert to authenticated
with check (bucket_id = 'photo-downloads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photo download read own" on storage.objects for select to authenticated
using (bucket_id = 'photo-downloads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photo download delete own" on storage.objects for delete to authenticated
using (bucket_id = 'photo-downloads' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.photos
  add column if not exists download_url text;
