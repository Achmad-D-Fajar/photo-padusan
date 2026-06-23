import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "@/components/dashboard/ProfileForm";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, display_name, full_name, bio, whatsapp, public_email, microstock_url, created_at"
    )
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return (
      <main className="container mx-auto px-4 py-10 max-w-2xl">
        <div role="alert" className="alert alert-error">
          <span>
            Gagal memuat profil:{" "}
            {profileError?.message ?? "Profil tidak ditemukan."}
          </span>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-10 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Pengaturan Profil</h1>
        <p className="text-base-content/70 mt-1">
          Kelola informasi publik yang ditampilkan pada portofolio Anda,{" "}
          @{profile.display_name}.
        </p>
      </div>

      <ProfileForm userId={user.id} initialProfile={profile} />
    </main>
  );
}