import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildMyPhotosQuery,
  type SearchScope,
  type SortBy,
  type SortOrder,
} from "@/lib/queries/public-photos";
import {
  sanitizePage,
  sanitizePageSize,
  computeRange,
} from "@/lib/pagination";
import SearchBar from "@/components/public/SearchBar";
import MyPhotoGrid from "@/components/dashboard/MyPhotoGrid";
import PaginationControls from "@/components/shared/PaginationControls";

interface DashboardPageProps {
  searchParams: Promise<{
    q?: string | string[];
    scope?: string | string[];
    start?: string | string[];
    end?: string | string[];
    sortBy?: string | string[];
    sortOrder?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
  }>;
}

const VALID_SCOPES: SearchScope[] = ["caption", "tags"];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function sanitizeKeyword(raw: string): string {
  return raw.trim().slice(0, 100).replace(/[(),"]/g, "");
}

function sanitizeScopes(raw: string): SearchScope[] {
  if (!raw) return [];
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SearchScope => VALID_SCOPES.includes(s as SearchScope));
  return Array.from(new Set(parsed));
}

function sanitizeDate(raw: string): string {
  return DATE_REGEX.test(raw) ? raw : "";
}

function sanitizeSortBy(raw: string): SortBy {
  if (raw === "caption_id" || raw === "caption_en") return raw;
  return "created_at";
}

function sanitizeSortOrder(raw: string): SortOrder {
  return raw === "asc" ? "asc" : "desc";
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const resolved = await searchParams;

  const keyword = sanitizeKeyword(firstValue(resolved.q));
  const scopes = sanitizeScopes(firstValue(resolved.scope));
  const startDate = sanitizeDate(firstValue(resolved.start));
  const endDate = sanitizeDate(firstValue(resolved.end));
  const sortBy = sanitizeSortBy(firstValue(resolved.sortBy));
  const sortOrder = sanitizeSortOrder(firstValue(resolved.sortOrder));
  const page = sanitizePage(firstValue(resolved.page));
  const pageSize = sanitizePageSize(firstValue(resolved.pageSize));

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { from, to } = computeRange(page, pageSize);
  const filters = { keyword, scopes, startDate, endDate, sortBy, sortOrder };

  const { data: photos, count, error: photosError } = await buildMyPhotosQuery(
    supabase,
    user.id,
    { ...filters, from, to }
  );

  if (photosError) {
    return (
      <main className="container mx-auto px-4 py-12">
        <div role="alert" className="alert rounded-none border-4 border-[#111111] shadow-[8px_8px_0px_#111111] bg-[#882255] text-white p-6 font-bold text-lg">
          <span>Gagal memuat foto: {photosError.message}</span>
        </div>
      </main>
    );
  }

  const photoList = photos ?? [];
  const totalCount = count ?? 0;
  const isFiltering =
    keyword.length > 0 ||
    scopes.length > 0 ||
    startDate.length > 0 ||
    endDate.length > 0;

  async function loadMoreMyPhotos(offset: number, limit: number) {
    "use server";

    const supabaseForAction = await createClient();

    const {
      data: { user: actionUser },
    } = await supabaseForAction.auth.getUser();

    if (!actionUser) {
      return {
        items: [],
        error: "Sesi telah berakhir. Silakan muat ulang halaman.",
      };
    }

    const { data, error: loadMoreErrorResult } = await buildMyPhotosQuery(
      supabaseForAction,
      actionUser.id,
      { ...filters, from: offset, to: offset + limit - 1 }
    );

    if (loadMoreErrorResult) {
      return { items: [], error: loadMoreErrorResult.message };
    }

    return { items: data ?? [], error: null };
  }

  return (
    <main className="container mx-auto px-4 py-12">
      {/* HEADER DASBOR */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-12 border-b-4 border-[#111111] pb-8">
        <div className="flex flex-col items-start gap-3">
          <h1 className="font-display text-5xl font-bold uppercase tracking-tighter text-[#111111]">
            Dasbor Saya
          </h1>
          <p className="text-xl font-bold text-[#111111] bg-white border-2 border-[#111111] px-4 py-2 shadow-[4px_4px_0px_#111111] uppercase tracking-wide">
            Kelola draf dan foto yang telah dipublikasikan.
          </p>
        </div>
        
        <Link 
          href="/dashboard/upload" 
          className="btn bg-[#117733] hover:bg-[#0e5c27] text-white border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 px-8 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all flex-shrink-0"
        >
          + UNGGAH FOTO BARU
        </Link>
      </div>

      {/* WRAPPER PENCARIAN */}
      <div className="max-w-4xl mb-12">
        <SearchBar
          initialKeyword={keyword}
          initialScopes={scopes}
          initialStartDate={startDate}
          initialEndDate={endDate}
          initialSortBy={sortBy}
          initialSortOrder={sortOrder}
          availableScopes={VALID_SCOPES}
        />
      </div>

      {/* GRID FOTO */}
      <MyPhotoGrid
        photos={photoList}
        totalCount={totalCount}
        initialOffset={from}
        isFiltering={isFiltering}
        loadMoreAction={loadMoreMyPhotos}
      />

      {/* KONTROL PAGINASI */}
      {totalCount > 0 && (
        <PaginationControls page={page} pageSize={pageSize} totalCount={totalCount} />
      )}
    </main>
  );
}