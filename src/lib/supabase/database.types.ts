export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor: Database["public"]["Enums"]["activity_actor"];
          booking_id: string | null;
          business_id: string;
          customer_id: string | null;
          details: NonNullable<Json>;
          id: string;
          kind: Database["public"]["Enums"]["activity_kind"];
          message_id: string | null;
          occurred_at: string;
          pending_action_id: string | null;
          seq: number;
        };
        Insert: {
          actor: Database["public"]["Enums"]["activity_actor"];
          booking_id?: string | null;
          business_id: string;
          customer_id?: string | null;
          details?: NonNullable<Json>;
          id?: string;
          kind: Database["public"]["Enums"]["activity_kind"];
          message_id?: string | null;
          occurred_at?: string;
          pending_action_id?: string | null;
          seq?: never;
        };
        Update: {
          actor?: Database["public"]["Enums"]["activity_actor"];
          booking_id?: string | null;
          business_id?: string;
          customer_id?: string | null;
          details?: NonNullable<Json>;
          id?: string;
          kind?: Database["public"]["Enums"]["activity_kind"];
          message_id?: string | null;
          occurred_at?: string;
          pending_action_id?: string | null;
          seq?: never;
        };
        Relationships: [
          {
            foreignKeyName: "activity_events_business_id_booking_id_fkey";
            columns: ["business_id", "booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "activity_events_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "activity_events_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_events_business_id_message_id_fkey";
            columns: ["business_id", "message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "activity_events_business_id_pending_action_id_fkey";
            columns: ["business_id", "pending_action_id"];
            isOneToOne: false;
            referencedRelation: "pending_actions";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      automation_settings: {
        Row: {
          availability_replies_enabled: boolean;
          booking_time_replies_enabled: boolean;
          business_id: string;
          cancellation_acknowledgements_enabled: boolean;
          confirmations_enabled: boolean;
          reminder_lead_minutes: number;
          reminders_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          availability_replies_enabled?: boolean;
          booking_time_replies_enabled?: boolean;
          business_id: string;
          cancellation_acknowledgements_enabled?: boolean;
          confirmations_enabled?: boolean;
          reminder_lead_minutes?: number;
          reminders_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          availability_replies_enabled?: boolean;
          booking_time_replies_enabled?: boolean;
          business_id?: string;
          cancellation_acknowledgements_enabled?: boolean;
          confirmations_enabled?: boolean;
          reminder_lead_minutes?: number;
          reminders_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automation_settings_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_series: {
        Row: {
          business_id: string;
          created_at: string;
          customer_id: string;
          ends_on: string | null;
          id: string;
          interval_weeks: number;
          service_id: string;
          start_time: string;
          starts_on: string;
          weekday: number;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          customer_id: string;
          ends_on?: string | null;
          id?: string;
          interval_weeks?: number;
          service_id: string;
          start_time: string;
          starts_on: string;
          weekday: number;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          customer_id?: string;
          ends_on?: string | null;
          id?: string;
          interval_weeks?: number;
          service_id?: string;
          start_time?: string;
          starts_on?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "booking_series_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "booking_series_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_series_business_id_service_id_fkey";
            columns: ["business_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      bookings: {
        Row: {
          buffer_minutes: number;
          business_id: string;
          cancelled_at: string | null;
          created_at: string;
          customer_id: string;
          ends_at: string;
          id: string;
          occurrence_starts_at: string | null;
          series_id: string | null;
          service_id: string;
          starts_at: string;
          status: Database["public"]["Enums"]["booking_status"];
          updated_at: string;
        };
        Insert: {
          buffer_minutes?: number;
          business_id: string;
          cancelled_at?: string | null;
          created_at?: string;
          customer_id: string;
          ends_at: string;
          id?: string;
          occurrence_starts_at?: string | null;
          series_id?: string | null;
          service_id: string;
          starts_at: string;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
        };
        Update: {
          buffer_minutes?: number;
          business_id?: string;
          cancelled_at?: string | null;
          created_at?: string;
          customer_id?: string;
          ends_at?: string;
          id?: string;
          occurrence_starts_at?: string | null;
          series_id?: string | null;
          service_id?: string;
          starts_at?: string;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "bookings_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_business_id_series_id_fkey";
            columns: ["business_id", "series_id"];
            isOneToOne: false;
            referencedRelation: "booking_series";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "bookings_business_id_service_id_fkey";
            columns: ["business_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      businesses: {
        Row: {
          business_type: Database["public"]["Enums"]["business_type"];
          created_at: string;
          id: string;
          name: string | null;
          onboarding_completed_at: string | null;
          owner_id: string;
          schedule_mode: Database["public"]["Enums"]["schedule_mode"];
          timezone: string;
          updated_at: string;
          whatsapp_connected_at: string | null;
        };
        Insert: {
          business_type?: Database["public"]["Enums"]["business_type"];
          created_at?: string;
          id?: string;
          name?: string | null;
          onboarding_completed_at?: string | null;
          owner_id: string;
          schedule_mode?: Database["public"]["Enums"]["schedule_mode"];
          timezone?: string;
          updated_at?: string;
          whatsapp_connected_at?: string | null;
        };
        Update: {
          business_type?: Database["public"]["Enums"]["business_type"];
          created_at?: string;
          id?: string;
          name?: string | null;
          onboarding_completed_at?: string | null;
          owner_id?: string;
          schedule_mode?: Database["public"]["Enums"]["schedule_mode"];
          timezone?: string;
          updated_at?: string;
          whatsapp_connected_at?: string | null;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          business_id: string;
          created_at: string;
          display_name: string | null;
          id: string;
          phone_e164: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          phone_e164: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          phone_e164?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          automation_paused_at: string | null;
          business_id: string;
          channel: string;
          contact_id: string;
          created_at: string;
          id: string;
          last_message_at: string | null;
        };
        Insert: {
          automation_paused_at?: string | null;
          business_id: string;
          channel?: string;
          contact_id: string;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
        };
        Update: {
          automation_paused_at?: string | null;
          business_id?: string;
          channel?: string;
          contact_id?: string;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_business_id_contact_id_fkey";
            columns: ["business_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      customer_contacts: {
        Row: {
          business_id: string;
          contact_id: string;
          created_at: string;
          customer_id: string;
          relationship: Database["public"]["Enums"]["contact_relationship"];
        };
        Insert: {
          business_id: string;
          contact_id: string;
          created_at?: string;
          customer_id: string;
          relationship?: Database["public"]["Enums"]["contact_relationship"];
        };
        Update: {
          business_id?: string;
          contact_id?: string;
          created_at?: string;
          customer_id?: string;
          relationship?: Database["public"]["Enums"]["contact_relationship"];
        };
        Relationships: [
          {
            foreignKeyName: "customer_contacts_business_id_contact_id_fkey";
            columns: ["business_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "customer_contacts_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      customers: {
        Row: {
          business_id: string;
          created_at: string;
          full_name: string;
          id: string;
          notes: string | null;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          full_name: string;
          id?: string;
          notes?: string | null;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          full_name?: string;
          id?: string;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          author: Database["public"]["Enums"]["message_author"];
          body: string;
          business_id: string;
          conversation_id: string;
          delivery: Database["public"]["Enums"]["message_delivery"];
          direction: Database["public"]["Enums"]["message_direction"];
          id: string;
          sent_at: string;
        };
        Insert: {
          author: Database["public"]["Enums"]["message_author"];
          body: string;
          business_id: string;
          conversation_id: string;
          delivery: Database["public"]["Enums"]["message_delivery"];
          direction: Database["public"]["Enums"]["message_direction"];
          id?: string;
          sent_at?: string;
        };
        Update: {
          author?: Database["public"]["Enums"]["message_author"];
          body?: string;
          business_id?: string;
          conversation_id?: string;
          delivery?: Database["public"]["Enums"]["message_delivery"];
          direction?: Database["public"]["Enums"]["message_direction"];
          id?: string;
          sent_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_business_id_conversation_id_fkey";
            columns: ["business_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      pending_actions: {
        Row: {
          booking_id: string | null;
          business_id: string;
          conversation_id: string | null;
          created_at: string;
          customer_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["pending_action_kind"];
          proposed_ends_at: string | null;
          proposed_starts_at: string | null;
          resolution: Json | null;
          resolved_at: string | null;
          resolved_by: string | null;
          source_message_id: string | null;
          status: Database["public"]["Enums"]["pending_action_status"];
          understood: NonNullable<Json>;
        };
        Insert: {
          booking_id?: string | null;
          business_id: string;
          conversation_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["pending_action_kind"];
          proposed_ends_at?: string | null;
          proposed_starts_at?: string | null;
          resolution?: Json | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          source_message_id?: string | null;
          status?: Database["public"]["Enums"]["pending_action_status"];
          understood?: NonNullable<Json>;
        };
        Update: {
          booking_id?: string | null;
          business_id?: string;
          conversation_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["pending_action_kind"];
          proposed_ends_at?: string | null;
          proposed_starts_at?: string | null;
          resolution?: Json | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          source_message_id?: string | null;
          status?: Database["public"]["Enums"]["pending_action_status"];
          understood?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "pending_actions_business_id_booking_id_fkey";
            columns: ["business_id", "booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "pending_actions_business_id_conversation_id_fkey";
            columns: ["business_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "pending_actions_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "pending_actions_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pending_actions_business_id_source_message_id_fkey";
            columns: ["business_id", "source_message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      reminders: {
        Row: {
          booking_id: string;
          business_id: string;
          created_at: string;
          id: string;
          send_at: string;
          sent_at: string | null;
          status: Database["public"]["Enums"]["reminder_status"];
          updated_at: string;
        };
        Insert: {
          booking_id: string;
          business_id: string;
          created_at?: string;
          id?: string;
          send_at: string;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["reminder_status"];
          updated_at?: string;
        };
        Update: {
          booking_id?: string;
          business_id?: string;
          created_at?: string;
          id?: string;
          send_at?: string;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["reminder_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminders_business_id_booking_id_fkey";
            columns: ["business_id", "booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      schedule_blocks: {
        Row: {
          business_id: string;
          created_at: string;
          ends_at: string;
          id: string;
          label: string | null;
          starts_at: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          ends_at: string;
          id?: string;
          label?: string | null;
          starts_at: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          ends_at?: string;
          id?: string;
          label?: string | null;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          archived_at: string | null;
          buffer_minutes: number;
          business_id: string;
          created_at: string;
          duration_minutes: number;
          id: string;
          name: string;
          position: number;
        };
        Insert: {
          archived_at?: string | null;
          buffer_minutes?: number;
          business_id: string;
          created_at?: string;
          duration_minutes: number;
          id?: string;
          name: string;
          position?: number;
        };
        Update: {
          archived_at?: string | null;
          buffer_minutes?: number;
          business_id?: string;
          created_at?: string;
          duration_minutes?: number;
          id?: string;
          name?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_events: {
        Row: {
          billable: boolean | null;
          business_id: string;
          cached_input_tokens: number | null;
          category: Database["public"]["Enums"]["usage_category"];
          created_at: string;
          currency: string | null;
          destination_country: string | null;
          estimated_cost_micros: number | null;
          external_reference: string | null;
          id: string;
          input_tokens: number | null;
          message_category: string | null;
          metadata: NonNullable<Json>;
          model: string | null;
          occurred_at: string;
          operation: string;
          output_tokens: number | null;
          provider: string;
          quantity: number;
          unit: string;
        };
        Insert: {
          billable?: boolean | null;
          business_id: string;
          cached_input_tokens?: number | null;
          category: Database["public"]["Enums"]["usage_category"];
          created_at?: string;
          currency?: string | null;
          destination_country?: string | null;
          estimated_cost_micros?: number | null;
          external_reference?: string | null;
          id?: string;
          input_tokens?: number | null;
          message_category?: string | null;
          metadata?: NonNullable<Json>;
          model?: string | null;
          occurred_at?: string;
          operation: string;
          output_tokens?: number | null;
          provider: string;
          quantity?: number;
          unit?: string;
        };
        Update: {
          billable?: boolean | null;
          business_id?: string;
          cached_input_tokens?: number | null;
          category?: Database["public"]["Enums"]["usage_category"];
          created_at?: string;
          currency?: string | null;
          destination_country?: string | null;
          estimated_cost_micros?: number | null;
          external_reference?: string | null;
          id?: string;
          input_tokens?: number | null;
          message_category?: string | null;
          metadata?: NonNullable<Json>;
          model?: string | null;
          occurred_at?: string;
          operation?: string;
          output_tokens?: number | null;
          provider?: string;
          quantity?: number;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_events_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      working_hours: {
        Row: {
          business_id: string;
          end_time: string;
          id: string;
          start_time: string;
          weekday: number;
        };
        Insert: {
          business_id: string;
          end_time: string;
          id?: string;
          start_time: string;
          weekday: number;
        };
        Update: {
          business_id?: string;
          end_time?: string;
          id?: string;
          start_time?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "working_hours_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_schedule_block: {
        Args: { p_ends_at: string; p_label?: string; p_starts_at: string };
        Returns: string;
      };
      cancel_booking: { Args: { p_booking_id: string }; Returns: undefined };
      complete_onboarding: { Args: { p_setup: Json }; Returns: string };
      create_booking: {
        Args: {
          p_customer_id: string;
          p_reminder_send_at?: string;
          p_service_id: string;
          p_starts_at: string;
        };
        Returns: string;
      };
      create_customer: {
        Args: {
          p_contact_name?: string;
          p_full_name: string;
          p_phone_e164?: string;
          p_relationship?: Database["public"]["Enums"]["contact_relationship"];
        };
        Returns: string;
      };
      create_customer_booking: {
        Args: {
          p_contact_name?: string;
          p_full_name: string;
          p_phone_e164?: string;
          p_relationship?: Database["public"]["Enums"]["contact_relationship"];
          p_reminder_send_at?: string;
          p_service_id: string;
          p_starts_at: string;
        };
        Returns: Json;
      };
      dismiss_pending_action: {
        Args: { p_action_id: string };
        Returns: undefined;
      };
      move_booking: {
        Args: {
          p_booking_id: string;
          p_reminder_send_at?: string;
          p_starts_at: string;
        };
        Returns: undefined;
      };
      remove_schedule_block: {
        Args: { p_block_id: string };
        Returns: undefined;
      };
      resolve_reschedule_request: {
        Args: {
          p_action_id: string;
          p_decision: string;
          p_reminder_send_at?: string;
          p_reply_body?: string;
          p_starts_at?: string;
        };
        Returns: undefined;
      };
      resume_conversation: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      save_services: { Args: { p_services: Json }; Returns: undefined };
      set_schedule: {
        Args: {
          p_hours?: Json;
          p_mode: Database["public"]["Enums"]["schedule_mode"];
        };
        Returns: undefined;
      };
    };
    Enums: {
      activity_actor: "contact" | "pingflow" | "owner";
      activity_kind:
        | "message_received"
        | "request_understood"
        | "time_proposed"
        | "approval_requested"
        | "owner_approved"
        | "owner_declined"
        | "owner_took_over"
        | "request_closed"
        | "booking_created"
        | "booking_moved"
        | "booking_cancelled"
        | "confirmation_sent"
        | "reply_sent"
        | "reminder_scheduled"
        | "reminder_rescheduled"
        | "reminder_cancelled"
        | "time_blocked"
        | "block_removed"
        | "customer_added"
        | "automation_resumed";
      booking_status: "confirmed" | "cancelled";
      business_type:
        | "driving_instructor"
        | "tutor"
        | "personal_trainer"
        | "cleaner"
        | "beauty"
        | "dog_groomer"
        | "photographer"
        | "other";
      contact_relationship:
        "self" | "parent" | "guardian" | "partner" | "other";
      message_author: "contact" | "pingflow" | "owner";
      message_delivery: "received" | "simulated" | "sent" | "failed";
      message_direction: "inbound" | "outbound";
      pending_action_kind:
        | "reschedule_request"
        | "booking_request"
        | "cancellation_request"
        | "reply_needed"
        | "failure";
      pending_action_status:
        "open" | "approved" | "declined" | "taken_over" | "dismissed";
      reminder_status: "scheduled" | "sent" | "cancelled" | "failed";
      schedule_mode: "regular" | "flexible";
      usage_category: "ai" | "whatsapp" | "email" | "other";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_actor: ["contact", "pingflow", "owner"],
      activity_kind: [
        "message_received",
        "request_understood",
        "time_proposed",
        "approval_requested",
        "owner_approved",
        "owner_declined",
        "owner_took_over",
        "request_closed",
        "booking_created",
        "booking_moved",
        "booking_cancelled",
        "confirmation_sent",
        "reply_sent",
        "reminder_scheduled",
        "reminder_rescheduled",
        "reminder_cancelled",
        "time_blocked",
        "block_removed",
        "customer_added",
        "automation_resumed",
      ],
      booking_status: ["confirmed", "cancelled"],
      business_type: [
        "driving_instructor",
        "tutor",
        "personal_trainer",
        "cleaner",
        "beauty",
        "dog_groomer",
        "photographer",
        "other",
      ],
      contact_relationship: ["self", "parent", "guardian", "partner", "other"],
      message_author: ["contact", "pingflow", "owner"],
      message_delivery: ["received", "simulated", "sent", "failed"],
      message_direction: ["inbound", "outbound"],
      pending_action_kind: [
        "reschedule_request",
        "booking_request",
        "cancellation_request",
        "reply_needed",
        "failure",
      ],
      pending_action_status: [
        "open",
        "approved",
        "declined",
        "taken_over",
        "dismissed",
      ],
      reminder_status: ["scheduled", "sent", "cancelled", "failed"],
      schedule_mode: ["regular", "flexible"],
      usage_category: ["ai", "whatsapp", "email", "other"],
    },
  },
} as const;
