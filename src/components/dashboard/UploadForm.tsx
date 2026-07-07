"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeminiBilingualResult } from "@/lib/server/gemini-analysis";

// ── Canvas compression ────────────────────────────────────────────────────────────
const MAX_WIDTH_PX        = 800;
const COMPRESSION_QUALITY = 0.85;
const MAX_SOURCE_SIZE     = 20 * 1024 * 1024;
const MAX_CONTEXT_LEN     = 300;

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (wb) =>
        wb
          ? resolve(wb)
          : canvas.toBlob(
              (jb) =>
                jb
                  ? resolve(jb)
                  : reject(new Error("Browser tidak dapat memproses gambar ini.")),
              "image/jpeg",
              COMPRESSION_QUALITY
            ),
      "image/webp",
      COMPRESSION_QUALITY
    );
  });
}

async function compressImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_WIDTH_PX / bmp.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia di browser ini.");
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvasToBlob(canvas);
}

function extensionFromMime(type: string): string {
  if (type === "image/webp") return "webp";
  if (type === "image/png") return "png";
  return "jpg";
}

// ── Helpers ───────────────────────────────────────────────────────────────────────
interface EditableAnalysis {
  captionEn: string;
  captionId: string;
  tagsEnInput: string;
  tagsIdInput: string;
}

// "compose"  — initial state, file not yet ready or just selected
// "analyzing"— AI request in-flight
// "review"   — AI returned; user is reviewing in the popup
// "saving"   — draft/publish request in-flight
type Phase = "compose" | "analyzing" | "review" | "saving";

function tagsToInput(tags: string[]): string {
  return tags.join(", ");
}

function inputToTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// ── Component ─────────────────────────────────────────────────────────────────────
export default function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Mode toggles (Features 1 & 2) ──────────────────────────────────────────
  // Feature 1: false = manual caption/tags; true = AI-generated
  const [useAI, setUseAI] = useState(false);

  // Feature 2: true = save as draft (photographer will add microstock link later)
  //            false = publish immediately, microstock_url stays null
  const [wantsMicrostockLink, setWantsMicrostockLink] = useState(true);

  // ── Compression state ─────────────────────────────────────────────────────────
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressError, setCompressError] = useState("");

  // ── Manual mode inputs (Feature 1) ───────────────────────────────────────────
  const [manualCaption, setManualCaption] = useState("");
  const [manualTagsInput, setManualTagsInput] = useState("");

  // ── AI mode context textarea (Feature 1) ─────────────────────────────────────
  const [aiContext, setAiContext] = useState("");

  // ── Shared phase + error state ────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("compose");
  const [errorMessage, setErrorMessage] = useState("");

  // ── AI review popup state ─────────────────────────────────────────────────────
  const [editableAnalysis, setEditableAnalysis] =
    useState<EditableAnalysis | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
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
      setCompressError(
        err instanceof Error ? err.message : "Gagal mengompres gambar."
      );
      setCompressedBlob(null);
      setPreviewUrl(null);
    } finally {
      setIsCompressing(false);
    }
  }

  // Builds the base FormData payload shared by both AI and manual paths.
  // `publish_directly` signals the draft route to insert with status='published'
  // and microstock_url=null instead of the default status='draft'.
  function buildBaseFormData(
    captionEn: string,
    captionId: string,
    tagsEn: string[],
    tagsId: string[]
  ): FormData {
    const fd = new FormData();
    fd.append(
      "file",
      compressedBlob!,
      `image.${extensionFromMime(compressedBlob!.type)}`
    );
    fd.append("caption_en", captionEn.trim());
    fd.append("caption_id", captionId.trim());
    fd.append("tags_en", JSON.stringify(tagsEn));
    fd.append("tags_id", JSON.stringify(tagsId));
    // Feature 2: pass the publish intent so the API route sets the correct status
    fd.append("publish_directly", (!wantsMicrostockLink).toString());
    return fd;
  }

  async function postToDraftRoute(fd: FormData) {
    const res = await fetch("/api/photos/draft", { method: "POST", body: fd });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Gagal menyimpan.");
    }
  }

  // ── Feature 1 (Manual path): submit directly without AI ──────────────────────
  // ── Feature 1 & 2 (Manual path with auto-translate): submit directly ────────
  async function handleManualSubmit() {
    if (!compressedBlob) return;
    if (!manualCaption.trim()) {
      setErrorMessage("Caption tidak boleh kosong.");
      return;
    }

    setPhase("saving");
    setErrorMessage("");

    try {
      const parsedTagsId = inputToTags(manualTagsInput);

      // 1. Fetch translation
      const transRes = await fetch("/api/photos/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption_id: manualCaption,
          tags_id: parsedTagsId,
        }),
      });
      
      const transData = await transRes.json();
      
      if (!transRes.ok || !transData.success) {
        throw new Error(transData.error || "Gagal menerjemahkan teks. Coba lagi.");
      }

      // 2. Build payload with translated EN data and original ID data
      const fd = buildBaseFormData(
        transData.data.caption_en,
        manualCaption,
        transData.data.tags_en,
        parsedTagsId
      );

      // 3. Post to draft route
      await postToDraftRoute(fd);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setPhase("compose");
      setErrorMessage(
        err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan. Coba lagi."
      );
    }
  }

  // ── Feature 1 (AI path) Phase 1: analyze ─────────────────────────────────────
  async function runAnalysis() {
    if (!compressedBlob) return;

    setPhase("analyzing");
    setErrorMessage("");

    try {
      const fd = new FormData();
      fd.append(
        "file",
        compressedBlob,
        `image.${extensionFromMime(compressedBlob.type)}`
      );
      if (aiContext.trim()) fd.append("description", aiContext.trim());

      const res = await fetch("/api/photos/analyze", {
        method: "POST",
        body: fd,
      });
      const result = await res.json();
      if (!res.ok || !result.success)
        throw new Error(result.error || "Analisis gagal.");

      const data = result.data; 
      setEditableAnalysis({
        captionEn: data.caption_en,
        captionId: data.caption_id,
        tagsEnInput: tagsToInput(data.tags_en),
        tagsIdInput: tagsToInput(data.tags_id),
      });
      setPhase("review");
    } catch (err) {
      setPhase("compose");
      setErrorMessage(
        err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi."
      );
    }
  }

  // ── Feature 1 (AI path) Phase 2: save from the review popup ──────────────────
  async function handleSaveDraft() {
    if (!compressedBlob || !editableAnalysis) return;

    setPhase("saving");
    setErrorMessage("");

    try {
      const fd = buildBaseFormData(
        editableAnalysis.captionEn,
        editableAnalysis.captionId,
        inputToTags(editableAnalysis.tagsEnInput),
        inputToTags(editableAnalysis.tagsIdInput)
      );
      await postToDraftRoute(fd);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setPhase("review");
      setErrorMessage(
        err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi."
      );
    }
  }

  async function handleCopy(text: string, fieldKey: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      setTimeout(
        () => setCopiedField((prev) => (prev === fieldKey ? null : prev)),
        1500
      );
    } catch {
      /* clipboard unavailable in some browser contexts */
    }
  }

  const isBusy = phase === "analyzing" || phase === "saving";
  // Label for the primary save action — changes based on Feature 2 state
  const saveActionLabel = wantsMicrostockLink
    ? "Simpan sebagai Draf"
    : "Publikasikan Sekarang";

  return (
    <>
      {/* ── Main compose card ──────────────────────────────────────────────── */}
      <div className="card bg-base-100 border border-base-300 shadow-md">
        <div className="card-body gap-4">

          {/* File input */}
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
                <img
                  src={previewUrl}
                  alt="Pratinjau"
                  className="w-full h-full object-cover"
                />
              </div>
              {originalSize !== null && (
                <p className="text-xs text-center text-base-content/50 mt-2">
                  {(originalSize / 1024).toFixed(0)} KB →{" "}
                  {(compressedBlob.size / 1024).toFixed(0)} KB (terkompresi)
                </p>
              )}
            </div>
          )}

          <div className="divider my-0" />

          {/* ── Feature 1: AI mode toggle ────────────────────────────────── */}
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => {
                setUseAI(e.target.checked);
                setErrorMessage("");
              }}
              className="checkbox"
              disabled={isBusy}
            />
            <span className="label-text font-medium">
              Buat caption dan tags dengan AI
            </span>
          </label>

          {/* ── Feature 1: Manual inputs (default) ──────────────────────── */}
          {!useAI && (
            <>
              <div className="form-control">
                <label className="label" htmlFor="manual-caption">
                  <span className="label-text">Caption Manual</span>
                </label>
                <textarea
                  id="manual-caption"
                  value={manualCaption}
                  onChange={(e) => setManualCaption(e.target.value)}
                  className="textarea textarea-bordered w-full"
                  rows={3}
                  placeholder="Deskripsikan foto ini..."
                  disabled={isBusy}
                />
              </div>

              <div className="form-control">
                <label className="label" htmlFor="manual-tags">
                  <span className="label-text">Tags Manual</span>
                </label>
                <input
                  id="manual-tags"
                  type="text"
                  value={manualTagsInput}
                  onChange={(e) => setManualTagsInput(e.target.value)}
                  className="input input-bordered w-full"
                  placeholder="sawah, pagi, Padusan, Mojokerto"
                  disabled={isBusy}
                />
                <label className="label">
                  <span className="label-text-alt text-base-content/60">
                    Pisahkan tag dengan koma.
                  </span>
                </label>
              </div>
            </>
          )}

          {/* ── Feature 1: AI context textarea (shown only in AI mode) ──── */}
          {useAI && (
            <div className="form-control">
              <label className="label" htmlFor="ai-context">
                <span className="label-text">
                  Konteks Foto (Opsional) — Bantu AI mengenali foto ini
                </span>
              </label>
              <textarea
                id="ai-context"
                value={aiContext}
                onChange={(e) =>
                  setAiContext(e.target.value.slice(0, MAX_CONTEXT_LEN))
                }
                className="textarea textarea-bordered w-full"
                rows={3}
                placeholder="Contoh: foto sawah pagi hari dengan kabut tipis di lereng gunung"
                disabled={isBusy}
                maxLength={MAX_CONTEXT_LEN}
              />
              <label className="label">
                <span className="label-text-alt text-base-content/60">
                  Konteks membantu AI menghasilkan caption yang lebih akurat.
                </span>
                <span className="label-text-alt">
                  {aiContext.length}/{MAX_CONTEXT_LEN}
                </span>
              </label>
            </div>
          )}

          <div className="divider my-0" />

          {/* ── Feature 2: Microstock link toggle ───────────────────────── */}
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              checked={wantsMicrostockLink}
              onChange={(e) => setWantsMicrostockLink(e.target.checked)}
              className="checkbox"
              disabled={isBusy}
            />
            <span className="label-text font-medium">
              Akan masukkan link eksternal (Microstock)
            </span>
          </label>

          {/* Contextual hint for each microstock mode */}
          {wantsMicrostockLink ? (
            <p className="text-xs text-base-content/60 -mt-2">
              Foto akan disimpan sebagai{" "}
              <span className="badge badge-warning badge-sm">Draf</span> — tambahkan
              link microstock di halaman Edit sebelum dipublikasikan.
            </p>
          ) : (
            <p className="text-xs text-base-content/60 -mt-2">
              Foto akan langsung{" "}
              <span className="badge badge-success badge-sm">Dipublikasikan</span>{" "}
              di platform dan bisa diunduh gratis oleh pengunjung.
            </p>
          )}

          {errorMessage && phase === "compose" && (
            <div role="alert" className="alert alert-error">
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ── Primary action button — adapts to mode ───────────────────── */}
          {useAI ? (
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
          ) : (
            <button
              type="button"
              onClick={handleManualSubmit}
              className="btn bg-[#117733] hover:bg-[#0e5c27] text-[#E5E5E5] rounded-none"
              disabled={!compressedBlob || isCompressing || isBusy}
            >
              {phase === "saving" ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Menerjemahkan & Menyimpan...
                </>
              ) : (
                saveActionLabel
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── AI Review / Edit Modal ──────────────────────────────────────────── */}
      {(phase === "review" || (phase === "saving" && editableAnalysis)) &&
        editableAnalysis && (
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
                    <span className="label-text font-semibold">
                      Caption (English)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(editableAnalysis.captionEn, "caption_en")
                      }
                      className="btn btn-xs btn-ghost"
                      disabled={phase === "saving"}
                    >
                      {copiedField === "caption_en" ? "✓ Tersalin!" : "Salin"}
                    </button>
                  </label>
                  <textarea
                    id="edit-caption-en"
                    value={editableAnalysis.captionEn}
                    onChange={(e) =>
                      setEditableAnalysis((prev) =>
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
                    <span className="label-text font-semibold">
                      Caption (Bahasa Indonesia)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(editableAnalysis.captionId, "caption_id")
                      }
                      className="btn btn-xs btn-ghost"
                      disabled={phase === "saving"}
                    >
                      {copiedField === "caption_id" ? "✓ Tersalin!" : "Salin"}
                    </button>
                  </label>
                  <textarea
                    id="edit-caption-id"
                    value={editableAnalysis.captionId}
                    onChange={(e) =>
                      setEditableAnalysis((prev) =>
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
                      onClick={() =>
                        handleCopy(editableAnalysis.tagsEnInput, "tags_en")
                      }
                      className="btn btn-xs btn-ghost"
                      disabled={phase === "saving"}
                    >
                      {copiedField === "tags_en" ? "✓ Tersalin!" : "Salin"}
                    </button>
                  </label>
                  <textarea
                    id="edit-tags-en"
                    value={editableAnalysis.tagsEnInput}
                    onChange={(e) =>
                      setEditableAnalysis((prev) =>
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
                      onClick={() =>
                        handleCopy(editableAnalysis.tagsIdInput, "tags_id")
                      }
                      className="btn btn-xs btn-ghost"
                      disabled={phase === "saving"}
                    >
                      {copiedField === "tags_id" ? "✓ Tersalin!" : "Salin"}
                    </button>
                  </label>
                  <textarea
                    id="edit-tags-id"
                    value={editableAnalysis.tagsIdInput}
                    onChange={(e) =>
                      setEditableAnalysis((prev) =>
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

              {/* Feature 2: hint in the popup so the user knows what will happen */}
              {!wantsMicrostockLink && (
                <div role="alert" className="alert alert-info mt-4">
                  <span className="text-sm">
                    Foto akan langsung <strong>dipublikasikan</strong> sebagai konten
                    gratis. Anda dapat menambahkan link microstock di halaman Edit
                    kapan saja.
                  </span>
                </div>
              )}

              <div className="modal-action flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhase("compose");
                    setErrorMessage("");
                  }}
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
                      Menyimpan...
                    </>
                  ) : (
                    saveActionLabel
                  )}
                </button>
              </div>
            </div>
          </dialog>
        )}
    </>
  );
}