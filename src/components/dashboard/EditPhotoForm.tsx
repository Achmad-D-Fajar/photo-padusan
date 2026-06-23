"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { extractStoragePath } from "@/lib/storage";
import type { Database } from "@/types/supabase";

type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];

interface EditPhotoFormProps {
  photo: Pick<
    PhotoRow,
    | "id"
    | "user_id"
    | "thumbnail_url"
    | "caption"
    | "tags"
    | "microstock_url"
    | "status"
    | "created_at"
  >;
}

type ActionStatus =
  | "idle"
  | "saving-draft"
  | "publishing"
  | "deleting"
  | "error"
  | "success";

const URL_REGEX = /^https?:\/\/.+/i;
const CAPTION_MAX_LENGTH = 300;
const MAX_TAGS = 10;

function tagsToString(tags: string[]): string {
  return Array.isArray(tags) ? tags.join(", ") : "";
}

function stringToTags(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, MAX_TAGS);
}

export default function EditPhotoForm({ photo }: EditPhotoFormProps) {
  const router = useRouter();

  const [caption, setCaption] = useState(photo.caption || "");
  const [tagsInput, setTagsInput] = useState(tagsToString(photo.tags));
  const [microstockUrl, setMicrostockUrl] = useState(
    photo.microstock_url || ""
  );
  const [currentStatus, setCurrentStatus] = useState(photo.status);

  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    caption?: string;
    microstockUrl?: string;
  }>({});

  const isBusy =
    actionStatus === "saving-draft" ||
    actionStatus === "publishing" ||
    actionStatus === "deleting";

  function validateCommon(): boolean {
    const errors: { caption?: string; microstockUrl?: string } = {};

    if (caption.trim().length === 0) {
      errors.caption = "Caption tidak boleh kosong.";
    } else if (caption.trim().length > CAPTION_MAX_LENGTH) {
      errors.caption = `Caption maksimal ${CAPTION_MAX_LENGTH} karakter.`;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSaveDraft() {
    if (!validateCommon()) {
      setActionStatus("error");
      setMessage("Periksa kembali isian yang ditandai di bawah.");
      return;
    }

    setActionStatus("saving-draft");
    setMessage("");

    try {
      const supabase = createClient();

      const trimmedMicrostockUrl = microstockUrl.trim();
      const { error: updateError } = await supabase
        .from("photos")
        .update({
          caption: caption.trim(),
          tags: stringToTags(tagsInput),
          microstock_url:
            trimmedMicrostockUrl.length > 0 ? trimmedMicrostockUrl : null,
        })
        .eq("id", photo.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setActionStatus("success");
      setMessage("Draf berhasil disimpan.");
    } catch (err) {
      setActionStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Gagal menyimpan draf."
      );
    }
  }

  async function handlePublish() {
    const isCaptionValid = validateCommon();
    const trimmedMicrostockUrl = microstockUrl.trim();

    const errors: { caption?: string; microstockUrl?: string } = {};
    if (!isCaptionValid && caption.trim().length === 0) {
      errors.caption = "Caption tidak boleh kosong.";
    }
    if (trimmedMicrostockUrl.length === 0) {
      errors.microstockUrl = "URL Microstock wajib diisi untuk publikasi.";
    } else if (!URL_REGEX.test(trimmedMicrostockUrl)) {
      errors.microstockUrl = "URL harus diawali dengan http:// atau https://.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      setActionStatus("error");
      setMessage("Periksa kembali isian yang ditandai di bawah.");
      return;
    }

    setActionStatus("publishing");
    setMessage("");

    const previousStatus = currentStatus;

    // Optimistic update: badge status langsung berubah jadi "Published"
    // sebelum konfirmasi server, agar terasa responsif.
    setCurrentStatus("published");

    try {
      const supabase = createClient();

      const { error: updateError } = await supabase
        .from("photos")
        .update({
          caption: caption.trim(),
          tags: stringToTags(tagsInput),
          microstock_url: trimmedMicrostockUrl,
          status: "published",
        })
        .eq("id", photo.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setActionStatus("success");
      setMessage("Foto berhasil dipublikasikan!");
    } catch (err) {
      // Rollback optimistic status karena request gagal.
      setCurrentStatus(previousStatus);
      setActionStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Gagal mempublikasikan foto."
      );
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      "Apakah Anda yakin ingin menghapus foto ini? Tindakan ini tidak dapat dibatalkan."
    );
    if (!confirmed) return;

    setActionStatus("deleting");
    setMessage("");

    try {
      const supabase = createClient();

      if (photo.thumbnail_url) {
        const storagePath = extractStoragePath(
          photo.thumbnail_url,
          "thumbnails"
        );

        if (storagePath) {
          const { error: storageError } = await supabase.storage
            .from("thumbnails")
            .remove([storagePath]);

          if (storageError) {
            console.error(
              "Gagal menghapus file di storage:",
              storageError.message
            );
          }
        }
      }

      const { error: deleteError } = await supabase
        .from("photos")
        .delete()
        .eq("id", photo.id);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setActionStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Gagal menghapus foto."
      );
    }
  }

  return (
    <div className="card bg-base-100 border border-base-300 shadow-md">
      <div className="card-body gap-4">
        <div className="rounded-box overflow-hidden border border-base-300 aspect-square w-full max-w-xs mx-auto bg-base-200">
          {photo.thumbnail_url ? (
            <img
              src={photo.thumbnail_url}
              alt={caption || "Foto"}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-base-content/40 text-sm">
              Tidak ada gambar
            </div>
          )}
        </div>

        <div className="flex justify-center">
          {currentStatus === "published" ? (
            <span className="badge badge-success">Published</span>
          ) : currentStatus === "archived" ? (
            <span className="badge badge-neutral">Archived</span>
          ) : (
            <span className="badge badge-warning">Draft</span>
          )}
        </div>

        <div className="form-control">
          <label className="label" htmlFor="caption">
            <span className="label-text">Caption</span>
          </label>
          <textarea
            id="caption"
            value={caption}
            onChange={(e) => {
              setCaption(e.target.value);
              if (actionStatus !== "idle") setActionStatus("idle");
            }}
            className={`textarea textarea-bordered w-full ${
              fieldErrors.caption ? "textarea-error" : ""
            }`}
            rows={3}
            maxLength={CAPTION_MAX_LENGTH}
            disabled={isBusy}
          />
          <label className="label">
            <span className="label-text-alt text-base-content/60">
              {caption.length}/{CAPTION_MAX_LENGTH}
            </span>
            {fieldErrors.caption && (
              <span className="label-text-alt text-error">
                {fieldErrors.caption}
              </span>
            )}
          </label>
        </div>

        <div className="form-control">
          <label className="label" htmlFor="tags">
            <span className="label-text">Tags (pisahkan dengan koma)</span>
          </label>
          <input
            id="tags"
            type="text"
            value={tagsInput}
            onChange={(e) => {
              setTagsInput(e.target.value);
              if (actionStatus !== "idle") setActionStatus("idle");
            }}
            placeholder="contoh: sawah, sunset, pedesaan"
            className="input input-bordered w-full"
            disabled={isBusy}
          />
          <label className="label">
            <span className="label-text-alt text-base-content/60">
              Maksimal {MAX_TAGS} tag.
            </span>
          </label>
        </div>

        <div className="form-control">
          <label className="label" htmlFor="microstock_url">
            <span className="label-text">
              URL Microstock{" "}
              <span className="text-base-content/50">
                (wajib untuk publikasi)
              </span>
            </span>
          </label>
          <input
            id="microstock_url"
            type="url"
            value={microstockUrl}
            onChange={(e) => {
              setMicrostockUrl(e.target.value);
              if (actionStatus !== "idle") setActionStatus("idle");
            }}
            placeholder="https://www.shutterstock.com/image-photo/..."
            className={`input input-bordered w-full ${
              fieldErrors.microstockUrl ? "input-error" : ""
            }`}
            disabled={isBusy}
          />
          {fieldErrors.microstockUrl && (
            <label className="label">
              <span className="label-text-alt text-error">
                {fieldErrors.microstockUrl}
              </span>
            </label>
          )}
        </div>

        {actionStatus === "success" && (
          <div role="alert" className="alert alert-success">
            <span>{message}</span>
          </div>
        )}

        {actionStatus === "error" && (
          <div role="alert" className="alert alert-error">
            <span>{message}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="btn btn-outline flex-1"
            disabled={isBusy}
          >
            {actionStatus === "saving-draft" ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Menyimpan...
              </>
            ) : (
              "Simpan Draf"
            )}
          </button>

          <button
            type="button"
            onClick={handlePublish}
            className="btn btn-primary flex-1"
            disabled={isBusy}
          >
            {actionStatus === "publishing" ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Mempublikasikan...
              </>
            ) : (
              "Publikasikan"
            )}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="btn btn-error btn-outline flex-1"
            disabled={isBusy}
          >
            {actionStatus === "deleting" ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Menghapus...
              </>
            ) : (
              "Hapus Foto"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}