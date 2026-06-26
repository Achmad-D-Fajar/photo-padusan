"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_WIDTH_PX = 800;
const COMPRESSION_QUALITY = 0.85;
const MAX_DESCRIPTION_LENGTH = 300;

type CompressStatus = "idle" | "compressing" | "ready" | "error";
type SubmitStatus = "idle" | "loading" | "success" | "error";

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (webpBlob) => {
        if (webpBlob) {
          resolve(webpBlob);
          return;
        }
        canvas.toBlob(
          (jpegBlob) => {
            if (jpegBlob) {
              resolve(jpegBlob);
            } else {
              reject(new Error("Browser tidak dapat memproses gambar ini."));
            }
          },
          "image/jpeg",
          COMPRESSION_QUALITY
        );
      },
      "image/webp",
      COMPRESSION_QUALITY
    );
  });
}

async function compressImage(file: File): Promise<Blob> {
  const imageBitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_WIDTH_PX / imageBitmap.width);
  const targetWidth = Math.round(imageBitmap.width * scale);
  const targetHeight = Math.round(imageBitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas tidak tersedia di browser ini.");
  }

  ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
  imageBitmap.close();

  return canvasToBlob(canvas);
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "jpg";
}

export default function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [description, setDescription] = useState("");

  const [compressStatus, setCompressStatus] = useState<CompressStatus>("idle");
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [message, setMessage] = useState("");

  // State baru untuk menampung hasil generate AI & modal (Sesuai image_e6c3d9.png)
  const [aiResult, setAiResult] = useState<{
    caption: string;
    tags: string[];
  } | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    if (!file) {
      setCompressedBlob(null);
      setPreviewUrl(null);
      setOriginalSize(null);
      setCompressStatus("idle");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setCompressStatus("error");
      setMessage("File harus berupa gambar.");
      return;
    }

    setCompressStatus("compressing");
    setMessage("");
    setSubmitStatus("idle");
    setOriginalSize(file.size);

    try {
      const blob = await compressImage(file);
      setCompressedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setCompressStatus("ready");
    } catch (err) {
      setCompressStatus("error");
      setCompressedBlob(null);
      setPreviewUrl(null);
      setMessage(
        err instanceof Error
          ? err.message
          : "Gagal mengompres gambar. Coba gambar lain."
      );
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!compressedBlob) {
      setSubmitStatus("error");
      setMessage("Pilih gambar terlebih dahulu.");
      return;
    }

    setSubmitStatus("loading");
    setMessage("");

    try {
      const formData = new FormData();
      const extension = extensionFromMimeType(compressedBlob.type);
      formData.append("file", compressedBlob, `compressed.${extension}`);

      const trimmedDescription = description.trim();
      if (trimmedDescription.length > 0) {
        formData.append("description", trimmedDescription);
      }

      const response = await fetch("/api/photos/draft", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gagal menyimpan draf foto.");
      }

      setSubmitStatus("success");
      setMessage("Draf foto berhasil dibuat!");

      // Set hasil ke state untuk membuka modal, tidak langsung redirect
      setAiResult({
        caption: result.data.caption || "",
        tags: Array.isArray(result.data.tags) ? result.data.tags : [],
      });
    } catch (err) {
      setSubmitStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Terjadi kesalahan tak terduga."
      );
    }
  }

  function handleCloseModal() {
    setAiResult(null);
    router.push("/dashboard");
    router.refresh();
  }

  const isCompressing = compressStatus === "compressing";
  const isSubmitting = submitStatus === "loading";
  const canSubmit = compressStatus === "ready" && !isSubmitting;

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="card bg-base-100 border border-base-300 shadow-md"
      >
        <div className="card-body gap-4">
          <div className="form-control">
            <label className="label" htmlFor="file-input">
              <span className="label-text">Pilih gambar</span>
            </label>
            <input
              id="file-input"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="file-input file-input-bordered w-full"
              disabled={isSubmitting}
            />
            <label className="label">
              <span className="label-text-alt text-base-content/60">
                Gambar otomatis dikompresi ke lebar maksimal {MAX_WIDTH_PX}px
                sebelum diunggah.
              </span>
            </label>
          </div>

          {isCompressing && (
            <div className="flex items-center gap-2 text-sm text-base-content/70">
              <span className="loading loading-spinner loading-sm"></span>
              Mengompres gambar...
            </div>
          )}

          {previewUrl && compressStatus === "ready" && (
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
                  Ukuran asli: {(originalSize / 1024).toFixed(0)} KB →
                  Terkompresi: {(compressedBlob!.size / 1024).toFixed(0)} KB
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
              onChange={(e) =>
                setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))
              }
              placeholder="Contoh: foto pemandangan sawah saat matahari terbenam"
              className="textarea textarea-bordered w-full"
              rows={3}
              disabled={isSubmitting}
              maxLength={MAX_DESCRIPTION_LENGTH}
            />
            <label className="label">
              <span className="label-text-alt text-base-content/60">
                Membantu AI membuat caption dan tag yang lebih akurat.
              </span>
              <span className="label-text-alt">
                {description.length}/{MAX_DESCRIPTION_LENGTH}
              </span>
            </label>
          </div>

          {submitStatus === "success" && (
            <div role="alert" className="alert alert-success">
              <span>{message}</span>
            </div>
          )}

          {(submitStatus === "error" || compressStatus === "error") && (
            <div role="alert" className="alert alert-error">
              <span>{message}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Memproses...
              </>
            ) : (
              "Generate & Simpan Draf"
            )}
          </button>
        </div>
      </form>

      {/* Modal Penampung Hasil Analisis AI (Sesuai image_e6c3d9.png) */}
      {aiResult && (
        <dialog className="modal modal-open z-50">
          <div className="modal-box max-w-md border border-base-300 shadow-xl bg-base-100 p-6">
            <h3 className="font-bold text-lg mb-4 text-center">Hasil Analisis AI</h3>

            <div className="form-control w-full mb-4">
              <label className="label font-medium text-sm pt-0">Caption:</label>
              <div className="join w-full">
                <textarea
                  className="textarea textarea-bordered join-item w-full h-24 resize-none"
                  value={aiResult.caption}
                  onChange={(e) =>
                    setAiResult({ ...aiResult, caption: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="btn btn-neutral join-item h-auto"
                  onClick={() =>
                    navigator.clipboard.writeText(aiResult.caption)
                  }
                >
                  Salin
                </button>
              </div>
            </div>

            <div className="form-control w-full mb-6">
              <label className="label font-medium text-sm pt-0">Tags:</label>
              <div className="join w-full">
                <input
                  type="text"
                  className="input input-bordered join-item w-full"
                  value={aiResult.tags.join(", ")}
                  onChange={(e) =>
                    setAiResult({
                      ...aiResult,
                      tags: e.target.value.split(",").map((t) => t.trim()),
                    })
                  }
                />
                <button
                  type="button"
                  className="btn btn-neutral join-item h-auto"
                  onClick={() =>
                    navigator.clipboard.writeText(aiResult.tags.join(", "))
                  }
                >
                  Salin
                </button>
              </div>
            </div>

            <div className="modal-action justify-center mt-2">
              <button
                type="button"
                className="btn btn-primary w-32"
                onClick={handleCloseModal}
              >
                Ok
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}