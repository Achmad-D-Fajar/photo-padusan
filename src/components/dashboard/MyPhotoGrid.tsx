"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MyPhotoItem } from "@/lib/queries/public-photos";
import { LOAD_MORE_INCREMENT } from "@/lib/pagination";

interface LoadMoreResult {
  items: MyPhotoItem[];
  error: string | null;
}

interface MyPhotoGridProps {
  photos: MyPhotoItem[];
  totalCount: number;
  initialOffset: number;
  isFiltering: boolean;
  loadMoreAction: (offset: number, limit: number) => Promise<LoadMoreResult>;
}

function StatusBadge({ status }: { status: MyPhotoItem["status"] }) {
  if (status === "published") {
    return <span className="badge badge-success">Published</span>;
  }
  if (status === "archived") {
    return <span className="badge badge-neutral">Archived</span>;
  }
  return <span className="badge badge-warning">Draft</span>;
}

export default function MyPhotoGrid({
  photos,
  totalCount,
  initialOffset,
  isFiltering,
  loadMoreAction,
}: MyPhotoGridProps) {
  const [items, setItems] = useState<MyPhotoItem[]>(photos);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  useEffect(() => {
    setItems(photos);
    setLoadMoreError("");
  }, [photos, initialOffset]);

  const remainingCount = totalCount - (initialOffset + items.length);
  const hasMore = remainingCount > 0;

  async function handleLoadMore() {
    if (isLoadingMore) return;

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
              {isFiltering ? "Tidak ada hasil yang cocok" : "Belum ada foto"}
            </h2>
            <p className="py-4 text-base-content/70">
              {isFiltering
                ? "Coba ubah kata kunci atau filter pencarian Anda."
                : "Mulai unggah foto pertama Anda untuk membuat draf yang akan dianalisis oleh AI."}
            </p>
            {!isFiltering && (
              <Link href="/dashboard/upload" className="btn btn-primary">
                Unggah Foto
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {items.map((photo) => (
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

      {loadMoreError && (
        <div role="alert" className="alert alert-error mt-4">
          <span>{loadMoreError}</span>
        </div>
      )}

      {hasMore && (
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