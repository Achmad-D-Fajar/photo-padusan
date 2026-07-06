import type { SupabaseClient, QueryData } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase"; 
import { escapeIlikePattern } from "@/lib/supabase/ilike";

export type SearchScope = "caption" | "uploader" | "tags";
export type SortBy = "created_at" | "caption_id" | "caption_en"; // Diperbarui untuk kolom bilingual
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

const PUBLIC_PHOTOS_SELECT = "id, user_id, thumbnail_url, caption_en, caption_id, tags_en, tags_id, tags_en_text, tags_id_text, microstock_url, created_at, display_name, full_name" as const;

const MY_PHOTOS_SELECT = "id, thumbnail_url, caption_en, caption_id, tags_en, tags_id, tags_en_text, tags_id_text, microstock_url, status, created_at" as const;

function buildOrConditions(
  escapedKeyword: string,
  activeScopes: SearchScope[]
): string[] {
  const conditions: string[] = [];

  if (activeScopes.includes("caption")) {
    conditions.push(`caption_en.ilike.%${escapedKeyword}%`);
    conditions.push(`caption_id.ilike.%${escapedKeyword}%`);
  }
  if (activeScopes.includes("uploader")) {
    conditions.push(`display_name.ilike.%${escapedKeyword}%`);
    conditions.push(`full_name.ilike.%${escapedKeyword}%`);
  }
  if (activeScopes.includes("tags")) {
    conditions.push(`tags_en_text.ilike.%${escapedKeyword}%`);
    conditions.push(`tags_id_text.ilike.%${escapedKeyword}%`);
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

// Bypassing Supabase's automatic string inference to guarantee 100% type safety
export type PublicPhotoItem = Database["public"]["Views"]["vw_public_photos"]["Row"];

export type MyPhotoItem = Pick<
  Database["public"]["Tables"]["photos"]["Row"],
  "id" | "thumbnail_url" | "caption_en" | "caption_id" | "tags_en" | "tags_id" | "tags_en_text" | "tags_id_text" | "microstock_url" | "status" | "created_at"
>;

// Keep the query types for component props if needed
export type PublicPhotosQuery = ReturnType<typeof buildPublicPhotosQuery>;
export type PhotographerPhotosQuery = ReturnType<typeof buildPhotographerPhotosQuery>;
export type MyPhotosQuery = ReturnType<typeof buildMyPhotosQuery>;