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
    | "caption_en"
    | "caption_id"
    | "tags_en"
    | "tags_id"
    | "created_at"
    | "microstock_url"
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

function tagsToString(tags: string[] | null | undefined): string {
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

  // Bilingual States
  const [captionId, setCaptionId] = useState(photo.caption_id || "");
  const [captionEn, setCaptionEn] = useState(photo.caption_en || "");
  const [tagsIdInput, setTagsIdInput] = useState(tagsToString(photo.tags_id));
  const [tagsEnInput, setTagsEnInput] = useState(tagsToString(photo.tags_en));
  
  const [microstockUrl, setMicrostockUrl] = useState(
    photo.microstock_url || ""
  );
  
  // Note: We use a local state for optimistic UI updates, defaulting to published if microstock exists for safety, 
  // though realistically this component should probably accept status as a prop. 
  // We'll keep it as "draft" visually if it lacks the microstock URL to match standard logic.
  const [currentStatus, setCurrentStatus] = useState<"draft" | "published" | "archived">(
    photo.microstock_url ? "published" : "draft"
  );

  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    captionId?: string;
    captionEn?: string;
    microstockUrl?: string;
  }>({});

  const isBusy =
    actionStatus === "saving-draft" ||
    actionStatus === "publishing" ||
    actionStatus === "deleting";

  function validateCommon(): boolean {
    const errors: { captionId?: string; captionEn?: string; microstockUrl?: string } = {};

    if (captionId.trim().length === 0 && captionEn.trim().length === 0) {
      errors.captionId = "Minimal satu bahasa caption (ID atau EN) harus diisi.";
    } 
    
    if (captionId.trim().length > CAPTION_MAX_LENGTH) {
      errors.captionId = `Caption ID maksimal ${CAPTION_MAX_LENGTH} karakter.`;
    }
    if (captionEn.trim().length > CAPTION_MAX_LENGTH) {
      errors.captionEn = `Caption EN maksimal ${CAPTION_MAX_LENGTH} karakter.`;
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
      const supabase = createClient() as any;
      const trimmedMicrostockUrl = microstockUrl.trim();
      
      const { error: updateError } = await supabase
        .from("photos")
        .update({
          caption_id: captionId.trim() || null,
          caption_en: captionEn.trim() || null,
          tags_id: stringToTags(tagsIdInput),
          tags_en: stringToTags(tagsEnInput),
          microstock_url: trimmedMicrostockUrl.length > 0 ? trimmedMicrostockUrl : null,
          status: "draft"
        })
        .eq("id", photo.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setCurrentStatus("draft");
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

    const errors: { captionId?: string; microstockUrl?: string } = {};
    if (!isCaptionValid && captionId.trim().length === 0 && captionEn.trim().length === 0) {
      errors.captionId = "Minimal satu bahasa caption harus diisi.";
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
    setCurrentStatus("published");

    try {
      const supabase = createClient() as any;

      const { error: updateError } = await supabase
        .from("photos")
        .update({
          caption_id: captionId.trim() || null,
          caption_en: captionEn.trim() || null,
          tags_id: stringToTags(tagsIdInput),
          tags_en: stringToTags(tagsEnInput),
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
      const supabase = createClient() as any;

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
              alt={captionId || captionEn || "Foto"}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label" htmlFor="captionId">
              <span className="label-text">Caption (ID)</span>
            </label>
            <textarea
              id="captionId"
              value={captionId}
              onChange={(e) => {
                setCaptionId(e.target.value);
                if (actionStatus !== "idle") setActionStatus("idle");
              }}
              className={`textarea textarea-bordered w-full ${
                fieldErrors.captionId ? "textarea-error" : ""
              }`}
              rows={3}
              maxLength={CAPTION_MAX_LENGTH}
              disabled={isBusy}
            />
            <label className="label">
              <span className="label-text-alt text-base-content/60">
                {captionId.length}/{CAPTION_MAX_LENGTH}
              </span>
              {fieldErrors.captionId && (
                <span className="label-text-alt text-error">
                  {fieldErrors.captionId}
                </span>
              )}
            </label>
          </div>

          <div className="form-control">
            <label className="label" htmlFor="captionEn">
              <span className="label-text">Caption (EN)</span>
            </label>
            <textarea
              id="captionEn"
              value={captionEn}
              onChange={(e) => {
                setCaptionEn(e.target.value);
                if (actionStatus !== "idle") setActionStatus("idle");
              }}
              className={`textarea textarea-bordered w-full ${
                fieldErrors.captionEn ? "textarea-error" : ""
              }`}
              rows={3}
              maxLength={CAPTION_MAX_LENGTH}
              disabled={isBusy}
            />
            <label className="label">
              <span className="label-text-alt text-base-content/60">
                {captionEn.length}/{CAPTION_MAX_LENGTH}
              </span>
              {fieldErrors.captionEn && (
                <span className="label-text-alt text-error">
                  {fieldErrors.captionEn}
                </span>
              )}
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label" htmlFor="tagsId">
              <span className="label-text">Tags ID (pisahkan dgn koma)</span>
            </label>
            <input
              id="tagsId"
              type="text"
              value={tagsIdInput}
              onChange={(e) => {
                setTagsIdInput(e.target.value);
                if (actionStatus !== "idle") setActionStatus("idle");
              }}
              placeholder="sawah, pedesaan"
              className="input input-bordered w-full"
              disabled={isBusy}
            />
          </div>

          <div className="form-control">
            <label className="label" htmlFor="tagsEn">
              <span className="label-text">Tags EN (pisahkan dgn koma)</span>
            </label>
            <input
              id="tagsEn"
              type="text"
              value={tagsEnInput}
              onChange={(e) => {
                setTagsEnInput(e.target.value);
                if (actionStatus !== "idle") setActionStatus("idle");
              }}
              placeholder="ricefield, village"
              className="input input-bordered w-full"
              disabled={isBusy}
            />
          </div>
        </div>
        <label className="label -mt-2">
            <span className="label-text-alt text-base-content/60">
              Maksimal {MAX_TAGS} tag per bahasa.
            </span>
        </label>

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