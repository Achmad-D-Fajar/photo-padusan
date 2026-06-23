import { createClient } from "@/lib/supabase/server";
import { buildPublicPhotosQuery } from "@/lib/queries/public-photos";
import SearchBar from "@/components/public/SearchBar";
import PhotoGrid from "@/components/public/PhotoGrid";

interface HomePageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

function sanitizeSearchKeyword(raw: string): string {
  return raw.trim().slice(0, 100).replace(/[(),"]/g, "");
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = await searchParams;
  const rawKeyword = Array.isArray(resolvedSearchParams.q)
    ? resolvedSearchParams.q[0]
    : resolvedSearchParams.q;
  const keyword = sanitizeSearchKeyword(rawKeyword ?? "");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="container mx-auto px-4 py-10">
        <div role="alert" className="alert alert-error">
          <span>
            Konfigurasi server tidak lengkap: variabel lingkungan Supabase
            tidak ditemukan.
          </span>
        </div>
      </main>
    );
  }

  const supabase = await createClient();

  const photosQuery = buildPublicPhotosQuery(supabase, keyword);
  const { data: photos, error } = await photosQuery;

  if (error) {
    return (
      <main className="container mx-auto px-4 py-10">
        <div role="alert" className="alert alert-error">
          <span>Gagal memuat foto: {error.message}</span>
        </div>
      </main>
    );
  }

  const photoList = photos ?? [];

  return (
    <main className="container mx-auto px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold">Etalase Foto</h1>
        <p className="text-base-content/70 mt-2 max-w-xl mx-auto">
          Jelajahi karya fotografer komunitas kami. Klik &quot;Beli / Unduh
          Resolusi Tinggi&quot; untuk mendukung mereka langsung di
          microstock.
        </p>
      </div>

      <div className="max-w-md mx-auto mb-10">
        <SearchBar initialKeyword={keyword} />
      </div>

      <PhotoGrid photos={photoList} keyword={keyword} />
    </main>
  );
}