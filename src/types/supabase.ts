export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          full_name: string | null;
          bio: string | null;
          whatsapp: string | null;
          public_email: string | null;
          microstock_url: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          full_name?: string | null;
          bio?: string | null;
          whatsapp?: string | null;
          public_email?: string | null;
          microstock_url?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          full_name?: string | null;
          bio?: string | null;
          whatsapp?: string | null;
          public_email?: string | null;
          microstock_url?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      photos: {
        Row: {
          id: string;
          user_id: string | null;
          image_url: string | null;
          thumbnail_url: string | null;
          caption: string;
          tags: string[];
          microstock_url: string | null;
          status: "draft" | "published" | "archived";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          image_url?: string | null;
          thumbnail_url?: string | null;
          caption: string;
          tags?: string[];
          microstock_url?: string | null;
          status?: "draft" | "published" | "archived";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          image_url?: string | null;
          thumbnail_url?: string | null;
          caption?: string;
          tags?: string[];
          microstock_url?: string | null;
          status?: "draft" | "published" | "archived";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photos_user_id_profiles_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}