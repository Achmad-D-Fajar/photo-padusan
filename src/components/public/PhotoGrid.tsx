import type { PublicPhotoItem } from "@/lib/queries/public-photos";

interface PhotoGridProps {
  photos: PublicPhotoItem[];
  keyword: string;
}

function getPhotographerLabel(
  profile: PublicPhotoItem["profiles"]
): string {
  if (!profile) {
    return "Fotografer tidak diketahui";
  }
  if (profile.full_name && profile.full_name.trim().length > 0) {
    return profile.full_name;
  }
  return `@${profile.display_name}`;
}

export default function PhotoGrid({ photos, keyword }: PhotoGridProps) {
  if (photos.length === 0) {
    return (
      <div className="hero bg-base-200 rounded-box py-16">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h2 className="text-2xl font-bold">
              {keyword
                ? `Tidak ada hasil untuk "${keyword}"`
                : "Belum ada foto yang dipublikasikan"}
            </h2>
            <p className="py-4 text-base-content/70">
              {keyword
                ? "Coba gunakan kata kunci lain atau hapus filter pencarian."
                : "Nantikan karya-karya fotografer komunitas kami di sini."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {photos.map((photo) => (
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
            <p className="text-sm">{photo.caption || "Tanpa caption"}</p>

            <div className="flex flex-wrap gap-2 mt-1">
              {Array.isArray(photo.tags) &&
                photo.tags.map((tag, idx) => (
                  <span key={idx} className="badge badge-outline badge-sm">
                    {tag}
                  </span>
                ))}
            </div>

            <p className="text-xs text-base-content/60 mt-2">
              Oleh {getPhotographerLabel(photo.profiles)}
            </p>

            <div className="card-actions mt-4">
              {photo.microstock_url ? (
                <a
                  href={photo.microstock_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm w-full"
                >
                  Beli / Unduh Resolusi Tinggi
                </a>
              ) : (
                <button
                  type="button"
                  className="btn btn-disabled btn-sm w-full"
                  disabled
                >
                  Tautan belum tersedia
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}