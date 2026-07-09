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
      <div className="navbar bg-white border-b-4 border-[#111111] px-4 sm:px-8 shadow-[0px_4px_0px_#111111]">
        <div className="navbar-start">
          <Link href="/" className="font-display text-xl sm:text-2xl uppercase tracking-wide text-[#111111] bg-[#88CCEE] border-4 border-[#111111] px-3 py-1 shadow-[4px_4px_0px_#111111]">
            PADUPHOTO
          </Link>
        </div>
        <div className="navbar-end">
          <span className="font-bold text-[#882255] border-2 border-[#882255] px-3 py-1 bg-[#E5E5E5]">Konfigurasi server belum lengkap</span>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
  const navLinkClass = "text-lg font-bold text-[#111111] hover:bg-[#332288] hover:text-[#E5E5E5] px-4 py-2 transition-colors border-2 border-transparent hover:border-[#111111]";

  return (
    <div className="navbar bg-white border-b-4 border-[#111111] px-4 sm:px-8 shadow-[0px_4px_0px_#111111] sticky top-0 z-50">
      <div className="navbar-start gap-2">
        <div className="dropdown lg:hidden">
          <div tabIndex={0} role="button" className="btn bg-white border-2 border-[#111111] rounded-none shadow-[2px_2px_0px_#111111] hover:bg-[#E5E5E5]" aria-label="Buka menu navigasi">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#111111]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </div>
          <ul tabIndex={0} className="menu menu-lg dropdown-content bg-white rounded-none z-20 mt-4 w-64 p-4 border-4 border-[#111111] shadow-[8px_8px_0px_#111111] gap-2">
            <li><Link href="/" className={navLinkClass}>Photos</Link></li>
            <li><Link href="/about" className={navLinkClass}>About</Link></li>
            {user && <li><Link href="/dashboard/upload" className={navLinkClass}>Upload</Link></li>}
          </ul>
        </div>

        {/* LOGO BARU: Memakai font-display Dela Gothic One + Box Logo Khas Brutalism */}
        <Link 
          href="/" 
          className="font-display text-xl sm:text-2xl uppercase tracking-wide text-[#111111] bg-[#88CCEE] border-4 border-[#111111] px-4 py-1.5 shadow-[4px_4px_0px_#111111] hover:bg-[#111111] hover:text-[#E5E5E5] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
        >
          PADUPHOTO
        </Link>
      </div>

      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1 gap-2">
          <li><Link href="/" className={navLinkClass}>Photos</Link></li>
          <li><Link href="/about" className={navLinkClass}>About</Link></li>
          {user && <li><Link href="/dashboard/upload" className={navLinkClass}>Upload</Link></li>}
        </ul>
      </div>

      <div className="navbar-end gap-3">
        {user ? (
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost p-0 border-2 border-[#111111] rounded-none shadow-[2px_2px_0px_#111111] hover:translate-y-[2px] hover:shadow-none transition-all overflow-hidden h-12 w-12 bg-[#E5E5E5]" aria-label="Menu pengguna">
              {avatarUrl ? (
                <img src={avatarUrl} alt={avatarLabel} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-[#111111]">
                  {avatarInitial}
                </div>
              )}
            </div>
            <ul tabIndex={0} className="menu menu-lg dropdown-content bg-white rounded-none z-20 mt-4 w-72 p-4 border-4 border-[#111111] shadow-[8px_8px_0px_#111111] gap-2">
              <li>
                <Link href={`/photographer/${displayName}`} className="flex flex-col items-start py-3 bg-[#E5E5E5] border-2 border-[#111111] rounded-none hover:bg-[#332288] hover:text-[#E5E5E5]">
                  <span className="font-bold text-xl">{fullName || `@${displayName}`}</span>
                  <span className="text-sm font-medium">Lihat Profil Publik</span>
                </Link>
              </li>
              <li className="mt-2"><Link href="/dashboard" className={navLinkClass}>Dasbor</Link></li>
              <li><Link href="/dashboard/profile" className={navLinkClass}>Pengaturan Profil</Link></li>
              <li className="mt-4 border-t-4 border-[#111111] pt-4">
                <LogoutButton />
              </li>
            </ul>
          </div>
        ) : (
          <>
            <Link href="/login" className="btn bg-transparent hover:bg-[#111111] hover:text-[#E5E5E5] text-[#111111] border-2 border-[#111111] rounded-none font-bold text-lg px-6">
              Masuk
            </Link>
            <Link href="/register" className="btn bg-[#117733] hover:bg-[#0e5c27] text-[#E5E5E5] border-2 border-[#111111] rounded-none font-bold text-lg shadow-[4px_4px_0px_#111111] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#111111] transition-all px-6 hidden sm:inline-flex">
              Daftar
            </Link>
          </>
        )}
      </div>
    </div>
  );
}