"use client";

import ExtractForm from "./ExtractForm";
import { extractRealPayload } from "@/lib/real-extraction";

// Ekstraksi nyata: adapter stabil (fungsi modul) memanggil API verifikasi.
export default function RealExtractForm() {
  return <ExtractForm onExtract={extractRealPayload} requiresPassphrase />;
}