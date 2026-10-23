-- Apply before deploying the direct upload routes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photo-uploads', 'photo-uploads', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/gif','image/tiff','image/avif','image/heic','image/heif'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

update storage.buckets set file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/tiff','image/avif','image/heic','image/heif']
where id = 'originals';

create policy "photo upload insert own" on storage.objects for insert to authenticated
with check (bucket_id = 'photo-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photo upload read own" on storage.objects for select to authenticated
using (bucket_id = 'photo-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photo upload delete own" on storage.objects for delete to authenticated
using (bucket_id = 'photo-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Reading and deleting permanent originals is needed by the owner deletion route.
create policy "photo original read own" on storage.objects for select to authenticated
using (bucket_id = 'originals' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photo original delete own" on storage.objects for delete to authenticated
using (bucket_id = 'originals' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- One row per user; upsert serializes concurrent requests across instances.
create table public.ai_request_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0)
);
alter table public.ai_request_usage enable row level security;
revoke all on public.ai_request_usage from anon, authenticated;

create function public.consume_ai_request() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  current_window timestamptz := date_trunc('hour', now());
begin
  if caller is null then return false; end if;
  insert into public.ai_request_usage as usage (user_id, window_start, request_count)
  values (caller, current_window, 1)
  on conflict (user_id) do update set
    window_start = excluded.window_start,
    request_count = case when usage.window_start < excluded.window_start then 1 else usage.request_count + 1 end
  where usage.window_start < excluded.window_start or usage.request_count < 20;
  return found;
end;
$$;
revoke all on function public.consume_ai_request() from public, anon;
grant execute on function public.consume_ai_request() to authenticated;
