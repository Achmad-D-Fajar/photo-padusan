"use client";

import { useEffect, useRef } from "react";

interface ProtectedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
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
        userSelect: "none",
        WebkitUserDrag: "none", // Menambah dukungan Safari eksplisit
        ...style,
      } as React.CSSProperties}
      onClick={onClick}
      {...props}
    />
  );
}