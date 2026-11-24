"use client";

export interface ExtractedCertificate {
  protocol: string;
  photo_id: string;
  photographer: string;
  license_terms: string;
  creation_timestamp: string;
  image_hash: string;
  server_signature: string;
  site_origin: string;
  reference_payload?: string;
}

export type ExtractedPayload = {
  payload: string;
  byteLength: number;
  authenticated?: boolean;
  certificate?: ExtractedCertificate;
  hashMatch?: boolean;
  packetBytes?: number;
};

export type ExtractionState =
  | { kind: "empty" }
  | { kind: "processing" }
  | { kind: "success"; result: ExtractedPayload }
  | { kind: "error"; message: string }
  | { kind: "unavailable" };

export default function ExtractionResult({ state, copyState = "idle", onCopy }: {
  state: ExtractionState;
  copyState?: "idle" | "copied" | "error";
  onCopy?: () => void;
}) {
  const cert = state.kind === "success" ? state.result.certificate : undefined;

  return (
    <section className="watermark-panel watermark-result" aria-labelledby="extraction-result-title" aria-busy={state.kind === "processing"}>
      <h2 id="extraction-result-title">Hasil ekstraksi</h2>
      <div role="status" aria-live="polite" aria-atomic="true">
        {state.kind === "empty" && <p>Belum ada hasil. Pilih gambar, lalu jalankan ekstraksi untuk membaca payload.</p>}
        {state.kind === "processing" && <p>Memproses gambar… Anda dapat mengganti atau mereset file untuk membatalkan hasil ini.</p>}
        {state.kind === "unavailable" && <><p className="watermark-label">Fitur ekstraksi belum terhubung</p><p>Gambar dapat dipilih dan ditinjau. Ekstraksi payload belum tersedia pada aplikasi ini.</p></>}
        {state.kind === "success" && (
          <p>
            {cert
              ? `Sertifikat hak cipta terautentikasi (AES-256-GCM) · ${state.result.packetBytes ?? state.result.byteLength} byte terenkripsi`
              : `Payload berhasil diekstrak · ${state.result.byteLength} byte UTF-8`}
          </p>
        )}
      </div>
      {state.kind === "error" && <p role="alert" className="watermark-error">{state.message}</p>}
      {state.kind === "success" && <>
        {cert && (
          <div className="watermark-stack" data-testid="verified-certificate">
            {typeof state.result.hashMatch === "boolean" && (
              <p role="status" className="watermark-label">
                {state.result.hashMatch
                  ? "Hash citra cocok — piksel sesuai arsip asli Padustock."
                  : "Hash citra berbeda — gambar kemungkinan telah diubah ukuran, diberi pratinjau, atau dikompresi ulang. Sertifikat tetap valid secara kriptografis."}
              </p>
            )}
            <dl className="watermark-file-info">
              <dt>ID Foto</dt><dd>{cert.photo_id}</dd>
              <dt>Fotografer</dt><dd>{cert.photographer}</dd>
              <dt>Lisensi</dt><dd>{cert.license_terms}</dd>
              <dt>Waktu Tanam</dt><dd>{cert.creation_timestamp}</dd>
              <dt>Asal Situs</dt><dd>{cert.site_origin}</dd>
              <dt>Penanda Server</dt><dd>{cert.server_signature}</dd>
              {cert.reference_payload && <><dt>Payload Referensi</dt><dd>{cert.reference_payload}</dd></>}
            </dl>
          </div>
        )}
        <pre className="watermark-output" tabIndex={0} aria-label="Teks payload hasil ekstraksi">{state.result.payload}</pre>
        <button type="button" className="watermark-button" onClick={onCopy} disabled={!onCopy}>Salin payload</button>
        <p role="status">{copyState === "copied" ? "Payload disalin." : copyState === "error" ? "Tidak dapat menyalin. Pilih teks payload dan salin secara manual." : "Teks ditampilkan apa adanya."}</p>
      </>}
    </section>
  );
}
