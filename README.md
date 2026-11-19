# 📸 Padustock

**Padustock** is a community-based digital photo gallery and microstock platform for **Desa Padusan** (Padusan Village). Local photographers upload their work, and visitors can browse, download for free, or buy photos to support the photographers directly.

🔗 **Live site:** [padustock.vercel.app](https://padustock.vercel.app)

> The interface is in Indonesian, and the repository is named `photo-padusan`.

The existing Atkinson Hyperlegible, Space Grotesk, and Dela Gothic One Latin fonts
are bundled with their licenses in `src/assets/fonts` and loaded through
`src/lib/fonts.ts`. Local and production builds do not need Google Fonts downloads.

---

## ✨ Features

- **Photo gallery** – Browse community photos with pagination and a per-page selector.
- **Search & filters** – Filter by caption, uploader, tags, and date range.
- **Sorting** – Sort by newest, or alphabetically (ID / EN), ascending or descending.
- **Free download / buy** – Each photo offers a free download or a purchase option that supports the photographer.
- **Photo detail pages** – Every photo has its own page (`/photo/[id]`).
- **Photographer profiles** – View all works by a photographer (`/photographer/[username]`).
- **Upload dashboard** – Registered users upload their work at `/dashboard/upload`.
- **Copyright watermark (encrypted, invisible)** – On upload, an owner passphrase (8–128 chars, required while the watermark toggle is on) derives an AES-256-GCM key via PBKDF2-HMAC-SHA256 (100k iterations). A copyright certificate (photo ID, photographer, license, timestamp, normalized image hash, optional ≤512-byte text payload) is encrypted and embedded into mid-frequency DCT coefficients of the original, archived as lossless PNG. The passphrase is never stored. Opting out keeps the legacy raw-file path.
- **Hidden watermark explanation** – Public `/about/hidden-watermark` explains the real feature: how embedding works, payload choices, opt-out risks, and measured limitations. Upload links open it in a new tab to preserve form state; the risk link points directly to `#risiko`.
- **Real extraction & public verification** – Authenticated `/dashboard/extract` and public `/verify` extract the DCT packet and decrypt the certificate server-side; wrong passphrases or tampered images are rejected by the GCM authentication tag. `RealExtractForm` injects the `/api/photos/verify` adapter into the reusable `ExtractForm`. Downloads captioned `padustock demo` still receive photo/uploader reference IDs in their filenames (kept from the demo branch).
- **AI-assisted captions** – Google Gemini helps generate photo descriptions, with the option to write captions and tags manually.
- **Image & EXIF handling** – Server-side processing with `sharp` and `piexifjs`.
- **50 MB photo uploads, including HEIC/HEIF** – Files upload directly to Supabase; HEIC is decoded on the server and shown as a JPEG preview. Original downloads preserve the uploaded format.
- **Authentication** – Register / log in with Supabase Auth; `/dashboard/*` is protected by middleware.
- **Automatic licensing** – Published photos without purchase links use [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/). External listings direct visitors to the provider's applicable licensing process; a preview does not itself grant general reuse permission. Valid prior CC grants continue after link/status changes.

## Copyright watermark (real engine)

This branch merges the `capstoneDemo` UI with the real cryptography + DCT engine
(`feature/watermark-copyright-protection`). The filename-driven simulation now
lives only on the `capstoneDemo` branch; `src/lib/demo-extraction.ts` is kept as
legacy reference and is not imported by the app here.

Run `npm run dev`, sign in, and open `/dashboard/upload`:

1. Pick a photo, write captions (manual or AI), optionally edit the ≤512-byte
   text payload under “Edit watermark (opsional)”.
2. Enter the owner passphrase (8–128 chars). It is sent only to the draft route,
   never stored or logged.
3. On save, the server builds the certificate, encrypts it (AES-256-GCM, AAD =
   protocol string), embeds the packet into DCT coefficients (α = 25, luminance
   mid-frequency pair), and archives the original as lossless PNG.
4. Prove ownership at public `/verify` (no login) or `/dashboard/extract`:
   upload the disputed image + passphrase. Correct key → certificate + hash
   status; wrong key or tampering → “Authentication Error (Invalid Tag)”;
   no packet → “not detected”. JPEG Q70–90 recompression still recovers the
   certificate (BER 0% measured); hash mismatch is shown as a warning.

Opting out (“Nonaktifkan watermark”) skips embedding entirely and keeps the
legacy raw-file move. Measured demo numbers: PSNR 46.12 dB, 667-byte packet.
Regenerate UI test fixtures with `node tests/ui/make-watermark-fixture.cjs`.

## 🧰 Tech Stack

| Area | Technology |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router) + [React 19](https://react.dev) |
| Language | TypeScript |
| Styling | Tailwind CSS 4, daisyUI 5 |
| Auth & Database | [Supabase](https://supabase.com) (`@supabase/supabase-js`, `@supabase/ssr`) |
| AI | [Google Generative AI](https://ai.google.dev) (`@google/generative-ai`) |
| Images | `sharp`, `piexifjs` |
| Linting | ESLint 9 |
| Hosting | [Vercel](https://vercel.com) |

## 🗺️ Main Routes

| Route | Description | Access |
| --- | --- | --- |
| `/` | Photo gallery with search, filters, and sorting | Public |
| `/photo/[id]` | Photo detail page | Public |
| `/photographer/[username]` | Photographer profile and works | Public |
| `/about` | About the community | Public |
| `/about/hidden-watermark` | Hidden watermark preparation, opt-out consequences and limitations | Public |
| `/terms`, `/privacy` | Terms & Conditions, Privacy Policy | Public |
| `/login`, `/register` | Authentication | Logged-out only |
| `/dashboard/*` | Dashboard, including `/dashboard/upload` | Logged-in only |
| `/dashboard/extract` | Real DCT extraction + AES-256-GCM decryption with the owner's passphrase | Logged-in only |
| `/verify` | Public copyright verification: disputed photo + passphrase → certificate & hash status | Public |

Access rules are enforced in `middleware.ts`, which also refreshes Supabase sessions. Unauthenticated users are redirected to `/login`, and logged-in users are redirected from `/login` and `/register` to `/dashboard`.

## 📁 Project Structure

```
photo-padusan/
├── .vscode/            # Editor settings
├── public/             # Static assets
├── scripts/            # Helper scripts
├── src/                # Application source (pages, components, utilities)
├── middleware.ts       # Supabase session refresh + route protection
├── next.config.ts      # Next.js configuration
├── postcss.config.mjs  # PostCSS / Tailwind configuration
├── eslint.config.mjs   # ESLint configuration
└── tsconfig.json       # TypeScript configuration
```

## 🚀 Getting Started

### Prerequisites

- **Node.js 20.9+** and npm
- A [Supabase](https://supabase.com) project
- A [Google AI Studio](https://aistudio.google.com) API key for Gemini

### 1. Clone the repository

```bash
git clone https://github.com/Achmad-D-Fajar/photo-padusan.git
cd photo-padusan
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file in the project root:

```env
# Supabase (Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Google Gemini (use the variable name your code expects)
GEMINI_API_KEY=your-gemini-api-key

# Server-only: account creation, storage finalization, signed downloads
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Canonical public URL used in photo pages and newly generated preview metadata
NEXT_PUBLIC_SITE_URL=https://padustock.vercel.app

# Vercel sends this bearer token to the daily staging cleanup job
CRON_SECRET=your-long-random-secret
```

> ⚠️ Never commit `.env.local`. It is already covered by `.gitignore`.
>
> If the Supabase variables are missing, the middleware skips authentication entirely, so make sure they are set.

### 4. Run the development server

Before running the updated upload flow, apply
[`supabase/migrations/202610240001_photo_uploads.sql`](supabase/migrations/202610240001_photo_uploads.sql)
in the Supabase SQL editor (or with your normal migration runner). It creates a
private `photo-uploads` staging bucket, raises the `originals` bucket limit to
50 MiB, adds owner storage policies, and installs an atomic limit of 20 AI
requests per user per hour shared by translation and analysis. The project's
global Storage file size limit must also allow at least 50 MiB. Existing
`originals` and `thumbnails` buckets and photo/profile policies are still required.

The browser sends image bytes directly to Storage because Vercel Functions
limit request bodies to 4.5 MB. Processing routes accept JSON references to the
authenticated user's staged file, check its stored size, and validate image
content before creating permanent files. Photos are limited to 80 megapixels.
HEIC/HEIF uses `heic-decode` because Sharp's prebuilt binaries lack HEVC decoding.
The npm override in `package.json` keeps Next.js and the app on the same Sharp
version. Preserve it during dependency updates and check `npm ls sharp` to avoid
shipping conflicting native image binaries in Vercel functions.
`next.config.ts` explicitly includes Sharp's native runtime packages in the
preview, analysis, and draft functions. If a deployment reports a missing
`libvips-cpp.so` library, install optional dependencies (`npm ci --include=optional`)
and redeploy with the existing Build Cache disabled.

Abandoned uploads are private and are deleted after 24 hours by the daily cron
in `vercel.json`. Set `CRON_SECRET` in Vercel. For other hosts, schedule an
authenticated GET to `/api/maintenance/uploads` daily with
`Authorization: Bearer <CRON_SECRET>`. Failed saves also clean their staged and
permanent files immediately. Free downloads redirect to a short-lived Storage
URL, so a 50 MB original does not pass through a function response.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📜 Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create an optimized production build |
| `npm run start` | Run the production build |
| `npm run lint` | Lint the codebase with ESLint |
| `npm test` | Run local security, upload lifecycle, and image processing regression tests |
| `npm run test:ui` | Review real pages and watermark frontend states with local fixtures at mobile/desktop widths |

For an additional real HEIC decoder check, set `HEIC_TEST_FILE` to a local HEIC
file before running `npm test`. Normal tests generate their own JPEG fixtures
and use mocked Supabase/Gemini services; they do not modify a deployed project.
Browser tests also start a separate Next app from `tests/ui/fixture-app` on
`127.0.0.1:3101` to exercise the extraction callback, including explicitly labeled
controlled success and failure responses. This component harness is outside the
production route tree. The main app and Supabase fixtures use ports 3100 and 54321.
New frontend checks include UTF-8 payload limits, manual/AI retries with unchanged
API bodies, extraction result states, clipboard errors, stale results, and blob URL
cleanup. Responsive extraction checks also cover 320, 375, 414, and 768 px widths.
Licensing migration tests also execute SQL triggers, roles, and RLS in an isolated
PGlite PostgreSQL engine. Its minimal public-view fixture is explicitly test-only,
not a reconstruction of the deployed view. It does not test live Supabase JWTs or
prove the configuration of a hosted project. Browser checks use a local mock
Supabase service; install Chromium once with `npx playwright install chromium`.
Alternatively, set `PLAYWRIGHT_CHANNEL=chrome` or `msedge` to use an installed browser.
Screenshots and reports are written to ignored `test-results/` and `playwright-report/`.

## ☁️ Deployment

The easiest way to deploy is with [Vercel](https://vercel.com/new):

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Add the environment variables above in **Project Settings → Environment Variables**.
4. Deploy.

See the [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for other options.

### Licensing and legal-document release

The local revised documents are prepared drafts: `src/lib/legal-documents.ts`
contains their versions/revision dates with `publishedOn: null`. This is not a
claim that they have been published or that a remote migration has run.

1. Establish the authorized Supabase project and deployment target. Apply
   `supabase/migrations/202610290001_photo_licensing.sql` to the existing schema.
   It requires `photos`, `vw_public_photos`, and the Supabase `anon`/`authenticated`
   roles. It does not replace the view or alter existing photo RLS. It backfills
   possible legacy exposure without inventing historical licensing timestamps.
2. Set each document's `publishedOn` to the actual release day (ISO `YYYY-MM-DD`)
   in the shared manifest. Freeze the versions for that text and deploy the
   corrected registration, notices, and documents. Future substantive revisions
   require new versions; do not backfill acceptance for existing accounts.
3. Verify free and external listings, full page/modal notices, and the new-account
   checkbox. Until activation, new photos are conservatively marked as possibly
   exposed to the previous blanket CC notice.
4. Only after verification, run `scripts/activate-photo-licensing.sql` against the
   authorized project. It preserves all prior history, marks photos existing at
   cutover conservatively, and enables ordinary tracking for subsequent photos.
   It is safe to repeat and is intentionally not part of automatic migration application.

Registration validates the acknowledgment and current document versions before
creating an account. The server stores versions and its timestamp in protected
Auth `app_metadata.legal_acknowledgment`, not a public profile or user-editable
metadata. Existing account/profile rollback remains in place.

License history is database-controlled and survives purchase-link/status changes.
After deletion, only photo ID, legacy uncertainty, and the first observed free
publication timestamp remain; deleted-photo records are hidden from public and
former-owner queries. This does not identify reuploads with a different ID and
does not claim that correcting notices revokes any valid prior grant.

If rolling back to the old blanket-CC interface, first establish authorization
and conservatively mark all existing history as possibly legacy-exposed and
disable `corrected_policy_active` in one transaction while blocking photo writes.
Do not silently resume old notices with ordinary tracking active.

New preview metadata contains attribution and the canonical photo reference,
without an unconditional reservation of all rights or an automatic CC grant.
Original files and existing embedded metadata are unchanged; no bulk regeneration
is performed. Ownership reports use the existing public GitHub Issues channel,
which should not receive private evidence or credentials.

## 📄 License

Published free photos use [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/): attribution, noncommercial use, and no sharing of adapted material, subject to applicable legal exceptions. External listings require checking the linked provider's applicable terms; not every listing offers identical commercial rights. Historical CC notices and recorded free publications are shown separately from current availability, and valid prior CC permissions continue. These photo permissions do not license the application source code.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome. Feel free to open an [issue](https://github.com/Achmad-D-Fajar/photo-padusan/issues) or submit a pull request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m "Add amazing feature"`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 👤 Author

**Achmad D. Fajar** – [@Achmad-D-Fajar](https://github.com/Achmad-D-Fajar)

System by **Desa Padusan**.
