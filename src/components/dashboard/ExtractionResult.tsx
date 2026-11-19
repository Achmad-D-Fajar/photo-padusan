"use client";

export type ExtractedPayload = { payload: string; byteLength: number };
export type ExtractionOutcome = ExtractedPayload | { detected: false };
export type ExtractionState =
  | { kind: "empty" }
  | { kind: "processing" }
  | { kind: "not-detected" }
  | { kind: "success"; result: ExtractedPayload }
  | { kind: "error"; message: string }
  | { kind: "unavailable" };

export default function ExtractionResult({ state, copyState = "idle", onCopy }: {
  state: ExtractionState;
  copyState?: "idle" | "copied" | "error";
  onCopy?: () => void;
}) {
  return (
    <section className="watermark-panel watermark-result" aria-labelledby="extraction-result-title" aria-busy={state.kind === "processing"}>
      <h2 id="extraction-result-title">Hasil ekstraksi</h2>
      <div role="status" aria-live="polite" aria-atomic="true">
        {state.kind === "empty" && <p>Belum ada hasil. Pilih gambar, lalu jalankan skenario ekstraksi.</p>}
        {state.kind === "processing" && <p>Memproses gambar… Anda dapat mengganti atau mereset file untuk membatalkan hasil ini.</p>}
        {state.kind === "unavailable" && <><p className="watermark-label">Fitur ekstraksi belum terhubung</p><p>Gambar dapat dipilih dan ditinjau. Ekstraksi payload belum tersedia pada aplikasi ini.</p></>}
        {state.kind === "not-detected" && <><p className="watermark-label">Watermark tidak terdeteksi</p><p>Skenario ini tidak menampilkan payload. Hasil ini bukan pemeriksaan data gambar yang sebenarnya.</p></>}
        {state.kind === "success" && <p>Payload berhasil diekstrak · {state.result.byteLength} byte UTF-8</p>}
      </div>
      {state.kind === "error" && <p role="alert" className="watermark-error">{state.message}</p>}
      {state.kind === "success" && <>
        <pre className="watermark-output" tabIndex={0} aria-label="Teks payload hasil ekstraksi">{state.result.payload}</pre>
        <button type="button" className="watermark-button" onClick={onCopy} disabled={!onCopy}>Salin payload</button>
        <p role="status">{copyState === "copied" ? "Payload disalin." : copyState === "error" ? "Tidak dapat menyalin. Pilih teks payload dan salin secara manual." : "Teks ditampilkan apa adanya."}</p>
      </>}
    </section>
  );
}
