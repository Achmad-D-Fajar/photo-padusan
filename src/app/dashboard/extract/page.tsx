import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExtractClient from "@/components/dashboard/ExtractClient";

export default async function ExtractPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  return (
    <main className="container mx-auto px-4 py-12 max-w-6xl watermark-page">
      <header className="watermark-page-header">
        <h1>Ekstraksi watermark</h1>
        <p>Pilih gambar untuk membaca payload watermark tersembunyi. File diunggah sementara untuk proses ekstraksi dan dibersihkan setelah selesai (dengan pembersihan otomatis harian bila terjadi gangguan).</p>
      </header>
      <ExtractClient />
    </main>
  );
}
