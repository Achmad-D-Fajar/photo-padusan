import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, escapeLikePattern } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readJson, apiErrorResponse } from "@/lib/server/api-error";

export const runtime = "nodejs";

const GENERIC_ERROR = "Email/Display Name atau password salah.";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const identifier =
      typeof body?.identifier === "string" ? body.identifier.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, error: GENERIC_ERROR },
        { status: 400 }
      );
    }

    let email = identifier.toLowerCase();
    if (!identifier.includes("@")) {
      const admin = createAdminClient();
      const { data: profile, error } = await admin.from("profiles")
        .select("id").ilike("display_name", escapeLikePattern(identifier)).maybeSingle();
      const { data } = !error && profile
        ? await admin.auth.admin.getUserById(profile.id)
        : { data: null };
      if (!data?.user?.email) {
        return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 401 });
      }
      email = data.user.email;
    }

    // Use the request-scoped client so authentication sets this browser's
    // cookies and never changes the singleton service-role client's session.
    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      return NextResponse.json(
        { success: false, error: GENERIC_ERROR },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
