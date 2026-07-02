/**
 * Converts an AI-generated caption and a UUID into a URL-safe,
 * storage-safe slugified filename.
 *
 * Algorithm:
 *  1. NFD normalization strips diacritics (é→e, ñ→n, ü→u).
 *  2. Remaining non-ASCII / non-alphanumeric characters are stripped.
 *  3. Whitespace collapses into single hyphens.
 *  4. Caption part is clamped to 60 characters so Storage paths stay
 *     well under the 1024-byte Supabase object-name limit even with the
 *     UUID and extension appended.
 *  5. UUID is appended verbatim as a uniqueness + cache-busting suffix.
 *
 * Examples:
 *   captionToSlug("Green cartoon frog wearing crown", "abc-123")
 *   → "green-cartoon-frog-wearing-crown-abc-123.jpg"
 *
 *   captionToSlug("Sawah & Petani – Pagi hari!", "abc-123")
 *   → "sawah-petani-pagi-hari-abc-123.jpg"
 *
 *   captionToSlug("", "abc-123")        // empty caption fallback
 *   → "photo-abc-123.jpg"
 */
export function captionToSlug(caption: string, uuid: string): string {
  const base = caption
    .toLowerCase()
    .trim()
    .normalize("NFD")                     // decompose accents
    .replace(/[\u0300-\u036f]/g, "")      // strip combining diacritics
    .replace(/[^a-z0-9\s-]/g, " ")        // replace remaining specials with space
    .replace(/\s+/g, "-")                 // collapse whitespace → hyphen
    .replace(/-+/g, "-")                  // collapse multiple hyphens
    .replace(/^-|-$/g, "")               // trim leading/trailing hyphens
    .slice(0, 60)                         // max 60 chars for caption part
    .replace(/-$/, "");                   // no trailing hyphen after slice

  const safeBase = base.length > 0 ? base : "photo";

  return `${safeBase}-${uuid}.jpg`;
}

/**
 * Returns a URL-safe slug from a caption for use in page URLs
 * (without UUID or extension).
 *
 * captionToUrlSlug("Green cartoon frog wearing crown")
 * → "green-cartoon-frog-wearing-crown"
 */
export function captionToUrlSlug(caption: string): string {
  const slug = caption
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");

  return slug.length > 0 ? slug : "photo";
}