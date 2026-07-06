import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, escapeLikePattern } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const DISPLAY_NAME_REGEX = /^[a-zA-Z0-9_.-]{3,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const displayName =
      typeof body?.displayName === "string" ? body.displayName.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { success: false, error: "Format email tidak valid." },
        { status: 400 }
      );
    }

    if (!DISPLAY_NAME_REGEX.test(displayName)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Display Name harus 3-30 karakter, tanpa spasi, dan hanya boleh berisi huruf, angka, titik (.), underscore (_), atau tanda hubung (-).",
        },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password minimal 8 karakter." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    // Pre-check uniqueness untuk pesan error yang ramah.
    // Unique index di DB (lower(display_name)) tetap jadi garis pertahanan utama
    // terhadap race condition.
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("display_name", escapeLikePattern(displayName))
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        { success: false, error: "Display Name sudah digunakan." },
        { status: 409 }
      );
    }

    const { data: createdUser, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm agar bisa langsung login.
        // Untuk produksi yang lebih strict, set false dan integrasikan
        // alur verifikasi email (mis. admin.generateLink + kirim email sendiri).
      });

    if (createUserError || !createdUser?.user) {
      const isDuplicateEmail =
        createUserError?.message?.toLowerCase().includes("already") ?? false;

      return NextResponse.json(
        {
          success: false,
          error: isDuplicateEmail
            ? "Email sudah terdaftar."
            : createUserError?.message || "Gagal membuat akun.",
        },
        { status: isDuplicateEmail ? 409 : 500 }
      );
    }

    const newUserId = createdUser.user.id;

    const { error: profileInsertError } = await supabaseAdmin
      .from("profiles")
      .insert({ id: newUserId, display_name: displayName } as any);

    if (profileInsertError) {
      // Rollback: hapus auth user yang sudah dibuat agar tidak ada
      // akun "zombie" tanpa profil (mis. karena race condition unique index).
      await supabaseAdmin.auth.admin.deleteUser(newUserId);

      const isDuplicateDisplayName = profileInsertError.code === "23505";

      return NextResponse.json(
        {
          success: false,
          error: isDuplicateDisplayName
            ? "Display Name sudah digunakan."
            : `Gagal menyimpan profil: ${profileInsertError.message}`,
        },
        { status: isDuplicateDisplayName ? 409 : 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: { id: newUserId, email, displayName },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected error in /api/auth/register:", error);
    return NextResponse.json(
      { success: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}