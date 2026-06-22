import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, escapeLikePattern } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const GENERIC_ERROR = "Email/Display Name atau password salah.";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier =
      typeof body?.identifier === "string" ? body.identifier.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, error: GENERIC_ERROR },
        { status: 400 }
      );
    }

    // Deteksi: jika mengandung '@', anggap sebagai email langsung —
    // teruskan tanpa query tambahan.
    const isEmail = identifier.includes("@");

    if (isEmail) {
      return NextResponse.json(
        { success: true, data: { email: identifier.toLowerCase() } },
        { status: 200 }
      );
    }

    const supabaseAdmin = createAdminClient();

    // Cari UUID berdasarkan display_name (case-insensitive, di-escape
    // agar '_' dalam nama tidak diperlakukan sebagai wildcard ILIKE).
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("display_name", escapeLikePattern(identifier))
      .maybeSingle();

    if (profileError || !profile) {
      // Pesan generik: tidak membocorkan apakah Display Name ini ada atau tidak
      // (mitigasi user enumeration).
      return NextResponse.json(
        { success: false, error: GENERIC_ERROR },
        { status: 401 }
      );
    }

    // Ambil email asli dari auth.users via Admin API.
    const { data: userResult, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(profile.id);

    if (userError || !userResult?.user?.email) {
      return NextResponse.json(
        { success: false, error: GENERIC_ERROR },
        { status: 401 }
      );
    }

    // Password TIDAK diverifikasi di sini. Email diteruskan ke client
    // agar proses login sesungguhnya terjadi lewat sesi bawaan Supabase
    // (supabase.auth.signInWithPassword) di browser.
    return NextResponse.json(
      { success: true, data: { email: userResult.user.email } },
      { status: 200 }
    );
  } catch (error) {
    console.error("Unexpected error in /api/auth/login:", error);
    return NextResponse.json(
      { success: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}