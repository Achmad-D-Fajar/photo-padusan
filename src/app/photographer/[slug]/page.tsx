import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildPhotographerPhotosQuery,
  type SearchScope,
  type SortBy,
  type SortOrder,
} from "@/lib/queries/public-photos";
import { escapeIlikePattern } from "@/lib/supabase/ilike";
import {
  sanitizePage,
  sanitizePageSize,
  computeRange,
} from "@/lib/pagination";
import SearchBar from "@/components/public/SearchBar";
import PhotoGrid from "@/components/public/PhotoGrid";
import PaginationControls from "@/components/shared/PaginationControls";

interface PhotographerPageProps {
  params: Promise<{ slug: string }>;
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

// Sama seperti Dashboard: scope "uploader" tidak relevan karena halaman
// ini sudah pasti hanya menampilkan foto dari satu fotografer.
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
  if (raw === "caption_id" || raw === "caption_en") {
    return raw;
  }
  return "created_at";
}

function sanitizeSortOrder(raw: string): SortOrder {
  return raw === "asc" ? "asc" : "desc";
}

function getInitial(label: string): string {
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : "?";
}

export default async function PhotographerPage({
  params,
  searchParams,
}: PhotographerPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  const keyword = sanitizeKeyword(firstValue(resolvedSearchParams.q));
  const scopes = sanitizeScopes(firstValue(resolvedSearchParams.scope));
  const startDate = sanitizeDate(firstValue(resolvedSearchParams.start));
  const endDate = sanitizeDate(firstValue(resolvedSearchParams.end));
  const sortBy = sanitizeSortBy(firstValue(resolvedSearchParams.sortBy));
  const sortOrder = sanitizeSortOrder(firstValue(resolvedSearchParams.sortOrder));
  const page = sanitizePage(firstValue(resolvedSearchParams.page));
  const pageSize = sanitizePageSize(firstValue(resolvedSearchParams.pageSize));

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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, full_name, bio, avatar_url")
    .ilike("display_name", escapeIlikePattern(slug))
    .maybeSingle();

  if (profileError || !profile) {
    notFound();
  }

  const { from, to } = computeRange(page, pageSize);
  const filters = { keyword, scopes, startDate, endDate, sortBy, sortOrder };

  const { data: photos, count, error: photosError } = await buildPhotographerPhotosQuery(
    supabase,
    profile.id,
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
  const displayLabel = profile!.full_name || `@${profile.display_name}`;
  const initial = getInitial(displayLabel);

  async function loadMorePhotographerPhotos(offset: number, limit: number) {
    "use server";

    const supabaseForAction = await createClient();
    const { data, error: loadMoreErrorResult } = await buildPhotographerPhotosQuery(
      supabaseForAction,
      profile!.id,
      { ...filters, from: offset, to: offset + limit - 1 }
    );

    if (loadMoreErrorResult) {
      return { items: [], error: loadMoreErrorResult.message };
    }

    return { items: data ?? [], error: null };
  }

  return (
    <main className="container mx-auto px-4 py-10">
      <div className="flex flex-col items-center text-center mb-8 max-w-md mx-auto">
        <div className="avatar mb-4">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-neutral">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={displayLabel}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-content text-3xl">
                {initial}
              </div>
            )}
          </div>
        </div>

        <h1 className="text-2xl font-bold">
          {profile.full_name || profile.display_name}
        </h1>
        <p className="text-base-content/60">@{profile.display_name}</p>

        {profile.bio && (
          <p className="text-base-content/80 mt-3">{profile.bio}</p>
        )}

        <p className="text-sm text-base-content/50 mt-4">
          {totalCount} foto dipublikasikan
        </p>
      </div>

      <div className="flex justify-center mb-6">
        <SearchBar
          initialKeyword={keyword}
          initialScopes={scopes}
          initialStartDate={startDate}
          initialEndDate={endDate}
          initialSortBy={sortBy}
          initialSortOrder={sortOrder}
          availableScopes={VALID_SCOPES}
          compact
        />
      </div>

      <PhotoGrid
        photos={photoList}
        totalCount={totalCount}
        initialOffset={from}
        isFiltering={isFiltering}
        loadMoreAction={loadMorePhotographerPhotos}
      />

      {totalCount > 0 && (
        <PaginationControls page={page} pageSize={pageSize} totalCount={totalCount} />
      )}
    </main>
  );
}