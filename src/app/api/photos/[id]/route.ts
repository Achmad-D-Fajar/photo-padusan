import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function extractStoragePath(url: string): string | null {
  const marker = "/raw_images/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing photo id." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Missing Supabase environment variables." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const captionRaw = body?.caption;
    const tagsRaw = body?.tags;

    if (typeof captionRaw !== "string" || captionRaw.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Caption is required and must be a non-empty string.",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(tagsRaw)) {
      return NextResponse.json(
        { success: false, error: "Tags must be an array of strings." },
        { status: 400 }
      );
    }

    const tags = tagsRaw
      .filter((t: unknown): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 8);

    const { data: updatedPhoto, error: updateError } = await supabase
      .from("photos")
      .update({
        caption: captionRaw.trim(),
        tags,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { success: false, error: `Update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    if (!updatedPhoto) {
      return NextResponse.json(
        { success: false, error: "Photo not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: updatedPhoto },
      { status: 200 }
    );
  } catch (error) {
    console.error("Unexpected error in PATCH /api/photos/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing photo id." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Missing Supabase environment variables." },
        { status: 500 }
      );
    }

    const { data: existingPhoto, error: fetchError } = await supabase
      .from("photos")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existingPhoto) {
      return NextResponse.json(
        { success: false, error: "Photo not found." },
        { status: 404 }
      );
    }

    const storagePath = extractStoragePath(existingPhoto.image_url);

    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from("raw_images")
        .remove([storagePath]);

      if (storageError) {
        console.error(
          "Failed to delete storage object:",
          storageError.message
        );
      }
    }

    const { error: deleteError } = await supabase
      .from("photos")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: `Delete failed: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/photos/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}