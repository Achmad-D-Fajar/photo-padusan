import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "@/components/dashboard/ProfileForm";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, full_name, bio, whatsapp, public_email, microstock_url, avatar_url, created_at")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return (
      <main className="container mx-auto px-4 py-12">
        <div role="alert" className="alert rounded-none border-4 border-[#111111] bg-[#882255] text-white font-bold text-lg p-6 shadow-[8px_8px_0px_#111111]">
          <span>Gagal memuat profil: {profileError?.message ?? "Profil tidak ditemukan."}</span>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="mb-12 border-b-4 border-[#111111] pb-8">
        <h1 className="font-display text-5xl font-bold uppercase tracking-tighter text-[#111111] mb-4">
          Pengaturan Profil
        </h1>
        <p className="text-xl font-bold text-[#111111] bg-white border-2 border-[#111111] px-4 py-2 shadow-[4px_4px_0px_#111111] inline-block uppercase tracking-wide">
          Kelola informasi portofolio Anda, @{profile.display_name}.
        </p>
      </div>

      <ProfileForm userId={user.id} initialProfile={profile} />
    </main>
  );
}