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
      access_grants: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          order_id: string
          owner_id: string
          plan_id: string
          revoked_at: string | null
          starts_at: string
          state: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          order_id: string
          owner_id: string
          plan_id: string
          revoked_at?: string | null
          starts_at: string
          state?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          order_id?: string
          owner_id?: string
          plan_id?: string
          revoked_at?: string | null
          starts_at?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_grants_order_id_owner_id_plan_id_fkey"
            columns: ["order_id", "owner_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
            referencedColumns: ["id", "owner_id", "plan_id"]
          },
        ]
      }
      account_data_requests: {
        Row: {
          attempt: number
          bytes: number | null
          completed_at: string | null
          created_at: string
          error_code: string | null
          expires_at: string | null
          id: string
          kind: string
          lease_token: string | null
          lease_until: string | null
          message_id: number | null
          not_before: string
          object_key: string | null
          owner_id: string
          payload: Json
          status: string
          target_id: string | null
        }
        Insert: {
          attempt?: number
          bytes?: number | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          expires_at?: string | null
          id: string
          kind: string
          lease_token?: string | null
          lease_until?: string | null
          message_id?: number | null
          not_before?: string
          object_key?: string | null
          owner_id: string
          payload?: Json
          status?: string
          target_id?: string | null
        }
        Update: {
          attempt?: number
          bytes?: number | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          lease_token?: string | null
          lease_until?: string | null
          message_id?: number | null
          not_before?: string
          object_key?: string | null
          owner_id?: string
          payload?: Json
          status?: string
          target_id?: string | null
        }
        Relationships: []
      }
      admin_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          error_code: string | null
          id: string
          status: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          error_code?: string | null
          id: string
          status?: string
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          error_code?: string | null
          id?: string
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          attempt_id: string
          created_at: string
          feedback: Json | null
          final: boolean
          grading_job_id: string | null
          id: string
          marked: boolean
          next_due_at: string | null
          owner_id: string
          request_id: string
          response: Json
          review_requested: boolean
          revision: number
          study_item_id: string
          version_id: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          feedback?: Json | null
          final?: boolean
          grading_job_id?: string | null
          id?: string
          marked?: boolean
          next_due_at?: string | null
          owner_id: string
          request_id: string
          response: Json
          review_requested?: boolean
          revision?: number
          study_item_id: string
          version_id: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          feedback?: Json | null
          final?: boolean
          grading_job_id?: string | null
          id?: string
          marked?: boolean
          next_due_at?: string | null
          owner_id?: string
          request_id?: string
          response?: Json
          review_requested?: boolean
          revision?: number
          study_item_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_attempt_id_version_id_owner_id_fkey"
            columns: ["attempt_id", "version_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id", "version_id", "owner_id"]
          },
          {
            foreignKeyName: "answers_grading_job_id_fkey"
            columns: ["grading_job_id"]
            isOneToOne: false
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_study_item_id_version_id_owner_id_fkey"
            columns: ["study_item_id", "version_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "study_items"
            referencedColumns: ["id", "version_id", "owner_id"]
          },
        ]
      }
      assets: {
        Row: {
          bytes: number
          id: string
          material_id: string | null
          metadata: Json
          mime: string
          object_key: string
          owner_id: string
          role: string
          source_sha256: string | null
          space_id: string | null
          study_set_id: string | null
          uploaded_at: string | null
        }
        Insert: {
          bytes: number
          id?: string
          material_id?: string | null
          metadata?: Json
          mime: string
          object_key: string
          owner_id: string
          role?: string
          source_sha256?: string | null
          space_id?: string | null
          study_set_id?: string | null
          uploaded_at?: string | null
        }
        Update: {
          bytes?: number
          id?: string
          material_id?: string | null
          metadata?: Json
          mime?: string
          object_key?: string
          owner_id?: string
          role?: string
          source_sha256?: string | null
          space_id?: string | null
          study_set_id?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_material_id_owner_id_fkey"
            columns: ["material_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "assets_space_owner_fkey"
            columns: ["space_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "assets_study_set_owner_fkey"
            columns: ["study_set_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "study_sets"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      attempts: {
        Row: {
          ai_attempt_limit: number
          ai_grading: boolean
          ai_period_start: string | null
          card_ids: string[]
          deadline_at: string | null
          id: string
          mode: string
          owner_id: string
          request_id: string
          score: number | null
          started_at: string
          state: string
          study_set_id: string
          submit_request_id: string | null
          submitted_at: string | null
          version_id: string
        }
        Insert: {
          ai_attempt_limit?: number
          ai_grading?: boolean
          ai_period_start?: string | null
          card_ids: string[]
          deadline_at?: string | null
          id?: string
          mode: string
          owner_id: string
          request_id: string
          score?: number | null
          started_at?: string
          state?: string
          study_set_id: string
          submit_request_id?: string | null
          submitted_at?: string | null
          version_id: string
        }
        Update: {
          ai_attempt_limit?: number
          ai_grading?: boolean
          ai_period_start?: string | null
          card_ids?: string[]
          deadline_at?: string | null
          id?: string
          mode?: string
          owner_id?: string
          request_id?: string
          score?: number | null
          started_at?: string
          state?: string
          study_set_id?: string
          submit_request_id?: string | null
          submitted_at?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempts_version_id_study_set_id_owner_id_fkey"
            columns: ["version_id", "study_set_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "study_set_versions"
            referencedColumns: ["id", "study_set_id", "owner_id"]
          },
        ]
      }
      conversation_sources: {
        Row: {
          conversation_id: string
          extraction_version: number
          material_id: string
          owner_id: string
        }
        Insert: {
          conversation_id: string
          extraction_version: number
          material_id: string
          owner_id: string
        }
        Update: {
          conversation_id?: string
          extraction_version?: number
          material_id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_sources_conversation_id_owner_id_fkey"
            columns: ["conversation_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "conversation_sources_material_id_owner_id_fkey"
            columns: ["material_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          material_id: string
          owner_id: string
          preferences: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          owner_id: string
          preferences?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          owner_id?: string
          preferences?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_material_id_owner_id_fkey"
            columns: ["material_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "conversations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_review_state: {
        Row: {
          due_at: string | null
          interval_minutes: number
          owner_id: string
          repetitions: number
          scheduler_version: number
          starred: boolean
          study_item_id: string
          updated_at: string
        }
        Insert: {
          due_at?: string | null
          interval_minutes?: number
          owner_id: string
          repetitions?: number
          scheduler_version?: number
          starred?: boolean
          study_item_id: string
          updated_at?: string
        }
        Update: {
          due_at?: string | null
          interval_minutes?: number
          owner_id?: string
          repetitions?: number
          scheduler_version?: number
          starred?: boolean
          study_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_review_state_study_item_id_owner_id_fkey"
            columns: ["study_item_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "study_items"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      folders: {
        Row: {
          created_at: string
          creation_space_id: string
          creation_title: string | null
          id: string
          owner_id: string
          request_id: string
          revision: number
          space_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creation_space_id: string
          creation_title?: string | null
          id?: string
          owner_id: string
          request_id: string
          revision?: number
          space_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creation_space_id?: string
          creation_title?: string | null
          id?: string
          owner_id?: string
          request_id?: string
          revision?: number
          space_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_space_id_owner_id_fkey"
            columns: ["space_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      generation_runs: {
        Row: {
          created_at: string
          error_code: string | null
          id: string
          job_id: string
          model: string | null
          operation: string
          output: Json | null
          owner_id: string
          prompt_version: string
          provider_request_id: string | null
          rejected_output: Json | null
          status: string
          usage: Json | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          id: string
          job_id: string
          model?: string | null
          operation: string
          output?: Json | null
          owner_id: string
          prompt_version?: string
          provider_request_id?: string | null
          rejected_output?: Json | null
          status?: string
          usage?: Json | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          id?: string
          job_id?: string
          model?: string | null
          operation?: string
          output?: Json | null
          owner_id?: string
          prompt_version?: string
          provider_request_id?: string | null
          rejected_output?: Json | null
          status?: string
          usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_runs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      material_annotations: {
        Row: {
          body: string
          color: string
          created_at: string
          creation_fingerprint: string
          extraction_version: number
          id: string
          locator: Json
          material_id: string
          owner_id: string
          revision: number
          updated_at: string
        }
        Insert: {
          body?: string
          color?: string
          created_at?: string
          creation_fingerprint: string
          extraction_version: number
          id: string
          locator: Json
          material_id: string
          owner_id: string
          revision?: number
          updated_at?: string
        }
        Update: {
          body?: string
          color?: string
          created_at?: string
          creation_fingerprint?: string
          extraction_version?: number
          id?: string
          locator?: Json
          material_id?: string
          owner_id?: string
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_annotations_material_id_owner_id_fkey"
            columns: ["material_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "material_annotations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      material_reading_state: {
        Row: {
          active_tab: string
          extraction_version: number
          locator: Json
          material_id: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          active_tab?: string
          extraction_version: number
          locator?: Json
          material_id: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          active_tab?: string
          extraction_version?: number
          locator?: Json
          material_id?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_reading_state_material_id_owner_id_fkey"
            columns: ["material_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "material_reading_state_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string
          deleted_at: string | null
          error_code: string | null
          extraction_version: number
          folder_id: string | null
          id: string
          initial_folder_request: Json
          location_revision: number
          owner_id: string
          request_id: string
          source_type: string
          source_url: string | null
          space_id: string | null
          status: string
          title: string
          updated_at: string
          youtube_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          error_code?: string | null
          extraction_version?: number
          folder_id?: string | null
          id?: string
          initial_folder_request?: Json
          location_revision?: number
          owner_id: string
          request_id: string
          source_type: string
          source_url?: string | null
          space_id?: string | null
          status?: string
          title: string
          updated_at?: string
          youtube_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          error_code?: string | null
          extraction_version?: number
          folder_id?: string | null
          id?: string
          initial_folder_request?: Json
          location_revision?: number
          owner_id?: string
          request_id?: string
          source_type?: string
          source_url?: string | null
          space_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_folder_owner_space_fkey"
            columns: ["folder_id", "space_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id", "space_id", "owner_id"]
          },
          {
            foreignKeyName: "materials_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_space_id_owner_id_fkey"
            columns: ["space_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      message_citations: {
        Row: {
          id: string
          message_id: string
          owner_id: string
          page: number
          quote: string
          source_segment_id: string
        }
        Insert: {
          id?: string
          message_id: string
          owner_id: string
          page: number
          quote: string
          source_segment_id: string
        }
        Update: {
          id?: string
          message_id?: string
          owner_id?: string
          page?: number
          quote?: string
          source_segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_citations_message_id_owner_id_fkey"
            columns: ["message_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "message_citations_source_segment_id_fkey"
            columns: ["source_segment_id"]
            isOneToOne: false
            referencedRelation: "source_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          owner_id: string
          preferences: Json
          request_id: string
          role: string
          source_versions: Json
          state: string
          web_sources: Json
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          owner_id: string
          preferences?: Json
          request_id: string
          role: string
          source_versions?: Json
          state?: string
          web_sources?: Json
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          preferences?: Json
          request_id?: string
          role?: string
          source_versions?: Json
          state?: string
          web_sources?: Json
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_owner_id_fkey"
            columns: ["conversation_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempt: number
          created_at: string
          dedupe_key: string
          error_code: string | null
          id: string
          lease_token: string | null
          lease_until: string | null
          message_id: number | null
          owner_id: string
          payload: Json
          payload_hash: string | null
          provider_id: string | null
          provider_started_at: string | null
          sent_at: string | null
          state: string
          template: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          dedupe_key: string
          error_code?: string | null
          id: string
          lease_token?: string | null
          lease_until?: string | null
          message_id?: number | null
          owner_id: string
          payload: Json
          payload_hash?: string | null
          provider_id?: string | null
          provider_started_at?: string | null
          sent_at?: string | null
          state?: string
          template?: string
        }
        Update: {
          attempt?: number
          created_at?: string
          dedupe_key?: string
          error_code?: string | null
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          message_id?: number | null
          owner_id?: string
          payload?: Json
          payload_hash?: string | null
          provider_id?: string | null
          provider_started_at?: string | null
          sent_at?: string | null
          state?: string
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          body_sha256: string
          details: Json
          error_code: string | null
          event_type: string
          id: string
          livemode: boolean
          order_id: string | null
          owner_id: string | null
          payment_id: string | null
          processed_at: string | null
          provider_event_id: string
          received_at: string
          state: string
        }
        Insert: {
          body_sha256: string
          details: Json
          error_code?: string | null
          event_type: string
          id?: string
          livemode?: boolean
          order_id?: string | null
          owner_id?: string | null
          payment_id?: string | null
          processed_at?: string | null
          provider_event_id: string
          received_at?: string
          state?: string
        }
        Update: {
          body_sha256?: string
          details?: Json
          error_code?: string | null
          event_type?: string
          id?: string
          livemode?: boolean
          order_id?: string | null
          owner_id?: string | null
          payment_id?: string | null
          processed_at?: string | null
          provider_event_id?: string
          received_at?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_orders: {
        Row: {
          amount: number
          checked_at: string | null
          checkout_id: string | null
          checkout_request: Json | null
          checkout_url: string | null
          created_at: string
          currency: string
          error_code: string | null
          id: string
          livemode: boolean
          operation_token: string | null
          operation_until: string | null
          owner_id: string
          paid_at: string | null
          payment_id: string | null
          payment_intent_id: string | null
          plan_id: string
          provider_attempted_at: string | null
          provider_key_hash: string | null
          reference_number: string
          refunded_amount: number
          refunded_at: string | null
          request_id: string
          state: string
          updated_at: string
        }
        Insert: {
          amount?: number
          checked_at?: string | null
          checkout_id?: string | null
          checkout_request?: Json | null
          checkout_url?: string | null
          created_at?: string
          currency?: string
          error_code?: string | null
          id?: string
          livemode?: boolean
          operation_token?: string | null
          operation_until?: string | null
          owner_id: string
          paid_at?: string | null
          payment_id?: string | null
          payment_intent_id?: string | null
          plan_id: string
          provider_attempted_at?: string | null
          provider_key_hash?: string | null
          reference_number: string
          refunded_amount?: number
          refunded_at?: string | null
          request_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          checked_at?: string | null
          checkout_id?: string | null
          checkout_request?: Json | null
          checkout_url?: string | null
          created_at?: string
          currency?: string
          error_code?: string | null
          id?: string
          livemode?: boolean
          operation_token?: string | null
          operation_until?: string | null
          owner_id?: string
          paid_at?: string | null
          payment_id?: string | null
          payment_intent_id?: string | null
          plan_id?: string
          provider_attempted_at?: string | null
          provider_key_hash?: string | null
          reference_number?: string
          refunded_amount?: number
          refunded_at?: string | null
          request_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          currency: string | null
          duration_days: number | null
          id: string
          limits: Json
          price_centavos: number | null
          version: number
        }
        Insert: {
          code: string
          currency?: string | null
          duration_days?: number | null
          id?: string
          limits: Json
          price_centavos?: number | null
          version?: number
        }
        Update: {
          code?: string
          currency?: string | null
          duration_days?: number | null
          id?: string
          limits?: Json
          price_centavos?: number | null
          version?: number
        }
        Relationships: []
      }
      polar_checkouts: {
        Row: {
          checkout_id: string | null
          created_at: string
          currency: string
          environment: string
          expires_at: string
          id: string
          owner_id: string
          state: string
          url: string | null
        }
        Insert: {
          checkout_id?: string | null
          created_at?: string
          currency: string
          environment: string
          expires_at?: string
          id?: string
          owner_id: string
          state?: string
          url?: string | null
        }
        Update: {
          checkout_id?: string | null
          created_at?: string
          currency?: string
          environment?: string
          expires_at?: string
          id?: string
          owner_id?: string
          state?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "polar_checkouts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      polar_customers: {
        Row: {
          cancel_at_period_end: boolean
          customer_id: string
          environment: string
          observed_at: string
          owner_id: string
          period_end: string | null
          period_start: string | null
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean
          customer_id: string
          environment: string
          observed_at: string
          owner_id: string
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean
          customer_id?: string
          environment?: string
          observed_at?: string
          owner_id?: string
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "polar_customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      polar_runtime: {
        Row: {
          environment: string
          singleton: boolean
        }
        Insert: {
          environment: string
          singleton?: boolean
        }
        Update: {
          environment?: string
          singleton?: boolean
        }
        Relationships: []
      }
      polar_sync_events: {
        Row: {
          environment: string
          event_id: string
          owner_id: string
        }
        Insert: {
          environment: string
          event_id: string
          owner_id: string
        }
        Update: {
          environment?: string
          event_id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "polar_sync_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_jobs: {
        Row: {
          attempt: number
          attempt_id: string | null
          created_at: string
          error_code: string | null
          id: string
          input: Json
          kind: string
          lease_token: string | null
          lease_until: string | null
          material_id: string | null
          message_id: number | null
          owner_id: string
          state: string
          study_set_id: string | null
          updated_at: string
        }
        Insert: {
          attempt?: number
          attempt_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          input?: Json
          kind?: string
          lease_token?: string | null
          lease_until?: string | null
          material_id?: string | null
          message_id?: number | null
          owner_id: string
          state?: string
          study_set_id?: string | null
          updated_at?: string
        }
        Update: {
          attempt?: number
          attempt_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          input?: Json
          kind?: string
          lease_token?: string | null
          lease_until?: string | null
          material_id?: string | null
          message_id?: number | null
          owner_id?: string
          state?: string
          study_set_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_attempt_owner_fkey"
            columns: ["attempt_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "processing_jobs_material_id_owner_id_fkey"
            columns: ["material_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "processing_jobs_study_owner_fkey"
            columns: ["study_set_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "study_sets"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          onboarding_completed_at: string | null
          preferences: Json
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          onboarding_completed_at?: string | null
          preferences?: Json
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed_at?: string | null
          preferences?: Json
        }
        Relationships: []
      }
      share_links: {
        Row: {
          artifact_snapshot: Json | null
          created_at: string
          expires_at: string | null
          id: string
          include_sources: boolean
          owner_id: string
          request_data: Json
          request_id: string
          revoked_at: string | null
          snapshot: Json
          source_snapshot: Json
          study_set_id: string
          title: string
          token_hash: string
          type: string
          version_id: string
        }
        Insert: {
          artifact_snapshot?: Json | null
          created_at?: string
          expires_at?: string | null
          id?: string
          include_sources?: boolean
          owner_id: string
          request_data: Json
          request_id: string
          revoked_at?: string | null
          snapshot: Json
          source_snapshot: Json
          study_set_id: string
          title: string
          token_hash: string
          type: string
          version_id: string
        }
        Update: {
          artifact_snapshot?: Json | null
          created_at?: string
          expires_at?: string | null
          id?: string
          include_sources?: boolean
          owner_id?: string
          request_data?: Json
          request_id?: string
          revoked_at?: string | null
          snapshot?: Json
          source_snapshot?: Json
          study_set_id?: string
          title?: string
          token_hash?: string
          type?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_version_id_study_set_id_owner_id_fkey"
            columns: ["version_id", "study_set_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "study_set_versions"
            referencedColumns: ["id", "study_set_id", "owner_id"]
          },
        ]
      }
      source_segments: {
        Row: {
          embedding: string | null
          embedding_hash: string | null
          embedding_model: string | null
          embedding_state: string
          embedding_version: number
          extraction_method: string
          extraction_status: string
          extraction_version: number
          id: string
          locator: Json
          material_id: string
          ordinal: number
          owner_id: string
          search_text: unknown
          text: string
          unreadable_regions: Json
        }
        Insert: {
          embedding?: string | null
          embedding_hash?: string | null
          embedding_model?: string | null
          embedding_state?: string
          embedding_version?: number
          extraction_method?: string
          extraction_status?: string
          extraction_version: number
          id?: string
          locator: Json
          material_id: string
          ordinal: number
          owner_id: string
          search_text?: unknown
          text: string
          unreadable_regions?: Json
        }
        Update: {
          embedding?: string | null
          embedding_hash?: string | null
          embedding_model?: string | null
          embedding_state?: string
          embedding_version?: number
          extraction_method?: string
          extraction_status?: string
          extraction_version?: number
          id?: string
          locator?: Json
          material_id?: string
          ordinal?: number
          owner_id?: string
          search_text?: unknown
          text?: string
          unreadable_regions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "source_segments_material_id_owner_id_fkey"
            columns: ["material_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      spaces: {
        Row: {
          created_at: string
          description: string | null
          details_revision: number
          icon_color: string | null
          icon_name: string | null
          id: string
          is_pinned: boolean
          owner_id: string
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          details_revision?: number
          icon_color?: string | null
          icon_name?: string | null
          id?: string
          is_pinned?: boolean
          owner_id: string
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          details_revision?: number
          icon_color?: string | null
          icon_name?: string | null
          id?: string
          is_pinned?: boolean
          owner_id?: string
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_items: {
        Row: {
          answer: Json
          citations: Json
          id: string
          kind: string
          logical_id: string
          owner_id: string
          position: number
          prompt: Json
          rubric: Json
          version_id: string
        }
        Insert: {
          answer: Json
          citations?: Json
          id?: string
          kind: string
          logical_id?: string
          owner_id: string
          position: number
          prompt: Json
          rubric?: Json
          version_id: string
        }
        Update: {
          answer?: Json
          citations?: Json
          id?: string
          kind?: string
          logical_id?: string
          owner_id?: string
          position?: number
          prompt?: Json
          rubric?: Json
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_items_version_id_owner_id_fkey"
            columns: ["version_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "study_set_versions"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      study_set_sources: {
        Row: {
          extraction_version: number
          material_id: string
          owner_id: string
          version_id: string
        }
        Insert: {
          extraction_version: number
          material_id: string
          owner_id: string
          version_id: string
        }
        Update: {
          extraction_version?: number
          material_id?: string
          owner_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_set_sources_material_id_owner_id_fkey"
            columns: ["material_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "study_set_sources_version_id_owner_id_fkey"
            columns: ["version_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "study_set_versions"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      study_set_versions: {
        Row: {
          content: Json
          created_at: string
          id: string
          owner_id: string
          settings: Json
          study_set_id: string
          version: number
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          owner_id: string
          settings?: Json
          study_set_id: string
          version: number
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          owner_id?: string
          settings?: Json
          study_set_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_set_versions_study_set_id_owner_id_fkey"
            columns: ["study_set_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "study_sets"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      study_sets: {
        Row: {
          created_at: string
          draft_content: Json
          draft_revision: number
          error_code: string | null
          id: string
          material_id: string | null
          owner_id: string
          source_unavailable: boolean
          space_id: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          draft_content?: Json
          draft_revision?: number
          error_code?: string | null
          id?: string
          material_id?: string | null
          owner_id: string
          source_unavailable?: boolean
          space_id?: string | null
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          draft_content?: Json
          draft_revision?: number
          error_code?: string | null
          id?: string
          material_id?: string | null
          owner_id?: string
          source_unavailable?: boolean
          space_id?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sets_material_id_owner_id_fkey"
            columns: ["material_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "study_sets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sets_space_id_owner_id_fkey"
            columns: ["space_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      transcription_callbacks: {
        Row: {
          id: string
          job_id: string
          provider_id: string
          received_at: string
          status: string
        }
        Insert: {
          id?: string
          job_id: string
          provider_id: string
          received_at?: string
          status: string
        }
        Update: {
          id?: string
          job_id?: string
          provider_id?: string
          received_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcription_callbacks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "transcription_runs"
            referencedColumns: ["job_id"]
          },
        ]
      }
      transcription_runs: {
        Row: {
          audio_asset: Json | null
          created_at: string
          duration_ms: number
          error_code: string | null
          job_id: string
          material_id: string
          output: Json | null
          owner_id: string
          poll_count: number
          provider_audio_url: string | null
          provider_id: string | null
          rate_usd_per_hour: number
          request_version: string
          source_info: Json
          source_sha256: string
          state: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          audio_asset?: Json | null
          created_at?: string
          duration_ms: number
          error_code?: string | null
          job_id: string
          material_id: string
          output?: Json | null
          owner_id: string
          poll_count?: number
          provider_audio_url?: string | null
          provider_id?: string | null
          rate_usd_per_hour?: number
          request_version?: string
          source_info: Json
          source_sha256: string
          state?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          audio_asset?: Json | null
          created_at?: string
          duration_ms?: number
          error_code?: string | null
          job_id?: string
          material_id?: string
          output?: Json | null
          owner_id?: string
          poll_count?: number
          provider_audio_url?: string | null
          provider_id?: string | null
          rate_usd_per_hour?: number
          request_version?: string
          source_info?: Json
          source_sha256?: string
          state?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcription_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcription_runs_material_id_owner_id_fkey"
            columns: ["material_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      usage_ledger: {
        Row: {
          cost_usd: number | null
          created_at: string
          feature: string
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          owner_id: string
          period_id: string
          processing_job_id: string | null
          provider_response_id: string | null
          provider_usage: Json
          reserved_cost_usd: number
          status: string
          units: number
          updated_at: string
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          feature: string
          id: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          owner_id: string
          period_id: string
          processing_job_id?: string | null
          provider_response_id?: string | null
          provider_usage?: Json
          reserved_cost_usd?: number
          status: string
          units?: number
          updated_at?: string
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          feature?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          owner_id?: string
          period_id?: string
          processing_job_id?: string | null
          provider_response_id?: string | null
          provider_usage?: Json
          reserved_cost_usd?: number
          status?: string
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_ledger_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "usage_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_processing_job_id_fkey"
            columns: ["processing_job_id"]
            isOneToOne: false
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_periods: {
        Row: {
          ends_at: string
          grant_id: string | null
          id: string
          limits_snapshot: Json
          owner_id: string
          plan_id: string | null
          starts_at: string
        }
        Insert: {
          ends_at: string
          grant_id?: string | null
          id?: string
          limits_snapshot?: Json
          owner_id: string
          plan_id?: string | null
          starts_at: string
        }
        Update: {
          ends_at?: string
          grant_id?: string | null
          id?: string
          limits_snapshot?: Json
          owner_id?: string
          plan_id?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_periods_grant_owner_fkey"
            columns: ["grant_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "access_grants"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "usage_periods_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_periods_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_export_snapshot: { Args: { p_owner_id: string }; Returns: Json }
      account_is_active: { Args: never; Returns: boolean }
      assessment_attempt_payload: {
        Args: { p_attempt_id: string; p_owner_id: string }
        Returns: Json
      }
      assessment_grading_input: {
        Args: { p_job_id: string; p_lease_token: string }
        Returns: Json
      }
      assessment_normalize: { Args: { p_text: string }; Returns: string }
      begin_chat_retrieval: {
        Args: { p_owner_id: string; p_request_id: string }
        Returns: Json
      }
      begin_material_ocr_page: {
        Args: {
          p_input_tokens: number
          p_job_id: string
          p_lease_token: string
          p_page: number
          p_reserved_usd: number
        }
        Returns: Json
      }
      begin_media_transcription: {
        Args: { p_audio_url: string; p_job_id: string; p_lease_token: string }
        Returns: Json
      }
      begin_notification_delivery: {
        Args: { p_id: string; p_lease_token: string; p_payload_hash: string }
        Returns: boolean
      }
      begin_source_index_batch: {
        Args: {
          p_job_id: string
          p_lease_token: string
          p_max_cost_usd?: number
        }
        Returns: Json
      }
      begin_study_speech: {
        Args: {
          p_characters: number
          p_job_id: string
          p_lease_token: string
          p_script_sha256: string
        }
        Returns: Json
      }
      billing_account_context: { Args: { p_owner_id: string }; Returns: Json }
      billing_active_operations: {
        Args: { p_include_queued?: boolean; p_owner_id: string }
        Returns: number
      }
      billing_usage_totals: {
        Args: { p_owner_id: string; p_period_id: string }
        Returns: Json
      }
      checkpoint_account_data_job: {
        Args: {
          p_bytes?: number
          p_error?: string
          p_id: string
          p_lease_token: string
          p_stage: string
        }
        Returns: boolean
      }
      checkpoint_chat: {
        Args: { p_owner_id: string; p_request_id: string; p_text: string }
        Returns: boolean
      }
      checkpoint_chat_retrieval: {
        Args: { p_owner_id: string; p_request_id: string; p_usage: Json }
        Returns: boolean
      }
      checkpoint_chat_search: {
        Args: {
          p_evidence: Json
          p_owner_id: string
          p_request_id: string
          p_usage: Json
        }
        Returns: boolean
      }
      checkpoint_material_ocr_page: {
        Args: {
          p_job_id: string
          p_lease_token: string
          p_output: Json
          p_page: number
          p_usage: Json
        }
        Returns: boolean
      }
      checkpoint_media_output: {
        Args: { p_job_id: string; p_lease_token: string; p_output: Json }
        Returns: boolean
      }
      checkpoint_source_index_batch: {
        Args: {
          p_batch_id: string
          p_job_id: string
          p_lease_token: string
          p_usage: Json
          p_vectors: Json
        }
        Returns: boolean
      }
      checkpoint_study_artifact: {
        Args: {
          p_bytes: number
          p_duration_ms: number
          p_job_id: string
          p_lease_token: string
          p_provider_id: string
          p_role: string
          p_sha256: string
        }
        Returns: boolean
      }
      checkpoint_study_generation: {
        Args: {
          p_job_id: string
          p_lease_token: string
          p_payload: Json
          p_usage: Json
        }
        Returns: boolean
      }
      checkpoint_study_rejection: {
        Args: {
          p_job_id: string
          p_lease_token: string
          p_payload: Json
          p_reason: string
          p_usage: Json
        }
        Returns: boolean
      }
      checkpoint_youtube_metadata: {
        Args: { p_job_id: string; p_lease_token: string; p_metadata: Json }
        Returns: boolean
      }
      claim_account_data_job: { Args: never; Returns: Json }
      claim_material_before_index: {
        Args: { p_visibility_seconds?: number }
        Returns: {
          bytes: number
          input: Json
          job_id: string
          lease_token: string
          material_id: string
          object_key: string
          owner_id: string
          source_sha256: string
          source_type: string
        }[]
      }
      claim_material_job: {
        Args: {
          p_include_index?: boolean
          p_index_material_ids?: string[]
          p_visibility_seconds?: number
        }
        Returns: {
          bytes: number
          input: Json
          job_id: string
          lease_token: string
          material_id: string
          object_key: string
          owner_id: string
          source_sha256: string
          source_type: string
        }[]
      }
      claim_notification_job: { Args: never; Returns: Json }
      claim_study_job: {
        Args: never
        Returns: {
          attempt_id: string
          cached_output: Json
          cached_usage: Json
          input: Json
          job_id: string
          lease_token: string
          owner_id: string
          request_id: string
          study_set_id: string
          type: string
        }[]
      }
      complete_onboarding: {
        Args: {
          p_course: string
          p_intent: string
          p_name: string
          p_school: string
          p_title: string
        }
        Returns: string
      }
      confirm_normalized_audio: {
        Args: { p_job_id: string; p_lease_token: string; p_sha256: string }
        Returns: boolean
      }
      confirm_normalized_pdf: {
        Args: { p_job_id: string; p_lease_token: string; p_sha256: string }
        Returns: boolean
      }
      create_material_annotation: {
        Args: {
          p_annotation_id: string
          p_body?: string
          p_color?: string
          p_extraction_version: number
          p_locator: Json
          p_material_id: string
          p_owner_id: string
        }
        Returns: Json
      }
      create_output_share: {
        Args: {
          p_expires_at?: string
          p_include_sources?: boolean
          p_owner_id: string
          p_request_id: string
          p_revision: number
          p_study_set_id: string
          p_token_hash: string
          p_version_id?: string
        }
        Returns: Json
      }
      create_space_folder: {
        Args: {
          p_owner_id: string
          p_request_id: string
          p_space_id: string
          p_title?: string
        }
        Returns: Json
      }
      create_standalone_chat: {
        Args: {
          p_owner_id: string
          p_question: string
          p_request_id: string
          p_source_ids?: string[]
        }
        Returns: Json
      }
      create_untitled_space: {
        Args: { p_owner_id: string; p_space_id: string }
        Returns: Json
      }
      delete_material_annotation: {
        Args: {
          p_annotation_id: string
          p_extraction_version: number
          p_material_id: string
          p_owner_id: string
          p_revision: number
        }
        Returns: Json
      }
      delete_space_folder: {
        Args: { p_folder_id: string; p_owner_id: string; p_revision: number }
        Returns: Json
      }
      edit_flashcard: {
        Args: {
          p_back: string
          p_card_id: string
          p_explanation: string
          p_front: string
          p_owner_id: string
          p_revision: number
          p_study_set_id: string
        }
        Returns: Json
      }
      edit_material_annotation: {
        Args: {
          p_annotation_id: string
          p_body: string
          p_color: string
          p_extraction_version: number
          p_material_id: string
          p_owner_id: string
          p_revision: number
        }
        Returns: Json
      }
      fail_material_job: {
        Args: { p_error: string; p_job_id: string; p_lease_token: string }
        Returns: boolean
      }
      fail_media_job: {
        Args: {
          p_cost_usd?: number
          p_error: string
          p_job_id: string
          p_lease_token: string
          p_uncertain: boolean
        }
        Returns: boolean
      }
      fail_queued_chat_request: {
        Args: {
          p_material_id: string
          p_owner_id: string
          p_request_id: string
        }
        Returns: boolean
      }
      fail_source_index: {
        Args: {
          p_job_id: string
          p_lease_token: string
          p_reason: string
          p_uncertain: boolean
          p_usage?: Json
        }
        Returns: boolean
      }
      fail_study_generation_v1: {
        Args: {
          p_error: string
          p_job_id: string
          p_lease_token: string
          p_uncertain: boolean
          p_usage?: Json
        }
        Returns: boolean
      }
      fail_study_job: {
        Args: {
          p_error: string
          p_job_id: string
          p_lease_token: string
          p_uncertain: boolean
          p_usage?: Json
        }
        Returns: boolean
      }
      fail_study_speech: {
        Args: {
          p_cost_usd?: number
          p_error: string
          p_job_id: string
          p_lease_token: string
          p_uncertain: boolean
        }
        Returns: boolean
      }
      finish_chat: {
        Args: {
          p_answer: string
          p_citations: Json
          p_owner_id: string
          p_request_id: string
          p_usage: Json
        }
        Returns: string
      }
      finish_material_job: {
        Args: { p_job_id: string; p_lease_token: string; p_segments: Json }
        Returns: boolean
      }
      finish_media_job: {
        Args: { p_job_id: string; p_lease_token: string }
        Returns: boolean
      }
      finish_notification_delivery: {
        Args: {
          p_error?: string
          p_id: string
          p_lease_token: string
          p_provider_id?: string
          p_state: string
        }
        Returns: boolean
      }
      finish_study_before_outputs: {
        Args: {
          p_cards: Json
          p_content: Json
          p_job_id: string
          p_lease_token: string
          p_usage: Json
        }
        Returns: boolean
      }
      finish_study_generation_v1: {
        Args: {
          p_cards: Json
          p_content: Json
          p_job_id: string
          p_lease_token: string
          p_usage: Json
        }
        Returns: boolean
      }
      finish_study_job: {
        Args: {
          p_cards: Json
          p_content: Json
          p_job_id: string
          p_lease_token: string
          p_usage: Json
        }
        Returns: boolean
      }
      flashcard_attempt_payload: {
        Args: { p_attempt_id: string; p_owner_id: string }
        Returns: Json
      }
      get_assessment_attempt: {
        Args: { p_attempt_id: string; p_owner_id: string }
        Returns: Json
      }
      get_media_run: {
        Args: { p_job_id: string; p_lease_token: string }
        Returns: Json
      }
      get_study_media: {
        Args: { p_job_id: string; p_lease_token: string }
        Returns: Json
      }
      grade_objective_question: {
        Args: {
          p_item: Database["public"]["Tables"]["study_items"]["Row"]
          p_response: Json
        }
        Returns: Json
      }
      hybrid_source_search: {
        Args: {
          p_embedding?: string
          p_material_ids: string[]
          p_query: string
          p_request_id?: string
        }
        Returns: {
          id: string
          locator: Json
          material_id: string
          page: number
          score: number
          semantic_ready: boolean
          text: string
          title: string
        }[]
      }
      move_material_location: {
        Args: {
          p_folder_id: string
          p_material_id: string
          p_owner_id: string
          p_revision: number
          p_space_id: string
        }
        Returns: Json
      }
      move_space_folder: {
        Args: {
          p_folder_id: string
          p_owner_id: string
          p_revision: number
          p_space_id: string
        }
        Returns: Json
      }
      notification_is_current: { Args: { p_id: string }; Returns: boolean }
      notification_paid_expiry: {
        Args: { p_owner_id: string }
        Returns: string
      }
      operations_begin_action: {
        Args: {
          p_action: string
          p_actor_id: string
          p_request_id: string
          p_target_id: string
        }
        Returns: Json
      }
      operations_finish_action: {
        Args: {
          p_details: Json
          p_error?: string
          p_request_id: string
          p_status: string
        }
        Returns: boolean
      }
      operations_retry_job: {
        Args: { p_actor_id: string; p_job_id: string; p_request_id: string }
        Returns: Json
      }
      operations_retry_safety: { Args: { p_job_id: string }; Returns: Json }
      operations_snapshot: { Args: never; Returns: Json }
      pin_space: {
        Args: { p_owner_id: string; p_pinned: boolean; p_space_id: string }
        Returns: Json
      }
      queue_assessment_grading: {
        Args: {
          p_answer_ids: string[]
          p_attempt_id: string
          p_owner_id: string
        }
        Returns: undefined
      }
      queue_material: {
        Args: { p_material_id: string; p_owner_id: string; p_retry?: boolean }
        Returns: {
          created_at: string
          deleted_at: string | null
          error_code: string | null
          extraction_version: number
          folder_id: string | null
          id: string
          initial_folder_request: Json
          location_revision: number
          owner_id: string
          request_id: string
          source_type: string
          source_url: string | null
          space_id: string | null
          status: string
          title: string
          updated_at: string
          youtube_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "materials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      queue_source_index: {
        Args: { p_material_id: string; p_owner_id: string }
        Returns: boolean
      }
      queue_study_generation: {
        Args: {
          p_limit?: number
          p_material_id: string
          p_owner_id: string
          p_request_id: string
          p_settings: Json
          p_source_ids: string[]
          p_type: string
        }
        Returns: Json
      }
      rate_flashcard: {
        Args: {
          p_attempt_id: string
          p_card_id: string
          p_owner_id: string
          p_rating: string
          p_request_id: string
          p_study_set_id: string
        }
        Returns: Json
      }
      record_media_callback: {
        Args: {
          p_audio_url: string
          p_job_id: string
          p_provider_id: string
          p_status: string
        }
        Returns: boolean
      }
      recover_study_save: {
        Args: { p_owner_id: string; p_study_set_id: string }
        Returns: boolean
      }
      refresh_assessment_score: {
        Args: { p_attempt_id: string; p_owner_id: string }
        Returns: undefined
      }
      rename_space_folder: {
        Args: {
          p_folder_id: string
          p_owner_id: string
          p_revision: number
          p_title: string
        }
        Returns: Json
      }
      renew_material_job: {
        Args: { p_job_id: string; p_lease_token: string }
        Returns: boolean
      }
      renew_study_output_job: {
        Args: { p_job_id: string; p_lease_token: string }
        Returns: boolean
      }
      reorder_spaces: {
        Args: { p_owner_id: string; p_pinned: boolean; p_space_ids: string[] }
        Returns: Json
      }
      report_assessment_answer: {
        Args: {
          p_attempt_id: string
          p_owner_id: string
          p_question_id: string
        }
        Returns: Json
      }
      polar_finish_checkout: {
        Args: {
          p_checkout_id?: string
          p_environment: string
          p_expires_at?: string
          p_id: string
          p_owner_id: string
          p_state: string
          p_url?: string
        }
        Returns: boolean
      }
      polar_reserve_checkout: {
        Args: { p_currency: string; p_environment: string; p_owner_id: string }
        Returns: Json
      }
      polar_sync_subscription: {
        Args: {
          p_customer_id: string
          p_environment: string
          p_event_id: string
          p_observed_at: string
          p_owner_id: string
          p_subscription: Json
        }
        Returns: boolean
      }
      request_account_data: {
        Args: {
          p_kind: string
          p_owner_id: string
          p_request_id: string
          p_target_id?: string
        }
        Returns: Json
      }
      request_account_data_before_retention: {
        Args: {
          p_kind: string
          p_owner_id: string
          p_request_id: string
          p_target_id?: string
        }
        Returns: Json
      }
      request_support: {
        Args: {
          p_message: string
          p_owner_id: string
          p_reference_id?: string
          p_reference_kind?: string
          p_reply_to: string
          p_request_id: string
          p_subject: string
        }
        Returns: Json
      }
      reserve_chat: {
        Args: {
          p_limit: number
          p_material_id: string
          p_owner_id: string
          p_question: string
          p_request_id: string
        }
        Returns: Json
      }
      reserve_chat_request: {
        Args: {
          p_conversation_id: string
          p_limit: number
          p_material_id: string
          p_owner_id: string
          p_question: string
          p_request_id: string
          p_source_ids: string[]
        }
        Returns: Json
      }
      reserve_configured_chat_request: {
        Args: {
          p_configuration: Json
          p_conversation_id: string
          p_limit: number
          p_material_id: string
          p_owner_id: string
          p_question: string
          p_request_id: string
          p_source_ids: string[]
        }
        Returns: Json
      }
      reserve_file_material_upload: {
        Args: {
          p_bytes: number
          p_extension: string
          p_fingerprint: string
          p_folder_id: string
          p_owner_id: string
          p_request_id: string
          p_space_id: string
          p_title: string
        }
        Returns: {
          created_at: string
          deleted_at: string | null
          error_code: string | null
          extraction_version: number
          folder_id: string | null
          id: string
          initial_folder_request: Json
          location_revision: number
          owner_id: string
          request_id: string
          source_type: string
          source_url: string | null
          space_id: string | null
          status: string
          title: string
          updated_at: string
          youtube_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "materials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_material_in_folder: {
        Args: {
          p_bytes?: number
          p_extension?: string
          p_folder_id: string
          p_kind: string
          p_owner_id: string
          p_request_id: string
          p_sha256?: string
          p_space_id: string
          p_title?: string
          p_video_id?: string
        }
        Returns: {
          created_at: string
          deleted_at: string | null
          error_code: string | null
          extraction_version: number
          folder_id: string | null
          id: string
          initial_folder_request: Json
          location_revision: number
          owner_id: string
          request_id: string
          source_type: string
          source_url: string | null
          space_id: string | null
          status: string
          title: string
          updated_at: string
          youtube_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "materials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_material_processing: {
        Args: {
          p_document_units: number
          p_job_id: string
          p_lease_token: string
          p_ocr_limit?: number
          p_ocr_units: number
          p_page_limit?: number
        }
        Returns: boolean
      }
      reserve_material_upload: {
        Args: {
          p_bytes: number
          p_owner_id: string
          p_request_id: string
          p_space_id: string
          p_storage_limit: number
          p_title: string
        }
        Returns: {
          created_at: string
          deleted_at: string | null
          error_code: string | null
          extraction_version: number
          folder_id: string | null
          id: string
          initial_folder_request: Json
          location_revision: number
          owner_id: string
          request_id: string
          source_type: string
          source_url: string | null
          space_id: string | null
          status: string
          title: string
          updated_at: string
          youtube_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "materials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_media_material_upload: {
        Args: {
          p_bytes: number
          p_extension: string
          p_owner_id: string
          p_request_id: string
          p_space_id: string
          p_title: string
        }
        Returns: {
          created_at: string
          deleted_at: string | null
          error_code: string | null
          extraction_version: number
          folder_id: string | null
          id: string
          initial_folder_request: Json
          location_revision: number
          owner_id: string
          request_id: string
          source_type: string
          source_url: string | null
          space_id: string | null
          status: string
          title: string
          updated_at: string
          youtube_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "materials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_media_processing: {
        Args: {
          p_duration_ms: number
          p_job_id: string
          p_lease_token: string
          p_source_info: Json
          p_source_sha256: string
        }
        Returns: Json
      }
      reserve_normalized_audio: {
        Args: {
          p_bytes: number
          p_job_id: string
          p_lease_token: string
          p_sha256: string
        }
        Returns: Json
      }
      reserve_normalized_pdf: {
        Args: {
          p_bytes: number
          p_job_id: string
          p_lease_token: string
          p_sha256: string
          p_storage_limit?: number
        }
        Returns: Json
      }
      reserve_office_material_upload: {
        Args: {
          p_bytes: number
          p_owner_id: string
          p_request_id: string
          p_source_type: string
          p_space_id: string
          p_storage_limit?: number
          p_title: string
        }
        Returns: {
          created_at: string
          deleted_at: string | null
          error_code: string | null
          extraction_version: number
          folder_id: string | null
          id: string
          initial_folder_request: Json
          location_revision: number
          owner_id: string
          request_id: string
          source_type: string
          source_url: string | null
          space_id: string | null
          status: string
          title: string
          updated_at: string
          youtube_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "materials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_text_material: {
        Args: {
          p_bytes: number
          p_owner_id: string
          p_request_id: string
          p_sha256: string
          p_space_id: string
          p_storage_limit?: number
          p_title: string
        }
        Returns: {
          created_at: string
          deleted_at: string | null
          error_code: string | null
          extraction_version: number
          folder_id: string | null
          id: string
          initial_folder_request: Json
          location_revision: number
          owner_id: string
          request_id: string
          source_type: string
          source_url: string | null
          space_id: string | null
          status: string
          title: string
          updated_at: string
          youtube_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "materials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_youtube_material: {
        Args: {
          p_owner_id: string
          p_request_id: string
          p_space_id: string
          p_video_id: string
        }
        Returns: {
          created_at: string
          deleted_at: string | null
          error_code: string | null
          extraction_version: number
          folder_id: string | null
          id: string
          initial_folder_request: Json
          location_revision: number
          owner_id: string
          request_id: string
          source_type: string
          source_url: string | null
          space_id: string | null
          status: string
          title: string
          updated_at: string
          youtube_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "materials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_output_share: {
        Args: { p_owner_id: string; p_share_id: string }
        Returns: boolean
      }
      save_assessment_answer: {
        Args: {
          p_attempt_id: string
          p_final?: boolean
          p_marked?: boolean
          p_owner_id: string
          p_question_id: string
          p_request_id: string
          p_response: Json
          p_revision: number
        }
        Returns: Json
      }
      save_chat_preferences: {
        Args: {
          p_conversation_id: string
          p_material_id: string
          p_owner_id: string
          p_preferences: Json
        }
        Returns: Json
      }
      save_study_output: {
        Args: {
          p_content: Json
          p_owner_id: string
          p_revision: number
          p_study_set_id: string
          p_version_id: string
        }
        Returns: Json
      }
      schedule_maintenance_notifications: {
        Args: { p_founder_id?: string; p_limit?: number }
        Returns: Json
      }
      set_space_cover: {
        Args: {
          p_bytes: number
          p_object_key: string
          p_owner_id: string
          p_revision: number
          p_sha256: string
          p_space_id: string
        }
        Returns: Json
      }
      settle_chat_before_web: {
        Args: {
          p_citations: Json
          p_owner_id: string
          p_request_id: string
          p_state: string
          p_text: string
          p_usage: Json
        }
        Returns: string
      }
      settle_chat_request: {
        Args: {
          p_citations: Json
          p_owner_id: string
          p_request_id: string
          p_state: string
          p_text: string
          p_usage: Json
        }
        Returns: string
      }
      shared_artifact_by_hash: { Args: { p_token_hash: string }; Returns: Json }
      shared_output_by_hash: { Args: { p_token_hash: string }; Returns: Json }
      shared_source_by_hash: {
        Args: { p_source_key: string; p_token_hash: string }
        Returns: Json
      }
      sharing_advanced_content: {
        Args: { p_content: Json; p_sources: Json }
        Returns: Json
      }
      sharing_citations: {
        Args: { p_citations: Json; p_sources: Json }
        Returns: Json
      }
      sharing_preview: {
        Args: {
          p_include_sources?: boolean
          p_owner_id: string
          p_study_set_id: string
          p_version_id?: string
        }
        Returns: Json
      }
      sharing_preview_before_outputs: {
        Args: {
          p_include_sources?: boolean
          p_owner_id: string
          p_study_set_id: string
          p_version_id?: string
        }
        Returns: Json
      }
      star_flashcard: {
        Args: {
          p_card_id: string
          p_owner_id: string
          p_starred: boolean
          p_study_set_id: string
        }
        Returns: Json
      }
      start_assessment_attempt: {
        Args: {
          p_ai_limit?: number
          p_objective_only?: boolean
          p_owner_id: string
          p_request_id: string
          p_study_set_id: string
        }
        Returns: Json
      }
      start_flashcard_review: {
        Args: {
          p_mode: string
          p_owner_id: string
          p_request_id: string
          p_study_set_id: string
        }
        Returns: Json
      }
      stop_chat_request: {
        Args: {
          p_material_id: string
          p_owner_id: string
          p_request_id: string
        }
        Returns: boolean
      }
      submit_assessment_attempt: {
        Args: { p_attempt_id: string; p_owner_id: string; p_request_id: string }
        Returns: Json
      }
      sweep_abandoned_uploads: { Args: { p_limit?: number }; Returns: number }
      valid_pdf_highlight_locator: {
        Args: { p_locator: Json }
        Returns: boolean
      }
      wait_media_transcription: {
        Args: {
          p_job_id: string
          p_lease_token: string
          p_provider_id?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
    Enums: {},
  },
} as const
