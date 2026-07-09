"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/supabase";
import AvatarUploader from "@/components/dashboard/AvatarUploader";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
interface ProfileFormProps {
  userId: string;
  initialProfile: Pick<ProfileRow, "id" | "display_name" | "full_name" | "bio" | "whatsapp" | "public_email" | "microstock_url" | "avatar_url" | "created_at">;
}

type Status = "idle" | "loading" | "success" | "error";
const WHATSAPP_REGEX = /^62\d{8,13}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/.+/i;
const BIO_MAX_LENGTH = 500;
const FULL_NAME_MAX_LENGTH = 100;

interface FormFields { full_name: string; bio: string; whatsapp: string; public_email: string; microstock_url: string; }
function toFormFields(p: ProfileFormProps["initialProfile"]): FormFields { return { full_name: p.full_name ?? "", bio: p.bio ?? "", whatsapp: p.whatsapp ?? "", public_email: p.public_email ?? "", microstock_url: p.microstock_url ?? "" }; }
function fieldsEqual(a: FormFields, b: FormFields): boolean { return a.full_name === b.full_name && a.bio === b.bio && a.whatsapp === b.whatsapp && a.public_email === b.public_email && a.microstock_url === b.microstock_url; }

export default function ProfileForm({ userId, initialProfile }: ProfileFormProps) {
  const [confirmedFields, setConfirmedFields] = useState<FormFields>(() => toFormFields(initialProfile));
  const [formFields, setFormFields] = useState<FormFields>(() => toFormFields(initialProfile));
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormFields, string>>>({});

  const isLoading = status === "loading";
  const isDirty = !fieldsEqual(formFields, confirmedFields);

  const labelClass = "label-text font-bold text-lg text-[#111111] uppercase tracking-wide";
  const subLabelClass = "label-text-alt font-bold text-[#111111] text-base";
  const inputClass = "input w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] p-4 h-auto";
  const textareaClass = "textarea w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] p-4";

  function handleChange(field: keyof FormFields, value: string) { setFormFields((prev) => ({ ...prev, [field]: value })); if (status !== "loading") { setStatus("idle"); setMessage(""); } }
  function handleReset() { setFormFields(confirmedFields); setFieldErrors({}); setStatus("idle"); setMessage(""); }

  function validate(fields: FormFields) {
    const errors: Partial<Record<keyof FormFields, string>> = {};
    if (fields.whatsapp.length > 0 && !WHATSAPP_REGEX.test(fields.whatsapp)) errors.whatsapp = "Format salah. Gunakan 62...";
    if (fields.public_email.length > 0 && !EMAIL_REGEX.test(fields.public_email)) errors.public_email = "Email tidak valid.";
    if (fields.microstock_url.length > 0 && !URL_REGEX.test(fields.microstock_url)) errors.microstock_url = "Harus diawali http/https.";
    if (fields.bio.length > BIO_MAX_LENGTH) errors.bio = `Maksimal ${BIO_MAX_LENGTH} karakter.`;
    if (fields.full_name.length > FULL_NAME_MAX_LENGTH) errors.full_name = `Maksimal ${FULL_NAME_MAX_LENGTH} karakter.`;
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedFields = { full_name: formFields.full_name.trim(), bio: formFields.bio.trim(), whatsapp: formFields.whatsapp.trim(), public_email: formFields.public_email.trim(), microstock_url: formFields.microstock_url.trim() };
    const errors = validate(trimmedFields);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) { setStatus("error"); setMessage("Periksa kembali input Anda."); return; }

    const prev = confirmedFields;
    setConfirmedFields(trimmedFields); setFormFields(trimmedFields); setStatus("loading"); setMessage("");
    try {
      const supabase = createClient() as any;
      const { error } = await supabase.from("profiles").update({
        full_name: trimmedFields.full_name || null, bio: trimmedFields.bio || null, whatsapp: trimmedFields.whatsapp || null,
        public_email: trimmedFields.public_email || null, microstock_url: trimmedFields.microstock_url || null
      }).eq("id", userId);
      if (error) throw error;
      setStatus("success"); setMessage("Profil diperbarui.");
    } catch (err) {
      setConfirmedFields(prev); setStatus("error"); setMessage(err instanceof Error ? err.message : "Gagal memperbarui.");
    }
  }

  return (
    <div className="card bg-white border-4 border-[#111111] shadow-[12px_12px_0px_#111111] rounded-none p-4 sm:p-8">
      <div className="card-body gap-8 p-0">
        <AvatarUploader userId={userId} initialAvatarUrl={initialProfile.avatar_url} fallbackLabel={initialProfile.full_name || initialProfile.display_name} />
        
        <div className="border-b-4 border-[#111111]" />

        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="form-control">
              <label className="label" htmlFor="display_name"><span className={labelClass}>Display Name</span></label>
              <input id="display_name" value={initialProfile.display_name} className={`${inputClass} bg-[#E5E5E5] text-[#111111]/70 border-dashed border-2`} disabled readOnly />
            </div>
            <div className="form-control">
              <label className="label" htmlFor="full_name"><span className={labelClass}>Nama Lengkap</span></label>
              <input id="full_name" value={formFields.full_name} onChange={(e) => handleChange("full_name", e.target.value)} className={`${inputClass} ${fieldErrors.full_name ? "border-[#882255] bg-red-50" : ""}`} disabled={isLoading} />
              {fieldErrors.full_name && <span className="label-text-alt text-[#882255] font-bold mt-2">{fieldErrors.full_name}</span>}
            </div>
          </div>

          <div className="form-control">
            <label className="label" htmlFor="bio"><span className={labelClass}>Bio</span></label>
            <textarea id="bio" value={formFields.bio} onChange={(e) => handleChange("bio", e.target.value)} className={`${textareaClass} ${fieldErrors.bio ? "border-[#882255] bg-red-50" : ""}`} rows={5} disabled={isLoading} />
            <label className="label"><span className={subLabelClass}>{formFields.bio.length}/{BIO_MAX_LENGTH}</span></label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="form-control">
              <label className="label" htmlFor="whatsapp"><span className={labelClass}>WhatsApp Publik</span></label>
              <input id="whatsapp" value={formFields.whatsapp} onChange={(e) => handleChange("whatsapp", e.target.value.replace(/\D/g, ""))} className={`${inputClass} ${fieldErrors.whatsapp ? "border-[#882255] bg-red-50" : ""}`} placeholder="62..." disabled={isLoading} />
              <label className="label"><span className={subLabelClass}>Awali dengan 62 (Tanpa +)</span></label>
            </div>
            <div className="form-control">
              <label className="label" htmlFor="public_email"><span className={labelClass}>Email Publik</span></label>
              <input id="public_email" type="email" value={formFields.public_email} onChange={(e) => handleChange("public_email", e.target.value)} className={`${inputClass} ${fieldErrors.public_email ? "border-[#882255] bg-red-50" : ""}`} disabled={isLoading} />
              {fieldErrors.public_email && <span className="label-text-alt text-[#882255] font-bold mt-2">{fieldErrors.public_email}</span>}
            </div>
          </div>

          <div className="form-control border-t-4 border-[#111111] pt-8">
            <label className="label" htmlFor="microstock_url"><span className={labelClass}>URL Eksternal Publik</span></label>
            <input id="microstock_url" type="url" value={formFields.microstock_url} onChange={(e) => handleChange("microstock_url", e.target.value)} className={`${inputClass} ${fieldErrors.microstock_url ? "border-[#882255] bg-red-50" : ""}`} disabled={isLoading} />
            {fieldErrors.microstock_url && <span className="label-text-alt text-[#882255] font-bold mt-2">{fieldErrors.microstock_url}</span>}
          </div>

          {status === "success" && <div role="alert" className="alert bg-[#44AA99] text-[#111111] border-4 border-[#111111] rounded-none font-bold text-lg p-6 shadow-[6px_6px_0px_#111111]"><span>{message}</span></div>}
          {status === "error" && <div role="alert" className="alert bg-[#882255] text-white border-4 border-[#111111] rounded-none font-bold text-lg p-6 shadow-[6px_6px_0px_#111111]"><span>{message}</span></div>}

          <div className="flex flex-col sm:flex-row gap-4 mt-6">
            <button type="submit" className="btn bg-[#117733] hover:bg-[#0e5c27] text-white border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 flex-1 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all" disabled={isLoading || !isDirty}>
              {isLoading ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
            {isDirty && !isLoading && (
              <button type="button" onClick={handleReset} className="btn bg-white hover:bg-[#E5E5E5] text-[#111111] border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 flex-1 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all">
                Batalkan
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}