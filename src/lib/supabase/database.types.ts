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
          clarification: Json | null;
          contact_id: string;
          created_at: string;
          id: string;
          last_message_at: string | null;
        };
        Insert: {
          automation_paused_at?: string | null;
          business_id: string;
          channel?: string;
          clarification?: Json | null;
          contact_id: string;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
        };
        Update: {
          automation_paused_at?: string | null;
          business_id?: string;
          channel?: string;
          clarification?: Json | null;
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
      message_deliveries: {
        Row: {
          accepted_at: string | null;
          attempts: number;
          business_id: string;
          claimed_at: string | null;
          connection_id: string;
          created_at: string;
          delivered_at: string | null;
          dispatch: Database["public"]["Enums"]["dispatch_state"];
          error_category: string | null;
          error_code: number | null;
          failed_at: string | null;
          message_id: string;
          next_attempt_at: string;
          provider_message_id: string | null;
          read_at: string | null;
          sent_at: string | null;
          sent_via: string | null;
          template_name: string | null;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          attempts?: number;
          business_id: string;
          claimed_at?: string | null;
          connection_id: string;
          created_at?: string;
          delivered_at?: string | null;
          dispatch?: Database["public"]["Enums"]["dispatch_state"];
          error_category?: string | null;
          error_code?: number | null;
          failed_at?: string | null;
          message_id: string;
          next_attempt_at?: string;
          provider_message_id?: string | null;
          read_at?: string | null;
          sent_at?: string | null;
          sent_via?: string | null;
          template_name?: string | null;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          attempts?: number;
          business_id?: string;
          claimed_at?: string | null;
          connection_id?: string;
          created_at?: string;
          delivered_at?: string | null;
          dispatch?: Database["public"]["Enums"]["dispatch_state"];
          error_category?: string | null;
          error_code?: number | null;
          failed_at?: string | null;
          message_id?: string;
          next_attempt_at?: string;
          provider_message_id?: string | null;
          read_at?: string | null;
          sent_at?: string | null;
          sent_via?: string | null;
          template_name?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_deliveries_business_id_connection_id_fkey";
            columns: ["business_id", "connection_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_connections";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "message_deliveries_business_id_message_id_fkey";
            columns: ["business_id", "message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      message_processing_runs: {
        Row: {
          attempts: number;
          business_id: string;
          claimed_at: string | null;
          completed_at: string | null;
          conversation_id: string;
          created_at: string;
          decision: string | null;
          decision_detail: Json | null;
          error_category: string | null;
          id: string;
          interpretation: Json | null;
          interpreter: string | null;
          message_id: string;
          model: string | null;
          prompt_version: string | null;
          status: Database["public"]["Enums"]["processing_status"];
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          business_id: string;
          claimed_at?: string | null;
          completed_at?: string | null;
          conversation_id: string;
          created_at?: string;
          decision?: string | null;
          decision_detail?: Json | null;
          error_category?: string | null;
          id?: string;
          interpretation?: Json | null;
          interpreter?: string | null;
          message_id: string;
          model?: string | null;
          prompt_version?: string | null;
          status?: Database["public"]["Enums"]["processing_status"];
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          business_id?: string;
          claimed_at?: string | null;
          completed_at?: string | null;
          conversation_id?: string;
          created_at?: string;
          decision?: string | null;
          decision_detail?: Json | null;
          error_category?: string | null;
          id?: string;
          interpretation?: Json | null;
          interpreter?: string | null;
          message_id?: string;
          model?: string | null;
          prompt_version?: string | null;
          status?: Database["public"]["Enums"]["processing_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_processing_runs_business_id_conversation_id_fkey";
            columns: ["business_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "message_processing_runs_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_processing_runs_business_id_message_id_fkey";
            columns: ["business_id", "message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      messages: {
        Row: {
          author: Database["public"]["Enums"]["message_author"];
          body: string;
          business_id: string;
          content_type: string;
          conversation_id: string;
          delivery: Database["public"]["Enums"]["message_delivery"];
          direction: Database["public"]["Enums"]["message_direction"];
          external_id: string | null;
          id: string;
          processing_run_id: string | null;
          sent_at: string;
          source: Database["public"]["Enums"]["message_source"];
        };
        Insert: {
          author: Database["public"]["Enums"]["message_author"];
          body: string;
          business_id: string;
          content_type?: string;
          conversation_id: string;
          delivery: Database["public"]["Enums"]["message_delivery"];
          direction: Database["public"]["Enums"]["message_direction"];
          external_id?: string | null;
          id?: string;
          processing_run_id?: string | null;
          sent_at?: string;
          source?: Database["public"]["Enums"]["message_source"];
        };
        Update: {
          author?: Database["public"]["Enums"]["message_author"];
          body?: string;
          business_id?: string;
          content_type?: string;
          conversation_id?: string;
          delivery?: Database["public"]["Enums"]["message_delivery"];
          direction?: Database["public"]["Enums"]["message_direction"];
          external_id?: string | null;
          id?: string;
          processing_run_id?: string | null;
          sent_at?: string;
          source?: Database["public"]["Enums"]["message_source"];
        };
        Relationships: [
          {
            foreignKeyName: "messages_business_id_conversation_id_fkey";
            columns: ["business_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "messages_processing_run_fkey";
            columns: ["business_id", "processing_run_id"];
            isOneToOne: false;
            referencedRelation: "message_processing_runs";
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
          message_id: string | null;
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
          message_id?: string | null;
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
          message_id?: string | null;
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
          {
            foreignKeyName: "reminders_message_fkey";
            columns: ["business_id", "message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
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
      whatsapp_connections: {
        Row: {
          business_id: string;
          connected_at: string | null;
          created_at: string;
          disconnected_at: string | null;
          display_phone_number: string | null;
          id: string;
          last_error_at: string | null;
          last_error_category: string | null;
          last_inbound_at: string | null;
          last_outbound_at: string | null;
          last_webhook_at: string | null;
          mode: Database["public"]["Enums"]["whatsapp_connection_mode"];
          phone_number_id: string;
          status: Database["public"]["Enums"]["whatsapp_connection_status"];
          updated_at: string;
          verified_name: string | null;
          waba_id: string | null;
        };
        Insert: {
          business_id: string;
          connected_at?: string | null;
          created_at?: string;
          disconnected_at?: string | null;
          display_phone_number?: string | null;
          id?: string;
          last_error_at?: string | null;
          last_error_category?: string | null;
          last_inbound_at?: string | null;
          last_outbound_at?: string | null;
          last_webhook_at?: string | null;
          mode: Database["public"]["Enums"]["whatsapp_connection_mode"];
          phone_number_id: string;
          status?: Database["public"]["Enums"]["whatsapp_connection_status"];
          updated_at?: string;
          verified_name?: string | null;
          waba_id?: string | null;
        };
        Update: {
          business_id?: string;
          connected_at?: string | null;
          created_at?: string;
          disconnected_at?: string | null;
          display_phone_number?: string | null;
          id?: string;
          last_error_at?: string | null;
          last_error_category?: string | null;
          last_inbound_at?: string | null;
          last_outbound_at?: string | null;
          last_webhook_at?: string | null;
          mode?: Database["public"]["Enums"]["whatsapp_connection_mode"];
          phone_number_id?: string;
          status?: Database["public"]["Enums"]["whatsapp_connection_status"];
          updated_at?: string;
          verified_name?: string | null;
          waba_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_events: {
        Row: {
          attempts: number;
          business_id: string | null;
          claimed_at: string | null;
          connection_id: string | null;
          error_category: string | null;
          event_key: string;
          id: string;
          kind: Database["public"]["Enums"]["whatsapp_event_kind"];
          message_id: string | null;
          next_attempt_at: string | null;
          occurred_at: string;
          payload: NonNullable<Json>;
          phone_number_id: string | null;
          processed_at: string | null;
          received_at: string;
          sender: string | null;
          status: Database["public"]["Enums"]["whatsapp_event_status"];
          wa_message_id: string | null;
        };
        Insert: {
          attempts?: number;
          business_id?: string | null;
          claimed_at?: string | null;
          connection_id?: string | null;
          error_category?: string | null;
          event_key: string;
          id?: string;
          kind: Database["public"]["Enums"]["whatsapp_event_kind"];
          message_id?: string | null;
          next_attempt_at?: string | null;
          occurred_at: string;
          payload?: NonNullable<Json>;
          phone_number_id?: string | null;
          processed_at?: string | null;
          received_at?: string;
          sender?: string | null;
          status?: Database["public"]["Enums"]["whatsapp_event_status"];
          wa_message_id?: string | null;
        };
        Update: {
          attempts?: number;
          business_id?: string | null;
          claimed_at?: string | null;
          connection_id?: string | null;
          error_category?: string | null;
          event_key?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["whatsapp_event_kind"];
          message_id?: string | null;
          next_attempt_at?: string | null;
          occurred_at?: string;
          payload?: NonNullable<Json>;
          phone_number_id?: string | null;
          processed_at?: string | null;
          received_at?: string;
          sender?: string | null;
          status?: Database["public"]["Enums"]["whatsapp_event_status"];
          wa_message_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_events_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_events_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_connections";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_templates: {
        Row: {
          business_id: string;
          connection_id: string;
          created_at: string;
          id: string;
          language: string;
          last_error_code: number | null;
          name: string;
          parameters: string[];
          provider_status: string;
          purpose: Database["public"]["Enums"]["template_purpose"];
          status_checked_at: string | null;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          connection_id: string;
          created_at?: string;
          id?: string;
          language: string;
          last_error_code?: number | null;
          name: string;
          parameters?: string[];
          provider_status?: string;
          purpose: Database["public"]["Enums"]["template_purpose"];
          status_checked_at?: string | null;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          connection_id?: string;
          created_at?: string;
          id?: string;
          language?: string;
          last_error_code?: number | null;
          name?: string;
          parameters?: string[];
          provider_status?: string;
          purpose?: Database["public"]["Enums"]["template_purpose"];
          status_checked_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_business_id_connection_id_fkey";
            columns: ["business_id", "connection_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_connections";
            referencedColumns: ["business_id", "id"];
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
      apply_whatsapp_status: {
        Args: {
          p_at: string;
          p_connection_id: string;
          p_error_code?: number;
          p_provider_message_id: string;
          p_status: string;
        };
        Returns: Json;
      };
      cancel_booking: { Args: { p_booking_id: string }; Returns: undefined };
      claim_message_run: { Args: { p_run_id: string }; Returns: number };
      claim_outbound_delivery: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      claim_whatsapp_event: {
        Args: { p_lease_seconds?: number };
        Returns: {
          attempts: number;
          business_id: string | null;
          claimed_at: string | null;
          connection_id: string | null;
          error_category: string | null;
          event_key: string;
          id: string;
          kind: Database["public"]["Enums"]["whatsapp_event_kind"];
          message_id: string | null;
          next_attempt_at: string | null;
          occurred_at: string;
          payload: NonNullable<Json>;
          phone_number_id: string | null;
          processed_at: string | null;
          received_at: string;
          sender: string | null;
          status: Database["public"]["Enums"]["whatsapp_event_status"];
          wa_message_id: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "whatsapp_events";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      complete_message_run: {
        Args: { p_attempt: number; p_result: Json; p_run_id: string };
        Returns: Json;
      };
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
      disconnect_whatsapp: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      dismiss_pending_action: {
        Args: { p_action_id: string };
        Returns: undefined;
      };
      fail_message_run: {
        Args: {
          p_attempt: number;
          p_error_category: string;
          p_interpreter?: string;
          p_model?: string;
          p_prompt_version?: string;
          p_run_id: string;
        };
        Returns: Json;
      };
      finish_whatsapp_event: {
        Args: {
          p_attempt: number;
          p_error_category?: string;
          p_event_id: string;
          p_message_id?: string;
          p_retry_at?: string;
          p_status: Database["public"]["Enums"]["whatsapp_event_status"];
        };
        Returns: boolean;
      };
      ingest_inbound_message: {
        Args: {
          p_body: string;
          p_business_id: string;
          p_content_type?: string;
          p_external_id: string;
          p_phone_e164: string;
          p_received_at: string;
          p_source?: Database["public"]["Enums"]["message_source"];
        };
        Returns: Json;
      };
      move_booking: {
        Args: {
          p_booking_id: string;
          p_reminder_send_at?: string;
          p_starts_at: string;
        };
        Returns: undefined;
      };
      note_message_not_sent: {
        Args: { p_message_id: string; p_outcome: string; p_reason: string };
        Returns: undefined;
      };
      queue_reminder: {
        Args: { p_body: string; p_reminder_id: string };
        Returns: string;
      };
      record_delivery_result: {
        Args: { p_attempt: number; p_message_id: string; p_result: Json };
        Returns: boolean;
      };
      recover_stale_deliveries: {
        Args: { p_lease_seconds?: number };
        Returns: number;
      };
      remove_schedule_block: {
        Args: { p_block_id: string };
        Returns: undefined;
      };
      reply_to_pending_action: {
        Args: { p_action_id: string; p_body: string };
        Returns: undefined;
      };
      resolve_booking_request: {
        Args: {
          p_action_id: string;
          p_decision: string;
          p_reminder_send_at?: string;
          p_reply_body?: string;
          p_starts_at?: string;
        };
        Returns: undefined;
      };
      resolve_cancellation_request: {
        Args: {
          p_action_id: string;
          p_decision: string;
          p_reply_body?: string;
        };
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
        | "automation_resumed"
        | "reply_needed"
        | "message_not_sent"
        | "reminder_sent"
        | "reminder_not_sent";
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
      dispatch_state: "queued" | "sending" | "done";
      message_author: "contact" | "pingflow" | "owner";
      message_delivery:
        | "received"
        | "simulated"
        | "sent"
        | "failed"
        | "queued"
        | "accepted"
        | "delivered"
        | "read"
        | "blocked";
      message_direction: "inbound" | "outbound";
      message_source: "whatsapp" | "simulator";
      pending_action_kind:
        | "reschedule_request"
        | "booking_request"
        | "cancellation_request"
        | "reply_needed"
        | "failure";
      pending_action_status:
        "open" | "approved" | "declined" | "taken_over" | "dismissed";
      processing_status: "pending" | "processing" | "completed" | "failed";
      reminder_status:
        "scheduled" | "sent" | "cancelled" | "failed" | "not_sent";
      schedule_mode: "regular" | "flexible";
      template_purpose:
        | "booking_confirmation"
        | "cancellation_confirmation"
        | "appointment_reminder";
      usage_category: "ai" | "whatsapp" | "email" | "other";
      whatsapp_connection_mode: "developer" | "embedded_signup";
      whatsapp_connection_status:
        "connecting" | "connected" | "needs_attention" | "disconnected";
      whatsapp_event_kind: "message" | "status" | "other";
      whatsapp_event_status:
        "pending" | "processing" | "done" | "ignored" | "unroutable" | "failed";
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
        "reply_needed",
        "message_not_sent",
        "reminder_sent",
        "reminder_not_sent",
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
      dispatch_state: ["queued", "sending", "done"],
      message_author: ["contact", "pingflow", "owner"],
      message_delivery: [
        "received",
        "simulated",
        "sent",
        "failed",
        "queued",
        "accepted",
        "delivered",
        "read",
        "blocked",
      ],
      message_direction: ["inbound", "outbound"],
      message_source: ["whatsapp", "simulator"],
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
      processing_status: ["pending", "processing", "completed", "failed"],
      reminder_status: ["scheduled", "sent", "cancelled", "failed", "not_sent"],
      schedule_mode: ["regular", "flexible"],
      template_purpose: [
        "booking_confirmation",
        "cancellation_confirmation",
        "appointment_reminder",
      ],
      usage_category: ["ai", "whatsapp", "email", "other"],
      whatsapp_connection_mode: ["developer", "embedded_signup"],
      whatsapp_connection_status: [
        "connecting",
        "connected",
        "needs_attention",
        "disconnected",
      ],
      whatsapp_event_kind: ["message", "status", "other"],
      whatsapp_event_status: [
        "pending",
        "processing",
        "done",
        "ignored",
        "unroutable",
        "failed",
      ],
    },
  },
} as const;
