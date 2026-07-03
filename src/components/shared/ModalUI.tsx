"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface ModalUIProps {
  children: React.ReactNode;
}

export default function ModalUI({ children }: ModalUIProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.showModal();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleClose() {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      router.back();
    }

    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [router]);

  return (
    <dialog ref={dialogRef} className="modal">
      {/* Tambahkan 'relative' di sini agar posisi absolut tombol X bekerja */}
      <div className="modal-box max-w-2xl p-0 overflow-hidden relative">
        
        {/* Tombol (X) Close */}
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3 z-10 bg-base-100/80 hover:bg-base-200"
          aria-label="Tutup modal"
        >
          ✕
        </button>

        {children}
      </div>

      <form method="dialog" className="modal-backdrop">
        <button type="submit" aria-label="Close modal">
          close
        </button>
      </form>
    </dialog>
  );
}