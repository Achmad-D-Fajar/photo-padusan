import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import {
  buildBilingualPrompt,
  parseGeminiBilingualResponse,
} from "@/lib/server/gemini-analysis";

export const runtime = "nodejs";

const MAX_FILE_SIZE  = 20 * 1024 * 1024; // 20 MB
const ANALYSIS_MAX_PX = 1080;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
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
    const descRaw = formData.get("description");
    const description = typeof descRaw === "string" ? descRaw : null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file provided." },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File too large (max 20 MB)." },
        { status: 400 }
      );
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "File must be an image." },
        { status: 400 }
      );
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());

    // Lightweight downscale only — no watermark, no EXIF.
    // The watermark is applied in /api/photos/draft after the user confirms.
    const { width = 0, height = 0 } = await sharp(rawBuffer).rotate().metadata();
    if (!width || !height) {
      return NextResponse.json(
        { success: false, error: "Cannot read image dimensions." },
        { status: 422 }
      );
    }

    const longestSide = Math.max(width, height);
    const scale = longestSide > ANALYSIS_MAX_PX ? ANALYSIS_MAX_PX / longestSide : 1;

    const analysisBuffer = await sharp(rawBuffer)
      .rotate()
      .resize(Math.round(width * scale), Math.round(height * scale), {
        fit: "fill",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const geminiResult = await model.generateContent([
      {
        inlineData: {
          data: analysisBuffer.toString("base64"),
          mimeType: "image/jpeg",
        },
      },
      { text: buildBilingualPrompt(description) },
    ]);

    const analysis = parseGeminiBilingualResponse(geminiResult.response.text());

    return NextResponse.json({ success: true, data: analysis }, { status: 200 });
  } catch (error) {
    console.error("[/api/photos/analyze]", error);
    return NextResponse.json(
      { success: false, error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}