"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, clampPage, computeTotalPages } from "@/lib/pagination";

interface PaginationControlsProps {
  page: number;
  pageSize: number;
  totalCount: number;
}

export default function PaginationControls({ page, pageSize, totalCount }: PaginationControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = computeTotalPages(totalCount, pageSize);

  const [pageInput, setPageInput] = useState(String(page));
  const [pageSizeInput, setPageSizeInput] = useState(String(pageSize));

  useEffect(() => { setPageInput(String(page)); }, [page]);
  useEffect(() => { setPageSizeInput(String(pageSize)); }, [pageSize]);

  function navigateTo(rawPage: number, rawPageSize: number) {
    const params = new URLSearchParams(searchParams.toString());
    const clampedPageSize = Math.min(Math.max(Math.floor(rawPageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const safeTotalPages = computeTotalPages(totalCount, clampedPageSize);
    const clampedPage = clampPage(Math.floor(rawPage) || 1, safeTotalPages);

    if (clampedPage === 1) params.delete("page"); else params.set("page", String(clampedPage));
    if (clampedPageSize === DEFAULT_PAGE_SIZE) params.delete("pageSize"); else params.set("pageSize", String(clampedPageSize));

    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function handlePageInputCommit() { const parsed = Number.parseInt(pageInput, 10); navigateTo(Number.isFinite(parsed) ? parsed : 1, pageSize); }
  function handlePageSizeInputCommit() { const parsed = Number.parseInt(pageSizeInput, 10); navigateTo(1, Number.isFinite(parsed) ? parsed : DEFAULT_PAGE_SIZE); }

  const btnClass = "btn bg-white hover:bg-[#111111] hover:text-white text-[#111111] border-4 border-[#111111] rounded-none font-bold text-base sm:text-lg uppercase shadow-[4px_4px_0px_#111111] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#111111] transition-all disabled:opacity-50 disabled:hover:shadow-[4px_4px_0px_#111111] disabled:hover:translate-y-0 disabled:hover:bg-white disabled:hover:text-[#111111]";
  const inputClass = "input text-center rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold text-base sm:text-lg shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] h-12";

  return (
    <div className="flex flex-col xl:flex-row items-center justify-between gap-6 py-8 border-t-4 border-[#111111] mt-12 bg-[#E5E5E5] px-4 sm:px-6">
      <p className="font-bold text-sm sm:text-base uppercase tracking-wide text-[#111111] bg-white border-2 border-[#111111] px-4 py-2 shadow-[4px_4px_0px_#111111] whitespace-nowrap">
        HALAMAN {page} DARI {totalPages} <span className="mx-2">|</span> {totalCount} FOTO
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        <button type="button" onClick={() => navigateTo(page - 1, pageSize)} className={btnClass} disabled={page <= 1}>
          « PREV
        </button>

        <div className="flex items-center gap-2">
          <input type="number" min={1} max={totalPages} value={pageInput} onChange={(e) => setPageInput(e.target.value)} onBlur={handlePageInputCommit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handlePageInputCommit(); } }} className={`${inputClass} w-16 sm:w-20`} aria-label="Lompat ke halaman" />
          <span className="font-bold text-xl sm:text-2xl text-[#111111]">/ {totalPages}</span>
        </div>

        <button type="button" onClick={() => navigateTo(page + 1, pageSize)} className={btnClass} disabled={page >= totalPages}>
          NEXT »
        </button>
      </div>

      <label className="flex items-center gap-3 sm:gap-4 bg-white border-4 border-[#111111] p-2 shadow-[4px_4px_0px_#111111]">
        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-[#111111] whitespace-nowrap ml-2">Per Halaman</span>
        <input type="number" min={1} max={MAX_PAGE_SIZE} value={pageSizeInput} onChange={(e) => setPageSizeInput(e.target.value)} onBlur={handlePageSizeInputCommit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handlePageSizeInputCommit(); } }} className={`${inputClass} w-16 sm:w-24`} aria-label="Jumlah item per halaman" />
      </label>
    </div>
  );
}