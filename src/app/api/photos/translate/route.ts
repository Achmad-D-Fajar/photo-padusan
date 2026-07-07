import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "edge";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { caption_id, tags_id } = await request.json();

    if (!caption_id) {
      return NextResponse.json({ success: false, error: "Caption tidak valid." }, { status: 400 });
    }

    const prompt = `
    Translate the following Indonesian photography caption and tags into English.
    Return ONLY a valid JSON object with exact keys "caption_en" (string) and "tags_en" (array of strings). Do not include markdown formatting.
    
    Indonesian Caption: "${caption_id}"
    Indonesian Tags: [${tags_id.join(", ")}]
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
    
    const data = JSON.parse(responseText);

    return NextResponse.json({
      success: true,
      data: {
        caption_en: data.caption_en,
        tags_en: data.tags_en
      }
    });
  } catch (error) {
    console.error("[Translation API Error]", error);
    return NextResponse.json({ success: false, error: "Gagal menerjemahkan teks." }, { status: 500 });
  }
}