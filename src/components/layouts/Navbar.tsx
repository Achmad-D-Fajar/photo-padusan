import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/layouts/LogoutButton";

function getInitial(label: string): string {
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : "?";
}

export default async function Navbar() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <div className="navbar bg-base-100 border-b border-base-300 px-4 sm:px-8">
        <div className="navbar-start">
          <Link href="/" className="btn btn-ghost text-xl">
            Etalase Padusan
          </Link>
        </div>
        <div className="navbar-end">
          <span className="text-sm text-error">Konfigurasi server belum lengkap</span>
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName = "";
  let fullName: string | null = null;
  let avatarUrl: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, full_name, avatar_url")
      .eq("id", user.id)
      .single();

    if (profile) {
      displayName = profile.display_name;
      fullName = profile.full_name;
      avatarUrl = profile.avatar_url;
    }
  }

  const avatarLabel = fullName || displayName || user?.email || "?";
  const avatarInitial = getInitial(avatarLabel);

  return (
    <div className="navbar bg-base-100 border-b border-base-300 px-4 sm:px-8">
      <div className="navbar-start gap-1">
        <div className="dropdown lg:hidden">
          <div
            tabIndex={0}
            role="button"
            className="btn btn-ghost btn-circle"
            aria-label="Buka menu navigasi"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </div>
          <ul
            tabIndex={0}
            className="menu menu-sm dropdown-content bg-base-100 rounded-box z-20 mt-3 w-52 p-2 shadow border border-base-300"
          >
            <li>
              <Link href="/">Photos</Link>
            </li>
            <li>
              <Link href="/about">About</Link>
            </li>
            {user && (
              <li>
                <Link href="/dashboard/upload">Upload</Link>
              </li>
            )}
          </ul>
        </div>

        <Link href="/" className="btn btn-ghost text-xl">
          Etalase Padusan
        </Link>
      </div>

      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1 gap-1">
          <li>
            <Link href="/">Photos</Link>
          </li>
          <li>
            <Link href="/about">About</Link>
          </li>
          {user && (
            <li>
              <Link href="/dashboard/upload">Upload</Link>
            </li>
          )}
        </ul>
      </div>

      <div className="navbar-end gap-2">
        {user ? (
          <div className="dropdown dropdown-end">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-ghost btn-circle avatar"
              aria-label="Menu pengguna"
            >
              {avatarUrl ? (
                <div className="w-10 rounded-full">
                  <img src={avatarUrl} alt={avatarLabel} />
                </div>
              ) : (
                <div className="avatar avatar-placeholder">
                  <div className="bg-neutral text-neutral-content w-10 rounded-full">
                    <span className="text-sm">{avatarInitial}</span>
                  </div>
                </div>
              )}
            </div>
            <ul
              tabIndex={0}
              className="menu menu-sm dropdown-content bg-base-100 rounded-box z-20 mt-3 w-56 p-2 shadow border border-base-300"
            >
              <li>
                <Link
                  href={`/photographer/${displayName}`}
                  className="flex flex-col items-start py-2"
                >
                  <span className="font-semibold">
                    {fullName || `@${displayName}`}
                  </span>
                  <span className="text-xs text-base-content/60">
                    Lihat Profil Publik
                  </span>
                </Link>
              </li>
              <li>
                <hr className="my-1 border-base-300" />
              </li>
              <li>
                <Link href="/dashboard">Dasbor</Link>
              </li>
              <li>
                <Link href="/dashboard/profile">Pengaturan Profil</Link>
              </li>
              <li>
                <hr className="my-1 border-base-300" />
              </li>
              <li>
                <LogoutButton />
              </li>
            </ul>
          </div>
        ) : (
          <>
            <Link href="/login" className="btn btn-ghost btn-sm">
              Masuk
            </Link>
            <Link href="/register" className="btn btn-primary btn-sm">
              Daftar
            </Link>
          </>
        )}
      </div>
    </div>
  );
}