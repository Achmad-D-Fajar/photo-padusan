# Project instructions

These instructions apply throughout this repository. Follow more specific
instruction files where present, and keep this file current when the architecture
or development commands change.

## Project and layout

Padustock is a photo gallery and microstock site for Desa Padusan. The repository
is named `photo-padusan`; the npm package is named `paduphoto`.

- Use the existing Next.js App Router, React, strict TypeScript, Tailwind CSS,
  and daisyUI patterns. Use npm and keep `package-lock.json` with dependency changes.
- Keep interface messages in Indonesian. Preserve the separate Indonesian and
  English caption/tag fields (`caption_id`, `caption_en`, `tags_id`, `tags_en`).
- `src/app`: pages, route handlers, auth actions, and intercepted photo modals.
- `src/components`: dashboard, public gallery, layout, and shared components.
- `src/lib/server`: image processing, Gemini, and server upload helpers.
- `src/lib/supabase`: browser, request-scoped server, and privileged admin clients.
- `src/lib/queries/public-photos.ts`: shared gallery queries and filtering.
- `src/types/supabase.ts`: database, view, and RPC types; update alongside schema changes.
- `supabase/migrations`: SQL changes; `tests`: Node test runner regression tests.
- `middleware.ts`: session refresh and dashboard redirects. API routes still
  need their own authentication and authorization checks.

## Development and verification

Use Node.js 20.9 or newer. See `README.md` for environment and deployment setup.

```sh
npm ci
npm run dev
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

- Run the checks relevant to the change. For upload, authentication, storage,
  image processing, or API changes, run the regression tests, lint, and type check;
  also build when changing routes, dependencies, or server/client boundaries.
- Tests use `tests/helpers/load-ts.cjs` to load application TypeScript with service
  mocks. Keep normal tests independent of deployed Supabase and Gemini services.
- `HEIC_TEST_FILE` can point to a local HEIC fixture for a real decoder test;
  report when this optional test is skipped.
- Add regression coverage for changed failure paths and security behavior.
  Documentation-only changes need a content/link review and `git diff --check`.
- Report actual verification results and any checks that could not run.
- Licensing database tests execute the real migration in local PGlite with explicit
  test-only Supabase roles/view fixtures. Distinguish these from mocked API checks
  and actual hosted-project enforcement. Run `npm run test:ui` for legal/form changes;
  its Supabase fixtures must stay local and independent of deployed services.

## Authentication, privacy, and database access

- Use `@/lib/supabase/client` in browser components and the request-scoped
  `@/lib/supabase/server` client for the current user's server operations.
- Keep `@/lib/supabase/admin` and `SUPABASE_SERVICE_ROLE_KEY` on the server.
  Service-role access bypasses RLS: check the caller and object ownership before
  privileged operations. Never sign a user into the shared admin client.
- Login must verify the password and set the session on the server. Never return
  the private authentication email when resolving a public display name.
- Scope photo mutations to the authenticated owner. Do not rely on a hidden UI
  control or middleware redirects as authorization.
- Query `vw_public_photos` for public gallery visibility. Keep owner dashboard
  queries scoped to `user_id`, and retain deterministic pagination ordering.
- Escape ILIKE search input through the existing helper. Serialize embedded
  JSON-LD with `src/lib/json-ld.ts` so user captions cannot close the script tag.
- Do not log or commit credentials, session tokens, or `.env*` files. Preserve
  existing user changes when working in a dirty checkout.

## Photo upload and image invariants

- Use `src/lib/photo-upload.ts` as the shared source for supported formats and
  limits: 50 MiB (displayed as 50 MB) and 80 million decoded pixels. Keep browser,
  server, and Storage bucket limits consistent when changing these values.
- Upload photo bytes directly from the browser to the private `photo-uploads`
  bucket using the authenticated signed upload flow. Processing routes receive
  bounded JSON references, not multipart photo bodies. Large originals must not
  pass through Vercel function request or response bodies.
- Validate staging ownership and stored size before downloading or decoding.
  An accepted extension or MIME type does not prove the file is a valid image.
- Preserve HEIC/HEIF support, including files with an empty browser MIME type.
  Decode previews on the server using the existing `photo-image.ts` helper;
  Sharp alone cannot decode HEVC with the bundled binaries.
- Keep image routes on the Node.js runtime. Preserve `sharp` and `heic-decode`
  in `next.config.ts` server external packages.
- Keep Next.js and the app on a single Sharp version using the `next.sharp`
  override in `package.json`. Check `npm ls sharp` after dependency updates;
  mixed Sharp/native binary versions can prevent Vercel image functions from starting.
- Preserve the image routes' `outputFileTracingIncludes` in `next.config.ts`:
  deployed functions need Sharp's native binary and libvips shared libraries,
  including the Linux files in `@img/sharp-libvips-linux-x64`.
- Apply orientation before calculating preview/watermark dimensions. Use actual
  resized dimensions and scale the watermark to fit tiny images and panoramas.
- Preserve original bytes and format for downloads; previews/thumbnails may be
  JPEG. Authorize free downloads against publication and purchase-link state,
  then redirect to a short-lived signed Storage URL.
- A published photo can be free: an empty `microstock_url` is valid. Read its
  publication status from `status`, not from the presence of a purchase URL.
- Use the shared licensing helper and notices: current free/external availability
  is separate from historical CC exposure. Unknown history is not proof of no grant.
  Never label every external listing CC or assume identical provider permissions.
- Preserve database-controlled `photo_license_history`, including minimal records
  after photo deletion. Do not rewrite `vw_public_photos` without its real definition
  and security settings. Never clear history from owner forms or backdate grants.
- Keep licensing rollout conservative until authorized post-deployment activation.
  The activation SQL is separate from schema migration application.
- Registration requires the current legal-document versions and strict boolean
  acceptance before account creation. Store acknowledgment only in admin-controlled
  application metadata with a server timestamp; no invented legacy consent or IP tracking.
- Keep document versions/dates in the shared manifest. Prepared local revisions
  have no publication date; set the actual date when releasing. New preview metadata
  uses photographer attribution and a canonical photo reference, not a blanket grant
  or reservation. Do not rewrite originals or existing embedded metadata.
- Clean up staged and attempted permanent objects after failed saves. Owner
  deletion must remove both originals and thumbnails and check Storage errors
  before reporting success or removing the database row.
- Preserve the authenticated daily cleanup in `vercel.json` and its
  `CRON_SECRET` check; it removes abandoned staging files older than 24 hours.

## AI requests

- Analysis and translation require an authenticated user and share the persistent
  `consume_ai_request` quota of 20 requests per user per hour. Check the quota
  before calling Gemini and fail closed when the quota RPC is unavailable.
- Keep bounded input/output validation aligned with the forms and save route:
  captions up to 300 characters, at most 30 tags, and at most 64 characters per tag.
- Keep `GEMINI_API_KEY` on the server and preserve the manual caption/tag workflow.

## Schema and deployment changes

- Add schema, RPC, and RLS changes as SQL migrations. Update database types and
  README setup/deployment notes with any new requirements.
- The existing `202610240001_photo_uploads.sql` migration extends an existing
  Supabase project. It is not a full database bootstrap: profiles, photos,
  `vw_public_photos`, existing bucket policies, and `originals`/`thumbnails`
  buckets must already exist. Its table/policy creation is intended to run once.
- Local files and successful builds do not prove a migration has been applied.
  Before applying remote changes, establish the target project and use the
  user's authorized deployment scope. Clearly report what was actually applied.
- For uploads, Supabase's global Storage limit must also allow 50 MiB. Set
  `CRON_SECRET` in Vercel's project environment variables and deploy the updated
  code/configuration for cleanup to run. See `README.md` for all required variables.
