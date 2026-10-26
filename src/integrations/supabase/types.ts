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
      department_leaders: {
        Row: {
          created_at: string
          department_id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          member_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_leaders_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_leaders_member_id_fkey"
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
      event_lots: {
        Row: {
          capacity: number | null
          closes_at: string | null
          created_at: string
          event_id: string
          id: string
          name: string
          opens_at: string | null
          position: number
          price: number
          public_access: boolean
        }
        Insert: {
          capacity?: number | null
          closes_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          name: string
          opens_at?: string | null
          position?: number
          price?: number
          public_access?: boolean
        }
        Update: {
          capacity?: number | null
          closes_at?: string | null
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          opens_at?: string | null
          position?: number
          price?: number
          public_access?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_lots_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_payment_info: {
        Row: {
          card_contact_note: string | null
          event_id: string
          payment_link: string | null
          pix_key: string | null
          pix_qr_path: string | null
        }
        Insert: {
          card_contact_note?: string | null
          event_id: string
          payment_link?: string | null
          pix_key?: string | null
          pix_qr_path?: string | null
        }
        Update: {
          card_contact_note?: string | null
          event_id?: string
          payment_link?: string | null
          pix_key?: string | null
          pix_qr_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_payment_info_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_payments: {
        Row: {
          amount: number
          claimed_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          id: string
          installment_no: number
          proof_path: string | null
          registration_id: string
          status: string
        }
        Insert: {
          amount: number
          claimed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          id?: string
          installment_no: number
          proof_path?: string | null
          registration_id: string
          status?: string
        }
        Update: {
          amount?: number
          claimed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          id?: string
          installment_no?: number
          proof_path?: string | null
          registration_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_payments_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "event_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          attendee_cpf: string | null
          attendee_email: string | null
          attendee_name: string
          attendee_phone: string | null
          cancelled_at: string | null
          created_at: string
          event_id: string
          id: string
          image_consent: boolean
          image_consent_at: string | null
          installments: number
          lot_id: string
          member_id: string | null
          quantity: number
          released_at: string | null
          released_by: string | null
          released_manually: boolean
          status: string
          total: number
          unit_price: number
          user_id: string
        }
        Insert: {
          attendee_cpf?: string | null
          attendee_email?: string | null
          attendee_name: string
          attendee_phone?: string | null
          cancelled_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          image_consent?: boolean
          image_consent_at?: string | null
          installments?: number
          lot_id: string
          member_id?: string | null
          quantity: number
          released_at?: string | null
          released_by?: string | null
          released_manually?: boolean
          status?: string
          total: number
          unit_price: number
          user_id: string
        }
        Update: {
          attendee_cpf?: string | null
          attendee_email?: string | null
          attendee_name?: string
          attendee_phone?: string | null
          cancelled_at?: string | null
          created_at?: string
          event_id?: string
          id?: string
          image_consent?: boolean
          image_consent_at?: string | null
          installments?: number
          lot_id?: string
          member_id?: string | null
          quantity?: number
          released_at?: string | null
          released_by?: string | null
          released_manually?: boolean
          status?: string
          total?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "event_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tickets: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          code: string
          created_at: string
          event_id: string
          holder_name: string
          id: string
          registration_id: string
          seq: number
          short_code: string
          status: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          code: string
          created_at?: string
          event_id: string
          holder_name: string
          id?: string
          registration_id: string
          seq: number
          short_code?: string
          status?: string
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          code?: string
          created_at?: string
          event_id?: string
          holder_name?: string
          id?: string
          registration_id?: string
          seq?: number
          short_code?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "event_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          accepts_card: boolean
          allow_installments: boolean
          audience: string
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          limit_per_person: boolean
          location: string | null
          max_installments: number
          max_per_person: number | null
          payment_enabled: boolean
          published: boolean
          registration_closes_at: string | null
          notified_at: string | null
          registration_opens_at: string | null
          require_image_consent: boolean
          slug: string
          starts_at: string
          title: string
        }
        Insert: {
          accepts_card?: boolean
          allow_installments?: boolean
          audience?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          limit_per_person?: boolean
          location?: string | null
          max_installments?: number
          max_per_person?: number | null
          payment_enabled?: boolean
          published?: boolean
          registration_closes_at?: string | null
          notified_at?: string | null
          registration_opens_at?: string | null
          require_image_consent?: boolean
          slug: string
          starts_at: string
          title: string
        }
        Update: {
          accepts_card?: boolean
          allow_installments?: boolean
          audience?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          limit_per_person?: boolean
          location?: string | null
          max_installments?: number
          max_per_person?: number | null
          payment_enabled?: boolean
          published?: boolean
          registration_closes_at?: string | null
          notified_at?: string | null
          registration_opens_at?: string | null
          require_image_consent?: boolean
          slug?: string
          starts_at?: string
          title?: string
        }
        Relationships: []
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
      push_notifications: {
        Row: {
          audience: Json
          body: string
          created_at: string
          created_by: string | null
          devices: number
          failed: number
          id: string
          kind: string
          recipients: number
          sent: number
          title: string
          url: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: never
        Update: never
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
          leader_member_ids: string[]
          leader_name: string | null
          leader_names: string[]
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
      cancel_event_registration: { Args: { _reg: string }; Returns: undefined }
      checkin_ticket: { Args: { _code: string }; Returns: Json }
      claim_event_payment: {
        Args: { _payment: string; _proof_path?: string }
        Returns: undefined
      }
      dashboard_volunteer_stats: { Args: never; Returns: Json }
      delete_user_account: {
        Args: { _delete_member?: boolean; _user: string }
        Returns: undefined
      }
      ack_shift: { Args: { _shift: string }; Returns: undefined }
      delete_shift: { Args: { _shift: string }; Returns: undefined }
      dept_schedule: {
        Args: { _dept: string; _from: string; _to: string }
        Returns: {
          acknowledged_at: string | null
          change_reason: string | null
          change_requested_at: string | null
          has_account: boolean | null
          is_me: boolean | null
          leader_note: string | null
          member_id: string | null
          member_name: string | null
          notes: string | null
          service_name: string
          service_time: string | null
          shift_date: string
          shift_id: string
          status: string | null
        }[]
      }
      leader_confirm_shift: { Args: { _member: string; _shift: string }; Returns: undefined }
      my_shifts: {
        Args: { _limit?: number }
        Returns: {
          change_reason: string | null
          department_id: string
          department_name: string
          leader_note: string | null
          notes: string | null
          service_name: string
          service_time: string | null
          shift_date: string
          shift_id: string
          status: string
          team: string[]
        }[]
      }
      request_shift_change: { Args: { _reason: string; _shift: string }; Returns: undefined }
      resolve_shift_change: { Args: { _member: string; _note?: string; _shift: string }; Returns: undefined }
      save_shift: {
        Args: {
          _date: string
          _dept: string
          _member_ids: string[]
          _notes?: string | null
          _service_name: string
          _service_time: string | null
          _shift_id?: string | null
        }
        Returns: string
      }
      shift_candidates: {
        Args: { _date: string; _dept: string; _exclude?: string | null }
        Returns: { full_name: string; has_account: boolean; member_id: string; month_count: number }[]
      }
      shift_departments: { Args: never; Returns: { can_manage: boolean; id: string; name: string }[] }
      shift_warnings: {
        Args: { _date: string; _dept: string; _exclude?: string | null; _members: string[]; _time: string | null }
        Returns: { detail: string; kind: string; member_id: string; total: number | null }[]
      }
      save_push_subscription: {
        Args: { _auth: string; _endpoint: string; _p256dh: string; _user_agent?: string }
        Returns: undefined
      }
      delete_push_subscription: { Args: { _endpoint: string }; Returns: undefined }
      storage_enqueue_orphans: { Args: never; Returns: number }
      storage_enqueue_orphans_selected: { Args: { _items: Json }; Returns: number }
      storage_orphans_preview: {
        Args: never
        Returns: {
          bucket: string
          created_at: string
          path: string
          size: number
        }[]
      }
      storage_trash_done: { Args: { _ids: number[] }; Returns: undefined }
      storage_trash_next: {
        Args: { _limit?: number }
        Returns: {
          bucket: string
          id: number
          path: string
        }[]
      }
      ensure_visitor_profile: {
        Args: { _cpf: string; _name: string; _phone: string }
        Returns: string
      }
      event_admin_stats: { Args: { _event: string }; Returns: Json }
      is_valid_cpf: { Args: { _cpf: string }; Returns: boolean }
      public_event: { Args: { _slug: string }; Returns: Json }
      public_events: {
        Args: never
        Returns: {
          audience: string
          description: string | null
          ends_at: string | null
          id: string
          location: string | null
          min_price: number | null
          payment_enabled: boolean
          registration_closes_at: string | null
          registration_open: boolean
          registration_opens_at: string | null
          slug: string
          spots_left: number | null
          starts_at: string
          title: string
        }[]
      }
      register_for_event: {
        Args: {
          _cpf: string
          _event: string
          _image_consent?: boolean
          _installments?: number
          _lot: string
          _quantity: number
        }
        Returns: string
      }
      release_event_registration: { Args: { _reg: string }; Returns: undefined }
      set_event_payment_status: {
        Args: { _payment: string; _status: string }
        Returns: undefined
      }
      set_ticket_presence: {
        Args: { _present: boolean; _ticket: string }
        Returns: undefined
      }
      check_cpf_for_signup: {
        Args: { _cpf: string }
        Returns: {
          id: string
          masked_name: string
          state: string
        }[]
      }
      claim_member: {
        Args: { _cpf: string; _member: string }
        Returns: string
      }
      find_member_duplicates: {
        Args: { _cpf: string; _exclude?: string; _name: string; _rg: string }
        Returns: {
          approval_status: string
          full_name: string
          has_account: boolean
          id: string
          match_cpf: boolean
          match_name: boolean
          match_rg: boolean
          registration_number: string
          status: string
        }[]
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
