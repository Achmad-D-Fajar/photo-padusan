// % dan _ adalah wildcard pada operator ILIKE Postgres, harus di-escape
// agar nilai pengguna (keyword pencarian, display_name) tidak diperlakukan
// sebagai pattern matching liar. Dipakai oleh query publik & halaman profil.
export function escapeIlikePattern(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}