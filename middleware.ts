import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh token sesi jika sudah kedaluwarsa, agar sesi tetap konsisten
  // di Server Components dan Route Handlers.
  await supabase.auth.getUser();

  // 1. Ambil data user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2. Tentukan rute yang butuh proteksi (contoh: /dashboard/*)
  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");

  // 3. Jika belum login dan mencoba masuk ke rute dashboard, lempar ke /login
  if (!user && isDashboardRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 4. (Opsional) Jika sudah login dan mencoba masuk ke /login atau /register,
  // lempar ke /dashboard agar mereka tidak perlu login ulang.
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};