"use client";

import { useEffect } from "react";

// Hook ini HANYA memblokir shortcut Ctrl+S / Cmd+S dan Ctrl+P / Cmd+P
// di level dokumen. Dipasang di komponen galeri (bukan layout global)
// agar tidak mengganggu halaman lain (mis. form profil yang memang
// perlu Ctrl+S sebagai kebiasaan user).
export function usePreventSave() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMeta = e.ctrlKey || e.metaKey;

      if (isMeta && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        // Tidak menampilkan alert — cukup memblokir diam-diam.
        // Alert yang berulang lebih menganggu pengalaman pengguna sah
        // daripada manfaat deterren-nya bagi pencuri.
      }

      if (isMeta && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}