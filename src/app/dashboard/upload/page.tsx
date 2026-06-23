import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadForm from "@/components/dashboard/UploadForm";

export default async function UploadPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  return (
    <main className="container mx-auto px-4 py-10 max-w-xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Unggah Foto Baru</h1>
        <p className="text-base-content/70 mt-1">
          Gambar akan dikompresi otomatis di perangkat Anda, lalu dianalisis
          oleh AI untuk membuat draf caption dan tag. Anda dapat
          meninjau/mengeditnya sebelum dipublikasikan.
        </p>
      </div>

      <UploadForm />
    </main>
  );
}