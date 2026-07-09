import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditPhotoForm from "@/components/dashboard/EditPhotoForm";

interface EditPhotoPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPhotoPage({ params }: EditPhotoPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const { data: photo, error: photoError } = await supabase
    .from("photos")
    .select("id, user_id, thumbnail_url, caption_en, caption_id, tags_en, tags_id, microstock_url, status, created_at")
    .eq("id", id)
    .single();

  if (photoError || !photo || photo.user_id !== user.id) notFound();

  return (
    <main className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="mb-12 border-b-4 border-[#111111] pb-8">
        <h1 className="font-display text-5xl font-bold uppercase tracking-tighter text-[#111111] mb-4">
          Edit Foto
        </h1>
        <p className="text-xl font-bold text-[#111111] bg-white border-2 border-[#111111] px-4 py-2 shadow-[4px_4px_0px_#111111] inline-block uppercase tracking-wide">
          Tinjau caption dan tag AI, publikasikan jika siap.
        </p>
      </div>

      <EditPhotoForm photo={photo as any} />
    </main>
  );
}