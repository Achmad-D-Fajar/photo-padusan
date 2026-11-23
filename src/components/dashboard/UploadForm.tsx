"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MAX_PHOTO_SIZE_MB, PHOTO_ACCEPT, PHOTO_UPLOAD_BUCKET, validatePhotoFile } from "@/lib/photo-upload";
import { readPhotoApiData, readPhotoPreview, storageUploadError } from "@/lib/photo-api";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import type { GeminiBilingualResult } from "@/lib/server/gemini-analysis";
import { OwnerLicenseGuidance } from "@/components/shared/PhotoLicense";
import WatermarkPayloadField from "./WatermarkPayloadField";
import { watermarkPayload } from "@/lib/watermark-payload";

const MAX_CONTEXT_LEN = 300;

interface EditableAnalysis { captionEn: string; captionId: string; tagsEnInput: string; tagsIdInput: string; }
type Phase = "compose" | "preparing" | "analyzing" | "review" | "saving";

function tagsToInput(tags: string[]): string { return tags.join(", "); }
function inputToTags(input: string): string[] { return input.split(",").map((t) => t.trim().slice(0, 64)).filter((t) => t.length > 0).slice(0, 30); }

async function discardUpload(path: string) {
  await fetch("/api/photos/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }), keepalive: true }).catch(() => undefined);
}

interface UploadFormProps {
  hasAcceptedCurrentTerms?: boolean;
}

export default function UploadForm({ hasAcceptedCurrentTerms = true }: UploadFormProps = {}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPathRef = useRef<string | null>(null);
  const reviewDialogRef = useRef<HTMLDialogElement>(null);

  const [useAI, setUseAI] = useState(false);
  const [wantsMicrostockLink, setWantsMicrostockLink] = useState(true);

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
  const [payloadInput, setPayloadInput] = useState("");
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [termsChoice, setTermsChoice] = useState<"accepted" | "declined" | null>(null);
  const payloadValid = !watermarkEnabled || watermarkPayload(payloadInput).valid;
  const reviewOpen = phase === "review" || (phase === "saving" && useAI && !!editableAnalysis);

  useEffect(() => {
    if (reviewOpen) reviewDialogRef.current?.showModal();
  }, [reviewOpen]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  useEffect(() => () => {
    if (uploadPathRef.current) void discardUpload(uploadPathRef.current);
  }, []);

  async function stagePhoto(file: File): Promise<string> {
    const response = await fetch("/api/photos/upload", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
    });
    const { path, token, contentType } = await readPhotoApiData<{ path: string; token: string; contentType: string }>(response, "Gagal menyiapkan unggahan.");
    try {
      const supabase = createClient();
      // storage-js uses a File's MIME type in multipart uploads, ignoring the
      // contentType option. Normalize it for HEIC or JPEG files with empty MIME.
      const upload = new Blob([file], { type: contentType });
      const { error } = await supabase.storage.from(PHOTO_UPLOAD_BUCKET).uploadToSignedUrl(path, token, upload, { contentType });
      if (error) throw error;
      return path;
    } catch (error) { await discardUpload(path); throw storageUploadError(error); }
  }

  async function ensureUpload(): Promise<string> {
    if (!uploadPathRef.current) uploadPathRef.current = await stagePhoto(originalFile!);
    return uploadPathRef.current;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (uploadPathRef.current) void discardUpload(uploadPathRef.current);
    uploadPathRef.current = null;
    setOriginalFile(null); setPreviewUrl(null); setOriginalSize(null);
    setEditableAnalysis(null);
    setPhase("compose");
    setErrorMessage("");
    if (!file) return;
    const validationError = validatePhotoFile(file);
    if (validationError) { setErrorMessage(validationError); return; }
    setPhase("preparing");
    try {
      const path = await stagePhoto(file);
      uploadPathRef.current = path;
      const response = await fetch("/api/photos/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }),
      });
      setPreviewUrl(URL.createObjectURL(await readPhotoPreview(response)));
      setOriginalFile(file); setOriginalSize(file.size);
    } catch (error) {
      if (uploadPathRef.current) void discardUpload(uploadPathRef.current);
      uploadPathRef.current = null;
      setErrorMessage(error instanceof Error ? error.message : "Gagal menyiapkan gambar.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally { setPhase("compose"); }
  }

  function buildBaseFormData(captionEn: string, captionId: string, tagsEn: string[], tagsId: string[]) {
    const publishDirectly = !wantsMicrostockLink;
    return {
      caption_en: captionEn.trim(),
      caption_id: captionId.trim(),
      tags_en: tagsEn,
      tags_id: tagsId,
      publish_directly: publishDirectly,
      watermark_enabled: watermarkEnabled,
      ...(watermarkEnabled ? { watermark_payload: payloadInput } : {}),
      ...(publishDirectly && !hasAcceptedCurrentTerms && termsChoice === "accepted"
        ? {
            legalAcknowledgment: {
              accepted: true,
              termsVersion: LEGAL_DOCUMENTS.terms.version,
              privacyVersion: LEGAL_DOCUMENTS.privacy.version,
            },
          }
        : {}),
    };
  }

  async function postToDraftRoute(data: ReturnType<typeof buildBaseFormData>) {
    const path = await ensureUpload();
    try {
      const res = await fetch("/api/photos/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, path }) });
      await readPhotoApiData(res, "Gagal menyimpan foto.");
      uploadPathRef.current = null;
    } catch (error) {
      void discardUpload(path);
      uploadPathRef.current = null;
      throw error;
    }
  }

  async function handleManualSubmit() {
    if (!originalFile) return;
    if (!payloadValid) { setErrorMessage("Kurangi payload hingga maksimal 512 byte."); return; }
    if (!manualCaption.trim()) { setErrorMessage("Caption tidak boleh kosong."); return; }
    if (!wantsMicrostockLink && !hasAcceptedCurrentTerms && termsChoice !== "accepted") {
      setErrorMessage("Setujui Syarat & Ketentuan terbaru terlebih dahulu sebelum mempublikasikan foto unduhan gratis.");
      return;
    }
    setPhase("saving"); setErrorMessage("");

    try {
      const parsedTagsId = inputToTags(manualTagsInput);
      const transRes = await fetch("/api/photos/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption_id: manualCaption, tags_id: parsedTagsId }),
      });
      const transData = await readPhotoApiData<{ caption_en: string; tags_en: string[] }>(transRes, "Gagal menerjemahkan teks.");
      const fd = buildBaseFormData(transData.caption_en, manualCaption, transData.tags_en, parsedTagsId);
      await postToDraftRoute(fd);
      router.push("/dashboard"); router.refresh();
    } catch (err) {
      setPhase("compose"); setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan.");
    }
  }

  async function runAnalysis() {
    if (!originalFile) return;
    if (!payloadValid) { setErrorMessage("Kurangi payload hingga maksimal 512 byte."); return; }
    setPhase("analyzing"); setErrorMessage("");

    try {
      const path = await ensureUpload();
      const res = await fetch("/api/photos/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, description: aiContext.trim() }) });
      const data = await readPhotoApiData<GeminiBilingualResult>(res, "Analisis gambar gagal.");
      setEditableAnalysis({ captionEn: data.caption_en, captionId: data.caption_id, tagsEnInput: tagsToInput(data.tags_en), tagsIdInput: tagsToInput(data.tags_id) });
      setPhase("review");
    } catch (err) {
      setPhase("compose"); setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi.");
    }
  }

  async function handleSaveDraft() {
    if (!originalFile || !editableAnalysis) return;
    if (!payloadValid) { setErrorMessage("Kurangi payload hingga maksimal 512 byte."); return; }
    if (!wantsMicrostockLink && !hasAcceptedCurrentTerms && termsChoice !== "accepted") {
      setErrorMessage("Setujui Syarat & Ketentuan terbaru terlebih dahulu sebelum mempublikasikan foto unduhan gratis.");
      return;
    }
    setPhase("saving"); setErrorMessage("");

    try {
      const fd = buildBaseFormData(editableAnalysis.captionEn, editableAnalysis.captionId, inputToTags(editableAnalysis.tagsEnInput), inputToTags(editableAnalysis.tagsIdInput));
      await postToDraftRoute(fd);
      router.push("/dashboard"); router.refresh();
    } catch (err) {
      setPhase("review"); setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi.");
    }
  }

  async function handleCopy(text: string, fieldKey: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField((prev) => (prev === fieldKey ? null : prev)), 1500);
    } catch { }
  }

  const isBusy = phase === "preparing" || phase === "analyzing" || phase === "saving";
  const saveActionLabel = wantsMicrostockLink ? "Simpan sebagai Draf" : "Publikasikan Sekarang";

  const inputClass = "file-input file-input-bordered w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] text-lg font-bold h-16 shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99]";
  const textInputClass = "input input-bordered w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] text-lg font-bold shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] p-4 h-auto";
  const textareaClass = "textarea textarea-bordered w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] text-lg font-bold shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] p-4";
  const labelClass = "label-text font-bold text-xl text-[#111111] uppercase tracking-wide whitespace-normal break-words";
  const subLabelClass = "label-text-alt font-bold text-[#111111] text-base whitespace-normal break-words";
  const primaryBtnClass = "btn bg-[#117733] hover:bg-[#0e5c27] text-[#E5E5E5] border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all";

  return (
    <>
      <div inert={reviewOpen} className="card bg-white border-4 border-[#111111] shadow-[12px_12px_0px_#111111] rounded-none p-4 sm:p-8">
        <div className="card-body gap-8 p-0">
          <div className="form-control">
            <label className="label items-start p-0 mb-2" htmlFor="file-input">
              <span className={labelClass}>Pilih gambar (maks. {MAX_PHOTO_SIZE_MB} MB)</span>
            </label>
            <input id="file-input" ref={fileInputRef} type="file" accept={PHOTO_ACCEPT} onChange={handleFileChange} className={inputClass} disabled={isBusy} />
            {phase === "preparing" && <p role="status" className="font-bold mt-4">Menyiapkan gambar dan pratinjau…</p>}
          </div>

          {previewUrl && originalFile && (
            <div className="bg-[#E5E5E5] border-4 border-[#111111] p-6 shadow-[6px_6px_0px_#111111]">
              <div className="overflow-hidden border-4 border-[#111111] aspect-square w-full max-w-sm mx-auto bg-white shadow-[4px_4px_0px_#111111]">
                <img src={previewUrl} alt="Pratinjau" className="w-full h-full object-cover" />
              </div>
              {originalSize !== null && (
                <p className="text-lg font-bold text-center text-[#111111] mt-6 uppercase">
                  Ukuran Asli: {(originalSize / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </div>
          )}

          <div className="border-b-4 border-[#111111] w-full" />

          <div className="form-control bg-[#E5E5E5] border-4 border-[#111111] p-6 shadow-[4px_4px_0px_#111111]">
            <label className="label cursor-pointer justify-start gap-4 p-0 items-start">
              <input type="checkbox" checked={useAI} onChange={(e) => { setUseAI(e.target.checked); setErrorMessage(""); }} className="checkbox rounded-none border-4 border-[#111111] w-8 h-8 focus:ring-4 focus:ring-[#44AA99] shrink-0 mt-0.5" disabled={isBusy} />
              <span className="font-display font-bold text-2xl text-[#111111] uppercase tracking-tight whitespace-normal break-words leading-tight">Gunakan Bantuan AI</span>
            </label>
          </div>

          {!useAI && (
            <div className="space-y-6">
              <div className="form-control">
                <label className="label items-start p-0 mb-2" htmlFor="manual-caption"><span className={labelClass}>Caption Manual</span></label>
                <textarea id="manual-caption" value={manualCaption} onChange={(e) => setManualCaption(e.target.value)} className={textareaClass} rows={4} maxLength={300} placeholder="Tulis deskripsi..." disabled={isBusy} />
              </div>
              <div className="form-control">
                <label className="label items-start p-0 mb-2" htmlFor="manual-tags"><span className={labelClass}>Tags Manual</span></label>
                <input id="manual-tags" type="text" value={manualTagsInput} onChange={(e) => setManualTagsInput(e.target.value)} className={textInputClass} placeholder="sawah, desa, pagi" disabled={isBusy} />
                <label className="label p-0 mt-2"><span className={subLabelClass}>Pisahkan tag dengan koma.</span></label>
              </div>
            </div>
          )}

          {useAI && (
            <div className="form-control">
              <label className="label items-start p-0 mb-2" htmlFor="ai-context"><span className={labelClass}>Konteks Spesifik (Opsional)</span></label>
              <textarea id="ai-context" value={aiContext} onChange={(e) => setAiContext(e.target.value.slice(0, MAX_CONTEXT_LEN))} className={textareaClass} rows={4} placeholder="Misal: 'Ini adalah upacara adat di desa...'" disabled={isBusy} maxLength={MAX_CONTEXT_LEN} />
              <label className="label p-0 mt-2"><span className={subLabelClass}>Karakter: {aiContext.length}/{MAX_CONTEXT_LEN}</span></label>
            </div>
          )}

          <div className="border-b-4 border-[#111111] w-full" />

          <div className="form-control bg-[#88CCEE] border-4 border-[#111111] p-4 sm:p-6 shadow-[4px_4px_0px_#111111]">
            <label className="label cursor-pointer justify-start gap-3 sm:gap-4 p-0 items-start">
              <input type="checkbox" checked={wantsMicrostockLink} onChange={(e) => setWantsMicrostockLink(e.target.checked)} className="checkbox rounded-none border-4 border-[#111111] w-8 h-8 focus:ring-4 focus:ring-[#111111] shrink-0 mt-0.5" disabled={isBusy} />
              <span className="font-bold text-lg sm:text-xl text-[#111111] uppercase whitespace-normal break-words leading-tight">Saya akan menambahkan link Eksternal</span>
            </label>
            <p className="text-base sm:text-lg font-bold text-[#111111] mt-4 leading-snug whitespace-normal break-words">
              {wantsMicrostockLink ? "Akan disimpan sebagai DRAF sampai tautan ditambahkan dan foto dipublikasikan di halaman Edit." : "Akan dipublikasikan GRATIS saat Anda menyimpan."}
            </p>
            <OwnerLicenseGuidance external={wantsMicrostockLink} />
            {!wantsMicrostockLink && !hasAcceptedCurrentTerms && (
              <fieldset className="mt-4 border-t-2 border-[#111111] pt-4 space-y-2" disabled={isBusy}>
                <legend className="text-sm font-bold uppercase text-[#111111]">
                  Persetujuan Dokumen Terbaru ({LEGAL_DOCUMENTS.terms.version})
                </legend>
                <p className="text-sm font-medium text-[#111111]">
                  Publikasi unduhan gratis memerlukan persetujuan{" "}
                  <Link href={LEGAL_DOCUMENTS.terms.href} target="_blank" rel="noopener noreferrer" className="underline font-bold">
                    Syarat &amp; Ketentuan ({LEGAL_DOCUMENTS.terms.version})
                  </Link>{" "}
                  dan{" "}
                  <Link href={LEGAL_DOCUMENTS.privacy.href} target="_blank" rel="noopener noreferrer" className="underline font-bold">
                    Kebijakan Privasi ({LEGAL_DOCUMENTS.privacy.version})
                  </Link>
                  .
                </p>
                <label className="flex items-start gap-3 cursor-pointer text-sm font-bold text-[#111111]">
                  <input
                    type="radio"
                    name="upload_terms_acceptance"
                    value="accepted"
                    checked={termsChoice === "accepted"}
                    onChange={() => { setTermsChoice("accepted"); setErrorMessage(""); }}
                    className="radio radio-sm border-2 border-[#111111] mt-0.5 shrink-0"
                  />
                  <span>Saya menyetujui Syarat &amp; Ketentuan dan telah membaca Kebijakan Privasi terbaru</span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer text-sm font-bold text-[#111111]">
                  <input
                    type="radio"
                    name="upload_terms_acceptance"
                    value="declined"
                    checked={termsChoice === "declined"}
                    onChange={() => setTermsChoice("declined")}
                    className="radio radio-sm border-2 border-[#111111] mt-0.5 shrink-0"
                  />
                  <span>Belum menyetujui sekarang</span>
                </label>
              </fieldset>
            )}
          </div>

          {errorMessage && phase === "compose" && (
            <div role="alert" className="alert rounded-none border-4 border-[#111111] bg-[#882255] text-white font-bold text-lg p-6 shadow-[6px_6px_0px_#111111]">
              <span>{errorMessage}</span>
            </div>
          )}

          <WatermarkPayloadField value={payloadInput} onChange={setPayloadInput} enabled={watermarkEnabled} onEnabledChange={setWatermarkEnabled} disabled={isBusy} />

          {useAI ? (
            <button type="button" onClick={runAnalysis} className={primaryBtnClass} disabled={!originalFile || isBusy || !payloadValid}>
              {phase === "analyzing" ? "Sedang Menganalisis..." : "JALANKAN ANALISIS AI"}
            </button>
          ) : (
            <button type="button" onClick={handleManualSubmit} className={primaryBtnClass} disabled={!originalFile || isBusy || !payloadValid}>
              {phase === "saving" ? "Menyimpan..." : saveActionLabel}
            </button>
          )}
        </div>
      </div>

      {reviewOpen && editableAnalysis && (
        <dialog ref={reviewDialogRef} aria-labelledby="ai-review-title" onCancel={event => { event.preventDefault(); if (phase !== "saving") setPhase("compose"); }} className="modal bg-black/60 backdrop-blur-sm">
          <div className="modal-box max-w-3xl w-full rounded-none border-4 border-[#111111] bg-white p-6 sm:p-10 shadow-[16px_16px_0px_#111111]">
            <h3 id="ai-review-title" className="font-display font-bold text-3xl sm:text-4xl uppercase border-b-4 border-[#111111] pb-4 mb-6">Tinjau & Edit AI</h3>
            
            <div className="flex flex-col gap-8">
              <div className="form-control">
                <label className="label items-end p-0 mb-2" htmlFor="edit-caption-en">
                  <span className={labelClass}>Caption (English)</span>
                  <button type="button" onClick={() => handleCopy(editableAnalysis.captionEn, "caption_en")} className="btn bg-transparent border-2 border-[#111111] rounded-none shadow-[2px_2px_0px_#111111] hover:bg-[#111111] hover:text-[#E5E5E5] font-bold h-10 min-h-0" disabled={phase === "saving"}>
                    {copiedField === "caption_en" ? "✓ DISALIN" : "SALIN"}
                  </button>
                </label>
                <textarea id="edit-caption-en" value={editableAnalysis.captionEn} onChange={(e) => setEditableAnalysis((prev) => prev ? { ...prev, captionEn: e.target.value } : prev)} className={textareaClass} rows={3} maxLength={300} disabled={phase === "saving"} />
              </div>

              <div className="form-control">
                <label className="label items-end p-0 mb-2" htmlFor="edit-caption-id">
                  <span className={labelClass}>Caption (Indonesia)</span>
                  <button type="button" onClick={() => handleCopy(editableAnalysis.captionId, "caption_id")} className="btn bg-transparent border-2 border-[#111111] rounded-none shadow-[2px_2px_0px_#111111] hover:bg-[#111111] hover:text-[#E5E5E5] font-bold h-10 min-h-0" disabled={phase === "saving"}>
                    {copiedField === "caption_id" ? "✓ DISALIN" : "SALIN"}
                  </button>
                </label>
                <textarea id="edit-caption-id" value={editableAnalysis.captionId} onChange={(e) => setEditableAnalysis((prev) => prev ? { ...prev, captionId: e.target.value } : prev)} className={textareaClass} rows={3} maxLength={300} disabled={phase === "saving"} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="form-control">
                  <label className="label items-end p-0 mb-2" htmlFor="edit-tags-en">
                    <span className={labelClass}>Tags (EN)</span>
                    <button type="button" onClick={() => handleCopy(editableAnalysis.tagsEnInput, "tags_en")} className="btn bg-transparent border-2 border-[#111111] rounded-none shadow-[2px_2px_0px_#111111] hover:bg-[#111111] hover:text-[#E5E5E5] font-bold h-10 min-h-0" disabled={phase === "saving"}>
                      {copiedField === "tags_en" ? "✓ DISALIN" : "SALIN"}
                    </button>
                  </label>
                  <textarea id="edit-tags-en" value={editableAnalysis.tagsEnInput} onChange={(e) => setEditableAnalysis((prev) => prev ? { ...prev, tagsEnInput: e.target.value } : prev)} className={textareaClass} rows={4} disabled={phase === "saving"} />
                </div>
                <div className="form-control">
                  <label className="label items-end p-0 mb-2" htmlFor="edit-tags-id">
                    <span className={labelClass}>Tags (ID)</span>
                    <button type="button" onClick={() => handleCopy(editableAnalysis.tagsIdInput, "tags_id")} className="btn bg-transparent border-2 border-[#111111] rounded-none shadow-[2px_2px_0px_#111111] hover:bg-[#111111] hover:text-[#E5E5E5] font-bold h-10 min-h-0" disabled={phase === "saving"}>
                      {copiedField === "tags_id" ? "✓ DISALIN" : "SALIN"}
                    </button>
                  </label>
                  <textarea id="edit-tags-id" value={editableAnalysis.tagsIdInput} onChange={(e) => setEditableAnalysis((prev) => prev ? { ...prev, tagsIdInput: e.target.value } : prev)} className={textareaClass} rows={4} disabled={phase === "saving"} />
                </div>
              </div>
            </div>

            {errorMessage && (
              <div role="alert" className="alert rounded-none border-4 border-[#111111] bg-[#882255] text-white font-bold text-lg p-6 shadow-[6px_6px_0px_#111111] mt-8">
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="mt-8"><WatermarkPayloadField value={payloadInput} onChange={setPayloadInput} enabled={watermarkEnabled} onEnabledChange={setWatermarkEnabled} disabled={phase === "saving"} /></div>

            <div className="modal-action flex-col sm:flex-row gap-4 mt-10">
              <button type="button" onClick={() => { setPhase("compose"); setErrorMessage(""); }} className="btn bg-[#E5E5E5] hover:bg-[#111111] hover:text-white text-[#111111] border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 shadow-[4px_4px_0px_#111111]" disabled={phase === "saving"}>
                UBAH GAMBAR
              </button>
              <button type="button" onClick={runAnalysis} className="btn bg-transparent hover:bg-[#E5E5E5] text-[#111111] border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 shadow-[4px_4px_0px_#111111]" disabled={phase === "saving" || !payloadValid}>
                ULANGI AI
              </button>
              <button type="button" onClick={handleSaveDraft} className={`${primaryBtnClass} flex-1`} disabled={phase === "saving" || !payloadValid}>
                {phase === "saving" ? "MENYIMPAN..." : saveActionLabel}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
