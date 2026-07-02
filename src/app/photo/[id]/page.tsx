import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProtectedImage from "@/components/shared/ProtectedImage";

interface PhotoPageProps {
  params: Promise<{ id: string }>;
}

// UUID v4 format — reject anything else immediately to prevent
// unnecessary DB round-trips from crawler probes or URL scanners.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://etalasepadusan.com";

// LICENSE and RIGHTS_STATEMENT are constants you can customise.
// CC BY-NC-ND 4.0 is a sensible default for a stock photo aggregator:
// attribution required, non-commercial, no derivatives, must link to
// microstock page to acquire a commercial licence.
const LICENSE_URL = "https://creativecommons.org/licenses/by-nc-nd/4.0/";

async function getPhoto(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vw_public_photos")
    .select(
      "id, thumbnail_url, caption, tags, microstock_url, created_at, display_name, full_name"
    )
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data;
}

export async function generateMetadata({
  params,
}: PhotoPageProps): Promise<Metadata> {
  const { id } = await params;

  if (!UUID_RE.test(id)) return { title: "Foto tidak ditemukan" };

  const photo = await getPhoto(id);
  if (!photo) return { title: "Foto tidak ditemukan" };

  const photographerName =
    photo.full_name || `@${photo.display_name}`;

  return {
    title: photo.caption,
    description: `${photo.caption} — oleh ${photographerName} di Etalase Padusan.`,
    openGraph: {
      type: "article",
      url: `${SITE_URL}/photo/${photo.id}`,
      title: photo.caption,
      description: `${photo.caption} — oleh ${photographerName}`,
      images: photo.thumbnail_url
        ? [
            {
              url: photo.thumbnail_url,
              alt: photo.caption,
            },
          ]
        : [],
      siteName: "Etalase Padusan",
    },
    twitter: {
      card: "summary_large_image",
      title: photo.caption,
      description: `Foto oleh ${photographerName}`,
      images: photo.thumbnail_url ? [photo.thumbnail_url] : [],
    },
    // Prevent indexing of the raw thumbnail URL itself; the canonical
    // page URL carries the SEO value.
    alternates: {
      canonical: `${SITE_URL}/photo/${photo.id}`,
    },
  };
}

export default async function PhotoPage({ params }: PhotoPageProps) {
  const { id } = await params;

  if (!UUID_RE.test(id)) notFound();

  const photo = await getPhoto(id);
  if (!photo) notFound();

  const photographerName = photo.full_name || `@${photo.display_name}`;
  const photographerPageUrl = `${SITE_URL}/photographer/${photo.display_name}`;
  const photoPageUrl = `${SITE_URL}/photo/${photo.id}`;

  const uploadDateIso = new Date(photo.created_at).toISOString().split("T")[0];

  // ── JSON-LD: schema.org/ImageObject ────────────────────────────────────────
  // Google Image Search uses these fields for rich results and licensing
  // information displayed on mouseover / in the Licensing panel.
  //
  // See: https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    "@id": photoPageUrl,

    // ── Content ──────────────────────────────────────────────────────────────
    name: photo.caption,
    description: photo.caption,
    contentUrl: photo.thumbnail_url ?? "",
    thumbnailUrl: photo.thumbnail_url ?? "",
    keywords: Array.isArray(photo.tags) ? photo.tags.join(", ") : "",
    uploadDate: uploadDateIso,

    // ── Creator / Rights ─────────────────────────────────────────────────────
    creator: {
      "@type": "Person",
      name: photographerName,
      url: photographerPageUrl,
    },
    copyrightHolder: {
      "@type": "Person",
      name: photographerName,
      url: photographerPageUrl,
    },
    copyrightYear: new Date(photo.created_at).getUTCFullYear(),

    // ── Licensing (Google Image Search "Licensable" badge) ───────────────────
    // `license` points to the usage licence terms.
    // `acquireLicensePage` tells Google where a buyer can obtain a licence.
    // Both fields are required for the Licensable badge to appear.
    license: LICENSE_URL,
    acquireLicensePage: photo.microstock_url ?? photoPageUrl,

    // ── Attribution ──────────────────────────────────────────────────────────
    creditText: `${photographerName} / Etalase Padusan`,

    // ── Publisher ────────────────────────────────────────────────────────────
    publisher: {
      "@type": "Organization",
      name: "Etalase Padusan",
      url: SITE_URL,
    },

    // ── Canonical page URL ───────────────────────────────────────────────────
    url: photoPageUrl,
  };

  return (
    <>
      {/* Inject JSON-LD into <head> via Next.js script tag */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="container mx-auto px-4 py-10 max-w-3xl">
        <nav className="text-sm breadcrumbs mb-6">
          <ul>
            <li>
              <Link href="/">Etalase</Link>
            </li>
            <li>
              <Link href={`/photographer/${photo.display_name}`}>
                {photographerName}
              </Link>
            </li>
            <li className="text-base-content/60 truncate max-w-xs">
              {photo.caption}
            </li>
          </ul>
        </nav>

        <div className="card bg-base-100 border border-base-300 shadow-md overflow-hidden">
          <figure className="bg-base-200">
            {photo.thumbnail_url && (
              <ProtectedImage
                src={photo.thumbnail_url}
                alt={photo.caption}
                className="w-full max-h-[70vh] object-contain"
              />
            )}
          </figure>

          <div className="card-body">
            <h1 className="card-title text-xl">{photo.caption}</h1>

            <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
              <Link
                href={`/photographer/${photo.display_name}`}
                className="hover:text-primary hover:underline font-medium"
              >
                {photographerName}
              </Link>
              <time
                dateTime={uploadDateIso}
                className="text-base-content/50 text-xs"
              >
                {new Date(photo.created_at).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              {Array.isArray(photo.tags) &&
                photo.tags.map((tag, idx) => (
                  <span key={idx} className="badge badge-outline">
                    {tag}
                  </span>
                ))}
            </div>

            <div className="card-actions mt-6">
              {photo.microstock_url ? (
                <a
                  href={photo.microstock_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary flex-1"
                >
                  Beli / Unduh Resolusi Tinggi
                </a>
              ) : (
                <button type="button" className="btn btn-disabled flex-1" disabled>
                  Tautan belum tersedia
                </button>
              )}
            </div>

            <p className="text-xs text-base-content/40 mt-4">
              Lisensi:{" "}
              <a
                href={LICENSE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                CC BY-NC-ND 4.0
              </a>
              . Penggunaan komersial memerlukan lisensi terpisah dari halaman
              microstock fotografer.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}