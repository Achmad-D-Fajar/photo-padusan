import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildPhotographerPhotosQuery, type SearchScope, type SortBy, type SortOrder } from "@/lib/queries/public-photos";
import { escapeIlikePattern } from "@/lib/supabase/ilike";
import { sanitizePage, sanitizePageSize, computeRange } from "@/lib/pagination";
import SearchBar from "@/components/public/SearchBar";
import PhotoGrid from "@/components/public/PhotoGrid";
import PaginationControls from "@/components/shared/PaginationControls";

interface PhotographerPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    q?: string | string[]; scope?: string | string[]; start?: string | string[];
    end?: string | string[]; sortBy?: string | string[]; sortOrder?: string | string[];
    page?: string | string[]; pageSize?: string | string[];
  }>;
}

const VALID_SCOPES: SearchScope[] = ["caption", "tags"];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
function firstValue(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function sanitizeKeyword(raw: string): string { return raw.trim().slice(0, 100).replace(/[(),"]/g, ""); }
function sanitizeScopes(raw: string): SearchScope[] {
  if (!raw) return [];
  const parsed = raw.split(",").map((s) => s.trim()).filter((s): s is SearchScope => VALID_SCOPES.includes(s as SearchScope));
  return Array.from(new Set(parsed));
}
function sanitizeDate(raw: string): string { return DATE_REGEX.test(raw) ? raw : ""; }
function sanitizeSortBy(raw: string): SortBy { return (raw === "caption_id" || raw === "caption_en") ? raw : "created_at"; }
function sanitizeSortOrder(raw: string): SortOrder { return raw === "asc" ? "asc" : "desc"; }
function getInitial(label: string): string { const trimmed = label.trim(); return trimmed.length > 0 ? trimmed[0].toUpperCase() : "?"; }

export default async function PhotographerPage({ params, searchParams }: PhotographerPageProps) {
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
      <main className="container mx-auto px-4 py-12">
        <div role="alert" className="alert rounded-none border-4 border-[#111111] shadow-[8px_8px_0px_#111111] bg-[#882255] text-white p-6 font-bold text-lg">
          <span>Konfigurasi server tidak lengkap: variabel lingkungan Supabase tidak ditemukan.</span>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase.from("profiles").select("id, display_name, full_name, bio, avatar_url").ilike("display_name", escapeIlikePattern(slug)).maybeSingle();
  if (profileError || !profile) notFound();

  const { from, to } = computeRange(page, pageSize);
  const filters = { keyword, scopes, startDate, endDate, sortBy, sortOrder };
  const { data: photos, count, error: photosError } = await buildPhotographerPhotosQuery(supabase, profile.id, { ...filters, from, to });

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
  const isFiltering = keyword.length > 0 || scopes.length > 0 || startDate.length > 0 || endDate.length > 0;
  const displayLabel = profile!.full_name || `@${profile.display_name}`;
  const initial = getInitial(displayLabel);

  async function loadMorePhotographerPhotos(offset: number, limit: number) {
    "use server";
    const supabaseForAction = await createClient();
    const { data, error: loadMoreErrorResult } = await buildPhotographerPhotosQuery(supabaseForAction, profile!.id, { ...filters, from: offset, to: offset + limit - 1 });
    if (loadMoreErrorResult) return { items: [], error: loadMoreErrorResult.message };
    return { items: data ?? [], error: null };
  }

  return (
    <main className="container mx-auto px-4 py-12">
      <div className="bg-[#E5E5E5] border-4 border-[#111111] p-8 shadow-[12px_12px_0px_#111111] mb-12 flex flex-col md:flex-row gap-8 items-center md:items-start max-w-5xl mx-auto">
        <div className="w-40 h-40 rounded-none border-4 border-[#111111] shadow-[8px_8px_0px_#111111] overflow-hidden bg-white flex-shrink-0">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={displayLabel} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-display font-bold text-6xl text-[#111111]">
              {initial}
            </div>
          )}
        </div>

        <div className="flex flex-col text-center md:text-left flex-1 w-full">
          <h1 className="font-display text-5xl font-bold uppercase tracking-tighter text-[#111111] mb-2">
            {profile.full_name || profile.display_name}
          </h1>
          <div className="flex justify-center md:justify-start gap-4 items-center mb-6 border-b-4 border-[#111111] pb-6">
            <span className="text-xl font-bold text-[#111111] bg-[#88CCEE] border-2 border-[#111111] px-4 py-1 uppercase shadow-[2px_2px_0px_#111111]">
              @{profile.display_name}
            </span>
            <span className="text-lg font-bold text-[#E5E5E5] bg-[#111111] px-4 py-1 uppercase shadow-[2px_2px_0px_#111111]">
              {totalCount} KARYA
            </span>
          </div>

          {profile.bio && (
            <p className="bg-white border-2 border-[#111111] p-4 text-lg font-bold text-[#111111] shadow-[4px_4px_0px_#111111] leading-relaxed">
              {profile.bio}
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-between items-end mb-8 max-w-5xl mx-auto">
        <h2 className="font-display text-4xl font-bold uppercase tracking-tight hidden sm:block">Koleksi Fotografer</h2>
        <SearchBar
          initialKeyword={keyword} initialScopes={scopes} initialStartDate={startDate} initialEndDate={endDate}
          initialSortBy={sortBy} initialSortOrder={sortOrder} availableScopes={VALID_SCOPES} compact
        />
      </div>

      <div className="max-w-5xl mx-auto">
        <PhotoGrid photos={photoList} totalCount={totalCount} initialOffset={from} isFiltering={isFiltering} loadMoreAction={loadMorePhotographerPhotos} />
        {totalCount > 0 && <PaginationControls page={page} pageSize={pageSize} totalCount={totalCount} />}
      </div>
    </main>
  );
}