"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Profile {
  id: string;
  display_name: string;
  full_name: string | null;
  bio: string | null;
  whatsapp: string | null;
  public_email: string | null;
  microstock_url: string | null;
  avatar_url: string | null;
}

interface ProfileFormProps {
  userId: string;
  initialProfile: Profile;
}

export default function ProfileForm({ userId, initialProfile }: ProfileFormProps) {
  const router = useRouter();
  const supabase = createClient();

  // Menambahkan microstock_url ke state
  const [formData, setFormData] = useState({
    display_name: initialProfile.display_name || "",
    full_name: initialProfile.full_name || "",
    bio: initialProfile.bio || "",
    whatsapp: initialProfile.whatsapp || "",
    public_email: initialProfile.public_email || "",
    microstock_url: initialProfile.microstock_url || "",
  });

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialProfile.avatar_url);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Menambahkan microstock_url ke pendeteksi perubahan
  const isTextChanged = 
    formData.display_name !== initialProfile.display_name ||
    formData.full_name !== (initialProfile.full_name || "") ||
    formData.bio !== (initialProfile.bio || "") ||
    formData.whatsapp !== (initialProfile.whatsapp || "") ||
    formData.public_email !== (initialProfile.public_email || "") ||
    formData.microstock_url !== (initialProfile.microstock_url || "");
  
  const canSubmit = (isTextChanged || avatarFile !== null) && !isSubmitting;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file)); 
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      let uploadedAvatarUrl = initialProfile.avatar_url;

      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const filePath = `${userId}/avatar_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, avatarFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        uploadedAvatarUrl = publicUrl;
      }

      // Menyisipkan 'as any' untuk menghindari error type never,
      // serta memasukkan microstock_url ke payload update.
      const { error: updateError } = await (supabase.from("profiles") as any)
        .update({
          display_name: formData.display_name,
          full_name: formData.full_name,
          bio: formData.bio,
          whatsapp: formData.whatsapp,
          public_email: formData.public_email,
          microstock_url: formData.microstock_url,
          avatar_url: uploadedAvatarUrl,
        })
        .eq("id", userId);

      if (updateError) throw updateError;

      setMessage({ type: "success", text: "Profil berhasil diperbarui!" });
      setAvatarFile(null); 
      router.refresh(); 
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Terjadi kesalahan saat menyimpan profil." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "input rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold text-lg shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] w-full p-4 h-auto";
  const labelClass = "font-bold text-sm uppercase tracking-widest text-[#111111] mb-2 block";

  return (
    <form onSubmit={handleSubmit} className="space-y-12">
      
      {message && (
        <div className={`p-6 border-4 border-[#111111] shadow-[6px_6px_0px_#111111] font-bold text-lg ${message.type === 'success' ? 'bg-[#117733] text-white' : 'bg-[#882255] text-white'}`}>
          {message.text}
        </div>
      )}

      {/* Bagian Foto Profil */}
      <div className="bg-white border-4 border-[#111111] p-8 shadow-[8px_8px_0px_#111111]">
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <div className="w-32 h-32 bg-[#E5E5E5] border-4 border-[#111111] shadow-[4px_4px_0px_#111111] overflow-hidden shrink-0 flex items-center justify-center relative">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Preview Foto Profil" className="w-full h-full object-cover" />
            ) : (
              <span className="font-bold text-[#111111] text-4xl uppercase">
                {formData.display_name.charAt(0) || "?"}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3 items-center sm:items-start w-full">
            <h2 className="font-bold text-xl uppercase tracking-widest text-[#111111]">Foto Profil</h2>
            <label className="btn bg-white hover:bg-[#111111] hover:text-[#E5E5E5] text-[#111111] border-4 border-[#111111] rounded-none font-bold text-base uppercase shadow-[4px_4px_0px_#111111] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#111111] transition-all cursor-pointer">
              UBAH FOTO
              <input type="file" accept="image/png, image/jpeg, image/webp" className="hidden" onChange={handleFileChange} />
            </label>
          </div>
        </div>
      </div>

      {/* Bagian Input Teks */}
      <div className="space-y-8 border-t-4 border-[#111111] pt-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label className={labelClass}>Display Name</label>
            <input 
              type="text" 
              name="display_name" 
              value={formData.display_name} 
              onChange={handleInputChange} 
              className={`${inputClass} border-dashed`} 
              required 
            />
          </div>
          <div>
            <label className={labelClass}>Nama Lengkap</label>
            <input 
              type="text" 
              name="full_name" 
              value={formData.full_name} 
              onChange={handleInputChange} 
              className={inputClass} 
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Bio</label>
          <div className="relative">
            <textarea 
              name="bio" 
              value={formData.bio} 
              onChange={handleInputChange} 
              rows={4} 
              maxLength={500} 
              className={inputClass} 
            />
            <span className="absolute bottom-3 right-3 text-sm font-bold text-gray-500 bg-white px-1">
              {formData.bio.length}/500
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label className={labelClass}>WhatsApp Publik</label>
            <input 
              type="text" 
              name="whatsapp" 
              value={formData.whatsapp} 
              onChange={handleInputChange} 
              className={inputClass} 
            />
            <p className="text-sm font-bold mt-2">Awali dengan 62 (Tanpa +)</p>
          </div>
          <div>
            <label className={labelClass}>Email Publik</label>
            <input 
              type="email" 
              name="public_email" 
              value={formData.public_email} 
              onChange={handleInputChange} 
              className={inputClass} 
            />
          </div>
        </div>

        {/* INPUT URL DITAMBAHKAN KEMBALI DI SINI */}
        <div>
          <label className={labelClass}>URL Portofolio / Microstock</label>
          <input 
            type="url" 
            name="microstock_url" 
            value={formData.microstock_url} 
            onChange={handleInputChange} 
            placeholder="https://"
            className={inputClass} 
          />
          <p className="text-sm font-bold mt-2">Tautan untuk mendukung atau membeli resolusi tinggi karya Anda.</p>
        </div>
      </div>

      <div className="pt-8 border-t-4 border-[#111111]">
        <button 
          type="submit" 
          disabled={!canSubmit} 
          className="btn bg-[#332288] hover:bg-[#20155c] text-white border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 w-full shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[6px_6px_0px_#111111]"
        >
          {isSubmitting ? "MENYIMPAN..." : "SIMPAN PERUBAHAN"}
        </button>
      </div>
    </form>
  );
}