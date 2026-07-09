"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MyPhotoItem } from "@/lib/queries/public-photos";
import { LOAD_MORE_INCREMENT } from "@/lib/pagination";

interface LoadMoreResult { items: MyPhotoItem[]; error: string | null; }
interface MyPhotoGridProps {
  photos: MyPhotoItem[];
  totalCount: number;
  initialOffset: number;
  isFiltering: boolean;
  loadMoreAction: (offset: number, limit: number) => Promise<LoadMoreResult>;
}

function StatusBadge({ status }: { status: MyPhotoItem["status"] }) {
  const baseClass = "badge font-bold text-sm uppercase px-3 py-3 border-2 border-[#111111] rounded-none shadow-[2px_2px_0px_#111111]";
  if (status === "published") return <span className={`${baseClass} bg-[#44AA99] text-[#111111]`}>PUBLIK</span>;
  if (status === "archived") return <span className={`${baseClass} bg-[#CC6677] text-white`}>ARSIP</span>;
  return <span className={`${baseClass} bg-[#E5E5E5] text-[#111111]`}>DRAF</span>;
}

export default function MyPhotoGrid({ photos, totalCount, initialOffset, isFiltering, loadMoreAction }: MyPhotoGridProps) {
  const [items, setItems] = useState<MyPhotoItem[]>(photos);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  useEffect(() => { setItems(photos); setLoadMoreError(""); }, [photos, initialOffset]);

  const remainingCount = totalCount - (initialOffset + items.length);
  const hasMore = remainingCount > 0;

  async function handleLoadMore() {
    if (isLoadingMore) return;
    setIsLoadingMore(true); setLoadMoreError("");
    try {
      const result = await loadMoreAction(initialOffset + items.length, LOAD_MORE_INCREMENT);
      if (result.error) throw new Error(result.error);
      setItems((prev) => [...prev, ...result.items]);
    } catch (err) {
      setLoadMoreError(err instanceof Error ? err.message : "Gagal memuat foto tambahan.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="hero bg-[#E5E5E5] border-4 border-[#111111] shadow-[8px_8px_0px_#111111] p-12">
        <div className="hero-content text-center flex-col">
          <h2 className="font-display text-4xl font-bold uppercase tracking-tight text-[#111111]">
            {isFiltering ? "Tidak ada hasil" : "Belum ada foto"}
          </h2>
          <p className="py-4 text-xl font-bold text-[#111111] max-w-lg leading-relaxed">
            {isFiltering ? "Ubah kata kunci pencarian." : "Mulai unggah karya Anda sekarang untuk dianalisis AI."}
          </p>
          {!isFiltering && (
            <Link href="/dashboard/upload" className="btn bg-[#117733] hover:bg-[#0e5c27] text-white border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 px-8 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all">
              Unggah Foto
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {items.map((photo) => {
          const combinedTags = [...new Set([...(photo.tags_id ?? []), ...(photo.tags_en ?? [])])].slice(0, 3);
          return (
            <div key={photo.id} className="card bg-white border-4 border-[#111111] shadow-[8px_8px_0px_#111111] rounded-none flex flex-col group">
              <figure className="aspect-square bg-[#E5E5E5] border-b-4 border-[#111111] relative overflow-hidden">
                {photo.thumbnail_url ? (
                  <img src={photo.thumbnail_url} alt={photo.caption_id || "Foto"} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold">No Image</div>
                )}
              </figure>
              <div className="card-body p-6 flex flex-col justify-between flex-1 gap-6">
                <div>
                  <div className="flex justify-between items-start gap-2 mb-4">
                    <p className="font-bold text-lg leading-snug line-clamp-2 text-[#111111]">{photo.caption_id || photo.caption_en || "Tanpa judul"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {combinedTags.map((tag, idx) => (
                      <span key={idx} className="bg-[#88CCEE] text-[#111111] border-2 border-[#111111] text-xs font-bold px-2 py-1 uppercase">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3 mt-auto">
                  <div className="flex justify-between items-center border-b-2 border-[#111111] pb-2">
                    <span className="font-bold text-xs uppercase tracking-widest text-[#111111]">Status</span>
                    <StatusBadge status={photo.status} />
                  </div>
                  <Link href={`/dashboard/edit/${photo.id}`} className="btn bg-[#332288] hover:bg-[#20155c] text-white border-4 border-[#111111] rounded-none font-bold text-lg uppercase shadow-[4px_4px_0px_#111111] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#111111] transition-all w-full mt-2">
                    Edit / Rilis
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {loadMoreError && <div role="alert" className="alert bg-[#882255] text-white border-4 border-[#111111] rounded-none font-bold text-lg p-6 shadow-[6px_6px_0px_#111111] mt-8"><span>{loadMoreError}</span></div>}

      {hasMore && (
        <div className="flex justify-center mt-12">
          <button type="button" onClick={handleLoadMore} disabled={isLoadingMore} className="btn bg-white hover:bg-[#E5E5E5] text-[#111111] border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 px-12 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all">
            {isLoadingMore ? "Memuat..." : `Muat ${Math.min(LOAD_MORE_INCREMENT, remainingCount)} Foto Lagi`}
          </button>
        </div>
      )}
    </>
  );
}