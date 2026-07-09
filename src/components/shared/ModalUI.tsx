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
    <dialog ref={dialogRef} className="modal bg-black/60 backdrop-blur-sm">
      <div className="modal-box max-w-4xl p-0 overflow-hidden relative rounded-none border-4 border-[#111111] bg-white shadow-[16px_16px_0px_#111111]">
        
        {/* Tombol (X) Close */}
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="btn btn-sm h-12 w-12 p-0 rounded-none border-4 border-[#111111] bg-[#882255] hover:bg-[#6a1a41] text-white absolute right-4 top-4 z-10 shadow-[4px_4px_0px_#111111] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#111111] transition-all font-bold text-2xl"
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