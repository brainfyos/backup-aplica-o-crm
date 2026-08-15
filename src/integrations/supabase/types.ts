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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admin_agent_messages: {
        Row: {
          alert_kind: string | null
          content: string
          created_at: string
          direction: string
          id: string
          message_type: string
          organization_id: string
          reference_id: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          alert_kind?: string | null
          content: string
          created_at?: string
          direction: string
          id?: string
          message_type: string
          organization_id: string
          reference_id?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          alert_kind?: string | null
          content?: string
          created_at?: string
          direction?: string
          id?: string
          message_type?: string
          organization_id?: string
          reference_id?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_agent_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          created_by: string | null
          emails_failed: number | null
          emails_sent: number | null
          id: string
          message: string | null
          organization_id: string
          recipients_count: number | null
          scope: string
          scope_filters: Json | null
          send_app: boolean | null
          send_email: boolean | null
          sent_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"] | null
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          created_by?: string | null
          emails_failed?: number | null
          emails_sent?: number | null
          id?: string
          message?: string | null
          organization_id: string
          recipients_count?: number | null
          scope?: string
          scope_filters?: Json | null
          send_app?: boolean | null
          send_email?: boolean | null
          sent_at?: string | null
          title: string
          type?: Database["public"]["Enums"]["notification_type"] | null
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          created_by?: string | null
          emails_failed?: number | null
          emails_sent?: number | null
          id?: string
          message?: string | null
          organization_id?: string
          recipients_count?: number | null
          scope?: string
          scope_filters?: Json | null
          send_app?: boolean | null
          send_email?: boolean | null
          sent_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_action_logs: {
        Row: {
          action_data: Json | null
          action_type: string
          agent_id: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          lead_id: string | null
          organization_id: string
          product_id: string | null
          result: Json | null
          success: boolean
        }
        Insert: {
          action_data?: Json | null
          action_type: string
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          product_id?: string | null
          result?: Json | null
          success?: boolean
        }
        Update: {
          action_data?: Json | null
          action_type?: string
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          product_id?: string | null
          result?: Json | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agent_action_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_activation_logs: {
        Row: {
          channel: string | null
          conversation_id: string | null
          created_at: string
          from_agent_id: string | null
          id: string
          lead_id: string | null
          match_type: string | null
          matched_term: string | null
          organization_id: string
          product_id: string | null
          to_agent_id: string | null
        }
        Insert: {
          channel?: string | null
          conversation_id?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          lead_id?: string | null
          match_type?: string | null
          matched_term?: string | null
          organization_id: string
          product_id?: string | null
          to_agent_id?: string | null
        }
        Update: {
          channel?: string | null
          conversation_id?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          lead_id?: string | null
          match_type?: string | null
          matched_term?: string | null
          organization_id?: string
          product_id?: string | null
          to_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_activation_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activation_logs_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activation_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activation_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activation_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activation_logs_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_handoff_history: {
        Row: {
          context: Json | null
          conversation_id: string | null
          created_at: string
          from_agent_id: string | null
          id: string
          lead_id: string | null
          organization_id: string
          reason: string | null
          rule_id: string | null
          to_agent_id: string | null
          to_specialist_id: string | null
        }
        Insert: {
          context?: Json | null
          conversation_id?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          reason?: string | null
          rule_id?: string | null
          to_agent_id?: string | null
          to_specialist_id?: string | null
        }
        Update: {
          context?: Json | null
          conversation_id?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          reason?: string | null
          rule_id?: string | null
          to_agent_id?: string | null
          to_specialist_id?: string | null
        }
        Relationships: []
      }
      agent_post_sale_scenarios: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          filters: Json
          id: string
          instruction: string
          is_active: boolean
          links: Json
          name: string
          organization_id: string
          priority: number
          tags_to_apply: string[]
          trigger_event: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json
          id?: string
          instruction: string
          is_active?: boolean
          links?: Json
          name: string
          organization_id: string
          priority?: number
          tags_to_apply?: string[]
          trigger_event: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json
          id?: string
          instruction?: string
          is_active?: boolean
          links?: Json
          name?: string
          organization_id?: string
          priority?: number
          tags_to_apply?: string[]
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_post_sale_scenarios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_routing_rules: {
        Row: {
          created_at: string
          deal_value_max: number | null
          deal_value_min: number | null
          description: string | null
          id: string
          is_active: boolean
          last_matched_at: string | null
          match_channels: string[] | null
          match_count: number
          match_events: string[] | null
          match_product_ids: string[] | null
          match_stage_ids: string[] | null
          match_tag_ids: string[] | null
          name: string
          organization_id: string
          priority: number
          target_specialist_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_value_max?: number | null
          deal_value_min?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_matched_at?: string | null
          match_channels?: string[] | null
          match_count?: number
          match_events?: string[] | null
          match_product_ids?: string[] | null
          match_stage_ids?: string[] | null
          match_tag_ids?: string[] | null
          name: string
          organization_id: string
          priority?: number
          target_specialist_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_value_max?: number | null
          deal_value_min?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_matched_at?: string | null
          match_channels?: string[] | null
          match_count?: number
          match_events?: string[] | null
          match_product_ids?: string[] | null
          match_stage_ids?: string[] | null
          match_tag_ids?: string[] | null
          name?: string
          organization_id?: string
          priority?: number
          target_specialist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_routing_rules_target_specialist_id_fkey"
            columns: ["target_specialist_id"]
            isOneToOne: false
            referencedRelation: "agent_specialists"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_safety_limits: {
        Row: {
          cooldown_seconds_between_same_tool: number
          created_at: string
          max_cost_cents_per_day: number
          max_tool_executions_per_day: number
          max_tools_per_turn: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          cooldown_seconds_between_same_tool?: number
          created_at?: string
          max_cost_cents_per_day?: number
          max_tool_executions_per_day?: number
          max_tools_per_turn?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          cooldown_seconds_between_same_tool?: number
          created_at?: string
          max_cost_cents_per_day?: number
          max_tool_executions_per_day?: number
          max_tools_per_turn?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_specialists: {
        Row: {
          agent_id: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          organization_id: string
          priority: number
          role: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          organization_id: string
          priority?: number
          role: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          priority?: number
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_tool_executions: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          channel: string | null
          conversation_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          estimated_cost_cents: number | null
          id: string
          input: Json
          lead_id: string | null
          organization_id: string
          output: Json | null
          success: boolean
          tool_name: string
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          channel?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost_cents?: number | null
          id?: string
          input?: Json
          lead_id?: string | null
          organization_id: string
          output?: Json | null
          success?: boolean
          tool_name: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          channel?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost_cents?: number | null
          id?: string
          input?: Json
          lead_id?: string | null
          organization_id?: string
          output?: Json | null
          success?: boolean
          tool_name?: string
        }
        Relationships: []
      }
      agent_training_materials: {
        Row: {
          agent_id: string | null
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          extracted_content: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          material_type: string
          organization_id: string
          processing_error: string | null
          processing_status: string | null
          product_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          extracted_content?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          material_type: string
          organization_id: string
          processing_error?: string | null
          processing_status?: string | null
          product_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          extracted_content?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          material_type?: string
          organization_id?: string
          processing_error?: string | null
          processing_status?: string | null
          product_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_training_materials_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_training_materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_training_materials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_audits: {
        Row: {
          analyzed_at: string
          id: string
          interaction_id: string
          issues: string[] | null
          quality_score: number | null
          suggestions: string[] | null
          tone_analysis: Json | null
        }
        Insert: {
          analyzed_at?: string
          id?: string
          interaction_id: string
          issues?: string[] | null
          quality_score?: number | null
          suggestions?: string[] | null
          tone_analysis?: Json | null
        }
        Update: {
          analyzed_at?: string
          id?: string
          interaction_id?: string
          issues?: string[] | null
          quality_score?: number | null
          suggestions?: string[] | null
          tone_analysis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_audits_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          created_at: string
          id: string
          insight: string
          is_dismissed: boolean | null
          organization_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          product_id: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          insight: string
          is_dismissed?: boolean | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          product_id?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          insight?: string
          is_dismissed?: boolean | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          product_id?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_base: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_active: boolean | null
          organization_id: string
          product_id: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id: string
          product_id: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string
          product_id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_base_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_base_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_outreach_queue: {
        Row: {
          agent_id: string | null
          attempts_completed: number[]
          business_days: number[] | null
          business_hours_end: string | null
          business_hours_start: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          extra_context: string | null
          followup_attempt_hints: Json | null
          followup_enabled: boolean
          followup_interval_hours: number | null
          followup_intervals_minutes: number[] | null
          followup_kind: string | null
          followup_steps: Json | null
          followups_sent: number
          id: string
          last_attempt_executed: number
          last_interaction_at: string | null
          last_outreach_at: string | null
          lead_data: Json | null
          lead_id: string
          max_followups: number | null
          next_followup_at: string | null
          objective: string | null
          organization_id: string
          processing_started_at: string | null
          product_id: string | null
          ruler_closed: boolean
          status: string
          webhook_id: string | null
        }
        Insert: {
          agent_id?: string | null
          attempts_completed?: number[]
          business_days?: number[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          extra_context?: string | null
          followup_attempt_hints?: Json | null
          followup_enabled?: boolean
          followup_interval_hours?: number | null
          followup_intervals_minutes?: number[] | null
          followup_kind?: string | null
          followup_steps?: Json | null
          followups_sent?: number
          id?: string
          last_attempt_executed?: number
          last_interaction_at?: string | null
          last_outreach_at?: string | null
          lead_data?: Json | null
          lead_id: string
          max_followups?: number | null
          next_followup_at?: string | null
          objective?: string | null
          organization_id: string
          processing_started_at?: string | null
          product_id?: string | null
          ruler_closed?: boolean
          status?: string
          webhook_id?: string | null
        }
        Update: {
          agent_id?: string | null
          attempts_completed?: number[]
          business_days?: number[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          extra_context?: string | null
          followup_attempt_hints?: Json | null
          followup_enabled?: boolean
          followup_interval_hours?: number | null
          followup_intervals_minutes?: number[] | null
          followup_kind?: string | null
          followup_steps?: Json | null
          followups_sent?: number
          id?: string
          last_attempt_executed?: number
          last_interaction_at?: string | null
          last_outreach_at?: string | null
          lead_data?: Json | null
          lead_id?: string
          max_followups?: number | null
          next_followup_at?: string | null
          objective?: string | null
          organization_id?: string
          processing_started_at?: string | null
          product_id?: string | null
          ruler_closed?: boolean
          status?: string
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_outreach_queue_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outreach_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outreach_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outreach_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outreach_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outreach_queue_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_experiments: {
        Row: {
          agent_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          name: string
          organization_id: string
          primary_metric: string | null
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          name: string
          organization_id: string
          primary_metric?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          primary_metric?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_prompt_variants: {
        Row: {
          conversions: number
          created_at: string
          evaluations_count: number
          experiment_id: string
          id: string
          impressions: number
          label: string
          organization_id: string
          prompt_mode: string
          prompt_override: string | null
          total_score: number
          updated_at: string
          weight: number
        }
        Insert: {
          conversions?: number
          created_at?: string
          evaluations_count?: number
          experiment_id: string
          id?: string
          impressions?: number
          label: string
          organization_id: string
          prompt_mode?: string
          prompt_override?: string | null
          total_score?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          conversions?: number
          created_at?: string
          evaluations_count?: number
          experiment_id?: string
          id?: string
          impressions?: number
          label?: string
          organization_id?: string
          prompt_mode?: string
          prompt_override?: string | null
          total_score?: number
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_variants_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_quality_evaluations: {
        Row: {
          agent_id: string | null
          conversation_id: string | null
          cost_usd: number | null
          created_at: string
          detected_intents: Json | null
          detected_issues: Json | null
          detected_objections: Json | null
          evaluated_messages_count: number | null
          id: string
          improvement_suggestions: string | null
          judge_model: string | null
          lead_id: string | null
          organization_id: string
          score_accuracy: number | null
          score_clarity: number | null
          score_conversion_potential: number | null
          score_objectivity: number | null
          score_overall: number | null
          score_tone: number | null
          summary: string | null
        }
        Insert: {
          agent_id?: string | null
          conversation_id?: string | null
          cost_usd?: number | null
          created_at?: string
          detected_intents?: Json | null
          detected_issues?: Json | null
          detected_objections?: Json | null
          evaluated_messages_count?: number | null
          id?: string
          improvement_suggestions?: string | null
          judge_model?: string | null
          lead_id?: string | null
          organization_id: string
          score_accuracy?: number | null
          score_clarity?: number | null
          score_conversion_potential?: number | null
          score_objectivity?: number | null
          score_overall?: number | null
          score_tone?: number | null
          summary?: string | null
        }
        Update: {
          agent_id?: string | null
          conversation_id?: string | null
          cost_usd?: number | null
          created_at?: string
          detected_intents?: Json | null
          detected_issues?: Json | null
          detected_objections?: Json | null
          evaluated_messages_count?: number | null
          id?: string
          improvement_suggestions?: string | null
          judge_model?: string | null
          lead_id?: string | null
          organization_id?: string
          score_accuracy?: number | null
          score_clarity?: number | null
          score_conversion_potential?: number | null
          score_objectivity?: number | null
          score_overall?: number | null
          score_tone?: number | null
          summary?: string | null
        }
        Relationships: []
      }
      ai_response_feedback: {
        Row: {
          applied_at: string | null
          applied_to_training: boolean | null
          conversation_id: string | null
          created_at: string | null
          created_by: string | null
          feedback_type: string | null
          id: string
          message_id: string | null
          organization_id: string
          original_response: string
          suggested_response: string
        }
        Insert: {
          applied_at?: string | null
          applied_to_training?: boolean | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          feedback_type?: string | null
          id?: string
          message_id?: string | null
          organization_id: string
          original_response: string
          suggested_response: string
        }
        Update: {
          applied_at?: string | null
          applied_to_training?: boolean | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          feedback_type?: string | null
          id?: string
          message_id?: string | null
          organization_id?: string
          original_response?: string
          suggested_response?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_response_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_response_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_response_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_response_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "webchat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_response_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_router_failures: {
        Row: {
          capability: string
          created_at: string
          error_message: string | null
          fell_back_to: string | null
          id: string
          organization_id: string
          provider: string
          status_code: number | null
        }
        Insert: {
          capability: string
          created_at?: string
          error_message?: string | null
          fell_back_to?: string | null
          id?: string
          organization_id: string
          provider: string
          status_code?: number | null
        }
        Update: {
          capability?: string
          created_at?: string
          error_message?: string | null
          fell_back_to?: string | null
          id?: string
          organization_id?: string
          provider?: string
          status_code?: number | null
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          attempt_index: number
          capability: string
          completion_tokens: number | null
          created_at: string
          edge_function: string | null
          fallback_reason: string | null
          id: string
          key_label: string | null
          model: string | null
          organization_id: string | null
          platform_key_id: string | null
          primary_model: string | null
          prompt_tokens: number | null
          provider: string
          source: string
          total_tokens: number | null
        }
        Insert: {
          attempt_index?: number
          capability: string
          completion_tokens?: number | null
          created_at?: string
          edge_function?: string | null
          fallback_reason?: string | null
          id?: string
          key_label?: string | null
          model?: string | null
          organization_id?: string | null
          platform_key_id?: string | null
          primary_model?: string | null
          prompt_tokens?: number | null
          provider: string
          source?: string
          total_tokens?: number | null
        }
        Update: {
          attempt_index?: number
          capability?: string
          completion_tokens?: number | null
          created_at?: string
          edge_function?: string | null
          fallback_reason?: string | null
          id?: string
          key_label?: string | null
          model?: string | null
          organization_id?: string | null
          platform_key_id?: string | null
          primary_model?: string | null
          prompt_tokens?: number | null
          provider?: string
          source?: string
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_platform_key_id_fkey"
            columns: ["platform_key_id"]
            isOneToOne: false
            referencedRelation: "platform_ai_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_charges: {
        Row: {
          asaas_customer_id: string | null
          asaas_id: string
          bank_slip_url: string | null
          billing_type: string | null
          created_at: string
          description: string | null
          due_date: string | null
          external_reference: string | null
          id: string
          invoice_url: string | null
          lead_id: string | null
          net_value: number | null
          offer_id: string | null
          organization_id: string
          paid_at: string | null
          pix_copy_paste: string | null
          pix_qr_code: string | null
          product_id: string | null
          raw_payload: Json | null
          status: string
          updated_at: string
          value: number | null
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_id: string
          bank_slip_url?: string | null
          billing_type?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          external_reference?: string | null
          id?: string
          invoice_url?: string | null
          lead_id?: string | null
          net_value?: number | null
          offer_id?: string | null
          organization_id: string
          paid_at?: string | null
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          product_id?: string | null
          raw_payload?: Json | null
          status: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_id?: string
          bank_slip_url?: string | null
          billing_type?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          external_reference?: string | null
          id?: string
          invoice_url?: string | null
          lead_id?: string | null
          net_value?: number | null
          offer_id?: string | null
          organization_id?: string
          paid_at?: string | null
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          product_id?: string | null
          raw_payload?: Json | null
          status?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asaas_charges_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asaas_charges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asaas_charges_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_credentials: {
        Row: {
          account_email: string | null
          account_name: string | null
          api_key: string
          created_at: string
          environment: string
          id: string
          is_active: boolean
          last_error: string | null
          last_verified_at: string | null
          organization_id: string
          updated_at: string
          webhook_token: string
        }
        Insert: {
          account_email?: string | null
          account_name?: string | null
          api_key: string
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_verified_at?: string | null
          organization_id: string
          updated_at?: string
          webhook_token?: string
        }
        Update: {
          account_email?: string | null
          account_name?: string | null
          api_key?: string
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_verified_at?: string | null
          organization_id?: string
          updated_at?: string
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "asaas_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_webhook_logs: {
        Row: {
          asaas_id: string | null
          error: string | null
          event: string | null
          id: string
          organization_id: string | null
          payload: Json | null
          processed_at: string
          signature_valid: boolean | null
        }
        Insert: {
          asaas_id?: string | null
          error?: string | null
          event?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json | null
          processed_at?: string
          signature_valid?: boolean | null
        }
        Update: {
          asaas_id?: string | null
          error?: string | null
          event?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json | null
          processed_at?: string
          signature_valid?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "asaas_webhook_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_notification_settings: {
        Row: {
          admin_agent_enabled: boolean | null
          admin_user_id: string | null
          admin_whatsapp_number: string | null
          alert_agent_error_threshold: number | null
          alert_critical_product_idle_hours: number | null
          alert_goal_achieved: boolean | null
          alert_high_value_threshold: number | null
          alert_meeting_changes: boolean | null
          alert_offline_minutes: number | null
          alert_product_volume_spike: boolean | null
          alert_product_volume_spike_pct: number | null
          alert_unattended_minutes: number | null
          commission_approved_enabled: boolean | null
          created_at: string | null
          daily_report_enabled: boolean | null
          daily_report_hour: number | null
          daily_report_send_email: boolean | null
          daily_summary_enabled: boolean | null
          daily_summary_hour: number | null
          goal_achieved_enabled: boolean | null
          id: string
          monitored_product_ids: string[] | null
          organization_id: string
          realtime_alerts_enabled: boolean | null
          stalled_lead_days: number | null
          stalled_lead_enabled: boolean | null
          summary_kpis: string[] | null
          updated_at: string | null
          weekly_include_comparison: boolean | null
          weekly_report_dow: number | null
          weekly_report_enabled: boolean | null
          weekly_report_hour: number | null
        }
        Insert: {
          admin_agent_enabled?: boolean | null
          admin_user_id?: string | null
          admin_whatsapp_number?: string | null
          alert_agent_error_threshold?: number | null
          alert_critical_product_idle_hours?: number | null
          alert_goal_achieved?: boolean | null
          alert_high_value_threshold?: number | null
          alert_meeting_changes?: boolean | null
          alert_offline_minutes?: number | null
          alert_product_volume_spike?: boolean | null
          alert_product_volume_spike_pct?: number | null
          alert_unattended_minutes?: number | null
          commission_approved_enabled?: boolean | null
          created_at?: string | null
          daily_report_enabled?: boolean | null
          daily_report_hour?: number | null
          daily_report_send_email?: boolean | null
          daily_summary_enabled?: boolean | null
          daily_summary_hour?: number | null
          goal_achieved_enabled?: boolean | null
          id?: string
          monitored_product_ids?: string[] | null
          organization_id: string
          realtime_alerts_enabled?: boolean | null
          stalled_lead_days?: number | null
          stalled_lead_enabled?: boolean | null
          summary_kpis?: string[] | null
          updated_at?: string | null
          weekly_include_comparison?: boolean | null
          weekly_report_dow?: number | null
          weekly_report_enabled?: boolean | null
          weekly_report_hour?: number | null
        }
        Update: {
          admin_agent_enabled?: boolean | null
          admin_user_id?: string | null
          admin_whatsapp_number?: string | null
          alert_agent_error_threshold?: number | null
          alert_critical_product_idle_hours?: number | null
          alert_goal_achieved?: boolean | null
          alert_high_value_threshold?: number | null
          alert_meeting_changes?: boolean | null
          alert_offline_minutes?: number | null
          alert_product_volume_spike?: boolean | null
          alert_product_volume_spike_pct?: number | null
          alert_unattended_minutes?: number | null
          commission_approved_enabled?: boolean | null
          created_at?: string | null
          daily_report_enabled?: boolean | null
          daily_report_hour?: number | null
          daily_report_send_email?: boolean | null
          daily_summary_enabled?: boolean | null
          daily_summary_hour?: number | null
          goal_achieved_enabled?: boolean | null
          id?: string
          monitored_product_ids?: string[] | null
          organization_id?: string
          realtime_alerts_enabled?: boolean | null
          stalled_lead_days?: number | null
          stalled_lead_enabled?: boolean | null
          summary_kpis?: string[] | null
          updated_at?: string | null
          weekly_include_comparison?: boolean | null
          weekly_report_dow?: number | null
          weekly_report_enabled?: boolean | null
          weekly_report_hour?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_notification_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_overrides: {
        Row: {
          created_at: string | null
          date: string
          end_time: string | null
          id: string
          is_available: boolean | null
          organization_id: string
          reason: string | null
          start_time: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          end_time?: string | null
          id?: string
          is_available?: boolean | null
          organization_id: string
          reason?: string | null
          start_time?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          end_time?: string | null
          id?: string
          is_available?: boolean | null
          organization_id?: string
          reason?: string | null
          start_time?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_history: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          invoice_url: string | null
          metadata: Json
          organization_id: string | null
          payment_date: string | null
          status: string | null
          stripe_invoice_id: string | null
          subscription_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          metadata?: Json
          organization_id?: string | null
          payment_date?: string | null
          status?: string | null
          stripe_invoice_id?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          metadata?: Json
          organization_id?: string | null
          payment_date?: string | null
          status?: string | null
          stripe_invoice_id?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_event_types: {
        Row: {
          booking_experience: string | null
          buffer_after: number | null
          buffer_before: number | null
          color: string | null
          confirmation_message: string | null
          create_meet: boolean | null
          created_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean | null
          location_details: string | null
          location_type: string
          max_days_ahead: number | null
          min_notice_hours: number | null
          name: string
          next_steps: Json | null
          organization_id: string
          questions: Json | null
          slug: string
          thank_you_message: string | null
          thank_you_title: string | null
          updated_at: string | null
          user_id: string
          what_happens: Json | null
        }
        Insert: {
          booking_experience?: string | null
          buffer_after?: number | null
          buffer_before?: number | null
          color?: string | null
          confirmation_message?: string | null
          create_meet?: boolean | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          location_details?: string | null
          location_type?: string
          max_days_ahead?: number | null
          min_notice_hours?: number | null
          name: string
          next_steps?: Json | null
          organization_id: string
          questions?: Json | null
          slug: string
          thank_you_message?: string | null
          thank_you_title?: string | null
          updated_at?: string | null
          user_id: string
          what_happens?: Json | null
        }
        Update: {
          booking_experience?: string | null
          buffer_after?: number | null
          buffer_before?: number | null
          color?: string | null
          confirmation_message?: string | null
          create_meet?: boolean | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          location_details?: string | null
          location_type?: string
          max_days_ahead?: number | null
          min_notice_hours?: number | null
          name?: string
          next_steps?: Json | null
          organization_id?: string
          questions?: Json | null
          slug?: string
          thank_you_message?: string | null
          thank_you_title?: string | null
          updated_at?: string | null
          user_id?: string
          what_happens?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_event_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_event_types_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_event_types_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_logs: {
        Row: {
          booking_id: string
          channel: string | null
          created_at: string
          error: string | null
          id: string
          organization_id: string
          payload: Json
          type: string
        }
        Insert: {
          booking_id: string
          channel?: string | null
          created_at?: string
          error?: string | null
          id?: string
          organization_id: string
          payload?: Json
          type: string
        }
        Update: {
          booking_id?: string
          channel?: string | null
          created_at?: string
          error?: string | null
          id?: string
          organization_id?: string
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_notification_settings: {
        Row: {
          confirmation_html_email: string | null
          confirmation_message_whatsapp: string | null
          confirmation_subject_email: string | null
          created_at: string
          event_type_id: string
          id: string
          internal_channel: string
          internal_message_template: string | null
          notify_seller_on_cancel: boolean
          notify_seller_on_confirm: boolean
          notify_seller_on_new: boolean
          notify_seller_on_reschedule: boolean
          organization_id: string
          recovery_enabled: boolean
          recovery_message: string | null
          recovery_offset_unit: string
          recovery_offset_value: number
          send_email: boolean
          send_whatsapp: boolean
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          confirmation_html_email?: string | null
          confirmation_message_whatsapp?: string | null
          confirmation_subject_email?: string | null
          created_at?: string
          event_type_id: string
          id?: string
          internal_channel?: string
          internal_message_template?: string | null
          notify_seller_on_cancel?: boolean
          notify_seller_on_confirm?: boolean
          notify_seller_on_new?: boolean
          notify_seller_on_reschedule?: boolean
          organization_id: string
          recovery_enabled?: boolean
          recovery_message?: string | null
          recovery_offset_unit?: string
          recovery_offset_value?: number
          send_email?: boolean
          send_whatsapp?: boolean
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          confirmation_html_email?: string | null
          confirmation_message_whatsapp?: string | null
          confirmation_subject_email?: string | null
          created_at?: string
          event_type_id?: string
          id?: string
          internal_channel?: string
          internal_message_template?: string | null
          notify_seller_on_cancel?: boolean
          notify_seller_on_confirm?: boolean
          notify_seller_on_new?: boolean
          notify_seller_on_reschedule?: boolean
          organization_id?: string
          recovery_enabled?: boolean
          recovery_message?: string | null
          recovery_offset_unit?: string
          recovery_offset_value?: number
          send_email?: boolean
          send_whatsapp?: boolean
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_notification_settings_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: true
            referencedRelation: "booking_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_notification_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_notification_settings_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_reminders: {
        Row: {
          channel: string
          created_at: string
          email_subject: string | null
          event_type_id: string
          id: string
          is_active: boolean
          message_template: string
          offset_unit: string
          offset_value: number
          order_index: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          email_subject?: string | null
          event_type_id: string
          id?: string
          is_active?: boolean
          message_template: string
          offset_unit: string
          offset_value: number
          order_index?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          email_subject?: string | null
          event_type_id?: string
          id?: string
          is_active?: boolean
          message_template?: string
          offset_unit?: string
          offset_value?: number
          order_index?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_reminders_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "booking_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests: {
        Row: {
          additional_info: Json | null
          calendar_event_id: string | null
          cancellation_reason: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          end_time: string
          event_type_id: string
          guest_email: string
          guest_name: string
          guest_phone: string | null
          host_user_id: string
          id: string
          last_reply_at: string | null
          last_reply_text: string | null
          lead_id: string | null
          organization_id: string
          start_time: string
          status: string | null
          timezone: string | null
          tracking: Json | null
          updated_at: string
          whatsapp_message_id: string | null
        }
        Insert: {
          additional_info?: Json | null
          calendar_event_id?: string | null
          cancellation_reason?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          end_time: string
          event_type_id: string
          guest_email: string
          guest_name: string
          guest_phone?: string | null
          host_user_id: string
          id?: string
          last_reply_at?: string | null
          last_reply_text?: string | null
          lead_id?: string | null
          organization_id: string
          start_time: string
          status?: string | null
          timezone?: string | null
          tracking?: Json | null
          updated_at?: string
          whatsapp_message_id?: string | null
        }
        Update: {
          additional_info?: Json | null
          calendar_event_id?: string | null
          cancellation_reason?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          end_time?: string
          event_type_id?: string
          guest_email?: string
          guest_name?: string
          guest_phone?: string | null
          host_user_id?: string
          id?: string
          last_reply_at?: string | null
          last_reply_text?: string | null
          lead_id?: string | null
          organization_id?: string
          start_time?: string
          status?: string | null
          timezone?: string | null
          tracking?: Json | null
          updated_at?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "booking_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_scheduled_jobs: {
        Row: {
          attempts: number
          booking_id: string
          channel: string
          created_at: string
          id: string
          kind: string
          last_error: string | null
          organization_id: string
          payload: Json
          processed_at: string | null
          reminder_id: string | null
          scheduled_for: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          booking_id: string
          channel?: string
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          organization_id: string
          payload?: Json
          processed_at?: string | null
          reminder_id?: string | null
          scheduled_for: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          booking_id?: string
          channel?: string
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          organization_id?: string
          payload?: Json
          processed_at?: string | null
          reminder_id?: string | null
          scheduled_for?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_scheduled_jobs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_scheduled_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_scheduled_jobs_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "booking_reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_history: {
        Row: {
          booking_id: string
          created_at: string
          from_status: string | null
          id: string
          metadata: Json
          organization_id: string
          source: string
          to_status: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          source?: string
          to_status: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          source?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_holidays: {
        Row: {
          created_at: string
          date: string
          description: string | null
          id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          date: string
          description?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_holidays_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          out_of_hours_enabled: boolean
          out_of_hours_message: string
          schedule: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          out_of_hours_enabled?: boolean
          out_of_hours_message?: string
          schedule?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          out_of_hours_enabled?: boolean
          out_of_hours_message?: string
          schedule?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          organization_id: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          organization_id: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: []
      }
      cadence_enrollments: {
        Row: {
          cadence_id: string
          completed_at: string | null
          created_at: string
          current_step_id: string | null
          current_step_index: number
          enrolled_at: string
          id: string
          lead_id: string
          organization_id: string
          source: string | null
          source_ref: Json | null
          status: string
          stop_reason: string | null
          stopped_at: string | null
          updated_at: string
        }
        Insert: {
          cadence_id: string
          completed_at?: string | null
          created_at?: string
          current_step_id?: string | null
          current_step_index?: number
          enrolled_at?: string
          id?: string
          lead_id: string
          organization_id: string
          source?: string | null
          source_ref?: Json | null
          status?: string
          stop_reason?: string | null
          stopped_at?: string | null
          updated_at?: string
        }
        Update: {
          cadence_id?: string
          completed_at?: string | null
          created_at?: string
          current_step_id?: string | null
          current_step_index?: number
          enrolled_at?: string
          id?: string
          lead_id?: string
          organization_id?: string
          source?: string | null
          source_ref?: Json | null
          status?: string
          stop_reason?: string | null
          stopped_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_enrollments_cadence_id_fkey"
            columns: ["cadence_id"]
            isOneToOne: false
            referencedRelation: "cadences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_enrollments_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "cadence_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_step_runs: {
        Row: {
          agent_message: string | null
          conversation_id: string | null
          created_at: string
          enrollment_id: string
          error: string | null
          executed_at: string | null
          id: string
          metadata: Json
          organization_id: string
          scheduled_at: string
          skip_reason: string | null
          status: string
          step_id: string
          updated_at: string
        }
        Insert: {
          agent_message?: string | null
          conversation_id?: string | null
          created_at?: string
          enrollment_id: string
          error?: string | null
          executed_at?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          scheduled_at: string
          skip_reason?: string | null
          status?: string
          step_id: string
          updated_at?: string
        }
        Update: {
          agent_message?: string | null
          conversation_id?: string | null
          created_at?: string
          enrollment_id?: string
          error?: string | null
          executed_at?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          scheduled_at?: string
          skip_reason?: string | null
          status?: string
          step_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_step_runs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "cadence_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_step_runs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "cadence_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_steps: {
        Row: {
          cadence_id: string
          conditions: Json
          context_id: string | null
          context_inline: string | null
          created_at: string
          delay_from: string
          delay_unit: string
          delay_value: number
          execute_immediately: boolean
          fixed_day_offset: number
          fixed_message: string | null
          fixed_time: string | null
          id: string
          message_mode: string
          name: string
          objective: string | null
          order_index: number
          reengagement_rotation: string
          reengagement_template_id: string | null
          reengagement_templates: Json
          reengagement_variable_mapping: Json
          schedule_mode: string
          tone: string | null
          updated_at: string
          window_requirement: string
        }
        Insert: {
          cadence_id: string
          conditions?: Json
          context_id?: string | null
          context_inline?: string | null
          created_at?: string
          delay_from?: string
          delay_unit?: string
          delay_value?: number
          execute_immediately?: boolean
          fixed_day_offset?: number
          fixed_message?: string | null
          fixed_time?: string | null
          id?: string
          message_mode?: string
          name: string
          objective?: string | null
          order_index?: number
          reengagement_rotation?: string
          reengagement_template_id?: string | null
          reengagement_templates?: Json
          reengagement_variable_mapping?: Json
          schedule_mode?: string
          tone?: string | null
          updated_at?: string
          window_requirement?: string
        }
        Update: {
          cadence_id?: string
          conditions?: Json
          context_id?: string | null
          context_inline?: string | null
          created_at?: string
          delay_from?: string
          delay_unit?: string
          delay_value?: number
          execute_immediately?: boolean
          fixed_day_offset?: number
          fixed_message?: string | null
          fixed_time?: string | null
          id?: string
          message_mode?: string
          name?: string
          objective?: string | null
          order_index?: number
          reengagement_rotation?: string
          reengagement_template_id?: string | null
          reengagement_templates?: Json
          reengagement_variable_mapping?: Json
          schedule_mode?: string
          tone?: string | null
          updated_at?: string
          window_requirement?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_steps_cadence_id_fkey"
            columns: ["cadence_id"]
            isOneToOne: false
            referencedRelation: "cadences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_steps_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "campaign_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_steps_reengagement_template_id_fkey"
            columns: ["reengagement_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_meta_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_templates: {
        Row: {
          blocks: Json | null
          created_at: string
          day_number: number
          id: string
          product_id: string
          title: string
          trigger: string | null
          updated_at: string
        }
        Insert: {
          blocks?: Json | null
          created_at?: string
          day_number: number
          id?: string
          product_id: string
          title: string
          trigger?: string | null
          updated_at?: string
        }
        Update: {
          blocks?: Json | null
          created_at?: string
          day_number?: number
          id?: string
          product_id?: string
          title?: string
          trigger?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_templates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cadences: {
        Row: {
          agent_id: string | null
          channel: string
          created_at: string
          created_by: string | null
          description: string | null
          entry_filters: Json
          exclusion_filters: Json
          execution_window: Json
          id: string
          last_executed_at: string | null
          name: string
          objective: string | null
          organization_id: string
          send_connection_id: string | null
          send_connection_type: string | null
          status: string
          stop_actions: Json
          stop_rules: Json
          totals: Json
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_filters?: Json
          exclusion_filters?: Json
          execution_window?: Json
          id?: string
          last_executed_at?: string | null
          name: string
          objective?: string | null
          organization_id: string
          send_connection_id?: string | null
          send_connection_type?: string | null
          status?: string
          stop_actions?: Json
          stop_rules?: Json
          totals?: Json
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_filters?: Json
          exclusion_filters?: Json
          execution_window?: Json
          id?: string
          last_executed_at?: string | null
          name?: string
          objective?: string | null
          organization_id?: string
          send_connection_id?: string | null
          send_connection_type?: string | null
          status?: string
          stop_actions?: Json
          stop_rules?: Json
          totals?: Json
          updated_at?: string
        }
        Relationships: []
      }
      cakto_credentials: {
        Row: {
          client_id: string
          client_secret: string
          connection_status: string
          created_at: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          last_token: string | null
          organization_id: string | null
          scope: string
          scopes: string[]
          token_expires_at: string | null
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          client_id: string
          client_secret: string
          connection_status?: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_token?: string | null
          organization_id?: string | null
          scope: string
          scopes?: string[]
          token_expires_at?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          client_id?: string
          client_secret?: string
          connection_status?: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_token?: string | null
          organization_id?: string | null
          scope?: string
          scopes?: string[]
          token_expires_at?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cakto_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cakto_orders: {
        Row: {
          amount: number | null
          assigned_to: string | null
          base_amount: number | null
          cakto_id: string
          cakto_offer_slug: string | null
          cakto_ref_id: string | null
          coupon_code: string | null
          created_at: string
          created_at_cakto: string | null
          customer_document: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number | null
          id: string
          items: Json | null
          lead_id: string | null
          offer_id: string | null
          offer_type: string | null
          organization_id: string | null
          paid_at: string | null
          payment_method: string | null
          product_cakto_id: string | null
          product_id: string | null
          product_image: string | null
          product_name: string | null
          provider: string
          raw_payload: Json | null
          scope: string
          status: string
          synced_at: string
          type: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          assigned_to?: string | null
          base_amount?: number | null
          cakto_id: string
          cakto_offer_slug?: string | null
          cakto_ref_id?: string | null
          coupon_code?: string | null
          created_at?: string
          created_at_cakto?: string | null
          customer_document?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number | null
          id?: string
          items?: Json | null
          lead_id?: string | null
          offer_id?: string | null
          offer_type?: string | null
          organization_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          product_cakto_id?: string | null
          product_id?: string | null
          product_image?: string | null
          product_name?: string | null
          provider?: string
          raw_payload?: Json | null
          scope: string
          status: string
          synced_at?: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          assigned_to?: string | null
          base_amount?: number | null
          cakto_id?: string
          cakto_offer_slug?: string | null
          cakto_ref_id?: string | null
          coupon_code?: string | null
          created_at?: string
          created_at_cakto?: string | null
          customer_document?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number | null
          id?: string
          items?: Json | null
          lead_id?: string | null
          offer_id?: string | null
          offer_type?: string | null
          organization_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          product_cakto_id?: string | null
          product_id?: string | null
          product_image?: string | null
          product_name?: string | null
          provider?: string
          raw_payload?: Json | null
          scope?: string
          status?: string
          synced_at?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cakto_orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_orders_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "product_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cakto_recovery_config: {
        Row: {
          cooldown_minutes: number
          created_at: string
          delay_seconds: number
          id: string
          is_enabled: boolean
          organization_id: string
          recovery_agent_id: string | null
          trigger_on_abandoned: boolean
          trigger_on_paid: boolean
          trigger_on_refunded: boolean
          updated_at: string
        }
        Insert: {
          cooldown_minutes?: number
          created_at?: string
          delay_seconds?: number
          id?: string
          is_enabled?: boolean
          organization_id: string
          recovery_agent_id?: string | null
          trigger_on_abandoned?: boolean
          trigger_on_paid?: boolean
          trigger_on_refunded?: boolean
          updated_at?: string
        }
        Update: {
          cooldown_minutes?: number
          created_at?: string
          delay_seconds?: number
          id?: string
          is_enabled?: boolean
          organization_id?: string
          recovery_agent_id?: string | null
          trigger_on_abandoned?: boolean
          trigger_on_paid?: boolean
          trigger_on_refunded?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cakto_recovery_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_recovery_config_recovery_agent_id_fkey"
            columns: ["recovery_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      cakto_recovery_dispatches: {
        Row: {
          agent_id: string | null
          cakto_event: string
          cakto_order_id: string | null
          cakto_status: string | null
          conversation_id: string | null
          created_at: string
          customer_email: string | null
          customer_phone: string | null
          error_message: string | null
          id: string
          lead_id: string | null
          message_sent: string | null
          organization_id: string
          skipped_reason: string | null
          success: boolean
        }
        Insert: {
          agent_id?: string | null
          cakto_event: string
          cakto_order_id?: string | null
          cakto_status?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          message_sent?: string | null
          organization_id: string
          skipped_reason?: string | null
          success?: boolean
        }
        Update: {
          agent_id?: string | null
          cakto_event?: string
          cakto_order_id?: string | null
          cakto_status?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          message_sent?: string | null
          organization_id?: string
          skipped_reason?: string | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cakto_recovery_dispatches_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_recovery_dispatches_cakto_order_id_fkey"
            columns: ["cakto_order_id"]
            isOneToOne: false
            referencedRelation: "cakto_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_recovery_dispatches_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_recovery_dispatches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean | null
          attendees: Json | null
          color: string | null
          create_meet: boolean | null
          created_at: string | null
          created_by: string | null
          deal_id: string | null
          description: string | null
          end_time: string
          event_type: string | null
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          is_recurring: boolean | null
          last_synced_at: string | null
          lead_id: string | null
          location: string | null
          meet_link: string | null
          metadata: Json | null
          notes: string | null
          organization_id: string
          parent_event_id: string | null
          product_id: string | null
          recurrence_end_date: string | null
          recurrence_rule: string | null
          reminder_minutes: number[] | null
          start_time: string
          status: string | null
          sync_status: string | null
          synced_from_google: boolean | null
          timezone: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          all_day?: boolean | null
          attendees?: Json | null
          color?: string | null
          create_meet?: boolean | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          end_time: string
          event_type?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          is_recurring?: boolean | null
          last_synced_at?: string | null
          lead_id?: string | null
          location?: string | null
          meet_link?: string | null
          metadata?: Json | null
          notes?: string | null
          organization_id: string
          parent_event_id?: string | null
          product_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          reminder_minutes?: number[] | null
          start_time: string
          status?: string | null
          sync_status?: string | null
          synced_from_google?: boolean | null
          timezone?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          all_day?: boolean | null
          attendees?: Json | null
          color?: string | null
          create_meet?: boolean | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          end_time?: string
          event_type?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          is_recurring?: boolean | null
          last_synced_at?: string | null
          lead_id?: string | null
          location?: string | null
          meet_link?: string | null
          metadata?: Json | null
          notes?: string | null
          organization_id?: string
          parent_event_id?: string | null
          product_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          reminder_minutes?: number[] | null
          start_time?: string
          status?: string | null
          sync_status?: string | null
          synced_from_google?: boolean | null
          timezone?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_events: {
        Row: {
          call_log_id: string
          content: string | null
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          organization_id: string
          payload: Json | null
          role: string | null
        }
        Insert: {
          call_log_id: string
          content?: string | null
          created_at?: string
          event_type: string
          id?: string
          occurred_at?: string
          organization_id: string
          payload?: Json | null
          role?: string | null
        }
        Update: {
          call_log_id?: string
          content?: string | null
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          organization_id?: string
          payload?: Json | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_events_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          answered_at: string | null
          call_sid: string | null
          campaign_id: string | null
          campaign_target_id: string | null
          cost_usd: number | null
          created_at: string
          direction: string
          duration_sec: number | null
          ended_at: string | null
          from_number: string | null
          grok_voice_id: string | null
          id: string
          initiated_by: string | null
          key_points: Json
          lead_id: string | null
          metadata: Json
          next_actions: Json
          organization_id: string
          outcome: string | null
          outcome_data: Json
          product_agent_id: string | null
          provider: string
          raw_payload: Json | null
          recording_url: string | null
          sentiment: string | null
          started_at: string | null
          status: string
          status_reason: string | null
          summary: string | null
          to_number: string | null
          transcription_text: string | null
          updated_at: string
          voice_agent_id: string | null
        }
        Insert: {
          answered_at?: string | null
          call_sid?: string | null
          campaign_id?: string | null
          campaign_target_id?: string | null
          cost_usd?: number | null
          created_at?: string
          direction?: string
          duration_sec?: number | null
          ended_at?: string | null
          from_number?: string | null
          grok_voice_id?: string | null
          id?: string
          initiated_by?: string | null
          key_points?: Json
          lead_id?: string | null
          metadata?: Json
          next_actions?: Json
          organization_id: string
          outcome?: string | null
          outcome_data?: Json
          product_agent_id?: string | null
          provider?: string
          raw_payload?: Json | null
          recording_url?: string | null
          sentiment?: string | null
          started_at?: string | null
          status?: string
          status_reason?: string | null
          summary?: string | null
          to_number?: string | null
          transcription_text?: string | null
          updated_at?: string
          voice_agent_id?: string | null
        }
        Update: {
          answered_at?: string | null
          call_sid?: string | null
          campaign_id?: string | null
          campaign_target_id?: string | null
          cost_usd?: number | null
          created_at?: string
          direction?: string
          duration_sec?: number | null
          ended_at?: string | null
          from_number?: string | null
          grok_voice_id?: string | null
          id?: string
          initiated_by?: string | null
          key_points?: Json
          lead_id?: string | null
          metadata?: Json
          next_actions?: Json
          organization_id?: string
          outcome?: string | null
          outcome_data?: Json
          product_agent_id?: string | null
          provider?: string
          raw_payload?: Json | null
          recording_url?: string | null
          sentiment?: string | null
          started_at?: string | null
          status?: string
          status_reason?: string | null
          summary?: string | null
          to_number?: string | null
          transcription_text?: string | null
          updated_at?: string
          voice_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voice_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_campaign_target_id_fkey"
            columns: ["campaign_target_id"]
            isOneToOne: false
            referencedRelation: "voice_campaign_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_product_agent_id_fkey"
            columns: ["product_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_voice_agent_id_fkey"
            columns: ["voice_agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      call_tool_events: {
        Row: {
          args: Json
          call_id: string
          created_at: string
          direction: string
          id: string
          organization_id: string
          result: Json | null
          tool_name: string
          ts_relative_ms: number
        }
        Insert: {
          args?: Json
          call_id: string
          created_at?: string
          direction: string
          id?: string
          organization_id: string
          result?: Json | null
          tool_name: string
          ts_relative_ms?: number
        }
        Update: {
          args?: Json
          call_id?: string
          created_at?: string
          direction?: string
          id?: string
          organization_id?: string
          result?: Json | null
          tool_name?: string
          ts_relative_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_tool_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tool_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contexts: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          cta: string | null
          description: string | null
          id: string
          instructions: string
          name: string
          objective: string | null
          organization_id: string
          tone: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          cta?: string | null
          description?: string | null
          id?: string
          instructions: string
          name: string
          objective?: string | null
          organization_id: string
          tone?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          cta?: string | null
          description?: string | null
          id?: string
          instructions?: string
          name?: string
          objective?: string | null
          organization_id?: string
          tone?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      campaign_preparation_jobs: {
        Row: {
          attempts: number
          batch_size: number
          campaign_id: string
          campaign_snapshot: Json | null
          completed_at: string | null
          created_at: string
          cursor: number
          error: string | null
          id: string
          lead_ids: string[]
          organization_id: string
          processed_contacts: number
          started_at: string | null
          status: string
          total_contacts: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          batch_size?: number
          campaign_id: string
          campaign_snapshot?: Json | null
          completed_at?: string | null
          created_at?: string
          cursor?: number
          error?: string | null
          id?: string
          lead_ids?: string[]
          organization_id: string
          processed_contacts?: number
          started_at?: string | null
          status?: string
          total_contacts?: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          batch_size?: number
          campaign_id?: string
          campaign_snapshot?: Json | null
          completed_at?: string | null
          created_at?: string
          cursor?: number
          error?: string | null
          id?: string
          lead_ids?: string[]
          organization_id?: string
          processed_contacts?: number
          started_at?: string | null
          status?: string
          total_contacts?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_preparation_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_preparation_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_targets: {
        Row: {
          attempts: number
          campaign_id: string
          connection_type: string
          context_id: string | null
          context_used: string | null
          conversation_id: string | null
          created_at: string
          error: string | null
          id: string
          instance_id: string | null
          lead_id: string
          organization_id: string
          outreach_queue_id: string | null
          responded_at: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          connection_type?: string
          context_id?: string | null
          context_used?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          instance_id?: string | null
          lead_id: string
          organization_id: string
          outreach_queue_id?: string | null
          responded_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          connection_type?: string
          context_id?: string | null
          context_used?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          instance_id?: string | null
          lead_id?: string
          organization_id?: string
          outreach_queue_id?: string | null
          responded_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          agent_id: string | null
          audience_filters: Json
          channel: string
          completed_at: string | null
          context_distribution: string
          contexts: Json
          created_at: string
          created_by: string | null
          description: string | null
          exclusion_filters: Json
          id: string
          instance_distribution: Json
          instance_strategy: string
          meta_template_config: Json | null
          name: string
          organization_id: string
          post_cadence_id: string | null
          post_response_actions: Json
          recurrence: Json | null
          schedule_type: string
          scheduled_at: string | null
          speed_config: Json
          speed_preset: string
          started_at: string | null
          status: string
          tags_on_response: string[]
          totals: Json
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          audience_filters?: Json
          channel?: string
          completed_at?: string | null
          context_distribution?: string
          contexts?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          exclusion_filters?: Json
          id?: string
          instance_distribution?: Json
          instance_strategy?: string
          meta_template_config?: Json | null
          name: string
          organization_id: string
          post_cadence_id?: string | null
          post_response_actions?: Json
          recurrence?: Json | null
          schedule_type?: string
          scheduled_at?: string | null
          speed_config?: Json
          speed_preset?: string
          started_at?: string | null
          status?: string
          tags_on_response?: string[]
          totals?: Json
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          audience_filters?: Json
          channel?: string
          completed_at?: string | null
          context_distribution?: string
          contexts?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          exclusion_filters?: Json
          id?: string
          instance_distribution?: Json
          instance_strategy?: string
          meta_template_config?: Json | null
          name?: string
          organization_id?: string
          post_cadence_id?: string | null
          post_response_actions?: Json
          recurrence?: Json | null
          schedule_type?: string
          scheduled_at?: string | null
          speed_config?: Json
          speed_preset?: string
          started_at?: string | null
          status?: string
          tags_on_response?: string[]
          totals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_post_cadence_id_fkey"
            columns: ["post_cadence_id"]
            isOneToOne: false
            referencedRelation: "cadences"
            referencedColumns: ["id"]
          },
        ]
      }
      capture_funnels: {
        Row: {
          ai_context: string | null
          ai_enabled: boolean | null
          appearance: Json | null
          assigned_squad_id: string | null
          assigned_user_id: string | null
          channel_type: string
          channels: Json
          created_at: string | null
          created_by: string | null
          custom_scripts: Json | null
          default_tags: string[] | null
          default_temperature: string | null
          description: string | null
          distribution_rule: string
          facebook_pixel_id: string | null
          flow_blocks: Json
          google_tag_id: string | null
          id: string
          name: string
          organization_id: string
          post_quiz_actions: Json
          post_quiz_agent_id: string | null
          post_quiz_cadence_id: string | null
          product_id: string
          round_robin_config: Json | null
          slug: string
          start_block_id: string | null
          status: string
          theme: Json | null
          total_leads: number | null
          total_views: number | null
          updated_at: string | null
          utm_capture: boolean | null
          widget_config: Json | null
        }
        Insert: {
          ai_context?: string | null
          ai_enabled?: boolean | null
          appearance?: Json | null
          assigned_squad_id?: string | null
          assigned_user_id?: string | null
          channel_type?: string
          channels?: Json
          created_at?: string | null
          created_by?: string | null
          custom_scripts?: Json | null
          default_tags?: string[] | null
          default_temperature?: string | null
          description?: string | null
          distribution_rule?: string
          facebook_pixel_id?: string | null
          flow_blocks?: Json
          google_tag_id?: string | null
          id?: string
          name: string
          organization_id: string
          post_quiz_actions?: Json
          post_quiz_agent_id?: string | null
          post_quiz_cadence_id?: string | null
          product_id: string
          round_robin_config?: Json | null
          slug: string
          start_block_id?: string | null
          status?: string
          theme?: Json | null
          total_leads?: number | null
          total_views?: number | null
          updated_at?: string | null
          utm_capture?: boolean | null
          widget_config?: Json | null
        }
        Update: {
          ai_context?: string | null
          ai_enabled?: boolean | null
          appearance?: Json | null
          assigned_squad_id?: string | null
          assigned_user_id?: string | null
          channel_type?: string
          channels?: Json
          created_at?: string | null
          created_by?: string | null
          custom_scripts?: Json | null
          default_tags?: string[] | null
          default_temperature?: string | null
          description?: string | null
          distribution_rule?: string
          facebook_pixel_id?: string | null
          flow_blocks?: Json
          google_tag_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          post_quiz_actions?: Json
          post_quiz_agent_id?: string | null
          post_quiz_cadence_id?: string | null
          product_id?: string
          round_robin_config?: Json | null
          slug?: string
          start_block_id?: string | null
          status?: string
          theme?: Json | null
          total_leads?: number | null
          total_views?: number | null
          updated_at?: string | null
          utm_capture?: boolean | null
          widget_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "capture_funnels_assigned_squad_id_fkey"
            columns: ["assigned_squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_post_quiz_agent_id_fkey"
            columns: ["post_quiz_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_post_quiz_cadence_id_fkey"
            columns: ["post_quiz_cadence_id"]
            isOneToOne: false
            referencedRelation: "cadences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_sync_logs: {
        Row: {
          base_url: string | null
          catalog_type: string | null
          created_by: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          items_created: number | null
          items_failed: number | null
          items_found: number | null
          items_updated: number | null
          organization_id: string
          product_id: string | null
          source_type: string
          started_at: string
          status: string
        }
        Insert: {
          base_url?: string | null
          catalog_type?: string | null
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_created?: number | null
          items_failed?: number | null
          items_found?: number | null
          items_updated?: number | null
          organization_id: string
          product_id?: string | null
          source_type?: string
          started_at?: string
          status?: string
        }
        Update: {
          base_url?: string | null
          catalog_type?: string | null
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_created?: number | null
          items_failed?: number | null
          items_found?: number | null
          items_updated?: number | null
          organization_id?: string
          product_id?: string | null
          source_type?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_sync_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_sync_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_sync_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_sync_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_flows: {
        Row: {
          blocks: Json
          collected_variables: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          product_id: string | null
          start_block_id: string | null
          trigger_conditions: Json | null
          trigger_type: string | null
          updated_at: string | null
        }
        Insert: {
          blocks?: Json
          collected_variables?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id: string
          product_id?: string | null
          start_block_id?: string | null
          trigger_conditions?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Update: {
          blocks?: Json
          collected_variables?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          product_id?: string | null
          start_block_id?: string | null
          trigger_conditions?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_flows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_flows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          applies_to: string | null
          base_value: number
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          max_value: number | null
          min_value: number | null
          organization_id: string
          product_id: string
          rule_type: string
          stage_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          applies_to?: string | null
          base_value?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_value?: number | null
          min_value?: number | null
          organization_id: string
          product_id: string
          rule_type?: string
          stage_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          applies_to?: string | null
          base_value?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_value?: number | null
          min_value?: number | null
          organization_id?: string
          product_id?: string
          rule_type?: string
          stage_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          deal_id: string
          earned_at: string | null
          id: string
          notes: string | null
          organization_id: string
          paid_at: string | null
          paid_by: string | null
          percentage_applied: number | null
          product_id: string
          rule_id: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          deal_id: string
          earned_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          paid_by?: string | null
          percentage_applied?: number | null
          product_id: string
          rule_id?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          deal_id?: string
          earned_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          paid_by?: string | null
          percentage_applied?: number | null
          product_id?: string
          rule_id?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_notes: {
        Row: {
          ai_summary: Json | null
          ai_summary_updated_at: string | null
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          ai_summary?: Json | null
          ai_summary_updated_at?: string | null
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          ai_summary?: Json | null
          ai_summary_updated_at?: string | null
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_processing_locks: {
        Row: {
          conversation_id: string
          created_at: string
          locked_by: string | null
          locked_until: string
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          locked_by?: string | null
          locked_until: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          locked_by?: string | null
          locked_until?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversation_transfers: {
        Row: {
          conversation_id: string
          created_at: string | null
          created_by: string
          from_user_id: string | null
          id: string
          internal_note: string | null
          to_queue_id: string | null
          to_user_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          created_by: string
          from_user_id?: string | null
          id?: string
          internal_note?: string | null
          to_queue_id?: string | null
          to_user_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          created_by?: string
          from_user_id?: string | null
          id?: string
          internal_note?: string | null
          to_queue_id?: string | null
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_transfers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          created_at: string
          description: string | null
          field_key: string
          field_type: string
          id: string
          is_active: boolean
          name: string
          options: Json
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          field_key: string
          field_type?: string
          id?: string
          is_active?: boolean
          name: string
          options?: Json
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          field_key?: string
          field_type?: string
          id?: string
          is_active?: boolean
          name?: string
          options?: Json
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          closed_at: string | null
          created_at: string | null
          deal_value: number
          id: string
          lead_id: string
          notes: string | null
          organization_id: string
          plan_name: string | null
          product_id: string
          seller_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          deal_value: number
          id?: string
          lead_id: string
          notes?: string | null
          organization_id: string
          plan_name?: string | null
          product_id: string
          seller_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          deal_value?: number
          id?: string
          lead_id?: string
          notes?: string | null
          organization_id?: string
          plan_name?: string | null
          product_id?: string
          seller_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_config: {
        Row: {
          auto_reassign: boolean
          created_at: string
          id: string
          max_accept_time_minutes: number | null
          method: string
          organization_id: string
          round_robin_index: number
          squad_id: string | null
          updated_at: string
        }
        Insert: {
          auto_reassign?: boolean
          created_at?: string
          id?: string
          max_accept_time_minutes?: number | null
          method?: string
          organization_id: string
          round_robin_index?: number
          squad_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_reassign?: boolean
          created_at?: string
          id?: string
          max_accept_time_minutes?: number | null
          method?: string
          organization_id?: string
          round_robin_index?: number
          squad_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_config_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: true
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      docs_change_proposals: {
        Row: {
          created_at: string
          id: string
          page_id: string | null
          page_slug: string
          proposed_content_html: string | null
          proposed_content_json: Json | null
          proposed_description: string | null
          proposed_title: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_signal: Json | null
          status: string
          track_slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          page_id?: string | null
          page_slug: string
          proposed_content_html?: string | null
          proposed_content_json?: Json | null
          proposed_description?: string | null
          proposed_title?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_signal?: Json | null
          status?: string
          track_slug: string
        }
        Update: {
          created_at?: string
          id?: string
          page_id?: string | null
          page_slug?: string
          proposed_content_html?: string | null
          proposed_content_json?: Json | null
          proposed_description?: string | null
          proposed_title?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_signal?: Json | null
          status?: string
          track_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "docs_change_proposals_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "docs_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      docs_pages: {
        Row: {
          content_html: string | null
          content_json: Json | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          section_id: string | null
          slug: string
          title: string
          track_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          section_id?: string | null
          slug: string
          title: string
          track_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          section_id?: string | null
          slug?: string
          title?: string
          track_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "docs_pages_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "docs_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_pages_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "docs_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      docs_sections: {
        Row: {
          created_at: string
          display_order: number
          id: string
          label: string
          track_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          label: string
          track_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          label?: string
          track_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "docs_sections_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "docs_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      docs_tracks: {
        Row: {
          accent: string | null
          created_at: string
          description: string | null
          display_order: number
          icon: string | null
          id: string
          is_active: boolean
          label: string
          short_label: string
          slug: string
          updated_at: string
        }
        Insert: {
          accent?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          label: string
          short_label: string
          slug: string
          updated_at?: string
        }
        Update: {
          accent?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string
          short_label?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string | null
          html_content: string
          id: string
          is_active: boolean | null
          is_system: boolean | null
          name: string
          organization_id: string
          slug: string
          subject: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          created_at?: string | null
          html_content: string
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
          organization_id: string
          slug: string
          subject: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          created_at?: string | null
          html_content?: string
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
          organization_id?: string
          slug?: string
          subject?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      evolution_instances: {
        Row: {
          ai_grouping_enabled: boolean | null
          ai_grouping_max_ms: number | null
          ai_grouping_window_ms: number | null
          consecutive_failures: number
          cooldown_until: string | null
          created_at: string
          created_by_super_admin: boolean
          id: string
          instance_id: string | null
          instance_token: string | null
          is_default: boolean
          last_connected_at: string | null
          last_failure_at: string | null
          last_failure_reason: string | null
          metadata: Json | null
          name: string
          organization_id: string | null
          phone_number: string | null
          presence_enabled: boolean | null
          proxy_configured: boolean | null
          proxy_host: string | null
          proxy_port: number | null
          proxy_protocol: string | null
          proxy_username: string | null
          qr_code: string | null
          qr_code_updated_at: string | null
          status: string
          updated_at: string
          webhook_subscribed: boolean
        }
        Insert: {
          ai_grouping_enabled?: boolean | null
          ai_grouping_max_ms?: number | null
          ai_grouping_window_ms?: number | null
          consecutive_failures?: number
          cooldown_until?: string | null
          created_at?: string
          created_by_super_admin?: boolean
          id?: string
          instance_id?: string | null
          instance_token?: string | null
          is_default?: boolean
          last_connected_at?: string | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          metadata?: Json | null
          name: string
          organization_id?: string | null
          phone_number?: string | null
          presence_enabled?: boolean | null
          proxy_configured?: boolean | null
          proxy_host?: string | null
          proxy_port?: number | null
          proxy_protocol?: string | null
          proxy_username?: string | null
          qr_code?: string | null
          qr_code_updated_at?: string | null
          status?: string
          updated_at?: string
          webhook_subscribed?: boolean
        }
        Update: {
          ai_grouping_enabled?: boolean | null
          ai_grouping_max_ms?: number | null
          ai_grouping_window_ms?: number | null
          consecutive_failures?: number
          cooldown_until?: string | null
          created_at?: string
          created_by_super_admin?: boolean
          id?: string
          instance_id?: string | null
          instance_token?: string | null
          is_default?: boolean
          last_connected_at?: string | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          metadata?: Json | null
          name?: string
          organization_id?: string | null
          phone_number?: string | null
          presence_enabled?: boolean | null
          proxy_configured?: boolean | null
          proxy_host?: string | null
          proxy_port?: number | null
          proxy_protocol?: string | null
          proxy_username?: string | null
          qr_code?: string | null
          qr_code_updated_at?: string | null
          status?: string
          updated_at?: string
          webhook_subscribed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "evolution_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_webhook_logs: {
        Row: {
          ad_source_id: string | null
          created_at: string
          ctwa_clid: string | null
          event_type: string | null
          has_external_ad_reply: boolean
          id: string
          instance_id: string | null
          message_id: string | null
          organization_id: string | null
          raw_payload: Json
          remote_jid: string | null
        }
        Insert: {
          ad_source_id?: string | null
          created_at?: string
          ctwa_clid?: string | null
          event_type?: string | null
          has_external_ad_reply?: boolean
          id?: string
          instance_id?: string | null
          message_id?: string | null
          organization_id?: string | null
          raw_payload: Json
          remote_jid?: string | null
        }
        Update: {
          ad_source_id?: string | null
          created_at?: string
          ctwa_clid?: string | null
          event_type?: string | null
          has_external_ad_reply?: boolean
          id?: string
          instance_id?: string | null
          message_id?: string | null
          organization_id?: string | null
          raw_payload?: Json
          remote_jid?: string | null
        }
        Relationships: []
      }
      facebook_lead_integrations: {
        Row: {
          app_secret: string | null
          assigned_squad_id: string | null
          assigned_user_id: string | null
          created_at: string | null
          default_tags: string[] | null
          default_temperature: string | null
          distribution_rule: string | null
          field_mapping: Json | null
          id: string
          is_active: boolean | null
          last_lead_received_at: string | null
          leads_count: number | null
          organization_id: string
          page_access_token: string
          page_id: string
          page_name: string | null
          product_id: string
          updated_at: string | null
          verify_token: string
        }
        Insert: {
          app_secret?: string | null
          assigned_squad_id?: string | null
          assigned_user_id?: string | null
          created_at?: string | null
          default_tags?: string[] | null
          default_temperature?: string | null
          distribution_rule?: string | null
          field_mapping?: Json | null
          id?: string
          is_active?: boolean | null
          last_lead_received_at?: string | null
          leads_count?: number | null
          organization_id: string
          page_access_token: string
          page_id: string
          page_name?: string | null
          product_id: string
          updated_at?: string | null
          verify_token: string
        }
        Update: {
          app_secret?: string | null
          assigned_squad_id?: string | null
          assigned_user_id?: string | null
          created_at?: string | null
          default_tags?: string[] | null
          default_temperature?: string | null
          distribution_rule?: string | null
          field_mapping?: Json | null
          id?: string
          is_active?: boolean | null
          last_lead_received_at?: string | null
          leads_count?: number | null
          organization_id?: string
          page_access_token?: string
          page_id?: string
          page_name?: string | null
          product_id?: string
          updated_at?: string | null
          verify_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_lead_integrations_assigned_squad_id_fkey"
            columns: ["assigned_squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_lead_integrations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_lead_integrations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_lead_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_lead_integrations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_lead_logs: {
        Row: {
          ad_id: string | null
          campaign_id: string | null
          created_at: string | null
          error_message: string | null
          form_id: string | null
          id: string
          integration_id: string | null
          lead_data: Json | null
          lead_id: string | null
          leadgen_id: string
          processed_at: string | null
          raw_payload: Json | null
          status: string | null
        }
        Insert: {
          ad_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          error_message?: string | null
          form_id?: string | null
          id?: string
          integration_id?: string | null
          lead_data?: Json | null
          lead_id?: string | null
          leadgen_id: string
          processed_at?: string | null
          raw_payload?: Json | null
          status?: string | null
        }
        Update: {
          ad_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          error_message?: string | null
          form_id?: string | null
          id?: string
          integration_id?: string | null
          lead_data?: Json | null
          lead_id?: string | null
          leadgen_id?: string
          processed_at?: string | null
          raw_payload?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facebook_lead_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "facebook_lead_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_lead_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      form_blocks: {
        Row: {
          apply_tags: string[] | null
          block_settings: Json | null
          block_type: string
          created_at: string | null
          description: string | null
          form_id: string
          id: string
          label: string
          logic_rules: Json | null
          maps_to: string | null
          options: Json | null
          order_index: number
          placeholder: string | null
          required: boolean | null
          score_rules: Json | null
          score_value: number | null
          validation: Json | null
        }
        Insert: {
          apply_tags?: string[] | null
          block_settings?: Json | null
          block_type: string
          created_at?: string | null
          description?: string | null
          form_id: string
          id?: string
          label: string
          logic_rules?: Json | null
          maps_to?: string | null
          options?: Json | null
          order_index?: number
          placeholder?: string | null
          required?: boolean | null
          score_rules?: Json | null
          score_value?: number | null
          validation?: Json | null
        }
        Update: {
          apply_tags?: string[] | null
          block_settings?: Json | null
          block_type?: string
          created_at?: string | null
          description?: string | null
          form_id?: string
          id?: string
          label?: string
          logic_rules?: Json | null
          maps_to?: string | null
          options?: Json | null
          order_index?: number
          placeholder?: string | null
          required?: boolean | null
          score_rules?: Json | null
          score_value?: number | null
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_blocks_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          form_id: string
          geo_city: string | null
          geo_country: string | null
          id: string
          ip_address: unknown
          landing_page: string | null
          lead_id: string | null
          referrer_url: string | null
          responses: Json
          started_at: string | null
          status: string | null
          step_analytics: Json | null
          tags: string[] | null
          time_spent_seconds: number | null
          total_score: number | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          form_id: string
          geo_city?: string | null
          geo_country?: string | null
          id?: string
          ip_address?: unknown
          landing_page?: string | null
          lead_id?: string | null
          referrer_url?: string | null
          responses?: Json
          started_at?: string | null
          status?: string | null
          step_analytics?: Json | null
          tags?: string[] | null
          time_spent_seconds?: number | null
          total_score?: number | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          form_id?: string
          geo_city?: string | null
          geo_country?: string | null
          id?: string
          ip_address?: unknown
          landing_page?: string | null
          lead_id?: string | null
          referrer_url?: string | null
          responses?: Json
          started_at?: string | null
          status?: string | null
          step_analytics?: Json | null
          tags?: string[] | null
          time_spent_seconds?: number | null
          total_score?: number | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          blocks: Json
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_public: boolean | null
          is_system: boolean | null
          name: string
          organization_id: string | null
          settings: Json | null
          theme: Json | null
          thumbnail_url: string | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          blocks?: Json
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          is_system?: boolean | null
          name: string
          organization_id?: string | null
          settings?: Json | null
          theme?: Json | null
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          blocks?: Json
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          is_system?: boolean | null
          name?: string
          organization_id?: string | null
          settings?: Json | null
          theme?: Json | null
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          assigned_squad_id: string | null
          assigned_user_id: string | null
          created_at: string | null
          created_by: string | null
          custom_scripts: Json | null
          default_temperature: string | null
          description: string | null
          distribution_rule: string | null
          facebook_pixel_id: string | null
          google_tag_id: string | null
          id: string
          name: string
          organization_id: string
          post_cadence_id: string | null
          product_id: string
          round_robin_config: Json | null
          settings: Json | null
          slug: string
          status: string | null
          submissions_count: number | null
          theme: Json | null
          updated_at: string | null
          use_for_manual_lead: boolean
          utm_capture: boolean | null
          views_count: number | null
        }
        Insert: {
          assigned_squad_id?: string | null
          assigned_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_scripts?: Json | null
          default_temperature?: string | null
          description?: string | null
          distribution_rule?: string | null
          facebook_pixel_id?: string | null
          google_tag_id?: string | null
          id?: string
          name: string
          organization_id: string
          post_cadence_id?: string | null
          product_id: string
          round_robin_config?: Json | null
          settings?: Json | null
          slug: string
          status?: string | null
          submissions_count?: number | null
          theme?: Json | null
          updated_at?: string | null
          use_for_manual_lead?: boolean
          utm_capture?: boolean | null
          views_count?: number | null
        }
        Update: {
          assigned_squad_id?: string | null
          assigned_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_scripts?: Json | null
          default_temperature?: string | null
          description?: string | null
          distribution_rule?: string | null
          facebook_pixel_id?: string | null
          google_tag_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          post_cadence_id?: string | null
          product_id?: string
          round_robin_config?: Json | null
          settings?: Json | null
          slug?: string
          status?: string | null
          submissions_count?: number | null
          theme?: Json | null
          updated_at?: string | null
          use_for_manual_lead?: boolean
          utm_capture?: boolean | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "forms_assigned_squad_id_fkey"
            columns: ["assigned_squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_post_cadence_id_fkey"
            columns: ["post_cadence_id"]
            isOneToOne: false
            referencedRelation: "cadences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_analytics: {
        Row: {
          channel: string
          completions: number | null
          date: string
          funnel_id: string
          id: string
          leads_created: number | null
          starts: number | null
          views: number | null
        }
        Insert: {
          channel: string
          completions?: number | null
          date?: string
          funnel_id: string
          id?: string
          leads_created?: number | null
          starts?: number | null
          views?: number | null
        }
        Update: {
          channel?: string
          completions?: number | null
          date?: string
          funnel_id?: string
          id?: string
          leads_created?: number | null
          starts?: number | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_analytics_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "capture_funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_webhook_logs: {
        Row: {
          block_id: string
          created_at: string
          duration_ms: number | null
          error_message: string | null
          funnel_id: string
          id: string
          lead_id: string | null
          organization_id: string
          request_body: Json | null
          request_headers: Json | null
          request_method: string
          request_url: string
          response_body: string | null
          response_status: number | null
          success: boolean
          trigger_source: string
        }
        Insert: {
          block_id: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          funnel_id: string
          id?: string
          lead_id?: string | null
          organization_id: string
          request_body?: Json | null
          request_headers?: Json | null
          request_method?: string
          request_url: string
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          trigger_source?: string
        }
        Update: {
          block_id?: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          funnel_id?: string
          id?: string
          lead_id?: string | null
          organization_id?: string
          request_body?: Json | null
          request_headers?: Json | null
          request_method?: string
          request_url?: string
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          trigger_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_webhook_logs_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "capture_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_webhook_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_webhook_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_connections: {
        Row: {
          access_token: string | null
          calendar_id: string | null
          connected_at: string | null
          google_email: string | null
          google_event_id: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          organization_id: string
          refresh_token: string | null
          selected_calendar_id: string | null
          sync_direction: string | null
          sync_enabled: boolean | null
          sync_error: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string | null
          connected_at?: string | null
          google_email?: string | null
          google_event_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          organization_id: string
          refresh_token?: string | null
          selected_calendar_id?: string | null
          sync_direction?: string | null
          sync_enabled?: boolean | null
          sync_error?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          calendar_id?: string | null
          connected_at?: string | null
          google_email?: string | null
          google_event_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          organization_id?: string
          refresh_token?: string | null
          selected_calendar_id?: string | null
          sync_direction?: string | null
          sync_enabled?: boolean | null
          sync_error?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      help_article_feedback: {
        Row: {
          article_id: string
          comment: string | null
          created_at: string
          id: string
          is_helpful: boolean
          user_id: string
        }
        Insert: {
          article_id: string
          comment?: string | null
          created_at?: string
          id?: string
          is_helpful: boolean
          user_id: string
        }
        Update: {
          article_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          is_helpful?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_article_feedback_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "help_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_articles: {
        Row: {
          category_id: string | null
          content_html: string | null
          content_json: Json | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          display_order: number
          helpful_count: number
          id: string
          is_published: boolean
          not_helpful_count: number
          published_at: string | null
          related_release_id: string | null
          slug: string
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          category_id?: string | null
          content_html?: string | null
          content_json?: Json | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          helpful_count?: number
          id?: string
          is_published?: boolean
          not_helpful_count?: number
          published_at?: string | null
          related_release_id?: string | null
          slug: string
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          category_id?: string | null
          content_html?: string | null
          content_json?: Json | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          helpful_count?: number
          id?: string
          is_published?: boolean
          not_helpful_count?: number
          published_at?: string | null
          related_release_id?: string | null
          slug?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "help_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "help_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_articles_related_release_id_fkey"
            columns: ["related_release_id"]
            isOneToOne: false
            referencedRelation: "platform_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      help_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          display_order: number
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
          visibility: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      hotmart_credentials: {
        Row: {
          basic_token: string | null
          client_id: string | null
          client_secret: string | null
          created_at: string
          hottok: string | null
          id: string
          is_active: boolean
          last_verified_at: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          basic_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          hottok?: string | null
          id?: string
          is_active?: boolean
          last_verified_at?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          basic_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          hottok?: string | null
          id?: string
          is_active?: boolean
          last_verified_at?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotmart_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hotmart_orders: {
        Row: {
          affiliate_email: string | null
          amount: number | null
          buyer_doc: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_phone: string | null
          commission_amount: number | null
          created_at: string
          created_at_hotmart: string | null
          currency: string | null
          event_type: string | null
          hotmart_offer_code: string | null
          hotmart_product_id: string | null
          hotmart_product_name: string | null
          id: string
          installments: number | null
          organization_id: string
          payment_method: string | null
          product_id: string | null
          raw_payload: Json | null
          status: string
          subscription_code: string | null
          synced_at: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          affiliate_email?: string | null
          amount?: number | null
          buyer_doc?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          commission_amount?: number | null
          created_at?: string
          created_at_hotmart?: string | null
          currency?: string | null
          event_type?: string | null
          hotmart_offer_code?: string | null
          hotmart_product_id?: string | null
          hotmart_product_name?: string | null
          id?: string
          installments?: number | null
          organization_id: string
          payment_method?: string | null
          product_id?: string | null
          raw_payload?: Json | null
          status: string
          subscription_code?: string | null
          synced_at?: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          affiliate_email?: string | null
          amount?: number | null
          buyer_doc?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          commission_amount?: number | null
          created_at?: string
          created_at_hotmart?: string | null
          currency?: string | null
          event_type?: string | null
          hotmart_offer_code?: string | null
          hotmart_product_id?: string | null
          hotmart_product_name?: string | null
          id?: string
          installments?: number | null
          organization_id?: string
          payment_method?: string | null
          product_id?: string | null
          raw_payload?: Json | null
          status?: string
          subscription_code?: string | null
          synced_at?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotmart_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotmart_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      hotmart_product_mapping: {
        Row: {
          created_at: string
          hotmart_product_id: string
          hotmart_product_name: string | null
          id: string
          organization_id: string
          product_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          hotmart_product_id: string
          hotmart_product_name?: string | null
          id?: string
          organization_id: string
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          hotmart_product_id?: string
          hotmart_product_name?: string | null
          id?: string
          organization_id?: string
          product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotmart_product_mapping_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotmart_product_mapping_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_comment_replies: {
        Row: {
          comment_id: string
          connection_id: string
          created_at: string
          flow_id: string | null
          id: string
          idempotency_key: string | null
          liked: boolean
          replied_private: boolean
          replied_public: boolean
        }
        Insert: {
          comment_id: string
          connection_id: string
          created_at?: string
          flow_id?: string | null
          id?: string
          idempotency_key?: string | null
          liked?: boolean
          replied_private?: boolean
          replied_public?: boolean
        }
        Update: {
          comment_id?: string
          connection_id?: string
          created_at?: string
          flow_id?: string | null
          id?: string
          idempotency_key?: string | null
          liked?: boolean
          replied_private?: boolean
          replied_public?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "instagram_comment_replies_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "instagram_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_comment_replies_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "instagram_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_connections: {
        Row: {
          app_id: string | null
          app_secret_encrypted: string | null
          auth_mode: string
          capabilities: Json
          created_at: string
          created_by: string | null
          data_access_expires_at: string | null
          display_name: string
          fb_page_id: string | null
          fb_page_name: string | null
          graph_version: string
          id: string
          ig_auth_style: string
          ig_business_account_id: string | null
          ig_user_access_token_encrypted: string | null
          ig_user_id: string | null
          ig_username: string | null
          last_error: string | null
          last_inbound_at: string | null
          organization_id: string
          page_access_token_encrypted: string | null
          status: string
          status_reason: string | null
          subscribed_fields: string[]
          token_expires_at: string | null
          token_type: string | null
          updated_at: string
          user_access_token_encrypted: string | null
          webhook_subscribed_at: string | null
          webhook_verify_token: string
        }
        Insert: {
          app_id?: string | null
          app_secret_encrypted?: string | null
          auth_mode?: string
          capabilities?: Json
          created_at?: string
          created_by?: string | null
          data_access_expires_at?: string | null
          display_name: string
          fb_page_id?: string | null
          fb_page_name?: string | null
          graph_version?: string
          id?: string
          ig_auth_style?: string
          ig_business_account_id?: string | null
          ig_user_access_token_encrypted?: string | null
          ig_user_id?: string | null
          ig_username?: string | null
          last_error?: string | null
          last_inbound_at?: string | null
          organization_id: string
          page_access_token_encrypted?: string | null
          status?: string
          status_reason?: string | null
          subscribed_fields?: string[]
          token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string
          user_access_token_encrypted?: string | null
          webhook_subscribed_at?: string | null
          webhook_verify_token: string
        }
        Update: {
          app_id?: string | null
          app_secret_encrypted?: string | null
          auth_mode?: string
          capabilities?: Json
          created_at?: string
          created_by?: string | null
          data_access_expires_at?: string | null
          display_name?: string
          fb_page_id?: string | null
          fb_page_name?: string | null
          graph_version?: string
          id?: string
          ig_auth_style?: string
          ig_business_account_id?: string | null
          ig_user_access_token_encrypted?: string | null
          ig_user_id?: string | null
          ig_username?: string | null
          last_error?: string | null
          last_inbound_at?: string | null
          organization_id?: string
          page_access_token_encrypted?: string | null
          status?: string
          status_reason?: string | null
          subscribed_fields?: string[]
          token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string
          user_access_token_encrypted?: string | null
          webhook_subscribed_at?: string | null
          webhook_verify_token?: string
        }
        Relationships: []
      }
      instagram_flow_continuations: {
        Row: {
          comment_id: string | null
          connection_id: string
          context: Json
          conversation_id: string | null
          created_at: string
          expires_at: string
          flow_id: string
          id: string
          interaction_payload: string | null
          last_error: string | null
          organization_id: string
          resume_block_id: string
          resumed_at: string | null
          run_id: string | null
          sender_ig_id: string
          status: string
        }
        Insert: {
          comment_id?: string | null
          connection_id: string
          context?: Json
          conversation_id?: string | null
          created_at?: string
          expires_at?: string
          flow_id: string
          id?: string
          interaction_payload?: string | null
          last_error?: string | null
          organization_id: string
          resume_block_id: string
          resumed_at?: string | null
          run_id?: string | null
          sender_ig_id: string
          status?: string
        }
        Update: {
          comment_id?: string | null
          connection_id?: string
          context?: Json
          conversation_id?: string | null
          created_at?: string
          expires_at?: string
          flow_id?: string
          id?: string
          interaction_payload?: string | null
          last_error?: string | null
          organization_id?: string
          resume_block_id?: string
          resumed_at?: string | null
          run_id?: string | null
          sender_ig_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_flow_continuations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "instagram_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_continuations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_continuations_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "instagram_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_continuations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_continuations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "instagram_flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_flow_runs: {
        Row: {
          connection_id: string | null
          conversation_id: string | null
          error: string | null
          finished_at: string | null
          flow_id: string
          id: string
          organization_id: string
          payload: Json
          sender_ig_id: string | null
          source_id: string | null
          started_at: string
          status: string
          trigger_source: string
        }
        Insert: {
          connection_id?: string | null
          conversation_id?: string | null
          error?: string | null
          finished_at?: string | null
          flow_id: string
          id?: string
          organization_id: string
          payload?: Json
          sender_ig_id?: string | null
          source_id?: string | null
          started_at?: string
          status?: string
          trigger_source: string
        }
        Update: {
          connection_id?: string | null
          conversation_id?: string | null
          error?: string | null
          finished_at?: string | null
          flow_id?: string
          id?: string
          organization_id?: string
          payload?: Json
          sender_ig_id?: string | null
          source_id?: string | null
          started_at?: string
          status?: string
          trigger_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_flow_runs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "instagram_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "instagram_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_flows: {
        Row: {
          connection_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          flow_blocks: Json
          id: string
          name: string
          organization_id: string
          start_block_id: string | null
          stats: Json
          status: string
          throttle_per_sender_hours: number
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          flow_blocks?: Json
          id?: string
          name: string
          organization_id: string
          start_block_id?: string | null
          stats?: Json
          status?: string
          throttle_per_sender_hours?: number
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          flow_blocks?: Json
          id?: string
          name?: string
          organization_id?: string
          start_block_id?: string | null
          stats?: Json
          status?: string
          throttle_per_sender_hours?: number
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_flows_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "instagram_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_webhook_logs: {
        Row: {
          connection_id: string | null
          created_at: string
          error: string | null
          event_type: string | null
          id: string
          idempotency_key: string | null
          message_id: string | null
          object: string | null
          organization_id: string | null
          payload: Json | null
          payload_summary: Json | null
          recipient_id: string | null
          sender_id: string | null
          signature_valid: boolean | null
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          idempotency_key?: string | null
          message_id?: string | null
          object?: string | null
          organization_id?: string | null
          payload?: Json | null
          payload_summary?: Json | null
          recipient_id?: string | null
          sender_id?: string | null
          signature_valid?: boolean | null
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          idempotency_key?: string | null
          message_id?: string | null
          object?: string | null
          organization_id?: string | null
          payload?: Json | null
          payload_summary?: Json | null
          recipient_id?: string | null
          sender_id?: string | null
          signature_valid?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_webhook_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "instagram_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          api_key_masked: string | null
          created_at: string | null
          id: string
          integration_type: string
          is_configured: boolean | null
          last_verified_at: string | null
          organization_id: string
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          api_key_masked?: string | null
          created_at?: string | null
          id?: string
          integration_type: string
          is_configured?: boolean | null
          last_verified_at?: string | null
          organization_id: string
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          api_key_masked?: string | null
          created_at?: string | null
          id?: string
          integration_type?: string
          is_configured?: boolean | null
          last_verified_at?: string | null
          organization_id?: string
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          cadence_day: number | null
          channel: Database["public"]["Enums"]["interaction_channel"]
          content: string
          created_at: string
          direction: string | null
          id: string
          lead_id: string
          metadata: Json | null
          template_used: string | null
          user_id: string | null
        }
        Insert: {
          cadence_day?: number | null
          channel?: Database["public"]["Enums"]["interaction_channel"]
          content: string
          created_at?: string
          direction?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          template_used?: string | null
          user_id?: string | null
        }
        Update: {
          cadence_day?: number | null
          channel?: Database["public"]["Enums"]["interaction_channel"]
          content?: string
          created_at?: string
          direction?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          template_used?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_events: {
        Row: {
          actor_id: string | null
          actor_type: string | null
          agent_id: string | null
          channel: string | null
          conversation_id: string | null
          correlation_id: string | null
          created_at: string
          deal_id: string | null
          dedupe_key: string | null
          description: string | null
          event_category: Database["public"]["Enums"]["journey_event_category"]
          event_type: Database["public"]["Enums"]["journey_event_type"]
          id: string
          ingested_at: string
          lead_id: string | null
          occurred_at: string
          organization_id: string
          payload: Json
          pipeline_stage_id: string | null
          previous_event_id: string | null
          product_id: string | null
          session_id: string | null
          source: string | null
          source_module: string | null
          subject_id: string | null
          subject_type: string
          time_since_previous_seconds: number | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string | null
          agent_id?: string | null
          channel?: string | null
          conversation_id?: string | null
          correlation_id?: string | null
          created_at?: string
          deal_id?: string | null
          dedupe_key?: string | null
          description?: string | null
          event_category?: Database["public"]["Enums"]["journey_event_category"]
          event_type: Database["public"]["Enums"]["journey_event_type"]
          id?: string
          ingested_at?: string
          lead_id?: string | null
          occurred_at?: string
          organization_id: string
          payload?: Json
          pipeline_stage_id?: string | null
          previous_event_id?: string | null
          product_id?: string | null
          session_id?: string | null
          source?: string | null
          source_module?: string | null
          subject_id?: string | null
          subject_type?: string
          time_since_previous_seconds?: number | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string | null
          agent_id?: string | null
          channel?: string | null
          conversation_id?: string | null
          correlation_id?: string | null
          created_at?: string
          deal_id?: string | null
          dedupe_key?: string | null
          description?: string | null
          event_category?: Database["public"]["Enums"]["journey_event_category"]
          event_type?: Database["public"]["Enums"]["journey_event_type"]
          id?: string
          ingested_at?: string
          lead_id?: string | null
          occurred_at?: string
          organization_id?: string
          payload?: Json
          pipeline_stage_id?: string | null
          previous_event_id?: string | null
          product_id?: string | null
          session_id?: string | null
          source?: string | null
          source_module?: string | null
          subject_id?: string | null
          subject_type?: string
          time_since_previous_seconds?: number | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_journey_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_touchpoints: {
        Row: {
          campaign_ref: string | null
          channel: string | null
          created_at: string
          event_id: string | null
          id: string
          lead_id: string | null
          occurred_at: string
          organization_id: string
          payload: Json
          source: string | null
          touchpoint_type: string
        }
        Insert: {
          campaign_ref?: string | null
          channel?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          lead_id?: string | null
          occurred_at?: string
          organization_id: string
          payload?: Json
          source?: string | null
          touchpoint_type: string
        }
        Update: {
          campaign_ref?: string | null
          channel?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          lead_id?: string | null
          occurred_at?: string
          organization_id?: string
          payload?: Json
          source?: string | null
          touchpoint_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_touchpoints_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "journey_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_touchpoints_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "lead_journey_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_touchpoints_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_touchpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_attribution: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          ai_score: number | null
          attributed_at: string | null
          attribution_method: string | null
          campaign_id: string | null
          campaign_name: string | null
          confidence_score: number | null
          created_at: string
          creative_id: string | null
          creative_name: string | null
          ctwa_clid: string | null
          fbclid: string | null
          gclid: string | null
          id: string
          lead_id: string
          li_fat_id: string | null
          organization_id: string
          placement: string | null
          provider: string
          ttclid: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          ai_score?: number | null
          attributed_at?: string | null
          attribution_method?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          confidence_score?: number | null
          created_at?: string
          creative_id?: string | null
          creative_name?: string | null
          ctwa_clid?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          lead_id: string
          li_fat_id?: string | null
          organization_id: string
          placement?: string | null
          provider: string
          ttclid?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          ai_score?: number | null
          attributed_at?: string | null
          attribution_method?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          confidence_score?: number | null
          created_at?: string
          creative_id?: string | null
          creative_name?: string | null
          ctwa_clid?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          lead_id?: string
          li_fat_id?: string | null
          organization_id?: string
          placement?: string | null
          provider?: string
          ttclid?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_attribution_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_attribution_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          lead_id: string
          role_label: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          lead_id: string
          role_label?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
          role_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_queue: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          id: string
          lead_id: string
          organization_id: string
          priority: number
          product_id: string | null
          queued_at: string
          squad_id: string | null
          status: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          id?: string
          lead_id: string
          organization_id: string
          priority?: number
          product_id?: string | null
          queued_at?: string
          squad_id?: string | null
          status?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          id?: string
          lead_id?: string
          organization_id?: string
          priority?: number
          product_id?: string | null
          queued_at?: string
          squad_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_queue_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_queue_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_queue_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_semantic_memory: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string
          embedding: string | null
          id: string
          importance_score: number | null
          lead_id: string
          message_id: string | null
          metadata: Json | null
          organization_id: string
          role: string | null
          source: string
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          importance_score?: number | null
          lead_id: string
          message_id?: string | null
          metadata?: Json | null
          organization_id: string
          role?: string | null
          source?: string
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          importance_score?: number | null
          lead_id?: string
          message_id?: string | null
          metadata?: Json | null
          organization_id?: string
          role?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_semantic_memory_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sessions: {
        Row: {
          channel: string | null
          created_at: string
          ended_at: string | null
          entry_event_id: string | null
          event_count: number
          exit_event_id: string | null
          id: string
          lead_id: string | null
          organization_id: string
          started_at: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          ended_at?: string | null
          entry_event_id?: string | null
          event_count?: number
          exit_event_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          started_at?: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          ended_at?: string | null
          entry_event_id?: string | null
          event_count?: number
          exit_event_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sessions_entry_event_id_fkey"
            columns: ["entry_event_id"]
            isOneToOne: false
            referencedRelation: "journey_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sessions_entry_event_id_fkey"
            columns: ["entry_event_id"]
            isOneToOne: false
            referencedRelation: "lead_journey_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sessions_exit_event_id_fkey"
            columns: ["exit_event_id"]
            isOneToOne: false
            referencedRelation: "journey_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sessions_exit_event_id_fkey"
            columns: ["exit_event_id"]
            isOneToOne: false
            referencedRelation: "lead_journey_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          attribution_model_snapshot: Json
          channels_used: string[]
          first_touch_at: string | null
          first_touch_campaign_id: string | null
          first_touch_channel: string | null
          first_touch_source: string | null
          last_touch_at: string | null
          last_touch_campaign_id: string | null
          last_touch_channel: string | null
          last_touch_source: string | null
          lead_id: string
          organization_id: string
          touch_count: number
          updated_at: string
        }
        Insert: {
          attribution_model_snapshot?: Json
          channels_used?: string[]
          first_touch_at?: string | null
          first_touch_campaign_id?: string | null
          first_touch_channel?: string | null
          first_touch_source?: string | null
          last_touch_at?: string | null
          last_touch_campaign_id?: string | null
          last_touch_channel?: string | null
          last_touch_source?: string | null
          lead_id: string
          organization_id: string
          touch_count?: number
          updated_at?: string
        }
        Update: {
          attribution_model_snapshot?: Json
          channels_used?: string[]
          first_touch_at?: string | null
          first_touch_campaign_id?: string | null
          first_touch_channel?: string | null
          first_touch_source?: string | null
          last_touch_at?: string | null
          last_touch_campaign_id?: string | null
          last_touch_channel?: string | null
          last_touch_source?: string | null
          lead_id?: string
          organization_id?: string
          touch_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stage_history: {
        Row: {
          days_in_stage: number | null
          entered_at: string
          exited_at: string | null
          id: string
          lead_id: string
          stage_id: string | null
        }
        Insert: {
          days_in_stage?: number | null
          entered_at?: string
          exited_at?: string | null
          id?: string
          lead_id: string
          stage_id?: string | null
        }
        Update: {
          days_in_stage?: number | null
          entered_at?: string
          exited_at?: string | null
          id?: string
          lead_id?: string
          stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tag_assignments: {
        Row: {
          applied_at: string
          applied_by: string | null
          lead_id: string
          source: string
          tag_id: string
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          lead_id: string
          source?: string
          tag_id: string
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          lead_id?: string
          source?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tag_assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "lead_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_automatic: boolean
          is_lifecycle_status: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_automatic?: boolean
          is_lifecycle_status?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_automatic?: boolean
          is_lifecycle_status?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_transfer_history: {
        Row: {
          created_at: string | null
          from_squad_id: string | null
          from_user_id: string | null
          id: string
          lead_id: string
          reason: string | null
          to_squad_id: string | null
          to_user_id: string | null
          transferred_by: string | null
        }
        Insert: {
          created_at?: string | null
          from_squad_id?: string | null
          from_user_id?: string | null
          id?: string
          lead_id: string
          reason?: string | null
          to_squad_id?: string | null
          to_user_id?: string | null
          transferred_by?: string | null
        }
        Update: {
          created_at?: string | null
          from_squad_id?: string | null
          from_user_id?: string | null
          id?: string
          lead_id?: string
          reason?: string | null
          to_squad_id?: string | null
          to_user_id?: string | null
          transferred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_transfer_history_from_squad_id_fkey"
            columns: ["from_squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_to_squad_id_fkey"
            columns: ["to_squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          bant_authority: string | null
          bant_budget: string | null
          bant_need: string | null
          bant_timing: string | null
          cadence_day: number | null
          client_ip: string | null
          closer_id: string | null
          company: string | null
          created_at: string
          ctwa_clid: string | null
          current_stage_id: string | null
          custom_fields: Json
          deal_value: number | null
          email: string | null
          expected_close_date: string | null
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          gclid: string | null
          id: string
          landing_page: string | null
          last_contact_at: string | null
          lead_channel: string | null
          lead_origin: string | null
          li_fat_id: string | null
          metadata: Json | null
          name: string
          next_action: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          phone_normalized: string | null
          position: string | null
          previous_assigned_to: string | null
          product_id: string | null
          referrer_url: string | null
          sdr_id: string | null
          sector_id: string | null
          source: string | null
          squad_id: string | null
          tags: string[]
          temperature: Database["public"]["Enums"]["lead_temperature"] | null
          transfer_reason: string | null
          transferred_at: string | null
          transferred_by: string | null
          ttclid: string | null
          updated_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
          whatsapp_opt_in: boolean | null
          whatsapp_opted_out_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bant_authority?: string | null
          bant_budget?: string | null
          bant_need?: string | null
          bant_timing?: string | null
          cadence_day?: number | null
          client_ip?: string | null
          closer_id?: string | null
          company?: string | null
          created_at?: string
          ctwa_clid?: string | null
          current_stage_id?: string | null
          custom_fields?: Json
          deal_value?: number | null
          email?: string | null
          expected_close_date?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gclid?: string | null
          id?: string
          landing_page?: string | null
          last_contact_at?: string | null
          lead_channel?: string | null
          lead_origin?: string | null
          li_fat_id?: string | null
          metadata?: Json | null
          name: string
          next_action?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          phone_normalized?: string | null
          position?: string | null
          previous_assigned_to?: string | null
          product_id?: string | null
          referrer_url?: string | null
          sdr_id?: string | null
          sector_id?: string | null
          source?: string | null
          squad_id?: string | null
          tags?: string[]
          temperature?: Database["public"]["Enums"]["lead_temperature"] | null
          transfer_reason?: string | null
          transferred_at?: string | null
          transferred_by?: string | null
          ttclid?: string | null
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
          whatsapp_opt_in?: boolean | null
          whatsapp_opted_out_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bant_authority?: string | null
          bant_budget?: string | null
          bant_need?: string | null
          bant_timing?: string | null
          cadence_day?: number | null
          client_ip?: string | null
          closer_id?: string | null
          company?: string | null
          created_at?: string
          ctwa_clid?: string | null
          current_stage_id?: string | null
          custom_fields?: Json
          deal_value?: number | null
          email?: string | null
          expected_close_date?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gclid?: string | null
          id?: string
          landing_page?: string | null
          last_contact_at?: string | null
          lead_channel?: string | null
          lead_origin?: string | null
          li_fat_id?: string | null
          metadata?: Json | null
          name?: string
          next_action?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          phone_normalized?: string | null
          position?: string | null
          previous_assigned_to?: string | null
          product_id?: string | null
          referrer_url?: string | null
          sdr_id?: string | null
          sector_id?: string | null
          source?: string | null
          squad_id?: string | null
          tags?: string[]
          temperature?: Database["public"]["Enums"]["lead_temperature"] | null
          transfer_reason?: string | null
          transferred_at?: string | null
          transferred_by?: string | null
          ttclid?: string | null
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
          whatsapp_opt_in?: boolean | null
          whatsapp_opted_out_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_sdr_id_fkey"
            columns: ["sdr_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_sdr_id_fkey"
            columns: ["sdr_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_ads: {
        Row: {
          adset_external_id: string | null
          adset_id: string | null
          campaign_external_id: string | null
          campaign_id: string | null
          created_at: string
          creative_external_id: string | null
          creative_id: string | null
          external_id: string
          id: string
          metadata: Json
          name: string | null
          organization_id: string
          preview_url: string | null
          provider: string
          status: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          adset_external_id?: string | null
          adset_id?: string | null
          campaign_external_id?: string | null
          campaign_id?: string | null
          created_at?: string
          creative_external_id?: string | null
          creative_id?: string | null
          external_id: string
          id?: string
          metadata?: Json
          name?: string | null
          organization_id: string
          preview_url?: string | null
          provider: string
          status?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          adset_external_id?: string | null
          adset_id?: string | null
          campaign_external_id?: string | null
          campaign_id?: string | null
          created_at?: string
          creative_external_id?: string | null
          creative_id?: string | null
          external_id?: string
          id?: string
          metadata?: Json
          name?: string | null
          organization_id?: string
          preview_url?: string | null
          provider?: string
          status?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_ads_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "marketing_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_ads_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "marketing_creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_ads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_adsets: {
        Row: {
          campaign_external_id: string | null
          campaign_id: string | null
          created_at: string
          daily_budget: number | null
          external_id: string
          id: string
          lifetime_budget: number | null
          metadata: Json
          name: string | null
          organization_id: string
          provider: string
          status: string | null
          synced_at: string | null
          targeting: Json
          updated_at: string
        }
        Insert: {
          campaign_external_id?: string | null
          campaign_id?: string | null
          created_at?: string
          daily_budget?: number | null
          external_id: string
          id?: string
          lifetime_budget?: number | null
          metadata?: Json
          name?: string | null
          organization_id: string
          provider: string
          status?: string | null
          synced_at?: string | null
          targeting?: Json
          updated_at?: string
        }
        Update: {
          campaign_external_id?: string | null
          campaign_id?: string | null
          created_at?: string
          daily_budget?: number | null
          external_id?: string
          id?: string
          lifetime_budget?: number | null
          metadata?: Json
          name?: string | null
          organization_id?: string
          provider?: string
          status?: string | null
          synced_at?: string | null
          targeting?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_adsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_adsets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_ai_executions: {
        Row: {
          action_type: string
          applied_state: Json
          created_at: string
          error: string | null
          executed_at: string
          executed_by: string | null
          id: string
          organization_id: string
          previous_state: Json
          provider: string
          provider_response: Json
          recommendation_id: string | null
          revert_of: string | null
          reverted_at: string | null
          reverted_by: string | null
          status: string
          target_label: string | null
          target_ref_id: string | null
          target_type: string
        }
        Insert: {
          action_type: string
          applied_state?: Json
          created_at?: string
          error?: string | null
          executed_at?: string
          executed_by?: string | null
          id?: string
          organization_id: string
          previous_state?: Json
          provider?: string
          provider_response?: Json
          recommendation_id?: string | null
          revert_of?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          status?: string
          target_label?: string | null
          target_ref_id?: string | null
          target_type: string
        }
        Update: {
          action_type?: string
          applied_state?: Json
          created_at?: string
          error?: string | null
          executed_at?: string
          executed_by?: string | null
          id?: string
          organization_id?: string
          previous_state?: Json
          provider?: string
          provider_response?: Json
          recommendation_id?: string | null
          revert_of?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          status?: string
          target_label?: string | null
          target_ref_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_ai_executions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_ai_executions_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "marketing_ai_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_ai_executions_revert_of_fkey"
            columns: ["revert_of"]
            isOneToOne: false
            referencedRelation: "marketing_ai_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_ai_findings: {
        Row: {
          category: string
          created_at: string
          evidence: Json
          id: string
          metrics: Json
          organization_id: string
          period_end: string | null
          period_start: string | null
          scope: string
          scope_ref_id: string | null
          scope_ref_label: string | null
          severity: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          evidence?: Json
          id?: string
          metrics?: Json
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          scope: string
          scope_ref_id?: string | null
          scope_ref_label?: string | null
          severity?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          evidence?: Json
          id?: string
          metrics?: Json
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          scope?: string
          scope_ref_id?: string | null
          scope_ref_label?: string | null
          severity?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_ai_findings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_ai_recommendations: {
        Row: {
          action_type: string
          created_at: string
          current_state: Json
          data_used: Json
          decided_at: string | null
          decided_by: string | null
          expected_result: string | null
          finding_id: string | null
          id: string
          organization_id: string
          proposed_state: Json
          rationale: string | null
          risk: string
          status: string
          target_label: string | null
          target_ref_id: string | null
          target_type: string
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          current_state?: Json
          data_used?: Json
          decided_at?: string | null
          decided_by?: string | null
          expected_result?: string | null
          finding_id?: string | null
          id?: string
          organization_id: string
          proposed_state?: Json
          rationale?: string | null
          risk?: string
          status?: string
          target_label?: string | null
          target_ref_id?: string | null
          target_type: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          current_state?: Json
          data_used?: Json
          decided_at?: string | null
          decided_by?: string | null
          expected_result?: string | null
          finding_id?: string | null
          id?: string
          organization_id?: string
          proposed_state?: Json
          rationale?: string | null
          risk?: string
          status?: string
          target_label?: string | null
          target_ref_id?: string | null
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_ai_recommendations_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "marketing_ai_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_ai_recommendations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_ai_rule_runs: {
        Row: {
          details: Json
          evaluated_at: string
          executions_created: number
          id: string
          matched_count: number
          organization_id: string
          recommendations_created: number
          rule_id: string
          skipped_count: number
          skipped_reasons: Json
          triggered_by: string
        }
        Insert: {
          details?: Json
          evaluated_at?: string
          executions_created?: number
          id?: string
          matched_count?: number
          organization_id: string
          recommendations_created?: number
          rule_id: string
          skipped_count?: number
          skipped_reasons?: Json
          triggered_by?: string
        }
        Update: {
          details?: Json
          evaluated_at?: string
          executions_created?: number
          id?: string
          matched_count?: number
          organization_id?: string
          recommendations_created?: number
          rule_id?: string
          skipped_count?: number
          skipped_reasons?: Json
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_ai_rule_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "marketing_ai_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_ai_rules: {
        Row: {
          action: Json
          conditions: Json
          cooldown_hours: number
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          last_match_count: number
          last_run_at: string | null
          mode: string
          name: string
          organization_id: string
          scope: string
          updated_at: string
          window_days: number
        }
        Insert: {
          action: Json
          conditions?: Json
          cooldown_hours?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          last_match_count?: number
          last_run_at?: string | null
          mode?: string
          name: string
          organization_id: string
          scope?: string
          updated_at?: string
          window_days?: number
        }
        Update: {
          action?: Json
          conditions?: Json
          cooldown_hours?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          last_match_count?: number
          last_run_at?: string | null
          mode?: string
          name?: string
          organization_id?: string
          scope?: string
          updated_at?: string
          window_days?: number
        }
        Relationships: []
      }
      marketing_ai_safety_limits: {
        Row: {
          allow_auto_activate: boolean
          allow_auto_budget: boolean
          allow_auto_pause: boolean
          blocked_campaign_ids: string[]
          created_at: string
          max_actions_per_day: number
          max_budget_change_pct: number
          max_daily_spend_cents: number
          organization_id: string
          quiet_hours_end: number | null
          quiet_hours_start: number | null
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_auto_activate?: boolean
          allow_auto_budget?: boolean
          allow_auto_pause?: boolean
          blocked_campaign_ids?: string[]
          created_at?: string
          max_actions_per_day?: number
          max_budget_change_pct?: number
          max_daily_spend_cents?: number
          organization_id: string
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_auto_activate?: boolean
          allow_auto_budget?: boolean
          allow_auto_pause?: boolean
          blocked_campaign_ids?: string[]
          created_at?: string
          max_actions_per_day?: number
          max_budget_change_pct?: number
          max_daily_spend_cents?: number
          organization_id?: string
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          ad_account_id: string | null
          created_at: string
          daily_budget: number | null
          external_id: string
          id: string
          lifetime_budget: number | null
          metadata: Json
          name: string | null
          objective: string | null
          organization_id: string
          provider: string
          start_time: string | null
          status: string | null
          stop_time: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          ad_account_id?: string | null
          created_at?: string
          daily_budget?: number | null
          external_id: string
          id?: string
          lifetime_budget?: number | null
          metadata?: Json
          name?: string | null
          objective?: string | null
          organization_id: string
          provider: string
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string | null
          created_at?: string
          daily_budget?: number | null
          external_id?: string
          id?: string
          lifetime_budget?: number | null
          metadata?: Json
          name?: string | null
          objective?: string | null
          organization_id?: string
          provider?: string
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_conversion_definitions: {
        Row: {
          category: string | null
          created_at: string
          default_currency: string | null
          external_id: string
          id: string
          is_active: boolean
          is_primary: boolean
          kind: string
          mapped_stage_id: string | null
          metadata: Json
          name: string
          organization_id: string
          pixel_id: string | null
          provider: string
          rule: Json | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_currency?: string | null
          external_id: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          kind: string
          mapped_stage_id?: string | null
          metadata?: Json
          name: string
          organization_id: string
          pixel_id?: string | null
          provider?: string
          rule?: Json | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          default_currency?: string | null
          external_id?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          kind?: string
          mapped_stage_id?: string | null
          metadata?: Json
          name?: string
          organization_id?: string
          pixel_id?: string | null
          provider?: string
          rule?: Json | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_conversion_definitions_mapped_stage_id_fkey"
            columns: ["mapped_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_conversion_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_conversion_events: {
        Row: {
          created_at: string
          dedup_key: string
          error_message: string | null
          event_type: string
          id: string
          journey_event_id: string | null
          lead_id: string | null
          meta_response: Json | null
          next_retry_at: string | null
          organization_id: string
          payload: Json
          provider: string
          retry_count: number
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dedup_key: string
          error_message?: string | null
          event_type: string
          id?: string
          journey_event_id?: string | null
          lead_id?: string | null
          meta_response?: Json | null
          next_retry_at?: string | null
          organization_id: string
          payload?: Json
          provider?: string
          retry_count?: number
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dedup_key?: string
          error_message?: string | null
          event_type?: string
          id?: string
          journey_event_id?: string | null
          lead_id?: string | null
          meta_response?: Json | null
          next_retry_at?: string | null
          organization_id?: string
          payload?: Json
          provider?: string
          retry_count?: number
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_conversion_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_conversion_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_conversion_metrics_daily: {
        Row: {
          action_type: string
          count: number
          currency: string | null
          date: string
          entity_external_id: string
          entity_type: string
          id: string
          organization_id: string
          provider: string
          synced_at: string
          value: number
        }
        Insert: {
          action_type: string
          count?: number
          currency?: string | null
          date: string
          entity_external_id: string
          entity_type: string
          id?: string
          organization_id: string
          provider?: string
          synced_at?: string
          value?: number
        }
        Update: {
          action_type?: string
          count?: number
          currency?: string | null
          date?: string
          entity_external_id?: string
          entity_type?: string
          id?: string
          organization_id?: string
          provider?: string
          synced_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_conversion_metrics_daily_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_creatives: {
        Row: {
          body: string | null
          content_hash: string | null
          created_at: string
          cta_type: string | null
          external_id: string
          headline: string | null
          id: string
          media_url: string | null
          metadata: Json
          name: string | null
          organization_id: string
          provider: string
          synced_at: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          content_hash?: string | null
          created_at?: string
          cta_type?: string | null
          external_id: string
          headline?: string | null
          id?: string
          media_url?: string | null
          metadata?: Json
          name?: string | null
          organization_id: string
          provider: string
          synced_at?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          content_hash?: string | null
          created_at?: string
          cta_type?: string | null
          external_id?: string
          headline?: string | null
          id?: string
          media_url?: string | null
          metadata?: Json
          name?: string | null
          organization_id?: string
          provider?: string
          synced_at?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_creatives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_insights_daily: {
        Row: {
          clicks: number
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          ctwa_clicks: number
          date: string
          entity_external_id: string
          entity_type: string
          frequency: number | null
          id: string
          impressions: number
          organization_id: string
          provider: string
          purchases: number
          raw: Json
          reach: number | null
          revenue: number
          spend: number
          synced_at: string
          updated_at: string
        }
        Insert: {
          clicks?: number
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          ctwa_clicks?: number
          date: string
          entity_external_id: string
          entity_type: string
          frequency?: number | null
          id?: string
          impressions?: number
          organization_id: string
          provider: string
          purchases?: number
          raw?: Json
          reach?: number | null
          revenue?: number
          spend?: number
          synced_at?: string
          updated_at?: string
        }
        Update: {
          clicks?: number
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          ctwa_clicks?: number
          date?: string
          entity_external_id?: string
          entity_type?: string
          frequency?: number | null
          id?: string
          impressions?: number
          organization_id?: string
          provider?: string
          purchases?: number
          raw?: Json
          reach?: number | null
          revenue?: number
          spend?: number
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_insights_daily_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mass_email_campaigns: {
        Row: {
          created_at: string | null
          created_by: string | null
          html_content: string
          id: string
          organization_id: string
          scheduled_at: string | null
          sent_at: string | null
          stats: Json | null
          status: string | null
          subject: string
          target_filters: Json | null
          target_type: string
          template_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          html_content: string
          id?: string
          organization_id: string
          scheduled_at?: string | null
          sent_at?: string | null
          stats?: Json | null
          status?: string | null
          subject: string
          target_filters?: Json | null
          target_type?: string
          template_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          html_content?: string
          id?: string
          organization_id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          stats?: Json | null
          status?: string | null
          subject?: string
          target_filters?: Json | null
          target_type?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mass_email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_email_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      mass_email_recipients: {
        Row: {
          campaign_id: string
          created_at: string | null
          email: string
          error_message: string | null
          id: string
          sent_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          email: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          email?: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mass_email_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mass_email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_email_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_email_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string
          id: string
          name: string
          objective: string | null
          organization_id: string | null
          product_id: string | null
          status: string | null
          tags: string[] | null
          type: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          objective?: string | null
          organization_id?: string | null
          product_id?: string | null
          status?: string | null
          tags?: string[] | null
          type: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          objective?: string | null
          organization_id?: string | null
          product_id?: string | null
          status?: string | null
          tags?: string[] | null
          type?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          conversation_id: string
          created_at: string
          emoji: string
          id: string
          message_id: string
          reactor_type: string
          user_id: string | null
          visitor_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          reactor_type: string
          user_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          reactor_type?: string
          user_id?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "webchat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_oauth_sessions: {
        Row: {
          consumed_at: string | null
          created_at: string
          discovered: Json | null
          error: string | null
          id: string
          organization_id: string
          purpose: string
          state: string
          status: string
          token_expires_at: string | null
          user_access_token_encrypted: string | null
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          discovered?: Json | null
          error?: string | null
          id?: string
          organization_id: string
          purpose?: string
          state: string
          status?: string
          token_expires_at?: string | null
          user_access_token_encrypted?: string | null
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          discovered?: Json | null
          error?: string | null
          id?: string
          organization_id?: string
          purpose?: string
          state?: string
          status?: string
          token_expires_at?: string | null
          user_access_token_encrypted?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mia_action_catalog: {
        Row: {
          action_type: string
          category: string
          created_at: string
          default_autonomy: string
          description: string
          is_external: boolean
          reversible: boolean
        }
        Insert: {
          action_type: string
          category?: string
          created_at?: string
          default_autonomy?: string
          description?: string
          is_external?: boolean
          reversible?: boolean
        }
        Update: {
          action_type?: string
          category?: string
          created_at?: string
          default_autonomy?: string
          description?: string
          is_external?: boolean
          reversible?: boolean
        }
        Relationships: []
      }
      mia_action_outcomes: {
        Row: {
          action_id: string
          id: string
          measured_at: string
          measured_by: string
          notes: string | null
          organization_id: string
          outcome_type: string
          outcome_value: number | null
        }
        Insert: {
          action_id: string
          id?: string
          measured_at?: string
          measured_by?: string
          notes?: string | null
          organization_id: string
          outcome_type: string
          outcome_value?: number | null
        }
        Update: {
          action_id?: string
          id?: string
          measured_at?: string
          measured_by?: string
          notes?: string | null
          organization_id?: string
          outcome_type?: string
          outcome_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mia_action_outcomes_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "mia_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_action_outcomes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_actions: {
        Row: {
          action_type: string
          approved_at: string | null
          approved_by: string | null
          autonomy_level: string | null
          cancelled_at: string | null
          created_at: string
          error_message: string | null
          executed_at: string | null
          id: string
          organization_id: string
          payload: Json
          preview: string
          requires_approval: boolean
          result: Json | null
          risk_level: string
          status: string
          target_id: string | null
          target_type: string | null
          undo_payload: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          approved_at?: string | null
          approved_by?: string | null
          autonomy_level?: string | null
          cancelled_at?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          organization_id: string
          payload?: Json
          preview?: string
          requires_approval?: boolean
          result?: Json | null
          risk_level?: string
          status?: string
          target_id?: string | null
          target_type?: string | null
          undo_payload?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_type?: string
          approved_at?: string | null
          approved_by?: string | null
          autonomy_level?: string | null
          cancelled_at?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          organization_id?: string
          payload?: Json
          preview?: string
          requires_approval?: boolean
          result?: Json | null
          risk_level?: string
          status?: string
          target_id?: string | null
          target_type?: string | null
          undo_payload?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mia_actions_action_type_fkey"
            columns: ["action_type"]
            isOneToOne: false
            referencedRelation: "mia_action_catalog"
            referencedColumns: ["action_type"]
          },
        ]
      }
      mia_agent_learning_candidates: {
        Row: {
          agent_id: string
          confidence: number
          created_at: string
          evidence: Json
          fingerprint: string
          id: string
          learning_type: string
          occurrences: number
          organization_id: string
          published_material_id: string | null
          recommendation: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: string
          source_conversation_ids: string[]
          source_insight_id: string | null
          status: string
          suggested_training_text: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          confidence?: number
          created_at?: string
          evidence?: Json
          fingerprint: string
          id?: string
          learning_type: string
          occurrences?: number
          organization_id: string
          published_material_id?: string | null
          recommendation: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string
          source_conversation_ids?: string[]
          source_insight_id?: string | null
          status?: string
          suggested_training_text: string
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          confidence?: number
          created_at?: string
          evidence?: Json
          fingerprint?: string
          id?: string
          learning_type?: string
          occurrences?: number
          organization_id?: string
          published_material_id?: string | null
          recommendation?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string
          source_conversation_ids?: string[]
          source_insight_id?: string | null
          status?: string
          suggested_training_text?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mia_agent_learning_candidates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_agent_learning_candidates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_agent_learning_candidates_published_material_id_fkey"
            columns: ["published_material_id"]
            isOneToOne: false
            referencedRelation: "agent_training_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_agent_learning_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_agent_learning_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_agent_learning_candidates_source_insight_id_fkey"
            columns: ["source_insight_id"]
            isOneToOne: false
            referencedRelation: "mia_conversation_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_autonomy_settings: {
        Row: {
          action_type: string
          active: boolean
          daily_limit: number | null
          id: string
          level: string
          max_value: number | null
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action_type: string
          active?: boolean
          daily_limit?: number | null
          id?: string
          level: string
          max_value?: number | null
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action_type?: string
          active?: boolean
          daily_limit?: number | null
          id?: string
          level?: string
          max_value?: number | null
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mia_autonomy_settings_action_type_fkey"
            columns: ["action_type"]
            isOneToOne: false
            referencedRelation: "mia_action_catalog"
            referencedColumns: ["action_type"]
          },
          {
            foreignKeyName: "mia_autonomy_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_business_knowledge: {
        Row: {
          category: string
          confidence: number | null
          content: string
          created_at: string | null
          embedding: string | null
          evidence: Json | null
          id: string
          is_active: boolean | null
          last_seen_at: string | null
          metrics: Json | null
          occurrences: number | null
          organization_id: string
          source_id: string | null
          source_type: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category: string
          confidence?: number | null
          content: string
          created_at?: string | null
          embedding?: string | null
          evidence?: Json | null
          id?: string
          is_active?: boolean | null
          last_seen_at?: string | null
          metrics?: Json | null
          occurrences?: number | null
          organization_id: string
          source_id?: string | null
          source_type: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          confidence?: number | null
          content?: string
          created_at?: string | null
          embedding?: string | null
          evidence?: Json | null
          id?: string
          is_active?: boolean | null
          last_seen_at?: string | null
          metrics?: Json | null
          occurrences?: number | null
          organization_id?: string
          source_id?: string | null
          source_type?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mia_business_knowledge_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_business_metrics: {
        Row: {
          avg_duration_days: number | null
          avg_messages_count: number | null
          avg_response_time_min: number | null
          avg_sentiment_score: number | null
          computed_at: string | null
          conversion_rate: number | null
          converted: number | null
          dimension: string
          dimension_id: string | null
          dimension_key: string
          id: string
          in_progress: number | null
          lost: number | null
          organization_id: string
          period: string
          period_start: string
          top_objections: Json | null
          top_winning_patterns: Json | null
          total_conversations: number | null
        }
        Insert: {
          avg_duration_days?: number | null
          avg_messages_count?: number | null
          avg_response_time_min?: number | null
          avg_sentiment_score?: number | null
          computed_at?: string | null
          conversion_rate?: number | null
          converted?: number | null
          dimension: string
          dimension_id?: string | null
          dimension_key: string
          id?: string
          in_progress?: number | null
          lost?: number | null
          organization_id: string
          period: string
          period_start: string
          top_objections?: Json | null
          top_winning_patterns?: Json | null
          total_conversations?: number | null
        }
        Update: {
          avg_duration_days?: number | null
          avg_messages_count?: number | null
          avg_response_time_min?: number | null
          avg_sentiment_score?: number | null
          computed_at?: string | null
          conversion_rate?: number | null
          converted?: number | null
          dimension?: string
          dimension_id?: string | null
          dimension_key?: string
          id?: string
          in_progress?: number | null
          lost?: number | null
          organization_id?: string
          period?: string
          period_start?: string
          top_objections?: Json | null
          top_winning_patterns?: Json | null
          total_conversations?: number | null
        }
        Relationships: []
      }
      mia_chat_messages: {
        Row: {
          author_id: string | null
          blocks: Json
          content: string
          created_at: string
          id: string
          input_mode: string
          metadata: Json
          organization_id: string
          role: string
          thread_id: string
          tools_used: string[]
        }
        Insert: {
          author_id?: string | null
          blocks?: Json
          content?: string
          created_at?: string
          id?: string
          input_mode?: string
          metadata?: Json
          organization_id: string
          role: string
          thread_id: string
          tools_used?: string[]
        }
        Update: {
          author_id?: string | null
          blocks?: Json
          content?: string
          created_at?: string
          id?: string
          input_mode?: string
          metadata?: Json
          organization_id?: string
          role?: string
          thread_id?: string
          tools_used?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "mia_chat_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "mia_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_chat_schedule_runs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          organization_id: string
          response_message_id: string | null
          schedule_id: string
          started_at: string
          status: string
          thread_id: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          organization_id: string
          response_message_id?: string | null
          schedule_id: string
          started_at?: string
          status?: string
          thread_id?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          organization_id?: string
          response_message_id?: string | null
          schedule_id?: string
          started_at?: string
          status?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mia_chat_schedule_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_chat_schedule_runs_response_message_id_fkey"
            columns: ["response_message_id"]
            isOneToOne: false
            referencedRelation: "mia_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_chat_schedule_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "mia_chat_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_chat_schedule_runs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "mia_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_chat_schedules: {
        Row: {
          cadence: string
          created_at: string
          created_by: string
          id: string
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          local_time: string | null
          name: string
          next_run_at: string | null
          organization_id: string
          prompt: string
          run_at: string | null
          run_count: number
          status: string
          thread_id: string | null
          timezone: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          cadence: string
          created_at?: string
          created_by: string
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          local_time?: string | null
          name: string
          next_run_at?: string | null
          organization_id: string
          prompt: string
          run_at?: string | null
          run_count?: number
          status?: string
          thread_id?: string | null
          timezone?: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          cadence?: string
          created_at?: string
          created_by?: string
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          local_time?: string | null
          name?: string
          next_run_at?: string | null
          organization_id?: string
          prompt?: string
          run_at?: string | null
          run_count?: number
          status?: string
          thread_id?: string | null
          timezone?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "mia_chat_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_chat_schedules_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "mia_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_chat_threads: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_pinned: boolean
          last_message_at: string
          metadata: Json
          organization_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_pinned?: boolean
          last_message_at?: string
          metadata?: Json
          organization_id: string
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_pinned?: boolean
          last_message_at?: string
          metadata?: Json
          organization_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mia_chat_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_communications: {
        Row: {
          action_id: string | null
          channel: string
          created_at: string
          delivered_at: string | null
          draft: Json
          error: string | null
          final_message: Json
          id: string
          organization_id: string
          provider_message_id: string | null
          recipient_id: string | null
          recipient_label: string | null
          recipient_type: string | null
          requested_by: string
          risk_level: string
          status: string
        }
        Insert: {
          action_id?: string | null
          channel: string
          created_at?: string
          delivered_at?: string | null
          draft?: Json
          error?: string | null
          final_message?: Json
          id?: string
          organization_id: string
          provider_message_id?: string | null
          recipient_id?: string | null
          recipient_label?: string | null
          recipient_type?: string | null
          requested_by: string
          risk_level?: string
          status?: string
        }
        Update: {
          action_id?: string | null
          channel?: string
          created_at?: string
          delivered_at?: string | null
          draft?: Json
          error?: string | null
          final_message?: Json
          id?: string
          organization_id?: string
          provider_message_id?: string | null
          recipient_id?: string | null
          recipient_label?: string | null
          recipient_type?: string | null
          requested_by?: string
          risk_level?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mia_communications_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "mia_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_conversation_insights: {
        Row: {
          agent_id: string | null
          conversation_id: string
          deal_value: number | null
          duration_days: number | null
          id: string
          ideal_next_action: string | null
          interests: string[] | null
          key_moments: Json | null
          lead_engagement: string | null
          messages_count: number | null
          model_used: string | null
          objections: string[] | null
          organization_id: string
          outcome: string | null
          patterns: Json | null
          processed_at: string | null
          response_time_avg_min: number | null
          seller_approach: string | null
          sentiment: string | null
          turning_points: Json
          what_failed: string[]
          what_worked: string[]
        }
        Insert: {
          agent_id?: string | null
          conversation_id: string
          deal_value?: number | null
          duration_days?: number | null
          id?: string
          ideal_next_action?: string | null
          interests?: string[] | null
          key_moments?: Json | null
          lead_engagement?: string | null
          messages_count?: number | null
          model_used?: string | null
          objections?: string[] | null
          organization_id: string
          outcome?: string | null
          patterns?: Json | null
          processed_at?: string | null
          response_time_avg_min?: number | null
          seller_approach?: string | null
          sentiment?: string | null
          turning_points?: Json
          what_failed?: string[]
          what_worked?: string[]
        }
        Update: {
          agent_id?: string | null
          conversation_id?: string
          deal_value?: number | null
          duration_days?: number | null
          id?: string
          ideal_next_action?: string | null
          interests?: string[] | null
          key_moments?: Json | null
          lead_engagement?: string | null
          messages_count?: number | null
          model_used?: string | null
          objections?: string[] | null
          organization_id?: string
          outcome?: string | null
          patterns?: Json | null
          processed_at?: string | null
          response_time_avg_min?: number | null
          seller_approach?: string | null
          sentiment?: string | null
          turning_points?: Json
          what_failed?: string[]
          what_worked?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "mia_conversation_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_conversation_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_daily_summaries: {
        Row: {
          organization_id: string
          payload: Json
          summary_date: string
          updated_at: string
        }
        Insert: {
          organization_id: string
          payload?: Json
          summary_date: string
          updated_at?: string
        }
        Update: {
          organization_id?: string
          payload?: Json
          summary_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      mia_learn_queue: {
        Row: {
          attempts: number | null
          conversation_id: string
          id: string
          last_attempt_at: string | null
          organization_id: string
          queued_at: string | null
        }
        Insert: {
          attempts?: number | null
          conversation_id: string
          id?: string
          last_attempt_at?: string | null
          organization_id: string
          queued_at?: string | null
        }
        Update: {
          attempts?: number | null
          conversation_id?: string
          id?: string
          last_attempt_at?: string | null
          organization_id?: string
          queued_at?: string | null
        }
        Relationships: []
      }
      mia_logs: {
        Row: {
          created_at: string
          id: string
          latency_ms: number | null
          organization_id: string
          pergunta: string | null
          resposta: string | null
          tool_utilizada: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          organization_id: string
          pergunta?: string | null
          resposta?: string | null
          tool_utilizada?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          organization_id?: string
          pergunta?: string | null
          resposta?: string | null
          tool_utilizada?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mia_open_conversation_analysis_queue: {
        Row: {
          attempts: number
          claimed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          last_error: string | null
          organization_id: string
          run_id: string
          source_last_message_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          organization_id: string
          run_id: string
          source_last_message_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          organization_id?: string
          run_id?: string
          source_last_message_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mia_open_conversation_analysis_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_open_conversation_analysis_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_open_conversation_analysis_queue_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "mia_open_report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_open_conversation_assessments: {
        Row: {
          analysis_version: string
          analyzed_at: string
          category: string
          channel: string | null
          close_probability: number
          confidence: number
          conversation_id: string
          conversation_status: string | null
          created_at: string
          deal_id: string | null
          deal_value: number | null
          evidence: Json
          id: string
          intent_score: number
          lead_id: string | null
          messages_analyzed: number
          missing_information: Json
          model_used: string | null
          next_best_action: string
          objections: Json
          organization_id: string
          owner_id: string | null
          owner_name: string | null
          product_id: string | null
          product_name: string | null
          purchase_signals: Json
          risks: Json
          sentiment: string
          source_last_message_at: string | null
          source_message_count: number
          suggested_reply: string | null
          summary: string
          transcript_truncated: boolean
          updated_at: string
          urgency_score: number
          visitor_name: string | null
        }
        Insert: {
          analysis_version: string
          analyzed_at?: string
          category: string
          channel?: string | null
          close_probability?: number
          confidence?: number
          conversation_id: string
          conversation_status?: string | null
          created_at?: string
          deal_id?: string | null
          deal_value?: number | null
          evidence?: Json
          id?: string
          intent_score?: number
          lead_id?: string | null
          messages_analyzed?: number
          missing_information?: Json
          model_used?: string | null
          next_best_action?: string
          objections?: Json
          organization_id: string
          owner_id?: string | null
          owner_name?: string | null
          product_id?: string | null
          product_name?: string | null
          purchase_signals?: Json
          risks?: Json
          sentiment?: string
          source_last_message_at?: string | null
          source_message_count?: number
          suggested_reply?: string | null
          summary?: string
          transcript_truncated?: boolean
          updated_at?: string
          urgency_score?: number
          visitor_name?: string | null
        }
        Update: {
          analysis_version?: string
          analyzed_at?: string
          category?: string
          channel?: string | null
          close_probability?: number
          confidence?: number
          conversation_id?: string
          conversation_status?: string | null
          created_at?: string
          deal_id?: string | null
          deal_value?: number | null
          evidence?: Json
          id?: string
          intent_score?: number
          lead_id?: string | null
          messages_analyzed?: number
          missing_information?: Json
          model_used?: string | null
          next_best_action?: string
          objections?: Json
          organization_id?: string
          owner_id?: string | null
          owner_name?: string | null
          product_id?: string | null
          product_name?: string | null
          purchase_signals?: Json
          risks?: Json
          sentiment?: string
          source_last_message_at?: string | null
          source_message_count?: number
          suggested_reply?: string | null
          summary?: string
          transcript_truncated?: boolean
          updated_at?: string
          urgency_score?: number
          visitor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mia_open_conversation_assessments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_open_conversation_assessments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_open_conversation_assessments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_open_conversation_assessments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mia_open_conversation_assessments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_open_report_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          failed_total: number
          id: string
          open_total: number
          organization_id: string
          processed_total: number
          queued_total: number
          requested_by: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          failed_total?: number
          id?: string
          open_total?: number
          organization_id: string
          processed_total?: number
          queued_total?: number
          requested_by?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          failed_total?: number
          id?: string
          open_total?: number
          organization_id?: string
          processed_total?: number
          queued_total?: number
          requested_by?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mia_open_report_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mia_runtime_endpoints: {
        Row: {
          name: string
          updated_at: string
          url: string
        }
        Insert: {
          name: string
          updated_at?: string
          url: string
        }
        Update: {
          name?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      mia_runtime_secrets: {
        Row: {
          created_at: string
          name: string
          rotated_at: string
          secret: string
        }
        Insert: {
          created_at?: string
          name: string
          rotated_at?: string
          secret: string
        }
        Update: {
          created_at?: string
          name?: string
          rotated_at?: string
          secret?: string
        }
        Relationships: []
      }
      mia_user_memory: {
        Row: {
          created_at: string
          display_name: string | null
          facts: Json
          id: string
          last_active_entities: Json
          locale: string | null
          organization_id: string
          preferences: Json
          role_label: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          facts?: Json
          id?: string
          last_active_entities?: Json
          locale?: string | null
          organization_id: string
          preferences?: Json
          role_label?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          facts?: Json
          id?: string
          last_active_entities?: Json
          locale?: string | null
          organization_id?: string
          preferences?: Json
          role_label?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          id: string
          notification_type: string
          organization_id: string
          reference_date: string | null
          reference_id: string | null
          sent_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          notification_type: string
          organization_id: string
          reference_date?: string | null
          reference_id?: string | null
          sent_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          notification_type?: string
          organization_id?: string
          reference_date?: string | null
          reference_id?: string | null
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          admin_notification_id: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string | null
          metadata: Json | null
          product_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          action_url?: string | null
          admin_notification_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          product_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          action_url?: string | null
          admin_notification_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          product_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_admin_notification_id_fkey"
            columns: ["admin_notification_id"]
            isOneToOne: false
            referencedRelation: "admin_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      objections: {
        Row: {
          category: string
          created_at: string
          follow_up_question: string | null
          id: string
          organization_id: string | null
          product_id: string | null
          proof_material_id: string | null
          suggested_response: string
          updated_at: string
          what_they_mean: string | null
          what_they_say: string
        }
        Insert: {
          category: string
          created_at?: string
          follow_up_question?: string | null
          id?: string
          organization_id?: string | null
          product_id?: string | null
          proof_material_id?: string | null
          suggested_response: string
          updated_at?: string
          what_they_mean?: string | null
          what_they_say: string
        }
        Update: {
          category?: string
          created_at?: string
          follow_up_question?: string | null
          id?: string
          organization_id?: string | null
          product_id?: string | null
          proof_material_id?: string | null
          suggested_response?: string
          updated_at?: string
          what_they_mean?: string | null
          what_they_say?: string
        }
        Relationships: [
          {
            foreignKeyName: "objections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_submissions: {
        Row: {
          access_count: number
          applied_at: string | null
          applied_by: string | null
          applied_refs: Json
          consumed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          expires_at: string | null
          first_seen_at: string | null
          first_seen_ip: string | null
          first_seen_ua: string | null
          id: string
          mode: string
          organization_id: string
          payload: Json
          revoked_at: string | null
          revoked_by: string | null
          session_token: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          submitted_ip: string | null
          token_hash: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          access_count?: number
          applied_at?: string | null
          applied_by?: string | null
          applied_refs?: Json
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          expires_at?: string | null
          first_seen_at?: string | null
          first_seen_ip?: string | null
          first_seen_ua?: string | null
          id?: string
          mode: string
          organization_id: string
          payload?: Json
          revoked_at?: string | null
          revoked_by?: string | null
          session_token?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_ip?: string | null
          token_hash?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          access_count?: number
          applied_at?: string | null
          applied_by?: string | null
          applied_refs?: Json
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          expires_at?: string | null
          first_seen_at?: string | null
          first_seen_ip?: string | null
          first_seen_ua?: string | null
          id?: string
          mode?: string
          organization_id?: string
          payload?: Json
          revoked_at?: string | null
          revoked_by?: string | null
          session_token?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_ip?: string | null
          token_hash?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_scan_items: {
        Row: {
          action_applied: boolean
          action_applied_at: string | null
          action_result: Json | null
          classification: string
          conversation_id: string | null
          created_at: string
          followup_message: string | null
          id: string
          lead_id: string | null
          lead_snapshot: Json
          organization_id: string
          reason: string | null
          scan_id: string
          score: number
          signals: Json
          suggested_action: string | null
        }
        Insert: {
          action_applied?: boolean
          action_applied_at?: string | null
          action_result?: Json | null
          classification: string
          conversation_id?: string | null
          created_at?: string
          followup_message?: string | null
          id?: string
          lead_id?: string | null
          lead_snapshot?: Json
          organization_id: string
          reason?: string | null
          scan_id: string
          score?: number
          signals?: Json
          suggested_action?: string | null
        }
        Update: {
          action_applied?: boolean
          action_applied_at?: string | null
          action_result?: Json | null
          classification?: string
          conversation_id?: string | null
          created_at?: string
          followup_message?: string | null
          id?: string
          lead_id?: string | null
          lead_snapshot?: Json
          organization_id?: string
          reason?: string | null
          scan_id?: string
          score?: number
          signals?: Json
          suggested_action?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_scan_items_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "opportunity_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_scan_schedules: {
        Row: {
          actions_config: Json
          created_at: string
          created_by: string | null
          cron_expression: string
          filters: Json
          id: string
          is_active: boolean
          last_run_at: string | null
          last_scan_id: string | null
          name: string
          notify_user_ids: string[] | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          actions_config?: Json
          created_at?: string
          created_by?: string | null
          cron_expression: string
          filters?: Json
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_scan_id?: string | null
          name: string
          notify_user_ids?: string[] | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          actions_config?: Json
          created_at?: string
          created_by?: string | null
          cron_expression?: string
          filters?: Json
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_scan_id?: string | null
          name?: string
          notify_user_ids?: string[] | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      opportunity_scans: {
        Row: {
          actions_config: Json
          cold_count: number
          cost_cents: number
          created_at: string
          error_message: string | null
          filters: Json
          finished_at: string | null
          hot_count: number
          id: string
          lost_count: number
          organization_id: string
          potential_revenue: number
          schedule_id: string | null
          started_at: string | null
          status: string
          total_analyzed: number
          total_candidates: number
          trigger_type: string
          triggered_by: string | null
          warm_count: number
        }
        Insert: {
          actions_config?: Json
          cold_count?: number
          cost_cents?: number
          created_at?: string
          error_message?: string | null
          filters?: Json
          finished_at?: string | null
          hot_count?: number
          id?: string
          lost_count?: number
          organization_id: string
          potential_revenue?: number
          schedule_id?: string | null
          started_at?: string | null
          status?: string
          total_analyzed?: number
          total_candidates?: number
          trigger_type?: string
          triggered_by?: string | null
          warm_count?: number
        }
        Update: {
          actions_config?: Json
          cold_count?: number
          cost_cents?: number
          created_at?: string
          error_message?: string | null
          filters?: Json
          finished_at?: string | null
          hot_count?: number
          id?: string
          lost_count?: number
          organization_id?: string
          potential_revenue?: number
          schedule_id?: string | null
          started_at?: string | null
          status?: string
          total_analyzed?: number
          total_candidates?: number
          trigger_type?: string
          triggered_by?: string | null
          warm_count?: number
        }
        Relationships: []
      }
      orchestration_logs: {
        Row: {
          action: string
          agent_routed_to: string | null
          channel: string | null
          confianca: number | null
          contexto_extraido: string | null
          conversation_id: string | null
          created_at: string
          id: string
          intencao: string | null
          lead_id: string | null
          message_in: string | null
          organization_id: string
          produto_id: string | null
          produto_nome: string | null
          raw_response: Json | null
        }
        Insert: {
          action: string
          agent_routed_to?: string | null
          channel?: string | null
          confianca?: number | null
          contexto_extraido?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          intencao?: string | null
          lead_id?: string | null
          message_in?: string | null
          organization_id: string
          produto_id?: string | null
          produto_nome?: string | null
          raw_response?: Json | null
        }
        Update: {
          action?: string
          agent_routed_to?: string | null
          channel?: string | null
          confianca?: number | null
          contexto_extraido?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          intencao?: string | null
          lead_id?: string | null
          message_in?: string | null
          organization_id?: string
          produto_id?: string | null
          produto_nome?: string | null
          raw_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "orchestration_logs_agent_routed_to_fkey"
            columns: ["agent_routed_to"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_logs_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      org_ai_credentials: {
        Row: {
          api_key_encrypted: string
          api_key_masked: string | null
          created_at: string
          id: string
          last_error: string | null
          last_verified_at: string | null
          model_default: string | null
          openai_realtime_key_encrypted: string | null
          organization_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key_encrypted: string
          api_key_masked?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          model_default?: string | null
          openai_realtime_key_encrypted?: string | null
          organization_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string
          api_key_masked?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          model_default?: string | null
          openai_realtime_key_encrypted?: string | null
          organization_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_ai_routing: {
        Row: {
          capability: string
          created_at: string
          fallback_chain: Json
          fallback_to_lovable: boolean
          fallback_triggers: Json
          id: string
          model: string | null
          organization_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          capability: string
          created_at?: string
          fallback_chain?: Json
          fallback_to_lovable?: boolean
          fallback_triggers?: Json
          id?: string
          model?: string | null
          organization_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          capability?: string
          created_at?: string
          fallback_chain?: Json
          fallback_to_lovable?: boolean
          fallback_triggers?: Json
          id?: string
          model?: string | null
          organization_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_marketing_credentials: {
        Row: {
          access_token_encrypted: string | null
          account_name: string | null
          ad_account_id: string | null
          auth_mode: string
          business_id: string | null
          capi_enabled: boolean
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          meta_capi_access_token_encrypted: string | null
          meta_capi_last_error_at: string | null
          meta_capi_last_sent_at: string | null
          meta_capi_last_test_at: string | null
          meta_capi_test_event_code: string | null
          meta_pixel_id: string | null
          metadata: Json
          organization_id: string
          provider: string
          refresh_token_encrypted: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          account_name?: string | null
          ad_account_id?: string | null
          auth_mode?: string
          business_id?: string | null
          capi_enabled?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          meta_capi_access_token_encrypted?: string | null
          meta_capi_last_error_at?: string | null
          meta_capi_last_sent_at?: string | null
          meta_capi_last_test_at?: string | null
          meta_capi_test_event_code?: string | null
          meta_pixel_id?: string | null
          metadata?: Json
          organization_id: string
          provider: string
          refresh_token_encrypted?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          account_name?: string | null
          ad_account_id?: string | null
          auth_mode?: string
          business_id?: string | null
          capi_enabled?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          meta_capi_access_token_encrypted?: string | null
          meta_capi_last_error_at?: string | null
          meta_capi_last_sent_at?: string | null
          meta_capi_last_test_at?: string | null
          meta_capi_test_event_code?: string | null
          meta_pixel_id?: string | null
          metadata?: Json
          organization_id?: string
          provider?: string
          refresh_token_encrypted?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_marketing_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_orchestrator_config: {
        Row: {
          created_at: string
          fallback_to_human_after: number
          id: string
          is_enabled: boolean
          max_triage_questions: number
          min_confidence: number
          orchestrator_agent_id: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fallback_to_human_after?: number
          id?: string
          is_enabled?: boolean
          max_triage_questions?: number
          min_confidence?: number
          orchestrator_agent_id?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fallback_to_human_after?: number
          id?: string
          is_enabled?: boolean
          max_triage_questions?: number
          min_confidence?: number
          orchestrator_agent_id?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_orchestrator_config_orchestrator_agent_id_fkey"
            columns: ["orchestrator_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_orchestrator_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_worker_controls: {
        Row: {
          is_paused: boolean
          organization_id: string
          paused_at: string | null
          paused_by: string | null
          reason: string | null
          updated_at: string
          worker_key: string
        }
        Insert: {
          is_paused?: boolean
          organization_id: string
          paused_at?: string | null
          paused_by?: string | null
          reason?: string | null
          updated_at?: string
          worker_key: string
        }
        Update: {
          is_paused?: boolean
          organization_id?: string
          paused_at?: string | null
          paused_by?: string | null
          reason?: string | null
          updated_at?: string
          worker_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_worker_controls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_worker_controls_paused_by_fkey"
            columns: ["paused_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_worker_controls_paused_by_fkey"
            columns: ["paused_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_worker_controls_worker_key_fkey"
            columns: ["worker_key"]
            isOneToOne: false
            referencedRelation: "platform_worker_registry"
            referencedColumns: ["worker_key"]
          },
        ]
      }
      organizations: {
        Row: {
          address: Json | null
          ai_debounce_ms: number
          ai_dedup_enabled: boolean
          ai_dedup_window_ms: number
          ai_grouping_enabled: boolean
          ai_grouping_max_ms: number
          ai_grouping_window_ms: number
          ai_single_processing_per_conversation: boolean
          ai_tokens_bonus: number
          ai_tokens_period_start: string
          ai_tokens_used_current_period: number
          ai_typing_max_ms: number
          ai_typing_min_ms: number
          auto_join_email_domains: string[]
          cakto_customer_email: string | null
          cakto_subscription_id: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          features: Json | null
          id: string
          instagram: string | null
          logo_url: string | null
          max_connections: number | null
          max_products: number | null
          max_users: number | null
          name: string
          onboarding_completed_at: string | null
          onboarding_locked: boolean
          owner_id: string | null
          payment_policy: string | null
          phone: string | null
          plan_activated_at: string | null
          plan_id: string | null
          plan_status: string | null
          presence_enabled: boolean
          presence_jitter_pct: number
          presence_recording_enabled: boolean
          presence_typing_chars_per_sec: number
          refund_policy: string | null
          settings: Json | null
          signature_enabled: boolean
          status: string | null
          tracking_public_key: string | null
          tracking_settings: Json
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: Json | null
          ai_debounce_ms?: number
          ai_dedup_enabled?: boolean
          ai_dedup_window_ms?: number
          ai_grouping_enabled?: boolean
          ai_grouping_max_ms?: number
          ai_grouping_window_ms?: number
          ai_single_processing_per_conversation?: boolean
          ai_tokens_bonus?: number
          ai_tokens_period_start?: string
          ai_tokens_used_current_period?: number
          ai_typing_max_ms?: number
          ai_typing_min_ms?: number
          auto_join_email_domains?: string[]
          cakto_customer_email?: string | null
          cakto_subscription_id?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          features?: Json | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          max_connections?: number | null
          max_products?: number | null
          max_users?: number | null
          name: string
          onboarding_completed_at?: string | null
          onboarding_locked?: boolean
          owner_id?: string | null
          payment_policy?: string | null
          phone?: string | null
          plan_activated_at?: string | null
          plan_id?: string | null
          plan_status?: string | null
          presence_enabled?: boolean
          presence_jitter_pct?: number
          presence_recording_enabled?: boolean
          presence_typing_chars_per_sec?: number
          refund_policy?: string | null
          settings?: Json | null
          signature_enabled?: boolean
          status?: string | null
          tracking_public_key?: string | null
          tracking_settings?: Json
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: Json | null
          ai_debounce_ms?: number
          ai_dedup_enabled?: boolean
          ai_dedup_window_ms?: number
          ai_grouping_enabled?: boolean
          ai_grouping_max_ms?: number
          ai_grouping_window_ms?: number
          ai_single_processing_per_conversation?: boolean
          ai_tokens_bonus?: number
          ai_tokens_period_start?: string
          ai_tokens_used_current_period?: number
          ai_typing_max_ms?: number
          ai_typing_min_ms?: number
          auto_join_email_domains?: string[]
          cakto_customer_email?: string | null
          cakto_subscription_id?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          features?: Json | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          max_connections?: number | null
          max_products?: number | null
          max_users?: number | null
          name?: string
          onboarding_completed_at?: string | null
          onboarding_locked?: boolean
          owner_id?: string | null
          payment_policy?: string | null
          phone?: string | null
          plan_activated_at?: string | null
          plan_id?: string | null
          plan_status?: string | null
          presence_enabled?: boolean
          presence_jitter_pct?: number
          presence_recording_enabled?: boolean
          presence_typing_chars_per_sec?: number
          refund_policy?: string | null
          settings?: Json | null
          signature_enabled?: boolean
          status?: string | null
          tracking_public_key?: string | null
          tracking_settings?: Json
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_links: {
        Row: {
          amount: number
          conversation_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          lead_id: string | null
          metadata: Json
          opened_at: string | null
          organization_id: string
          paid_at: string | null
          status: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          amount: number
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          opened_at?: string | null
          organization_id: string
          paid_at?: string | null
          status?: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          amount?: number
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          opened_at?: string | null
          organization_id?: string
          paid_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_lost: boolean | null
          is_won: boolean | null
          name: string
          order_index: number
          product_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_lost?: boolean | null
          is_won?: boolean | null
          name: string
          order_index?: number
          product_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_lost?: boolean | null
          is_won?: boolean | null
          name?: string
          order_index?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_ai_keys: {
        Row: {
          api_key_encrypted: string
          api_key_masked: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          last_error: string | null
          last_used_at: string | null
          last_verified_at: string | null
          model_default: string | null
          priority: number
          provider: string
          purpose: string
          updated_at: string
          usage_count: number
          weight: number
        }
        Insert: {
          api_key_encrypted: string
          api_key_masked: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          last_error?: string | null
          last_used_at?: string | null
          last_verified_at?: string | null
          model_default?: string | null
          priority?: number
          provider: string
          purpose?: string
          updated_at?: string
          usage_count?: number
          weight?: number
        }
        Update: {
          api_key_encrypted?: string
          api_key_masked?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          last_error?: string | null
          last_used_at?: string | null
          last_verified_at?: string | null
          model_default?: string | null
          priority?: number
          provider?: string
          purpose?: string
          updated_at?: string
          usage_count?: number
          weight?: number
        }
        Relationships: []
      }
      platform_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_email_settings: {
        Row: {
          alert_days_after: number | null
          api_key_encrypted: string | null
          created_at: string | null
          domain_validated_at: string | null
          from_domain: string | null
          id: string
          provider: string | null
          reminder_days_before: number | null
          reminder_on_due_date: boolean | null
          sender_domain: string | null
          sender_email: string | null
          sender_name: string | null
          smtp_host: string | null
          smtp_pass_encrypted: string | null
          smtp_port: number | null
          smtp_user: string | null
          suspend_days_after: number | null
          updated_at: string | null
        }
        Insert: {
          alert_days_after?: number | null
          api_key_encrypted?: string | null
          created_at?: string | null
          domain_validated_at?: string | null
          from_domain?: string | null
          id?: string
          provider?: string | null
          reminder_days_before?: number | null
          reminder_on_due_date?: boolean | null
          sender_domain?: string | null
          sender_email?: string | null
          sender_name?: string | null
          smtp_host?: string | null
          smtp_pass_encrypted?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          suspend_days_after?: number | null
          updated_at?: string | null
        }
        Update: {
          alert_days_after?: number | null
          api_key_encrypted?: string | null
          created_at?: string | null
          domain_validated_at?: string | null
          from_domain?: string | null
          id?: string
          provider?: string | null
          reminder_days_before?: number | null
          reminder_on_due_date?: boolean | null
          sender_domain?: string | null
          sender_email?: string | null
          sender_name?: string | null
          smtp_host?: string | null
          smtp_pass_encrypted?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          suspend_days_after?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_email_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          html_content: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          slug: string
          subject: string
          updated_at: string
          variables: Json
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          html_content: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          slug: string
          subject: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          html_content?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          slug?: string
          subject?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      platform_health_snapshots: {
        Row: {
          captured_at: string
          connections_max: number
          connections_pct: number
          connections_used: number
          created_at: string
          db_size_bytes: number
          deadlocks: number
          details: Json
          id: string
          idle_in_transaction: number
          long_running_queries: number
          rolled_back: number
          status: string
        }
        Insert: {
          captured_at?: string
          connections_max?: number
          connections_pct?: number
          connections_used?: number
          created_at?: string
          db_size_bytes?: number
          deadlocks?: number
          details?: Json
          id?: string
          idle_in_transaction?: number
          long_running_queries?: number
          rolled_back?: number
          status?: string
        }
        Update: {
          captured_at?: string
          connections_max?: number
          connections_pct?: number
          connections_used?: number
          created_at?: string
          db_size_bytes?: number
          deadlocks?: number
          details?: Json
          id?: string
          idle_in_transaction?: number
          long_running_queries?: number
          rolled_back?: number
          status?: string
        }
        Relationships: []
      }
      platform_plans: {
        Row: {
          allow_platform_ai: boolean
          cakto_offer_slug: string | null
          cakto_product_id: string | null
          checkout_url: string | null
          checkout_url_cakto: string | null
          checkout_url_yearly: string | null
          created_at: string
          description: string | null
          display_order: number
          extra_features: Json
          feature_ai_agents: boolean
          feature_audio_transcription_ai: boolean
          feature_campaigns: boolean
          feature_capture_funnels: boolean
          feature_external_api: boolean
          feature_facebook: boolean
          feature_forms: boolean
          feature_instagram: boolean
          feature_integrations: boolean
          feature_internal_chat: boolean
          feature_kanban: boolean
          feature_mia: boolean
          feature_outreach: boolean
          feature_pipeline: boolean
          feature_scheduling: boolean
          feature_text_correction_ai: boolean
          feature_voice_agents: boolean
          feature_webhooks: boolean
          feature_whatsapp: boolean
          grace_period_days: number
          highlight_label: string | null
          id: string
          included_ai_tokens_month: number
          is_active: boolean
          is_default: boolean
          is_public: boolean
          max_ai_tokens_month: number
          max_connections: number
          max_contacts: number
          max_messages_month: number
          max_products: number
          max_sectors: number
          max_users: number
          name: string
          platform_ai_provider: string
          platform_ai_strategy: string
          price_monthly: number
          price_yearly: number
          slug: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          allow_platform_ai?: boolean
          cakto_offer_slug?: string | null
          cakto_product_id?: string | null
          checkout_url?: string | null
          checkout_url_cakto?: string | null
          checkout_url_yearly?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          extra_features?: Json
          feature_ai_agents?: boolean
          feature_audio_transcription_ai?: boolean
          feature_campaigns?: boolean
          feature_capture_funnels?: boolean
          feature_external_api?: boolean
          feature_facebook?: boolean
          feature_forms?: boolean
          feature_instagram?: boolean
          feature_integrations?: boolean
          feature_internal_chat?: boolean
          feature_kanban?: boolean
          feature_mia?: boolean
          feature_outreach?: boolean
          feature_pipeline?: boolean
          feature_scheduling?: boolean
          feature_text_correction_ai?: boolean
          feature_voice_agents?: boolean
          feature_webhooks?: boolean
          feature_whatsapp?: boolean
          grace_period_days?: number
          highlight_label?: string | null
          id?: string
          included_ai_tokens_month?: number
          is_active?: boolean
          is_default?: boolean
          is_public?: boolean
          max_ai_tokens_month?: number
          max_connections?: number
          max_contacts?: number
          max_messages_month?: number
          max_products?: number
          max_sectors?: number
          max_users?: number
          name: string
          platform_ai_provider?: string
          platform_ai_strategy?: string
          price_monthly?: number
          price_yearly?: number
          slug: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          allow_platform_ai?: boolean
          cakto_offer_slug?: string | null
          cakto_product_id?: string | null
          checkout_url?: string | null
          checkout_url_cakto?: string | null
          checkout_url_yearly?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          extra_features?: Json
          feature_ai_agents?: boolean
          feature_audio_transcription_ai?: boolean
          feature_campaigns?: boolean
          feature_capture_funnels?: boolean
          feature_external_api?: boolean
          feature_facebook?: boolean
          feature_forms?: boolean
          feature_instagram?: boolean
          feature_integrations?: boolean
          feature_internal_chat?: boolean
          feature_kanban?: boolean
          feature_mia?: boolean
          feature_outreach?: boolean
          feature_pipeline?: boolean
          feature_scheduling?: boolean
          feature_text_correction_ai?: boolean
          feature_voice_agents?: boolean
          feature_webhooks?: boolean
          feature_whatsapp?: boolean
          grace_period_days?: number
          highlight_label?: string | null
          id?: string
          included_ai_tokens_month?: number
          is_active?: boolean
          is_default?: boolean
          is_public?: boolean
          max_ai_tokens_month?: number
          max_connections?: number
          max_contacts?: number
          max_messages_month?: number
          max_products?: number
          max_sectors?: number
          max_users?: number
          name?: string
          platform_ai_provider?: string
          platform_ai_strategy?: string
          price_monthly?: number
          price_yearly?: number
          slug?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_release_reads: {
        Row: {
          read_at: string
          release_id: string
          user_id: string
        }
        Insert: {
          read_at?: string
          release_id: string
          user_id: string
        }
        Update: {
          read_at?: string
          release_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_release_reads_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "platform_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_releases: {
        Row: {
          content_html: string | null
          content_json: Json | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          published_at: string | null
          release_types: string[]
          summary: string | null
          title: string
          updated_at: string
          version: string | null
        }
        Insert: {
          content_html?: string | null
          content_json?: Json | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          release_types?: string[]
          summary?: string | null
          title: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          content_html?: string | null
          content_json?: Json | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          release_types?: string[]
          summary?: string | null
          title?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          accent_color: string | null
          ai_mode: string
          ai_validated_at: string | null
          ai_validated_provider: string | null
          base_font_size: number | null
          border_radius: number | null
          browser_title: string | null
          created_at: string | null
          default_language: string | null
          default_password_changed: boolean
          default_theme: string | null
          evolution_go_global_api_key: string | null
          evolution_go_url: string | null
          favicon_url: string | null
          font_family: string | null
          font_url: string | null
          footer_text: string | null
          google_oauth_configured: boolean
          gradient_custom: Json | null
          gradient_style: string | null
          hide_widget_branding: boolean | null
          id: string
          login_bg_image_url: string | null
          login_bg_layout: string
          login_headline: string | null
          login_logo_position: string | null
          login_stats_enabled: boolean | null
          login_subheadline: string | null
          logo_dark_url: string | null
          logo_url: string | null
          meta_description: string | null
          meta_oauth_app_id: string | null
          meta_oauth_app_secret_encrypted: string | null
          meta_oauth_enabled: boolean
          meta_oauth_graph_version: string | null
          meta_oauth_scopes_override: string | null
          meta_wa_master_key: string | null
          og_image_url: string | null
          platform_name: string | null
          powered_by_text: string | null
          primary_color: string | null
          privacy_url: string | null
          public_app_url: string | null
          remix_setup_completed: boolean
          super_admin_bootstrapped: boolean
          super_admin_bootstrapped_at: string | null
          support_email: string | null
          terms_url: string | null
          twitter_handle: string | null
          updated_at: string | null
          vapid_generated_at: string | null
          vapid_private_key_encrypted: string | null
          vapid_public_key: string | null
          vapid_subject: string | null
          widget_accent_color: string | null
        }
        Insert: {
          accent_color?: string | null
          ai_mode?: string
          ai_validated_at?: string | null
          ai_validated_provider?: string | null
          base_font_size?: number | null
          border_radius?: number | null
          browser_title?: string | null
          created_at?: string | null
          default_language?: string | null
          default_password_changed?: boolean
          default_theme?: string | null
          evolution_go_global_api_key?: string | null
          evolution_go_url?: string | null
          favicon_url?: string | null
          font_family?: string | null
          font_url?: string | null
          footer_text?: string | null
          google_oauth_configured?: boolean
          gradient_custom?: Json | null
          gradient_style?: string | null
          hide_widget_branding?: boolean | null
          id?: string
          login_bg_image_url?: string | null
          login_bg_layout?: string
          login_headline?: string | null
          login_logo_position?: string | null
          login_stats_enabled?: boolean | null
          login_subheadline?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          meta_description?: string | null
          meta_oauth_app_id?: string | null
          meta_oauth_app_secret_encrypted?: string | null
          meta_oauth_enabled?: boolean
          meta_oauth_graph_version?: string | null
          meta_oauth_scopes_override?: string | null
          meta_wa_master_key?: string | null
          og_image_url?: string | null
          platform_name?: string | null
          powered_by_text?: string | null
          primary_color?: string | null
          privacy_url?: string | null
          public_app_url?: string | null
          remix_setup_completed?: boolean
          super_admin_bootstrapped?: boolean
          super_admin_bootstrapped_at?: string | null
          support_email?: string | null
          terms_url?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          vapid_generated_at?: string | null
          vapid_private_key_encrypted?: string | null
          vapid_public_key?: string | null
          vapid_subject?: string | null
          widget_accent_color?: string | null
        }
        Update: {
          accent_color?: string | null
          ai_mode?: string
          ai_validated_at?: string | null
          ai_validated_provider?: string | null
          base_font_size?: number | null
          border_radius?: number | null
          browser_title?: string | null
          created_at?: string | null
          default_language?: string | null
          default_password_changed?: boolean
          default_theme?: string | null
          evolution_go_global_api_key?: string | null
          evolution_go_url?: string | null
          favicon_url?: string | null
          font_family?: string | null
          font_url?: string | null
          footer_text?: string | null
          google_oauth_configured?: boolean
          gradient_custom?: Json | null
          gradient_style?: string | null
          hide_widget_branding?: boolean | null
          id?: string
          login_bg_image_url?: string | null
          login_bg_layout?: string
          login_headline?: string | null
          login_logo_position?: string | null
          login_stats_enabled?: boolean | null
          login_subheadline?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          meta_description?: string | null
          meta_oauth_app_id?: string | null
          meta_oauth_app_secret_encrypted?: string | null
          meta_oauth_enabled?: boolean
          meta_oauth_graph_version?: string | null
          meta_oauth_scopes_override?: string | null
          meta_wa_master_key?: string | null
          og_image_url?: string | null
          platform_name?: string | null
          powered_by_text?: string | null
          primary_color?: string | null
          privacy_url?: string | null
          public_app_url?: string | null
          remix_setup_completed?: boolean
          super_admin_bootstrapped?: boolean
          super_admin_bootstrapped_at?: string | null
          support_email?: string | null
          terms_url?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          vapid_generated_at?: string | null
          vapid_private_key_encrypted?: string | null
          vapid_public_key?: string | null
          vapid_subject?: string | null
          widget_accent_color?: string | null
        }
        Relationships: []
      }
      platform_worker_dispatches: {
        Row: {
          connection_count: number
          dispatched_at: string
          error_message: string | null
          id: string
          pending_count: number
          request_id: number | null
          status: string
          worker_key: string | null
        }
        Insert: {
          connection_count?: number
          dispatched_at?: string
          error_message?: string | null
          id?: string
          pending_count?: number
          request_id?: number | null
          status?: string
          worker_key?: string | null
        }
        Update: {
          connection_count?: number
          dispatched_at?: string
          error_message?: string | null
          id?: string
          pending_count?: number
          request_id?: number | null
          status?: string
          worker_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_worker_dispatches_worker_key_fkey"
            columns: ["worker_key"]
            isOneToOne: false
            referencedRelation: "platform_worker_registry"
            referencedColumns: ["worker_key"]
          },
        ]
      }
      platform_worker_registry: {
        Row: {
          auth_mode: string
          enabled: boolean
          endpoint_path: string
          label: string
          last_dispatched_at: string | null
          last_request_id: number | null
          priority: number
          updated_at: string
          worker_key: string
        }
        Insert: {
          auth_mode?: string
          enabled?: boolean
          endpoint_path: string
          label: string
          last_dispatched_at?: string | null
          last_request_id?: number | null
          priority?: number
          updated_at?: string
          worker_key: string
        }
        Update: {
          auth_mode?: string
          enabled?: boolean
          endpoint_path?: string
          label?: string
          last_dispatched_at?: string | null
          last_request_id?: number | null
          priority?: number
          updated_at?: string
          worker_key?: string
        }
        Relationships: []
      }
      platform_worker_runtime_config: {
        Row: {
          anon_key: string
          project_url: string
          singleton: boolean
          updated_at: string
          worker_secret: string
        }
        Insert: {
          anon_key: string
          project_url: string
          singleton?: boolean
          updated_at?: string
          worker_secret?: string
        }
        Update: {
          anon_key?: string
          project_url?: string
          singleton?: boolean
          updated_at?: string
          worker_secret?: string
        }
        Relationships: []
      }
      post_sale_event_actions: {
        Row: {
          add_tag_ids: string[]
          agent_extra_context: string | null
          agent_id: string | null
          agent_objective: string | null
          agent_outreach_mode: string
          assign_sector_id: string | null
          assign_user_id: string | null
          created_at: string
          created_by: string | null
          deal_outcome: string
          deal_value_manual: number | null
          deal_value_source: string
          delay_minutes: number
          email_template_id: string | null
          event_type: string
          evolution_instance_id: string | null
          flow_id: string | null
          id: string
          inline_message: string | null
          is_active: boolean
          message_channel: string
          notify_user_id: string | null
          organization_id: string
          product_id: string
          remove_tag_ids: string[]
          send_mode: string
          target_stage_id: string | null
          updated_at: string
        }
        Insert: {
          add_tag_ids?: string[]
          agent_extra_context?: string | null
          agent_id?: string | null
          agent_objective?: string | null
          agent_outreach_mode?: string
          assign_sector_id?: string | null
          assign_user_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_outcome?: string
          deal_value_manual?: number | null
          deal_value_source?: string
          delay_minutes?: number
          email_template_id?: string | null
          event_type: string
          evolution_instance_id?: string | null
          flow_id?: string | null
          id?: string
          inline_message?: string | null
          is_active?: boolean
          message_channel?: string
          notify_user_id?: string | null
          organization_id: string
          product_id: string
          remove_tag_ids?: string[]
          send_mode?: string
          target_stage_id?: string | null
          updated_at?: string
        }
        Update: {
          add_tag_ids?: string[]
          agent_extra_context?: string | null
          agent_id?: string | null
          agent_objective?: string | null
          agent_outreach_mode?: string
          assign_sector_id?: string | null
          assign_user_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_outcome?: string
          deal_value_manual?: number | null
          deal_value_source?: string
          delay_minutes?: number
          email_template_id?: string | null
          event_type?: string
          evolution_instance_id?: string | null
          flow_id?: string | null
          id?: string
          inline_message?: string | null
          is_active?: boolean
          message_channel?: string
          notify_user_id?: string | null
          organization_id?: string
          product_id?: string
          remove_tag_ids?: string[]
          send_mode?: string
          target_stage_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_sale_event_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_assign_sector_id_fkey"
            columns: ["assign_sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_assign_user_id_fkey"
            columns: ["assign_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_assign_user_id_fkey"
            columns: ["assign_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "chat_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_notify_user_id_fkey"
            columns: ["notify_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_notify_user_id_fkey"
            columns: ["notify_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      post_sale_event_logs: {
        Row: {
          action_id: string | null
          created_at: string
          event_data: Json
          event_type: string
          executed_actions: Json
          id: string
          lead_id: string | null
          organization_id: string
          product_id: string | null
          source: string
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          event_data?: Json
          event_type: string
          executed_actions?: Json
          id?: string
          lead_id?: string | null
          organization_id: string
          product_id?: string | null
          source: string
        }
        Update: {
          action_id?: string | null
          created_at?: string
          event_data?: Json
          event_type?: string
          executed_actions?: Json
          id?: string
          lead_id?: string | null
          organization_id?: string
          product_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_sale_event_logs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "post_sale_event_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      post_sale_scheduled_runs: {
        Row: {
          action_id: string
          attempts: number
          created_at: string
          event_data: Json
          event_type: string
          executed_at: string | null
          id: string
          last_error: string | null
          lead_id: string
          organization_id: string
          product_id: string | null
          run_at: string
          source: string
          status: string
        }
        Insert: {
          action_id: string
          attempts?: number
          created_at?: string
          event_data?: Json
          event_type: string
          executed_at?: string | null
          id?: string
          last_error?: string | null
          lead_id: string
          organization_id: string
          product_id?: string | null
          run_at: string
          source?: string
          status?: string
        }
        Update: {
          action_id?: string
          attempts?: number
          created_at?: string
          event_data?: Json
          event_type?: string
          executed_at?: string | null
          id?: string
          last_error?: string | null
          lead_id?: string
          organization_id?: string
          product_id?: string | null
          run_at?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_sale_scheduled_runs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "post_sale_event_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_scheduled_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_messages: {
        Row: {
          created_at: string
          id: string
          instance_id: string | null
          message_id: string
          remote_jid: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id?: string | null
          message_id: string
          remote_jid?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string | null
          message_id?: string
          remote_jid?: string | null
        }
        Relationships: []
      }
      product_agent_connections: {
        Row: {
          agent_id: string
          connection_id: string
          connection_type: string
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          agent_id: string
          connection_id: string
          connection_type: string
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          agent_id?: string
          connection_id?: string
          connection_type?: string
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_agent_connections_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_agent_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_agents: {
        Row: {
          activation_keywords: string[]
          activation_phrases: string[]
          activation_priority: number
          activation_scope: string
          active_in_chat: boolean | null
          active_in_copilot: boolean | null
          active_in_facebook: boolean | null
          active_in_funnels: boolean | null
          active_in_inbox: boolean | null
          active_in_instagram: boolean | null
          active_in_whatsapp: boolean | null
          active_in_widget: boolean | null
          additional_prompt: string | null
          agent_type: string
          allowed_event_type_ids: string[] | null
          always_end_with_question: boolean | null
          auto_tag_leads: boolean | null
          avatar_url: string | null
          booking_notification_user_ids: string[] | null
          booking_notify_org_admins: boolean | null
          can_add_notes: boolean
          can_apply_tags: boolean
          can_create_tasks: boolean | null
          can_do: string[] | null
          can_notify: boolean
          can_qualify: boolean
          can_schedule_meetings: boolean | null
          can_send_emails: boolean
          can_send_materials: boolean
          can_start_cadence: boolean
          can_transfer: boolean
          can_trigger_flows: boolean
          can_update_lead: boolean
          can_update_pipeline: boolean | null
          cannot_do: string[] | null
          created_at: string | null
          created_by: string | null
          default_grok_voice_id: string | null
          default_schedule_user_id: string | null
          default_tags: string[] | null
          description: string | null
          enable_audio_transcription: boolean
          enable_image_vision: boolean
          end_conversation_triggers: string[] | null
          evolution_instance_id: string | null
          followup_attempt_hints: Json
          followup_channels: string[]
          followup_enabled: boolean
          followup_extra_instructions: string | null
          followup_intervals_minutes: number[]
          followup_max_attempts: number
          followup_respect_business_hours: boolean
          followup_stop_on_booking: boolean
          followup_stop_on_human: boolean
          followup_tone: string
          handoff_delay_seconds: number
          handoff_include_summary: boolean
          handoff_incoming_message: string | null
          handoff_outgoing_message: string | null
          handoff_triggers: string[] | null
          humanization: Json
          id: string
          is_active: boolean | null
          is_default: boolean | null
          message_delay_seconds: number
          message_style: string | null
          name: string
          never_ask_email: boolean
          openai_voice_id: string | null
          organization_id: string
          primary_objective: string
          product_id: string | null
          prohibited_phrases: string[] | null
          qualification_schema: Json | null
          quick_menu_intro: string | null
          quick_menu_invalid_message: string | null
          quick_menu_mode: string
          quick_menu_options: Json
          required_phrases: string[] | null
          takeover_on_match: boolean
          tone_style: string | null
          tool_configs: Json
          updated_at: string | null
          voice_always_end_with_question: boolean
          voice_behavior_prompt: string | null
          voice_enabled: boolean
          voice_max_call_minutes: number
          voice_max_seconds: number
          voice_max_sentences: number
          voice_mode_enabled: boolean
          voice_provider: string
          voice_settings: Json
          voice_show_tools_early: boolean
          voice_specific_rules: string | null
          welcome_enabled: boolean
          welcome_message: string | null
        }
        Insert: {
          activation_keywords?: string[]
          activation_phrases?: string[]
          activation_priority?: number
          activation_scope?: string
          active_in_chat?: boolean | null
          active_in_copilot?: boolean | null
          active_in_facebook?: boolean | null
          active_in_funnels?: boolean | null
          active_in_inbox?: boolean | null
          active_in_instagram?: boolean | null
          active_in_whatsapp?: boolean | null
          active_in_widget?: boolean | null
          additional_prompt?: string | null
          agent_type?: string
          allowed_event_type_ids?: string[] | null
          always_end_with_question?: boolean | null
          auto_tag_leads?: boolean | null
          avatar_url?: string | null
          booking_notification_user_ids?: string[] | null
          booking_notify_org_admins?: boolean | null
          can_add_notes?: boolean
          can_apply_tags?: boolean
          can_create_tasks?: boolean | null
          can_do?: string[] | null
          can_notify?: boolean
          can_qualify?: boolean
          can_schedule_meetings?: boolean | null
          can_send_emails?: boolean
          can_send_materials?: boolean
          can_start_cadence?: boolean
          can_transfer?: boolean
          can_trigger_flows?: boolean
          can_update_lead?: boolean
          can_update_pipeline?: boolean | null
          cannot_do?: string[] | null
          created_at?: string | null
          created_by?: string | null
          default_grok_voice_id?: string | null
          default_schedule_user_id?: string | null
          default_tags?: string[] | null
          description?: string | null
          enable_audio_transcription?: boolean
          enable_image_vision?: boolean
          end_conversation_triggers?: string[] | null
          evolution_instance_id?: string | null
          followup_attempt_hints?: Json
          followup_channels?: string[]
          followup_enabled?: boolean
          followup_extra_instructions?: string | null
          followup_intervals_minutes?: number[]
          followup_max_attempts?: number
          followup_respect_business_hours?: boolean
          followup_stop_on_booking?: boolean
          followup_stop_on_human?: boolean
          followup_tone?: string
          handoff_delay_seconds?: number
          handoff_include_summary?: boolean
          handoff_incoming_message?: string | null
          handoff_outgoing_message?: string | null
          handoff_triggers?: string[] | null
          humanization?: Json
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          message_delay_seconds?: number
          message_style?: string | null
          name: string
          never_ask_email?: boolean
          openai_voice_id?: string | null
          organization_id: string
          primary_objective: string
          product_id?: string | null
          prohibited_phrases?: string[] | null
          qualification_schema?: Json | null
          quick_menu_intro?: string | null
          quick_menu_invalid_message?: string | null
          quick_menu_mode?: string
          quick_menu_options?: Json
          required_phrases?: string[] | null
          takeover_on_match?: boolean
          tone_style?: string | null
          tool_configs?: Json
          updated_at?: string | null
          voice_always_end_with_question?: boolean
          voice_behavior_prompt?: string | null
          voice_enabled?: boolean
          voice_max_call_minutes?: number
          voice_max_seconds?: number
          voice_max_sentences?: number
          voice_mode_enabled?: boolean
          voice_provider?: string
          voice_settings?: Json
          voice_show_tools_early?: boolean
          voice_specific_rules?: string | null
          welcome_enabled?: boolean
          welcome_message?: string | null
        }
        Update: {
          activation_keywords?: string[]
          activation_phrases?: string[]
          activation_priority?: number
          activation_scope?: string
          active_in_chat?: boolean | null
          active_in_copilot?: boolean | null
          active_in_facebook?: boolean | null
          active_in_funnels?: boolean | null
          active_in_inbox?: boolean | null
          active_in_instagram?: boolean | null
          active_in_whatsapp?: boolean | null
          active_in_widget?: boolean | null
          additional_prompt?: string | null
          agent_type?: string
          allowed_event_type_ids?: string[] | null
          always_end_with_question?: boolean | null
          auto_tag_leads?: boolean | null
          avatar_url?: string | null
          booking_notification_user_ids?: string[] | null
          booking_notify_org_admins?: boolean | null
          can_add_notes?: boolean
          can_apply_tags?: boolean
          can_create_tasks?: boolean | null
          can_do?: string[] | null
          can_notify?: boolean
          can_qualify?: boolean
          can_schedule_meetings?: boolean | null
          can_send_emails?: boolean
          can_send_materials?: boolean
          can_start_cadence?: boolean
          can_transfer?: boolean
          can_trigger_flows?: boolean
          can_update_lead?: boolean
          can_update_pipeline?: boolean | null
          cannot_do?: string[] | null
          created_at?: string | null
          created_by?: string | null
          default_grok_voice_id?: string | null
          default_schedule_user_id?: string | null
          default_tags?: string[] | null
          description?: string | null
          enable_audio_transcription?: boolean
          enable_image_vision?: boolean
          end_conversation_triggers?: string[] | null
          evolution_instance_id?: string | null
          followup_attempt_hints?: Json
          followup_channels?: string[]
          followup_enabled?: boolean
          followup_extra_instructions?: string | null
          followup_intervals_minutes?: number[]
          followup_max_attempts?: number
          followup_respect_business_hours?: boolean
          followup_stop_on_booking?: boolean
          followup_stop_on_human?: boolean
          followup_tone?: string
          handoff_delay_seconds?: number
          handoff_include_summary?: boolean
          handoff_incoming_message?: string | null
          handoff_outgoing_message?: string | null
          handoff_triggers?: string[] | null
          humanization?: Json
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          message_delay_seconds?: number
          message_style?: string | null
          name?: string
          never_ask_email?: boolean
          openai_voice_id?: string | null
          organization_id?: string
          primary_objective?: string
          product_id?: string | null
          prohibited_phrases?: string[] | null
          qualification_schema?: Json | null
          quick_menu_intro?: string | null
          quick_menu_invalid_message?: string | null
          quick_menu_mode?: string
          quick_menu_options?: Json
          required_phrases?: string[] | null
          takeover_on_match?: boolean
          tone_style?: string | null
          tool_configs?: Json
          updated_at?: string | null
          voice_always_end_with_question?: boolean
          voice_behavior_prompt?: string | null
          voice_enabled?: boolean
          voice_max_call_minutes?: number
          voice_max_seconds?: number
          voice_max_sentences?: number
          voice_mode_enabled?: boolean
          voice_provider?: string
          voice_settings?: Json
          voice_show_tools_early?: boolean
          voice_specific_rules?: string | null
          welcome_enabled?: boolean
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_agents_evolution_instance_id_fkey"
            columns: ["evolution_instance_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_agents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_catalog_items: {
        Row: {
          attributes: Json | null
          created_at: string
          currency: string | null
          description: string | null
          documents: Json
          external_id: string | null
          id: string
          images: string[] | null
          is_active: boolean
          last_synced_at: string | null
          organization_id: string
          price: number | null
          product_id: string | null
          search_vector: unknown
          source_type: string
          source_url: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          url: string | null
          videos: string[]
        }
        Insert: {
          attributes?: Json | null
          created_at?: string
          currency?: string | null
          description?: string | null
          documents?: Json
          external_id?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          last_synced_at?: string | null
          organization_id: string
          price?: number | null
          product_id?: string | null
          search_vector?: unknown
          source_type?: string
          source_url?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          url?: string | null
          videos?: string[]
        }
        Update: {
          attributes?: Json | null
          created_at?: string
          currency?: string | null
          description?: string | null
          documents?: Json
          external_id?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          last_synced_at?: string | null
          organization_id?: string
          price?: number | null
          product_id?: string | null
          search_vector?: unknown
          source_type?: string
          source_url?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          videos?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "product_catalog_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_catalog_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ctas: {
        Row: {
          action_url: string | null
          created_at: string | null
          cta_type: string
          display_order: number | null
          icon: string | null
          id: string
          intent_level: string | null
          is_active: boolean | null
          label: string
          organization_id: string
          product_id: string | null
          trigger_keywords: string[] | null
          updated_at: string | null
          video_url: string | null
          whatsapp_message: string | null
          whatsapp_number: string | null
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          cta_type: string
          display_order?: number | null
          icon?: string | null
          id?: string
          intent_level?: string | null
          is_active?: boolean | null
          label: string
          organization_id: string
          product_id?: string | null
          trigger_keywords?: string[] | null
          updated_at?: string | null
          video_url?: string | null
          whatsapp_message?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          cta_type?: string
          display_order?: number | null
          icon?: string | null
          id?: string
          intent_level?: string | null
          is_active?: boolean | null
          label?: string
          organization_id?: string
          product_id?: string | null
          trigger_keywords?: string[] | null
          updated_at?: string | null
          video_url?: string | null
          whatsapp_message?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_ctas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ctas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_knowledge_sources: {
        Row: {
          answer: string | null
          created_at: string | null
          created_by: string | null
          data_category: string | null
          data_json: Json | null
          description: string | null
          extracted_content: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          is_synced: boolean | null
          last_crawled_at: string | null
          organization_id: string
          processed_at: string | null
          processing_error: string | null
          processing_status: string | null
          product_id: string
          question: string | null
          raw_content: string | null
          source_type: string
          source_url: string | null
          title: string
          transcript: string | null
          updated_at: string | null
          video_duration: number | null
          video_id: string | null
        }
        Insert: {
          answer?: string | null
          created_at?: string | null
          created_by?: string | null
          data_category?: string | null
          data_json?: Json | null
          description?: string | null
          extracted_content?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          is_synced?: boolean | null
          last_crawled_at?: string | null
          organization_id: string
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string | null
          product_id: string
          question?: string | null
          raw_content?: string | null
          source_type: string
          source_url?: string | null
          title: string
          transcript?: string | null
          updated_at?: string | null
          video_duration?: number | null
          video_id?: string | null
        }
        Update: {
          answer?: string | null
          created_at?: string | null
          created_by?: string | null
          data_category?: string | null
          data_json?: Json | null
          description?: string | null
          extracted_content?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          is_synced?: boolean | null
          last_crawled_at?: string | null
          organization_id?: string
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string | null
          product_id?: string
          question?: string | null
          raw_content?: string | null
          source_type?: string
          source_url?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string | null
          video_duration?: number | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_knowledge_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_knowledge_sources_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_offers: {
        Row: {
          cakto_product_id: string | null
          created_at: string
          currency: string | null
          external_source: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          organization_id: string
          position: number | null
          price: number | null
          product_id: string | null
          role: string
          updated_at: string
        }
        Insert: {
          cakto_product_id?: string | null
          created_at?: string
          currency?: string | null
          external_source?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          organization_id: string
          position?: number | null
          price?: number | null
          product_id?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          cakto_product_id?: string | null
          created_at?: string
          currency?: string | null
          external_source?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          organization_id?: string
          position?: number | null
          price?: number | null
          product_id?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_onboarding_state: {
        Row: {
          ai_optimizations: Json | null
          completed_at: string | null
          created_at: string | null
          current_step: number | null
          draft_data: Json | null
          id: string
          organization_id: string
          product_id: string | null
          total_steps: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_optimizations?: Json | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          draft_data?: Json | null
          id?: string
          organization_id: string
          product_id?: string | null
          total_steps?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_optimizations?: Json | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          draft_data?: Json | null
          id?: string
          organization_id?: string
          product_id?: string | null
          total_steps?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_onboarding_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_onboarding_state_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_suites: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon_url: string | null
          id: string
          name: string
          organization_id: string
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          name: string
          organization_id: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          name?: string
          organization_id?: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_training_videos: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          is_active: boolean | null
          order_index: number | null
          organization_id: string
          product_id: string
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          video_url: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          organization_id: string
          product_id: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          video_url: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          organization_id?: string
          product_id?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_training_videos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_training_videos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          banner_url: string | null
          benefits: string | null
          bonuses: string | null
          category: string | null
          created_at: string
          created_by: string | null
          custom_info: string | null
          description: string | null
          differentials: string[] | null
          discount_policy: string | null
          external_links: Json | null
          guarantee: string | null
          icp: string | null
          id: string
          knowledge_base: string | null
          logo_url: string | null
          name: string
          objections: string | null
          organization_id: string
          payment_conditions: string | null
          pitch_15s: string | null
          pitch_2min: string | null
          pitch_30s: string | null
          plans: string | null
          pricing: Json | null
          product_image_url: string | null
          settings: Json | null
          short_description: string | null
          status: Database["public"]["Enums"]["product_status"] | null
          suite_id: string | null
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          benefits?: string | null
          bonuses?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          custom_info?: string | null
          description?: string | null
          differentials?: string[] | null
          discount_policy?: string | null
          external_links?: Json | null
          guarantee?: string | null
          icp?: string | null
          id?: string
          knowledge_base?: string | null
          logo_url?: string | null
          name: string
          objections?: string | null
          organization_id: string
          payment_conditions?: string | null
          pitch_15s?: string | null
          pitch_2min?: string | null
          pitch_30s?: string | null
          plans?: string | null
          pricing?: Json | null
          product_image_url?: string | null
          settings?: Json | null
          short_description?: string | null
          status?: Database["public"]["Enums"]["product_status"] | null
          suite_id?: string | null
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          benefits?: string | null
          bonuses?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          custom_info?: string | null
          description?: string | null
          differentials?: string[] | null
          discount_policy?: string | null
          external_links?: Json | null
          guarantee?: string | null
          icp?: string | null
          id?: string
          knowledge_base?: string | null
          logo_url?: string | null
          name?: string
          objections?: string | null
          organization_id?: string
          payment_conditions?: string | null
          pitch_15s?: string | null
          pitch_2min?: string | null
          pitch_30s?: string | null
          plans?: string | null
          pricing?: Json | null
          product_image_url?: string | null
          settings?: Json | null
          short_description?: string | null
          status?: Database["public"]["Enums"]["product_status"] | null
          suite_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_suite_id_fkey"
            columns: ["suite_id"]
            isOneToOne: false
            referencedRelation: "product_suites"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          booking_bio: string | null
          booking_slug: string | null
          created_at: string
          default_connection_id: string | null
          default_menu_state: string | null
          default_theme: string | null
          email: string
          farewell_message: string | null
          full_name: string
          guided_onboarding_completed_at: string | null
          guided_onboarding_skipped_at: string | null
          id: string
          is_active: boolean | null
          must_change_password: boolean
          organization_id: string | null
          password_set_at: string | null
          phone: string | null
          recovery_whatsapp: string | null
          signature_display_name: string | null
          updated_at: string
          work_end_time: string | null
          work_start_time: string | null
        }
        Insert: {
          avatar_url?: string | null
          booking_bio?: string | null
          booking_slug?: string | null
          created_at?: string
          default_connection_id?: string | null
          default_menu_state?: string | null
          default_theme?: string | null
          email: string
          farewell_message?: string | null
          full_name: string
          guided_onboarding_completed_at?: string | null
          guided_onboarding_skipped_at?: string | null
          id: string
          is_active?: boolean | null
          must_change_password?: boolean
          organization_id?: string | null
          password_set_at?: string | null
          phone?: string | null
          recovery_whatsapp?: string | null
          signature_display_name?: string | null
          updated_at?: string
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Update: {
          avatar_url?: string | null
          booking_bio?: string | null
          booking_slug?: string | null
          created_at?: string
          default_connection_id?: string | null
          default_menu_state?: string | null
          default_theme?: string | null
          email?: string
          farewell_message?: string | null
          full_name?: string
          guided_onboarding_completed_at?: string | null
          guided_onboarding_skipped_at?: string | null
          id?: string
          is_active?: boolean | null
          must_change_password?: boolean
          organization_id?: string | null
          password_set_at?: string | null
          phone?: string | null
          recovery_whatsapp?: string | null
          signature_display_name?: string | null
          updated_at?: string
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          is_standalone: boolean | null
          last_seen_at: string
          organization_id: string | null
          p256dh: string
          platform: string | null
          revoked_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          is_standalone?: boolean | null
          last_seen_at?: string
          organization_id?: string | null
          p256dh: string
          platform?: string | null
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          is_standalone?: boolean | null
          last_seen_at?: string
          organization_id?: string | null
          p256dh?: string
          platform?: string | null
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          category: string
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          shortcut: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          shortcut?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          shortcut?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_replies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_replies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_templates: {
        Row: {
          appearance_json: Json | null
          badges: string[]
          category: string
          cover_gradient: string | null
          created_at: string
          created_by: string | null
          description: string | null
          estimated_time: string | null
          flow_json: Json
          icon: string | null
          id: string
          is_official: boolean
          is_public: boolean
          name: string
          objective: string | null
          organization_id: string | null
          question_count: number
          results_json: Json | null
          scoring_json: Json | null
          settings_json: Json | null
          slug: string
          thumbnail: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          appearance_json?: Json | null
          badges?: string[]
          category: string
          cover_gradient?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_time?: string | null
          flow_json?: Json
          icon?: string | null
          id?: string
          is_official?: boolean
          is_public?: boolean
          name: string
          objective?: string | null
          organization_id?: string | null
          question_count?: number
          results_json?: Json | null
          scoring_json?: Json | null
          settings_json?: Json | null
          slug: string
          thumbnail?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          appearance_json?: Json | null
          badges?: string[]
          category?: string
          cover_gradient?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_time?: string | null
          flow_json?: Json
          icon?: string | null
          id?: string
          is_official?: boolean
          is_public?: boolean
          name?: string
          objective?: string | null
          organization_id?: string | null
          question_count?: number
          results_json?: Json | null
          scoring_json?: Json | null
          settings_json?: Json | null
          slug?: string
          thumbnail?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_goals: {
        Row: {
          achieved_deals: number | null
          achieved_value: number | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          organization_id: string | null
          period_end: string
          period_start: string
          product_id: string | null
          target_deals: number
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          achieved_deals?: number | null
          achieved_value?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          period_end: string
          period_start: string
          product_id?: string | null
          target_deals?: number
          target_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          achieved_deals?: number | null
          achieved_value?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          period_end?: string
          period_start?: string
          product_id?: string | null
          target_deals?: number
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_goals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_goals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_leads: {
        Row: {
          company_name: string
          company_size: string | null
          contact_name: string
          created_at: string | null
          current_tools: string | null
          email: string
          id: string
          main_challenge: string | null
          message: string | null
          notes: string | null
          phone: string | null
          segment: string | null
          status: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          company_name: string
          company_size?: string | null
          contact_name: string
          created_at?: string | null
          current_tools?: string | null
          email: string
          id?: string
          main_challenge?: string | null
          message?: string | null
          notes?: string | null
          phone?: string | null
          segment?: string | null
          status?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          company_name?: string
          company_size?: string | null
          contact_name?: string
          created_at?: string | null
          current_tools?: string | null
          email?: string
          id?: string
          main_challenge?: string | null
          message?: string | null
          notes?: string | null
          phone?: string | null
          segment?: string | null
          status?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      sales_squads: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          leader_id: string | null
          name: string
          organization_id: string
          product_id: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          leader_id?: string | null
          name: string
          organization_id: string
          product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          leader_id?: string | null
          name?: string
          organization_id?: string
          product_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_squads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_squads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sankhya_mappings: {
        Row: {
          created_at: string | null
          entity_type: string
          id: string
          last_sync_at: string | null
          local_id: string
          metadata: Json | null
          organization_id: string
          sankhya_id: string
          sync_direction: string | null
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          id?: string
          last_sync_at?: string | null
          local_id: string
          metadata?: Json | null
          organization_id: string
          sankhya_id: string
          sync_direction?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          id?: string
          last_sync_at?: string | null
          local_id?: string
          metadata?: Json | null
          organization_id?: string
          sankhya_id?: string
          sync_direction?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sankhya_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sankhya_sync_logs: {
        Row: {
          entity_type: string
          error_details: Json | null
          finished_at: string | null
          id: string
          organization_id: string
          records_failed: number | null
          records_processed: number | null
          records_success: number | null
          started_at: string | null
          status: string | null
          sync_type: string
        }
        Insert: {
          entity_type: string
          error_details?: Json | null
          finished_at?: string | null
          id?: string
          organization_id: string
          records_failed?: number | null
          records_processed?: number | null
          records_success?: number | null
          started_at?: string | null
          status?: string | null
          sync_type: string
        }
        Update: {
          entity_type?: string
          error_details?: Json | null
          finished_at?: string | null
          id?: string
          organization_id?: string
          records_failed?: number | null
          records_processed?: number | null
          records_success?: number | null
          started_at?: string | null
          status?: string | null
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sankhya_sync_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          attempt_count: number
          content: string | null
          conversation_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          media_duration_ms: number | null
          media_filename: string | null
          media_kind: string | null
          media_mime: string | null
          media_url: string | null
          organization_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          attempt_count?: number
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          media_duration_ms?: number | null
          media_filename?: string | null
          media_kind?: string | null
          media_mime?: string | null
          media_url?: string | null
          organization_id?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          attempt_count?: number
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          media_duration_ms?: number | null
          media_filename?: string | null
          media_kind?: string | null
          media_mime?: string | null
          media_url?: string | null
          organization_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sector_members: {
        Row: {
          id: string
          joined_at: string
          sector_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          sector_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          sector_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sector_members_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sector_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sector_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          auto_close_ticket: boolean | null
          bot_order: number | null
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          enable_scheduling: boolean | null
          farewell_message: string | null
          greeting_message: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_default: boolean
          name: string
          organization_id: string
          rotation_enabled: boolean | null
          rotation_strategy:
            | Database["public"]["Enums"]["sector_rotation_strategy"]
            | null
          updated_at: string
        }
        Insert: {
          auto_close_ticket?: boolean | null
          bot_order?: number | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enable_scheduling?: boolean | null
          farewell_message?: string | null
          greeting_message?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean
          name: string
          organization_id: string
          rotation_enabled?: boolean | null
          rotation_strategy?:
            | Database["public"]["Enums"]["sector_rotation_strategy"]
            | null
          updated_at?: string
        }
        Update: {
          auto_close_ticket?: boolean | null
          bot_order?: number | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enable_scheduling?: boolean | null
          farewell_message?: string | null
          greeting_message?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean
          name?: string
          organization_id?: string
          rotation_enabled?: boolean | null
          rotation_strategy?:
            | Database["public"]["Enums"]["sector_rotation_strategy"]
            | null
          updated_at?: string
        }
        Relationships: []
      }
      seller_lead_form_config: {
        Row: {
          created_at: string
          fields: Json
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fields?: Json
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fields?: Json
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      seller_notification_settings: {
        Row: {
          channel: string
          created_at: string
          id: string
          notify_cancel: boolean
          notify_confirmed: boolean
          notify_new_booking: boolean
          notify_reschedule: boolean
          organization_id: string
          updated_at: string
          user_id: string
          whatsapp_number: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          notify_cancel?: boolean
          notify_confirmed?: boolean
          notify_new_booking?: boolean
          notify_reschedule?: boolean
          organization_id: string
          updated_at?: string
          user_id: string
          whatsapp_number?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          notify_cancel?: boolean
          notify_confirmed?: boolean
          notify_new_booking?: boolean
          notify_reschedule?: boolean
          organization_id?: string
          updated_at?: string
          user_id?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_notification_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sent_responses: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          response_hash: string
          response_text: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          response_hash: string
          response_text?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          response_hash?: string
          response_text?: string | null
        }
        Relationships: []
      }
      squad_members: {
        Row: {
          id: string
          joined_at: string | null
          role: string | null
          squad_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          role?: string | null
          squad_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          role?: string | null
          squad_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_members_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_values: {
        Row: {
          created_at: string | null
          expected_value: number | null
          id: string
          probability_percent: number | null
          product_id: string
          stage_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          expected_value?: number | null
          id?: string
          probability_percent?: number | null
          product_id: string
          stage_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          expected_value?: number | null
          id?: string
          probability_percent?: number | null
          product_id?: string
          stage_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_values_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: true
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: string | null
          canceled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          organization_id: string | null
          payment_method: Json | null
          plan_id: string | null
          plan_type: string | null
          price_monthly: number | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          billing_cycle?: string | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string | null
          payment_method?: Json | null
          plan_id?: string | null
          plan_type?: string | null
          price_monthly?: number | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_cycle?: string | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string | null
          payment_method?: Json | null
          plan_id?: string | null
          plan_type?: string | null
          price_monthly?: number | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          message_id: string | null
          mime_type: string
          organization_id: string
          size_bytes: number
          storage_path: string
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          message_id?: string | null
          mime_type: string
          organization_id: string
          size_bytes: number
          storage_path: string
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          message_id?: string | null
          mime_type?: string
          organization_id?: string
          size_bytes?: number
          storage_path?: string
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          author_id: string
          author_role: string
          content: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          author_role: string
          content: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          author_role?: string
          content?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_super_admin: string | null
          category: string | null
          created_at: string
          created_by: string
          id: string
          last_message_at: string
          last_message_by_role: string
          organization_id: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          unread_for_admin: boolean
          unread_for_super_admin: boolean
          updated_at: string
        }
        Insert: {
          assigned_super_admin?: string | null
          category?: string | null
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string
          last_message_by_role?: string
          organization_id: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          unread_for_admin?: boolean
          unread_for_super_admin?: boolean
          updated_at?: string
        }
        Update: {
          assigned_super_admin?: string | null
          category?: string | null
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          last_message_by_role?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          unread_for_admin?: boolean
          unread_for_super_admin?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tag_automations: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          is_active: boolean
          organization_id: string
          product_id: string | null
          tag_id_to_add: string
          tag_id_to_remove: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          is_active?: boolean
          organization_id: string
          product_id?: string | null
          tag_id_to_add: string
          tag_id_to_remove?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          product_id?: string | null
          tag_id_to_add?: string
          tag_id_to_remove?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_automations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_automations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_automations_tag_id_to_add_fkey"
            columns: ["tag_id_to_add"]
            isOneToOne: false
            referencedRelation: "lead_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_automations_tag_id_to_remove_fkey"
            columns: ["tag_id_to_remove"]
            isOneToOne: false
            referencedRelation: "lead_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          product_id: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          product_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title: string
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          product_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title?: string
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          auth_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_error_code: string | null
          organization_id: string
          processing_attempt_id: string | null
          processing_expires_at: string | null
          processing_started_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          squad_id: string | null
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_error_code?: string | null
          organization_id: string
          processing_attempt_id?: string | null
          processing_expires_at?: string | null
          processing_started_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          squad_id?: string | null
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_error_code?: string | null
          organization_id?: string
          processing_attempt_id?: string | null
          processing_expires_at?: string | null
          processing_started_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          squad_id?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_events: {
        Row: {
          created_at: string
          event_id: string
          event_name: string
          event_time: string
          first_touch: Json
          hostname: string | null
          id: string
          last_touch: Json
          lead_id: string | null
          organization_id: string
          page_url: string | null
          properties: Json
          referrer: string | null
          session_id: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          event_name: string
          event_time?: string
          first_touch?: Json
          hostname?: string | null
          id?: string
          last_touch?: Json
          lead_id?: string | null
          organization_id: string
          page_url?: string | null
          properties?: Json
          referrer?: string | null
          session_id?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          event_name?: string
          event_time?: string
          first_touch?: Json
          hostname?: string | null
          id?: string
          last_touch?: Json
          lead_id?: string | null
          organization_id?: string
          page_url?: string | null
          properties?: Json
          referrer?: string | null
          session_id?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_visitors: {
        Row: {
          backfilled: boolean
          client_ip: string | null
          created_at: string
          fbc: string | null
          fbp: string | null
          first_seen_at: string
          first_touch: Json
          id: string
          last_seen_at: string
          last_touch: Json
          lead_id: string | null
          organization_id: string
          updated_at: string
          user_agent: string | null
          visitor_id: string
        }
        Insert: {
          backfilled?: boolean
          client_ip?: string | null
          created_at?: string
          fbc?: string | null
          fbp?: string | null
          first_seen_at?: string
          first_touch?: Json
          id?: string
          last_seen_at?: string
          last_touch?: Json
          lead_id?: string | null
          organization_id: string
          updated_at?: string
          user_agent?: string | null
          visitor_id: string
        }
        Update: {
          backfilled?: boolean
          client_ip?: string | null
          created_at?: string
          fbc?: string | null
          fbp?: string | null
          first_seen_at?: string
          first_touch?: Json
          id?: string
          last_seen_at?: string
          last_touch?: Json
          lead_id?: string | null
          organization_id?: string
          updated_at?: string
          user_agent?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_visitors_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_visitors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_availability: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          is_available: boolean | null
          organization_id: string
          start_time: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_available?: boolean | null
          organization_id: string
          start_time: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_available?: boolean | null
          organization_id?: string
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_availability_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_name: string
          badge_type: string
          description: string | null
          earned_at: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          badge_name: string
          badge_type: string
          description?: string | null
          earned_at?: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          badge_name?: string
          badge_type?: string
          description?: string | null
          earned_at?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_notification_settings: {
        Row: {
          created_at: string
          notify_appointments: boolean | null
          notify_groups: boolean | null
          notify_new_messages: boolean | null
          notify_new_tickets: boolean | null
          notify_status_change: boolean | null
          notify_unassigned_sector_tickets: boolean | null
          organization_id: string | null
          push_assigned_lead: boolean
          push_booking_reminder: boolean
          push_enabled: boolean | null
          push_new_booking: boolean
          push_new_message: boolean
          push_queue_lead: boolean
          push_sale_won: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notify_appointments?: boolean | null
          notify_groups?: boolean | null
          notify_new_messages?: boolean | null
          notify_new_tickets?: boolean | null
          notify_status_change?: boolean | null
          notify_unassigned_sector_tickets?: boolean | null
          organization_id?: string | null
          push_assigned_lead?: boolean
          push_booking_reminder?: boolean
          push_enabled?: boolean | null
          push_new_booking?: boolean
          push_new_message?: boolean
          push_queue_lead?: boolean
          push_sale_won?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          notify_appointments?: boolean | null
          notify_groups?: boolean | null
          notify_new_messages?: boolean | null
          notify_new_tickets?: boolean | null
          notify_status_change?: boolean | null
          notify_unassigned_sector_tickets?: boolean | null
          organization_id?: string | null
          push_assigned_lead?: boolean
          push_booking_reminder?: boolean
          push_enabled?: boolean | null
          push_new_booking?: boolean
          push_new_message?: boolean
          push_queue_lead?: boolean
          push_sale_won?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_org_switch_log: {
        Row: {
          from_org: string | null
          id: string
          switched_at: string
          to_org: string | null
          user_id: string
        }
        Insert: {
          from_org?: string | null
          id?: string
          switched_at?: string
          to_org?: string | null
          user_id: string
        }
        Update: {
          from_org?: string | null
          id?: string
          switched_at?: string
          to_org?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_organizations: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          joined_via: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          joined_via?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          joined_via?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          allow_close_pending_tickets: boolean | null
          allow_connection_actions: boolean | null
          allow_dashboard: boolean | null
          allow_groups: boolean | null
          allow_inbox_panel: boolean | null
          allow_manage_client_portfolio: boolean | null
          allow_pipeline: boolean | null
          can_revive_ai: boolean
          created_at: string | null
          id: string
          organization_id: string
          signature_enabled: boolean
          updated_at: string | null
          user_id: string
          view_ai_agents_tab: boolean
          view_all_contacts: boolean | null
          view_all_kanban_cards: boolean | null
          view_all_portfolio: boolean
          view_all_schedules: boolean | null
          view_my_portfolio: boolean
          view_other_queues_conversations: boolean | null
          view_other_users_conversations: boolean | null
          view_queue_conversations: boolean | null
          view_schedules_mode: string | null
          view_squad_portfolio: boolean
          view_unassigned_portfolio: boolean
          view_unassigned_sector_tickets: boolean | null
        }
        Insert: {
          allow_close_pending_tickets?: boolean | null
          allow_connection_actions?: boolean | null
          allow_dashboard?: boolean | null
          allow_groups?: boolean | null
          allow_inbox_panel?: boolean | null
          allow_manage_client_portfolio?: boolean | null
          allow_pipeline?: boolean | null
          can_revive_ai?: boolean
          created_at?: string | null
          id?: string
          organization_id: string
          signature_enabled?: boolean
          updated_at?: string | null
          user_id: string
          view_ai_agents_tab?: boolean
          view_all_contacts?: boolean | null
          view_all_kanban_cards?: boolean | null
          view_all_portfolio?: boolean
          view_all_schedules?: boolean | null
          view_my_portfolio?: boolean
          view_other_queues_conversations?: boolean | null
          view_other_users_conversations?: boolean | null
          view_queue_conversations?: boolean | null
          view_schedules_mode?: string | null
          view_squad_portfolio?: boolean
          view_unassigned_portfolio?: boolean
          view_unassigned_sector_tickets?: boolean | null
        }
        Update: {
          allow_close_pending_tickets?: boolean | null
          allow_connection_actions?: boolean | null
          allow_dashboard?: boolean | null
          allow_groups?: boolean | null
          allow_inbox_panel?: boolean | null
          allow_manage_client_portfolio?: boolean | null
          allow_pipeline?: boolean | null
          can_revive_ai?: boolean
          created_at?: string | null
          id?: string
          organization_id?: string
          signature_enabled?: boolean
          updated_at?: string | null
          user_id?: string
          view_ai_agents_tab?: boolean
          view_all_contacts?: boolean | null
          view_all_kanban_cards?: boolean | null
          view_all_portfolio?: boolean
          view_all_schedules?: boolean | null
          view_my_portfolio?: boolean
          view_other_queues_conversations?: boolean | null
          view_other_users_conversations?: boolean | null
          view_queue_conversations?: boolean | null
          view_schedules_mode?: string | null
          view_squad_portfolio?: boolean
          view_unassigned_portfolio?: boolean
          view_unassigned_sector_tickets?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_product_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          monthly_goal: number | null
          product_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          monthly_goal?: number | null
          product_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          monthly_goal?: number | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_product_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_product_assignments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_product_assignments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_status: {
        Row: {
          active_leads_count: number
          id: string
          last_status_change: string
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_leads_count?: number
          id?: string
          last_status_change?: string
          organization_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_leads_count?: number
          id?: string
          last_status_change?: string
          organization_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_status_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_actions: {
        Row: {
          action_type: string
          call_log_id: string
          created_at: string
          description: string | null
          due_at: string | null
          executed_at: string | null
          id: string
          lead_id: string | null
          organization_id: string
          payload: Json
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          action_type: string
          call_log_id: string
          created_at?: string
          description?: string | null
          due_at?: string | null
          executed_at?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          payload?: Json
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          call_log_id?: string
          created_at?: string
          description?: string | null
          due_at?: string | null
          executed_at?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          payload?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_actions_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_actions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agents: {
        Row: {
          context_override: string | null
          created_at: string
          created_by: string | null
          description: string | null
          display_name: string | null
          external_agent_id: string | null
          grok_voice_id: string | null
          id: string
          is_active: boolean
          is_inbound_default: boolean
          language: string
          name: string
          objective: string | null
          organization_id: string
          outcomes: Json
          photo_url: string | null
          product_agent_id: string | null
          provider: string
          public_config: Json
          public_enabled: boolean
          public_slug: string | null
          role_title: string | null
          system_prompt: string | null
          theme: string
          tools: Json
          tools_config: Json
          updated_at: string
          voice_option: string
          voice_settings: Json
        }
        Insert: {
          context_override?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string | null
          external_agent_id?: string | null
          grok_voice_id?: string | null
          id?: string
          is_active?: boolean
          is_inbound_default?: boolean
          language?: string
          name: string
          objective?: string | null
          organization_id: string
          outcomes?: Json
          photo_url?: string | null
          product_agent_id?: string | null
          provider?: string
          public_config?: Json
          public_enabled?: boolean
          public_slug?: string | null
          role_title?: string | null
          system_prompt?: string | null
          theme?: string
          tools?: Json
          tools_config?: Json
          updated_at?: string
          voice_option?: string
          voice_settings?: Json
        }
        Update: {
          context_override?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string | null
          external_agent_id?: string | null
          grok_voice_id?: string | null
          id?: string
          is_active?: boolean
          is_inbound_default?: boolean
          language?: string
          name?: string
          objective?: string | null
          organization_id?: string
          outcomes?: Json
          photo_url?: string | null
          product_agent_id?: string | null
          provider?: string
          public_config?: Json
          public_enabled?: boolean
          public_slug?: string | null
          role_title?: string | null
          system_prompt?: string | null
          theme?: string
          tools?: Json
          tools_config?: Json
          updated_at?: string
          voice_option?: string
          voice_settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "voice_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_agents_product_agent_id_fkey"
            columns: ["product_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_call_sessions: {
        Row: {
          ai_analysis: Json | null
          ai_analysis_at: string | null
          audio_seconds_in: number | null
          audio_seconds_out: number | null
          captured_data: Json
          cost_usd_estimated: number | null
          cost_usd_reported: number | null
          created_at: string
          ctas_clicked: Json
          duration_sec: number | null
          ended_at: string | null
          id: string
          lead_id: string | null
          model: string | null
          organization_id: string
          outcome: string | null
          pricing_snapshot: Json | null
          provider: string | null
          started_at: string
          summary: Json
          tags_applied: Json
          tokens_in: number | null
          tokens_out: number | null
          transcript: Json
          updated_at: string
          utms: Json
          visitor_id: string | null
          voice_call_id: string
          voice_id: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          ai_analysis_at?: string | null
          audio_seconds_in?: number | null
          audio_seconds_out?: number | null
          captured_data?: Json
          cost_usd_estimated?: number | null
          cost_usd_reported?: number | null
          created_at?: string
          ctas_clicked?: Json
          duration_sec?: number | null
          ended_at?: string | null
          id?: string
          lead_id?: string | null
          model?: string | null
          organization_id: string
          outcome?: string | null
          pricing_snapshot?: Json | null
          provider?: string | null
          started_at?: string
          summary?: Json
          tags_applied?: Json
          tokens_in?: number | null
          tokens_out?: number | null
          transcript?: Json
          updated_at?: string
          utms?: Json
          visitor_id?: string | null
          voice_call_id: string
          voice_id?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          ai_analysis_at?: string | null
          audio_seconds_in?: number | null
          audio_seconds_out?: number | null
          captured_data?: Json
          cost_usd_estimated?: number | null
          cost_usd_reported?: number | null
          created_at?: string
          ctas_clicked?: Json
          duration_sec?: number | null
          ended_at?: string | null
          id?: string
          lead_id?: string | null
          model?: string | null
          organization_id?: string
          outcome?: string | null
          pricing_snapshot?: Json | null
          provider?: string | null
          started_at?: string
          summary?: Json
          tags_applied?: Json
          tokens_in?: number | null
          tokens_out?: number | null
          transcript?: Json
          updated_at?: string
          utms?: Json
          visitor_id?: string | null
          voice_call_id?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_call_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_call_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_call_sessions_voice_call_id_fkey"
            columns: ["voice_call_id"]
            isOneToOne: false
            referencedRelation: "voice_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_call_views: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          id: string
          ip_hash: string | null
          organization_id: string
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
          voice_call_id: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          organization_id: string
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
          voice_call_id: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          organization_id?: string
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
          voice_call_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_call_views_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_call_views_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "voice_call_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_call_views_voice_call_id_fkey"
            columns: ["voice_call_id"]
            isOneToOne: false
            referencedRelation: "voice_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_calls: {
        Row: {
          appearance: Json
          capture_fields: Json
          context: string | null
          created_at: string
          created_by: string | null
          ctas: Json
          grok_voice_id: string | null
          id: string
          language: string
          name: string
          openai_voice_id: string | null
          organization_id: string
          post_cadence_id: string | null
          post_call_automations: Json
          product_agent_id: string | null
          product_id: string | null
          slug: string
          stats: Json
          status: string
          tracking: Json
          updated_at: string
          voice_agent_id: string | null
          voice_provider: string | null
          voice_settings: Json
        }
        Insert: {
          appearance?: Json
          capture_fields?: Json
          context?: string | null
          created_at?: string
          created_by?: string | null
          ctas?: Json
          grok_voice_id?: string | null
          id?: string
          language?: string
          name: string
          openai_voice_id?: string | null
          organization_id: string
          post_cadence_id?: string | null
          post_call_automations?: Json
          product_agent_id?: string | null
          product_id?: string | null
          slug: string
          stats?: Json
          status?: string
          tracking?: Json
          updated_at?: string
          voice_agent_id?: string | null
          voice_provider?: string | null
          voice_settings?: Json
        }
        Update: {
          appearance?: Json
          capture_fields?: Json
          context?: string | null
          created_at?: string
          created_by?: string | null
          ctas?: Json
          grok_voice_id?: string | null
          id?: string
          language?: string
          name?: string
          openai_voice_id?: string | null
          organization_id?: string
          post_cadence_id?: string | null
          post_call_automations?: Json
          product_agent_id?: string | null
          product_id?: string | null
          slug?: string
          stats?: Json
          status?: string
          tracking?: Json
          updated_at?: string
          voice_agent_id?: string | null
          voice_provider?: string | null
          voice_settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "voice_calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_post_cadence_id_fkey"
            columns: ["post_cadence_id"]
            isOneToOne: false
            referencedRelation: "cadences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_product_agent_id_fkey"
            columns: ["product_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_voice_agent_id_fkey"
            columns: ["voice_agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_campaign_journeys: {
        Row: {
          call_log_id: string | null
          campaign_id: string | null
          chosen_channel: string | null
          chosen_payload: Json
          created_at: string
          id: string
          lead_id: string | null
          notes: string | null
          organization_id: string
          stage: string
          target_id: string | null
          utm: Json
        }
        Insert: {
          call_log_id?: string | null
          campaign_id?: string | null
          chosen_channel?: string | null
          chosen_payload?: Json
          created_at?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          organization_id: string
          stage: string
          target_id?: string | null
          utm?: Json
        }
        Update: {
          call_log_id?: string | null
          campaign_id?: string | null
          chosen_channel?: string | null
          chosen_payload?: Json
          created_at?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          organization_id?: string
          stage?: string
          target_id?: string | null
          utm?: Json
        }
        Relationships: [
          {
            foreignKeyName: "voice_campaign_journeys_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaign_journeys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voice_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaign_journeys_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaign_journeys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaign_journeys_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "voice_campaign_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_campaign_targets: {
        Row: {
          attempts: number
          campaign_id: string
          created_at: string
          id: string
          journey_id: string | null
          last_attempt_at: string | null
          last_error: string | null
          lead_id: string | null
          organization_id: string
          phone: string
          scheduled_for: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          created_at?: string
          id?: string
          journey_id?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          lead_id?: string | null
          organization_id: string
          phone: string
          scheduled_for?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          created_at?: string
          id?: string
          journey_id?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          lead_id?: string | null
          organization_id?: string
          phone?: string
          scheduled_for?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voice_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaign_targets_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "voice_campaign_journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaign_targets_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaign_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_campaigns: {
        Row: {
          audience_filters: Json
          business_hours_only: boolean
          context_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          dial_numbers: Json
          dial_strategy: string
          exclusion_filters: Json
          finished_at: string | null
          grok_voice_id: string | null
          id: string
          language: string
          lead_filter: Json
          max_attempts: number
          max_concurrent: number
          name: string
          organization_id: string
          post_call_actions: Json
          product_agent_id: string | null
          product_id: string | null
          retry_interval_minutes: number
          schedule: Json
          scheduled_at: string | null
          source_webhook_id: string | null
          started_at: string | null
          status: string
          timezone: string
          totals: Json
          updated_at: string
          voice_agent_id: string | null
          voice_context_id: string | null
          voice_settings: Json
        }
        Insert: {
          audience_filters?: Json
          business_hours_only?: boolean
          context_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          dial_numbers?: Json
          dial_strategy?: string
          exclusion_filters?: Json
          finished_at?: string | null
          grok_voice_id?: string | null
          id?: string
          language?: string
          lead_filter?: Json
          max_attempts?: number
          max_concurrent?: number
          name: string
          organization_id: string
          post_call_actions?: Json
          product_agent_id?: string | null
          product_id?: string | null
          retry_interval_minutes?: number
          schedule?: Json
          scheduled_at?: string | null
          source_webhook_id?: string | null
          started_at?: string | null
          status?: string
          timezone?: string
          totals?: Json
          updated_at?: string
          voice_agent_id?: string | null
          voice_context_id?: string | null
          voice_settings?: Json
        }
        Update: {
          audience_filters?: Json
          business_hours_only?: boolean
          context_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          dial_numbers?: Json
          dial_strategy?: string
          exclusion_filters?: Json
          finished_at?: string | null
          grok_voice_id?: string | null
          id?: string
          language?: string
          lead_filter?: Json
          max_attempts?: number
          max_concurrent?: number
          name?: string
          organization_id?: string
          post_call_actions?: Json
          product_agent_id?: string | null
          product_id?: string | null
          retry_interval_minutes?: number
          schedule?: Json
          scheduled_at?: string | null
          source_webhook_id?: string | null
          started_at?: string | null
          status?: string
          timezone?: string
          totals?: Json
          updated_at?: string
          voice_agent_id?: string | null
          voice_context_id?: string | null
          voice_settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "voice_campaigns_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "voice_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaigns_product_agent_id_fkey"
            columns: ["product_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaigns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaigns_voice_agent_id_fkey"
            columns: ["voice_agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaigns_voice_context_id_fkey"
            columns: ["voice_context_id"]
            isOneToOne: false
            referencedRelation: "voice_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_clones: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          grok_voice_id: string | null
          id: string
          name: string
          organization_id: string
          sample_urls: Json
          status: string
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          grok_voice_id?: string | null
          id?: string
          name: string
          organization_id: string
          sample_urls?: Json
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          grok_voice_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          sample_urls?: Json
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_clones_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_contexts: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          product_id: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          product_id?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          product_id?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_contexts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_contexts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_inbound_webhooks: {
        Row: {
          active: boolean
          campaign_id: string | null
          created_at: string
          created_by: string | null
          default_agent_id: string | null
          default_source: string | null
          default_tags: string[]
          field_mapping: Json
          id: string
          last_triggered_at: string | null
          mode: string
          name: string
          organization_id: string
          schedule_offset_minutes: number
          token: string
          trigger_count: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          default_agent_id?: string | null
          default_source?: string | null
          default_tags?: string[]
          field_mapping?: Json
          id?: string
          last_triggered_at?: string | null
          mode?: string
          name: string
          organization_id: string
          schedule_offset_minutes?: number
          token?: string
          trigger_count?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          default_agent_id?: string | null
          default_source?: string | null
          default_tags?: string[]
          field_mapping?: Json
          id?: string
          last_triggered_at?: string | null
          mode?: string
          name?: string
          organization_id?: string
          schedule_offset_minutes?: number
          token?: string
          trigger_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_inbound_webhooks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voice_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_inbound_webhooks_default_agent_id_fkey"
            columns: ["default_agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_inbound_webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_pricing: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          is_active: boolean
          model: string
          notes: string | null
          provider: string
          unit: string
          updated_at: string
          usd_per_unit: number
          voice_id: string | null
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          model: string
          notes?: string | null
          provider: string
          unit: string
          updated_at?: string
          usd_per_unit: number
          voice_id?: string | null
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          model?: string
          notes?: string | null
          provider?: string
          unit?: string
          updated_at?: string
          usd_per_unit?: number
          voice_id?: string | null
        }
        Relationships: []
      }
      webchat_agent_configs: {
        Row: {
          agent_avatar_url: string | null
          agent_name: string | null
          auto_handoff_enabled: boolean | null
          chunked_messages_enabled: boolean | null
          collect_before_chat: boolean | null
          created_at: string | null
          fallback_message: string | null
          faq: Json | null
          greeting_message: string | null
          handoff_message: string | null
          handoff_triggers: string[] | null
          id: string
          is_active: boolean | null
          knowledge_base: string | null
          max_message_length: number | null
          max_tokens: number | null
          organization_id: string
          persona_style: string | null
          product_id: string | null
          required_fields: string[] | null
          sales_context: string | null
          sales_prompt: string | null
          system_prompt: string | null
          temperature: number | null
          typing_delay_ms: number | null
          updated_at: string | null
          use_product_brain: boolean | null
          welcome_flow: Json | null
          widget_id: string
        }
        Insert: {
          agent_avatar_url?: string | null
          agent_name?: string | null
          auto_handoff_enabled?: boolean | null
          chunked_messages_enabled?: boolean | null
          collect_before_chat?: boolean | null
          created_at?: string | null
          fallback_message?: string | null
          faq?: Json | null
          greeting_message?: string | null
          handoff_message?: string | null
          handoff_triggers?: string[] | null
          id?: string
          is_active?: boolean | null
          knowledge_base?: string | null
          max_message_length?: number | null
          max_tokens?: number | null
          organization_id: string
          persona_style?: string | null
          product_id?: string | null
          required_fields?: string[] | null
          sales_context?: string | null
          sales_prompt?: string | null
          system_prompt?: string | null
          temperature?: number | null
          typing_delay_ms?: number | null
          updated_at?: string | null
          use_product_brain?: boolean | null
          welcome_flow?: Json | null
          widget_id: string
        }
        Update: {
          agent_avatar_url?: string | null
          agent_name?: string | null
          auto_handoff_enabled?: boolean | null
          chunked_messages_enabled?: boolean | null
          collect_before_chat?: boolean | null
          created_at?: string | null
          fallback_message?: string | null
          faq?: Json | null
          greeting_message?: string | null
          handoff_message?: string | null
          handoff_triggers?: string[] | null
          id?: string
          is_active?: boolean | null
          knowledge_base?: string | null
          max_message_length?: number | null
          max_tokens?: number | null
          organization_id?: string
          persona_style?: string | null
          product_id?: string | null
          required_fields?: string[] | null
          sales_context?: string | null
          sales_prompt?: string | null
          system_prompt?: string | null
          temperature?: number | null
          typing_delay_ms?: number | null
          updated_at?: string | null
          use_product_brain?: boolean | null
          welcome_flow?: Json | null
          widget_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webchat_agent_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_agent_configs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_agent_configs_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "webchat_widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      webchat_assignment_events: {
        Row: {
          action: string
          conversation_id: string
          created_at: string | null
          from_user_id: string | null
          id: string
          to_user_id: string | null
        }
        Insert: {
          action: string
          conversation_id: string
          created_at?: string | null
          from_user_id?: string | null
          id?: string
          to_user_id?: string | null
        }
        Update: {
          action?: string
          conversation_id?: string
          created_at?: string | null
          from_user_id?: string | null
          id?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webchat_assignment_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_assignment_events_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_assignment_events_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_assignment_events_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_assignment_events_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webchat_conversations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          assigned_user_id: string | null
          bot_locked_until: string | null
          bot_loop_detected_at: string | null
          bot_loop_last_strike_at: string | null
          bot_loop_reason: string | null
          bot_loop_strike_count: number
          channel: string
          closed_at: string | null
          closing_outcome: string | null
          closing_reason: string | null
          closing_value: number | null
          collected_data: Json | null
          created_at: string | null
          current_agent_id: string | null
          current_block_id: string | null
          current_flow_id: string | null
          current_page_url: string | null
          data_collected: boolean | null
          detected_intent: string | null
          evolution_instance_id: string | null
          first_response_at: string | null
          flow_completed: boolean | null
          flow_source: string | null
          flow_variables: Json | null
          human_response_alert_sent_at: string | null
          human_response_pending_since: string | null
          id: string
          ig_sender_id: string | null
          instagram_ai_flow_id: string | null
          instagram_connection_id: string | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_created_at: string | null
          last_message_metadata: Json | null
          last_message_sender_type: string | null
          lead_created_at: string | null
          lead_id: string | null
          meeting_event_id: string | null
          meeting_metadata: Json | null
          meeting_scheduled_at: string | null
          meta_connection_id: string | null
          metadata: Json | null
          needs_human: boolean
          orchestrator_context: string | null
          orchestrator_question_count: number
          orchestrator_state: string
          organization_id: string
          product_id: string | null
          referrer_url: string | null
          released_to_queue_at: string | null
          reopened_at: string | null
          sector_id: string | null
          status: Database["public"]["Enums"]["webchat_conversation_status"]
          unread_count_agents: number | null
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_avatar_url: string | null
          visitor_email: string | null
          visitor_id: string
          visitor_ip: string | null
          visitor_name: string | null
          visitor_phone: string | null
          visitor_phone_normalized: string | null
          visitor_user_agent: string | null
          visitor_whatsapp: string | null
          welcome_sent_at: string | null
          widget_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          assigned_user_id?: string | null
          bot_locked_until?: string | null
          bot_loop_detected_at?: string | null
          bot_loop_last_strike_at?: string | null
          bot_loop_reason?: string | null
          bot_loop_strike_count?: number
          channel?: string
          closed_at?: string | null
          closing_outcome?: string | null
          closing_reason?: string | null
          closing_value?: number | null
          collected_data?: Json | null
          created_at?: string | null
          current_agent_id?: string | null
          current_block_id?: string | null
          current_flow_id?: string | null
          current_page_url?: string | null
          data_collected?: boolean | null
          detected_intent?: string | null
          evolution_instance_id?: string | null
          first_response_at?: string | null
          flow_completed?: boolean | null
          flow_source?: string | null
          flow_variables?: Json | null
          human_response_alert_sent_at?: string | null
          human_response_pending_since?: string | null
          id?: string
          ig_sender_id?: string | null
          instagram_ai_flow_id?: string | null
          instagram_connection_id?: string | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_created_at?: string | null
          last_message_metadata?: Json | null
          last_message_sender_type?: string | null
          lead_created_at?: string | null
          lead_id?: string | null
          meeting_event_id?: string | null
          meeting_metadata?: Json | null
          meeting_scheduled_at?: string | null
          meta_connection_id?: string | null
          metadata?: Json | null
          needs_human?: boolean
          orchestrator_context?: string | null
          orchestrator_question_count?: number
          orchestrator_state?: string
          organization_id: string
          product_id?: string | null
          referrer_url?: string | null
          released_to_queue_at?: string | null
          reopened_at?: string | null
          sector_id?: string | null
          status?: Database["public"]["Enums"]["webchat_conversation_status"]
          unread_count_agents?: number | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_avatar_url?: string | null
          visitor_email?: string | null
          visitor_id: string
          visitor_ip?: string | null
          visitor_name?: string | null
          visitor_phone?: string | null
          visitor_phone_normalized?: string | null
          visitor_user_agent?: string | null
          visitor_whatsapp?: string | null
          welcome_sent_at?: string | null
          widget_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          assigned_user_id?: string | null
          bot_locked_until?: string | null
          bot_loop_detected_at?: string | null
          bot_loop_last_strike_at?: string | null
          bot_loop_reason?: string | null
          bot_loop_strike_count?: number
          channel?: string
          closed_at?: string | null
          closing_outcome?: string | null
          closing_reason?: string | null
          closing_value?: number | null
          collected_data?: Json | null
          created_at?: string | null
          current_agent_id?: string | null
          current_block_id?: string | null
          current_flow_id?: string | null
          current_page_url?: string | null
          data_collected?: boolean | null
          detected_intent?: string | null
          evolution_instance_id?: string | null
          first_response_at?: string | null
          flow_completed?: boolean | null
          flow_source?: string | null
          flow_variables?: Json | null
          human_response_alert_sent_at?: string | null
          human_response_pending_since?: string | null
          id?: string
          ig_sender_id?: string | null
          instagram_ai_flow_id?: string | null
          instagram_connection_id?: string | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_created_at?: string | null
          last_message_metadata?: Json | null
          last_message_sender_type?: string | null
          lead_created_at?: string | null
          lead_id?: string | null
          meeting_event_id?: string | null
          meeting_metadata?: Json | null
          meeting_scheduled_at?: string | null
          meta_connection_id?: string | null
          metadata?: Json | null
          needs_human?: boolean
          orchestrator_context?: string | null
          orchestrator_question_count?: number
          orchestrator_state?: string
          organization_id?: string
          product_id?: string | null
          referrer_url?: string | null
          released_to_queue_at?: string | null
          reopened_at?: string | null
          sector_id?: string | null
          status?: Database["public"]["Enums"]["webchat_conversation_status"]
          unread_count_agents?: number | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_avatar_url?: string | null
          visitor_email?: string | null
          visitor_id?: string
          visitor_ip?: string | null
          visitor_name?: string | null
          visitor_phone?: string | null
          visitor_phone_normalized?: string | null
          visitor_user_agent?: string | null
          visitor_whatsapp?: string | null
          welcome_sent_at?: string | null
          widget_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webchat_conversations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_current_agent_id_fkey"
            columns: ["current_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_evolution_instance_id_fkey"
            columns: ["evolution_instance_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_instagram_ai_flow_id_fkey"
            columns: ["instagram_ai_flow_id"]
            isOneToOne: false
            referencedRelation: "instagram_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_instagram_connection_id_fkey"
            columns: ["instagram_connection_id"]
            isOneToOne: false
            referencedRelation: "instagram_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_meta_connection_id_fkey"
            columns: ["meta_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_meta_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "webchat_widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      webchat_messages: {
        Row: {
          buttons: Json | null
          content: string
          content_type: string | null
          conversation_id: string
          created_at: string | null
          delivery_status: string | null
          direction: string
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          ig_message_id: string | null
          is_deleted: boolean | null
          is_starred: boolean | null
          message_type: string | null
          meta_message_id: string | null
          metadata: Json | null
          original_content: string | null
          reply_to_message_id: string | null
          sender_id: string | null
          sender_type: string
          video_url: string | null
        }
        Insert: {
          buttons?: Json | null
          content: string
          content_type?: string | null
          conversation_id: string
          created_at?: string | null
          delivery_status?: string | null
          direction: string
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          ig_message_id?: string | null
          is_deleted?: boolean | null
          is_starred?: boolean | null
          message_type?: string | null
          meta_message_id?: string | null
          metadata?: Json | null
          original_content?: string | null
          reply_to_message_id?: string | null
          sender_id?: string | null
          sender_type: string
          video_url?: string | null
        }
        Update: {
          buttons?: Json | null
          content?: string
          content_type?: string | null
          conversation_id?: string
          created_at?: string | null
          delivery_status?: string | null
          direction?: string
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          ig_message_id?: string | null
          is_deleted?: boolean | null
          is_starred?: boolean | null
          message_type?: string | null
          meta_message_id?: string | null
          metadata?: Json | null
          original_content?: string | null
          reply_to_message_id?: string | null
          sender_id?: string | null
          sender_type?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webchat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "webchat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "webchat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webchat_widgets: {
        Row: {
          auto_open_delay: number | null
          avatar_url: string | null
          business_hours: Json | null
          collect_email: boolean | null
          collect_name: boolean | null
          collect_phone: boolean | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          offline_message: string | null
          organization_id: string
          placeholder_text: string | null
          position: string | null
          primary_color: string | null
          product_id: string | null
          secondary_color: string | null
          updated_at: string | null
          welcome_message: string | null
        }
        Insert: {
          auto_open_delay?: number | null
          avatar_url?: string | null
          business_hours?: Json | null
          collect_email?: boolean | null
          collect_name?: boolean | null
          collect_phone?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          offline_message?: string | null
          organization_id: string
          placeholder_text?: string | null
          position?: string | null
          primary_color?: string | null
          product_id?: string | null
          secondary_color?: string | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Update: {
          auto_open_delay?: number | null
          avatar_url?: string | null
          business_hours?: Json | null
          collect_email?: boolean | null
          collect_name?: boolean | null
          collect_phone?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          offline_message?: string | null
          organization_id?: string
          placeholder_text?: string | null
          position?: string | null
          primary_color?: string | null
          product_id?: string | null
          secondary_color?: string | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webchat_widgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_widgets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          actions_executed: Json | null
          created_at: string | null
          error_message: string | null
          id: string
          lead_id: string | null
          parsed_fields: Json | null
          processing_time_ms: number | null
          request_body: Json | null
          request_headers: Json | null
          request_ip: string | null
          request_method: string
          status: string | null
          webhook_id: string
        }
        Insert: {
          actions_executed?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          parsed_fields?: Json | null
          processing_time_ms?: number | null
          request_body?: Json | null
          request_headers?: Json | null
          request_ip?: string | null
          request_method: string
          status?: string | null
          webhook_id: string
        }
        Update: {
          actions_executed?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          parsed_fields?: Json | null
          processing_time_ms?: number | null
          request_body?: Json | null
          request_headers?: Json | null
          request_ip?: string | null
          request_method?: string
          status?: string | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_sample_requests: {
        Row: {
          created_at: string | null
          extracted_fields: Json
          id: string
          is_default: boolean | null
          name: string | null
          request_body: Json
          webhook_id: string
        }
        Insert: {
          created_at?: string | null
          extracted_fields: Json
          id?: string
          is_default?: boolean | null
          name?: string | null
          request_body: Json
          webhook_id: string
        }
        Update: {
          created_at?: string | null
          extracted_fields?: Json
          id?: string
          is_default?: boolean | null
          name?: string | null
          request_body?: Json
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_sample_requests_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          actions: Json | null
          allowed_ips: string[] | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          identification_config: Json | null
          is_active: boolean | null
          is_test_mode: boolean | null
          last_request_at: string | null
          name: string
          organization_id: string
          product_id: string | null
          requests_count: number | null
          requests_this_month: number | null
          secret_key: string | null
          slug: string
          squad_id: string | null
          updated_at: string | null
        }
        Insert: {
          actions?: Json | null
          allowed_ips?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          identification_config?: Json | null
          is_active?: boolean | null
          is_test_mode?: boolean | null
          last_request_at?: string | null
          name: string
          organization_id: string
          product_id?: string | null
          requests_count?: number | null
          requests_this_month?: number | null
          secret_key?: string | null
          slug: string
          squad_id?: string | null
          updated_at?: string | null
        }
        Update: {
          actions?: Json | null
          allowed_ips?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          identification_config?: Json | null
          is_active?: boolean | null
          is_test_mode?: boolean | null
          last_request_at?: string | null
          name?: string
          organization_id?: string
          product_id?: string | null
          requests_count?: number | null
          requests_this_month?: number | null
          secret_key?: string | null
          slug?: string
          squad_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_meta_connections: {
        Row: {
          access_token_encrypted: string | null
          app_id: string | null
          app_secret_encrypted: string | null
          business_account_name: string | null
          consecutive_failures: number
          cooldown_until: string | null
          created_at: string
          created_by: string | null
          default_reengagement_template_id: string | null
          display_name: string
          id: string
          last_error: string | null
          last_failure_at: string | null
          last_failure_reason: string | null
          last_health_check_at: string | null
          messaging_limit_tier: string | null
          organization_id: string
          phone_number: string | null
          phone_number_id: string | null
          quality_rating: string | null
          status: string
          updated_at: string
          waba_id: string | null
          webhook_subscribed_at: string | null
          webhook_verify_token: string
        }
        Insert: {
          access_token_encrypted?: string | null
          app_id?: string | null
          app_secret_encrypted?: string | null
          business_account_name?: string | null
          consecutive_failures?: number
          cooldown_until?: string | null
          created_at?: string
          created_by?: string | null
          default_reengagement_template_id?: string | null
          display_name: string
          id?: string
          last_error?: string | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_health_check_at?: string | null
          messaging_limit_tier?: string | null
          organization_id: string
          phone_number?: string | null
          phone_number_id?: string | null
          quality_rating?: string | null
          status?: string
          updated_at?: string
          waba_id?: string | null
          webhook_subscribed_at?: string | null
          webhook_verify_token: string
        }
        Update: {
          access_token_encrypted?: string | null
          app_id?: string | null
          app_secret_encrypted?: string | null
          business_account_name?: string | null
          consecutive_failures?: number
          cooldown_until?: string | null
          created_at?: string
          created_by?: string | null
          default_reengagement_template_id?: string | null
          display_name?: string
          id?: string
          last_error?: string | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_health_check_at?: string | null
          messaging_limit_tier?: string | null
          organization_id?: string
          phone_number?: string | null
          phone_number_id?: string | null
          quality_rating?: string | null
          status?: string
          updated_at?: string
          waba_id?: string | null
          webhook_subscribed_at?: string | null
          webhook_verify_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_wameta_default_tpl"
            columns: ["default_reengagement_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_meta_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_meta_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_meta_templates: {
        Row: {
          category: string
          components: Json
          connection_id: string
          created_at: string
          header_media_filename: string | null
          header_media_id: string | null
          header_media_mime: string | null
          header_media_storage_path: string | null
          header_media_uploaded_at: string | null
          header_media_url: string | null
          id: string
          language: string
          last_send_at: string | null
          last_send_error: string | null
          last_synced_at: string | null
          meta_template_id: string | null
          name: string
          organization_id: string
          quality_score: Json | null
          rejected_reason: string | null
          status: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          category: string
          components?: Json
          connection_id: string
          created_at?: string
          header_media_filename?: string | null
          header_media_id?: string | null
          header_media_mime?: string | null
          header_media_storage_path?: string | null
          header_media_uploaded_at?: string | null
          header_media_url?: string | null
          id?: string
          language: string
          last_send_at?: string | null
          last_send_error?: string | null
          last_synced_at?: string | null
          meta_template_id?: string | null
          name: string
          organization_id: string
          quality_score?: Json | null
          rejected_reason?: string | null
          status?: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          category?: string
          components?: Json
          connection_id?: string
          created_at?: string
          header_media_filename?: string | null
          header_media_id?: string | null
          header_media_mime?: string | null
          header_media_storage_path?: string | null
          header_media_uploaded_at?: string | null
          header_media_url?: string | null
          id?: string
          language?: string
          last_send_at?: string | null
          last_send_error?: string | null
          last_synced_at?: string | null
          meta_template_id?: string | null
          name?: string
          organization_id?: string
          quality_score?: Json | null
          rejected_reason?: string | null
          status?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_meta_templates_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_meta_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_meta_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_meta_webhook_logs: {
        Row: {
          connection_id: string | null
          created_at: string
          error: string | null
          event_type: string | null
          id: string
          organization_id: string | null
          payload: Json | null
          processed: boolean
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json | null
          processed?: boolean
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json | null
          processed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_meta_webhook_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_meta_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_meta_webhook_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_cron_health: {
        Row: {
          active: boolean | null
          avg_ms_24h: number | null
          duplicates: number | null
          failed_24h: number | null
          jobname: string | null
          last_run: string | null
          last_status: string | null
          runs_24h: number | null
          schedule: string | null
        }
        Relationships: []
      }
      lead_journey_events: {
        Row: {
          actor_id: string | null
          actor_type: string | null
          agent_id: string | null
          channel: string | null
          conversation_id: string | null
          correlation_id: string | null
          created_at: string | null
          deal_id: string | null
          dedupe_key: string | null
          description: string | null
          event_category:
            | Database["public"]["Enums"]["journey_event_category"]
            | null
          event_type: Database["public"]["Enums"]["journey_event_type"] | null
          id: string | null
          ingested_at: string | null
          lead_id: string | null
          occurred_at: string | null
          organization_id: string | null
          payload: Json | null
          pipeline_stage_id: string | null
          previous_event_id: string | null
          product_id: string | null
          session_id: string | null
          source: string | null
          source_module: string | null
          subject_id: string | null
          subject_type: string | null
          time_since_previous_seconds: number | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string | null
          agent_id?: string | null
          channel?: string | null
          conversation_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          dedupe_key?: string | null
          description?: string | null
          event_category?:
            | Database["public"]["Enums"]["journey_event_category"]
            | null
          event_type?: Database["public"]["Enums"]["journey_event_type"] | null
          id?: string | null
          ingested_at?: string | null
          lead_id?: string | null
          occurred_at?: string | null
          organization_id?: string | null
          payload?: Json | null
          pipeline_stage_id?: string | null
          previous_event_id?: string | null
          product_id?: string | null
          session_id?: string | null
          source?: string | null
          source_module?: string | null
          subject_id?: string | null
          subject_type?: string | null
          time_since_previous_seconds?: number | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string | null
          agent_id?: string | null
          channel?: string | null
          conversation_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          dedupe_key?: string | null
          description?: string | null
          event_category?:
            | Database["public"]["Enums"]["journey_event_category"]
            | null
          event_type?: Database["public"]["Enums"]["journey_event_type"] | null
          id?: string | null
          ingested_at?: string | null
          lead_id?: string | null
          occurred_at?: string | null
          organization_id?: string | null
          payload?: Json | null
          pipeline_stage_id?: string | null
          previous_event_id?: string | null
          product_id?: string | null
          session_id?: string | null
          source?: string | null
          source_module?: string | null
          subject_id?: string | null
          subject_type?: string | null
          time_since_previous_seconds?: number | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_journey_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_journey_touchpoints_v: {
        Row: {
          channel: string | null
          first_touch_at: string | null
          last_touch_at: string | null
          lead_id: string | null
          organization_id: string | null
          touches: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_journey_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_journey_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_branding_public: {
        Row: {
          accent_color: string | null
          base_font_size: number | null
          border_radius: number | null
          browser_title: string | null
          created_at: string | null
          default_language: string | null
          default_theme: string | null
          favicon_url: string | null
          font_family: string | null
          font_url: string | null
          footer_text: string | null
          gradient_custom: Json | null
          gradient_style: string | null
          hide_widget_branding: boolean | null
          id: string | null
          login_bg_image_url: string | null
          login_bg_layout: string | null
          login_headline: string | null
          login_logo_position: string | null
          login_stats_enabled: boolean | null
          login_subheadline: string | null
          logo_dark_url: string | null
          logo_url: string | null
          meta_description: string | null
          og_image_url: string | null
          platform_name: string | null
          powered_by_text: string | null
          primary_color: string | null
          privacy_url: string | null
          public_app_url: string | null
          support_email: string | null
          terms_url: string | null
          twitter_handle: string | null
          updated_at: string | null
          widget_accent_color: string | null
        }
        Insert: {
          accent_color?: string | null
          base_font_size?: number | null
          border_radius?: number | null
          browser_title?: string | null
          created_at?: string | null
          default_language?: string | null
          default_theme?: string | null
          favicon_url?: string | null
          font_family?: string | null
          font_url?: string | null
          footer_text?: string | null
          gradient_custom?: Json | null
          gradient_style?: string | null
          hide_widget_branding?: boolean | null
          id?: string | null
          login_bg_image_url?: string | null
          login_bg_layout?: string | null
          login_headline?: string | null
          login_logo_position?: string | null
          login_stats_enabled?: boolean | null
          login_subheadline?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          meta_description?: string | null
          og_image_url?: string | null
          platform_name?: string | null
          powered_by_text?: string | null
          primary_color?: string | null
          privacy_url?: string | null
          public_app_url?: string | null
          support_email?: string | null
          terms_url?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          widget_accent_color?: string | null
        }
        Update: {
          accent_color?: string | null
          base_font_size?: number | null
          border_radius?: number | null
          browser_title?: string | null
          created_at?: string | null
          default_language?: string | null
          default_theme?: string | null
          favicon_url?: string | null
          font_family?: string | null
          font_url?: string | null
          footer_text?: string | null
          gradient_custom?: Json | null
          gradient_style?: string | null
          hide_widget_branding?: boolean | null
          id?: string | null
          login_bg_image_url?: string | null
          login_bg_layout?: string | null
          login_headline?: string | null
          login_logo_position?: string | null
          login_stats_enabled?: boolean | null
          login_subheadline?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          meta_description?: string | null
          og_image_url?: string | null
          platform_name?: string | null
          powered_by_text?: string | null
          primary_color?: string | null
          privacy_url?: string | null
          public_app_url?: string | null
          support_email?: string | null
          terms_url?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          widget_accent_color?: string | null
        }
        Relationships: []
      }
      public_booking_profiles: {
        Row: {
          avatar_url: string | null
          booking_bio: string | null
          booking_slug: string | null
          full_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          booking_bio?: string | null
          booking_slug?: string | null
          full_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          booking_bio?: string | null
          booking_slug?: string | null
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
      v_agent_quality_30d: {
        Row: {
          agent_id: string | null
          avg_accuracy: number | null
          avg_clarity: number | null
          avg_conversion_potential: number | null
          avg_objectivity: number | null
          avg_overall: number | null
          avg_tone: number | null
          evaluations: number | null
          organization_id: string | null
        }
        Relationships: []
      }
      v_campaign_throughput: {
        Row: {
          bucket_hour: string | null
          organization_id: string | null
          status: string | null
          total: number | null
        }
        Relationships: []
      }
      v_lead_attribution_current: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          ai_score: number | null
          attributed_at: string | null
          attribution_method: string | null
          campaign_id: string | null
          campaign_name: string | null
          confidence_score: number | null
          created_at: string | null
          creative_id: string | null
          creative_name: string | null
          ctwa_clid: string | null
          fbclid: string | null
          gclid: string | null
          id: string | null
          lead_id: string | null
          li_fat_id: string | null
          organization_id: string | null
          placement: string | null
          provider: string | null
          ttclid: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_attribution_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_attribution_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_provider_health: {
        Row: {
          connection_id: string | null
          connection_name: string | null
          cooldown_until: string | null
          last_failure_at: string | null
          last_failure_reason: string | null
          organization_id: string | null
          provider: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _schedule_platform_job: {
        Args: { p_command: string; p_name: string; p_schedule: string }
        Returns: undefined
      }
      accept_invitation: {
        Args: { invitation_token: string; user_id: string }
        Returns: boolean
      }
      append_utm_to_url: {
        Args: { p_url: string; p_utm: Json }
        Returns: string
      }
      apply_docs_proposal: { Args: { _proposal_id: string }; Returns: string }
      apply_tag_automations: {
        Args: {
          p_event_type: string
          p_lead_id: string
          p_organization_id?: string
          p_product_id?: string
        }
        Returns: {
          action: string
          tag_id: string
        }[]
      }
      attach_invitation_auth_user: {
        Args: { p_attempt_id: string; p_token: string; p_user_id: string }
        Returns: boolean
      }
      calculate_commission: {
        Args: {
          p_deal_id: string
          p_deal_value: number
          p_organization_id: string
          p_product_id: string
          p_seller_id: string
        }
        Returns: number
      }
      can_access_conversation: {
        Args: { _conv_id: string; _user_id: string }
        Returns: boolean
      }
      cancel_booking_by_token: {
        Args: { p_reason?: string; p_token: string }
        Returns: Json
      }
      capture_platform_health: { Args: never; Returns: string }
      check_and_consume_ai_tokens: {
        Args: { p_org_id: string; p_tokens: number }
        Returns: boolean
      }
      check_expired_subscriptions: { Args: never; Returns: undefined }
      claim_campaign_preparation_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          batch_size: number
          campaign_id: string
          campaign_snapshot: Json | null
          completed_at: string | null
          created_at: string
          cursor: number
          error: string | null
          id: string
          lead_ids: string[]
          organization_id: string
          processed_contacts: number
          started_at: string | null
          status: string
          total_contacts: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "campaign_preparation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_campaign_preparation_jobs_controlled: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          batch_size: number
          campaign_id: string
          campaign_snapshot: Json | null
          completed_at: string | null
          created_at: string
          cursor: number
          error: string | null
          id: string
          lead_ids: string[]
          organization_id: string
          processed_contacts: number
          started_at: string | null
          status: string
          total_contacts: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "campaign_preparation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_campaign_targets: {
        Args: {
          p_global_limit?: number
          p_lookahead_multiplier?: number
          p_per_org_limit?: number
        }
        Returns: {
          attempts: number
          campaign_id: string
          connection_type: string
          context_id: string | null
          context_used: string | null
          conversation_id: string | null
          created_at: string
          error: string | null
          id: string
          instance_id: string | null
          lead_id: string
          organization_id: string
          outreach_queue_id: string | null
          responded_at: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "campaign_targets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_due_mia_chat_schedules: {
        Args: { p_limit?: number }
        Returns: {
          cadence: string
          created_at: string
          created_by: string
          id: string
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          local_time: string | null
          name: string
          next_run_at: string | null
          organization_id: string
          prompt: string
          run_at: string | null
          run_count: number
          status: string
          thread_id: string | null
          timezone: string
          updated_at: string
          weekdays: number[]
        }[]
        SetofOptions: {
          from: "*"
          to: "mia_chat_schedules"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_first_super_admin: { Args: never; Returns: boolean }
      claim_invitation_processing: {
        Args: { p_attempt_id: string; p_lock_seconds?: number; p_token: string }
        Returns: Json
      }
      claim_mia_open_analysis_jobs: {
        Args: { p_limit?: number; p_run_id?: string }
        Returns: {
          attempts: number
          claimed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          last_error: string | null
          organization_id: string
          run_id: string
          source_last_message_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "mia_open_conversation_analysis_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clear_provider_cooldown: {
        Args: { p_connection_id: string; p_provider: string }
        Returns: undefined
      }
      configure_platform_worker_dispatcher: {
        Args: { p_anon_key: string; p_project_url: string }
        Returns: undefined
      }
      count_voice_campaign_audience: {
        Args: { p_exclusions: Json; p_filters: Json; p_org: string }
        Returns: {
          audience: number
          excluded: number
          will_receive: number
        }[]
      }
      create_agent_booking_guarded: {
        Args: {
          p_color: string
          p_create_meet: boolean
          p_description: string
          p_end_time: string
          p_event_type_id: string
          p_guest_email: string
          p_guest_name: string
          p_guest_phone: string
          p_host_user_id: string
          p_lead_id: string
          p_location: string
          p_metadata: Json
          p_organization_id: string
          p_product_id: string
          p_start_time: string
          p_timezone: string
          p_title: string
        }
        Returns: {
          booking_request_id: string
          calendar_event_id: string
          status: string
        }[]
      }
      create_onboarding_link: {
        Args: {
          _force_reopen?: boolean
          _organization_id: string
          _ttl_days?: number
        }
        Returns: {
          expires_at: string
          submission_id: string
          token: string
        }[]
      }
      create_product_tag_package: {
        Args: {
          p_organization_id: string
          p_product_id: string
          p_product_label: string
        }
        Returns: Json
      }
      deactivate_organization: {
        Args: { _org_id: string; _reason?: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_lead_cascade: { Args: { _lead_ids: string[] }; Returns: Json }
      delete_product_safe: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      delete_team_member: { Args: { p_user_id: string }; Returns: undefined }
      dispatch_due_platform_workers: {
        Args: { p_max_dispatches?: number }
        Returns: number
      }
      dispatch_mia_chat_schedule_worker: { Args: never; Returns: undefined }
      distribute_lead: {
        Args: {
          p_lead_id: string
          p_organization_id: string
          p_product_id?: string
          p_squad_id: string
        }
        Returns: string
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      emit_journey_event: {
        Args: {
          p_actor_id?: string
          p_actor_type?: string
          p_agent_id?: string
          p_channel?: string
          p_conversation_id?: string
          p_correlation_id?: string
          p_deal_id?: string
          p_dedupe_key?: string
          p_description?: string
          p_event_category?: Database["public"]["Enums"]["journey_event_category"]
          p_event_type: Database["public"]["Enums"]["journey_event_type"]
          p_lead_id?: string
          p_occurred_at?: string
          p_organization_id: string
          p_payload?: Json
          p_pipeline_stage_id?: string
          p_product_id?: string
          p_session_id?: string
          p_source?: string
          p_source_module?: string
          p_subject_id: string
          p_subject_type: string
          p_title?: string
          p_user_id?: string
        }
        Returns: string
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_mia_agent_learning: {
        Args: { p_agent_id: string }
        Returns: number
      }
      ensure_platform_bootstrap: {
        Args: { p_anon_key?: string; p_project_url?: string }
        Returns: Json
      }
      evaluate_routing_rules: {
        Args: {
          p_channel?: string
          p_deal_value?: number
          p_event?: string
          p_lead_id?: string
          p_organization_id: string
          p_product_id?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          agent_id: string
          display_name: string
          role: string
          rule_id: string
          specialist_id: string
        }[]
      }
      exec_finalize_campaign_targets: {
        Args: {
          p_conv_ids: string[]
          p_errors: string[]
          p_ids: string[]
          p_queue_ids: string[]
          p_sent_ats: string[]
          p_statuses: string[]
        }
        Returns: number
      }
      finalize_invitation_acceptance: {
        Args: { p_attempt_id: string; p_token: string; p_user_id: string }
        Returns: Json
      }
      get_ai_usage_by_key: {
        Args: {
          p_end: string
          p_limit?: number
          p_provider?: string
          p_start: string
        }
        Returns: {
          calls: number
          key_label: string
          platform_key_id: string
          provider: string
          total_tokens: number
        }[]
      }
      get_ai_usage_by_model: {
        Args: {
          p_end: string
          p_limit?: number
          p_org_id?: string
          p_provider?: string
          p_start: string
        }
        Returns: {
          calls: number
          completion_tokens: number
          model: string
          prompt_tokens: number
          provider: string
          total_tokens: number
        }[]
      }
      get_ai_usage_by_org: {
        Args: {
          p_end: string
          p_limit?: number
          p_provider?: string
          p_start: string
        }
        Returns: {
          calls: number
          completion_tokens: number
          org_name: string
          organization_id: string
          prompt_tokens: number
          total_tokens: number
        }[]
      }
      get_ai_usage_summary: {
        Args: {
          p_end: string
          p_org_id?: string
          p_provider?: string
          p_start: string
        }
        Returns: {
          by_provider: Json
          total_calls: number
          total_completion_tokens: number
          total_prompt_tokens: number
          total_tokens: number
          unique_orgs: number
        }[]
      }
      get_ai_usage_timeseries: {
        Args: {
          p_end: string
          p_org_id?: string
          p_provider?: string
          p_start: string
        }
        Returns: {
          calls: number
          day: string
          provider: string
          total_tokens: number
        }[]
      }
      get_auth_user_id_by_email: { Args: { _email: string }; Returns: string }
      get_booking_by_token: {
        Args: { p_token: string }
        Returns: {
          additional_info: Json
          calendar_event_id: string
          cancellation_reason: string
          confirmation_token: string
          created_at: string
          end_time: string
          event_type_id: string
          guest_email: string
          guest_name: string
          guest_phone: string
          host_user_id: string
          id: string
          organization_id: string
          start_time: string
          status: string
          timezone: string
        }[]
      }
      get_campaign_stats_for_org: {
        Args: { p_org: string }
        Returns: {
          campaign_id: string
          cnt: number
          status: string
        }[]
      }
      get_campaign_target_counts: {
        Args: { p_campaign: string }
        Returns: {
          cnt: number
          status: string
        }[]
      }
      get_followup_panel_stats: {
        Args: { p_agent_id?: string; p_from?: string; p_to?: string }
        Returns: Json
      }
      get_invitation_by_token: { Args: { p_token: string }; Returns: Json }
      get_or_create_first_access_onboarding: {
        Args: never
        Returns: {
          organization_id: string
          payload: Json
          status: string
          submission_id: string
        }[]
      }
      get_or_create_meta_master_key: { Args: never; Returns: string }
      get_org_ai_tokens_status: {
        Args: { p_org_id: string }
        Returns: {
          allow_platform_ai: boolean
          bonus: number
          included: number
          period_start: string
          used: number
        }[]
      }
      get_organization_effective_limits: {
        Args: { p_org_id: string }
        Returns: Json
      }
      get_product_performance: {
        Args: { p_from?: string; p_org_id: string; p_to?: string }
        Returns: Json
      }
      get_products_stats: {
        Args: { _organization_id: string }
        Returns: {
          product_id: string
          sellers_count: number
          total_leads: number
          won_count: number
          won_value: number
        }[]
      }
      get_user_organization: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_sector_access: {
        Args: { _sector_id: string; _user_id: string }
        Returns: boolean
      }
      inbox_count_conversations: {
        Args: {
          p_agent_ids?: string[]
          p_assigned_user_ids?: string[]
          p_channel?: string
          p_channels?: string[]
          p_evolution_ids?: string[]
          p_include_no_product?: boolean
          p_include_no_sector?: boolean
          p_include_unassigned?: boolean
          p_instagram_ids?: string[]
          p_meta_ids?: string[]
          p_product_ids?: string[]
          p_search?: string
          p_sector_ids?: string[]
          p_tag_ids?: string[]
          p_user_id: string
        }
        Returns: {
          agents: number
          attending: number
          resolved: number
          waiting: number
        }[]
      }
      inbox_list_conversations: {
        Args: {
          p_agent_ids?: string[]
          p_assigned_user_ids?: string[]
          p_channel?: string
          p_channels?: string[]
          p_cursor_last_message_at?: string
          p_evolution_ids?: string[]
          p_include_no_product?: boolean
          p_include_no_sector?: boolean
          p_include_unassigned?: boolean
          p_instagram_ids?: string[]
          p_limit?: number
          p_meta_ids?: string[]
          p_product_ids?: string[]
          p_search?: string
          p_sector_ids?: string[]
          p_tab?: string
          p_tag_ids?: string[]
          p_user_id: string
        }
        Returns: {
          accepted_at: string
          accepted_by: string
          assigned_user_avatar: string
          assigned_user_id: string
          assigned_user_name: string
          channel: string
          closed_at: string
          created_at: string
          current_agent_avatar: string
          current_agent_id: string
          current_agent_name: string
          effective_product_id: string
          effective_product_name: string
          evolution_instance_id: string
          id: string
          instagram_connection_id: string
          last_message_at: string
          last_message_content: string
          last_message_created_at: string
          last_message_metadata: Json
          last_message_sender_type: string
          lead_email: string
          lead_id: string
          lead_name: string
          lead_phone: string
          lead_product_id: string
          meta_connection_id: string
          needs_human: boolean
          organization_id: string
          product_id: string
          sector_color: string
          sector_id: string
          sector_name: string
          status: string
          unread_count_agents: number
          updated_at: string
          visitor_avatar_url: string
          visitor_email: string
          visitor_id: string
          visitor_name: string
          visitor_phone: string
          visitor_whatsapp: string
          widget_id: string
          widget_name: string
          widget_primary_color: string
          widget_product_id: string
        }[]
      }
      increment_form_submissions_count: {
        Args: { p_form_id: string }
        Returns: undefined
      }
      increment_form_views: { Args: { p_form_id: string }; Returns: undefined }
      increment_funnel_leads: {
        Args: { p_channel: string; p_funnel_id: string }
        Returns: undefined
      }
      increment_funnel_views: {
        Args: { p_channel: string; p_funnel_id: string }
        Returns: undefined
      }
      increment_webhook_requests: {
        Args: { p_webhook_id: string }
        Returns: undefined
      }
      initialize_user_permissions: {
        Args: { p_organization_id: string; p_role?: string; p_user_id: string }
        Returns: undefined
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_system_initialized: { Args: never; Returns: boolean }
      is_within_24h_window: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      is_within_business_hours: { Args: { p_org_id: string }; Returns: boolean }
      link_user_to_organization: {
        Args: {
          p_email: string
          p_organization_id: string
          p_role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: Json
      }
      list_my_organizations: {
        Args: never
        Returns: {
          is_active: boolean
          is_default: boolean
          logo_url: string
          name: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      log_journey_event: {
        Args: {
          p_agent?: string
          p_category: string
          p_channel?: string
          p_conversation?: string
          p_deal?: string
          p_description?: string
          p_lead: string
          p_occurred?: string
          p_org: string
          p_payload?: Json
          p_product?: string
          p_source?: string
          p_stage?: string
          p_title?: string
          p_type: string
          p_user?: string
        }
        Returns: string
      }
      mark_password_changed: { Args: never; Returns: undefined }
      mark_super_admin_password_changed: { Args: never; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      next_mia_chat_schedule_run: {
        Args: {
          p_cadence: string
          p_from?: string
          p_local_time: string
          p_run_at: string
          p_timezone: string
          p_weekdays: number[]
        }
        Returns: string
      }
      normalize_phone_br: { Args: { p: string }; Returns: string }
      organization_has_mia: { Args: { p_org_id: string }; Returns: boolean }
      pick_mia_ai_key: {
        Args: { p_strategy?: string }
        Returns: {
          api_key_encrypted: string
          id: string
          label: string
          model_default: string
          provider: string
          purpose: string
        }[]
      }
      pick_platform_ai_key: {
        Args: { p_provider: string; p_strategy?: string }
        Returns: {
          api_key_encrypted: string
          id: string
          label: string
          model_default: string
          provider: string
        }[]
      }
      pick_prompt_variant: {
        Args: { p_experiment_id: string; p_seed: string }
        Returns: {
          label: string
          prompt_mode: string
          prompt_override: string
          variant_id: string
        }[]
      }
      platform_health_report: { Args: never; Returns: Json }
      platform_worker_backlog_count: {
        Args: { p_org_id?: string; p_worker_key: string }
        Returns: number
      }
      platform_worker_control_overview: { Args: never; Returns: Json }
      platform_worker_pending_count: {
        Args: { p_org_id?: string; p_worker_key: string }
        Returns: number
      }
      process_pending_queue: {
        Args: { p_user_id: string }
        Returns: {
          assigned_lead_id: string
          assigned_squad_id: string
        }[]
      }
      promote_self_to_super_admin: { Args: never; Returns: Json }
      publish_mia_agent_learning_candidate: {
        Args: { p_candidate_id: string }
        Returns: string
      }
      purge_internal_history: { Args: never; Returns: undefined }
      reactivate_organization: { Args: { _org_id: string }; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reconcile_remix_database_contract: { Args: never; Returns: Json }
      record_variant_impression: {
        Args: { p_variant_id: string }
        Returns: undefined
      }
      record_variant_score: {
        Args: { p_score: number; p_variant_id: string }
        Returns: undefined
      }
      regenerate_tracking_key: { Args: { p_org_id: string }; Returns: string }
      release_bot_lock: { Args: { p_conv: string }; Returns: undefined }
      release_conversation_lock_token: {
        Args: { p_conv: string; p_lock_token: string }
        Returns: boolean
      }
      release_invitation_processing: {
        Args: { p_attempt_id: string; p_error_code?: string; p_token: string }
        Returns: boolean
      }
      remix_database_contract: { Args: never; Returns: Json }
      remove_lifecycle_tags_on_event: {
        Args: {
          p_event_type: string
          p_lead_id: string
          p_organization_id?: string
          p_product_id?: string
        }
        Returns: {
          action: string
          tag_id: string
        }[]
      }
      report_provider_failure: {
        Args: { p_connection_id: string; p_provider: string; p_reason: string }
        Returns: Json
      }
      report_provider_success: {
        Args: { p_connection_id: string; p_provider: string }
        Returns: undefined
      }
      reschedule_booking_by_token: {
        Args: { p_new_start_time: string; p_timezone: string; p_token: string }
        Returns: Json
      }
      reset_bot_loop: { Args: { _conversation_id: string }; Returns: boolean }
      reset_monthly_webhook_requests: { Args: never; Returns: undefined }
      resolve_click_attribution: {
        Args: { p_lead_id: string }
        Returns: string
      }
      revive_ai_for_conversation: {
        Args: { p_agent_id: string; p_conversation_id: string }
        Returns: undefined
      }
      revoke_onboarding_link: {
        Args: { _submission_id: string }
        Returns: undefined
      }
      rpc_marketing_best_of: {
        Args: { _from: string; _org: string; _until: string }
        Returns: {
          kind: string
          label: string
          metric: string
          value: number
        }[]
      }
      rpc_marketing_conversion_options: {
        Args: { p_org_id: string }
        Returns: {
          category: string
          count_30d: number
          external_id: string
          id: string
          is_primary: boolean
          kind: string
          mapped_stage_id: string
          name: string
          pixel_id: string
          value_30d: number
        }[]
      }
      rpc_marketing_conversion_performance: {
        Args: {
          p_action_type: string
          p_entity_type: string
          p_from: string
          p_org_id: string
          p_to: string
        }
        Returns: {
          cost_per_conversion: number
          count: number
          entity_external_id: string
          roas: number
          spend: number
          value: number
        }[]
      }
      save_onboarding_draft: {
        Args: { _payload: Json; _submission_id: string }
        Returns: undefined
      }
      save_onboarding_draft_public: {
        Args: { _payload: Json; _session_token: string; _token: string }
        Returns: undefined
      }
      search_catalog_smart: {
        Args: {
          p_attribute_filters?: Json
          p_limit?: number
          p_organization_id: string
          p_price_max?: number
          p_price_min?: number
          p_product_id?: string
          p_query?: string
          p_tags?: string[]
        }
        Returns: {
          attributes: Json
          currency: string
          description: string
          documents: Json
          id: string
          images: Json
          match_score: number
          match_strategy: string
          price: number
          tags: string[]
          thumbnail_url: string
          title: string
          url: string
          videos: Json
        }[]
      }
      search_lead_memory: {
        Args: {
          p_lead_id: string
          p_match_count?: number
          p_min_similarity?: number
          p_query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          importance_score: number
          metadata: Json
          role: string
          similarity: number
          source: string
        }[]
      }
      search_mia_knowledge: {
        Args: {
          p_category?: string
          p_embedding: string
          p_limit?: number
          p_org_id: string
        }
        Returns: {
          category: string
          confidence: number
          content: string
          evidence: Json
          id: string
          metrics: Json
          occurrences: number
          similarity: number
          title: string
        }[]
      }
      set_manual_lead_form: { Args: { _form_id: string }; Returns: undefined }
      set_organization_worker_paused: {
        Args: {
          p_org_id: string
          p_paused: boolean
          p_reason?: string
          p_worker_key: string
        }
        Returns: undefined
      }
      set_platform_worker_enabled: {
        Args: { p_enabled: boolean; p_worker_key: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_onboarding: {
        Args: { _ip?: string; _submission_id: string; _ua?: string }
        Returns: undefined
      }
      submit_onboarding_public: {
        Args: {
          _ip?: string
          _session_token: string
          _token: string
          _ua?: string
        }
        Returns: {
          submission_id: string
        }[]
      }
      sweep_stale_voice_calls: {
        Args: never
        Returns: {
          closed_call_logs: number
          closed_sessions: number
        }[]
      }
      switch_active_organization: {
        Args: { target_org_id: string }
        Returns: Json
      }
      transfer_conversation_to_user: {
        Args: {
          p_conversation_id: string
          p_evolution_instance_id?: string
          p_internal_note?: string
          p_to_user_id: string
        }
        Returns: Json
      }
      try_acquire_conversation_lock: {
        Args: { p_conv: string; p_ttl_ms?: number }
        Returns: boolean
      }
      try_acquire_conversation_lock_token: {
        Args: { p_conv: string; p_ttl_ms?: number }
        Returns: string
      }
      try_lock_bot: {
        Args: { p_conv: string; p_ttl_seconds?: number }
        Returns: boolean
      }
      unset_manual_lead_form: { Args: { _form_id: string }; Returns: undefined }
      update_tracking_settings: {
        Args: { p_org_id: string; p_settings: Json }
        Returns: Json
      }
      user_belongs_to_organization: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      user_in_sector_organization: {
        Args: { _sector_id: string; _user_id: string }
        Returns: boolean
      }
      user_sector_ids: { Args: { _user_id: string }; Returns: string[] }
      validate_onboarding_token: {
        Args: {
          _ip?: string
          _session_token?: string
          _token: string
          _ua?: string
        }
        Returns: {
          organization_id: string
          payload: Json
          session_token: string
          status: string
          submission_id: string
        }[]
      }
      voice_call_kpis: {
        Args: { p_from: string; p_org: string; p_to: string }
        Returns: {
          avg_seconds: number
          calls_completed: number
          calls_started: number
          cost_usd: number
          interest_clicks: number
          leads_captured: number
          leads_new: number
          link_clicks: number
          schedules: number
          total_seconds: number
          views_total: number
          views_unique: number
          whatsapp_clicks: number
        }[]
      }
      voice_call_trend: {
        Args: { p_from: string; p_org: string; p_to: string }
        Returns: {
          calls: number
          cost_usd: number
          day: string
          minutes: number
          schedules: number
          views: number
        }[]
      }
      voice_call_usage_by_dim: {
        Args: { p_dim: string; p_from: string; p_org: string; p_to: string }
        Returns: {
          calls: number
          cost_grok: number
          cost_openai: number
          cost_total: number
          key: string
          label: string
          minutes: number
        }[]
      }
      voice_call_usage_by_month: {
        Args: { p_org: string }
        Returns: {
          audio_sec_in: number
          audio_sec_out: number
          calls: number
          cost_grok: number
          cost_openai: number
          cost_total: number
          minutes: number
          month: string
          tokens_in: number
          tokens_out: number
        }[]
      }
      wc_ctx_is_admin: { Args: never; Returns: boolean }
      wc_ctx_is_super: { Args: never; Returns: boolean }
      wc_ctx_org: { Args: never; Returns: string }
      wc_ctx_perm: { Args: { _perm: string }; Returns: boolean }
      wc_ctx_sectors: { Args: never; Returns: string[] }
      worker_org_enabled: {
        Args: { p_org_id: string; p_worker_key: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "seller" | "super_admin"
      interaction_channel:
        | "whatsapp"
        | "email"
        | "phone"
        | "instagram"
        | "telegram"
        | "other"
      journey_actor_type: "human" | "ai" | "system" | "external"
      journey_event_category:
        | "origin"
        | "contact"
        | "attendance"
        | "qualification"
        | "opportunity"
        | "meeting"
        | "proposal"
        | "negotiation"
        | "sale"
        | "post_sale"
        | "system"
      journey_event_type:
        | "lead_created"
        | "lead_updated"
        | "lead_assigned"
        | "lead_transferred"
        | "lead_archived"
        | "lead_reopened"
        | "lead_qualified"
        | "lead_disqualified"
        | "temperature_changed"
        | "tag_added"
        | "tag_removed"
        | "field_changed"
        | "first_conversation"
        | "first_message_in"
        | "first_reply_out"
        | "human_reply"
        | "ai_reply"
        | "conversation_accepted"
        | "conversation_transferred"
        | "conversation_archived"
        | "conversation_reopened"
        | "message_scheduled"
        | "message_sent"
        | "message_read"
        | "call_made"
        | "opportunity_created"
        | "pipeline_changed"
        | "stage_changed"
        | "meeting_created"
        | "meeting_confirmed"
        | "meeting_cancelled"
        | "task_created"
        | "task_completed"
        | "followup_created"
        | "followup_done"
        | "proposal_created"
        | "proposal_sent"
        | "proposal_viewed"
        | "pix_generated"
        | "pix_paid"
        | "checkout_created"
        | "sale_completed"
        | "post_sale_started"
        | "customer_lost"
        | "customer_reactivated"
        | "campaign_identified"
        | "meta_ctwa_received"
        | "meta_click_received"
        | "ad_click_received"
        | "session_started"
        | "session_ended"
        | "owner_changed"
        | "cadence_enrolled"
        | "cadence_step_sent"
        | "cadence_completed"
        | "wa_template_sent"
        | "wa_window_expired"
        | "ai_handoff"
        | "human_handoff"
        | "agent_tool_executed"
        | "sale_cancelled"
        | "sale_refunded"
        | "commission_created"
        | "lead_attributed"
        | "meta_capi_sent"
      lead_temperature: "hot" | "warm" | "cold"
      notification_type:
        | "cadence"
        | "urgency"
        | "opportunity"
        | "audit"
        | "system"
      product_status: "draft" | "review" | "published" | "archived"
      sector_rotation_strategy: "round_robin" | "least_busy" | "random"
      support_ticket_priority: "low" | "normal" | "high" | "urgent"
      support_ticket_status: "open" | "in_progress" | "resolved" | "closed"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "pending" | "in_progress" | "completed" | "overdue"
      webchat_conversation_status:
        | "bot_active"
        | "waiting_human"
        | "human_active"
        | "closed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "manager", "seller", "super_admin"],
      interaction_channel: [
        "whatsapp",
        "email",
        "phone",
        "instagram",
        "telegram",
        "other",
      ],
      journey_actor_type: ["human", "ai", "system", "external"],
      journey_event_category: [
        "origin",
        "contact",
        "attendance",
        "qualification",
        "opportunity",
        "meeting",
        "proposal",
        "negotiation",
        "sale",
        "post_sale",
        "system",
      ],
      journey_event_type: [
        "lead_created",
        "lead_updated",
        "lead_assigned",
        "lead_transferred",
        "lead_archived",
        "lead_reopened",
        "lead_qualified",
        "lead_disqualified",
        "temperature_changed",
        "tag_added",
        "tag_removed",
        "field_changed",
        "first_conversation",
        "first_message_in",
        "first_reply_out",
        "human_reply",
        "ai_reply",
        "conversation_accepted",
        "conversation_transferred",
        "conversation_archived",
        "conversation_reopened",
        "message_scheduled",
        "message_sent",
        "message_read",
        "call_made",
        "opportunity_created",
        "pipeline_changed",
        "stage_changed",
        "meeting_created",
        "meeting_confirmed",
        "meeting_cancelled",
        "task_created",
        "task_completed",
        "followup_created",
        "followup_done",
        "proposal_created",
        "proposal_sent",
        "proposal_viewed",
        "pix_generated",
        "pix_paid",
        "checkout_created",
        "sale_completed",
        "post_sale_started",
        "customer_lost",
        "customer_reactivated",
        "campaign_identified",
        "meta_ctwa_received",
        "meta_click_received",
        "ad_click_received",
        "session_started",
        "session_ended",
        "owner_changed",
        "cadence_enrolled",
        "cadence_step_sent",
        "cadence_completed",
        "wa_template_sent",
        "wa_window_expired",
        "ai_handoff",
        "human_handoff",
        "agent_tool_executed",
        "sale_cancelled",
        "sale_refunded",
        "commission_created",
        "lead_attributed",
        "meta_capi_sent",
      ],
      lead_temperature: ["hot", "warm", "cold"],
      notification_type: [
        "cadence",
        "urgency",
        "opportunity",
        "audit",
        "system",
      ],
      product_status: ["draft", "review", "published", "archived"],
      sector_rotation_strategy: ["round_robin", "least_busy", "random"],
      support_ticket_priority: ["low", "normal", "high", "urgent"],
      support_ticket_status: ["open", "in_progress", "resolved", "closed"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["pending", "in_progress", "completed", "overdue"],
      webchat_conversation_status: [
        "bot_active",
        "waiting_human",
        "human_active",
        "closed",
      ],
    },
  },
} as const
