"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/supabase";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

interface ProfileFormProps {
  userId: string;
  initialProfile: Pick<
    ProfileRow,
    | "id"
    | "display_name"
    | "full_name"
    | "bio"
    | "whatsapp"
    | "public_email"
    | "microstock_url"
    | "created_at"
  >;
}

type Status = "idle" | "loading" | "success" | "error";

const WHATSAPP_REGEX = /^62\d{8,13}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/.+/i;
const BIO_MAX_LENGTH = 500;
const FULL_NAME_MAX_LENGTH = 100;

interface FormFields {
  full_name: string;
  bio: string;
  whatsapp: string;
  public_email: string;
  microstock_url: string;
}

function toFormFields(
  profile: ProfileFormProps["initialProfile"]
): FormFields {
  return {
    full_name: profile.full_name ?? "",
    bio: profile.bio ?? "",
    whatsapp: profile.whatsapp ?? "",
    public_email: profile.public_email ?? "",
    microstock_url: profile.microstock_url ?? "",
  };
}

function fieldsEqual(a: FormFields, b: FormFields): boolean {
  return (
    a.full_name === b.full_name &&
    a.bio === b.bio &&
    a.whatsapp === b.whatsapp &&
    a.public_email === b.public_email &&
    a.microstock_url === b.microstock_url
  );
}

export default function ProfileForm({
  userId,
  initialProfile,
}: ProfileFormProps) {
  // `confirmedFields` = state terakhir yang benar-benar tersimpan di server.
  // Dipakai untuk deteksi perubahan (dirty check) dan rollback bila update gagal.
  const [confirmedFields, setConfirmedFields] = useState<FormFields>(() =>
    toFormFields(initialProfile)
  );
  const [formFields, setFormFields] = useState<FormFields>(() =>
    toFormFields(initialProfile)
  );
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormFields, string>>
  >({});

  const isLoading = status === "loading";
  const isDirty = !fieldsEqual(formFields, confirmedFields);

  function handleChange(field: keyof FormFields, value: string) {
    setFormFields((prev) => ({ ...prev, [field]: value }));
    if (status !== "loading") {
      setStatus("idle");
      setMessage("");
    }
  }

  function handleReset() {
    setFormFields(confirmedFields);
    setFieldErrors({});
    setStatus("idle");
    setMessage("");
  }

  function validate(
    fields: FormFields
  ): Partial<Record<keyof FormFields, string>> {
    const errors: Partial<Record<keyof FormFields, string>> = {};

    if (
      fields.whatsapp.length > 0 &&
      !WHATSAPP_REGEX.test(fields.whatsapp)
    ) {
      errors.whatsapp =
        "Gunakan format internasional tanpa '+' atau '0' di depan, mis. 628123456789.";
    }

    if (
      fields.public_email.length > 0 &&
      !EMAIL_REGEX.test(fields.public_email)
    ) {
      errors.public_email = "Format email tidak valid.";
    }

    if (
      fields.microstock_url.length > 0 &&
      !URL_REGEX.test(fields.microstock_url)
    ) {
      errors.microstock_url =
        "URL harus diawali dengan http:// atau https://.";
    }

    if (fields.bio.length > BIO_MAX_LENGTH) {
      errors.bio = `Bio maksimal ${BIO_MAX_LENGTH} karakter.`;
    }

    if (fields.full_name.length > FULL_NAME_MAX_LENGTH) {
      errors.full_name = `Nama lengkap maksimal ${FULL_NAME_MAX_LENGTH} karakter.`;
    }

    return errors;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedFields: FormFields = {
      full_name: formFields.full_name.trim(),
      bio: formFields.bio.trim(),
      whatsapp: formFields.whatsapp.trim(),
      public_email: formFields.public_email.trim(),
      microstock_url: formFields.microstock_url.trim(),
    };

    const errors = validate(trimmedFields);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setStatus("error");
      setMessage("Periksa kembali isian yang ditandai di bawah.");
      return;
    }

    const previousConfirmedFields = confirmedFields;

    // Optimistic update: anggap perubahan sudah tersimpan agar form
    // langsung terasa responsif (dirty state hilang, tombol disable).
    setConfirmedFields(trimmedFields);
    setFormFields(trimmedFields);
    setStatus("loading");
    setMessage("");

    try {
      const supabase = createClient();

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: trimmedFields.full_name.length > 0 ? trimmedFields.full_name : null,
          bio: trimmedFields.bio.length > 0 ? trimmedFields.bio : null,
          whatsapp: trimmedFields.whatsapp.length > 0 ? trimmedFields.whatsapp : null,
          public_email:
            trimmedFields.public_email.length > 0
              ? trimmedFields.public_email
              : null,
          microstock_url:
            trimmedFields.microstock_url.length > 0
              ? trimmedFields.microstock_url
              : null,
        })
        .eq("id", userId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setStatus("success");
      setMessage("Profil berhasil diperbarui.");
    } catch (err) {
      // Rollback optimistic state karena request gagal, tetapi pertahankan
      // input yang sudah diketik user supaya tidak hilang dan bisa dicoba lagi.
      setConfirmedFields(previousConfirmedFields);
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Gagal memperbarui profil."
      );
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card bg-base-100 border border-base-300 shadow-md"
    >
      <div className="card-body gap-4">
        <div className="form-control">
          <label className="label" htmlFor="display_name">
            <span className="label-text">Display Name</span>
          </label>
          <input
            id="display_name"
            type="text"
            value={initialProfile.display_name}
            className="input input-bordered w-full"
            disabled
            readOnly
          />
          <label className="label">
            <span className="label-text-alt text-base-content/60">
              Display Name tidak dapat diubah pada halaman ini.
            </span>
          </label>
        </div>

        <div className="form-control">
          <label className="label" htmlFor="full_name">
            <span className="label-text">Nama Lengkap</span>
          </label>
          <input
            id="full_name"
            type="text"
            value={formFields.full_name}
            onChange={(e) => handleChange("full_name", e.target.value)}
            className={`input input-bordered w-full ${
              fieldErrors.full_name ? "input-error" : ""
            }`}
            placeholder="Nama lengkap Anda"
            maxLength={FULL_NAME_MAX_LENGTH}
            disabled={isLoading}
          />
          {fieldErrors.full_name && (
            <label className="label">
              <span className="label-text-alt text-error">
                {fieldErrors.full_name}
              </span>
            </label>
          )}
        </div>

        <div className="form-control">
          <label className="label" htmlFor="bio">
            <span className="label-text">Bio</span>
          </label>
          <textarea
            id="bio"
            value={formFields.bio}
            onChange={(e) => handleChange("bio", e.target.value)}
            className={`textarea textarea-bordered w-full ${
              fieldErrors.bio ? "textarea-error" : ""
            }`}
            rows={4}
            placeholder="Ceritakan sedikit tentang gaya fotografi Anda..."
            maxLength={BIO_MAX_LENGTH}
            disabled={isLoading}
          />
          <label className="label">
            <span className="label-text-alt text-base-content/60">
              {formFields.bio.length}/{BIO_MAX_LENGTH}
            </span>
            {fieldErrors.bio && (
              <span className="label-text-alt text-error">
                {fieldErrors.bio}
              </span>
            )}
          </label>
        </div>

        <div className="form-control">
          <label className="label" htmlFor="whatsapp">
            <span className="label-text">Nomor WhatsApp</span>
          </label>
          <input
            id="whatsapp"
            type="text"
            value={formFields.whatsapp}
            onChange={(e) =>
              handleChange("whatsapp", e.target.value.replace(/\D/g, ""))
            }
            className={`input input-bordered w-full ${
              fieldErrors.whatsapp ? "input-error" : ""
            }`}
            placeholder="628123456789"
            inputMode="numeric"
            disabled={isLoading}
          />
          <label className="label">
            <span className="label-text-alt text-base-content/60">
              Format internasional tanpa &apos;+&apos;, mis. 628123456789.
            </span>
            {fieldErrors.whatsapp && (
              <span className="label-text-alt text-error">
                {fieldErrors.whatsapp}
              </span>
            )}
          </label>
        </div>

        <div className="form-control">
          <label className="label" htmlFor="public_email">
            <span className="label-text">Email Publik</span>
          </label>
          <input
            id="public_email"
            type="email"
            value={formFields.public_email}
            onChange={(e) => handleChange("public_email", e.target.value)}
            className={`input input-bordered w-full ${
              fieldErrors.public_email ? "input-error" : ""
            }`}
            placeholder="kontak@contoh.com"
            disabled={isLoading}
          />
          <label className="label">
            <span className="label-text-alt text-base-content/60">
              Ditampilkan publik di portofolio, boleh berbeda dari email login.
            </span>
            {fieldErrors.public_email && (
              <span className="label-text-alt text-error">
                {fieldErrors.public_email}
              </span>
            )}
          </label>
        </div>

        <div className="form-control">
          <label className="label" htmlFor="microstock_url">
            <span className="label-text">URL Microstock</span>
          </label>
          <input
            id="microstock_url"
            type="url"
            value={formFields.microstock_url}
            onChange={(e) => handleChange("microstock_url", e.target.value)}
            className={`input input-bordered w-full ${
              fieldErrors.microstock_url ? "input-error" : ""
            }`}
            placeholder="https://www.shutterstock.com/g/namaanda"
            disabled={isLoading}
          />
          {fieldErrors.microstock_url && (
            <label className="label">
              <span className="label-text-alt text-error">
                {fieldErrors.microstock_url}
              </span>
            </label>
          )}
        </div>

        {status === "success" && (
          <div role="alert" className="alert alert-success">
            <span>{message}</span>
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="alert alert-error">
            <span>{message}</span>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            className="btn btn-primary flex-1"
            disabled={isLoading || !isDirty}
          >
            {isLoading ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Menyimpan...
              </>
            ) : (
              "Simpan Perubahan"
            )}
          </button>

          {isDirty && !isLoading && (
            <button
              type="button"
              onClick={handleReset}
              className="btn btn-ghost"
            >
              Batalkan
            </button>
          )}
        </div>
      </div>
    </form>
  );
}