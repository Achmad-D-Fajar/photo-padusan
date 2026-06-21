import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Inisialisasi Supabase Client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }

    // Validasi Ukuran (Maksimal 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Ukuran file melebihi batas 5MB" }, { status: 400 });
    }

    // 1. Upload ke Supabase Storage (Bucket: raw_images)
    const fileExt = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("raw_images")
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    // Dapatkan URL Publik
    const { data: { publicUrl } } = supabase.storage
      .from("raw_images")
      .getPublicUrl(fileName);

    // 2. Blok Logika AI (Saat ini menggunakan Mock Data)
    // Di sinilah Anda nantinya melakukan fetch ke endpoint Gemini API
    const aiCaption = "Asian male farmer harvesting fresh green apples in the orchard during daylight";
    const aiTags = ["farmer", "apple", "harvest", "orchard", "agriculture", "indonesia"];

    // 3. Simpan ke Database Relasional
    const { data: dbData, error: dbError } = await supabase
      .from("photos")
      .insert([
        { 
          image_url: publicUrl, 
          caption: aiCaption, 
          tags: aiTags 
        }
      ])
      .select();

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, data: dbData[0] }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}