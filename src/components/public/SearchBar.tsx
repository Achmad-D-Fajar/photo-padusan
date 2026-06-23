"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface SearchBarProps {
  initialKeyword: string;
}

const DEBOUNCE_MS = 500;

export default function SearchBar({ initialKeyword }: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [value, setValue] = useState(initialKeyword);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigateWithKeyword(keyword: string) {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = keyword.trim();

    if (trimmed.length > 0) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }

    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function clearDebounce() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    setValue(newValue);

    clearDebounce();
    debounceTimerRef.current = setTimeout(() => {
      navigateWithKeyword(newValue);
    }, DEBOUNCE_MS);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      clearDebounce();
      navigateWithKeyword(value);
    }
  }

  function handleClear() {
    setValue("");
    clearDebounce();
    navigateWithKeyword("");
  }

  // Bersihkan timer debounce yang masih berjalan saat komponen unmount,
  // mis. saat pengguna pindah halaman sebelum debounce selesai.
  useEffect(() => {
    return () => clearDebounce();
  }, []);

  return (
    <div className="join w-full">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Cari foto, mis. sawah, sunset, pantai..."
        className="input input-bordered join-item w-full"
        aria-label="Cari foto"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          className="btn btn-ghost join-item"
          aria-label="Hapus pencarian"
        >
          ✕
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          clearDebounce();
          navigateWithKeyword(value);
        }}
        className="btn btn-primary join-item"
      >
        Cari
      </button>
    </div>
  );
}