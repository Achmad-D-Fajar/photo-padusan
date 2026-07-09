"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type SearchScope = "caption" | "uploader" | "tags";
export type SortBy = "created_at" | "caption_id" | "caption_en";
export type SortOrder = "asc" | "desc";

interface SearchBarProps {
  initialKeyword: string;
  initialScopes: SearchScope[];
  initialStartDate: string;
  initialEndDate: string;
  initialSortBy: SortBy;
  initialSortOrder: SortOrder;
  availableScopes?: SearchScope[];
  compact?: boolean;
}

interface FilterState {
  keyword: string;
  scopes: SearchScope[];
  startDate: string;
  endDate: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
}

const DEBOUNCE_MS = 500;
const ALL_SCOPE_OPTIONS: { value: SearchScope; label: string }[] = [
  { value: "caption", label: "Caption" },
  { value: "uploader", label: "Uploader" },
  { value: "tags", label: "Tags" },
];
const DEFAULT_AVAILABLE_SCOPES: SearchScope[] = ["caption", "uploader", "tags"];

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 7h18M6 12h12M10 17h4" />
    </svg>
  );
}

export default function SearchBar({
  initialKeyword, initialScopes, initialStartDate, initialEndDate, initialSortBy, initialSortOrder,
  availableScopes = DEFAULT_AVAILABLE_SCOPES, compact = false,
}: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [keyword, setKeyword] = useState(initialKeyword);
  const [scopes, setScopes] = useState<SearchScope[]>(initialScopes);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [sortBy, setSortBy] = useState<SortBy>(initialSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeOptions = ALL_SCOPE_OPTIONS.filter((option) => availableScopes.includes(option.value));

  function clearDebounce() {
    if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
  }

  function navigate(state: FilterState) {
    const params = new URLSearchParams(searchParams.toString());
    if (state.keyword.trim().length > 0) params.set("q", state.keyword.trim()); else params.delete("q");
    if (state.scopes.length > 0 && state.scopes.length < scopeOptions.length) params.set("scope", state.scopes.join(",")); else params.delete("scope");
    if (state.startDate) params.set("start", state.startDate); else params.delete("start");
    if (state.endDate) params.set("end", state.endDate); else params.delete("end");
    if (state.sortBy !== "created_at") params.set("sortBy", state.sortBy); else params.delete("sortBy");
    if (state.sortOrder !== "desc") params.set("sortOrder", state.sortOrder); else params.delete("sortOrder");
    params.delete("page");

    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function handleKeywordChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newKeyword = e.target.value;
    setKeyword(newKeyword);
    clearDebounce();
    debounceTimerRef.current = setTimeout(() => { navigate({ keyword: newKeyword, scopes, startDate, endDate, sortBy, sortOrder }); }, DEBOUNCE_MS);
  }

  function handleKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); clearDebounce(); navigate({ keyword, scopes, startDate, endDate, sortBy, sortOrder }); }
  }

  function handleClearKeyword() { setKeyword(""); clearDebounce(); navigate({ keyword: "", scopes, startDate, endDate, sortBy, sortOrder }); }
  function handleSearchClick() { clearDebounce(); navigate({ keyword, scopes, startDate, endDate, sortBy, sortOrder }); }
  function handleScopeToggle(scope: SearchScope) {
    const newScopes = scopes.includes(scope) ? scopes.filter((s) => s !== scope) : [...scopes, scope];
    setScopes(newScopes); clearDebounce(); navigate({ keyword, scopes: newScopes, startDate, endDate, sortBy, sortOrder });
  }
  function handleStartDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newStartDate = e.target.value; setStartDate(newStartDate); clearDebounce(); navigate({ keyword, scopes, startDate: newStartDate, endDate, sortBy, sortOrder });
  }
  function handleEndDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newEndDate = e.target.value; setEndDate(newEndDate); clearDebounce(); navigate({ keyword, scopes, startDate, endDate: newEndDate, sortBy, sortOrder });
  }
  function handleSortByChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value; const newSortBy: SortBy = (val === "caption_id" || val === "caption_en") ? val : "created_at";
    setSortBy(newSortBy); clearDebounce(); navigate({ keyword, scopes, startDate, endDate, sortBy: newSortBy, sortOrder });
  }
  function handleSortOrderChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newSortOrder: SortOrder = e.target.value === "asc" ? "asc" : "desc";
    setSortOrder(newSortOrder); clearDebounce(); navigate({ keyword, scopes, startDate, endDate, sortBy, sortOrder: newSortOrder });
  }

  useEffect(() => { return () => clearDebounce(); }, []);

  const activeFilterCount = (keyword.trim().length > 0 ? 1 : 0) + scopes.length + (startDate ? 1 : 0) + (endDate ? 1 : 0) + (sortBy !== "created_at" ? 1 : 0) + (sortOrder !== "desc" ? 1 : 0);

  const inputClass = "input w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] h-14 text-lg";
  const selectClass = "select rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] h-14 text-lg uppercase cursor-pointer";
  const labelClass = "font-bold text-sm uppercase tracking-widest text-[#111111] mb-2 block";

  if (compact) {
    return (
      <details className="dropdown dropdown-end">
        <summary className="btn bg-white hover:bg-[#E5E5E5] text-[#111111] border-4 border-[#111111] rounded-none font-bold h-14 w-14 shadow-[4px_4px_0px_#111111] p-0 relative list-none [&::-webkit-details-marker]:hidden cursor-pointer" aria-label="Cari dan filter foto">
          <SearchIcon />
          {activeFilterCount > 0 && <span className="badge bg-[#882255] text-white border-2 border-[#111111] rounded-none absolute -top-3 -right-3 font-bold px-2 py-3 shadow-[2px_2px_0px_#111111]">{activeFilterCount}</span>}
        </summary>
        {/* z-[60] memastikan menu turun selalu di atas elemen lain */}
        <div className="dropdown-content z-[60] mt-4 w-[90vw] sm:w-96 p-6 border-4 border-[#111111] bg-[#E5E5E5] rounded-none shadow-[8px_8px_0px_#111111] flex flex-col gap-6">
          <div className="flex gap-2">
            <input type="text" value={keyword} onChange={handleKeywordChange} onKeyDown={handleKeywordKeyDown} placeholder="Cari..." className={inputClass} />
            <button type="button" onClick={handleSearchClick} className="btn bg-[#332288] hover:bg-[#20155c] text-white border-4 border-[#111111] rounded-none w-14 h-14 shadow-[4px_4px_0px_#111111] p-0"><SearchIcon /></button>
          </div>
          {scopeOptions.length > 0 && (
            <div className="bg-white border-2 border-[#111111] p-4">
              <span className={labelClass}>Cari di mana?</span>
              <div className="flex flex-col gap-3 mt-4">
                {scopeOptions.map((option) => (
                  <label key={option.value} className="flex items-center gap-4 cursor-pointer">
                    <input type="checkbox" checked={scopes.includes(option.value)} onChange={() => handleScopeToggle(option.value)} className="checkbox rounded-none border-4 border-[#111111] w-8 h-8 focus:ring-4 focus:ring-[#44AA99]" />
                    <span className="font-bold text-lg uppercase">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full p-4 sm:p-6 bg-[#E5E5E5] border-4 border-[#111111] shadow-[8px_8px_0px_#111111]">
      
      {/* Baris Atas: Input Pencarian & Tombol Filter */}
      <div className="flex flex-col md:flex-row gap-4 relative z-20">
        <div className="flex flex-1 relative gap-2">
          <input type="text" value={keyword} onChange={handleKeywordChange} onKeyDown={handleKeywordKeyDown} placeholder="Cari foto, uploader, atau tag..." className={inputClass} />
          {keyword.length > 0 && (
            <button type="button" onClick={handleClearKeyword} className="absolute right-[120px] top-3 font-bold text-2xl text-[#882255] hover:text-[#111111]">✕</button>
          )}
          <button type="button" onClick={handleSearchClick} className="btn bg-[#332288] hover:bg-[#20155c] text-white border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-14 px-8 shadow-[4px_4px_0px_#111111] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#111111] transition-all">
            Cari
          </button>
        </div>

        {/* MENGGUNAKAN <details> UNTUK MENCEGAH PHANTOM HITBOX */}
        <details className="dropdown dropdown-end w-full md:w-auto">
          <summary className="btn bg-white hover:bg-[#111111] hover:text-white text-[#111111] border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-14 px-6 shadow-[4px_4px_0px_#111111] gap-3 transition-all w-full md:w-auto flex justify-center list-none [&::-webkit-details-marker]:hidden cursor-pointer">
            <FilterIcon /> FILTER
            {activeFilterCount > 0 && <span className="badge bg-[#882255] text-white border-2 border-[#111111] rounded-none font-bold px-2 py-3">{activeFilterCount}</span>}
          </summary>
          
          <div className="dropdown-content z-[60] mt-4 w-[90vw] sm:w-96 p-6 border-4 border-[#111111] bg-white rounded-none shadow-[12px_12px_0px_#111111] flex flex-col gap-8">
            {scopeOptions.length > 0 && (
              <div className="bg-[#E5E5E5] border-2 border-[#111111] p-4">
                <span className={labelClass}>Cari di mana?</span>
                <div className="flex flex-col gap-3 mt-4">
                  {scopeOptions.map((option) => (
                    <label key={option.value} className="flex items-center gap-4 cursor-pointer">
                      <input type="checkbox" checked={scopes.includes(option.value)} onChange={() => handleScopeToggle(option.value)} className="checkbox rounded-none border-4 border-[#111111] w-8 h-8 focus:ring-4 focus:ring-[#44AA99]" />
                      <span className="font-bold text-lg uppercase">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-[#E5E5E5] border-2 border-[#111111] p-4">
              <span className={labelClass}>Rentang Waktu</span>
              <div className="flex flex-col gap-4 mt-4">
                <div><span className="font-bold text-xs uppercase mb-1 block">Dari</span><input type="date" value={startDate} onChange={handleStartDateChange} className="input w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold focus:ring-4 focus:ring-[#44AA99] h-12" /></div>
                <div><span className="font-bold text-xs uppercase mb-1 block">Sampai</span><input type="date" value={endDate} onChange={handleEndDateChange} className="input w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold focus:ring-4 focus:ring-[#44AA99] h-12" /></div>
              </div>
            </div>
          </div>
        </details>
      </div>

      {/* Baris Bawah: Pengurutan (Sekarang 100% bisa diklik dengan aman) */}
      <div className="flex flex-col sm:flex-row gap-4 sm:justify-end border-t-4 border-[#111111] pt-6 relative z-10">
        <select value={sortBy} onChange={handleSortByChange} className={selectClass}>
          <option value="created_at">Urutkan: Terbaru</option>
          <option value="caption_id">Alfabet (ID)</option>
          <option value="caption_en">Alfabet (EN)</option>
        </select>
        <select value={sortOrder} onChange={handleSortOrderChange} className={selectClass}>
          <option value="desc">↓ Menurun</option>
          <option value="asc">↑ Menaik</option>
        </select>
      </div>
    </div>
  );
}