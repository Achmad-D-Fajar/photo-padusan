"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeminiBilingualResult } from "@/lib/server/gemini-analysis";

const MAX_SOURCE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_CONTEXT_LEN = 300;

interface EditableAnalysis {
  captionEn: string;
  captionId: string;
  tagsEnInput: string;
  tagsIdInput: string;
}

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

export default function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [useAI, setUseAI] = useState(false);
  const [wantsMicrostockLink, setWantsMicrostockLink] = useState(true);

  // Menghapus state kompresi canvas dan hanya menyimpan file aslinya
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);

  const [manualCaption, setManualCaption] = useState("");
  const [manualTagsInput, setManualTagsInput] = useState("");
  const [aiContext, setAiContext] = useState("");

  const [phase, setPhase] = useState<Phase>("compose");
  const [errorMessage, setErrorMessage] = useState("");

  const [editableAnalysis, setEditableAnalysis] = useState<EditableAnalysis | null>(null);
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
      setOriginalFile(null);
      setPreviewUrl(null);
      setOriginalSize(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setErrorMessage("File harus berupa gambar.");
      return;
    }
    if (file.size > MAX_SOURCE_SIZE) {
      setErrorMessage("Ukuran file maksimal 20MB.");
      return;
    }

    // Bypass canvas pipeline sepenuhnya. Langsung render file asli.
    setOriginalFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setOriginalSize(file.size);
    setPhase("compose");
    setErrorMessage("");
  }

  function buildBaseFormData(
    captionEn: string,
    captionId: string,
    tagsEn: string[],
    tagsId: string[]
  ): FormData {
    const fd = new FormData();
    fd.append("file", originalFile!, originalFile!.name); 
    fd.append("caption_en", captionEn.trim());
    fd.append("caption_id", captionId.trim());
    fd.append("tags_en", JSON.stringify(tagsEn));
    fd.append("tags_id", JSON.stringify(tagsId));
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

  async function handleManualSubmit() {
    if (!originalFile) return;
    if (!manualCaption.trim()) {
      setErrorMessage("Caption tidak boleh kosong.");
      return;
    }

    setPhase("saving");
    setErrorMessage("");

    try {
      const parsedTagsId = inputToTags(manualTagsInput);

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

      const fd = buildBaseFormData(
        transData.data.caption_en,
        manualCaption,
        transData.data.tags_en,
        parsedTagsId
      );

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

  async function runAnalysis() {
    if (!originalFile) return;

    setPhase("analyzing");
    setErrorMessage("");

    try {
      const fd = new FormData();
      // Mengirimkan file asli ke AI agar terbaca sempurna
      fd.append("file", originalFile, originalFile.name);
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

  async function handleSaveDraft() {
    if (!originalFile || !editableAnalysis) return;

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
      // clipboard unavailable
    }
  }

  const isBusy = phase === "analyzing" || phase === "saving";
  const saveActionLabel = wantsMicrostockLink
    ? "Simpan sebagai Draf"
    : "Publikasikan Sekarang";

  return (
    <>
      <div className="card bg-base-100 border border-base-300 shadow-md rounded-none">
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
              className="file-input file-input-bordered w-full rounded-none"
              disabled={isBusy}
            />
          </div>

          {previewUrl && originalFile && (
            <div>
              <div className="overflow-hidden border border-base-300 aspect-square w-full max-w-xs mx-auto bg-base-200">
                <img
                  src={previewUrl}
                  alt="Pratinjau"
                  className="w-full h-full object-cover"
                />
              </div>
              {originalSize !== null && (
                <p className="text-xs text-center text-base-content/50 mt-2">
                  {(originalSize / 1024 / 1024).toFixed(2)} MB (Resolusi Asli)
                </p>
              )}
            </div>
          )}

          <div className="divider my-0" />

          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => {
                setUseAI(e.target.checked);
                setErrorMessage("");
              }}
              className="checkbox rounded-none"
              disabled={isBusy}
            />
            <span className="label-text font-medium">
              Buat caption dan tags dengan AI
            </span>
          </label>

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
                  className="textarea textarea-bordered w-full rounded-none"
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
                  className="input input-bordered w-full rounded-none"
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
                className="textarea textarea-bordered w-full rounded-none"
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

          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              checked={wantsMicrostockLink}
              onChange={(e) => setWantsMicrostockLink(e.target.checked)}
              className="checkbox rounded-none"
              disabled={isBusy}
            />
            <span className="label-text font-medium">
              Akan masukkan link eksternal (Microstock)
            </span>
          </label>

          {wantsMicrostockLink ? (
            <p className="text-xs text-base-content/60 -mt-2">
              Foto akan disimpan sebagai{" "}
              <span className="badge badge-warning badge-sm rounded-none">Draf</span> — tambahkan
              link microstock di halaman Edit sebelum dipublikasikan.
            </p>
          ) : (
            <p className="text-xs text-base-content/60 -mt-2">
              Foto akan langsung{" "}
              <span className="badge badge-success badge-sm rounded-none">Dipublikasikan</span>{" "}
              di platform dan bisa diunduh gratis oleh pengunjung.
            </p>
          )}

          {errorMessage && phase === "compose" && (
            <div role="alert" className="alert alert-error rounded-none">
              <span>{errorMessage}</span>
            </div>
          )}

          {useAI ? (
            <button
              type="button"
              onClick={runAnalysis}
              className="btn bg-[#117733] hover:bg-[#0e5c27] text-[#E5E5E5] rounded-none"
              disabled={!originalFile || isBusy}
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
              disabled={!originalFile || isBusy}
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

      {(phase === "review" || (phase === "saving" && editableAnalysis)) &&
        editableAnalysis && (
          <dialog className="modal modal-open">
            <div className="modal-box max-w-2xl w-full rounded-none">
              <h3 className="font-bold text-lg mb-1">Tinjau &amp; Edit Konten AI</h3>
              <p className="text-sm text-base-content/70 mb-5">
                Edit caption dan tag sebelum disimpan. Klik{" "}
                <kbd className="kbd kbd-xs rounded-none border-[#111111]">Salin</kbd> untuk menyalin ke clipboard.
              </p>

              <div className="flex flex-col gap-5">
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
                      className="btn btn-xs btn-ghost rounded-none"
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
                    className="textarea textarea-bordered w-full rounded-none"
                    rows={2}
                    disabled={phase === "saving"}
                  />
                </div>

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
                      className="btn btn-xs btn-ghost rounded-none"
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
                    className="textarea textarea-bordered w-full rounded-none"
                    rows={2}
                    disabled={phase === "saving"}
                  />
                </div>

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
                      className="btn btn-xs btn-ghost rounded-none"
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
                    className="textarea textarea-bordered w-full font-mono text-sm rounded-none"
                    rows={3}
                    disabled={phase === "saving"}
                  />
                  <label className="label">
                    <span className="label-text-alt text-base-content/60">
                      {inputToTags(editableAnalysis.tagsEnInput).length} tags
                    </span>
                  </label>
                </div>

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
                      className="btn btn-xs btn-ghost rounded-none"
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
                    className="textarea textarea-bordered w-full font-mono text-sm rounded-none"
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
                <div role="alert" className="alert alert-error mt-4 rounded-none">
                  <span>{errorMessage}</span>
                </div>
              )}

              {!wantsMicrostockLink && (
                <div role="alert" className="alert alert-info mt-4 rounded-none">
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
                  className="btn btn-ghost rounded-none"
                  disabled={phase === "saving"}
                >
                  ← Ubah Gambar
                </button>
                <button
                  type="button"
                  onClick={runAnalysis}
                  className="btn btn-outline rounded-none border-[#111111] text-[#111111]"
                  disabled={phase === "saving"}
                >
                  Analisis Ulang
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="btn bg-[#117733] hover:bg-[#0e5c27] text-[#E5E5E5] rounded-none"
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