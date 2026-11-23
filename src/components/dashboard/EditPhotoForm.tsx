"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Database } from "@/types/supabase";
import { readPhotoApiData } from "@/lib/photo-api";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import { LicenseHistoryNotice, OwnerLicenseGuidance } from "@/components/shared/PhotoLicense";
import type { PhotoLicenseHistory } from "@/lib/photo-licensing";

type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];
interface EditPhotoFormProps {
  photo: Pick<
    PhotoRow,
    "id" | "user_id" | "thumbnail_url" | "caption_en" | "caption_id" | "tags_en" | "tags_id" | "created_at" | "microstock_url" | "status"
  > & {
    watermark_enabled?: boolean | null;
    license_history?: PhotoLicenseHistory | null;
  };
  hasAcceptedCurrentTerms?: boolean;
}
type ActionStatus = "idle" | "saving-draft" | "publishing" | "deleting" | "error" | "success";
type FieldErrors = {
  captionId?: string;
  captionEn?: string;
  microstockUrl?: string;
  watermarkChoice?: string;
  termsAcceptance?: string;
};

const URL_REGEX = /^https?:\/\/.+/i;
const CAPTION_MAX_LENGTH = 300;
const MAX_TAGS = 30;

function tagsToString(tags: string[] | null | undefined): string { return Array.isArray(tags) ? tags.join(", ") : ""; }
function stringToTags(value: string): string[] { return value.split(",").map((t) => t.trim()).filter((t) => t.length > 0).slice(0, MAX_TAGS); }

export default function EditPhotoForm({ photo, hasAcceptedCurrentTerms = true }: EditPhotoFormProps) {
  const router = useRouter();
  const [captionId, setCaptionId] = useState(photo.caption_id || "");
  const [captionEn, setCaptionEn] = useState(photo.caption_en || "");
  const [tagsIdInput, setTagsIdInput] = useState(tagsToString(photo.tags_id));
  const [tagsEnInput, setTagsEnInput] = useState(tagsToString(photo.tags_en));
  const [microstockUrl, setMicrostockUrl] = useState(photo.microstock_url || "");
  const [currentStatus, setCurrentStatus] = useState(photo.status);
  const [thumbnailUrl, setThumbnailUrl] = useState(photo.thumbnail_url);
  const [recordedWatermarkEnabled, setRecordedWatermarkEnabled] = useState<boolean | null>(
    typeof photo.watermark_enabled === "boolean" ? photo.watermark_enabled : null,
  );
  const [legacyWatermarkChoice, setLegacyWatermarkChoice] = useState<boolean | null>(null);
  const [acceptedCurrentTerms, setAcceptedCurrentTerms] = useState(hasAcceptedCurrentTerms);
  const [legacyTermsChoice, setLegacyTermsChoice] = useState<"accepted" | "declined" | null>(null);
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [message, setMessage] = useState("");
  const [licenseHistory, setLicenseHistory] = useState(photo.license_history);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const isBusy = actionStatus === "saving-draft" || actionStatus === "publishing" || actionStatus === "deleting";
  const needsLegacyConfirmation = recordedWatermarkEnabled === null;

  const labelClass = "label-text font-bold text-lg text-[#111111] uppercase tracking-wide";
  const subLabelClass = "label-text-alt font-bold text-[#111111] text-base";
  const inputClass = "input w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] p-4 h-auto";
  const textareaClass = "textarea w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] p-4";

  function validateCommon(): boolean {
    const errors: FieldErrors = {};
    if (captionId.trim().length === 0 && captionEn.trim().length === 0) errors.captionId = "Minimal satu bahasa caption harus diisi.";
    if (captionId.trim().length > CAPTION_MAX_LENGTH) errors.captionId = `Caption maksimal ${CAPTION_MAX_LENGTH} karakter.`;
    if (captionEn.trim().length > CAPTION_MAX_LENGTH) errors.captionEn = `Caption maksimal ${CAPTION_MAX_LENGTH} karakter.`;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitUpdate(nextStatus: "draft" | "published") {
    const payload: Record<string, unknown> = {
      caption_id: captionId.trim() || null,
      caption_en: captionEn.trim() || null,
      tags_id: stringToTags(tagsIdInput),
      tags_en: stringToTags(tagsEnInput),
      microstock_url: microstockUrl.trim() || null,
      status: nextStatus,
    };
    if (needsLegacyConfirmation && legacyWatermarkChoice !== null) {
      payload.watermark_enabled = legacyWatermarkChoice;
    }
    if (!acceptedCurrentTerms && legacyTermsChoice === "accepted") {
      payload.legalAcknowledgment = {
        accepted: true,
        termsVersion: LEGAL_DOCUMENTS.terms.version,
        privacyVersion: LEGAL_DOCUMENTS.privacy.version,
      };
    }

    const response = await fetch(`/api/photos/${photo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return readPhotoApiData<{
      id: string;
      status: "draft" | "published";
      thumbnail_url?: string | null;
      watermark_enabled?: boolean | null;
      has_accepted_current_terms?: boolean;
      license_history?: PhotoLicenseHistory | null;
    }>(response, nextStatus === "published" ? "Gagal mempublikasikan." : "Gagal menyimpan draf.");
  }

  function applyUpdatedState(updated: Awaited<ReturnType<typeof submitUpdate>>) {
    if ("license_history" in updated) setLicenseHistory(updated.license_history ?? null);
    if (typeof updated.thumbnail_url === "string" && updated.thumbnail_url) {
      setThumbnailUrl(updated.thumbnail_url);
    }
    if (typeof updated.watermark_enabled === "boolean") {
      setRecordedWatermarkEnabled(updated.watermark_enabled);
      setLegacyWatermarkChoice(null);
    }
    if (updated.has_accepted_current_terms === true) {
      setAcceptedCurrentTerms(true);
      setLegacyTermsChoice(null);
    }
  }

  async function handleSaveDraft() {
    if (!validateCommon()) { setActionStatus("error"); setMessage("Periksa error di form."); return; }
    setActionStatus("saving-draft"); setMessage("");
    try {
      const updated = await submitUpdate("draft");
      applyUpdatedState(updated);
      setCurrentStatus("draft"); setActionStatus("success"); setMessage("Draf berhasil disimpan.");
    } catch (err) {
      setActionStatus("error"); setMessage(err instanceof Error ? err.message : "Gagal menyimpan draf.");
    }
  }

  async function handlePublish() {
    const isCaptionValid = validateCommon();
    const errors: FieldErrors = {};
    const trimmedUrl = microstockUrl.trim();
    if (trimmedUrl && !URL_REGEX.test(trimmedUrl)) errors.microstockUrl = "Format URL tidak valid (http/https).";

    const isPublishingFree = !trimmedUrl;
    if (isPublishingFree && needsLegacyConfirmation && legacyWatermarkChoice === null) {
      errors.watermarkChoice = "Pilih preferensi watermark tak terlihat terlebih dahulu sebelum mempublikasikan foto gratis.";
    }
    if (isPublishingFree && !acceptedCurrentTerms && legacyTermsChoice !== "accepted") {
      errors.termsAcceptance = "Setujui Syarat & Ketentuan terbaru terlebih dahulu sebelum mempublikasikan foto unduhan gratis.";
    }

    if (Object.keys(errors).length > 0 || !isCaptionValid) {
      setFieldErrors(prev => ({ ...prev, ...errors }));
      setActionStatus("error"); setMessage("Periksa error di form."); return;
    }

    setActionStatus("publishing"); setMessage("");
    try {
      const updated = await submitUpdate("published");
      applyUpdatedState(updated);
      setCurrentStatus("published"); setActionStatus("success"); setMessage("Foto dipublikasikan!");
    } catch (err) {
      setActionStatus("error"); setMessage(err instanceof Error ? err.message : "Gagal mempublikasikan.");
    }
  }

  async function handleDelete() {
    if (!window.confirm("Hapus foto secara permanen?")) return;
    setActionStatus("deleting"); setMessage("");
    try {
      const response = await fetch(`/api/photos/${photo.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Gagal menghapus foto.");
      router.push("/dashboard"); router.refresh();
    } catch (err) {
      setActionStatus("error"); setMessage(err instanceof Error ? err.message : "Gagal menghapus.");
    }
  }

  return (
    <div className="card bg-white border-4 border-[#111111] shadow-[12px_12px_0px_#111111] rounded-none p-4 sm:p-8">
      <div className="card-body gap-8 p-0">
        
        <div className="flex flex-col sm:flex-row gap-8 items-start bg-[#E5E5E5] border-4 border-[#111111] p-6 shadow-[6px_6px_0px_#111111]">
          <div className="w-full sm:w-1/3 aspect-square border-4 border-[#111111] bg-white shadow-[4px_4px_0px_#111111] overflow-hidden">
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-[#111111]">No Image</div>
            )}
          </div>
          <div className="flex flex-col items-start gap-4 flex-1">
            <h2 className="font-display font-bold text-3xl uppercase">Status Saat Ini</h2>
            {currentStatus === "published" ? (
              <span className="badge bg-[#44AA99] text-[#111111] font-bold text-xl px-4 py-4 border-4 border-[#111111] rounded-none shadow-[2px_2px_0px_#111111]">PUBLIK</span>
            ) : currentStatus === "archived" ? (
              <span className="badge bg-[#CC6677] text-white font-bold text-xl px-4 py-4 border-4 border-[#111111] rounded-none shadow-[2px_2px_0px_#111111]">DIARSIPKAN</span>
            ) : (
              <span className="badge bg-[#E5E5E5] text-[#111111] font-bold text-xl px-4 py-4 border-4 border-[#111111] rounded-none shadow-[2px_2px_0px_#111111]">DRAF</span>
            )}
            {!needsLegacyConfirmation && (
              <p className="text-sm font-bold text-[#111111] bg-white border-2 border-[#111111] px-3 py-1">
                Watermark tak terlihat: {recordedWatermarkEnabled ? "Aktif" : "Nonaktif (opt-out)"}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="form-control">
            <label className="label" htmlFor="captionId"><span className={labelClass}>Caption (ID)</span></label>
            <textarea id="captionId" value={captionId} onChange={(e) => { setCaptionId(e.target.value); setActionStatus("idle"); }} className={`${textareaClass} ${fieldErrors.captionId ? "border-[#882255] bg-red-50" : ""}`} rows={4} maxLength={CAPTION_MAX_LENGTH} disabled={isBusy} />
            <label className="label"><span className={subLabelClass}>{captionId.length}/{CAPTION_MAX_LENGTH}</span> {fieldErrors.captionId && <span className="label-text-alt text-[#882255] font-bold">{fieldErrors.captionId}</span>}</label>
          </div>
          <div className="form-control">
            <label className="label" htmlFor="captionEn"><span className={labelClass}>Caption (EN)</span></label>
            <textarea id="captionEn" value={captionEn} onChange={(e) => { setCaptionEn(e.target.value); setActionStatus("idle"); }} className={`${textareaClass} ${fieldErrors.captionEn ? "border-[#882255] bg-red-50" : ""}`} rows={4} maxLength={CAPTION_MAX_LENGTH} disabled={isBusy} />
            <label className="label"><span className={subLabelClass}>{captionEn.length}/{CAPTION_MAX_LENGTH}</span> {fieldErrors.captionEn && <span className="label-text-alt text-[#882255] font-bold">{fieldErrors.captionEn}</span>}</label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="form-control">
            <label className="label" htmlFor="tagsId"><span className={labelClass}>Tags (ID)</span></label>
            <input id="tagsId" value={tagsIdInput} onChange={(e) => { setTagsIdInput(e.target.value); setActionStatus("idle"); }} className={inputClass} disabled={isBusy} />
            <label className="label"><span className={subLabelClass}>Pisahkan dengan koma (maks {MAX_TAGS}).</span></label>
          </div>
          <div className="form-control">
            <label className="label" htmlFor="tagsEn"><span className={labelClass}>Tags (EN)</span></label>
            <input id="tagsEn" value={tagsEnInput} onChange={(e) => { setTagsEnInput(e.target.value); setActionStatus("idle"); }} className={inputClass} disabled={isBusy} />
            <label className="label"><span className={subLabelClass}>Pisahkan dengan koma (maks {MAX_TAGS}).</span></label>
          </div>
        </div>

        <div className="form-control border-t-4 border-[#111111] pt-8">
          <label className="label" htmlFor="microstock_url"><span className={labelClass}>URL Eksternal (Opsional)</span></label>
          <OwnerLicenseGuidance external={Boolean(microstockUrl.trim())} />
          <LicenseHistoryNotice photo={{ ...photo, license_history: licenseHistory }} />
          <input id="microstock_url" type="url" value={microstockUrl} onChange={(e) => { setMicrostockUrl(e.target.value); setActionStatus("idle"); }} className={`${inputClass} ${fieldErrors.microstockUrl ? "border-[#882255] bg-red-50" : ""}`} placeholder="https://..." disabled={isBusy} />
          {fieldErrors.microstockUrl && <label className="label mt-1"><span className="label-text-alt text-[#882255] font-bold text-base px-2 py-1 bg-white border-2 border-[#882255]">{fieldErrors.microstockUrl}</span></label>}
        </div>

        {(needsLegacyConfirmation || !acceptedCurrentTerms) && (
          <div
            data-testid="legacy-watermark-confirmation"
            className="border-4 border-[#111111] bg-[#F7F5EE] p-5 shadow-[6px_6px_0px_#111111] space-y-4"
          >
            {needsLegacyConfirmation && (
              <>
                <div className="space-y-1">
                  <h3 className="font-display font-bold text-xl uppercase text-[#111111]">
                    Konfirmasi Watermark Tak Terlihat (Foto Lama)
                  </h3>
                  <p className="text-sm font-medium text-[#111111]">
                    Preferensi watermark foto ini belum tercatat. Padustock tidak menganggap foto lama otomatis disetujui.
                    Konfirmasikan pilihan Anda sebelum mempublikasikan unduhan gratis (atau simpan untuk dicatat pada draf).{" "}
                    <Link
                      href="/about/hidden-watermark"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-bold"
                    >
                      Pelajari watermark tak terlihat
                    </Link>
                    .
                  </p>
                </div>

                <fieldset className="space-y-2" disabled={isBusy}>
                  <legend className="text-sm font-bold uppercase text-[#111111]">
                    Pilihan Watermark Foto Ini
                  </legend>
                  <label className="flex items-start gap-3 cursor-pointer text-sm font-bold text-[#111111]">
                    <input
                      type="radio"
                      name="legacy_watermark_enabled"
                      value="enabled"
                      checked={legacyWatermarkChoice === true}
                      onChange={() => {
                        setLegacyWatermarkChoice(true);
                        setFieldErrors(prev => ({ ...prev, watermarkChoice: undefined }));
                        setActionStatus("idle");
                      }}
                      className="radio radio-sm border-2 border-[#111111] mt-0.5 shrink-0"
                    />
                    <span>Aktifkan watermark tak terlihat pada pratinjau dan salinan unduhan gratis</span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer text-sm font-bold text-[#111111]">
                    <input
                      type="radio"
                      name="legacy_watermark_enabled"
                      value="disabled"
                      checked={legacyWatermarkChoice === false}
                      onChange={() => {
                        setLegacyWatermarkChoice(false);
                        setFieldErrors(prev => ({ ...prev, watermarkChoice: undefined }));
                        setActionStatus("idle");
                      }}
                      className="radio radio-sm border-2 border-[#111111] mt-0.5 shrink-0"
                    />
                    <span>Jangan tanamkan watermark tak terlihat (opt-out)</span>
                  </label>
                  {fieldErrors.watermarkChoice && (
                    <p className="text-sm font-bold text-[#882255] bg-white border-2 border-[#882255] px-2 py-1">
                      {fieldErrors.watermarkChoice}
                    </p>
                  )}
                </fieldset>
              </>
            )}

            {!acceptedCurrentTerms && (
              <fieldset
                className={`space-y-2 ${needsLegacyConfirmation ? "border-t-2 border-[#111111] pt-4" : ""}`}
                disabled={isBusy}
              >
                <legend className="text-sm font-bold uppercase text-[#111111]">
                  Persetujuan Dokumen Terbaru ({LEGAL_DOCUMENTS.terms.version})
                </legend>
                <p className="text-sm text-[#111111]">
                  Akun Anda belum mencatat persetujuan{" "}
                  <Link href={LEGAL_DOCUMENTS.terms.href} target="_blank" rel="noopener noreferrer" className="underline font-bold">
                    Syarat &amp; Ketentuan ({LEGAL_DOCUMENTS.terms.version})
                  </Link>{" "}
                  dan{" "}
                  <Link href={LEGAL_DOCUMENTS.privacy.href} target="_blank" rel="noopener noreferrer" className="underline font-bold">
                    Kebijakan Privasi ({LEGAL_DOCUMENTS.privacy.version})
                  </Link>{" "}
                  yang mencakup salinan unduhan gratis ber-watermark.
                </p>
                <label className="flex items-start gap-3 cursor-pointer text-sm font-bold text-[#111111]">
                  <input
                    type="radio"
                    name="legacy_terms_acceptance"
                    value="accepted"
                    checked={legacyTermsChoice === "accepted"}
                    onChange={() => {
                      setLegacyTermsChoice("accepted");
                      setFieldErrors(prev => ({ ...prev, termsAcceptance: undefined }));
                      setActionStatus("idle");
                    }}
                    className="radio radio-sm border-2 border-[#111111] mt-0.5 shrink-0"
                  />
                  <span>Saya menyetujui Syarat &amp; Ketentuan dan telah membaca Kebijakan Privasi terbaru</span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer text-sm font-bold text-[#111111]">
                  <input
                    type="radio"
                    name="legacy_terms_acceptance"
                    value="declined"
                    checked={legacyTermsChoice === "declined"}
                    onChange={() => {
                      setLegacyTermsChoice("declined");
                      setActionStatus("idle");
                    }}
                    className="radio radio-sm border-2 border-[#111111] mt-0.5 shrink-0"
                  />
                  <span>Belum menyetujui sekarang</span>
                </label>
                {fieldErrors.termsAcceptance && (
                  <p className="text-sm font-bold text-[#882255] bg-white border-2 border-[#882255] px-2 py-1">
                    {fieldErrors.termsAcceptance}
                  </p>
                )}
              </fieldset>
            )}
          </div>
        )}

        {actionStatus === "success" && <div role="alert" className="alert bg-[#44AA99] text-[#111111] border-4 border-[#111111] rounded-none font-bold text-lg p-6 shadow-[6px_6px_0px_#111111]"><span>{message}</span></div>}
        {actionStatus === "error" && <div role="alert" className="alert bg-[#882255] text-white border-4 border-[#111111] rounded-none font-bold text-lg p-6 shadow-[6px_6px_0px_#111111]"><span>{message}</span></div>}

        <div className="flex flex-col xl:flex-row gap-4 mt-4">
          <button type="button" onClick={handleSaveDraft} className="btn bg-white hover:bg-[#E5E5E5] text-[#111111] border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 flex-1 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all" disabled={isBusy}>
            {actionStatus === "saving-draft" ? "Menyimpan..." : "Simpan Draf"}
          </button>
          <button type="button" onClick={handlePublish} className="btn bg-[#117733] hover:bg-[#0e5c27] text-[#E5E5E5] border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 flex-1 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all" disabled={isBusy}>
            {actionStatus === "publishing" ? "Memproses..." : "Publikasikan"}
          </button>
          <button type="button" onClick={handleDelete} className="btn bg-[#882255] hover:bg-[#6a1a41] text-[#E5E5E5] border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 flex-1 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all" disabled={isBusy}>
            {actionStatus === "deleting" ? "Menghapus..." : "Hapus Foto"}
          </button>
        </div>
      </div>
    </div>
  );
}
