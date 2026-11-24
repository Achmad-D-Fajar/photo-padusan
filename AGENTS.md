# Project instructions

These instructions apply throughout this repository. Follow more specific
instruction files where present, and keep this file current when the architecture
or development commands change.

## Project and layout

Padustock is a photo gallery and microstock site for Desa Padusan. The repository
is named `photo-padusan`; the npm package is named `paduphoto`.

- Use the existing Next.js App Router, React, strict TypeScript, Tailwind CSS,
  and daisyUI patterns. Use npm and keep `package-lock.json` with dependency changes.
- Load shared fonts from `src/lib/fonts.ts` with `next/font/local`. Keep the Latin
  font files and their licenses in `src/assets/fonts` so builds do not depend on
  remote font downloads. Preserve the stylesheet's existing font variables.
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
- Keep uploaded source originals unchanged in private `originals` storage and
  inaccessible through public download paths. For free-download photos, generate
  a separate full-resolution, invisibly watermarked JPEG download copy (quality
  92, progressive/mozjpeg 4:2:0, full oriented dimensions preserved, no visible
  watermark) in the private `photo-downloads` bucket; do not label this copy
  byte-identical to the uploaded source. Authorize free downloads against
  publication and purchase-link state, then redirect to a short-lived signed
  Storage URL for `photo-downloads`.
- A published photo can be free: an empty `microstock_url` is valid. Read its
  publication status from `status`, not from the presence of a purchase URL.
- Use the shared licensing helper and notices: current free/external availability
  is separate from historical CC exposure. Unknown history is not proof of no grant.
  Never label every external listing CC or assume identical provider permissions.
  Watermarking does not change a photo's license.
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
  or reservation. Do not rewrite private source originals or their existing embedded
  metadata (the preview and free-download copy are separate derivative objects).
- Clean up staged and attempted permanent objects after failed saves. Owner
  deletion must remove originals, download copies (`photo-downloads` when present),
  and thumbnails and check Storage errors before reporting success or removing
  the database row.
- Preserve the authenticated daily cleanup in `vercel.json` and its
  `CRON_SECRET` check; it removes abandoned staging files older than 24 hours.

## Invisible watermark architecture, free-download copies, and recovery

These shared operational rules apply to all teammates and agents (watermarking,
cryptography/data, and evaluation) and supersede all earlier preview-only and
byte-identical free-download instructions:

- **Agreed output flow**:
  - **Preview (`thumbnails`)**: receives the existing visible watermark AND the
    invisible watermark (oriented, resized to ≤ 1080 px long side, sRGB,
    transparency flattened on white, visible stamp composited before invisible
    embedding, single final JPEG quality 80 progressive/mozjpeg 4:2:0 encode,
    plus EXIF/IPTC attribution metadata).
  - **Free-download photo (`photo-downloads`)**: receives a separate
    full-resolution download copy with the **same** invisible watermark payload
    and **no visible watermark** (oriented, full dimensions preserved, sRGB,
    transparency flattened on white, JPEG quality 92 progressive/mozjpeg 4:2:0
    encode). Keep the uploaded source file unchanged in private `originals`
    storage; never serve private source originals through public download paths
    or label the re-encoded download copy byte-identical to the uploaded source.
  - **External paid listing / draft**: gets the watermarked Padustock preview
    only; Padustock does not create or serve a full-resolution paid download copy.
  - **Atomic publication & verification**: create and verify all required outputs
    (preview, and full-resolution download copy for free photos) before uploading
    or publishing. If any required output fails or lacks capacity, reject the
    save explicitly (`400`/`422`) and clean up staged and attempted objects with
    no partial files or published database row left behind.
  - **Per-photo opt-out persistence, edits, legacy confirmation, and backfill**:
    `photos.watermark_enabled` (nullable boolean; `NULL` = unknown on legacy rows,
    never treated as consent or `"yes"`) and `photos.download_watermark_version`
    (non-secret version marker such as `iwm-v1-placeholder` or `none` so
    placeholder copies can be regenerated once encrypted payloads are integrated)
    are stored on `photos`; payload text itself stays strictly transient and is
    never stored or logged. `EditPhotoForm` routes draft/publish edits through
    authenticated `PATCH /api/photos/[id]` (keeping `"/api/photos/[id]"` in
    `next.config.ts` `outputFileTracingIncludes`) so draft/external→free
    transitions generate and verify `photo-downloads` copies while preserving
    already-set `watermark_enabled` (`false` stays unwatermarked) and
    `photo_license_history`.
    - **New uploads (`POST /api/photos/draft`)**: prepare/encrypt the watermark
      payload **once** per upload and embed those exact same bytes into both the
      preview (`thumbnails`) and the free-download copy (`photo-downloads`).
      Whenever `publish_directly: true` creates a free-download copy, require
      current Terms (`LEGAL_DOCUMENTS.terms.version`) acceptance (`409` if
      unaccepted and no valid `legalAcknowledgment` is supplied).
    - **Draft → free publish (`PATCH /api/photos/[id]`)**: whenever creating a
      free-download copy (`status: "published"` without external URL and no
      existing `download_url`), require current Terms acceptance (`409` even if
      `watermark_enabled` was already recorded earlier), use a unique per-attempt
      download path (`download_<id>_<hex>.jpg`), and schedule rollback cleanup
      only after each storage upload succeeds. When watermarking is enabled,
      extract and reuse the exact opaque payload bytes already embedded in the
      photo's existing preview for the download copy (without storing payload
      text in the database); if the existing preview cannot be extracted safely,
      prepare one payload and regenerate **both** preview and download copy
      atomically from those same bytes. When opting out (`watermark_enabled:
      false`) on a legacy photo or whenever the existing preview carries an
      invisible watermark, regenerate the preview with its visible watermark
      only so neither copy carries a hidden watermark.
    - **Legacy photos (`watermark_enabled IS NULL`)**: `EditPhotoForm` shows an
      explicit unchecked owner confirmation choice (enable vs. opt-out) plus
      current Terms (`LEGAL_DOCUMENTS.terms.version`) acceptance whenever the
      owner has not yet accepted the latest version; `PATCH /api/photos/[id]`
      rejects free publication with `409` until both are confirmed, and records
      terms acknowledgment only in admin-controlled `app_metadata.legal_acknowledgment`.
    - **Backfill & rollout**: before cutting over the download route on a hosted
      project, apply `202611240001_watermarked_downloads.sql`, publish the
      updated legal documents with a real `publishedOn` date, and run
      `scripts/backfill-photo-downloads.mjs` (`--dry-run`, then `--apply` only
      for eligible authorized photos whose owners accepted the current published
      terms version and have a non-null `watermark_enabled`); `--apply` strictly
      rejects non-current `--required-terms-version` overrides and unpublished
      terms (`publishedOn === null`). Never treat `terms-2` as acceptance of the
      updated `terms-3` wording and never restore a fallback serving private
      `originals`.
- **Shared byte interface & role boundaries**:
  - The shared byte-based watermark core lives in `src/lib/watermark/`
    (`core.ts`, `dct.ts`, `packet.ts`) implementing DCT/QIM profile 1 (`PDIW`,
    version `1`, profile `1`, `Delta = 48`, 3x repetition with xorshift32
    `0x50444957` Fisher-Yates placement, 40-byte SHA-256 framing, 512-byte cap).
    `scripts/extract-watermark.mjs` imports the exact same core via `scripts/load-ts.cjs`.
  - **Wafa's crypto module (`src/lib/server/watermark-crypto.ts`)** is integrated
    through `src/lib/server/watermark-bytes.ts` (embed) and
    `src/app/api/photos/extract/route.ts` (recovery) using AES-256-GCM +
    PBKDF2-HMAC-SHA256 (`100,000` iterations, `PW | LEN | SALT | NONCE | CT | TAG`,
    AAD `"PADUSTOCK-WATERMARK-v1"`, compact wire certificate hydrated to
    `CopyrightCertificate`, download version marker `iwm-v1-aes256gcm`).
    The watermark core (`src/lib/watermark/core.ts`) stays opaque-byte-based.
  - **Sheril owns evaluation and robustness testing.** Do not alter her evaluation
    plan or claim unmeasured attack robustness.
- **Agreed key model (current decision)**:
  - **Server-managed key (`WATERMARK_SECRET_KEY`, 8–128 chars, server-only) with
    no photographer passphrase input field.** Fail closed (`503`) when the key
    is missing; do NOT add a passphrase form field to upload, edit, or extraction
    pages unless Achmad explicitly revises this decision.
  - New uploads encrypt the ownership certificate **once** per photo via
    `prepareWatermarkPayloadBytes` and embed those exact encrypted bytes into
    both the preview and the free-download copy.
- **Verified capacity & 512 B vs. 16,384 B discrepancy**:
  - Profile 1 capacity is `max(0, min(512, floor(B / 24) - 40))` opaque bytes
    (where `B = floor(width / 8) * floor(height / 8)`). Example verified limits:
    `1080×608` (16:9 preview) = 387 B; `1080×720` (3:2 preview) = 466 B;
    `1080×810` (4:3 preview), `1080×1080` (1:1 preview), and full-resolution
    photos (e.g., `4032×3024`) = **512 B cap** (physical uncapped 3×-repetition
    capacity at `4032×3024` would be 7,898 B; 16,384 B at 3× repetition requires
    ≥ 395,232 8×8 blocks ≈ 25.3 MP and cannot physically fit a 1080 px preview
    at 1 bit per 8×8 block).
  - The proposal's evaluation table lists test payloads from 32 B up to 16,384 B
    (plus 44 B crypto overhead). Under Profile 1, payloads exceeding image
    capacity or the 512 B cap are **rejected explicitly** (`400`/`422`) without
    truncation or silent skip. Do not claim or silently implement > 512 B support
    without an explicit, agreed algorithm/profile change.
- **Upload form & transient payload rules**:
  - `watermark-payload.ts` resolves blank text to `PADUSTOCK-IWM-v1` and enforces
    512 UTF-8 bytes without truncation. Approved narrow exception for
    `POST /api/photos/draft`: `UploadForm` sends `watermark_enabled` (and
    `watermark_payload` only when enabled, for testing/current plaintext payload
    integration) exclusively to `POST /api/photos/draft`.
  - Keep payloads strictly transient on the server: never store payloads in the
    database, never log them, and never send watermark fields to upload, preview,
    analysis, or translation endpoints.
  - Keep the compact watermark disclosure immediately above upload/review actions.
    Default information stays outside it; payload and opt-out state survive AI
    review and retries. Opt-out (`watermark_enabled: false`) retains typed text,
    bypasses payload validation while disabled, omits `watermark_payload` on save,
    and skips invisible watermarking on both preview and free-download copy.
    Explanation/risk links open `/about/hidden-watermark` in a new tab.
- **Recovery / extraction (`/dashboard/extract` and `/verify` redirect)**:
  - Target recovery extracts the opaque watermark bytes from the submitted image,
    then (once Wafa's server-managed-key crypto module is integrated) decrypts
    and authenticates them, displaying recovered data **only after authentication
    succeeds**, with clear errors for missing, damaged, unsupported, or
    unauthenticated payloads.
  - `/dashboard/extract` authenticates on the server and renders `ExtractClient`
    (with `/verify` redirecting to `/dashboard/extract` so extraction stays
    authenticated). `ExtractClient` wires `ExtractForm` to `POST /api/photos/extract`
    through the authenticated signed-upload staging flow (`photo-uploads`, up to
    50 MiB including HEIC, avoiding large multipart bodies in Vercel Functions).
  - `POST /api/photos/extract` validates auth, ownership, and stored size, runs
    the shared core in `@/lib/watermark/core`, removes temporary staged files in
    `finally` on processing paths (with client-side best-effort cleanup on
    unsuccessful responses and the 24-hour daily cron as fallback), never reads
    or writes database photo rows, never logs extracted payloads, and returns
    explicit `422` error codes for invalid/unmarked/corrupted/unsupported/non-UTF-8
    files. Keep `"/api/photos/extract"` in `next.config.ts`
    `outputFileTracingIncludes`. Controlled fixture responses belong only in
    `tests/ui/fixture-app`. Preserve existing visible preview watermarking.

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
