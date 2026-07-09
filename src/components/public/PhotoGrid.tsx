"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicPhotoItem } from "@/lib/queries/public-photos";
import { LOAD_MORE_INCREMENT } from "@/lib/pagination";
import ProtectedImage from "@/components/shared/ProtectedImage";
import { usePreventSave } from "@/hooks/usePreventSave";

interface LoadMoreResult { items: PublicPhotoItem[]; error: string | null; }
interface PhotoGridProps {
  photos: PublicPhotoItem[];
  totalCount: number;
  initialOffset: number;
  isFiltering: boolean;
  loadMoreAction?: (offset: number, limit: number) => Promise<LoadMoreResult>;
}

function getPhotographerLabel(photo: PublicPhotoItem): string { return photo.full_name && photo.full_name.trim().length > 0 ? photo.full_name : `@${photo.display_name}`; }
function getPhotographerHref(photo: PublicPhotoItem): string { return `/photographer/${photo.display_name}`; }

export default function PhotoGrid({ photos, totalCount, initialOffset, isFiltering, loadMoreAction }: PhotoGridProps) {
  usePreventSave();
  const [items, setItems] = useState<PublicPhotoItem[]>(photos);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  useEffect(() => { setItems(photos); setLoadMoreError(""); }, [photos, initialOffset]);

  const remainingCount = totalCount - (initialOffset + items.length);
  const hasMore = remainingCount > 0;

  async function handleLoadMore() {
    if (!loadMoreAction || isLoadingMore) return;
    setIsLoadingMore(true); setLoadMoreError("");
    try {
      const result = await loadMoreAction(initialOffset + items.length, LOAD_MORE_INCREMENT);
      if (result.error) throw new Error(result.error);
      setItems((prev) => [...prev, ...result.items]);
    } catch (err) { setLoadMoreError(err instanceof Error ? err.message : "Gagal memuat foto tambahan."); }
    finally { setIsLoadingMore(false); }
  }

  if (items.length === 0) {
    return (
      <div className="hero bg-[#E5E5E5] border-4 border-[#111111] shadow-[8px_8px_0px_#111111] p-12">
        <div className="hero-content text-center flex-col">
          <h2 className="font-display text-4xl sm:text-5xl font-bold uppercase tracking-tight text-[#111111]">
            {isFiltering ? "TIDAK ADA HASIL" : "BELUM ADA FOTO"}
          </h2>
          <p className="py-4 text-xl font-bold text-[#111111] max-w-lg leading-relaxed bg-white border-2 border-[#111111] px-6 mt-4 shadow-[4px_4px_0px_#111111]">
            {isFiltering ? "Coba ubah kata kunci atau filter pencarian Anda." : "Nantikan karya terbaik dari komunitas kami."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {items.map((photo) => {
          const photographerLabel = getPhotographerLabel(photo);
          const photographerHref = getPhotographerHref(photo);

          return (
            <div key={photo.id} className="card bg-white border-4 border-[#111111] shadow-[8px_8px_0px_#111111] rounded-none hover:-translate-y-1 hover:shadow-[12px_12px_0px_#111111] transition-all flex flex-col group">
              <Link href={`/photo/${photo.id}`} scroll={false} className="block w-full focus:outline-none focus:ring-4 focus:ring-[#44AA99]">
                <figure className="aspect-square bg-[#E5E5E5] border-b-4 border-[#111111] relative overflow-hidden">
                  {photo.thumbnail_url ? (
                    <ProtectedImage src={photo.thumbnail_url} alt={photo.caption_id ?? photo.caption_en ?? "Foto"} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-[#111111]">No Image</div>
                  )}
                  {photo.microstock_url === null && (
                    <span className="absolute bottom-3 left-3 bg-[#117733] text-[#E5E5E5] border-2 border-[#111111] font-bold text-xs uppercase px-3 py-2 shadow-[2px_2px_0px_#111111]">
                      UNDUH GRATIS
                    </span>
                  )}
                </figure>
              </Link>
              <div className="card-body p-5 gap-3 flex flex-col justify-between flex-1">
                <Link href={`/photo/${photo.id}`} scroll={false} className="font-bold text-lg leading-snug line-clamp-2 text-[#111111] hover:text-[#332288] hover:underline focus:outline-none focus:ring-2 focus:ring-[#44AA99]">
                  {photo.caption_id ?? photo.caption_en ?? "Tanpa caption"}
                </Link>
                <div className="bg-[#E5E5E5] border-2 border-[#111111] p-2 mt-auto">
                  <Link href={photographerHref} className="text-sm font-bold text-[#111111] uppercase tracking-wide hover:text-[#332288] hover:underline focus:outline-none focus:ring-2 focus:ring-[#44AA99]">
                    Oleh: {photographerLabel}
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {loadMoreError && <div role="alert" className="alert bg-[#882255] text-white border-4 border-[#111111] rounded-none font-bold text-lg p-6 shadow-[6px_6px_0px_#111111] mt-12"><span>{loadMoreError}</span></div>}

      {loadMoreAction && hasMore && (
        <div className="flex justify-center mt-16">
          <button type="button" onClick={handleLoadMore} disabled={isLoadingMore} className="btn bg-white hover:bg-[#E5E5E5] text-[#111111] border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 px-12 shadow-[8px_8px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all">
            {isLoadingMore ? "Memuat..." : `Muat ${Math.min(LOAD_MORE_INCREMENT, remainingCount)} Foto Lagi`}
          </button>
        </div>
      )}
    </>
  );
}