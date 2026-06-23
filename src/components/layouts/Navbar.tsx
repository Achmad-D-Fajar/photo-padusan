import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./LogoutButton";

export default async function Navbar() {    
  const supabase = await createClient();
  
  // Periksa sesi pengguna saat ini
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="navbar bg-base-100 border-b border-base-300 px-4 md:px-8">
      <div className="flex-1">
        <Link href="/" className="btn btn-ghost text-xl">
          PhotoPadusan
        </Link>
      </div>
      <div className="flex-none gap-2">
        {user ? (
          <>
            <Link href="/dashboard" className="btn btn-ghost hidden sm:inline-flex">
              Dasbor
            </Link>
            <Link href="/dashboard/profile" className="btn btn-ghost hidden sm:inline-flex">
              Profil
            </Link>
            <div className="dropdown dropdown-end sm:hidden">
              <div tabIndex={0} role="button" className="btn btn-ghost btn-circle">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" /></svg>
              </div>
              <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52">
                <li><Link href="/dashboard">Dasbor</Link></li>
                <li><Link href="/dashboard/profile">Profil</Link></li>
              </ul>
            </div>
            <LogoutButton />
          </>
        ) : (
          <>
            <Link href="/login" className="btn btn-ghost">
              Login
            </Link>
            <Link href="/register" className="btn btn-primary">
              Daftar
            </Link>
          </>
        )}
      </div>
    </div>
  );
}