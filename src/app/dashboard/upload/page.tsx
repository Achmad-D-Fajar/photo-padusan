import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadForm from "@/components/dashboard/UploadForm";

export default async function UploadPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  return (
    <main className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="mb-12 border-b-4 border-[#111111] pb-8">
        <h1 className="font-display text-5xl font-bold uppercase tracking-tighter text-[#111111] mb-4">
          Unggah Foto Baru
        </h1>
        <p className="text-xl font-bold text-[#111111] bg-white border-2 border-[#111111] p-4 shadow-[4px_4px_0px_#111111] leading-relaxed">
          Gambar akan dikompresi otomatis, lalu dianalisis AI untuk draf caption dan tag. Tinjau dan edit sebelum dipublikasikan.
        </p>
      </div>

      <UploadForm />
    </main>
  );
}