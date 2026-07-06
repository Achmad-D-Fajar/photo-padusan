"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { extractStoragePath } from "@/lib/storage";
import {
  compressImageToSquare,
  extensionFromMimeType,
} from "@/lib/image-compression";

const AVATAR_SIZE_PX = 256;
const MAX_SOURCE_FILE_SIZE = 8 * 1024 * 1024; // 8MB sebelum kompresi

interface AvatarUploaderProps {
  userId: string;
  initialAvatarUrl: string | null;
  fallbackLabel: string;
}

type Status = "idle" | "uploading" | "error";

function getInitial(label: string): string {
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : "?";
}

export default function AvatarUploader({
  userId,
  initialAvatarUrl,
  fallbackLabel,
}: AvatarUploaderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const isUploading = status === "uploading";
  const displayedUrl = previewUrl || avatarUrl;
  const initial = getInitial(fallbackLabel);

  function handleTriggerClick() {
    if (isUploading) return;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setStatus("error");
      setErrorMessage("File harus berupa gambar.");
      return;
    }

    if (file.size > MAX_SOURCE_FILE_SIZE) {
      setStatus("error");
      setErrorMessage("Ukuran file maksimal 8MB.");
      return;
    }

    setStatus("uploading");
    setErrorMessage("");

    // Pratinjau langsung tampil dari file asli (sebelum kompresi selesai)
    // agar terasa responsif, lalu diganti URL publik sesungguhnya setelah
    // upload sukses.
    const localPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(localPreviewUrl);

    const previousAvatarUrl = avatarUrl;

    try {
      const compressedBlob = await compressImageToSquare(file, AVATAR_SIZE_PX);
      const extension = extensionFromMimeType(compressedBlob.type);
      const fileName = `${userId}/${crypto.randomUUID()}.${extension}`;

      const supabase = createClient() as any;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, compressedBlob, {
          contentType: compressedBlob.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      const newAvatarUrl = publicUrlData.publicUrl;

      const { error: updateError } = await (supabase
        .from("profiles") as any)
        .update({ avatar_url: newAvatarUrl })
        .eq("id", userId);

      if (updateError) {
        // Rollback: hapus file yang baru saja diunggah karena gagal
        // tersimpan ke database, agar tidak ada file yatim di Storage.
        await supabase.storage.from("avatars").remove([fileName]);
        throw new Error(updateError.message);
      }

      // Hapus avatar lama (jika ada) setelah avatar baru berhasil
      // tersimpan, agar tidak menumpuk file tak terpakai di Storage.
      if (previousAvatarUrl) {
        const oldPath = extractStoragePath(previousAvatarUrl, "avatars");
        if (oldPath) {
          const { error: removeOldError } = await supabase.storage
            .from("avatars")
            .remove([oldPath]);

          if (removeOldError) {
            console.error("Gagal menghapus avatar lama:", removeOldError.message);
          }
        }
      }

      setAvatarUrl(newAvatarUrl);
      setPreviewUrl(null);
      setStatus("idle");

      // Navbar adalah Server Component yang membaca avatar_url saat
      // dirender — refresh agar perubahan langsung terlihat di sana tanpa
      // perlu hard reload penuh.
      router.refresh();
    } catch (err) {
      setAvatarUrl(previousAvatarUrl);
      setPreviewUrl(null);
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Gagal mengunggah avatar."
      );
    } finally {
      URL.revokeObjectURL(localPreviewUrl);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 mb-2">
      <button
        type="button"
        onClick={handleTriggerClick}
        disabled={isUploading}
        className="relative group"
        aria-label="Ubah foto profil"
      >
        <div className="avatar">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-neutral">
            {displayedUrl ? (
              <img
                src={displayedUrl}
                alt={fallbackLabel}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-content text-3xl">
                {initial}
              </div>
            )}
          </div>
        </div>

        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {isUploading ? (
            <span className="loading loading-spinner loading-sm text-white"></span>
          ) : (
            <span className="text-white text-xs font-medium">Ubah Foto</span>
          )}
        </div>
      </button>

      <button
        type="button"
        onClick={handleTriggerClick}
        disabled={isUploading}
        className="btn btn-sm btn-outline"
      >
        {isUploading ? (
          <>
            <span className="loading loading-spinner loading-xs"></span>
            Mengunggah...
          </>
        ) : (
          "Ubah Foto"
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {status === "error" && (
        <p className="text-xs text-error text-center">{errorMessage}</p>
      )}
    </div>
  );
}