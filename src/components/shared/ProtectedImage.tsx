"use client";

import { useEffect, useRef } from "react";

// Komponen ini menggantikan <img> biasa pada elemen gambar publik.
// Memberikan tiga lapisan deterren klien:
//   1. Mencegah context menu klik kanan pada elemen ini saja.
//   2. Mencegah drag-and-drop gambar ke tab baru / desktop.
//   3. CSS user-select: none — mengurangi kemungkinan seleksi tidak sengaja.
//
// CATATAN DESAIN:
//   - pointer-events TIDAK dinon-aktifkan agar klik (buka modal) tetap bekerja.
//   - Pemblokiran diterapkan HANYA pada elemen <img>, bukan seluruh halaman,
//     sehingga navigasi dan link lain tidak terpengaruh.
//   - Screenshot dan screen recording tidak bisa dicegah lewat JS/CSS.
//     Watermark permanen di server adalah perlindungan sesungguhnya.

interface ProtectedImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
}

export default function ProtectedImage({
  src,
  alt,
  className,
  style,
  onClick,
  ...props
}: ProtectedImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    function prevent(e: Event) {
      e.preventDefault();
    }

    img.addEventListener("contextmenu", prevent);
    img.addEventListener("dragstart", prevent);

    return () => {
      img.removeEventListener("contextmenu", prevent);
      img.removeEventListener("dragstart", prevent);
    };
  }, []);

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={className}
      style={{
        // userSelect mencegah teks terikut tersalin saat user menyeleksi
        // area sekitar gambar. WebkitUserDrag adalah non-standard CSS
        // property untuk Safari/Chrome yang menguatkan dragstart handler.
        userSelect: "none",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...style,
        } as React.CSSProperties & Record<string, string>}
      onClick={onClick}
      // onContextMenu dan onDragStart dihandle lewat addEventListener
      // native di atas agar bisa memanggil preventDefault() secara andal
      // (React synthetic events kadang tidak dapat mencegah konteks menu
      // di beberapa browser secara konsisten).
      {...props}
    />
  );
}
        