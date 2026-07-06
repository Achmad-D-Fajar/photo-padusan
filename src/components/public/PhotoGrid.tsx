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

export default function PhotoGrid({
  photos,
  totalCount,
  initialOffset,
  isFiltering,
  loadMoreAction,
}: PhotoGridProps) {
  // Ctrl+S / Cmd+S / Ctrl+P pencegahan aktif
  usePreventSave();

  const [items, setItems] = useState<PublicPhotoItem[]>(photos);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  useEffect(() => {
    setItems(photos);
    setLoadMoreError("");
  }, [photos, initialOffset]);

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
              {/* BUTTON DIGANTI MENJADI LINK. scroll={false} mencegah halaman lompat ke atas */}
              <Link
                href={`/photo/${photo.id}`}
                scroll={false}
                className="block w-full text-left cursor-pointer"
                aria-label={`Lihat detail foto: ${photo.caption_id ?? photo.caption_en ?? "Tanpa caption"}`}
              >
                <figure className="aspect-square overflow-hidden bg-base-200">
                  {photo.thumbnail_url ? (
                    <ProtectedImage
                      src={photo.thumbnail_url}
                      alt={photo.caption_id ?? photo.caption_en ?? "Foto"}
                      className="w-full h-full object-cover transition-transform hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-base-content/40 text-sm">
                      Tidak ada gambar
                    </div>
                  )}
                </figure>
              </Link>

              <div className="card-body p-4 gap-1">
                <Link
                  href={`/photo/${photo.id}`}
                  scroll={false}
                  className="text-sm text-left line-clamp-2 cursor-pointer hover:text-primary block"
                >
                  {photo.caption_id ?? photo.caption_en ?? "Tanpa caption"}
                </Link>

                <Link
                  href={photographerHref}
                  className="text-xs text-base-content/60 hover:text-primary hover:underline block"
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
    </>
  );
}