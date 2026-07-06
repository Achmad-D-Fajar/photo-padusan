import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ModalUI from "@/components/shared/ModalUI";
import ProtectedImage from "@/components/shared/ProtectedImage";
import Link from "next/link";
import type { PublicPhotoItem } from "@/lib/queries/public-photos";

interface ModalPhotoPageProps {
  params: Promise<{ id: string }>;
}

function getPhotographerLabel(photo: PublicPhotoItem): string {
  if (photo.full_name && photo.full_name.trim().length > 0) {
    return photo.full_name;
  }
  return `@${photo.display_name}`;
}

function getPhotographerHref(photo: PublicPhotoItem): string {
  return `/photographer/${photo.display_name}`;
}

export default async function ModalPhotoPage({ params }: ModalPhotoPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Single-line select to prevent inference crashing
  const { data: photo, error } = await supabase
    .from("vw_public_photos")
    .select("id, user_id, thumbnail_url, caption_en, caption_id, tags_en, tags_id, microstock_url, created_at, display_name, full_name")
    .eq("id", id)
    .single();

  if (error || !photo) notFound();

  const typedPhoto = photo as PublicPhotoItem;

  const combinedTags = [
    ...new Set([
      ...(typedPhoto.tags_id ?? []),
      ...(typedPhoto.tags_en ?? []),
    ]),
  ];

  return (
    <ModalUI>
      <figure className="aspect-video overflow-hidden bg-base-200">
        {typedPhoto.thumbnail_url && (
          <ProtectedImage
            src={typedPhoto.thumbnail_url}
            alt={`${typedPhoto.caption_id ?? "Tanpa judul"} | ${typedPhoto.caption_en ?? ""}`}
            className="w-full h-full object-contain"
          />
        )}
      </figure>

      <div className="p-6 space-y-4">
        <h2 className="text-xl font-bold leading-snug">
          {typedPhoto.caption_id ?? "Tanpa judul"}
        </h2>

        {typedPhoto.caption_en && (
          <p className="text-sm text-base-content/60 -mt-2">
            {typedPhoto.caption_en}
          </p>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <Link
            href={getPhotographerHref(typedPhoto)}
            className="text-sm font-medium hover:text-primary hover:underline"
          >
            {getPhotographerLabel(typedPhoto)}
          </Link>
          <time
            dateTime={new Date(typedPhoto.created_at).toISOString().split("T")[0]}
            className="text-xs text-base-content/50"
          >
            {new Date(typedPhoto.created_at).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        </div>

        {combinedTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {combinedTags.map((tag, idx) => (
              <span key={idx} className="badge badge-outline">
                {tag}
              </span>
            ))}
          </div>
        )}

        {typedPhoto.microstock_url ? (
          <a
            href={typedPhoto.microstock_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary w-full"
          >
            Beli / Unduh Resolusi Tinggi
          </a>
        ) : (
          <button type="button" className="btn btn-disabled w-full" disabled>
            Tautan belum tersedia
          </button>
        )}
      </div>
    </ModalUI>
  );
}