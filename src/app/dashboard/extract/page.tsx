import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DemoExtractForm from "@/components/dashboard/DemoExtractForm";

export default async function ExtractPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  return (
    <main className="container mx-auto px-4 py-12 max-w-6xl watermark-page">
      <header className="watermark-page-header">
        <h1>Ekstraksi watermark</h1>
        <p>Tinjau gambar dan hasil skenario ekstraksi. Halaman ini menggunakan konfigurasi simulasi.</p>
      </header>
      <DemoExtractForm />
    </main>
  );
}
