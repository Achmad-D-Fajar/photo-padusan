"use client";

import { useRef, useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

const MAX_DESCRIPTION_LENGTH = 300;

export default function UploadPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
    setStatus("idle");
    setMessage("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      setStatus("error");
      setMessage("Please select an image file first.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setStatus("error");
      setMessage("File size exceeds the 5MB limit.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const trimmedDescription = description.trim();
      if (trimmedDescription.length > 0) {
        formData.append("description", trimmedDescription);
      }

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Upload failed. Please try again.");
      }

      setStatus("success");
      setMessage("Photo uploaded and analyzed successfully!");
      setPreviewUrl(null);
      setDescription("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "An unknown error occurred."
      );
    }
  }

  return (
    <main className="container mx-auto px-4 py-10 max-w-xl">
      <h1 className="text-3xl font-bold mb-2">Upload Photo</h1>
      <p className="text-base-content/70 mb-8">
        Bagikan momen dari Padusan. Foto akan dianalisis otomatis oleh AI.
      </p>

      <form
        onSubmit={handleSubmit}
        className="card bg-base-100 border border-base-300 shadow-md"
      >
        <div className="card-body gap-4">
          <div className="form-control">
            <label className="label" htmlFor="file-input">
              <span className="label-text">Select an image (max 5MB)</span>
            </label>
            <input
              id="file-input"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="file-input file-input-bordered w-full"
              disabled={status === "loading"}
            />
          </div>

          {previewUrl && (
            <div className="rounded-box overflow-hidden border border-base-300 aspect-square w-full max-w-xs mx-auto">
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="form-control">
            <label className="label" htmlFor="description-input">
              <span className="label-text">
                Deskripsi singkat (opsional)
              </span>
            </label>
            <textarea
              id="description-input"
              value={description}
              onChange={(e) =>
                setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))
              }
              placeholder="Contoh: foto saat acara bersih desa di balai warga"
              className="textarea textarea-bordered w-full"
              rows={3}
              disabled={status === "loading"}
              maxLength={MAX_DESCRIPTION_LENGTH}
            />
            <label className="label">
              <span className="label-text-alt text-base-content/60">
                Jika diisi, AI akan mempertimbangkan deskripsi ini bersama
                gambar. Jika kosong, AI hanya menganalisis gambar.
              </span>
              <span className="label-text-alt">
                {description.length}/{MAX_DESCRIPTION_LENGTH}
              </span>
            </label>
          </div>

          {status === "success" && (
            <div role="alert" className="alert alert-success">
              <span>{message}</span>
            </div>
          )}

          {status === "error" && (
            <div role="alert" className="alert alert-error">
              <span>{message}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={status === "loading"}>
            {status === "loading" ? (
                <>
                <span className="loading loading-spinner loading-sm"></span>
                Menganalisis Visual... (Mungkin butuh waktu 1 menit)
                </>
            ) : (
                "Upload Photo"
            )}
          </button>

          {status === "success" && (
            <a href="/" className="btn btn-outline btn-sm">
              View Gallery
            </a>
          )}
        </div>
      </form>
    </main>
  );
}