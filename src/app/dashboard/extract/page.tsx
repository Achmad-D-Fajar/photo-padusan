import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RealExtractForm from "@/components/dashboard/RealExtractForm";

export default async function ExtractPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  return (
    <main className="container mx-auto px-4 py-12 max-w-6xl watermark-page">
      <header className="watermark-page-header">
        <h1>Ekstraksi watermark</h1>
        <p>Unggah gambar dan masukkan passphrase pemilik foto. Paket watermark diekstrak dari koefisien DCT, lalu sertifikat didekripsi AES-256-GCM di server — kunci salah atau data yang dimanipulasi akan ditolak.</p>
      </header>
      <RealExtractForm />
    </main>
  );
}
