"use client";

import { useCallback, useRef, useState } from "react";
import ExtractForm from "../../../../src/components/dashboard/ExtractForm";
import type { ExtractedPayload } from "../../../../src/components/dashboard/ExtractionResult";

// Explicit test fixture. The main application never imports this file.
const payload = "  Padusan 🌿\n<script>teks biasa</script>  ";
export default function ExtractionFixture() {
  const [mode, setMode] = useState("success");
  const [mounted, setMounted] = useState(true);
  const pending = useRef<Array<() => void>>([]);
  const extract = useCallback(async (): Promise<ExtractedPayload> => {
    if (mode === "delayed") await new Promise<void>(resolve => pending.current.push(resolve));
    if (mode === "error") throw new Error("Ekstraksi gagal: fixture failure");
    return { payload, byteLength: mode === "invalid" ? 999 : new TextEncoder().encode(payload).byteLength };
  }, [mode]);
  return <>
    <h1>Pengujian komponen ekstraksi</h1>
    <label htmlFor="fixture-mode">Mode fixture</label>
    <select id="fixture-mode" value={mode} onChange={event => setMode(event.target.value)}>
      {["success", "error", "invalid", "delayed", "unavailable"].map(value => <option key={value}>{value}</option>)}
    </select>
    <button type="button" className="watermark-button" onClick={() => pending.current.splice(0).forEach(resolve => resolve())}>Selesaikan permintaan tertunda</button>
    <button type="button" className="watermark-button" onClick={() => setMounted(false)}>Lepas formulir</button>
    {mounted && <ExtractForm onExtract={mode === "unavailable" ? undefined : extract} />}
  </>;
}
