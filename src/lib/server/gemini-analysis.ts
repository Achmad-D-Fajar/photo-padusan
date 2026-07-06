// SERVER-ONLY. Import only types from Client Components (import type { ... }).

export interface GeminiBilingualResult {
  caption_en: string;
  caption_id: string;
  tags_en: string[];
  tags_id: string[];
}

// These are prepended before AI suggestions — the merge in extractTags()
// guarantees they survive even when Gemini hallucinates or forgets them.
const REQUIRED_TAGS_EN = [
  "Padusan", "Mojokerto", "East Java", "Indonesia",
  "nature photography", "village", "rural",
];
const REQUIRED_TAGS_ID = [
  "Padusan", "Mojokerto", "Jawa Timur", "Indonesia",
  "fotografi alam", "desa", "wisata",
];

export function buildBilingualPrompt(description: string | null): string {
  const MAX_DESC = 300;
  const context = description?.trim()
    ? `\n\nAdditional context from the photographer: "${description.trim().slice(0, MAX_DESC)}"`
    : "";

  return `You are an SEO-focused AI assistant for a microstock photography platform \
based in Padusan Village, Mojokerto, East Java, Indonesia.

Analyze this image and return ONLY a valid JSON object — no markdown, \
no code fences, no explanation text whatsoever.

Required JSON format:
{
  "caption_en": "One clear English sentence describing the image subject and mood.",
  "caption_id": "Satu kalimat bahasa Indonesia yang mendeskripsikan subjek dan suasana gambar.",
  "tags_en": ["tag1", "tag2", "...", "Padusan", "Mojokerto", "East Java", "Indonesia"],
  "tags_id": ["tag1", "tag2", "...", "Padusan", "Mojokerto", "Jawa Timur", "Indonesia"]
}

STRICT RULES — violating any rule makes your response unusable:
1. Output ONLY the JSON object. No text before or after it.
2. tags_en: exactly 15 English strings. MUST contain "Padusan", "Mojokerto", \
"East Java", "Indonesia", "nature photography", "village". \
Fill remaining 9 slots with image-specific keywords: subject, colors, mood, season, \
lighting condition, composition style.
3. tags_id: exactly 15 Bahasa Indonesia strings. MUST contain "Padusan", "Mojokerto", \
"Jawa Timur", "Indonesia", "fotografi alam", "desa", "wisata". \
Fill remaining 8 slots with image-specific Indonesian keywords: subjek, warna, suasana, \
musim, kondisi cahaya, gaya komposisi.
4. All tags lowercase EXCEPT proper nouns: Padusan, Mojokerto, East Java, Jawa Timur, Indonesia.
5. caption_en must be English only. caption_id must be Bahasa Indonesia only.${context}`;
}

export function parseGeminiBilingualResponse(rawText: string): GeminiBilingualResult {
  let cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```$/m, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end   = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Gemini hallucinated non-JSON — return bilingual safe defaults
    return {
      caption_en: "A scenic photograph from Padusan Village, Mojokerto.",
      caption_id: "Foto pemandangan dari Desa Padusan, Mojokerto.",
      tags_en: [...REQUIRED_TAGS_EN],
      tags_id: [...REQUIRED_TAGS_ID],
    };
  }

  function extractTags(raw: unknown, required: string[]): string[] {
    const fromAI: string[] = Array.isArray(raw)
      ? raw
          .filter((t): t is string => typeof t === "string")
          .map(t => t.trim())
          .filter(Boolean)
      : [];
    // Required location tags take precedence; AI tags fill the rest.
    return [...new Set([...required, ...fromAI])].slice(0, 20);
  }

  return {
    caption_en:
      typeof parsed.caption_en === "string" && parsed.caption_en.trim()
        ? parsed.caption_en.trim()
        : "A scenic photograph from Padusan Village, Mojokerto.",
    caption_id:
      typeof parsed.caption_id === "string" && parsed.caption_id.trim()
        ? parsed.caption_id.trim()
        : "Foto pemandangan dari Desa Padusan, Mojokerto.",
    tags_en: extractTags(parsed.tags_en, REQUIRED_TAGS_EN),
    tags_id: extractTags(parsed.tags_id, REQUIRED_TAGS_ID),
  };
}