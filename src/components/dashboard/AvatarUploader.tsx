"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { extractStoragePath } from "@/lib/storage";
import { compressImageToSquare, extensionFromMimeType } from "@/lib/image-compression";

const AVATAR_SIZE_PX = 256;
const MAX_SOURCE_FILE_SIZE = 8 * 1024 * 1024;

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

export default function AvatarUploader({ userId, initialAvatarUrl, fallbackLabel }: AvatarUploaderProps) {
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

    const localPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(localPreviewUrl);

    const previousAvatarUrl = avatarUrl;

    try {
      const compressedBlob = await compressImageToSquare(file, AVATAR_SIZE_PX);
      const extension = extensionFromMimeType(compressedBlob.type);
      const fileName = `${userId}/${crypto.randomUUID()}.${extension}`;

      const supabase = createClient() as any;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, compressedBlob, {
        contentType: compressedBlob.type,
        upsert: false,
      });

      if (uploadError) throw new Error(uploadError.message);

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
      const newAvatarUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: newAvatarUrl }).eq("id", userId);

      if (updateError) {
        await supabase.storage.from("avatars").remove([fileName]);
        throw new Error(updateError.message);
      }

      if (previousAvatarUrl) {
        const oldPath = extractStoragePath(previousAvatarUrl, "avatars");
        if (oldPath) {
          await supabase.storage.from("avatars").remove([oldPath]);
        }
      }

      setAvatarUrl(newAvatarUrl);
      setPreviewUrl(null);
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setAvatarUrl(previousAvatarUrl);
      setPreviewUrl(null);
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Gagal mengunggah avatar.");
    } finally {
      URL.revokeObjectURL(localPreviewUrl);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-4 p-6 bg-[#E5E5E5] border-4 border-[#111111] shadow-[4px_4px_0px_#111111]">
      <button
        type="button"
        onClick={handleTriggerClick}
        disabled={isUploading}
        className="relative group block"
        aria-label="Ubah foto profil"
      >
        <div className="w-32 h-32 rounded-none border-4 border-[#111111] shadow-[6px_6px_0px_#111111] overflow-hidden bg-white transition-transform group-hover:translate-y-[2px] group-hover:shadow-[4px_4px_0px_#111111]">
          {displayedUrl ? (
            <img src={displayedUrl} alt={fallbackLabel} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#111111] font-display font-bold text-5xl">
              {initial}
            </div>
          )}
        </div>
      </button>

      <div className="flex flex-col gap-3 justify-center text-center sm:text-left h-32">
        <h3 className="font-display font-bold text-2xl uppercase tracking-tighter text-[#111111]">Foto Profil</h3>
        <button
          type="button"
          onClick={handleTriggerClick}
          disabled={isUploading}
          className="btn bg-white hover:bg-[#111111] hover:text-white text-[#111111] border-4 border-[#111111] rounded-none font-bold uppercase shadow-[4px_4px_0px_#111111]"
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
        {status === "error" && <p className="text-sm font-bold text-[#882255] bg-white border-2 border-[#882255] px-2 py-1 mt-1">{errorMessage}</p>}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
    </div>
  );
}