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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: string
          actual_minutes: number
          archived_at: string | null
          client_id: string
          client_team_update: string | null
          counts_toward_kpi: boolean
          coverage_last_checked_at: string | null
          coverage_last_checked_by: string | null
          coverage_last_checked_by_name: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          editor_deadline: string | null
          editorial_content_type: string | null
          editorial_priority:
            | Database["public"]["Enums"]["editorial_priority"]
            | null
          editorial_stage: Database["public"]["Enums"]["editorial_stage"] | null
          end_date: string | null
          entry_type: Database["public"]["Enums"]["entry_type"] | null
          estimated_minutes: number
          id: string
          internal_deadline: string | null
          is_archived: boolean
          is_deleted: boolean | null
          journalist: string | null
          kpis: number | null
          month: string
          next_deadline: string | null
          next_deadline_owner_id: string | null
          next_deadline_owner_name: string | null
          next_deadline_owner_type: string | null
          next_steps: string | null
          organisation_id: string
          owner_id: string | null
          publication: string | null
          recurrence: Database["public"]["Enums"]["activity_recurrence"]
          recurrence_custom: string | null
          show_on_editorial_board: boolean
          start_date: string | null
          status: Database["public"]["Enums"]["activity_status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          activity_type: string
          actual_minutes?: number
          archived_at?: string | null
          client_id: string
          client_team_update?: string | null
          counts_toward_kpi?: boolean
          coverage_last_checked_at?: string | null
          coverage_last_checked_by?: string | null
          coverage_last_checked_by_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          editor_deadline?: string | null
          editorial_content_type?: string | null
          editorial_priority?:
            | Database["public"]["Enums"]["editorial_priority"]
            | null
          editorial_stage?:
            | Database["public"]["Enums"]["editorial_stage"]
            | null
          end_date?: string | null
          entry_type?: Database["public"]["Enums"]["entry_type"] | null
          estimated_minutes?: number
          id?: string
          internal_deadline?: string | null
          is_archived?: boolean
          is_deleted?: boolean | null
          journalist?: string | null
          kpis?: number | null
          month: string
          next_deadline?: string | null
          next_deadline_owner_id?: string | null
          next_deadline_owner_name?: string | null
          next_deadline_owner_type?: string | null
          next_steps?: string | null
          organisation_id: string
          owner_id?: string | null
          publication?: string | null
          recurrence?: Database["public"]["Enums"]["activity_recurrence"]
          recurrence_custom?: string | null
          show_on_editorial_board?: boolean
          start_date?: string | null
          status?: Database["public"]["Enums"]["activity_status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          activity_type?: string
          actual_minutes?: number
          archived_at?: string | null
          client_id?: string
          client_team_update?: string | null
          counts_toward_kpi?: boolean
          coverage_last_checked_at?: string | null
          coverage_last_checked_by?: string | null
          coverage_last_checked_by_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          editor_deadline?: string | null
          editorial_content_type?: string | null
          editorial_priority?:
            | Database["public"]["Enums"]["editorial_priority"]
            | null
          editorial_stage?:
            | Database["public"]["Enums"]["editorial_stage"]
            | null
          end_date?: string | null
          entry_type?: Database["public"]["Enums"]["entry_type"] | null
          estimated_minutes?: number
          id?: string
          internal_deadline?: string | null
          is_archived?: boolean
          is_deleted?: boolean | null
          journalist?: string | null
          kpis?: number | null
          month?: string
          next_deadline?: string | null
          next_deadline_owner_id?: string | null
          next_deadline_owner_name?: string | null
          next_deadline_owner_type?: string | null
          next_steps?: string | null
          organisation_id?: string
          owner_id?: string | null
          publication?: string | null
          recurrence?: Database["public"]["Enums"]["activity_recurrence"]
          recurrence_custom?: string | null
          show_on_editorial_board?: boolean
          start_date?: string | null
          status?: Database["public"]["Enums"]["activity_status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_coverage_last_checked_by_fkey"
            columns: ["coverage_last_checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_history: {
        Row: {
          activity_id: string
          created_at: string | null
          entry_type: string | null
          id: string
          note: string
          user_id: string | null
        }
        Insert: {
          activity_id: string
          created_at?: string | null
          entry_type?: string | null
          id?: string
          note: string
          user_id?: string | null
        }
        Update: {
          activity_id?: string
          created_at?: string | null
          entry_type?: string | null
          id?: string
          note?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_history_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_time_settings: {
        Row: {
          action_seconds: Json
          enabled: boolean
          organisation_id: string
          updated_at: string | null
        }
        Insert: {
          action_seconds?: Json
          enabled?: boolean
          organisation_id: string
          updated_at?: string | null
        }
        Update: {
          action_seconds?: Json
          enabled?: boolean
          organisation_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_time_settings_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_day_rates: {
        Row: {
          created_at: string
          created_by: string | null
          day_rate: number
          effective_from: string
          effective_to: string | null
          id: string
          note: string | null
          organisation_id: string
          region: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_rate?: number
          effective_from: string
          effective_to?: string | null
          id?: string
          note?: string | null
          organisation_id: string
          region: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_rate?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          note?: string | null
          organisation_id?: string
          region?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_day_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_day_rates_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          activity_id: string
          added_by: string | null
          created_at: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          id: string
          label: string | null
          storage_path: string | null
          url: string
        }
        Insert: {
          activity_id: string
          added_by?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          label?: string | null
          storage_path?: string | null
          url: string
        }
        Update: {
          activity_id?: string
          added_by?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          label?: string | null
          storage_path?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billed_days: {
        Row: {
          client_id: string
          days: number
          id: string
          period: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_id: string
          days: number
          id?: string
          period: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          days?: number
          id?: string
          period?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billed_days_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billed_days_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_baseline_allocations: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          member_id: string | null
          minutes: number
          organisation_id: string
          team: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          member_id?: string | null
          minutes?: number
          organisation_id: string
          team: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          member_id?: string | null
          minutes?: number
          organisation_id?: string
          team?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_baseline_allocations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_baseline_allocations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_baseline_allocations_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_idea_links: {
        Row: {
          added_by: string | null
          created_at: string | null
          id: string
          idea_id: string
          label: string | null
          link_type: string | null
          url: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          id?: string
          idea_id: string
          label?: string | null
          link_type?: string | null
          url: string
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          id?: string
          idea_id?: string
          label?: string | null
          link_type?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_idea_links_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_idea_links_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "client_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      client_idea_notes: {
        Row: {
          added_by: string | null
          content: string
          created_at: string | null
          id: string
          idea_id: string
        }
        Insert: {
          added_by?: string | null
          content: string
          created_at?: string | null
          id?: string
          idea_id: string
        }
        Update: {
          added_by?: string | null
          content?: string
          created_at?: string | null
          id?: string
          idea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_idea_notes_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_idea_notes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "client_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ideas: {
        Row: {
          added_by: string | null
          category: string | null
          client_id: string
          created_at: string | null
          detail: string | null
          id: string
          priority: string | null
          status: string | null
          title: string
        }
        Insert: {
          added_by?: string | null
          category?: string | null
          client_id: string
          created_at?: string | null
          detail?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          title: string
        }
        Update: {
          added_by?: string | null
          category?: string | null
          client_id?: string
          created_at?: string | null
          detail?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ideas_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ideas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_members: {
        Row: {
          client_id: string
          created_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_lead_id: string | null
          billing_type: string
          boilerplate: string | null
          color: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          contracted_minutes_per_month: number | null
          contracted_minutes_per_quarter: number | null
          created_at: string | null
          id: string
          is_archived: boolean | null
          monthly_kpis: number | null
          monthly_retainer_fee: number
          name: string
          organisation_id: string
          project_budget_minutes: number | null
          rate_region: string
          retainer_days: number | null
          sector: string | null
          strategy_lead_id: string | null
          tagline: string | null
          target_audience: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          account_lead_id?: string | null
          billing_type?: string
          boilerplate?: string | null
          color?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          contracted_minutes_per_month?: number | null
          contracted_minutes_per_quarter?: number | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          monthly_kpis?: number | null
          monthly_retainer_fee?: number
          name: string
          organisation_id: string
          project_budget_minutes?: number | null
          rate_region?: string
          retainer_days?: number | null
          sector?: string | null
          strategy_lead_id?: string | null
          tagline?: string | null
          target_audience?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          account_lead_id?: string | null
          billing_type?: string
          boilerplate?: string | null
          color?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          contracted_minutes_per_month?: number | null
          contracted_minutes_per_quarter?: number | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          monthly_kpis?: number | null
          monthly_retainer_fee?: number
          name?: string
          organisation_id?: string
          project_budget_minutes?: number | null
          rate_region?: string
          retainer_days?: number | null
          sector?: string | null
          strategy_lead_id?: string | null
          tagline?: string | null
          target_audience?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_account_lead_id_fkey"
            columns: ["account_lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_strategy_lead_id_fkey"
            columns: ["strategy_lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_links: {
        Row: {
          added_by: string | null
          client_id: string
          created_at: string | null
          id: string
          label: string | null
          month: string
          url: string
        }
        Insert: {
          added_by?: string | null
          client_id: string
          created_at?: string | null
          id?: string
          label?: string | null
          month: string
          url: string
        }
        Update: {
          added_by?: string | null
          client_id?: string
          created_at?: string | null
          id?: string
          label?: string | null
          month?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_links_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_app: {
        Row: {
          chunk: string
          ord: number
        }
        Insert: {
          chunk: string
          ord: number
        }
        Update: {
          chunk?: string
          ord?: number
        }
        Relationships: []
      }
      geo_brands: {
        Row: {
          archived: boolean
          audience: string | null
          created_at: string
          engine_weights: Json
          id: string
          is_client: boolean
          metric_weights: Json
          name: string
          objective: string | null
          positioning: string | null
          pr_expectations: string | null
          pr_journey: string | null
          pr_newsworthy: string | null
          pr_objectives: string | null
          pr_persona: string | null
          pr_region: string | null
          pr_research_budget: boolean
          sector: string | null
          themes: string | null
          website: string | null
        }
        Insert: {
          archived?: boolean
          audience?: string | null
          created_at?: string
          engine_weights?: Json
          id?: string
          is_client?: boolean
          metric_weights?: Json
          name: string
          objective?: string | null
          positioning?: string | null
          pr_expectations?: string | null
          pr_journey?: string | null
          pr_newsworthy?: string | null
          pr_objectives?: string | null
          pr_persona?: string | null
          pr_region?: string | null
          pr_research_budget?: boolean
          sector?: string | null
          themes?: string | null
          website?: string | null
        }
        Update: {
          archived?: boolean
          audience?: string | null
          created_at?: string
          engine_weights?: Json
          id?: string
          is_client?: boolean
          metric_weights?: Json
          name?: string
          objective?: string | null
          positioning?: string | null
          pr_expectations?: string | null
          pr_journey?: string | null
          pr_newsworthy?: string | null
          pr_objectives?: string | null
          pr_persona?: string | null
          pr_region?: string | null
          pr_research_budget?: boolean
          sector?: string | null
          themes?: string | null
          website?: string | null
        }
        Relationships: []
      }
      geo_competitor_sov: {
        Row: {
          id: string
          mentions: number
          player: string
          run_id: string
        }
        Insert: {
          id?: string
          mentions?: number
          player: string
          run_id: string
        }
        Update: {
          id?: string
          mentions?: number
          player?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_competitor_sov_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "geo_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_competitors: {
        Row: {
          brand_id: string
          id: string
          name: string
        }
        Insert: {
          brand_id: string
          id?: string
          name: string
        }
        Update: {
          brand_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_competitors_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "geo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_context: {
        Row: {
          brand_id: string
          content: string | null
          created_at: string
          guidance: string | null
          id: string
          kind: string
          title: string
        }
        Insert: {
          brand_id: string
          content?: string | null
          created_at?: string
          guidance?: string | null
          id?: string
          kind?: string
          title: string
        }
        Update: {
          brand_id?: string
          content?: string | null
          created_at?: string
          guidance?: string | null
          id?: string
          kind?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_context_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "geo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_media_targets: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          notes: string | null
          outlet: string
          tier: string | null
          vip: boolean
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          notes?: string | null
          outlet: string
          tier?: string | null
          vip?: boolean
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          outlet?: string
          tier?: string | null
          vip?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "geo_media_targets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "geo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_mentions: {
        Row: {
          brand_id: string
          cited: boolean
          context: string | null
          created_at: string
          found_date: string
          id: string
          sentiment: string | null
          snippet: string | null
          source: string
          theme: string | null
          url: string | null
        }
        Insert: {
          brand_id: string
          cited?: boolean
          context?: string | null
          created_at?: string
          found_date?: string
          id?: string
          sentiment?: string | null
          snippet?: string | null
          source: string
          theme?: string | null
          url?: string | null
        }
        Update: {
          brand_id?: string
          cited?: boolean
          context?: string | null
          created_at?: string
          found_date?: string
          id?: string
          sentiment?: string | null
          snippet?: string | null
          source?: string
          theme?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_mentions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "geo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_news: {
        Row: {
          brand_id: string
          created_at: string
          domain: string | null
          id: string
          kind: string
          query: string | null
          seendate: string | null
          title: string | null
          url: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          domain?: string | null
          id?: string
          kind?: string
          query?: string | null
          seendate?: string | null
          title?: string | null
          url?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          domain?: string | null
          id?: string
          kind?: string
          query?: string | null
          seendate?: string | null
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_news_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "geo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_opportunities: {
        Row: {
          ai_guidance: string | null
          brand_id: string
          effort: number
          id: string
          impact: number
          linked_gap: string | null
          optype: string | null
          owner: string | null
          sort: number
          stage: string | null
          status: string | null
          title: string
        }
        Insert: {
          ai_guidance?: string | null
          brand_id: string
          effort?: number
          id?: string
          impact?: number
          linked_gap?: string | null
          optype?: string | null
          owner?: string | null
          sort?: number
          stage?: string | null
          status?: string | null
          title: string
        }
        Update: {
          ai_guidance?: string | null
          brand_id?: string
          effort?: number
          id?: string
          impact?: number
          linked_gap?: string | null
          optype?: string | null
          owner?: string | null
          sort?: number
          stage?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_opportunities_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "geo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_pr_activity: {
        Row: {
          activity_date: string
          atype: string | null
          brand_id: string
          cited: boolean
          created_at: string
          id: string
          notes: string | null
          outlet: string
          theme: string | null
          tier: string | null
          url: string | null
        }
        Insert: {
          activity_date?: string
          atype?: string | null
          brand_id: string
          cited?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          outlet: string
          theme?: string | null
          tier?: string | null
          url?: string | null
        }
        Update: {
          activity_date?: string
          atype?: string | null
          brand_id?: string
          cited?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          outlet?: string
          theme?: string | null
          tier?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_pr_activity_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "geo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_prompts: {
        Row: {
          active: boolean
          brand_id: string
          code: string
          id: string
          ptype: string
          sort: number
          text: string
        }
        Insert: {
          active?: boolean
          brand_id: string
          code: string
          id?: string
          ptype: string
          sort?: number
          text: string
        }
        Update: {
          active?: boolean
          brand_id?: string
          code?: string
          id?: string
          ptype?: string
          sort?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_prompts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "geo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_radar_items: {
        Row: {
          batch_id: string | null
          brand_id: string
          created_at: string
          dismiss_reason: string | null
          feasibility: string | null
          geo_metric: string | null
          hook: string | null
          id: string
          idea: string | null
          impact: number | null
          owner: string | null
          rationale: string | null
          score: number | null
          status: string
          stream: string
          target_outlets: string | null
          team_rating: string | null
          title: string | null
        }
        Insert: {
          batch_id?: string | null
          brand_id: string
          created_at?: string
          dismiss_reason?: string | null
          feasibility?: string | null
          geo_metric?: string | null
          hook?: string | null
          id?: string
          idea?: string | null
          impact?: number | null
          owner?: string | null
          rationale?: string | null
          score?: number | null
          status?: string
          stream: string
          target_outlets?: string | null
          team_rating?: string | null
          title?: string | null
        }
        Update: {
          batch_id?: string | null
          brand_id?: string
          created_at?: string
          dismiss_reason?: string | null
          feasibility?: string | null
          geo_metric?: string | null
          hook?: string | null
          id?: string
          idea?: string | null
          impact?: number | null
          owner?: string | null
          rationale?: string | null
          score?: number | null
          status?: string
          stream?: string
          target_outlets?: string | null
          team_rating?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_radar_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "geo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_responses: {
        Row: {
          accuracy: string | null
          cited: string | null
          cited_pr_id: string | null
          cited_sources: string | null
          competitor_mentions: number
          confidence: string | null
          engine: string
          evidence: string | null
          id: string
          mention_rate: number | null
          mentioned: boolean
          notes: string | null
          prominence: string | null
          prompt_id: string
          run_id: string
          samples: number | null
          sentiment: string | null
        }
        Insert: {
          accuracy?: string | null
          cited?: string | null
          cited_pr_id?: string | null
          cited_sources?: string | null
          competitor_mentions?: number
          confidence?: string | null
          engine: string
          evidence?: string | null
          id?: string
          mention_rate?: number | null
          mentioned?: boolean
          notes?: string | null
          prominence?: string | null
          prompt_id: string
          run_id: string
          samples?: number | null
          sentiment?: string | null
        }
        Update: {
          accuracy?: string | null
          cited?: string | null
          cited_pr_id?: string | null
          cited_sources?: string | null
          competitor_mentions?: number
          confidence?: string | null
          engine?: string
          evidence?: string | null
          id?: string
          mention_rate?: number | null
          mentioned?: boolean
          notes?: string | null
          prominence?: string | null
          prompt_id?: string
          run_id?: string
          samples?: number | null
          sentiment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_responses_cited_pr_id_fkey"
            columns: ["cited_pr_id"]
            isOneToOne: false
            referencedRelation: "geo_pr_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geo_responses_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "geo_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geo_responses_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "geo_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_runs: {
        Row: {
          brand_id: string
          citation: number | null
          created_at: string
          id: string
          is_current: boolean
          label: string
          mention: number | null
          run_date: string
          score: number | null
          sentiment: number | null
          sov: number | null
        }
        Insert: {
          brand_id: string
          citation?: number | null
          created_at?: string
          id?: string
          is_current?: boolean
          label: string
          mention?: number | null
          run_date?: string
          score?: number | null
          sentiment?: number | null
          sov?: number | null
        }
        Update: {
          brand_id?: string
          citation?: number | null
          created_at?: string
          id?: string
          is_current?: boolean
          label?: string
          mention?: number | null
          run_date?: string
          score?: number | null
          sentiment?: number | null
          sov?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "geo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          client_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          organisation_id: string
          parent_activity_id: string | null
          parent_activity_title: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          organisation_id: string
          parent_activity_id?: string | null
          parent_activity_title?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          organisation_id?: string
          parent_activity_id?: string | null
          parent_activity_title?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_parent_activity_id_fkey"
            columns: ["parent_activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      overhead_entries: {
        Row: {
          billable_cost_per_day_snapshot: number | null
          category: string
          client_id: string
          created_at: string | null
          date: string
          id: string
          is_billable: boolean | null
          minutes: number
          month: string
          note: string | null
          organisation_id: string
          resource_team: string | null
          true_cost_per_day_snapshot: number | null
          user_id: string
        }
        Insert: {
          billable_cost_per_day_snapshot?: number | null
          category: string
          client_id: string
          created_at?: string | null
          date: string
          id?: string
          is_billable?: boolean | null
          minutes: number
          month: string
          note?: string | null
          organisation_id: string
          resource_team?: string | null
          true_cost_per_day_snapshot?: number | null
          user_id: string
        }
        Update: {
          billable_cost_per_day_snapshot?: number | null
          category?: string
          client_id?: string
          created_at?: string | null
          date?: string
          id?: string
          is_billable?: boolean | null
          minutes?: number
          month?: string
          note?: string | null
          organisation_id?: string
          resource_team?: string | null
          true_cost_per_day_snapshot?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overhead_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overhead_entries_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overhead_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auto_log_admin: boolean
          avatar_url: string | null
          billable_cost_per_day: number
          created_at: string | null
          display_name: string
          email: string
          id: string
          is_active: boolean | null
          must_change_password: boolean | null
          organisation_id: string
          resource_teams: string[]
          role: Database["public"]["Enums"]["user_role"] | null
          true_cost_per_day: number
          updated_at: string | null
          weekly_hours: number
        }
        Insert: {
          auto_log_admin?: boolean
          avatar_url?: string | null
          billable_cost_per_day?: number
          created_at?: string | null
          display_name: string
          email: string
          id: string
          is_active?: boolean | null
          must_change_password?: boolean | null
          organisation_id: string
          resource_teams?: string[]
          role?: Database["public"]["Enums"]["user_role"] | null
          true_cost_per_day?: number
          updated_at?: string | null
          weekly_hours?: number
        }
        Update: {
          auto_log_admin?: boolean
          avatar_url?: string | null
          billable_cost_per_day?: number
          created_at?: string | null
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean | null
          must_change_password?: boolean | null
          organisation_id?: string
          resource_teams?: string[]
          role?: Database["public"]["Enums"]["user_role"] | null
          true_cost_per_day?: number
          updated_at?: string | null
          weekly_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_notes: {
        Row: {
          client_id: string
          content: string | null
          id: string
          month: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_id: string
          content?: string | null
          id?: string
          month: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          content?: string | null
          id?: string
          month?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_availability: {
        Row: {
          id: string
          member_id: string
          minutes: number
          organisation_id: string
          period: string
          period_type: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          member_id: string
          minutes?: number
          organisation_id: string
          period: string
          period_type: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          member_id?: string
          minutes?: number
          organisation_id?: string
          period?: string
          period_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_availability_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_availability_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_plan_allocations: {
        Row: {
          id: string
          member_id: string
          minutes: number
          plan_id: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          member_id: string
          minutes?: number
          plan_id: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          member_id?: string
          minutes?: number
          plan_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_plan_allocations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_plan_allocations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "resource_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_plan_tasks: {
        Row: {
          activity_id: string | null
          created_at: string | null
          id: string
          plan_id: string
          position: number
          priority: string
          title: string | null
        }
        Insert: {
          activity_id?: string | null
          created_at?: string | null
          id?: string
          plan_id: string
          position?: number
          priority?: string
          title?: string | null
        }
        Update: {
          activity_id?: string | null
          created_at?: string | null
          id?: string
          plan_id?: string
          position?: number
          priority?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_plan_tasks_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_plan_tasks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "resource_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_plans: {
        Row: {
          client_id: string
          contingency_minutes: number
          created_at: string | null
          created_by: string | null
          deliverables: string | null
          id: string
          kpis: number
          organisation_id: string
          period: string
          period_type: string
          planned_minutes: number
          updated_at: string | null
        }
        Insert: {
          client_id: string
          contingency_minutes?: number
          created_at?: string | null
          created_by?: string | null
          deliverables?: string | null
          id?: string
          kpis?: number
          organisation_id: string
          period: string
          period_type: string
          planned_minutes?: number
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          contingency_minutes?: number
          created_at?: string | null
          created_by?: string | null
          deliverables?: string | null
          id?: string
          kpis?: number
          organisation_id?: string
          period?: string
          period_type?: string
          planned_minutes?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_plans_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          organisation_id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          status: Database["public"]["Enums"]["ticket_status"]
          submitted_by: string
          ticket_type: Database["public"]["Enums"]["ticket_type"]
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          organisation_id: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          submitted_by: string
          ticket_type?: Database["public"]["Enums"]["ticket_type"]
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          organisation_id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          submitted_by?: string
          ticket_type?: Database["public"]["Enums"]["ticket_type"]
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_notes: {
        Row: {
          created_at: string | null
          id: string
          note: string
          task_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          note: string
          task_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          note?: string
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_notes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_watchers: {
        Row: {
          created_at: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_watchers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_watchers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          cancelled_at: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          is_archived: boolean
          organisation_id: string
          parent_activity_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          recurrence: Database["public"]["Enums"]["task_recurrence"]
          recurrence_custom: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          cancelled_at?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_archived?: boolean
          organisation_id: string
          parent_activity_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence?: Database["public"]["Enums"]["task_recurrence"]
          recurrence_custom?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          cancelled_at?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_archived?: boolean
          organisation_id?: string
          parent_activity_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence?: Database["public"]["Enums"]["task_recurrence"]
          recurrence_custom?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_activity_id_fkey"
            columns: ["parent_activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_blocks: {
        Row: {
          auto_seconds: number | null
          billable_cost_per_day_snapshot: number | null
          category: string
          client_id: string
          created_at: string | null
          date: string
          id: string
          is_auto: boolean
          is_billable: boolean | null
          minutes: number
          month: string
          note: string | null
          organisation_id: string
          other_description: string | null
          resource_team: string | null
          true_cost_per_day_snapshot: number | null
          user_id: string
        }
        Insert: {
          auto_seconds?: number | null
          billable_cost_per_day_snapshot?: number | null
          category: string
          client_id: string
          created_at?: string | null
          date: string
          id?: string
          is_auto?: boolean
          is_billable?: boolean | null
          minutes: number
          month: string
          note?: string | null
          organisation_id: string
          other_description?: string | null
          resource_team?: string | null
          true_cost_per_day_snapshot?: number | null
          user_id: string
        }
        Update: {
          auto_seconds?: number | null
          billable_cost_per_day_snapshot?: number | null
          category?: string
          client_id?: string
          created_at?: string | null
          date?: string
          id?: string
          is_auto?: boolean
          is_billable?: boolean | null
          minutes?: number
          month?: string
          note?: string | null
          organisation_id?: string
          other_description?: string | null
          resource_team?: string | null
          true_cost_per_day_snapshot?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_blocks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          activity_id: string
          billable_cost_per_day_snapshot: number | null
          created_at: string | null
          date: string
          id: string
          is_billable: boolean | null
          minutes: number
          note: string | null
          resource_team: string | null
          true_cost_per_day_snapshot: number | null
          user_id: string
        }
        Insert: {
          activity_id: string
          billable_cost_per_day_snapshot?: number | null
          created_at?: string | null
          date: string
          id?: string
          is_billable?: boolean | null
          minutes: number
          note?: string | null
          resource_team?: string | null
          true_cost_per_day_snapshot?: number | null
          user_id: string
        }
        Update: {
          activity_id?: string
          billable_cost_per_day_snapshot?: number | null
          created_at?: string | null
          date?: string
          id?: string
          is_billable?: boolean | null
          minutes?: number
          note?: string | null
          resource_team?: string | null
          true_cost_per_day_snapshot?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      geo_delete_brand: { Args: { bid: string }; Returns: undefined }
      log_admin_time: {
        Args: { p_action_key: string; p_client_id: string }
        Returns: undefined
      }
      map_activity_type_to_team: {
        Args: { activity_type: string }
        Returns: string
      }
      map_category_to_team: { Args: { category: string }; Returns: string }
      notify_client_watchers: {
        Args: {
          p_actor: string
          p_body: string
          p_client: string
          p_link: string
          p_org: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      permanently_delete_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
      set_agency_day_rate: {
        Args: {
          p_effective_from: string
          p_note?: string
          p_rate: number
          p_region: string
        }
        Returns: string
      }
      user_org_id: { Args: never; Returns: string }
      user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      activity_recurrence:
        | "none"
        | "weekly"
        | "monthly"
        | "quarterly"
        | "custom"
      activity_status:
        | "Not Started"
        | "In Progress"
        | "Drafting"
        | "With Client"
        | "Pitching"
        | "Under Review"
        | "Submitted"
        | "Completed"
        | "Published"
        | "On Hold"
        | "Cancelled"
        | "Declined"
      editorial_priority:
        | "Critical"
        | "High"
        | "Medium"
        | "Low"
        | "Waiting on Client"
        | "Postponed"
      editorial_stage:
        | "Waiting List"
        | "Ready to Draft"
        | "WIP / Freelancer"
        | "Drafting"
        | "Under Review"
        | "Pitching"
        | "With Editor"
        | "Client Reviewing"
        | "Published"
        | "Cancelled"
      entry_type: "activity" | "opportunity"
      task_priority: "Critical" | "High" | "Medium" | "Low"
      task_recurrence:
        | "none"
        | "daily"
        | "weekly"
        | "fortnightly"
        | "monthly"
        | "quarterly"
        | "yearly"
        | "custom"
      task_status:
        | "Not Started"
        | "On it!"
        | "In Progress"
        | "Needs attention"
        | "Completed"
        | "Cancelled"
      ticket_priority: "Critical" | "High" | "Medium" | "Low"
      ticket_status: "Open" | "In Progress" | "Resolved" | "Closed"
      ticket_type: "Bug" | "Suggestion" | "Question"
      user_role:
        | "admin"
        | "manager"
        | "member"
        | "viewer"
        | "consultant"
        | "owner"
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
      activity_recurrence: ["none", "weekly", "monthly", "quarterly", "custom"],
      activity_status: [
        "Not Started",
        "In Progress",
        "Drafting",
        "With Client",
        "Pitching",
        "Under Review",
        "Submitted",
        "Completed",
        "Published",
        "On Hold",
        "Cancelled",
        "Declined",
      ],
      editorial_priority: [
        "Critical",
        "High",
        "Medium",
        "Low",
        "Waiting on Client",
        "Postponed",
      ],
      editorial_stage: [
        "Waiting List",
        "Ready to Draft",
        "WIP / Freelancer",
        "Drafting",
        "Under Review",
        "Pitching",
        "With Editor",
        "Client Reviewing",
        "Published",
        "Cancelled",
      ],
      entry_type: ["activity", "opportunity"],
      task_priority: ["Critical", "High", "Medium", "Low"],
      task_recurrence: [
        "none",
        "daily",
        "weekly",
        "fortnightly",
        "monthly",
        "quarterly",
        "yearly",
        "custom",
      ],
      task_status: [
        "Not Started",
        "On it!",
        "In Progress",
        "Needs attention",
        "Completed",
        "Cancelled",
      ],
      ticket_priority: ["Critical", "High", "Medium", "Low"],
      ticket_status: ["Open", "In Progress", "Resolved", "Closed"],
      ticket_type: ["Bug", "Suggestion", "Question"],
      user_role: [
        "admin",
        "manager",
        "member",
        "viewer",
        "consultant",
        "owner",
      ],
    },
  },
} as const
