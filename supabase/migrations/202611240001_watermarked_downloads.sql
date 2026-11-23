-- Apply before backfilling and deploying watermarked full-resolution free-download copies.
-- Keeps uploaded source originals private and stores separate full-resolution
-- watermarked JPEG download copies in the private `photo-downloads` bucket.
-- Adds nullable per-photo `watermark_enabled` (NULL = unknown legacy preference,
-- never treated as consent) and `download_watermark_version` (non-secret marker
-- for repeatable regeneration; payloads themselves remain strictly transient).
-- Does not alter `vw_public_photos` or existing `photo_license_history` triggers/RLS.
--
-- Required cutover order:
--   1. Apply this migration.
--   2. Run `scripts/backfill-photo-downloads.mjs` (dry-run, then `--apply` only for
--      eligible authorized photos) before deploying the download-route cutover.
--   3. Deploy the updated application serving free downloads solely from `photo-downloads`.

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
  add column if not exists download_url text,
  add column if not exists watermark_enabled boolean,
  add column if not exists download_watermark_version text;
