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
      // Hard reload (bukan router.refresh()) memastikan seluruh state
      // client — termasuk apa pun yang mungkin di-cache oleh Server
      // Component atau App Router — benar-benar bersih, sehingga sesi
      // yang sudah signOut tidak "terlihat" lagi di mana pun pada UI.
      window.location.href = "/";
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="w-full text-left"
      disabled={isLoggingOut}
    >
      {isLoggingOut ? (
        <span className="flex items-center gap-2">
          <span className="loading loading-spinner loading-xs"></span>
          Keluar...
        </span>
      ) : (
        "Keluar"
      )}
    </button>
  );
}