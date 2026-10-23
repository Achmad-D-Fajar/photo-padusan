import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildBilingualPrompt, parseGeminiBilingualResponse } from "@/lib/server/gemini-analysis";
import { requirePhotoUser, readStagedPhoto, consumeAiRequest } from "@/lib/server/photo-upload";
import { createPhotoPreview } from "@/lib/server/photo-image";
import { ApiError, apiErrorResponse, readJson } from "@/lib/server/api-error";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requirePhotoUser();
    const { path, description } = await readJson(request);
    if (description !== undefined && (typeof description !== "string" || description.length > 300)) {
      throw new ApiError(400, "Konteks maksimal 300 karakter.");
    }
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new ApiError(503, "Layanan AI belum tersedia.");
    const rawBuffer = await readStagedPhoto(supabase, user.id, path);
    const { data: preview } = await createPhotoPreview(rawBuffer);
    await consumeAiRequest(supabase);
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent([
      { inlineData: { data: preview.toString("base64"), mimeType: "image/jpeg" } },
      { text: buildBilingualPrompt(typeof description === "string" ? description : null) },
    ]);
    return NextResponse.json({ success: true, data: parseGeminiBilingualResponse(result.response.text()) });
  } catch (error) { return apiErrorResponse(error); }
}
