import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];

function StatusBadge({ status }: { status: PhotoRow["status"] }) {
  if (status === "published") {
    return <span className="badge badge-success">Published</span>;
  }
  if (status === "archived") {
    return <span className="badge badge-neutral">Archived</span>;
  }
  return <span className="badge badge-warning">Draft</span>;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: photos, error: photosError } = await supabase
    .from("photos")
    .select(
      "id, thumbnail_url, caption, tags, status, microstock_url, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (photosError) {
    return (
      <main className="container mx-auto px-4 py-10">
        <div role="alert" className="alert alert-error">
          <span>Gagal memuat foto: {photosError.message}</span>
        </div>
      </main>
    );
  }

  const photoList = photos ?? [];

  return (
    <main className="container mx-auto px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">Dasbor Saya</h1>
          <p className="text-base-content/70 mt-1">
            Kelola draf dan foto yang telah dipublikasikan.
          </p>
        </div>
        <Link href="/dashboard/upload" className="btn btn-primary">
          Unggah Foto Baru
        </Link>
      </div>

      {photoList.length === 0 ? (
        <div className="hero bg-base-200 rounded-box py-16">
          <div className="hero-content text-center">
            <div className="max-w-md">
              <h2 className="text-2xl font-bold">Belum ada foto</h2>
              <p className="py-4 text-base-content/70">
                Mulai unggah foto pertama Anda untuk membuat draf yang akan
                dianalisis oleh AI.
              </p>
              <Link href="/dashboard/upload" className="btn btn-primary">
                Unggah Foto
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {photoList.map((photo) => (
            <div
              key={photo.id}
              className="card bg-base-100 shadow-md border border-base-300"
            >
              <figure className="aspect-square overflow-hidden bg-base-200">
                {photo.thumbnail_url ? (
                  <img
                    src={photo.thumbnail_url}
                    alt={photo.caption || "Foto"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-base-content/40 text-sm">
                    Tidak ada gambar
                  </div>
                )}
              </figure>
              <div className="card-body">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1">
                    {photo.caption || "Tanpa caption"}
                  </p>
                  <StatusBadge status={photo.status} />
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {Array.isArray(photo.tags) &&
                    photo.tags.map((tag, idx) => (
                      <span key={idx} className="badge badge-outline badge-sm">
                        {tag}
                      </span>
                    ))}
                </div>
                <div className="card-actions mt-4">
                  <Link
                    href={`/dashboard/edit/${photo.id}`}
                    className="btn btn-sm btn-primary w-full"
                  >
                    Edit / Publikasikan
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}