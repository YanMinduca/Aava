export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      church_role_departments: {
        Row: {
          department_id: string
          role_id: string
        }
        Insert: {
          department_id: string
          role_id: string
        }
        Update: {
          department_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_role_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_role_departments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "church_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      church_roles: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          is_leadership: boolean
          is_system: boolean
          name: string
          permissions: string[]
          scope: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_leadership?: boolean
          is_system?: boolean
          name: string
          permissions?: string[]
          scope?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_leadership?: boolean
          is_system?: boolean
          name?: string
          permissions?: string[]
          scope?: string
        }
        Relationships: []
      }
      department_members: {
        Row: {
          church_role_id: string | null
          department_id: string
          joined_at: string
          member_id: string
        }
        Insert: {
          church_role_id?: string | null
          department_id: string
          joined_at?: string
          member_id: string
        }
        Update: {
          church_role_id?: string | null
          department_id?: string
          joined_at?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_members_church_role_id_fkey"
            columns: ["church_role_id"]
            isOneToOne: false
            referencedRelation: "church_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          leader_member_id: string | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          leader_member_id?: string | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          leader_member_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_leader_member_id_fkey"
            columns: ["leader_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_goals: {
        Row: {
          category: string | null
          created_at: string
          deadline: string | null
          id: string
          manual_amount: number | null
          recurrence: string
          responsible: string | null
          start_date: string | null
          status: string
          target_amount: number
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          manual_amount?: number | null
          recurrence?: string
          responsible?: string | null
          start_date?: string | null
          status?: string
          target_amount: number
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          manual_amount?: number | null
          recurrence?: string
          responsible?: string | null
          start_date?: string | null
          status?: string
          target_amount?: number
          title?: string
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          member_id: string | null
          notes: string | null
          occurred_on: string
          payment_method: string | null
          receipt_path: string | null
          responsible: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: string
          member_id?: string | null
          notes?: string | null
          occurred_on?: string
          payment_method?: string | null
          receipt_path?: string | null
          responsible?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          member_id?: string | null
          notes?: string | null
          occurred_on?: string
          payment_method?: string | null
          receipt_path?: string | null
          responsible?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          note: string | null
          unlimited: boolean
          use_count: number
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          note?: string | null
          unlimited?: boolean
          use_count?: number
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          note?: string | null
          unlimited?: boolean
          use_count?: number
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      member_notes: {
        Row: {
          member_id: string
          notes: string
          updated_at: string
        }
        Insert: {
          member_id: string
          notes?: string
          updated_at?: string
        }
        Update: {
          member_id?: string
          notes?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_notes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_claim_attempts: {
        Row: {
          created_at: string
          id: number
          kind: string
          member_id: string | null
          success: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          member_id?: string | null
          success?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          member_id?: string | null
          success?: boolean
          user_id?: string
        }
        Relationships: []
      }
      members: {
        Row: {
          address: string | null
          affiliated_on: string | null
          approval_status: string
          baptism_church: string | null
          baptism_date: string | null
          baptized: boolean
          birth_date: string | null
          church_role: string | null
          church_role_id: string | null
          city: string | null
          cpf: string | null
          created_at: string
          department: string | null
          email: string | null
          full_name: string
          id: string
          joined_on: string | null
          marital_status: string | null
          ministry: string | null
          neighborhood: string | null
          notes: string | null
          phone: string | null
          photo_path: string | null
          registration_number: string | null
          rg: string | null
          status: string
          updated_at: string
          user_id: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          affiliated_on?: string | null
          approval_status?: string
          baptism_church?: string | null
          baptism_date?: string | null
          baptized?: boolean
          birth_date?: string | null
          church_role?: string | null
          church_role_id?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          full_name: string
          id?: string
          joined_on?: string | null
          marital_status?: string | null
          ministry?: string | null
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          photo_path?: string | null
          registration_number?: string | null
          rg?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          affiliated_on?: string | null
          approval_status?: string
          baptism_church?: string | null
          baptism_date?: string | null
          baptized?: boolean
          birth_date?: string | null
          church_role?: string | null
          church_role_id?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string
          id?: string
          joined_on?: string | null
          marital_status?: string | null
          ministry?: string | null
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          photo_path?: string | null
          registration_number?: string | null
          rg?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_church_role_id_fkey"
            columns: ["church_role_id"]
            isOneToOne: false
            referencedRelation: "church_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      prayer_requests: {
        Row: {
          created_at: string
          id: string
          message: string
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          status?: string
          subject: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      recurring_bills: {
        Row: {
          active: boolean
          amount: number
          category: string
          created_at: string
          due_day: number
          id: string
          name: string
          payment_method: string | null
        }
        Insert: {
          active?: boolean
          amount: number
          category: string
          created_at?: string
          due_day?: number
          id?: string
          name: string
          payment_method?: string | null
        }
        Update: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          due_day?: number
          id?: string
          name?: string
          payment_method?: string | null
        }
        Relationships: []
      }
      site_content: {
        Row: {
          content: Json
          id: string
          updated_at: string
        }
        Insert: {
          content?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          content?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          id: string
          permission: string
          user_id: string
        }
        Insert: {
          id?: string
          permission: string
          user_id: string
        }
        Update: {
          id?: string
          permission?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_church_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      can_view_department: {
        Args: { _dept: string; _user_id: string }
        Returns: boolean
      }
      check_invite: { Args: { _code: string }; Returns: boolean }
      department_candidates: {
        Args: { _dept: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      department_overview: {
        Args: never
        Returns: {
          created_at: string
          description: string | null
          id: string
          leader_member_id: string | null
          leader_name: string | null
          member_count: number
          name: string
        }[]
      }
      department_roster: {
        Args: { _dept: string }
        Returns: {
          church_role_id: string | null
          email: string | null
          full_name: string
          is_leader: boolean
          joined_at: string
          member_id: string
          phone: string | null
          photo_path: string | null
          role_name: string | null
          status: string
        }[]
      }
      has_dept_permission: {
        Args: { _dept: string; _perm: string; _user_id: string }
        Returns: boolean
      }
      claim_member: {
        Args: { _cpf: string; _member: string }
        Returns: string
      }
      find_claimable_members: {
        Args: { _name: string }
        Returns: {
          full_name: string
          has_cpf: boolean
          id: string
        }[]
      }
      norm_name: { Args: { _s: string }; Returns: string }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_church_leadership: { Args: { _user_id: string }; Returns: boolean }
      member_departments: {
        Args: never
        Returns: {
          department_id: string
          department_name: string
          member_id: string
        }[]
      }
      set_member_church_role: {
        Args: { _member: string; _role: string }
        Returns: undefined
      }
      use_invite: { Args: { _code: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "ceo"
        | "admin"
        | "leader"
        | "volunteer"
        | "member"
        | "pastor_presidente"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "ceo",
        "admin",
        "leader",
        "volunteer",
        "member",
        "pastor_presidente",
      ],
    },
  },
} as const
