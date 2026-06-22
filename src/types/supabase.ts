// Tipe ini idealnya digenerate otomatis dari skema asli Supabase:
//   npx supabase gen types typescript --project-id <id> > src/types/supabase.ts
// Versi di bawah ditulis manual agar cocok dengan skema yang sudah dibuat
// (tabel `profiles` dan `photos`). Update file ini setiap kali skema berubah.

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          full_name: string | null;
          bio: string | null;
          avatar_url: string | null;
          microstock_url: string | null;
          whatsapp: string | null;
          public_email: string | null;
          other_links: any | null; // JSONB
          updated_at: string | null;
        };
        Insert: {
          id: string;
          display_name: string;
          full_name?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          microstock_url?: string | null;
          whatsapp?: string | null;
          public_email?: string | null;
          other_links?: any | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          display_name?: string;
          full_name?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          microstock_url?: string | null;
          whatsapp?: string | null;
          public_email?: string | null;
          other_links?: any | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ];
      };
      photos: {
        Row: {
          id: string;
          image_url: string;
          caption: string;
          tags: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          image_url: string;
          caption: string;
          tags?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          image_url?: string;
          caption?: string;
          tags?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}