"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="w-full text-left font-bold text-xl uppercase tracking-widest text-[#882255] border-2 border-transparent hover:border-[#882255] bg-[#E5E5E5] hover:bg-[#882255] hover:text-white px-4 py-3 transition-colors focus:outline-none focus:ring-4 focus:ring-[#882255]"
      disabled={isLoggingOut}
    >
      {isLoggingOut ? (
        <span className="flex items-center gap-3">
          <span className="loading loading-spinner loading-sm"></span>
          KELUAR...
        </span>
      ) : (
        "KELUAR"
      )}
    </button>
  );
}