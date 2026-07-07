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

  // Query from the `photos` table directly (not the view) because
  // `vw_public_photos` does not expose `image_url`.
  // The RLS policy "Published photos are viewable by everyone, drafts by owner"
  // ensures anonymous callers can only ever resolve published rows.
  const { data: photo, error } = await supabase
    .from("photos")
    .select("id, image_url, thumbnail_url, caption_en, caption_id, microstock_url")
    .eq("id", id)
    .single();

  if (error || !photo) {
    return NextResponse.json({ error: "Foto tidak ditemukan." }, { status: 404 });
  }

  // Prevent this free-download route from being used for microstock photos.
  if (photo.microstock_url !== null) {
    return NextResponse.json(
      { error: "Foto ini tersedia di microstock, bukan untuk unduhan langsung." },
      { status: 403 }
    );
  }

  // Prefer the original high-res upload (`image_url`).
  // Fall back to the processed thumbnail if image_url was never stored
  // (photos uploaded through the new compressed-only pipeline).
  const downloadUrl = photo.image_url ?? photo.thumbnail_url;

  if (!downloadUrl) {
    return NextResponse.json(
      { error: "File gambar tidak tersedia." },
      { status: 404 }
    );
  }

  // Proxy the file through our server so the browser receives it with
  // Content-Disposition: attachment.  The download URL is cross-origin
  // (Supabase CDN), so the `download` attribute on <a> alone is not
  // enough — the header must be injected server-side.
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

  const captionForFilename = (photo.caption_id ?? photo.caption_en ?? "foto-padusan")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  const filename = `${captionForFilename}-etalase-padusan.jpg`;

  return new NextResponse(imageBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=600",
    },
  });
}