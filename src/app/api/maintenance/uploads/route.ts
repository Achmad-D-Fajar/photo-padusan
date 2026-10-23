import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTO_UPLOAD_BUCKET } from "@/lib/photo-upload";
import { ApiError, apiErrorResponse } from "@/lib/server/api-error";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const bucket = createAdminClient().storage.from(PHOTO_UPLOAD_BUCKET);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let cursor: string | undefined;
    let removed = 0;
    do {
      const { data, error } = await bucket.listV2({ limit: 100, cursor, with_delimiter: false });
      if (error || !data) throw new ApiError(502, "Gagal membaca unggahan sementara.");
      const paths = data.objects.filter(file => Date.parse(file.created_at) < cutoff).map(file => file.key ?? file.name);
      if (paths.length) {
        const { error: removeError } = await bucket.remove(paths);
        if (removeError) throw new ApiError(502, "Gagal menghapus unggahan sementara.");
        removed += paths.length;
      }
      cursor = data.hasNext ? data.nextCursor : undefined;
    } while (cursor);
    return NextResponse.json({ success: true, removed });
  } catch (error) { return apiErrorResponse(error); }
}
