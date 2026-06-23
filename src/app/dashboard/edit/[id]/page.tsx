import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditPhotoForm from "@/components/dashboard/EditPhotoForm";

interface EditPhotoPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPhotoPage({ params }: EditPhotoPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: photo, error: photoError } = await supabase
    .from("photos")
    .select(
      "id, user_id, thumbnail_url, caption, tags, microstock_url, status, created_at"
    )
    .eq("id", id)
    .single();

  // Selain RLS (yang sudah membatasi update/delete hanya milik sendiri),
  // halaman edit secara eksplisit ditolak untuk foto yang bukan milik
  // pengguna — termasuk foto published milik fotografer lain yang
  // sebenarnya bisa mereka SELECT lewat policy publik.
  if (photoError || !photo || photo.user_id !== user.id) {
    notFound();
  }

  return (
    <main className="container mx-auto px-4 py-10 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Edit Foto</h1>
        <p className="text-base-content/70 mt-1">
          Tinjau caption dan tag dari AI, lalu publikasikan jika sudah siap.
        </p>
      </div>

      <EditPhotoForm photo={photo} />
    </main>
  );
}