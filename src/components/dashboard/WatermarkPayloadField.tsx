"use client";

import { useId } from "react";
import Link from "next/link";
import { DEFAULT_WATERMARK_PAYLOAD, MAX_WATERMARK_PAYLOAD_BYTES, watermarkPayload } from "@/lib/watermark-payload";

export default function WatermarkPayloadField({ value, onChange, enabled, onEnabledChange, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const { byteLength, valid } = watermarkPayload(value);
  const usesDefault = value.trim().length === 0;

  return (
    <section className="watermark-settings" aria-label="Pengaturan watermark tersembunyi">
      <p>
        {enabled ? <>
          {usesDefault ? "Jika tidak diubah, " : "Pilihan saat ini: "}
          <Link href="/about/hidden-watermark" target="_blank" rel="noopener noreferrer" className="watermark-link">hidden watermark</Link>
          {usesDefault ? <> bawaan dengan payload <code>{DEFAULT_WATERMARK_PAYLOAD}</code> akan digunakan saat fitur dihubungkan.</> : " dengan payload khusus akan digunakan saat fitur dihubungkan."}
        </> : <>
          <Link href="/about/hidden-watermark" target="_blank" rel="noopener noreferrer" className="watermark-link">Hidden watermark</Link> dinonaktifkan dalam persiapan unggahan ini.
        </>}
      </p>
      <p id={`${id}-notice`} className="watermark-settings-note">Saat ini pengaturan belum diterapkan ke gambar, dikirim, atau disimpan.</p>
      <details className="watermark-payload">
        <summary>Edit watermark (opsional)</summary>
        <div>
          <label htmlFor={id} className="watermark-label">Teks payload</label>
          <textarea id={id} value={value} onChange={event => onChange(event.target.value)}
            disabled={disabled || !enabled} rows={2} className="watermark-textarea watermark-payload-input" spellCheck={false}
            aria-invalid={enabled && !valid} aria-describedby={`${id}-notice ${id}-counter ${id}-help`} />
          <p id={`${id}-counter`} className={valid || !enabled ? "watermark-counter" : "watermark-error"} aria-live="polite">
            UTF-8: {byteLength} / {MAX_WATERMARK_PAYLOAD_BYTES} byte
          </p>
          <p id={`${id}-help`} className={enabled && !valid ? "watermark-error" : undefined}>
            {!enabled ? "Teks tetap tersedia jika Anda mengaktifkan kembali pilihan ini."
              : !valid ? "Payload melebihi 512 byte. Kurangi teks untuk melanjutkan; teks tidak dipotong otomatis."
              : usesDefault ? <>Kosong atau hanya spasi memakai <code>{DEFAULT_WATERMARK_PAYLOAD}</code>. Penghitung menampilkan ukuran payload bawaan.</>
                : "Teks, spasi, dan baris baru dipertahankan persis. Emoji dapat memakai lebih dari satu byte."}
          </p>
          <div className="watermark-opt-out">
            <button type="button" className="watermark-button"
              disabled={disabled} onClick={() => onEnabledChange(!enabled)} aria-describedby={`${id}-risk`}>
              {enabled ? "Nonaktifkan watermark" : "Aktifkan kembali"}
            </button>
            <p id={`${id}-risk`}><Link href="/about/hidden-watermark#risiko" target="_blank" rel="noopener noreferrer" className="watermark-link">Saya memahami risikonya</Link>: pilihan ini hanya untuk pratinjau dari unggahan ini, saat fitur tersedia. Lisensi dan hak Anda tetap terpisah.</p>
          </div>
          <p role="status" className="watermark-settings-note">{!enabled ? "Pilihan nonaktif hanya tersimpan sementara di halaman ini." : ""}</p>
        </div>
      </details>
    </section>
  );
}
