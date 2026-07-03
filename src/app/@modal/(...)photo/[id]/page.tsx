import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ModalUI from "@/components/shared/ModalUI";
import ProtectedImage from "@/components/shared/ProtectedImage";
import Link from "next/link"; // Tambahkan import Link

interface ModalPhotoPageProps {
  params: Promise<{ id: string }>;
}

// Fungsi helper dipindahkan ke sini karena ini sekarang Server Component mandiri
function getPhotographerLabel(photo: any): string {
  if (photo.full_name && photo.full_name.trim().length > 0) {
    return photo.full_name;
  }
  return `@${photo.display_name}`;
}

function getPhotographerHref(photo: any): string {
  return `/photographer/${photo.display_name}`;
}

function formatUploadDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function ModalPhotoPage({ params }: ModalPhotoPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: photo, error } = await supabase
    .from("vw_public_photos")
    .select(
      "id, thumbnail_url, caption, tags, microstock_url, display_name, full_name, created_at"
    )
    .eq("id", id)
    .single();

  if (error || !photo) {
    notFound();
  }

  return (
    <ModalUI>
      <figure className="aspect-video overflow-hidden bg-base-200">
        {photo.thumbnail_url && (
          <ProtectedImage
            src={photo.thumbnail_url}
            alt={photo.caption}
            className="w-full h-full object-contain"
          />
        )}
      </figure>

      <div className="p-6 space-y-4">
        <h2 className="text-xl font-bold leading-snug">{photo.caption}</h2>

        {/* Elemen Pengunggah dan Tanggal Dikembalikan */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href={getPhotographerHref(photo)}
            className="text-sm font-medium hover:text-primary hover:underline"
          >
            Oleh {getPhotographerLabel(photo)}
          </Link>
          <span className="text-xs text-base-content/50">
            {formatUploadDate(photo.created_at)}
          </span>
        </div>

        {Array.isArray(photo.tags) && photo.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photo.tags.map((tag: string, idx: number) => (
              <span key={idx} className="badge badge-outline">
                {tag}
              </span>
            ))}
          </div>
        )}

        {photo.microstock_url && (
          <a
            href={photo.microstock_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm w-full"
          >
            Beli / Unduh Resolusi Tinggi
          </a>
        )}
      </div>
    </ModalUI>
  );
}