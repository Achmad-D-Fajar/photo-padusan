# 📸 Padustock

**Padustock** is a community-based digital photo gallery and microstock platform for **Desa Padusan** (Padusan Village). Local photographers upload their work, and visitors can browse, download for free, or buy photos to support the photographers directly.

🔗 **Live site:** [padustock.vercel.app](https://padustock.vercel.app)

> The interface is in Indonesian, and the repository is named `photo-padusan`.

---

## ✨ Features

- **Photo gallery** – Browse community photos with pagination and a per-page selector.
- **Search & filters** – Filter by caption, uploader, tags, and date range.
- **Sorting** – Sort by newest, or alphabetically (ID / EN), ascending or descending.
- **Free download / buy** – Each photo offers a free download or a purchase option that supports the photographer.
- **Photo detail pages** – Every photo has its own page (`/photo/[id]`).
- **Photographer profiles** – View all works by a photographer (`/photographer/[username]`).
- **Upload dashboard** – Registered users upload their work at `/dashboard/upload`.
- **AI-assisted captions** – Google Gemini helps generate photo descriptions, with the option to write captions and tags manually.
- **Image & EXIF handling** – Server-side processing with `sharp` and `piexifjs`.
- **50 MB photo uploads, including HEIC/HEIF** – Files upload directly to Supabase; HEIC is decoded on the server and shown as a JPEG preview. Original downloads preserve the uploaded format.
- **Authentication** – Register / log in with Supabase Auth; `/dashboard/*` is protected by middleware.
- **Open licensing** – Unless stated otherwise, all photos are licensed under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/).

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
| `/terms`, `/privacy` | Terms & Conditions, Privacy Policy | Public |
| `/login`, `/register` | Authentication | Logged-out only |
| `/dashboard/*` | Dashboard, including `/dashboard/upload` | Logged-in only |

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

For an additional real HEIC decoder check, set `HEIC_TEST_FILE` to a local HEIC
file before running `npm test`. Normal tests generate their own JPEG fixtures
and use mocked Supabase/Gemini services; they do not modify a deployed project.

## ☁️ Deployment

The easiest way to deploy is with [Vercel](https://vercel.com/new):

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Add the environment variables above in **Project Settings → Environment Variables**.
4. Deploy.

See the [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for other options.

## 📄 License

Photos on Padustock are licensed under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) unless stated otherwise. Add a separate license for the source code if you want others to reuse it.

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
