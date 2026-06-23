"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.refresh(); // Memaksa Server Components merender ulang tanpa sesi
    router.push("/");
  }

  return (
    <button type="button" onClick={handleLogout} className="w-full text-left">
      Keluar
    </button>
  );
}