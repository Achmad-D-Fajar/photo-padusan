import type { SupabaseClient, QueryData } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { escapeIlikePattern } from "@/lib/supabase/ilike";

export type SearchScope = "caption" | "uploader" | "tags";
export type SortBy = "created_at" | "caption";
export type SortOrder = "asc" | "desc";

const ALL_SCOPES: SearchScope[] = ["caption", "uploader", "tags"];

export interface PhotoQueryFilters {
  keyword?: string;
  scopes?: SearchScope[];
  startDate?: string;
  endDate?: string;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
  from: number;
  to: number;
}

// Kolom dari view `vw_public_photos` (migrasi 0007 & 0008) — satu level
// datar, tidak ada relasi bersarang `profiles { ... }`.
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

// Kolom dari tabel `photos` langsung (bukan view), karena Dashboard perlu
// menampilkan SEMUA status (draft/published/archived) milik diri sendiri —
// vw_public_photos sengaja hanya berisi status 'published'.
const MY_PHOTOS_SELECT = `
  id,
  thumbnail_url,
  caption,
  tags,
  microstock_url,
  status,
  created_at
`;

function buildOrConditions(
  escapedKeyword: string,
  activeScopes: SearchScope[]
): string[] {
  const conditions: string[] = [];

  if (activeScopes.includes("caption")) {
    conditions.push(`caption.ilike.%${escapedKeyword}%`);
  }
  if (activeScopes.includes("uploader")) {
    conditions.push(`display_name.ilike.%${escapedKeyword}%`);
    conditions.push(`full_name.ilike.%${escapedKeyword}%`);
  }
  if (activeScopes.includes("tags")) {
    conditions.push(`tags_text.ilike.%${escapedKeyword}%`);
  }

  return conditions;
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
    from,
    to,
  }: PhotoQueryFilters
) {
  let query = supabase
    .from("vw_public_photos")
    .select(PUBLIC_PHOTOS_SELECT, { count: "exact" });

  const trimmedKeyword = keyword.trim();
  if (trimmedKeyword.length > 0) {
    const escaped = escapeIlikePattern(trimmedKeyword);
    const activeScopes = scopes.length > 0 ? scopes : ALL_SCOPES;
    const orConditions = buildOrConditions(escaped, activeScopes);

    if (orConditions.length > 0) {
      query = query.or(orConditions.join(","));
    }
  }

  if (startDate.length > 0) {
    query = query.gte("created_at", startDate);
  }
  if (endDate.length > 0) {
    query = query.lte("created_at", `${endDate}T23:59:59.999`);
  }

  // Tie-breaker `id` memastikan urutan deterministik antar-halaman —
  // tanpa ini, baris dengan caption/created_at yang sama persis bisa
  // terlewat atau muncul dua kali saat berpindah halaman (offset
  // pagination rentan terhadap urutan yang tidak stabil).
  query = query
    .order(sortBy, { ascending: sortOrder === "asc" })
    .order("id", { ascending: true })
    .range(from, to);

  return query;
}

export function buildPhotographerPhotosQuery(
  supabase: SupabaseClient<Database>,
  userId: string,
  {
    keyword = "",
    scopes = [],
    startDate = "",
    endDate = "",
    sortBy = "created_at",
    sortOrder = "desc",
    from,
    to,
  }: PhotoQueryFilters
) {
  let query = supabase
    .from("vw_public_photos")
    .select(PUBLIC_PHOTOS_SELECT, { count: "exact" })
    .eq("user_id", userId);

  const trimmedKeyword = keyword.trim();
  if (trimmedKeyword.length > 0) {
    const escaped = escapeIlikePattern(trimmedKeyword);
    // Scope "uploader" sengaja diabaikan: seluruh foto di halaman ini
    // sudah pasti milik satu fotografer yang sama, jadi tidak pernah
    // mengubah hasil.
    const activeScopes = scopes.filter((s) => s !== "uploader");
    const effectiveScopes: SearchScope[] =
      activeScopes.length > 0 ? activeScopes : ["caption", "tags"];
    const orConditions = buildOrConditions(escaped, effectiveScopes);

    if (orConditions.length > 0) {
      query = query.or(orConditions.join(","));
    }
  }

  if (startDate.length > 0) {
    query = query.gte("created_at", startDate);
  }
  if (endDate.length > 0) {
    query = query.lte("created_at", `${endDate}T23:59:59.999`);
  }

  query = query
    .order(sortBy, { ascending: sortOrder === "asc" })
    .order("id", { ascending: true })
    .range(from, to);

  return query;
}

export function buildMyPhotosQuery(
  supabase: SupabaseClient<Database>,
  userId: string,
  {
    keyword = "",
    scopes = [],
    startDate = "",
    endDate = "",
    sortBy = "created_at",
    sortOrder = "desc",
    from,
    to,
  }: PhotoQueryFilters
) {
  let query = supabase
    .from("photos")
    .select(MY_PHOTOS_SELECT, { count: "exact" })
    .eq("user_id", userId);

  const trimmedKeyword = keyword.trim();
  if (trimmedKeyword.length > 0) {
    const escaped = escapeIlikePattern(trimmedKeyword);
    const activeScopes = scopes.filter((s) => s !== "uploader");
    const effectiveScopes: SearchScope[] =
      activeScopes.length > 0 ? activeScopes : ["caption", "tags"];
    const orConditions = buildOrConditions(escaped, effectiveScopes);

    if (orConditions.length > 0) {
      query = query.or(orConditions.join(","));
    }
  }

  if (startDate.length > 0) {
    query = query.gte("created_at", startDate);
  }
  if (endDate.length > 0) {
    query = query.lte("created_at", `${endDate}T23:59:59.999`);
  }

  query = query
    .order(sortBy, { ascending: sortOrder === "asc" })
    .order("id", { ascending: true })
    .range(from, to);

  return query;
}

export type PublicPhotosQuery = ReturnType<typeof buildPublicPhotosQuery>;
export type PublicPhotosResult = QueryData<PublicPhotosQuery>;
export type PublicPhotoItem = PublicPhotosResult[number];

export type PhotographerPhotosQuery = ReturnType<typeof buildPhotographerPhotosQuery>;
export type PhotographerPhotosResult = QueryData<PhotographerPhotosQuery>;

export type MyPhotosQuery = ReturnType<typeof buildMyPhotosQuery>;
export type MyPhotosResult = QueryData<MyPhotosQuery>;
export type MyPhotoItem = MyPhotosResult[number];