import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

// Batas longgar untuk jaga-jaga; kompresi di client seharusnya
// sudah membuat ukuran file jauh di bawah ini.
const MAX_FILE_SIZE = 3 * 1024 * 1024;
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
  if (description && description.trim().length > 0) {
    const safeDescription = description.trim().slice(0, MAX_DESCRIPTION_LENGTH);
    return `Analyze this image together with the following user-provided context: "${safeDescription}". Use both the visual content of the image and this context to inform your answer. Return strictly a JSON object with 'caption' (string) and 'tags' (array of 5 strings).`;
  }

  return "Analyze this image. Return strictly a JSON object with 'caption' (string) and 'tags' (array of 5 strings).";
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "jpg";
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verifikasi sesi pengguna lewat cookie-based server client.
    //    Client ini (anon key + sesi user) yang dipakai untuk Storage
    //    & insert DB, sehingga otomatis tunduk pada RLS policy
    //    "auth.uid() = user_id" — tidak perlu Service Role Key sama sekali.
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

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "Ukuran file terlalu besar. Pastikan kompresi berjalan dengan benar.",
        },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "File harus berupa gambar." },
        { status: 400 }
      );
    }

    // CRITICAL: Konversi File -> ArrayBuffer -> Buffer sebelum dipakai
    // untuk Storage upload maupun Gemini, agar konsisten di Node runtime.
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Placeholder pengganti pemanggilan AI (Gemini Dinonaktifkan)
    let analysis: GeminiResult = {
      caption: description && description.trim().length > 0
        ? `[Placeholder] ${description}`
        : "[Placeholder] Visual dokumentasi Desa Padusan.",
      tags: ["padusan", "desa", "dokumentasi", "placeholder", "test"]
    };

    /* === BLOK GEMINI ASLI DINONAKTIFKAN ===
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const base64Data = buffer.toString("base64");
      const promptText = buildPrompt(description);

      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: file.type,
          },
        },
        { text: promptText },
      ]);

      const responseText = result.response.text();
      analysis = parseGeminiResponse(responseText);
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
    === AKHIR BLOK GEMINI === */

    // 3. Unggah file ke Supabase Storage, bucket `thumbnails`.
    //    Path diawali user.id agar sesuai storage RLS policy
    //    (storage.foldername(name))[1] = auth.uid()::text.
    const fileExtension = extensionFromMimeType(file.type);
    const fileName = `${user.id}/${crypto.randomUUID()}.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("thumbnails")
      .upload(fileName, buffer, {
        contentType: file.type,
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
      .getPublicUrl(fileName);

    const thumbnailUrl = publicUrlData.publicUrl;

    // 4. Insert ke tabel `photos` dengan status 'draft'.
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
      // Rollback file di storage supaya tidak ada file orphan
      // ketika insert ke database gagal.
      await supabase.storage.from("thumbnails").remove([fileName]);

      return NextResponse.json(
        { success: false, error: `Gagal menyimpan draf: ${insertError.message}` },
        { status: 500 }
      );
    }

    // 5. Kembalikan respons sukses. Redirect ke /dashboard dilakukan di klien.
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