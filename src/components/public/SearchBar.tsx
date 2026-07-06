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
  // Membatasi lingkup pencarian yang ditampilkan — mis. Dashboard & Profil
  // Fotografer tidak butuh opsi "Uploader" karena selalu satu orang yang
  // sama.
  availableScopes?: SearchScope[];
  // Mode ringkas: satu tombol ikon yang membuka panel berisi semua kontrol,
  // dipakai di halaman Profil Fotografer agar tidak memakan banyak tempat.
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

const DEFAULT_AVAILABLE_SCOPES: SearchScope[] = [
  "caption",
  "uploader",
  "tags",
];

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7h18M6 12h12M10 17h4"
      />
    </svg>
  );
}

export default function SearchBar({
  initialKeyword,
  initialScopes,
  initialStartDate,
  initialEndDate,
  initialSortBy,
  initialSortOrder,
  availableScopes = DEFAULT_AVAILABLE_SCOPES,
  compact = false,
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

  const scopeOptions = ALL_SCOPE_OPTIONS.filter((option) =>
    availableScopes.includes(option.value)
  );

  function clearDebounce() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }

  function navigate(state: FilterState) {
    const params = new URLSearchParams(searchParams.toString());

    if (state.keyword.trim().length > 0) {
      params.set("q", state.keyword.trim());
    } else {
      params.delete("q");
    }

    if (
      state.scopes.length > 0 &&
      state.scopes.length < scopeOptions.length
    ) {
      params.set("scope", state.scopes.join(","));
    } else {
      params.delete("scope");
    }

    if (state.startDate) {
      params.set("start", state.startDate);
    } else {
      params.delete("start");
    }

    if (state.endDate) {
      params.set("end", state.endDate);
    } else {
      params.delete("end");
    }

    if (state.sortBy !== "created_at") {
      params.set("sortBy", state.sortBy);
    } else {
      params.delete("sortBy");
    }

    if (state.sortOrder !== "desc") {
      params.set("sortOrder", state.sortOrder);
    } else {
      params.delete("sortOrder");
    }

    // Filter/sort apa pun yang berubah selalu mengembalikan ke halaman 1,
    // karena hasil pada halaman lama kemungkinan besar sudah tidak relevan
    // dengan filter yang baru.
    params.delete("page");

    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function handleKeywordChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newKeyword = e.target.value;
    setKeyword(newKeyword);

    clearDebounce();
    debounceTimerRef.current = setTimeout(() => {
      navigate({ keyword: newKeyword, scopes, startDate, endDate, sortBy, sortOrder });
    }, DEBOUNCE_MS);
  }

  function handleKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      clearDebounce();
      navigate({ keyword, scopes, startDate, endDate, sortBy, sortOrder });
    }
  }

  function handleClearKeyword() {
    setKeyword("");
    clearDebounce();
    navigate({ keyword: "", scopes, startDate, endDate, sortBy, sortOrder });
  }

  function handleSearchClick() {
    clearDebounce();
    navigate({ keyword, scopes, startDate, endDate, sortBy, sortOrder });
  }

  function handleScopeToggle(scope: SearchScope) {
    const newScopes = scopes.includes(scope)
      ? scopes.filter((s) => s !== scope)
      : [...scopes, scope];

    setScopes(newScopes);
    clearDebounce();
    navigate({ keyword, scopes: newScopes, startDate, endDate, sortBy, sortOrder });
  }

  function handleStartDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newStartDate = e.target.value;
    setStartDate(newStartDate);
    clearDebounce();
    navigate({ keyword, scopes, startDate: newStartDate, endDate, sortBy, sortOrder });
  }

  function handleEndDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newEndDate = e.target.value;
    setEndDate(newEndDate);
    clearDebounce();
    navigate({ keyword, scopes, startDate, endDate: newEndDate, sortBy, sortOrder });
  }

  function handleSortByChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    // Update the sanitize logic here
    const newSortBy: SortBy = (val === "caption_id" || val === "caption_en") ? val : "created_at";
    setSortBy(newSortBy);
    clearDebounce();
    navigate({ keyword, scopes, startDate, endDate, sortBy: newSortBy, sortOrder });
  }

  function handleSortOrderChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newSortOrder: SortOrder = e.target.value === "asc" ? "asc" : "desc";
    setSortOrder(newSortOrder);
    clearDebounce();
    navigate({ keyword, scopes, startDate, endDate, sortBy, sortOrder: newSortOrder });
  }

  useEffect(() => {
    return () => clearDebounce();
  }, []);

  const activeFilterCount =
    (keyword.trim().length > 0 ? 1 : 0) +
    scopes.length +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0) +
    (sortBy !== "created_at" ? 1 : 0) +
    (sortOrder !== "desc" ? 1 : 0);

  if (compact) {
    return (
      <div className="dropdown">
        <div
          tabIndex={0}
          role="button"
          className="btn btn-circle btn-sm btn-outline relative"
          aria-label="Cari dan filter foto"
        >
          <SearchIcon />
          {activeFilterCount > 0 && (
            <span className="badge badge-primary badge-xs absolute -top-1 -right-1 px-1">
              {activeFilterCount}
            </span>
          )}
        </div>
        <div
          tabIndex={0}
          className="dropdown-content z-20 mt-2 w-72 p-4 shadow border border-base-300 bg-base-100 rounded-box flex flex-col gap-4"
        >
          <div className="join">
            <input
              type="text"
              value={keyword}
              onChange={handleKeywordChange}
              onKeyDown={handleKeywordKeyDown}
              placeholder="Cari foto..."
              className="input input-bordered input-sm join-item w-full"
              aria-label="Cari foto"
            />
            <button
              type="button"
              onClick={handleSearchClick}
              className="btn btn-sm btn-primary join-item"
              aria-label="Cari"
            >
              <SearchIcon />
            </button>
          </div>

          {scopeOptions.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1">Cari di mana?</p>
              <div className="flex flex-col gap-1">
                {scopeOptions.map((option) => (
                  <label
                    key={option.value}
                    className="label cursor-pointer justify-start gap-2 py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={scopes.includes(option.value)}
                      onChange={() => handleScopeToggle(option.value)}
                      className="checkbox checkbox-xs"
                    />
                    <span className="label-text text-xs">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold mb-1">Rentang waktu</p>
            <div className="flex flex-col gap-2">
              <input
                type="date"
                value={startDate}
                onChange={handleStartDateChange}
                className="input input-bordered input-xs w-full"
                aria-label="Dari tanggal"
              />
              <input
                type="date"
                value={endDate}
                onChange={handleEndDateChange}
                className="input input-bordered input-xs w-full"
                aria-label="Sampai tanggal"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={handleSortByChange}
              className="select select-bordered select-xs flex-1"
              aria-label="Urutkan berdasarkan"
            >
              <option value="created_at">Terbaru</option>
              <option value="caption_id">Berdasarkan Nama (ID)</option>
              <option value="caption_en">Berdasarkan Nama (EN)</option>
            </select>
            <select
              value={sortOrder}
              onChange={handleSortOrderChange}
              className="select select-bordered select-xs flex-1"
              aria-label="Arah urutan"
            >
              <option value="desc">Menurun</option>
              <option value="asc">Menaik</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="join flex-1">
          <input
            type="text"
            value={keyword}
            onChange={handleKeywordChange}
            onKeyDown={handleKeywordKeyDown}
            placeholder="Cari foto, uploader, atau tag..."
            className="input input-bordered join-item w-full"
            aria-label="Cari foto"
          />
          {keyword.length > 0 && (
            <button
              type="button"
              onClick={handleClearKeyword}
              className="btn btn-ghost join-item"
              aria-label="Hapus pencarian"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={handleSearchClick}
            className="btn btn-primary join-item"
          >
            Cari
          </button>
        </div>

        <div className="dropdown dropdown-end">
          <div
            tabIndex={0}
            role="button"
            className="btn btn-outline gap-2"
            aria-label="Filter pencarian lanjutan"
          >
            <FilterIcon />
            Filter
            {activeFilterCount > 0 && (
              <span className="badge badge-primary badge-sm">
                {activeFilterCount}
              </span>
            )}
          </div>
          <div
            tabIndex={0}
            className="dropdown-content z-20 mt-2 w-72 p-4 shadow border border-base-300 bg-base-100 rounded-box flex flex-col gap-4"
          >
            {scopeOptions.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Cari di mana?</p>
                <div className="flex flex-col gap-1">
                  {scopeOptions.map((option) => (
                    <label
                      key={option.value}
                      className="label cursor-pointer justify-start gap-2"
                    >
                      <input
                        type="checkbox"
                        checked={scopes.includes(option.value)}
                        onChange={() => handleScopeToggle(option.value)}
                        className="checkbox checkbox-sm"
                      />
                      <span className="label-text">{option.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-base-content/50 mt-1">
                  Kosongkan semua untuk mencari di seluruh lingkup.
                </p>
              </div>
            )}

            <div>
              <p className="text-sm font-semibold mb-2">
                Rentang waktu unggah
              </p>
              <div className="flex flex-col gap-2">
                <label className="form-control">
                  <span className="label-text text-xs">Dari tanggal</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={handleStartDateChange}
                    className="input input-bordered input-sm w-full"
                  />
                </label>
                <label className="form-control">
                  <span className="label-text text-xs">Sampai tanggal</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={handleEndDateChange}
                    className="input input-bordered input-sm w-full"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
        <select
          value={sortBy}
          onChange={handleSortByChange}
          className="select select-bordered select-sm"
          aria-label="Urutkan berdasarkan"
        >
          <option value="created_at">Waktu</option>
          <option value="caption_id">Alfabet (ID)</option>
          <option value="caption_en">Alfabet (EN)</option>
        </select>

        <select
          value={sortOrder}
          onChange={handleSortOrderChange}
          className="select select-bordered select-sm"
          aria-label="Arah urutan"
        >
          <option value="desc">Menurun</option>
          <option value="asc">Menaik</option>
        </select>
      </div>
    </div>
  );
}