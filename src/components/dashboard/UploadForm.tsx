"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeminiBilingualResult } from "@/lib/server/gemini-analysis";

// ── Canvas compression (same as before) ────────────────────────────────────────────
const MAX_WIDTH_PX         = 800;
const COMPRESSION_QUALITY  = 0.85;
const MAX_DESCRIPTION_LEN  = 300;
const MAX_SOURCE_SIZE       = 20 * 1024 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      wb => wb
        ? resolve(wb)
        : canvas.toBlob(
            jb => jb ? resolve(jb) : reject(new Error("Browser tidak dapat memproses gambar ini.")),
            "image/jpeg", COMPRESSION_QUALITY
          ),
      "image/webp", COMPRESSION_QUALITY
    );
  });
}

async function compressImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_WIDTH_PX / bmp.width);
  const canvas = document.createElement("canvas");
  canvas.width  = Math.round(bmp.width  * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia di browser ini.");
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvasToBlob(canvas);
}

function extensionFromMime(type: string): string {
  if (type === "image/webp") return "webp";
  if (type === "image/png")  return "png";
  return "jpg";
}

// ── Local editing state ───────────────────────────────────────────────────────────
interface EditableAnalysis {
  captionEn: string;
  captionId: string;
  tagsEnInput: string; // comma-separated
  tagsIdInput: string;
}

type Phase = "compose" | "analyzing" | "review" | "saving";

function tagsToInput(tags: string[]): string {
  return tags.join(", ");
}

function inputToTags(input: string): string[] {
  return input
    .split(",")
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

// ── Component ─────────────────────────────────────────────────────────────────────
export default function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compression state
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null);
  const [originalSize,   setOriginalSize]   = useState<number | null>(null);
  const [isCompressing,  setIsCompressing]  = useState(false);
  const [compressError,  setCompressError]  = useState("");

  // Form state
  const [description,   setDescription]   = useState("");
  const [phase,         setPhase]         = useState<Phase>("compose");
  const [errorMessage,  setErrorMessage]  = useState("");
  const [editableAnalysis, setEditableAnalysis] = useState<EditableAnalysis | null>(null);
  const [copiedField,   setCopiedField]   = useState<string | null>(null);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    if (!file) {
      setCompressedBlob(null);
      setPreviewUrl(null);
      setOriginalSize(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setCompressError("File harus berupa gambar.");
      return;
    }
    if (file.size > MAX_SOURCE_SIZE) {
      setCompressError("Ukuran file maksimal 20MB.");
      return;
    }

    setIsCompressing(true);
    setCompressError("");
    setOriginalSize(file.size);
    setPhase("compose");
    setErrorMessage("");

    try {
      const blob = await compressImage(file);
      setCompressedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setCompressError(err instanceof Error ? err.message : "Gagal mengompres gambar.");
      setCompressedBlob(null);
      setPreviewUrl(null);
    } finally {
      setIsCompressing(false);
    }
  }

  // Phase 1: send image to /api/photos/analyze, receive bilingual JSON
  async function runAnalysis() {
    if (!compressedBlob) return;

    setPhase("analyzing");
    setErrorMessage("");

    try {
      const fd = new FormData();
      fd.append("file", compressedBlob, `image.${extensionFromMime(compressedBlob.type)}`);
      if (description.trim()) fd.append("description", description.trim());

      const res    = await fetch("/api/photos/analyze", { method: "POST", body: fd });
      const result = await res.json();

      if (!res.ok || !result.success) throw new Error(result.error || "Analisis gagal.");

      const data: GeminiBilingualResult = result.data;

      setEditableAnalysis({
        captionEn:   data.caption_en,
        captionId:   data.caption_id,
        tagsEnInput: tagsToInput(data.tags_en),
        tagsIdInput: tagsToInput(data.tags_id),
      });
      setPhase("review");
    } catch (err) {
      setPhase("compose");
      setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi.");
    }
  }

  // Phase 2: send confirmed content to /api/photos/draft, save to DB
  async function handleSaveDraft() {
    if (!compressedBlob || !editableAnalysis) return;

    setPhase("saving");
    setErrorMessage("");

    try {
      const fd = new FormData();
      fd.append("file", compressedBlob, `image.${extensionFromMime(compressedBlob.type)}`);
      fd.append("caption_en", editableAnalysis.captionEn.trim());
      fd.append("caption_id", editableAnalysis.captionId.trim());
      fd.append("tags_en", JSON.stringify(inputToTags(editableAnalysis.tagsEnInput)));
      fd.append("tags_id", JSON.stringify(inputToTags(editableAnalysis.tagsIdInput)));

      const res    = await fetch("/api/photos/draft", { method: "POST", body: fd });
      const result = await res.json();

      if (!res.ok || !result.success) throw new Error(result.error || "Gagal menyimpan draf.");

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setPhase("review");
      setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi.");
    }
  }

  async function handleCopy(text: string, fieldKey: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(prev => (prev === fieldKey ? null : prev)), 1500);
    } catch { /* clipboard unavailable in some browser contexts */ }
  }

  const isBusy = phase === "analyzing" || phase === "saving";

  return (
    <>
      {/* ── Step 1: File + Description Card ───────────────────────────────── */}
      <div className="card bg-base-100 border border-base-300 shadow-md">
        <div className="card-body gap-4">
          <div className="form-control">
            <label className="label" htmlFor="file-input">
              <span className="label-text">Pilih gambar (maks. 20MB)</span>
            </label>
            <input
              id="file-input"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="file-input file-input-bordered w-full"
              disabled={isBusy}
            />
          </div>

          {isCompressing && (
            <div className="flex items-center gap-2 text-sm text-base-content/70">
              <span className="loading loading-spinner loading-sm" />
              Mengompres gambar...
            </div>
          )}

          {compressError && (
            <div role="alert" className="alert alert-error">
              <span>{compressError}</span>
            </div>
          )}

          {previewUrl && compressedBlob && (
            <div>
              <div className="rounded-box overflow-hidden border border-base-300 aspect-square w-full max-w-xs mx-auto bg-base-200">
                <img src={previewUrl} alt="Pratinjau" className="w-full h-full object-cover" />
              </div>
              {originalSize !== null && (
                <p className="text-xs text-center text-base-content/50 mt-2">
                  {(originalSize / 1024).toFixed(0)} KB →{" "}
                  {(compressedBlob.size / 1024).toFixed(0)} KB (terkompresi)
                </p>
              )}
            </div>
          )}

          <div className="form-control">
            <label className="label" htmlFor="description-input">
              <span className="label-text">Deskripsi singkat (opsional)</span>
            </label>
            <textarea
              id="description-input"
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LEN))}
              className="textarea textarea-bordered w-full"
              rows={3}
              placeholder="Contoh: foto sawah saat pagi hari, kabut tipis di lereng gunung"
              disabled={isBusy}
              maxLength={MAX_DESCRIPTION_LEN}
            />
            <label className="label">
              <span className="label-text-alt text-base-content/60">
                Membantu AI menghasilkan konten yang lebih akurat dalam dua bahasa.
              </span>
              <span className="label-text-alt">
                {description.length}/{MAX_DESCRIPTION_LEN}
              </span>
            </label>
          </div>

          {errorMessage && phase === "compose" && (
            <div role="alert" className="alert alert-error">
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="button"
            onClick={runAnalysis}
            className="btn btn-primary"
            disabled={!compressedBlob || isCompressing || isBusy}
          >
            {phase === "analyzing" ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                Menganalisis dengan AI...
              </>
            ) : (
              "Analisis dengan AI"
            )}
          </button>
        </div>
      </div>

      {/* ── Step 2: Confirmation / Edit Modal ─────────────────────────────── */}
      {(phase === "review" || phase === "saving") && editableAnalysis && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-2xl w-full">
            <h3 className="font-bold text-lg mb-1">Tinjau &amp; Edit Konten AI</h3>
            <p className="text-sm text-base-content/70 mb-5">
              Edit caption dan tag sebelum disimpan. Klik{" "}
              <kbd className="kbd kbd-xs">Salin</kbd> untuk menyalin ke clipboard.
            </p>

            <div className="flex flex-col gap-5">
              {/* Caption EN */}
              <div className="form-control">
                <label className="label" htmlFor="edit-caption-en">
                  <span className="label-text font-semibold">Caption (English)</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(editableAnalysis.captionEn, "caption_en")}
                    className="btn btn-xs btn-ghost"
                    disabled={phase === "saving"}
                  >
                    {copiedField === "caption_en" ? "✓ Tersalin!" : "Salin"}
                  </button>
                </label>
                <textarea
                  id="edit-caption-en"
                  value={editableAnalysis.captionEn}
                  onChange={e =>
                    setEditableAnalysis(prev =>
                      prev ? { ...prev, captionEn: e.target.value } : prev
                    )
                  }
                  className="textarea textarea-bordered w-full"
                  rows={2}
                  disabled={phase === "saving"}
                />
              </div>

              {/* Caption ID */}
              <div className="form-control">
                <label className="label" htmlFor="edit-caption-id">
                  <span className="label-text font-semibold">Caption (Bahasa Indonesia)</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(editableAnalysis.captionId, "caption_id")}
                    className="btn btn-xs btn-ghost"
                    disabled={phase === "saving"}
                  >
                    {copiedField === "caption_id" ? "✓ Tersalin!" : "Salin"}
                  </button>
                </label>
                <textarea
                  id="edit-caption-id"
                  value={editableAnalysis.captionId}
                  onChange={e =>
                    setEditableAnalysis(prev =>
                      prev ? { ...prev, captionId: e.target.value } : prev
                    )
                  }
                  className="textarea textarea-bordered w-full"
                  rows={2}
                  disabled={phase === "saving"}
                />
              </div>

              {/* Tags EN */}
              <div className="form-control">
                <label className="label" htmlFor="edit-tags-en">
                  <span className="label-text font-semibold">
                    Tags (English)
                    <span className="text-base-content/50 font-normal ml-2">
                      — pisahkan dengan koma
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(editableAnalysis.tagsEnInput, "tags_en")}
                    className="btn btn-xs btn-ghost"
                    disabled={phase === "saving"}
                  >
                    {copiedField === "tags_en" ? "✓ Tersalin!" : "Salin"}
                  </button>
                </label>
                <textarea
                  id="edit-tags-en"
                  value={editableAnalysis.tagsEnInput}
                  onChange={e =>
                    setEditableAnalysis(prev =>
                      prev ? { ...prev, tagsEnInput: e.target.value } : prev
                    )
                  }
                  className="textarea textarea-bordered w-full font-mono text-sm"
                  rows={3}
                  disabled={phase === "saving"}
                />
                <label className="label">
                  <span className="label-text-alt text-base-content/60">
                    {inputToTags(editableAnalysis.tagsEnInput).length} tags
                  </span>
                </label>
              </div>

              {/* Tags ID */}
              <div className="form-control">
                <label className="label" htmlFor="edit-tags-id">
                  <span className="label-text font-semibold">
                    Tags (Bahasa Indonesia)
                    <span className="text-base-content/50 font-normal ml-2">
                      — pisahkan dengan koma
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(editableAnalysis.tagsIdInput, "tags_id")}
                    className="btn btn-xs btn-ghost"
                    disabled={phase === "saving"}
                  >
                    {copiedField === "tags_id" ? "✓ Tersalin!" : "Salin"}
                  </button>
                </label>
                <textarea
                  id="edit-tags-id"
                  value={editableAnalysis.tagsIdInput}
                  onChange={e =>
                    setEditableAnalysis(prev =>
                      prev ? { ...prev, tagsIdInput: e.target.value } : prev
                    )
                  }
                  className="textarea textarea-bordered w-full font-mono text-sm"
                  rows={3}
                  disabled={phase === "saving"}
                />
                <label className="label">
                  <span className="label-text-alt text-base-content/60">
                    {inputToTags(editableAnalysis.tagsIdInput).length} tags
                  </span>
                </label>
              </div>
            </div>

            {errorMessage && (
              <div role="alert" className="alert alert-error mt-4">
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="modal-action flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setPhase("compose"); setErrorMessage(""); }}
                className="btn btn-ghost"
                disabled={phase === "saving"}
              >
                ← Ubah Gambar
              </button>
              <button
                type="button"
                onClick={runAnalysis}
                className="btn btn-outline"
                disabled={phase === "saving"}
              >
                Analisis Ulang
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                className="btn btn-primary"
                disabled={phase === "saving"}
              >
                {phase === "saving" ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Menyimpan Draf...
                  </>
                ) : (
                  "Simpan Draf"
                )}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}