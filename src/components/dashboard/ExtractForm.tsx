"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MAX_PHOTO_SIZE_MB, PHOTO_ACCEPT, validatePhotoFile } from "@/lib/photo-upload";
import ExtractionResult, { type ExtractionOutcome, type ExtractionState } from "./ExtractionResult";

export type ExtractPayload = (file: File, passphrase?: string) => Promise<ExtractionOutcome>;

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

// Adapter disuntik dari luar: demo lama memakai simulasi nama file, aplikasi
// nyata memakai panggilan API verifikasi (lihat RealExtractForm).
export default function ExtractForm({ onExtract, requiresPassphrase = false }: { onExtract?: ExtractPayload; requiresPassphrase?: boolean }) {
  // Native file changes before hydration cannot reach React's onChange handler.
  const interactive = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const lifetime = useRef({ active: true, adapter: onExtract });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [snapshot, setSnapshot] = useState<{ adapter: typeof onExtract; state: ExtractionState }>({ adapter: onExtract, state: { kind: onExtract ? "empty" : "unavailable" } });
  const [copyStatus, setCopyStatus] = useState<{ adapter: typeof onExtract; value: "idle" | "copied" | "error" }>({ adapter: onExtract, value: "idle" });
  // State baru di akhir urutan hook (konsisten dengan konvensi harness UploadForm).
  const [passphrase, setPassphrase] = useState("");
  const state: ExtractionState = snapshot.adapter === onExtract ? snapshot.state : { kind: onExtract ? "empty" : "unavailable" };
  const copyState = copyStatus.adapter === onExtract ? copyStatus.value : "idle";
  function setState(next: ExtractionState) { setSnapshot({ adapter: onExtract, state: next }); }
  function setCopyState(value: typeof copyStatus.value) { setCopyStatus({ adapter: onExtract, value }); }

  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    // Invalidate pending extraction/clipboard work on adapter change and unmount.
    const current = lifetime.current;
    generation.current++;
    current.active = true;
    current.adapter = onExtract;
    return () => { current.active = false; };
  }, [onExtract]);

  function selectFile(nextFile: File | null) {
    generation.current++;
    setCopyState("idle");
    setPreviewFailed(false);
    setState({ kind: onExtract ? "empty" : "unavailable" });
    const error = nextFile ? validatePhotoFile(nextFile) : null;
    setValidationError(error ?? "");
    setFile(error ? null : nextFile);
    setPreview(nextFile && !error ? { file: nextFile, url: URL.createObjectURL(nextFile) } : null);
    if (error && input.current) input.current.value = "";
  }

  async function extract() {
    if (!file || !onExtract || state.kind === "processing") return;
    if (requiresPassphrase && (passphrase.length < 8 || passphrase.length > 128)) return;
    const request = ++generation.current;
    setState({ kind: "processing" });
    setCopyState("idle");
    try {
      const result = await onExtract(file, requiresPassphrase ? passphrase : undefined);
      if (request !== generation.current || !lifetime.current.active || lifetime.current.adapter !== onExtract) return;
      if ("detected" in result) {
        if (result.detected !== false) throw new Error("Hasil skenario tidak valid.");
        setState({ kind: "not-detected" });
        return;
      }
      if (typeof result?.payload !== "string" || !Number.isSafeInteger(result.byteLength) ||
        result.byteLength !== new TextEncoder().encode(result.payload).byteLength) {
        throw new Error("Hasil ekstraksi tidak valid. Coba lagi atau pilih gambar lain.");
      }
      setState({ kind: "success", result });
    } catch (error) {
      // Pesan asli dari server (mis. "Authentication Error (Invalid Tag)") penting
      // untuk bukti penolakan kunci salah; fallback bila adapter melempar non-Error.
      const message = error instanceof Error && error.message ? error.message : "Ekstraksi gagal. Coba lagi atau pilih gambar lain.";
      if (request === generation.current && lifetime.current.active && lifetime.current.adapter === onExtract) setState({ kind: "error", message });
    }
  }

  async function copy() {
    if (state.kind !== "success") return;
    const request = ++generation.current;
    try {
      await navigator.clipboard.writeText(state.result.payload);
      if (request === generation.current && lifetime.current.active && lifetime.current.adapter === onExtract) setCopyState("copied");
    } catch {
      if (request === generation.current && lifetime.current.active && lifetime.current.adapter === onExtract) setCopyState("error");
    }
  }

  return (
    <div className="watermark-workbench">
      <section className="watermark-panel watermark-stack" aria-labelledby="extraction-file-title">
        <h2 id="extraction-file-title">Gambar sumber</h2>
        <div>
          <label className="watermark-label" htmlFor="extraction-file">Pilih gambar (maks. {MAX_PHOTO_SIZE_MB} MB)</label>
          <input id="extraction-file" ref={input} className="watermark-file" type="file" accept={PHOTO_ACCEPT} disabled={!interactive}
            aria-invalid={!!validationError} aria-describedby="extraction-file-help extraction-file-error"
            onChange={event => { const selected = event.target.files?.[0]; if (selected) selectFile(selected); }} />
          <p id="extraction-file-help">{requiresPassphrase
            ? "JPEG, PNG, WebP, GIF, TIFF, AVIF, HEIC/HEIF. Paket watermark diekstrak dari koefisien DCT lalu didekripsi AES-256-GCM di server; passphrase tidak pernah disimpan."
            : "JPEG, PNG, WebP, GIF, TIFF, AVIF, HEIC/HEIF. File tetap di browser; hasil simulasi ditentukan oleh nama file."}</p>
          <p id="extraction-file-error" role="alert" className="watermark-error">{validationError}</p>
        </div>
        {file ? <>
          <dl className="watermark-file-info"><dt>Nama file</dt><dd>{file.name}</dd><dt>Ukuran</dt><dd>{(file.size / 1024 / 1024).toFixed(2)} MB · {file.size.toLocaleString("id-ID")} byte</dd></dl>
          <div className="watermark-preview">
            {preview?.file === file && !previewFailed ? (
              // Local blob only; object-fit: contain preserves the entire image.
              // eslint-disable-next-line @next/next/no-img-element
              <img key={preview.url} src={preview.url} alt={`Pratinjau penuh ${file.name}`} onError={() => setPreviewFailed(true)} />
            ) : <p role="status">{previewFailed ? "Pratinjau tidak tersedia di browser ini. File tetap dipilih; format seperti HEIC/HEIF mungkin tidak dapat ditampilkan." : "Menyiapkan pratinjau…"}</p>}
          </div>
          <div className="watermark-actions">
            <button type="button" className="watermark-button" onClick={() => input.current?.click()}>Ganti gambar</button>
            <button type="button" className="watermark-button" onClick={() => { selectFile(null); if (input.current) input.current.value = ""; }}>Reset</button>
          </div>
        </> : <div className="watermark-preview"><p>Belum ada gambar. Pilih file untuk melihat pratinjau penuh.</p></div>}
        {requiresPassphrase && <div>
          <label className="watermark-label" htmlFor="extraction-passphrase">Passphrase pemilik foto</label>
          <input id="extraction-passphrase" type="password" className="watermark-file" value={passphrase}
            onChange={event => setPassphrase(event.target.value.slice(0, 128))} autoComplete="off"
            aria-describedby="extraction-passphrase-help" disabled={!interactive} />
          <p id="extraction-passphrase-help">8–128 karakter. Hanya pemegang passphrase yang bisa membuka sertifikat; kunci salah atau data yang dimanipulasi ditolak oleh tag autentikasi GCM.</p>
        </div>}
        <button type="button" className="watermark-button watermark-button-primary" onClick={extract}
          disabled={!file || !onExtract || state.kind === "processing" || (requiresPassphrase && (passphrase.length < 8 || passphrase.length > 128))} aria-describedby={!onExtract ? "extraction-unavailable" : undefined}>
          {state.kind === "processing" ? "Memproses…" : "Ekstrak payload"}
        </button>
        {!onExtract && <p id="extraction-unavailable">Fitur ekstraksi belum terhubung. Tombol akan tersedia setelah layanan ekstraksi dihubungkan.</p>}
      </section>
      <ExtractionResult state={state} copyState={copyState} onCopy={copy} />
    </div>
  );
}
