-- Run ONLY against the authorized target after the corrected UI is deployed
-- and its licensing notices have been verified. Safe to repeat after activation.
begin;
lock table public.photos in share row exclusive mode;
update public.photo_license_history set legacy_cc_possible = true
where not (select corrected_policy_active from public.photo_licensing_policy where singleton)
  and photo_id in (select id from public.photos);
update public.photo_licensing_policy set corrected_policy_active = true where singleton;
commit;
