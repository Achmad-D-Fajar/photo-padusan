import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// PERINGATAN: SERVER-ONLY. Jangan pernah diimpor dari Client Component.
// Memakai Service Role Key yang bypass RLS — hanya untuk operasi admin
// terkontrol seperti createUser, getUserById, dan deleteUser (rollback).
let adminClient: SupabaseClient<Database> | null = null;

export function createAdminClient(): SupabaseClient<Database> {
  if (adminClient) return adminClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  adminClient = createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

// ILIKE memperlakukan '%' dan '_' sebagai wildcard. Karena Display Name
// boleh mengandung '_', input pencarian harus di-escape agar tidak
// salah mencocokkan nama lain (mis. "a_b" cocok dengan "axb").
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}