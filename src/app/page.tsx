import { createClient } from "@supabase/supabase-js";

interface Photo {
  id: string;
  image_url: string;
  caption: string;
  tags: string[];
  created_at: string;
}

export default async function HomePage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="container mx-auto px-4 py-10">
        <div role="alert" className="alert alert-error">
          <span>
            Server configuration error: Missing Supabase environment
            variables. Please set NEXT_PUBLIC_SUPABASE_URL and
            NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </span>
        </div>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: photos, error } = await supabase
    .from("photos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="container mx-auto px-4 py-10">
        <div role="alert" className="alert alert-error">
          <span>Failed to load photos: {error.message}</span>
        </div>
      </main>
    );
  }

  const photoList = (photos as Photo[]) ?? [];

  return (
    <main className="container mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Etalase Digital Padusan</h1>
        <p className="text-base-content/70 mt-1">
          Galeri foto digital warga Desa Padusan.
        </p>
      </div>

      {photoList.length === 0 ? (
        <div className="hero bg-base-200 rounded-box py-16">
          <div className="hero-content text-center">
            <div className="max-w-md">
              <h2 className="text-2xl font-bold">No photos yet</h2>
              <p className="py-4 text-base-content/70">
                Belum ada foto yang diunggah. Jadilah yang pertama membagikan
                momen dari Padusan.
              </p>
              <a href="/upload" className="btn btn-primary">
                Upload Photo
              </a>
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
                <img
                  src={photo.image_url}
                  alt={photo.caption || "Photo"}
                  className="w-full h-full object-cover"
                />
              </figure>
              <div className="card-body">
                <p className="text-sm">{photo.caption || "No caption"}</p>
                <div className="card-actions flex flex-wrap gap-2 mt-2">
                  {Array.isArray(photo.tags) &&
                    photo.tags.map((tag, idx) => (
                      <span key={idx} className="badge badge-outline badge-sm">
                        {tag}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}