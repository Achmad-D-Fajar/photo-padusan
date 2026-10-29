import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ModalUI from "@/components/shared/ModalUI";
import ProtectedImage from "@/components/shared/ProtectedImage";
import Link from "next/link";
import type { PublicPhotoItem } from "@/lib/queries/public-photos";
import { attachLicenseHistory } from "@/lib/queries/photo-license-history";
import { PhotoLicenseAction } from "@/components/shared/PhotoLicense";

interface ModalPhotoPageProps {
  params: Promise<{ id: string }>;
}

function getPhotographerLabel(photo: Pick<PublicPhotoItem, "full_name" | "display_name">): string {
  return photo.full_name && photo.full_name.trim().length > 0 ? photo.full_name : `@${photo.display_name}`;
}

function getPhotographerHref(photo: Pick<PublicPhotoItem, "display_name">): string {
  return `/photographer/${photo.display_name}`;
}

export default async function ModalPhotoPage({ params }: ModalPhotoPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: photo, error } = await supabase
    .from("vw_public_photos")
    .select("id, user_id, thumbnail_url, caption_en, caption_id, tags_en, tags_id, microstock_url, created_at, display_name, full_name")
    .eq("id", id)
    .single();

  if (error || !photo) notFound();
  const typedPhoto = (await attachLicenseHistory(supabase, [photo]))[0];
  const combinedTags = [...new Set([...(typedPhoto.tags_id ?? []), ...(typedPhoto.tags_en ?? [])])];

  return (
    <ModalUI>
      <figure className="aspect-video bg-[#E5E5E5] border-b-4 border-[#111111] flex items-center justify-center p-4">
        {typedPhoto.thumbnail_url && (
          <ProtectedImage
            src={typedPhoto.thumbnail_url}
            alt={`${typedPhoto.caption_id ?? "Foto"} | ${typedPhoto.caption_en ?? "Photo"}`}
            className="w-full h-full object-contain border-2 border-[#111111] shadow-[4px_4px_0px_#111111]"
          />
        )}
      </figure>

      <div className="p-8 space-y-6">
        <h2 className="font-display text-3xl font-bold leading-snug uppercase text-[#111111]">
          {typedPhoto.caption_id ?? "Foto tanpa judul"}
        </h2>

        <p className="text-lg font-bold italic text-[#111111] -mt-4 bg-[#88CCEE] border-2 border-[#111111] px-3 py-1 inline-block shadow-[2px_2px_0px_#111111]">
          {typedPhoto.caption_en ?? "Untitled photo"}
        </p>

        <div className="flex items-center justify-between flex-wrap gap-4 pt-2 border-t-2 border-[#111111]">
          <Link href={getPhotographerHref(typedPhoto)} className="font-bold text-[#332288] underline hover:bg-[#332288] hover:text-[#E5E5E5] text-lg px-2 -ml-2">
            {getPhotographerLabel(typedPhoto)}
          </Link>
          <time dateTime={new Date(typedPhoto.created_at).toISOString().split("T")[0]} className="text-sm font-bold text-[#111111]/70">
            {new Date(typedPhoto.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
          </time>
        </div>

        {combinedTags.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {combinedTags.map((tag, idx) => (
              <span key={idx} className="bg-[#44AA99] text-[#111111] border-2 border-[#111111] font-bold text-sm px-3 py-1 shadow-[2px_2px_0px_#111111] uppercase">
                {tag}
              </span>
            ))}
          </div>
        )}

        <PhotoLicenseAction photo={typedPhoto} />
      </div>
    </ModalUI>
  );
}
