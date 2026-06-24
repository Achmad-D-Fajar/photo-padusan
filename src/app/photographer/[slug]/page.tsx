import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildPhotographerPhotosQuery } from "@/lib/queries/public-photos";
import { escapeIlikePattern } from "@/lib/supabase/ilike";
import PhotoGrid from "@/components/public/PhotoGrid";

interface PhotographerPageProps {
  params: Promise<{ slug: string }>;
}

function getInitial(label: string): string {
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : "?";
}

export default async function PhotographerPage({
  params,
}: PhotographerPageProps) {
  const { slug } = await params;

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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, full_name, bio, avatar_url")
    .ilike("display_name", escapeIlikePattern(slug))
    .maybeSingle();

  if (profileError || !profile) {
    notFound();
  }

  const { data: photos, error: photosError } = await buildPhotographerPhotosQuery(
    supabase,
    profile.id
  );

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
  const displayLabel = profile.full_name || `@${profile.display_name}`;
  const initial = getInitial(displayLabel);

  return (
    <main className="container mx-auto px-4 py-10">
      <div className="flex flex-col items-center text-center mb-10 max-w-md mx-auto">
        {profile.avatar_url ? (
          <div className="avatar mb-4">
            <div className="w-24 rounded-full">
              <img src={profile.avatar_url} alt={displayLabel} />
            </div>
          </div>
        ) : (
          <div className="avatar avatar-placeholder mb-4">
            <div className="bg-neutral text-neutral-content w-24 rounded-full">
              <span className="text-3xl">{initial}</span>
            </div>
          </div>
        )}

        <h1 className="text-2xl font-bold">
          {profile.full_name || profile.display_name}
        </h1>
        <p className="text-base-content/60">@{profile.display_name}</p>

        {profile.bio && (
          <p className="text-base-content/80 mt-3">{profile.bio}</p>
        )}

        <p className="text-sm text-base-content/50 mt-4">
          {photoList.length} foto dipublikasikan
        </p>
      </div>

      <PhotoGrid photos={photoList} isFiltering={false} />
    </main>
  );
}