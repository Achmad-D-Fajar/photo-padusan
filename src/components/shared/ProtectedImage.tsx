"use client";

import { useEffect, useRef } from "react";

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
      // Spread props FIRST so our security handlers below always win
      {...props}
      ref={imgRef}
      src={src}
      alt={alt}
      className={className}
        style={{
        userSelect: "none",
        ...style,
        } as React.CSSProperties & Record<string, string>}
      onClick={onClick}
      // Belt-and-suspenders: React synthetic handlers + native listeners above
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    />
  );
}