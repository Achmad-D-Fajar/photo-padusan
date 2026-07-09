"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { extractStoragePath } from "@/lib/storage";
import type { Database } from "@/types/supabase";

type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];
interface EditPhotoFormProps {
  photo: Pick<PhotoRow, "id" | "user_id" | "thumbnail_url" | "caption_en" | "caption_id" | "tags_en" | "tags_id" | "created_at" | "microstock_url">;
}
type ActionStatus = "idle" | "saving-draft" | "publishing" | "deleting" | "error" | "success";

const URL_REGEX = /^https?:\/\/.+/i;
const CAPTION_MAX_LENGTH = 300;
const MAX_TAGS = 10;

function tagsToString(tags: string[] | null | undefined): string { return Array.isArray(tags) ? tags.join(", ") : ""; }
function stringToTags(value: string): string[] { return value.split(",").map((t) => t.trim()).filter((t) => t.length > 0).slice(0, MAX_TAGS); }

export default function EditPhotoForm({ photo }: EditPhotoFormProps) {
  const router = useRouter();
  const [captionId, setCaptionId] = useState(photo.caption_id || "");
  const [captionEn, setCaptionEn] = useState(photo.caption_en || "");
  const [tagsIdInput, setTagsIdInput] = useState(tagsToString(photo.tags_id));
  const [tagsEnInput, setTagsEnInput] = useState(tagsToString(photo.tags_en));
  const [microstockUrl, setMicrostockUrl] = useState(photo.microstock_url || "");
  const [currentStatus, setCurrentStatus] = useState<"draft" | "published" | "archived">(photo.microstock_url ? "published" : "draft");
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ captionId?: string; captionEn?: string; microstockUrl?: string }>({});

  const isBusy = actionStatus === "saving-draft" || actionStatus === "publishing" || actionStatus === "deleting";

  const labelClass = "label-text font-bold text-lg text-[#111111] uppercase tracking-wide";
  const subLabelClass = "label-text-alt font-bold text-[#111111] text-base";
  const inputClass = "input w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] p-4 h-auto";
  const textareaClass = "textarea w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] p-4";

  function validateCommon(): boolean {
    const errors: { captionId?: string; captionEn?: string; microstockUrl?: string } = {};
    if (captionId.trim().length === 0 && captionEn.trim().length === 0) errors.captionId = "Minimal satu bahasa caption harus diisi.";
    if (captionId.trim().length > CAPTION_MAX_LENGTH) errors.captionId = `Caption maksimal ${CAPTION_MAX_LENGTH} karakter.`;
    if (captionEn.trim().length > CAPTION_MAX_LENGTH) errors.captionEn = `Caption maksimal ${CAPTION_MAX_LENGTH} karakter.`;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSaveDraft() {
    if (!validateCommon()) { setActionStatus("error"); setMessage("Periksa error di form."); return; }
    setActionStatus("saving-draft"); setMessage("");
    try {
      const supabase = createClient() as any;
      const { error } = await supabase.from("photos").update({
        caption_id: captionId.trim() || null, caption_en: captionEn.trim() || null,
        tags_id: stringToTags(tagsIdInput), tags_en: stringToTags(tagsEnInput),
        microstock_url: microstockUrl.trim() || null, status: "draft"
      }).eq("id", photo.id);
      if (error) throw error;
      setCurrentStatus("draft"); setActionStatus("success"); setMessage("Draf berhasil disimpan.");
    } catch (err) {
      setActionStatus("error"); setMessage(err instanceof Error ? err.message : "Gagal menyimpan draf.");
    }
  }

  async function handlePublish() {
    const isCaptionValid = validateCommon();
    const errors: { captionId?: string; microstockUrl?: string } = {};
    if (microstockUrl.trim().length === 0) errors.microstockUrl = "URL Eksternal (wajib diisi untuk publikasi).";
    else if (!URL_REGEX.test(microstockUrl.trim())) errors.microstockUrl = "Format URL tidak valid (http/https).";

    if (Object.keys(errors).length > 0 || !isCaptionValid) {
      setFieldErrors(prev => ({ ...prev, ...errors }));
      setActionStatus("error"); setMessage("Periksa error di form."); return;
    }

    setActionStatus("publishing"); setMessage("");
    try {
      const supabase = createClient() as any;
      const { error } = await supabase.from("photos").update({
        caption_id: captionId.trim() || null, caption_en: captionEn.trim() || null,
        tags_id: stringToTags(tagsIdInput), tags_en: stringToTags(tagsEnInput),
        microstock_url: microstockUrl.trim(), status: "published",
      }).eq("id", photo.id);
      if (error) throw error;
      setCurrentStatus("published"); setActionStatus("success"); setMessage("Foto dipublikasikan!");
    } catch (err) {
      setActionStatus("error"); setMessage(err instanceof Error ? err.message : "Gagal mempublikasikan.");
    }
  }

  async function handleDelete() {
    if (!window.confirm("Hapus foto secara permanen?")) return;
    setActionStatus("deleting"); setMessage("");
    try {
      const supabase = createClient() as any;
      if (photo.thumbnail_url) {
        const path = extractStoragePath(photo.thumbnail_url, "thumbnails");
        if (path) await supabase.storage.from("thumbnails").remove([path]);
      }
      const { error } = await supabase.from("photos").delete().eq("id", photo.id);
      if (error) throw error;
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
            {photo.thumbnail_url ? (
              <img src={photo.thumbnail_url} alt="Thumbnail" className="w-full h-full object-cover" />
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
          <label className="label" htmlFor="microstock_url"><span className={labelClass}>URL Eksternal (Wajib untuk Publikasi)</span></label>
          <input id="microstock_url" type="url" value={microstockUrl} onChange={(e) => { setMicrostockUrl(e.target.value); setActionStatus("idle"); }} className={`${inputClass} ${fieldErrors.microstockUrl ? "border-[#882255] bg-red-50" : ""}`} placeholder="https://..." disabled={isBusy} />
          {fieldErrors.microstockUrl && <label className="label mt-1"><span className="label-text-alt text-[#882255] font-bold text-base px-2 py-1 bg-white border-2 border-[#882255]">{fieldErrors.microstockUrl}</span></label>}
        </div>

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