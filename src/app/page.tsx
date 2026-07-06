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
      <main className="container mx-auto px-4 py-10">
        <div role="alert" className="alert alert-error">
          <span>
            Konfigurasi server tidak lengkap: variabel lingkungan Supabase
            tidak ditemukan.
          </span>
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
      <main className="container mx-auto px-4 py-10">
        <div role="alert" className="alert alert-error">
          <span>Gagal memuat foto: {error.message}</span>
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

  // Server Action inline: menutup variabel `filters` lewat closure
  // sehingga klik "Load More" di browser selalu memakai filter & urutan
  // yang sama dengan data yang sedang ditampilkan, tanpa perlu mengirim
  // ulang seluruh state filter dari client ke server.
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
    <main className="container mx-auto px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold">Etalase Foto</h1>
        <p className="text-base-content/70 mt-2 max-w-xl mx-auto">
          Jelajahi karya fotografer komunitas kami. Klik &quot;Beli / Unduh
          Resolusi Tinggi&quot; untuk mendukung mereka langsung di
          microstock.
        </p>
      </div>

      <div className="max-w-2xl mx-auto mb-6">
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