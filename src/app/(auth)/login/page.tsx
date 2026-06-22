"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "loading" | "error";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    try {
      // Tahap 1: resolve "email atau display name" menjadi email asli.
      const resolveResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const resolveResult = await resolveResponse.json();

      if (!resolveResponse.ok || !resolveResult.success) {
        throw new Error(
          resolveResult.error || "Email/Display Name atau password salah."
        );
      }

      const resolvedEmail: string = resolveResult.data.email;

      // Tahap 2: login sesungguhnya lewat sesi bawaan Supabase.
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });

      if (signInError) {
        throw new Error("Email/Display Name atau password salah.");
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
      <h1 className="text-3xl font-bold mb-6">Login Fotografer</h1>

      <form
        onSubmit={handleSubmit}
        className="card bg-base-100 border border-base-300 shadow-md"
      >
        <div className="card-body gap-4">
          <div className="form-control">
            <label className="label" htmlFor="identifier">
              <span className="label-text">Email atau Display Name</span>
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="input input-bordered w-full"
              required
              disabled={status === "loading"}
            />
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
                Masuk...
              </>
            ) : (
              "Login"
            )}
          </button>

          <p className="text-sm text-center text-base-content/70">
            Belum punya akun?{" "}
            <a href="/register" className="link link-primary">
              Daftar
            </a>
          </p>
        </div>
      </form>
    </main>
  );
}