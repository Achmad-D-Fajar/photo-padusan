import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { processImageForStorage } from "@/lib/server/image-processing";
import { embedMetadata } from "@/lib/server/exif-writer";
import { captionToSlug } from "@/lib/slug";

export const runtime = "nodejs";

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 300;
// Ask Gemini for more tags for richer IPTC keyword coverage.
const GEMINI_TAGS_COUNT = 15;

interface GeminiResult {
  caption: string;
  tags: string[];
}

function parseGeminiResponse(text: string): GeminiResult {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/```json/gi, "").replace(/```/g, "").trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  const parsed = JSON.parse(cleaned);

  const caption =
    typeof parsed.caption === "string" ? parsed.caption : "Tanpa judul";

  let tags: string[] = [];
  if (Array.isArray(parsed.tags)) {
    tags = parsed.tags
      .filter((t: unknown): t is string => typeof t === "string")
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0)
      .slice(0, GEMINI_TAGS_COUNT);
  }

  return { caption, tags };
}

const MICROSTOCK_BASE_PROMPT = 
  "Act as an expert microstock photography contributor. Analyze this image to generate highly commercial, discoverable metadata in English. " +
  "Return strictly a valid JSON object without markdown formatting, using the exact keys 'caption' and 'tags'. " +
  "1. 'caption' (string): A descriptive, literal, and searchable title (5 to 15 words). Focus on the main subject, action, setting, lighting, and mood. Do not use brand names, camera settings, or subjective opinions. " +
  `2. 'tags' (array of strings): An array of exactly ${GEMINI_TAGS_COUNT} highly relevant keywords ordered by visual importance. Include literal descriptions (e.g., 'laptop', 'coffee') and conceptual terms (e.g., 'technology', 'lifestyle'). Use single words or short phrases.`;

function buildPrompt(description: string | null): string {
  if (description && description.trim().length > 0) {
    const safe = description.trim().slice(0, MAX_DESCRIPTION_LENGTH);
    return (
      `${MICROSTOCK_BASE_PROMPT} ` +
      `Integrate the following user context to ensure accuracy regarding locations, specific objects, or intended themes: "${safe}".`
    );
  }
  
  return MICROSTOCK_BASE_PROMPT;
}



export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Silakan login terlebih dahulu." },
        { status: 401 }
      );
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { success: false, error: "Missing Gemini API key." },
        { status: 500 }
      );
    }

    // Fetch photographer profile for EXIF attribution fields.
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, full_name")
      .eq("id", user.id)
      .single();

    const artistName =
      profile?.full_name || profile?.display_name || user.email || "Unknown";
    const currentYear = new Date().getUTCFullYear();
    const copyrightText = `© ${currentYear} ${artistName} / Desa Padusan. All rights reserved.`;

    const formData = await request.formData();
    const file = formData.get("file");
    const descriptionRaw = formData.get("description");
    const description =
      typeof descriptionRaw === "string" ? descriptionRaw : null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Tidak ada file yang dikirim." },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { success: false, error: "Ukuran file terlalu besar (maks. 20MB)." },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "File harus berupa gambar." },
        { status: 400 }
      );
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());

    // 1. Downscale + watermark (Sharp)
    let processingResult;
    try {
      processingResult = await processImageForStorage(rawBuffer, {
        watermarkText: `${artistName} - Desa Padusan`,
      });
    } catch (sharpError) {
      console.error("Image processing failed:", sharpError);
      return NextResponse.json(
        { success: false, error: "Gagal memproses gambar. Pastikan file tidak rusak." },
        { status: 422 }
      );
    }

    const { downscaledBuffer, watermarkedBuffer } = processingResult;

    const watermarkApplied = Buffer.compare(downscaledBuffer, watermarkedBuffer) !== 0;
      console.log("[draft] watermark applied:", watermarkApplied, {
        downscaledBytes: downscaledBuffer.length,
        watermarkedBytes: watermarkedBuffer.length,
      });

    // 2. Gemini: send CLEAN (non-watermarked) buffer for analysis
    let analysis: GeminiResult = { caption: "Tanpa judul", tags: [] };

    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const result = await model.generateContent([
        {
          inlineData: {
            data: downscaledBuffer.toString("base64"),
            mimeType: "image/jpeg",
          },
        },
        { text: buildPrompt(description) },
      ]);

      analysis = parseGeminiResponse(result.response.text());
    } catch (geminiError) {
      console.error("Gemini analysis failed:", geminiError);
      return NextResponse.json(
        { success: false, error: "Gagal menganalisis gambar dengan AI. Silakan coba lagi." },
        { status: 502 }
      );
    }

    // 3. Embed EXIF + IPTC metadata into the watermarked buffer
    const photoId = crypto.randomUUID();

    let finalBuffer: Buffer;
    try {
      finalBuffer = embedMetadata(watermarkedBuffer, {
        caption: analysis.caption,
        tags: analysis.tags,
        artist: artistName,
        copyright: copyrightText,
        software: "Etalase Padusan",
      });
    } catch (metaError) {
      console.error("Metadata embedding failed:", metaError);
      // Non-fatal: fall back to watermarked buffer without metadata
      finalBuffer = watermarkedBuffer;
    }

    // 4. Upload to Supabase Storage with slugified filename
    const sluggedFilename = captionToSlug(analysis.caption, photoId);
    const storagePath = `${user.id}/${sluggedFilename}`;

    const { error: uploadError } = await supabase.storage
      .from("thumbnails")
      .upload(storagePath, finalBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { success: false, error: `Gagal mengunggah gambar: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("thumbnails")
      .getPublicUrl(storagePath);

    // 5. Insert row — use the pre-generated UUID so page URL is predictable
    const { data: insertedPhoto, error: insertError } = await supabase
      .from("photos")
      .insert({
        id: photoId,
        user_id: user.id,
        thumbnail_url: publicUrlData.publicUrl,
        caption: analysis.caption,
        tags: analysis.tags,
        status: "draft",
      })
      .select()
      .single();

    if (insertError) {
      await supabase.storage.from("thumbnails").remove([storagePath]);
      return NextResponse.json(
        { success: false, error: `Gagal menyimpan draf: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: insertedPhoto },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected error in /api/photos/draft:", error);
    return NextResponse.json(
      { success: false, error: "Terjadi kesalahan tak terduga di server." },
      { status: 500 }
    );
  }
}