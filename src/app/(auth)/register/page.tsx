"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "loading" | "error";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function handleDisplayNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Hapus spasi saat mengetik supaya tidak mungkin submit dengan spasi.
    setDisplayName(e.target.value.replace(/\s/g, ""));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    try {
      const registerResponse = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, password }),
      });

      const registerResult = await registerResponse.json();

      if (!registerResponse.ok || !registerResult.success) {
        throw new Error(registerResult.error || "Registrasi gagal.");
      }

      // Bangun sesi Supabase bawaan di client setelah akun berhasil dibuat.
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw new Error(
          "Akun berhasil dibuat, tetapi gagal login otomatis. Silakan login secara manual."
        );
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Terjadi kesalahan."
      );
    }
  }

  return (
    <main className="container mx-auto px-4 py-10 max-w-md">
      <h1 className="text-3xl font-bold mb-6">Daftar sebagai Fotografer</h1>

      <form
        onSubmit={handleSubmit}
        className="card bg-base-100 border border-base-300 shadow-md"
      >
        <div className="card-body gap-4">
          <div className="form-control">
            <label className="label" htmlFor="email">
              <span className="label-text">Email</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input input-bordered w-full"
              required
              disabled={status === "loading"}
            />
          </div>

          <div className="form-control">
            <label className="label" htmlFor="displayName">
              <span className="label-text">Display Name</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={handleDisplayNameChange}
              className="input input-bordered w-full"
              placeholder="contoh: budi_photo"
              required
              minLength={3}
              maxLength={30}
              disabled={status === "loading"}
            />
            <label className="label">
              <span className="label-text-alt text-base-content/60">
                Tanpa spasi, 3-30 karakter. Hanya huruf, angka, titik (.),
                underscore (_), atau tanda hubung (-).
              </span>
            </label>
          </div>

          <div className="form-control">
            <label className="label" htmlFor="password">
              <span className="label-text">Password</span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input input-bordered w-full"
              required
              minLength={8}
              disabled={status === "loading"}
            />
          </div>

          {status === "error" && (
            <div role="alert" className="alert alert-error">
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={status === "loading"}
          >
            {status === "loading" ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Mendaftarkan...
              </>
            ) : (
              "Daftar"
            )}
          </button>

          <p className="text-sm text-center text-base-content/70">
            Sudah punya akun?{" "}
            <a href="/login" className="link link-primary">
              Login
            </a>
          </p>
        </div>
      </form>
    </main>
  );
}