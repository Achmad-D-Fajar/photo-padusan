import type { SupabaseClient, QueryData } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { escapeIlikePattern } from "@/lib/supabase/ilike";

export type SearchScope = "caption" | "uploader" | "tags";
export type SortBy = "created_at" | "caption";
export type SortOrder = "asc" | "desc";

const ALL_SCOPES: SearchScope[] = ["caption", "uploader", "tags"];

// Kolom diambil dari view `vw_public_photos` (migrasi 0007) — sudah satu
// level datar, tidak ada lagi relasi bersarang `profiles { ... }` seperti
// implementasi sebelumnya.
const PUBLIC_PHOTOS_SELECT = `
  id,
  user_id,
  thumbnail_url,
  caption,
  tags,
  microstock_url,
  created_at,
  display_name,
  full_name
`;

export interface BuildPublicPhotosQueryParams {
  keyword?: string;
  scopes?: SearchScope[];
  startDate?: string;
  endDate?: string;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
}

export function buildPublicPhotosQuery(
  supabase: SupabaseClient<Database>,
  {
    keyword = "",
    scopes = [],
    startDate = "",
    endDate = "",
    sortBy = "created_at",
    sortOrder = "desc",
  }: BuildPublicPhotosQueryParams
) {
  let query = supabase.from("vw_public_photos").select(PUBLIC_PHOTOS_SELECT);

  const trimmedKeyword = keyword.trim();
  if (trimmedKeyword.length > 0) {
    const escaped = escapeIlikePattern(trimmedKeyword);

    // scopes kosong = default: cari di SEMUA lingkup (caption, uploader,
    // tags). Jika user mencentang scope tertentu, batasi hanya ke situ.
    const activeScopes = scopes.length > 0 ? scopes : ALL_SCOPES;

    const orConditions: string[] = [];
    if (activeScopes.includes("caption")) {
      orConditions.push(`caption.ilike.%${escaped}%`);
    }
    if (activeScopes.includes("uploader")) {
      orConditions.push(`display_name.ilike.%${escaped}%`);
      orConditions.push(`full_name.ilike.%${escaped}%`);
    }
    if (activeScopes.includes("tags")) {
      // tags_text adalah kolom agregasi di view (lihat migrasi 0007).
      // Tidak ikut di-SELECT karena tidak ditampilkan ke UI, tapi tetap
      // valid dipakai sebagai filter karena kolom asli pada view.
      orConditions.push(`tags_text.ilike.%${escaped}%`);
    }

    if (orConditions.length > 0) {
      query = query.or(orConditions.join(","));
    }
  }

  if (startDate.length > 0) {
    query = query.gte("created_at", startDate);
  }

  if (endDate.length > 0) {
    // Akhiri di penghujung hari tersebut agar tanggal akhir inklusif,
    // bukan terpotong tepat di pukul 00:00.
    query = query.lte("created_at", `${endDate}T23:59:59.999`);
  }

  query = query.order(sortBy, { ascending: sortOrder === "asc" });

  return query;
}

export function buildPhotographerPhotosQuery(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  return supabase
    .from("vw_public_photos")
    .select(PUBLIC_PHOTOS_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
}

export type PublicPhotosQuery = ReturnType<typeof buildPublicPhotosQuery>;
export type PublicPhotosResult = QueryData<PublicPhotosQuery>;
export type PublicPhotoItem = PublicPhotosResult[number];

export type PhotographerPhotosQuery = ReturnType<
  typeof buildPhotographerPhotosQuery
>;
export type PhotographerPhotosResult = QueryData<PhotographerPhotosQuery>;