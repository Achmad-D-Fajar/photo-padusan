"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  clampPage,
  computeTotalPages,
} from "@/lib/pagination";

interface PaginationControlsProps {
  page: number;
  pageSize: number;
  totalCount: number;
}

export default function PaginationControls({
  page,
  pageSize,
  totalCount,
}: PaginationControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = computeTotalPages(totalCount, pageSize);

  const [pageInput, setPageInput] = useState(String(page));
  const [pageSizeInput, setPageSizeInput] = useState(String(pageSize));

  // Sinkronkan input lokal setiap kali navigasi server (Prev/Next/dsb.)
  // mengubah prop dari luar, agar tidak menampilkan nilai usang.
  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  useEffect(() => {
    setPageSizeInput(String(pageSize));
  }, [pageSize]);

  function navigateTo(rawPage: number, rawPageSize: number) {
    const params = new URLSearchParams(searchParams.toString());

    const clampedPageSize = Math.min(
      Math.max(Math.floor(rawPageSize) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const safeTotalPages = computeTotalPages(totalCount, clampedPageSize);
    const clampedPage = clampPage(Math.floor(rawPage) || 1, safeTotalPages);

    if (clampedPage === 1) {
      params.delete("page");
    } else {
      params.set("page", String(clampedPage));
    }

    if (clampedPageSize === DEFAULT_PAGE_SIZE) {
      params.delete("pageSize");
    } else {
      params.set("pageSize", String(clampedPageSize));
    }

    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function handlePrev() {
    navigateTo(page - 1, pageSize);
  }

  function handleNext() {
    navigateTo(page + 1, pageSize);
  }

  function handlePageInputCommit() {
    const parsed = Number.parseInt(pageInput, 10);
    navigateTo(Number.isFinite(parsed) ? parsed : 1, pageSize);
  }

  function handlePageSizeInputCommit() {
    const parsed = Number.parseInt(pageSizeInput, 10);
    // Mengubah jumlah item per halaman selalu kembali ke halaman 1 agar
    // tidak terdampar di halaman yang sudah tidak valid lagi.
    navigateTo(1, Number.isFinite(parsed) ? parsed : DEFAULT_PAGE_SIZE);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-6 border-t border-base-300 mt-6">
      <p className="text-sm text-base-content/60">
        Halaman {page} dari {totalPages} &middot; {totalCount} foto
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handlePrev}
          className="btn btn-sm btn-outline"
          disabled={page <= 1}
        >
          « Sebelumnya
        </button>

        <div className="join">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={handlePageInputCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handlePageInputCommit();
              }
            }}
            className="input input-bordered input-sm join-item w-16 text-center"
            aria-label="Lompat ke halaman"
          />
          <span className="join-item btn btn-sm btn-disabled no-animation">
            / {totalPages}
          </span>
        </div>

        <button
          type="button"
          onClick={handleNext}
          className="btn btn-sm btn-outline"
          disabled={page >= totalPages}
        >
          Berikutnya »
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-base-content/60 whitespace-nowrap">
          Per halaman
        </span>
        <input
          type="number"
          min={1}
          max={MAX_PAGE_SIZE}
          value={pageSizeInput}
          onChange={(e) => setPageSizeInput(e.target.value)}
          onBlur={handlePageSizeInputCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handlePageSizeInputCommit();
            }
          }}
          className="input input-bordered input-sm w-20"
          aria-label="Jumlah item per halaman"
        />
      </label>
    </div>
  );
}