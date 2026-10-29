begin;
-- Coordinate the backfill and trigger installation with concurrent photo writes.
lock table public.photos in share row exclusive mode;

-- Intentionally no foreign key: minimal license evidence survives photo deletion.
create table public.photo_license_history (
  photo_id uuid primary key,
  legacy_cc_possible boolean not null,
  first_free_published_at timestamptz
);
create table public.photo_licensing_policy (
  singleton boolean primary key default true check (singleton),
  corrected_policy_active boolean not null default false
);
insert into public.photo_licensing_policy values (true, false);
alter table public.photo_license_history enable row level security;
alter table public.photo_licensing_policy enable row level security;
revoke all on public.photo_license_history, public.photo_licensing_policy from public, anon, authenticated;
grant select on public.photo_license_history to anon, authenticated;

create policy "public photo license history" on public.photo_license_history
  for select to anon, authenticated using (
    exists (select 1 from public.vw_public_photos p where p.id = photo_id)
  );
-- Separate role policy: anonymous readers need no permission on the photos table.
create policy "owner photo license history" on public.photo_license_history
  for select to authenticated using (
    exists (select 1 from public.photos p where p.id = photo_id and p.user_id = (select auth.uid()))
  );

insert into public.photo_license_history (photo_id, legacy_cc_possible)
select id, true from public.photos;

-- Match JavaScript String.trim(), including tabs and Unicode whitespace.
create function public.photo_has_external_license_link(value text) returns boolean
language sql immutable set search_path = '' as $$
  select nullif(btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '') is not null
$$;
revoke all on function public.photo_has_external_license_link(text) from public, anon, authenticated;

create function public.track_photo_license_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  corrected boolean;
  is_free boolean := new.status = 'published' and not public.photo_has_external_license_link(new.microstock_url);
  was_free boolean := false;
  first_publication timestamptz := null;
begin
  select corrected_policy_active into strict corrected from public.photo_licensing_policy where singleton;
  if tg_op = 'UPDATE' then
    was_free := old.status = 'published' and not public.photo_has_external_license_link(old.microstock_url);
  end if;
  if is_free and not was_free then first_publication := statement_timestamp(); end if;
  insert into public.photo_license_history as h (photo_id, legacy_cc_possible, first_free_published_at)
  values (new.id, not corrected or tg_op = 'UPDATE', first_publication)
  on conflict (photo_id) do update set
    first_free_published_at = coalesce(h.first_free_published_at, excluded.first_free_published_at);
  return new;
end;
$$;
revoke all on function public.track_photo_license_history() from public, anon, authenticated;
create trigger photo_license_history_tracking after insert or update on public.photos
  for each row execute function public.track_photo_license_history();
-- Do not activate here: the previous UI may still be serving blanket CC notices.
commit;
