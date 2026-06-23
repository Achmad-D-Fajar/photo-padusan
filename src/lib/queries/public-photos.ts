import type { SupabaseClient, QueryData } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// Select string didefinisikan sekali di sini agar konsisten dipakai
// oleh page.tsx maupun kode lain yang mungkin butuh query serupa.
const PUBLIC_PHOTOS_SELECT = `
  id,
  thumbnail_url,
  caption,
  tags,
  microstock_url,
  created_at,
  profiles ( display_name, full_name )
`;

// % dan _ adalah wildcard pada operator ILIKE, harus di-escape agar
// keyword pengguna tidak diperlakukan sebagai pattern matching liar.
function escapeIlikePattern(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

export function buildPublicPhotosQuery(
  supabase: SupabaseClient<Database>,
  keyword: string
) {
  let query = supabase
    .from("photos")
    .select(PUBLIC_PHOTOS_SELECT)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (keyword.length > 0) {
    const escapedForIlike = escapeIlikePattern(keyword);

    // Gabungan dua kondisi via OR:
    // 1. caption.ilike  -> substring match, case-insensitive.
    // 2. tags.cs        -> jsonb "contains" check, exact match (case-sensitive)
    //    terhadap salah satu elemen array tags.
    // Catatan: pencarian pada tags TIDAK mendukung substring parsial
    // (mis. "saw" tidak akan match tag "sawah"). Untuk itu diperlukan
    // full-text search atau RPC khusus di iterasi berikutnya.
    query = query.or(
      `caption.ilike.%${escapedForIlike}%,tags.cs.["${keyword}"]`
    );
  }

  return query;
}

// QueryData mem-parsing select string di atas terhadap metadata
// `Relationships` pada tipe Database, sehingga field `profiles` otomatis
// bertipe akurat: { display_name: string; full_name: string | null } | null
// — bukan `any[]` atau `never` seperti yang terjadi tanpa Relationships.
export type PublicPhotosQuery = ReturnType<typeof buildPublicPhotosQuery>;
export type PublicPhotosResult = QueryData<PublicPhotosQuery>;
export type PublicPhotoItem = PublicPhotosResult[number];