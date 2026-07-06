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

// Dashboard tidak menyediakan scope "uploader" karena seluruh foto di
// sini selalu milik diri sendiri — mencari berdasarkan nama uploader
// tidak akan pernah mengubah hasil.
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
      <main className="container mx-auto px-4 py-10">
        <div role="alert" className="alert alert-error">
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
    <main className="container mx-auto px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Dasbor Saya</h1>
          <p className="text-base-content/70 mt-1">
            Kelola draf dan foto yang telah dipublikasikan.
          </p>
        </div>
        <Link href="/dashboard/upload" className="btn btn-primary">
          Unggah Foto Baru
        </Link>
      </div>

      <div className="max-w-2xl mb-6">
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

      <MyPhotoGrid
        photos={photoList}
        totalCount={totalCount}
        initialOffset={from}
        isFiltering={isFiltering}
        loadMoreAction={loadMoreMyPhotos}
      />

      {totalCount > 0 && (
        <PaginationControls page={page} pageSize={pageSize} totalCount={totalCount} />
      )}
    </main>
  );
}