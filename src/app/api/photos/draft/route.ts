import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { processImageForStorage } from "@/lib/server/image-processing";

export const runtime = "nodejs";

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB (sebelum kompresi)
const MAX_DESCRIPTION_LENGTH = 300;

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
      .slice(0, 5);
  }

  return { caption, tags };
}

function buildPrompt(description: string | null): string {
  const baseInstructions = 
    "Act as an expert microstock photography contributor. Analyze this image to generate highly commercial, discoverable metadata in English. " +
    "Return strictly a valid JSON object without markdown formatting, using the exact keys 'caption' and 'tags'. " +
    "1. 'caption' (string): A descriptive, literal, and searchable title (5 to 15 words). Focus on the main subject, action, setting, lighting, and mood. Do not use brand names, camera settings, or subjective opinions. " +
    "2. 'tags' (array of strings): An array of 30 highly relevant keywords ordered by visual importance. Include both literal descriptions (e.g., 'laptop', 'coffee') and conceptual terms (e.g., 'technology', 'lifestyle'). Use single words or short phrases.";

  if (description && description.trim().length > 0) {
    const safe = description.trim().slice(0, MAX_DESCRIPTION_LENGTH);
    return (
      `${baseInstructions} ` +
      `Incorporate the following user context to refine your analysis if it visually matches the image: "${safe}".`
    );
  }
  
  return baseInstructions;
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

    // Konversi File → ArrayBuffer → Buffer (wajib di Node runtime;
    // lihat catatan di draft route awal percakapan ini).
    const rawBuffer = Buffer.from(await file.arrayBuffer());

    // Proses gambar: downscale ke 1080px + watermark permanen.
    // Memisahkan downscaledBuffer (untuk Gemini) dan watermarkedBuffer
    // (untuk Storage) memastikan AI menganalisis gambar bersih tanpa
    // teks watermark yang bisa membingungkan caption/tags generation.
    let processingResult;
    try {
      processingResult = await processImageForStorage(rawBuffer, {
        watermarkText: "© Etalase Padusan",
      });
    } catch (sharpError) {
      console.error("Image processing failed:", sharpError);
      return NextResponse.json(
        {
          success: false,
          error: "Gagal memproses gambar. Pastikan file tidak rusak.",
        },
        { status: 422 }
      );
    }

    const { downscaledBuffer, watermarkedBuffer } = processingResult;

    // Kirim gambar DOWNSCALED (tanpa watermark) ke Gemini untuk analisis.
    let analysis: GeminiResult = { caption: "Tanpa judul", tags: [] };

    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const result = await model.generateContent([
        {
          inlineData: {
            // Setelah Sharp memproses, output selalu JPEG.
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
        {
          success: false,
          error: "Gagal menganalisis gambar dengan AI. Silakan coba lagi.",
        },
        { status: 502 }
      );
    }

    // Upload gambar WATERMARKED ke Storage.
    // Path diawali user.id agar sesuai storage RLS policy.
    const fileName = `${user.id}/${crypto.randomUUID()}.jpg`;

    // VERIFIKASI SEBELUM UPLOAD
    console.log("Watermarked buffer size:", watermarkedBuffer.length, "bytes");

    // Gunakan Uint8Array agar kompatibel dengan Blob
    const uint8Array = new Uint8Array(watermarkedBuffer);
    const uploadBlob = new Blob([uint8Array], { type: "image/jpeg" });

    const { error: uploadError } = await supabase.storage
      .from("thumbnails")
      .upload(fileName, uploadBlob, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
        console.error("Upload error details:", uploadError);
        throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from("thumbnails")
      .getPublicUrl(fileName);

    const thumbnailUrl = publicUrlData.publicUrl;

    const { data: insertedPhoto, error: insertError } = await supabase
      .from("photos")
      .insert({
        user_id: user.id,
        thumbnail_url: thumbnailUrl,
        caption: analysis.caption,
        tags: analysis.tags,
        status: "draft",
      })
      .select()
      .single();

    if (insertError) {
      // Rollback Storage agar tidak ada file yatim.
      await supabase.storage.from("thumbnails").remove([fileName]);

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