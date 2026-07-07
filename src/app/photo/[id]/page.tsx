import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProtectedImage from "@/components/shared/ProtectedImage";

interface PhotoPageProps {
  params: Promise<{ id: string }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://etalasepadusan.com";

const LICENSE_URL = "https://creativecommons.org/licenses/by-nc-nd/4.0/";

async function getPhoto(id: string) {
  const supabase = await createClient();
  const { data: photo, error } = await supabase
    .from("vw_public_photos")
    .select("id, user_id, thumbnail_url, caption_en, caption_id, tags_en, tags_id, microstock_url, status, created_at, display_name, full_name")
    .eq("id", id)
    .single();

  if (error || !photo) return null;
  return photo;
}

export async function generateMetadata({
  params,
}: PhotoPageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Foto tidak ditemukan" };

  const photo = await getPhoto(id);
  if (!photo) return { title: "Foto tidak ditemukan" };

  const photographerName = photo.full_name || `@${photo.display_name}`;
  // Bilingual title: Indonesian first for local SEO signal, English for global
  const bilingualTitle = `${photo.caption_id ?? photo.caption_en} | ${photo.caption_en ?? photo.caption_id}`;

  return {
    title: bilingualTitle,
    description: `${photo.caption_id} — ${photo.caption_en}. Foto oleh ${photographerName} di Etalase Padusan.`,
    openGraph: {
      type: "article",
      url: `${SITE_URL}/photo/${photo.id}`,
      title: bilingualTitle,
      description: `Foto oleh ${photographerName}`,
      images: photo.thumbnail_url
        ? [{ url: photo.thumbnail_url, alt: `${photo.caption_id} | ${photo.caption_en}` }]
        : [],
      siteName: "Etalase Padusan",
    },
    twitter: {
      card: "summary_large_image",
      title: bilingualTitle,
      description: `Foto oleh ${photographerName}`,
      images: photo.thumbnail_url ? [photo.thumbnail_url] : [],
    },
    alternates: { canonical: `${SITE_URL}/photo/${photo.id}` },
  };
}

export default async function PhotoPage({ params }: PhotoPageProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const photo = await getPhoto(id);
  if (!photo) notFound();

  const photographerName   = photo.full_name || `@${photo.display_name}`;
  const photographerPageUrl = `${SITE_URL}/photographer/${photo.display_name}`;
  const photoPageUrl        = `${SITE_URL}/photo/${photo.id}`;
  const uploadDateIso       = new Date(photo.created_at).toISOString().split("T")[0];

  // Deduplicated tag union — Indonesian tags first so local keywords appear early
  const combinedTags = [
    ...new Set([
      ...(photo.tags_id ?? []),
      ...(photo.tags_en ?? []),
    ]),
  ];

  // JSON-LD with bilingual signals for Google Image Search Licensable badge
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    "@id": photoPageUrl,
    name: photo.caption_en,         // English name for international crawlers
    description: photo.caption_id,  // Indonesian description for local SEO
    contentUrl: photo.thumbnail_url ?? "",
    thumbnailUrl: photo.thumbnail_url ?? "",
    keywords: combinedTags.join(", "),
    uploadDate: uploadDateIso,
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
    license: LICENSE_URL,
    acquireLicensePage: photo.microstock_url ?? photoPageUrl,
    creditText: `${photographerName} / Etalase Padusan`,
    publisher: {
      "@type": "Organization",
      name: "Etalase Padusan",
      url: SITE_URL,
    },
    url: photoPageUrl,
  };

  return (
    <>
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
              {photo.caption_id ?? photo.caption_en}
            </li>
          </ul>
        </nav>

        <div className="card bg-base-100 border border-base-300 shadow-md overflow-hidden">
          <figure className="bg-base-200">
            {photo.thumbnail_url && (
              <ProtectedImage
                src={photo.thumbnail_url}
                // Bilingual alt: Indonesian for local image search, English for global
                alt={`${photo.caption_id} | ${photo.caption_en}`}
                className="w-full max-h-[70vh] object-contain"
              />
            )}
          </figure>

          <div className="card-body">
            {/* Indonesian caption as h1 — primary SEO signal for local search */}
            <h1 className="text-2xl font-bold leading-snug">
              {photo.caption_id ?? "Tanpa judul"}
            </h1>

            {/* English caption as h2 — secondary signal for global/microstock search */}
            {photo.caption_en && (
              <h2 className="text-base font-normal text-base-content/60 mt-1">
                {photo.caption_en}
              </h2>
            )}

            <div className="flex items-center justify-between flex-wrap gap-2 text-sm mt-3">
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

            {/* Combined deduplicated tags from both languages */}
            {combinedTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {combinedTags.map((tag, idx) => (
                  <span key={idx} className="badge badge-outline">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="card-actions mt-6">
              {photo.microstock_url ? (
                // Microstock photo: external purchase link
                <a
                  href={photo.microstock_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary flex-1"
                >
                  Beli di Microstock
                </a>
              ) : (
                // Platform-only photo: force-download through our proxy route.
                // `download` attribute hints to the browser; the server enforces
                // it via Content-Disposition: attachment regardless.
                <a
                  href={`/api/photos/download/${photo.id}`}
                  download
                  className="btn btn-success flex-1"
                >
                  Download Resolusi Asli
                </a>
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