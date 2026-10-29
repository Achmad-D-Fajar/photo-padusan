import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { PhotoLicenseHistory } from "@/lib/photo-licensing";

// Read separately: do not replace or guess the deployed public view's definition.
export async function attachLicenseHistory<T extends { id: string }>(supabase: SupabaseClient<Database>, photos: T[]) {
  if (!photos.length) return [] as (T & { license_history: PhotoLicenseHistory | null })[];
  try {
    const { data, error } = await supabase.from("photo_license_history")
      .select("photo_id, legacy_cc_possible, first_free_published_at").in("photo_id", photos.map(photo => photo.id));
    if (error) throw error;
    const histories = new Map((data ?? []).map(history => [history.photo_id, history]));
    return photos.map(photo => ({ ...photo, license_history: histories.get(photo.id) ?? null }));
  } catch (error) {
    console.error("[photo-license-history]", error instanceof Error ? error.message : "History unavailable");
    return photos.map(photo => ({ ...photo, license_history: null }));
  }
}
