import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: photo, error } = await supabase
    .from("photos")
    .select("id, image_url, thumbnail_url, caption_en, caption_id, microstock_url")
    .eq("id", id)
    .single();

  if (error || !photo) {
    return NextResponse.json({ error: "Foto tidak ditemukan." }, { status: 404 });
  }

  if (photo.microstock_url !== null) {
    return NextResponse.json(
      { error: "Foto ini tersedia di microstock, bukan untuk unduhan langsung." },
      { status: 403 }
    );
  }

  const downloadUrl = photo.image_url ?? photo.thumbnail_url;

  if (!downloadUrl) {
    return NextResponse.json(
      { error: "File gambar tidak tersedia." },
      { status: 404 }
    );
  }

  let imageResponse: Response;
  try {
    imageResponse = await fetch(downloadUrl);
    if (!imageResponse.ok) throw new Error("Upstream fetch failed");
  } catch {
    return NextResponse.json(
      { error: "Gagal mengambil file dari storage." },
      { status: 502 }
    );
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  const contentType =
    imageResponse.headers.get("content-type") ?? "image/jpeg";

  const captionForFilename = (photo.caption_id ?? photo.caption_en ?? "foto-paduphoto")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  const filename = `${captionForFilename}-paduphoto.jpg`;

  return new NextResponse(imageBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=600",
    },
  });
}