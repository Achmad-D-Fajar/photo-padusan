"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicPhotoItem } from "@/lib/queries/public-photos";
import { LOAD_MORE_INCREMENT } from "@/lib/pagination";
import ProtectedImage from "@/components/shared/ProtectedImage";
import { usePreventSave } from "@/hooks/usePreventSave";

interface LoadMoreResult {
  items: PublicPhotoItem[];
  error: string | null;
}

interface PhotoGridProps {
  photos: PublicPhotoItem[];
  totalCount: number;
  initialOffset: number;
  isFiltering: boolean;
  loadMoreAction?: (offset: number, limit: number) => Promise<LoadMoreResult>;
}

function getPhotographerLabel(photo: PublicPhotoItem): string {
  if (photo.full_name && photo.full_name.trim().length > 0) {
    return photo.full_name;
  }
  return `@${photo.display_name}`;
}

function getPhotographerHref(photo: PublicPhotoItem): string {
  return `/photographer/${photo.display_name}`;
}

function formatUploadDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function PhotoGrid({
  photos,
  totalCount,
  initialOffset,
  isFiltering,
  loadMoreAction,
}: PhotoGridProps) {
  // Ctrl+S / Cmd+S / Ctrl+P pencegahan aktif saat komponen ini mounted
  // (yaitu hanya di halaman yang menampilkan galeri publik).
  usePreventSave();

  const [items, setItems] = useState<PublicPhotoItem[]>(photos);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<PublicPhotoItem | null>(null);

  useEffect(() => {
    setItems(photos);
    setLoadMoreError("");
  }, [photos, initialOffset]);

  function closeModal() {
    setSelectedPhoto(null);
  }

  useEffect(() => {
    if (!selectedPhoto) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeModal();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedPhoto]);

  const remainingCount = totalCount - (initialOffset + items.length);
  const hasMore = remainingCount > 0;

  async function handleLoadMore() {
    if (!loadMoreAction || isLoadingMore) return;

    setIsLoadingMore(true);
    setLoadMoreError("");

    try {
      const offset = initialOffset + items.length;
      const result = await loadMoreAction(offset, LOAD_MORE_INCREMENT);

      if (result.error) {
        throw new Error(result.error);
      }

      setItems((prev) => [...prev, ...result.items]);
    } catch (err) {
      setLoadMoreError(
        err instanceof Error ? err.message : "Gagal memuat foto tambahan."
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="hero bg-base-200 rounded-box py-16">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h2 className="text-2xl font-bold">
              {isFiltering
                ? "Tidak ada hasil yang cocok"
                : "Belum ada foto yang dipublikasikan"}
            </h2>
            <p className="py-4 text-base-content/70">
              {isFiltering
                ? "Coba ubah kata kunci atau filter pencarian Anda."
                : "Nantikan karya terbaik dari komunitas kami."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {items.map((photo) => {
          const photographerLabel = getPhotographerLabel(photo);
          const photographerHref = getPhotographerHref(photo);

          return (
            <div
              key={photo.id}
              className="card bg-base-100 shadow-md border border-base-300 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setSelectedPhoto(photo)}
                className="block w-full text-left cursor-pointer"
                aria-label={`Lihat detail foto: ${photo.caption || "Tanpa caption"}`}
              >
                <figure className="aspect-square overflow-hidden bg-base-200">
                  {photo.thumbnail_url ? (
                    // ProtectedImage menggantikan <img> biasa.
                    // Klik masih berfungsi normal (diteruskan ke button wrapper).
                    <ProtectedImage
                      src={photo.thumbnail_url}
                      alt={photo.caption || "Foto"}
                      className="w-full h-full object-cover transition-transform hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-base-content/40 text-sm">
                      Tidak ada gambar
                    </div>
                  )}
                </figure>
              </button>

              <div className="card-body p-4 gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(photo)}
                  className="text-sm text-left line-clamp-2 cursor-pointer hover:text-primary"
                >
                  {photo.caption || "Tanpa caption"}
                </button>

                <Link
                  href={photographerHref}
                  className="text-xs text-base-content/60 hover:text-primary hover:underline"
                >
                  Oleh {photographerLabel}
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {loadMoreError && (
        <div role="alert" className="alert alert-error mt-4">
          <span>{loadMoreError}</span>
        </div>
      )}

      {loadMoreAction && hasMore && (
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={handleLoadMore}
            className="btn btn-outline"
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Memuat...
              </>
            ) : (
              `Muat ${Math.min(LOAD_MORE_INCREMENT, remainingCount)} Foto Lagi`
            )}
          </button>
        </div>
      )}

      <dialog className={`modal ${selectedPhoto ? "modal-open" : ""}`}>
        {selectedPhoto && (
          <div className="modal-box max-w-2xl p-0 overflow-hidden">
            <button
              type="button"
              onClick={closeModal}
              className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3 z-10 bg-base-100/80"
              aria-label="Tutup"
            >
              ✕
            </button>

            <div className="bg-base-200">
              {selectedPhoto.thumbnail_url ? (
                <ProtectedImage
                  src={selectedPhoto.thumbnail_url}
                  alt={selectedPhoto.caption || "Foto"}
                  className="w-full max-h-[60vh] object-contain"
                />
              ) : (
                <div className="w-full h-64 flex items-center justify-center text-base-content/40 text-sm">
                  Tidak ada gambar
                </div>
              )}
            </div>

            <div className="p-6">
              <p className="text-base mb-2">
                {selectedPhoto.caption || "Tanpa caption"}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <Link
                  href={getPhotographerHref(selectedPhoto)}
                  className="text-sm font-medium hover:text-primary hover:underline"
                  onClick={closeModal}
                >
                  Oleh {getPhotographerLabel(selectedPhoto)}
                </Link>
                <span className="text-xs text-base-content/50">
                  {formatUploadDate(selectedPhoto.created_at)}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                {Array.isArray(selectedPhoto.tags) &&
                  selectedPhoto.tags.map((tag, idx) => (
                    <span key={idx} className="badge badge-outline">
                      {tag}
                    </span>
                  ))}
              </div>

              {selectedPhoto.microstock_url ? (
                <a
                  href={selectedPhoto.microstock_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary w-full"
                >
                  Beli / Unduh Resolusi Tinggi
                </a>
              ) : (
                <button type="button" className="btn btn-disabled w-full" disabled>
                  Tautan belum tersedia
                </button>
              )}
            </div>
          </div>
        )}
        <div className="modal-backdrop" onClick={closeModal}></div>
      </dialog>
    </>
  );
}