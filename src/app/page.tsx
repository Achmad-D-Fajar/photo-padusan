import { createClient } from "@supabase/supabase-js";
import PhotoGrid from "@/components/PhotoGrid";

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
          Galeri foto digital warga Desa Padusan. Klik foto untuk edit atau
          hapus.
        </p>
      </div>

      <PhotoGrid initialPhotos={photoList} />
    </main>
  );
}