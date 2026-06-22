import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
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
    typeof parsed.caption === "string" ? parsed.caption : "Untitled photo";

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

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { success: false, error: "Missing Supabase environment variables." },
        { status: 500 }
      );
    }

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
        { success: false, error: "No file provided." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File size exceeds the 5MB limit." },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "Only image files are allowed." },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // CRITICAL: Convert File -> ArrayBuffer -> Buffer before uploading.
    // Passing the raw File object directly causes
    // "invalid path specified in request URL" errors in the Node runtime.
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileExtension = file.name.includes(".")
      ? file.name.split(".").pop()
      : "jpg";
    const fileName = `${crypto.randomUUID()}.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("raw_images")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { success: false, error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("raw_images")
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;

    let analysis: GeminiResult = { caption: "Untitled photo", tags: [] };

try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const base64Data = buffer.toString("base64");
      const promptText = buildPrompt(description); // Fungsi opsional yang Anda tambahkan sebelumnya

      // === MANUVER RESILIENSI: Implementasi Retry pada Error 429 ===
      const MAX_RETRIES = 2; // Total mencoba (percobaan asli + 1 retry)
      let attempt = 0;
      let successfulAnalysis = false;
      const imageData = { inlineData: { data: base64Data, mimeType: file.type } };

      while (attempt < MAX_RETRIES && !successfulAnalysis) {
        try {
          // Percobaan memanggil Gemini
          const result = await model.generateContent([imageData, { text: promptText }]);
          const responseText = result.response.text();
          analysis = parseGeminiResponse(responseText);
          successfulAnalysis = true; // Jika sampai sini tanpa error, set sukses
          console.log(`[Attempt ${attempt + 1}] Gemini analysis successful.`);
        } catch (geminiError: any) {
          attempt++;
          // Cek apakah error 429 (Too Many Requests)
          if (geminiError.status === 429 && attempt < MAX_RETRIES) {
            console.warn(`[Attempt ${attempt}] Hitting Gemini quota (429). Waiting 31s before retry...`);
            // Tunggu selama 31 detik (sedikit lebih lama dari saran error)
            await new Promise(resolve => setTimeout(resolve, 31000));
          } else {
            // Jika bukan 429, atau sudah habis kesempatan mencoba, lempar error untuk fallback
            console.error(`[Attempt ${attempt}] Gemini analysis failed decisively or exhausted retries:`, geminiError);
            throw geminiError;
          }
        }
      }
      // === AKHIR MANUVER RESILIENSI ===

    } catch (geminiError) {
      // Catch blok bawaan buatan Claude (untuk fallback ke 'Untitled photo')
      console.error("Critical Gemini error caught by fallback:", geminiError);
    }

    const { data: insertedPhoto, error: insertError } = await supabase
      .from("photos")
      .insert({
        image_url: publicUrl,
        caption: analysis.caption,
        tags: analysis.tags,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          error: `Database insert failed: ${insertError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: insertedPhoto },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected error in upload route:", error);
    return NextResponse.json(
      { success: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}