import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProtectedImage from "@/components/shared/ProtectedImage";

interface PhotoPageProps {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://paduphoto.vercel.app"; 
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

export async function generateMetadata({ params }: PhotoPageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Foto tidak ditemukan" };

  const photo = await getPhoto(id);
  if (!photo) return { title: "Foto tidak ditemukan" };

  const photographerName = photo.full_name || `@${photo.display_name}`;
  const bilingualTitle = `${photo.caption_id ?? photo.caption_en} | ${photo.caption_en ?? photo.caption_id}`;

  return {
    title: bilingualTitle,
    description: `${photo.caption_id} — ${photo.caption_en}. Foto di Desa Padusanoleh ${photographerName} - PaduPhoto.`,
    openGraph: {
      type: "article",
      url: `${SITE_URL}/photo/${photo.id}`,
      title: bilingualTitle,
      description: `Foto oleh ${photographerName}`,
      images: photo.thumbnail_url ? [{ url: photo.thumbnail_url, alt: `${photo.caption_id} | ${photo.caption_en}` }] : [],
      siteName: "PaduPhoto",
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

  const combinedTags = [...new Set([...(photo.tags_id ?? []), ...(photo.tags_en ?? [])])];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    "@id": photoPageUrl,
    name: photo.caption_en,
    description: photo.caption_id,
    contentUrl: photo.thumbnail_url ?? "",
    thumbnailUrl: photo.thumbnail_url ?? "",
    keywords: combinedTags.join(", "),
    uploadDate: uploadDateIso,
    creator: { "@type": "Person", name: photographerName, url: photographerPageUrl },
    copyrightHolder: { "@type": "Person", name: photographerName, url: photographerPageUrl },
    copyrightYear: new Date(photo.created_at).getUTCFullYear(),
    license: LICENSE_URL,
    acquireLicensePage: photo.microstock_url ?? photoPageUrl,
    creditText: `${photographerName} / PaduPhoto - Desa Padusan`,
    publisher: { "@type": "Organization", name: "PaduPhoto", url: SITE_URL },
    url: photoPageUrl,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <nav className="text-lg font-bold mb-8 flex flex-wrap gap-2 items-center">
          <Link href="/" className="text-[#332288] underline hover:bg-[#332288] hover:text-[#E5E5E5] px-2 py-1 transition-colors border-2 border-transparent focus:border-[#111111]">
            PaduPhoto
          </Link>
          <span>/</span>
          <Link href={`/photographer/${photo.display_name}`} className="text-[#332288] underline hover:bg-[#332288] hover:text-[#E5E5E5] px-2 py-1 transition-colors border-2 border-transparent focus:border-[#111111]">
            {photographerName}
          </Link>
          <span>/</span>
          <span className="bg-[#111111] text-white px-3 py-1 truncate max-w-[200px] sm:max-w-xs uppercase tracking-tight">
            FOTO
          </span>
        </nav>

        <div className="card bg-white border-4 border-[#111111] shadow-[12px_12px_0px_#111111] rounded-none overflow-hidden">
          <figure className="bg-[#E5E5E5] border-b-4 border-[#111111] p-4 sm:p-8">
            {photo.thumbnail_url && (
              <ProtectedImage
                src={photo.thumbnail_url}
                alt={`${photo.caption_id} | ${photo.caption_en}`}
                className="w-full max-h-[70vh] object-contain border-2 border-[#111111] shadow-[4px_4px_0px_#111111] bg-white"
              />
            )}
          </figure>

          <div className="p-6 sm:p-10">
            <h1 className="font-display text-4xl sm:text-5xl font-bold leading-tight uppercase text-[#111111]">
              {photo.caption_id ?? "Tanpa judul"}
            </h1>

            {photo.caption_en && (
              <h2 className="text-xl font-bold text-[#111111] bg-[#88CCEE] border-2 border-[#111111] px-4 py-2 mt-4 inline-block shadow-[4px_4px_0px_#111111]">
                {photo.caption_en}
              </h2>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-lg mt-8 p-4 bg-[#E5E5E5] border-2 border-[#111111]">
              <div className="flex flex-col">
                <span className="text-sm font-bold uppercase tracking-widest text-[#111111]">Fotografer</span>
                <Link
                  href={`/photographer/${photo.display_name}`}
                  className="text-[#332288] font-bold text-2xl hover:bg-[#332288] hover:text-[#E5E5E5] px-2 -mx-2 transition-colors"
                >
                  {photographerName}
                </Link>
              </div>
              <time dateTime={uploadDateIso} className="text-[#111111] font-bold text-xl sm:text-right border-t-2 sm:border-t-0 sm:border-l-2 border-[#111111] pt-2 sm:pt-0 sm:pl-4">
                {new Date(photo.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
              </time>
            </div>

            {combinedTags.length > 0 && (
              <div className="mt-8">
                <h3 className="font-bold text-sm uppercase tracking-widest mb-3">Tags</h3>
                <div className="flex flex-wrap gap-3">
                  {combinedTags.map((tag, idx) => (
                    <span key={idx} className="badge bg-[#44AA99] text-[#111111] border-2 border-[#111111] rounded-none font-bold text-base px-4 py-4 shadow-[4px_4px_0px_#111111] hover:bg-[#111111] hover:text-[#44AA99] transition-colors cursor-default">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-10 pt-8 border-t-4 border-[#111111]">
              {photo.microstock_url ? (
                <a
                  href={photo.microstock_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn bg-[#332288] hover:bg-[#20155c] text-[#E5E5E5] border-2 border-[#111111] rounded-none font-bold text-xl sm:text-2xl h-auto py-4 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all w-full uppercase"
                >
                  Beli Resolusi Tinggi di Microstock
                </a>
              ) : (
                <a
                  href={`/api/photos/download/${photo.id}`}
                  download
                  className="btn bg-[#117733] hover:bg-[#0e5c27] text-[#E5E5E5] border-2 border-[#111111] rounded-none font-bold text-xl sm:text-2xl h-auto py-4 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all w-full uppercase"
                >
                  Download Gratis (Resolusi Asli)
                </a>
              )}
            </div>

            <div className="bg-[#E5E5E5] border-2 border-[#111111] p-4 mt-6">
              <p className="text-base font-bold text-[#111111]">
                INFO LISENSI:{" "}
                <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="text-[#332288] underline hover:bg-[#332288] hover:text-white px-1">
                  CC BY-NC-ND 4.0
                </a>
                . Penggunaan komersial memerlukan lisensi terpisah dari platform microstock fotografer.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}