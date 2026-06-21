"use client";
import { useState } from "react";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
    type: null,
    message: "",
  });

  const handleSumbit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setStatus({ type: null, message: "" });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Gagal mengunggah foto");

      setStatus({ type: "success", message: "Foto berhasil diunggah dan dianalisis!" });
      setFile(null); // Reset form
    } catch (error: any) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-md mx-auto mt-10 p-6 bg-base-100 rounded-xl shadow-lg">
      <h1 className="text-2xl font-bold mb-6 text-center">Unggah Karya Visual</h1>
      
      <form onSubmit={handleSumbit} className="flex flex-col gap-4">
        <div className="form-control w-full">
          <label className="label">
            <span className="label-text font-semibold">Pilih Foto (Maks 5MB)</span>
          </label>
          <input
            type="file"
            accept="image/*"
            className="file-input file-input-bordered file-input-primary w-full"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={loading}
          />
        </div>

        {status.type && (
          <div className={`alert ${status.type === "success" ? "alert-success" : "alert-error"}`}>
            <span>{status.message}</span>
          </div>
        )}

        <button 
          type="submit" 
          className="btn btn-primary w-full mt-2" 
          disabled={!file || loading}
        >
          {loading ? <span className="loading loading-spinner"></span> : "Unggah & Ekstrak Tag"}
        </button>
      </form>
    </main>
  );
}