import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExtractForm from "@/components/dashboard/ExtractForm";

export default async function ExtractPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  return (
    <main className="container mx-auto px-4 py-12 max-w-6xl watermark-page">
      <header className="watermark-page-header">
        <h1>Ekstraksi watermark</h1>
        <p>Tinjau gambar dan hasil payload dalam satu tempat. Saat ini, layanan ekstraksi belum terhubung.</p>
      </header>
      <ExtractForm />
    </main>
  );
}
