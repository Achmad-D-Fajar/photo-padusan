import { createClient } from "@/lib/supabase/server";
import {
  buildPublicPhotosQuery,
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
import PhotoGrid from "@/components/public/PhotoGrid";
import PaginationControls from "@/components/shared/PaginationControls";

interface HomePageProps {
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

const VALID_SCOPES: SearchScope[] = ["caption", "uploader", "tags"];
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

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolved = await searchParams;

  const keyword = sanitizeKeyword(firstValue(resolved.q));
  const scopes = sanitizeScopes(firstValue(resolved.scope));
  const startDate = sanitizeDate(firstValue(resolved.start));
  const endDate = sanitizeDate(firstValue(resolved.end));
  const sortBy = sanitizeSortBy(firstValue(resolved.sortBy));
  const sortOrder = sanitizeSortOrder(firstValue(resolved.sortOrder));
  const page = sanitizePage(firstValue(resolved.page));
  const pageSize = sanitizePageSize(firstValue(resolved.pageSize));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="container mx-auto px-4 py-12">
        <div role="alert" className="alert rounded-none border-4 border-[#111111] shadow-[8px_8px_0px_#111111] bg-[#882255] text-white p-6 font-bold text-lg">
          <span>Konfigurasi server tidak lengkap: variabel lingkungan Supabase tidak ditemukan.</span>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { from, to } = computeRange(page, pageSize);
  const filters = { keyword, scopes, startDate, endDate, sortBy, sortOrder };

  const { data: photos, count, error } = await buildPublicPhotosQuery(
    supabase,
    { ...filters, from, to }
  );

  if (error) {
    return (
      <main className="container mx-auto px-4 py-12">
        <div role="alert" className="alert rounded-none border-4 border-[#111111] shadow-[8px_8px_0px_#111111] bg-[#882255] text-white p-6 font-bold text-lg">
          <span>Gagal memuat foto: {error.message}</span>
        </div>
      </main>
    );
  }

  const photoList = photos ?? [];
  const totalCount = count ?? 0;
  const isFiltering = keyword.length > 0 || scopes.length > 0 || startDate.length > 0 || endDate.length > 0;

  async function loadMorePublicPhotos(offset: number, limit: number) {
    "use server";
    const supabaseForAction = await createClient();
    const { data, error: loadMoreErrorResult } = await buildPublicPhotosQuery(
      supabaseForAction,
      { ...filters, from: offset, to: offset + limit - 1 }
    );
    if (loadMoreErrorResult) {
      return { items: [], error: loadMoreErrorResult.message };
    }
    return { items: data ?? [], error: null };
  }

  return (
    <main className="container mx-auto px-4 py-12">
      <div className="mb-12 text-center flex flex-col items-center">
        {/* PERBAIKAN: Mengembalikan font-bold agar Space Grotesk kembali tebal! */}
        <h1 className="font-display font-bold text-5xl md:text-7xl uppercase tracking-tighter text-[#111111] mb-6">
          Galeri Foto
        </h1>
        <p className="text-xl md:text-2xl font-bold text-[#111111] bg-white border-4 border-[#111111] shadow-[8px_8px_0px_#111111] p-6 max-w-3xl leading-relaxed">
          Jelajahi karya fotografer komunitas kami. Klik tombol <span className="bg-[#117733] text-white px-2 py-1 uppercase tracking-tight border-2 border-[#111111]">UNDUH</span> atau <span className="bg-[#332288] text-white px-2 py-1 uppercase tracking-tight border-2 border-[#111111]">BELI</span> untuk mendukung mereka secara langsung.
        </p>
      </div>

      <div className="max-w-4xl mx-auto mb-12">
        <SearchBar
          initialKeyword={keyword}
          initialScopes={scopes}
          initialStartDate={startDate}
          initialEndDate={endDate}
          initialSortBy={sortBy}
          initialSortOrder={sortOrder}
        />
      </div>

      <PhotoGrid
        photos={photoList}
        totalCount={totalCount}
        initialOffset={from}
        isFiltering={isFiltering}
        loadMoreAction={loadMorePublicPhotos}
      />

      {totalCount > 0 && (
        <PaginationControls page={page} pageSize={pageSize} totalCount={totalCount} />
      )}
    </main>
  );
}