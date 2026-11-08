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
      accounting_accounts: {
        Row: {
          account_type: string
          code: string
          created_at: string
          created_by_profile_id: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          parent_account_id: string | null
        }
        Insert: {
          account_type: string
          code: string
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          parent_account_id?: string | null
        }
        Update: {
          account_type?: string
          code?: string
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          parent_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_accounts_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_accounts_parent_same_org_fk"
            columns: ["organization_id", "parent_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      accounting_customer_source_postings: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          id: string
          idempotency_key: string
          journal_entry_id: string
          organization_id: string
          payload_fingerprint: string
          posting_kind: string
          receivable_account_id: string
          revenue_account_id: string | null
          reversal_reason: string | null
          settlement_account_id: string | null
          source_amount: number
          source_currency: string
          source_id: string
          source_type: string
          tax_account_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          idempotency_key: string
          journal_entry_id: string
          organization_id: string
          payload_fingerprint: string
          posting_kind?: string
          receivable_account_id: string
          revenue_account_id?: string | null
          reversal_reason?: string | null
          settlement_account_id?: string | null
          source_amount: number
          source_currency: string
          source_id: string
          source_type: string
          tax_account_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          idempotency_key?: string
          journal_entry_id?: string
          organization_id?: string
          payload_fingerprint?: string
          posting_kind?: string
          receivable_account_id?: string
          revenue_account_id?: string | null
          reversal_reason?: string | null
          settlement_account_id?: string | null
          source_amount?: number
          source_currency?: string
          source_id?: string
          source_type?: string
          tax_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_customer_source_po_organization_id_journal_entr_fkey"
            columns: ["organization_id", "journal_entry_id"]
            isOneToOne: true
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_customer_source_po_organization_id_receivable_a_fkey"
            columns: ["organization_id", "receivable_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_customer_source_po_organization_id_revenue_acco_fkey"
            columns: ["organization_id", "revenue_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_customer_source_po_organization_id_settlement_a_fkey"
            columns: ["organization_id", "settlement_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_customer_source_po_organization_id_tax_account__fkey"
            columns: ["organization_id", "tax_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_customer_source_postings_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_customer_source_postings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_journal_entries: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          description: string
          entry_date: string
          entry_number: number
          id: string
          idempotency_key: string
          organization_id: string
          payload_fingerprint: string
          posted_at: string | null
          posted_by_profile_id: string | null
          source_reference: string | null
          source_type: string
          status: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by_profile_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          description: string
          entry_date: string
          entry_number?: never
          id?: string
          idempotency_key: string
          organization_id: string
          payload_fingerprint: string
          posted_at?: string | null
          posted_by_profile_id?: string | null
          source_reference?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_profile_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          description?: string
          entry_date?: string
          entry_number?: never
          id?: string
          idempotency_key?: string
          organization_id?: string
          payload_fingerprint?: string
          posted_at?: string | null
          posted_by_profile_id?: string | null
          source_reference?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_journal_entries_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_entries_posted_by_profile_id_fkey"
            columns: ["posted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_entries_voided_by_profile_id_fkey"
            columns: ["voided_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          journal_entry_id: string
          line_number: number
          memo: string | null
          organization_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          journal_entry_id: string
          line_number: number
          memo?: string | null
          organization_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          journal_entry_id?: string
          line_number?: number
          memo?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_journal_lines_organization_id_account_id_fkey"
            columns: ["organization_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_organization_id_journal_entry_id_fkey"
            columns: ["organization_id", "journal_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      accounting_journal_reversals: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          id: string
          idempotency_key: string
          organization_id: string
          original_journal_entry_id: string
          payload_fingerprint: string
          reason: string
          reversal_journal_entry_id: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          idempotency_key: string
          organization_id: string
          original_journal_entry_id: string
          payload_fingerprint: string
          reason: string
          reversal_journal_entry_id: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          idempotency_key?: string
          organization_id?: string
          original_journal_entry_id?: string
          payload_fingerprint?: string
          reason?: string
          reversal_journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_journal_reversals_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_reversals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_reversals_organization_id_original_jour_fkey"
            columns: ["organization_id", "original_journal_entry_id"]
            isOneToOne: true
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_journal_reversals_organization_id_reversal_jour_fkey"
            columns: ["organization_id", "reversal_journal_entry_id"]
            isOneToOne: true
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      accounting_return_credit_memo_postings: {
        Row: {
          created_at: string
          created_by_profile_id: string
          credit_memo_id: string
          id: string
          idempotency_key: string
          journal_entry_id: string
          organization_id: string
          payload_fingerprint: string
          receivable_account_id: string
          revenue_account_id: string
          source_amount: number
          source_currency: string
          tax_account_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          credit_memo_id: string
          id?: string
          idempotency_key: string
          journal_entry_id: string
          organization_id: string
          payload_fingerprint: string
          receivable_account_id: string
          revenue_account_id: string
          source_amount: number
          source_currency: string
          tax_account_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          credit_memo_id?: string
          id?: string
          idempotency_key?: string
          journal_entry_id?: string
          organization_id?: string
          payload_fingerprint?: string
          receivable_account_id?: string
          revenue_account_id?: string
          source_amount?: number
          source_currency?: string
          tax_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_return_credit_memo_postin_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_return_credit_memo_postings_org_entry_fk"
            columns: ["organization_id", "journal_entry_id"]
            isOneToOne: true
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_return_credit_memo_postings_org_memo_fk"
            columns: ["organization_id", "credit_memo_id"]
            isOneToOne: true
            referencedRelation: "customer_return_credit_memos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_return_credit_memo_postings_org_receivable_fk"
            columns: ["organization_id", "receivable_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_return_credit_memo_postings_org_revenue_fk"
            columns: ["organization_id", "revenue_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_return_credit_memo_postings_org_tax_fk"
            columns: ["organization_id", "tax_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_return_credit_memo_postings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_return_credit_memo_reversals: {
        Row: {
          created_at: string
          created_by_profile_id: string
          credit_memo_id: string
          id: string
          idempotency_key: string
          organization_id: string
          original_journal_entry_id: string
          payload_fingerprint: string
          reason: string
          reversal_journal_entry_id: string
          reversed_at: string
          source_amount: number
          source_currency: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          credit_memo_id: string
          id?: string
          idempotency_key: string
          organization_id: string
          original_journal_entry_id: string
          payload_fingerprint: string
          reason: string
          reversal_journal_entry_id: string
          reversed_at?: string
          source_amount: number
          source_currency: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          credit_memo_id?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          original_journal_entry_id?: string
          payload_fingerprint?: string
          reason?: string
          reversal_journal_entry_id?: string
          reversed_at?: string
          source_amount?: number
          source_currency?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_return_credit_memo_revers_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_return_credit_memo_reversals_org_memo_fk"
            columns: ["organization_id", "credit_memo_id"]
            isOneToOne: true
            referencedRelation: "customer_return_credit_memos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_return_credit_memo_reversals_org_original_journal_fk"
            columns: ["organization_id", "original_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_return_credit_memo_reversals_org_reversal_journal_fk"
            columns: ["organization_id", "reversal_journal_entry_id"]
            isOneToOne: true
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_return_credit_memo_reversals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_source_postings: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          expense_account_id: string
          id: string
          idempotency_key: string
          journal_entry_id: string
          organization_id: string
          payload_fingerprint: string
          posting_kind: string
          reversal_reason: string | null
          settlement_account_id: string
          source_amount: number
          source_currency: string
          source_id: string
          source_type: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          expense_account_id: string
          id?: string
          idempotency_key: string
          journal_entry_id: string
          organization_id: string
          payload_fingerprint: string
          posting_kind: string
          reversal_reason?: string | null
          settlement_account_id: string
          source_amount: number
          source_currency: string
          source_id: string
          source_type: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          expense_account_id?: string
          id?: string
          idempotency_key?: string
          journal_entry_id?: string
          organization_id?: string
          payload_fingerprint?: string
          posting_kind?: string
          reversal_reason?: string | null
          settlement_account_id?: string
          source_amount?: number
          source_currency?: string
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_source_postings_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_source_postings_organization_id_expense_account_fkey"
            columns: ["organization_id", "expense_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_source_postings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_source_postings_organization_id_journal_entry_i_fkey"
            columns: ["organization_id", "journal_entry_id"]
            isOneToOne: true
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_source_postings_organization_id_settlement_acco_fkey"
            columns: ["organization_id", "settlement_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "accounting_source_postings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "cash_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_settings: {
        Row: {
          category: string
          created_at: string
          id: string
          key: string
          organization_id: string | null
          updated_at: string
          value: Json | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          key: string
          organization_id?: string | null
          updated_at?: string
          value?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          key?: string
          organization_id?: string | null
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_alerts: {
        Row: {
          alert_type: string
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_resolved: boolean
          organization_id: string | null
          severity: string
          title: string
        }
        Insert: {
          alert_type: string
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_resolved?: boolean
          organization_id?: string | null
          severity?: string
          title: string
        }
        Update: {
          alert_type?: string
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_resolved?: boolean
          organization_id?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recommendation_cards: {
        Row: {
          calculation: Json
          confidence_score: number | null
          created_at: string
          created_by: string | null
          expected_impact: Json
          explanation: string
          id: string
          organization_id: string
          recommendation_type: string
          snapshot_id: string | null
          source_metrics: Json
          status: string
          suggested_action: string | null
          suggested_action_payload: Json
          title: string
          updated_at: string
          why: string
        }
        Insert: {
          calculation?: Json
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          expected_impact?: Json
          explanation: string
          id?: string
          organization_id: string
          recommendation_type: string
          snapshot_id?: string | null
          source_metrics?: Json
          status?: string
          suggested_action?: string | null
          suggested_action_payload?: Json
          title: string
          updated_at?: string
          why: string
        }
        Update: {
          calculation?: Json
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          expected_impact?: Json
          explanation?: string
          id?: string
          organization_id?: string
          recommendation_type?: string
          snapshot_id?: string | null
          source_metrics?: Json
          status?: string
          suggested_action?: string | null
          suggested_action_payload?: Json
          title?: string
          updated_at?: string
          why?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recommendation_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendation_cards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendation_cards_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "onyx_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          organization_id: string | null
          priority: string
          resolution_note: string | null
          source_entity_id: string | null
          source_entity_type: string | null
          source_event_key: string | null
          status: string
          task_payload: Json
          task_role: string
          task_type: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          organization_id?: string | null
          priority?: string
          resolution_note?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          source_event_key?: string | null
          status?: string
          task_payload?: Json
          task_role?: string
          task_type?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          organization_id?: string | null
          priority?: string
          resolution_note?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          source_event_key?: string | null
          status?: string
          task_payload?: Json
          task_role?: string
          task_type?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_budgets: {
        Row: {
          ai_enabled: boolean
          daily_cost_limit: number
          daily_token_limit: number
          fallback_base_url: string
          fallback_enabled: boolean
          fallback_model: string
          fallback_provider: string
          id: string
          monthly_cost_limit: number
          monthly_token_limit: number
          organization_id: string
          per_request_cost_limit: number
          primary_base_url: string
          primary_model: string
          primary_provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_enabled?: boolean
          daily_cost_limit?: number
          daily_token_limit?: number
          fallback_base_url?: string
          fallback_enabled?: boolean
          fallback_model?: string
          fallback_provider?: string
          id?: string
          monthly_cost_limit?: number
          monthly_token_limit?: number
          organization_id: string
          per_request_cost_limit?: number
          primary_base_url?: string
          primary_model?: string
          primary_provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_enabled?: boolean
          daily_cost_limit?: number
          daily_token_limit?: number
          fallback_base_url?: string
          fallback_enabled?: boolean
          fallback_model?: string
          fallback_provider?: string
          id?: string
          monthly_cost_limit?: number
          monthly_token_limit?: number
          organization_id?: string
          per_request_cost_limit?: number
          primary_base_url?: string
          primary_model?: string
          primary_provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_budgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_budgets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_ledger: {
        Row: {
          actor_profile_id: string | null
          created_at: string
          estimated_cost: number
          execution_time_ms: number
          fallback_used: boolean
          id: string
          input_tokens: number
          model_name: string
          observed_input_tokens: number | null
          observed_output_tokens: number | null
          organization_id: string
          outcome_reason: string | null
          output_tokens: number
          provider_attempt_count: number
          provider_attempts: Json
          request_id: string
          result_status: string
          usage_measurement_status: string
        }
        Insert: {
          actor_profile_id?: string | null
          created_at?: string
          estimated_cost?: number
          execution_time_ms?: number
          fallback_used?: boolean
          id?: string
          input_tokens?: number
          model_name: string
          observed_input_tokens?: number | null
          observed_output_tokens?: number | null
          organization_id: string
          outcome_reason?: string | null
          output_tokens?: number
          provider_attempt_count?: number
          provider_attempts?: Json
          request_id: string
          result_status?: string
          usage_measurement_status?: string
        }
        Update: {
          actor_profile_id?: string | null
          created_at?: string
          estimated_cost?: number
          execution_time_ms?: number
          fallback_used?: boolean
          id?: string
          input_tokens?: number
          model_name?: string
          observed_input_tokens?: number | null
          observed_output_tokens?: number | null
          organization_id?: string
          outcome_reason?: string | null
          output_tokens?: number
          provider_attempt_count?: number
          provider_attempts?: Json
          request_id?: string
          result_status?: string
          usage_measurement_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_ledger_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_reservations: {
        Row: {
          actor_profile_id: string
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          model_name: string
          organization_id: string
          provider: string
          request_id: string
          reserved_cost: number
          reserved_input_tokens: number
          reserved_output_tokens: number
          status: string
        }
        Insert: {
          actor_profile_id: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          model_name: string
          organization_id: string
          provider: string
          request_id: string
          reserved_cost: number
          reserved_input_tokens: number
          reserved_output_tokens: number
          status?: string
        }
        Update: {
          actor_profile_id?: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          model_name?: string
          organization_id?: string
          provider?: string
          request_id?: string
          reserved_cost?: number
          reserved_input_tokens?: number
          reserved_output_tokens?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_reservations_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      async_export_jobs: {
        Row: {
          artifact_path: string | null
          attempt_count: number
          byte_size: number | null
          completed_at: string | null
          content_type: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          expires_at: string | null
          export_type: string
          file_name: string | null
          filters: Json
          id: string
          idempotency_key: string
          lease_expires_at: string | null
          lease_owner: string | null
          next_attempt_at: string
          organization_id: string
          request_hash: string
          requested_by: string
          row_count: number | null
          sha256: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          artifact_path?: string | null
          attempt_count?: number
          byte_size?: number | null
          completed_at?: string | null
          content_type?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          expires_at?: string | null
          export_type: string
          file_name?: string | null
          filters: Json
          id?: string
          idempotency_key: string
          lease_expires_at?: string | null
          lease_owner?: string | null
          next_attempt_at?: string
          organization_id: string
          request_hash: string
          requested_by: string
          row_count?: number | null
          sha256?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          artifact_path?: string | null
          attempt_count?: number
          byte_size?: number | null
          completed_at?: string | null
          content_type?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          expires_at?: string | null
          export_type?: string
          file_name?: string | null
          filters?: Json
          id?: string
          idempotency_key?: string
          lease_expires_at?: string | null
          lease_owner?: string | null
          next_attempt_at?: string
          organization_id?: string
          request_hash?: string
          requested_by?: string
          row_count?: number | null
          sha256?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "async_export_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "async_export_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      background_job_attempts: {
        Row: {
          attempt_number: number
          completed_at: string | null
          duration_ms: number | null
          error_class: string | null
          error_detail: Json | null
          id: string
          input_units: number
          job_id: string
          memory_peak_mb: number | null
          organization_id: string
          output_units: number
          stage: string | null
          started_at: string
          status: string
        }
        Insert: {
          attempt_number: number
          completed_at?: string | null
          duration_ms?: number | null
          error_class?: string | null
          error_detail?: Json | null
          id?: string
          input_units?: number
          job_id: string
          memory_peak_mb?: number | null
          organization_id: string
          output_units?: number
          stage?: string | null
          started_at?: string
          status: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          duration_ms?: number | null
          error_class?: string | null
          error_detail?: Json | null
          id?: string
          input_units?: number
          job_id?: string
          memory_peak_mb?: number | null
          organization_id?: string
          output_units?: number
          stage?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "background_job_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "background_job_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          attempt_count: number
          cancel_requested: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_stage: string | null
          estimated_seconds_remaining: number | null
          failed_units: number
          id: string
          job_type: string
          last_error: Json | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          memory_budget_mb: number
          organization_id: string
          pause_requested: boolean
          payload: Json
          processed_units: number
          progress_percent: number
          queue_name: string
          scheduled_at: string
          started_at: string | null
          status: string
          timeout_seconds: number
          total_units: number
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          cancel_requested?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string | null
          estimated_seconds_remaining?: number | null
          failed_units?: number
          id?: string
          job_type: string
          last_error?: Json | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          memory_budget_mb?: number
          organization_id: string
          pause_requested?: boolean
          payload?: Json
          processed_units?: number
          progress_percent?: number
          queue_name: string
          scheduled_at?: string
          started_at?: string | null
          status?: string
          timeout_seconds?: number
          total_units?: number
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          cancel_requested?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string | null
          estimated_seconds_remaining?: number | null
          failed_units?: number
          id?: string
          job_type?: string
          last_error?: Json | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          memory_budget_mb?: number
          organization_id?: string
          pause_requested?: boolean
          payload?: Json
          processed_units?: number
          progress_percent?: number
          queue_name?: string
          scheduled_at?: string
          started_at?: string | null
          status?: string
          timeout_seconds?: number
          total_units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "background_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "background_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by_profile_id: string | null
          currency: string
          description: string
          expense_date: string
          expense_number: number
          id: string
          idempotency_key: string
          organization_id: string
          payment_method: string
          reference: string | null
          status: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by_profile_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by_profile_id?: string | null
          currency?: string
          description: string
          expense_date?: string
          expense_number?: never
          id?: string
          idempotency_key: string
          organization_id: string
          payment_method: string
          reference?: string | null
          status?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_profile_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by_profile_id?: string | null
          currency?: string
          description?: string
          expense_date?: string
          expense_number?: never
          id?: string
          idempotency_key?: string
          organization_id?: string
          payment_method?: string
          reference?: string | null
          status?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_expenses_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_expenses_voided_by_profile_id_fkey"
            columns: ["voided_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          parent_id: string | null
          sort_order: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          parent_id?: string | null
          sort_order?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          parent_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_categories_parent_org_fk"
            columns: ["parent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      central_synonym_dictionary: {
        Row: {
          canonical_field: string
          created_at: string
          created_by: string | null
          id: string
          locale: string
          normalization_version: number
          normalized_header: string
          organization_id: string
          profile_id: string | null
          source_header: string
          updated_at: string
        }
        Insert: {
          canonical_field: string
          created_at?: string
          created_by?: string | null
          id?: string
          locale?: string
          normalization_version?: number
          normalized_header: string
          organization_id: string
          profile_id?: string | null
          source_header: string
          updated_at?: string
        }
        Update: {
          canonical_field?: string
          created_at?: string
          created_by?: string | null
          id?: string
          locale?: string
          normalization_version?: number
          normalized_header?: string
          organization_id?: string
          profile_id?: string | null
          source_header?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "central_synonym_dictionary_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "central_synonym_dictionary_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "central_synonym_dictionary_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "import_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_policy_registry: {
        Row: {
          business_rule: string
          conflict_priority: number
          created_at: string
          created_by_profile_id: string
          effective_from: string
          effective_until: string | null
          id: string
          idempotency_key: string
          organization_id: string
          owner_profile_id: string
          policy_key: string
          policy_version: number
          rationale: string
          request_fingerprint: string
          source_fingerprint: string
          source_id: string
          source_table: string
          test_examples: Json
        }
        Insert: {
          business_rule: string
          conflict_priority: number
          created_at?: string
          created_by_profile_id: string
          effective_from: string
          effective_until?: string | null
          id?: string
          idempotency_key: string
          organization_id: string
          owner_profile_id: string
          policy_key: string
          policy_version: number
          rationale: string
          request_fingerprint: string
          source_fingerprint: string
          source_id: string
          source_table: string
          test_examples: Json
        }
        Update: {
          business_rule?: string
          conflict_priority?: number
          created_at?: string
          created_by_profile_id?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          idempotency_key?: string
          organization_id?: string
          owner_profile_id?: string
          policy_key?: string
          policy_version?: number
          rationale?: string
          request_fingerprint?: string
          source_fingerprint?: string
          source_id?: string
          source_table?: string
          test_examples?: Json
        }
        Relationships: [
          {
            foreignKeyName: "commerce_policy_registry_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_policy_registry_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_policy_registry_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_policy_simulation_runs: {
        Row: {
          created_at: string
          created_by_profile_id: string
          id: string
          input_fingerprint: string
          organization_id: string
          outcome: Json
          simulation_type: string
          source_fingerprint: string
          source_refs: Json
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          id?: string
          input_fingerprint: string
          organization_id: string
          outcome: Json
          simulation_type: string
          source_fingerprint: string
          source_refs: Json
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          id?: string
          input_fingerprint?: string
          organization_id?: string
          outcome?: Json
          simulation_type?: string
          source_fingerprint?: string
          source_refs?: Json
        }
        Relationships: [
          {
            foreignKeyName: "commerce_policy_simulation_runs_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_policy_simulation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_activation_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_profile_id: string | null
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          invited_by_profile_id: string | null
          invited_email: string
          organization_id: string
          revoked_at: string | null
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          customer_id: string
          expires_at: string
          id?: string
          invited_by_profile_id?: string | null
          invited_email: string
          organization_id: string
          revoked_at?: string | null
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          invited_by_profile_id?: string | null
          invited_email?: string
          organization_id?: string
          revoked_at?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_activation_invitations_accepted_by_profile_id_fkey"
            columns: ["accepted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activation_invitations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activation_invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activation_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_activation_invitations_acceptor_org_fk"
            columns: ["accepted_by_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_activation_invitations_customer_org_fk"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_activation_invitations_inviter_org_fk"
            columns: ["invited_by_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          country: string
          created_at: string
          customer_id: string
          delivery_instructions: string | null
          id: string
          is_default: boolean
          label: string
          organization_id: string
          phone: string
          postal_code: string | null
          recipient_name: string
          region: string | null
          updated_at: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          country?: string
          created_at?: string
          customer_id: string
          delivery_instructions?: string | null
          id?: string
          is_default?: boolean
          label: string
          organization_id: string
          phone: string
          postal_code?: string | null
          recipient_name: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          country?: string
          created_at?: string
          customer_id?: string
          delivery_instructions?: string | null
          id?: string
          is_default?: boolean
          label?: string
          organization_id?: string
          phone?: string
          postal_code?: string | null
          recipient_name?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_customer_addresses_customer_org_fk"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      customer_cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          organization_id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          organization_id: string
          product_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_cart_items_cart_id_organization_id_fkey"
            columns: ["cart_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customer_carts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "customer_cart_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_customer_cart_items_product_org_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      customer_carts: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_carts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_carts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_customer_carts_profile_org_fk"
            columns: ["profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      customer_company_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          department: string | null
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          job_title: string | null
          organization_id: string
          phone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          department?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          job_title?: string | null
          organization_id: string
          phone: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          department?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          job_title?: string | null
          organization_id?: string
          phone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_company_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_company_contacts_customer_org_fk"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      customer_company_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          invited_by: string | null
          invited_email: string
          member_role: string
          organization_id: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          customer_id: string
          expires_at: string
          id?: string
          invited_by?: string | null
          invited_email: string
          member_role: string
          organization_id: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_email?: string
          member_role?: string
          organization_id?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_company_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_invitations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_company_invitations_acceptor_org_fk"
            columns: ["accepted_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_company_invitations_customer_org_fk"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_company_invitations_inviter_org_fk"
            columns: ["invited_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      customer_company_memberships: {
        Row: {
          accepted_at: string
          created_at: string
          customer_id: string
          id: string
          invited_by: string | null
          member_role: string
          organization_id: string
          profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          customer_id: string
          id?: string
          invited_by?: string | null
          member_role: string
          organization_id: string
          profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          customer_id?: string
          id?: string
          invited_by?: string | null
          member_role?: string
          organization_id?: string
          profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_company_memberships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_company_memberships_customer_org_fk"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_company_memberships_inviter_org_fk"
            columns: ["invited_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_company_memberships_profile_org_fk"
            columns: ["profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      customer_interaction_follow_up_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          idempotency_key: string
          interaction_id: string
          new_due_at: string | null
          old_due_at: string | null
          organization_id: string
          reason: string | null
          task_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          interaction_id: string
          new_due_at?: string | null
          old_due_at?: string | null
          organization_id: string
          reason?: string | null
          task_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          interaction_id?: string
          new_due_at?: string | null
          old_due_at?: string | null
          organization_id?: string
          reason?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_interaction_follow_up_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_interaction_follow_up_events_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "customer_interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_interaction_follow_up_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_interaction_follow_up_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ai_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_interactions: {
        Row: {
          created_at: string
          customer_id: string
          details: string
          id: string
          idempotency_key: string
          interaction_at: string
          interaction_type: string
          next_follow_up_at: string | null
          organization_id: string
          recorded_by: string
          subject: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          details: string
          id?: string
          idempotency_key: string
          interaction_at?: string
          interaction_type: string
          next_follow_up_at?: string | null
          organization_id: string
          recorded_by: string
          subject: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          details?: string
          id?: string
          idempotency_key?: string
          interaction_at?: string
          interaction_type?: string
          next_follow_up_at?: string | null
          organization_id?: string
          recorded_by?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_interactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_interactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_interactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_invoice_items: {
        Row: {
          created_at: string
          description: string
          discount_snapshot: number
          id: string
          invoice_id: string
          item_code: string | null
          line_total: number
          order_item_id: string | null
          organization_id: string
          product_id: string | null
          promotion_discount_per_unit_snapshot: number
          promotion_discount_type_snapshot: string | null
          promotion_discount_value_snapshot: number | null
          promotion_id_snapshot: string | null
          promotion_title_snapshot: string | null
          quantity: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          discount_snapshot?: number
          id?: string
          invoice_id: string
          item_code?: string | null
          line_total: number
          order_item_id?: string | null
          organization_id: string
          product_id?: string | null
          promotion_discount_per_unit_snapshot?: number
          promotion_discount_type_snapshot?: string | null
          promotion_discount_value_snapshot?: number | null
          promotion_id_snapshot?: string | null
          promotion_title_snapshot?: string | null
          quantity: number
          unit?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_snapshot?: number
          id?: string
          invoice_id?: string
          item_code?: string | null
          line_total?: number
          order_item_id?: string | null
          organization_id?: string
          product_id?: string | null
          promotion_discount_per_unit_snapshot?: number
          promotion_discount_type_snapshot?: string | null
          promotion_discount_value_snapshot?: number | null
          promotion_id_snapshot?: string | null
          promotion_title_snapshot?: string | null
          quantity?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoice_items_order_item_fk"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoice_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_invoice_items_invoice_org_fk"
            columns: ["invoice_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_invoice_items_product_org_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      customer_invoices: {
        Row: {
          created_at: string
          currency: string
          customer_id: string
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string
          order_id: string
          organization_id: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id: string
          due_at?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          order_id: string
          organization_id: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          order_id?: string
          organization_id?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_invoices_customer_org_fk"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_invoices_order_org_fk"
            columns: ["order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      customer_order_amendment_line_snapshots: {
        Row: {
          amendment_id: string
          created_at: string
          id: string
          item_code_snapshot: string | null
          order_id: string
          order_item_id: string
          organization_id: string
          previous_quantity: number
          product_name_snapshot: string
          proposed_quantity: number
          unit_snapshot: string | null
        }
        Insert: {
          amendment_id: string
          created_at: string
          id?: string
          item_code_snapshot?: string | null
          order_id: string
          order_item_id: string
          organization_id: string
          previous_quantity: number
          product_name_snapshot: string
          proposed_quantity: number
          unit_snapshot?: string | null
        }
        Update: {
          amendment_id?: string
          created_at?: string
          id?: string
          item_code_snapshot?: string | null
          order_id?: string
          order_item_id?: string
          organization_id?: string
          previous_quantity?: number
          product_name_snapshot?: string
          proposed_quantity?: number
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_amendment_line_snapshots_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "customer_order_amendments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_amendment_line_snapshots_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_amendment_line_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_order_amendments: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          idempotency_key: string
          line_count: number
          note: string | null
          order_id: string
          organization_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_profile: string | null
          status: string
          submitted_by_profile: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          idempotency_key: string
          line_count: number
          note?: string | null
          order_id: string
          organization_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_profile?: string | null
          status?: string
          submitted_by_profile: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          idempotency_key?: string
          line_count?: number
          note?: string | null
          order_id?: string
          organization_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_profile?: string | null
          status?: string
          submitted_by_profile?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_amendments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_amendments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_amendments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_amendments_reviewed_by_profile_fkey"
            columns: ["reviewed_by_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_amendments_submitted_by_profile_fkey"
            columns: ["submitted_by_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_order_cancellations: {
        Row: {
          cancelled_by_profile: string
          created_at: string
          customer_id: string
          id: string
          idempotency_key: string
          order_id: string
          organization_id: string
          reason: string
        }
        Insert: {
          cancelled_by_profile: string
          created_at?: string
          customer_id: string
          id?: string
          idempotency_key: string
          order_id: string
          organization_id: string
          reason: string
        }
        Update: {
          cancelled_by_profile?: string
          created_at?: string
          customer_id?: string
          id?: string
          idempotency_key?: string
          order_id?: string
          organization_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_cancellations_cancelled_by_profile_fkey"
            columns: ["cancelled_by_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_cancellations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_cancellations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_cancellations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payment_receipts: {
        Row: {
          allocation_count: number
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          id: string
          idempotency_key: string
          notes: string | null
          organization_id: string
          paid_at: string
          payment_method: string
          receipt_number: number
          reference: string | null
          request_fingerprint: string
          total_amount: number
        }
        Insert: {
          allocation_count: number
          created_at?: string
          created_by?: string | null
          currency: string
          customer_id: string
          id?: string
          idempotency_key: string
          notes?: string | null
          organization_id: string
          paid_at?: string
          payment_method: string
          receipt_number?: never
          reference?: string | null
          request_fingerprint: string
          total_amount: number
        }
        Update: {
          allocation_count?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          id?: string
          idempotency_key?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string
          payment_method?: string
          receipt_number?: never
          reference?: string | null
          request_fingerprint?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          idempotency_key: string | null
          invoice_id: string
          notes: string | null
          organization_id: string
          paid_at: string
          payment_method: string
          receipt_id: string | null
          reference: string | null
          request_fingerprint: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          idempotency_key?: string | null
          invoice_id: string
          notes?: string | null
          organization_id: string
          paid_at?: string
          payment_method: string
          receipt_id?: string | null
          reference?: string | null
          request_fingerprint?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          idempotency_key?: string | null
          invoice_id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string
          payment_method?: string
          receipt_id?: string | null
          reference?: string | null
          request_fingerprint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_receipt_tenant_fk"
            columns: ["receipt_id", "organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customer_payment_receipts"
            referencedColumns: ["id", "organization_id", "customer_id"]
          },
          {
            foreignKeyName: "tenant_integrity_customer_payments_customer_org_fk"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_customer_payments_invoice_org_fk"
            columns: ["invoice_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      customer_return_credit_memo_items: {
        Row: {
          created_at: string
          credit_memo_id: string
          credited_subtotal: number
          description_snapshot: string
          id: string
          invoice_item_id: string
          item_code_snapshot: string | null
          order_item_id: string
          organization_id: string
          product_id: string | null
          return_request_item_id: string
          returned_quantity: number
          unit_snapshot: string | null
        }
        Insert: {
          created_at?: string
          credit_memo_id: string
          credited_subtotal: number
          description_snapshot: string
          id?: string
          invoice_item_id: string
          item_code_snapshot?: string | null
          order_item_id: string
          organization_id: string
          product_id?: string | null
          return_request_item_id: string
          returned_quantity: number
          unit_snapshot?: string | null
        }
        Update: {
          created_at?: string
          credit_memo_id?: string
          credited_subtotal?: number
          description_snapshot?: string
          id?: string
          invoice_item_id?: string
          item_code_snapshot?: string | null
          order_item_id?: string
          organization_id?: string
          product_id?: string | null
          return_request_item_id?: string
          returned_quantity?: number
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_return_credit_memo_items_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "customer_invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_credit_memo_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_credit_memo_items_org_memo_fk"
            columns: ["organization_id", "credit_memo_id"]
            isOneToOne: false
            referencedRelation: "customer_return_credit_memos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_return_credit_memo_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_credit_memo_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_credit_memo_items_return_request_item_id_fkey"
            columns: ["return_request_item_id"]
            isOneToOne: false
            referencedRelation: "customer_return_request_items"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_return_credit_memos: {
        Row: {
          created_at: string
          created_by_profile_id: string
          currency: string
          customer_id: string
          id: string
          idempotency_key: string
          invoice_id: string
          memo_number: string
          organization_id: string
          payload_fingerprint: string
          posted_at: string | null
          posted_by_profile_id: string | null
          return_request_id: string
          reversal_journal_entry_id: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by_profile_id: string | null
          status: string
          subtotal_amount: number
          tax_amount: number
          total_amount: number
          void_reason: string | null
          voided_at: string | null
          voided_by_profile_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          currency: string
          customer_id: string
          id?: string
          idempotency_key: string
          invoice_id: string
          memo_number: string
          organization_id: string
          payload_fingerprint: string
          posted_at?: string | null
          posted_by_profile_id?: string | null
          return_request_id: string
          reversal_journal_entry_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by_profile_id?: string | null
          status?: string
          subtotal_amount: number
          tax_amount?: number
          total_amount: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by_profile_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          currency?: string
          customer_id?: string
          id?: string
          idempotency_key?: string
          invoice_id?: string
          memo_number?: string
          organization_id?: string
          payload_fingerprint?: string
          posted_at?: string | null
          posted_by_profile_id?: string | null
          return_request_id?: string
          reversal_journal_entry_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by_profile_id?: string | null
          status?: string
          subtotal_amount?: number
          tax_amount?: number
          total_amount?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_return_credit_memos_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_credit_memos_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_credit_memos_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_credit_memos_org_customer_fk"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_return_credit_memos_org_invoice_fk"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_return_credit_memos_org_request_fk"
            columns: ["organization_id", "return_request_id"]
            isOneToOne: false
            referencedRelation: "customer_return_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_return_credit_memos_org_reversal_journal_fk"
            columns: ["organization_id", "reversal_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_return_credit_memos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_credit_memos_posted_by_profile_id_fkey"
            columns: ["posted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_credit_memos_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "customer_return_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_credit_memos_reversed_by_profile_id_fkey"
            columns: ["reversed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_credit_memos_voided_by_profile_id_fkey"
            columns: ["voided_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_return_receipt_items: {
        Row: {
          created_at: string
          defective_quantity: number
          id: string
          item_code_snapshot: string | null
          organization_id: string
          product_id: string | null
          product_name_snapshot: string
          receipt_id: string
          received_quantity: number
          request_item_id: string
          restockable_quantity: number
          return_request_id: string
          unit_snapshot: string | null
        }
        Insert: {
          created_at?: string
          defective_quantity: number
          id?: string
          item_code_snapshot?: string | null
          organization_id: string
          product_id?: string | null
          product_name_snapshot: string
          receipt_id: string
          received_quantity: number
          request_item_id: string
          restockable_quantity: number
          return_request_id: string
          unit_snapshot?: string | null
        }
        Update: {
          created_at?: string
          defective_quantity?: number
          id?: string
          item_code_snapshot?: string | null
          organization_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          receipt_id?: string
          received_quantity?: number
          request_item_id?: string
          restockable_quantity?: number
          return_request_id?: string
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_return_receipt_items_org_receipt_fk"
            columns: ["organization_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "customer_return_receipts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_return_receipt_items_org_request_fk"
            columns: ["organization_id", "return_request_id"]
            isOneToOne: false
            referencedRelation: "customer_return_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_return_receipt_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_receipt_items_request_item_id_fkey"
            columns: ["request_item_id"]
            isOneToOne: false
            referencedRelation: "customer_return_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_receipt_items_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "customer_return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_return_receipts: {
        Row: {
          customer_name_snapshot: string
          id: string
          idempotency_key: string
          notes: string | null
          order_number_snapshot: string
          organization_id: string
          payload_fingerprint: string
          receipt_number: string
          received_at: string
          received_by: string
          request_number_snapshot: string
          return_request_id: string
          warehouse_id: string
          warehouse_name_snapshot: string
        }
        Insert: {
          customer_name_snapshot: string
          id?: string
          idempotency_key: string
          notes?: string | null
          order_number_snapshot: string
          organization_id: string
          payload_fingerprint: string
          receipt_number: string
          received_at?: string
          received_by: string
          request_number_snapshot: string
          return_request_id: string
          warehouse_id: string
          warehouse_name_snapshot: string
        }
        Update: {
          customer_name_snapshot?: string
          id?: string
          idempotency_key?: string
          notes?: string | null
          order_number_snapshot?: string
          organization_id?: string
          payload_fingerprint?: string
          receipt_number?: string
          received_at?: string
          received_by?: string
          request_number_snapshot?: string
          return_request_id?: string
          warehouse_id?: string
          warehouse_name_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_return_receipts_org_request_fk"
            columns: ["organization_id", "return_request_id"]
            isOneToOne: false
            referencedRelation: "customer_return_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_return_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_receipts_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_receipts_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "customer_return_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_return_request_items: {
        Row: {
          created_at: string
          id: string
          item_code_snapshot: string | null
          order_item_id: string
          organization_id: string
          product_id: string | null
          product_name_snapshot: string
          requested_quantity: number
          return_request_id: string
          unit_snapshot: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_code_snapshot?: string | null
          order_item_id: string
          organization_id: string
          product_id?: string | null
          product_name_snapshot: string
          requested_quantity: number
          return_request_id: string
          unit_snapshot?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_code_snapshot?: string | null
          order_item_id?: string
          organization_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          requested_quantity?: number
          return_request_id?: string
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_return_request_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_request_items_org_request_fk"
            columns: ["organization_id", "return_request_id"]
            isOneToOne: false
            referencedRelation: "customer_return_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_return_request_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_request_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_return_requests: {
        Row: {
          created_at: string
          customer_cancellation_reason: string | null
          customer_cancelled_at: string | null
          customer_id: string
          id: string
          idempotency_key: string
          notes: string | null
          order_id: string
          organization_id: string
          payload_fingerprint: string
          reason: string
          request_number: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_cancellation_reason?: string | null
          customer_cancelled_at?: string | null
          customer_id: string
          id?: string
          idempotency_key: string
          notes?: string | null
          order_id: string
          organization_id: string
          payload_fingerprint: string
          reason: string
          request_number: string
          requested_by: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_cancellation_reason?: string | null
          customer_cancelled_at?: string | null
          customer_id?: string
          id?: string
          idempotency_key?: string
          notes?: string | null
          order_id?: string
          organization_id?: string
          payload_fingerprint?: string
          reason?: string
          request_number?: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_return_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_service_case_events: {
        Row: {
          actor_id: string
          case_id: string
          created_at: string
          event_type: string
          id: string
          new_value: Json
          note: string | null
          old_value: Json
          organization_id: string
        }
        Insert: {
          actor_id: string
          case_id: string
          created_at?: string
          event_type: string
          id?: string
          new_value?: Json
          note?: string | null
          old_value?: Json
          organization_id: string
        }
        Update: {
          actor_id?: string
          case_id?: string
          created_at?: string
          event_type?: string
          id?: string
          new_value?: Json
          note?: string | null
          old_value?: Json
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_case_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "customer_service_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_case_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_service_case_messages: {
        Row: {
          author_profile_id: string
          author_side: string
          case_id: string
          created_at: string
          customer_id: string
          id: string
          message: string
          organization_id: string
        }
        Insert: {
          author_profile_id: string
          author_side: string
          case_id: string
          created_at?: string
          customer_id: string
          id?: string
          message: string
          organization_id: string
        }
        Update: {
          author_profile_id?: string
          author_side?: string
          case_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          message?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_case_messages_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_case_messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "customer_service_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_case_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_case_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_service_cases: {
        Row: {
          case_code: string
          case_type: string
          closed_at: string | null
          created_at: string
          created_by: string
          customer_id: string
          description: string
          escalated_at: string | null
          escalation_level: number
          first_response_at: string | null
          id: string
          idempotency_key: string
          organization_id: string
          priority: string
          resolution_due_at: string | null
          resolution_note: string | null
          resolved_at: string | null
          response_due_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          case_code: string
          case_type: string
          closed_at?: string | null
          created_at?: string
          created_by: string
          customer_id: string
          description: string
          escalated_at?: string | null
          escalation_level?: number
          first_response_at?: string | null
          id?: string
          idempotency_key: string
          organization_id: string
          priority?: string
          resolution_due_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          response_due_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          case_code?: string
          case_type?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          description?: string
          escalated_at?: string | null
          escalation_level?: number
          first_response_at?: string | null
          id?: string
          idempotency_key?: string
          organization_id?: string
          priority?: string
          resolution_due_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          response_due_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_service_sla_policies: {
        Row: {
          first_response_minutes: number
          organization_id: string
          priority: string
          resolution_minutes: number
          updated_at: string
          updated_by: string
        }
        Insert: {
          first_response_minutes: number
          organization_id: string
          priority: string
          resolution_minutes: number
          updated_at?: string
          updated_by: string
        }
        Update: {
          first_response_minutes?: number
          organization_id?: string
          priority?: string
          resolution_minutes?: number
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_sla_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_sla_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          approved_at: string | null
          business_name: string
          contact_name: string | null
          created_at: string
          credit_limit: number | null
          current_balance: number | null
          customer_code: string
          email: string | null
          id: string
          organization_id: string
          phone: string | null
          profile_id: string | null
          status: string
          tier: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          business_name: string
          contact_name?: string | null
          created_at?: string
          credit_limit?: number | null
          current_balance?: number | null
          customer_code: string
          email?: string | null
          id?: string
          organization_id: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          tier?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          business_name?: string
          contact_name?: string | null
          created_at?: string
          credit_limit?: number | null
          current_balance?: number | null
          customer_code?: string
          email?: string | null
          id?: string
          organization_id?: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_memory_events: {
        Row: {
          actor_profile_id: string
          actor_role: string
          command_payload: Json
          created_at: string
          decision_outcome_id: string
          event_type: string
          id: string
          idempotency_key: string
          organization_id: string
          result_snapshot: Json
          snapshot_id: string
          version_from: number
          version_to: number
        }
        Insert: {
          actor_profile_id: string
          actor_role: string
          command_payload: Json
          created_at?: string
          decision_outcome_id: string
          event_type: string
          id?: string
          idempotency_key: string
          organization_id: string
          result_snapshot: Json
          snapshot_id: string
          version_from: number
          version_to: number
        }
        Update: {
          actor_profile_id?: string
          actor_role?: string
          command_payload?: Json
          created_at?: string
          decision_outcome_id?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          result_snapshot?: Json
          snapshot_id?: string
          version_from?: number
          version_to?: number
        }
        Relationships: [
          {
            foreignKeyName: "decision_memory_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_memory_events_decision_outcome_id_fkey"
            columns: ["decision_outcome_id"]
            isOneToOne: false
            referencedRelation: "decision_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_memory_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_memory_events_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: true
            referencedRelation: "decision_memory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_memory_snapshots: {
        Row: {
          actor_profile_id: string
          actor_role: string
          as_of: string
          captured_at: string
          decision_outcome_id: string
          id: string
          organization_id: string
          payload: Json
          period_from: string
          period_to: string
          reason: string | null
          version: number
        }
        Insert: {
          actor_profile_id: string
          actor_role: string
          as_of: string
          captured_at?: string
          decision_outcome_id: string
          id?: string
          organization_id: string
          payload: Json
          period_from: string
          period_to: string
          reason?: string | null
          version: number
        }
        Update: {
          actor_profile_id?: string
          actor_role?: string
          as_of?: string
          captured_at?: string
          decision_outcome_id?: string
          id?: string
          organization_id?: string
          payload?: Json
          period_from?: string
          period_to?: string
          reason?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "decision_memory_snapshots_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_memory_snapshots_decision_outcome_id_fkey"
            columns: ["decision_outcome_id"]
            isOneToOne: false
            referencedRelation: "decision_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_memory_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_outcome_events: {
        Row: {
          actor_profile_id: string
          actor_role: string
          command_payload: Json
          created_at: string
          event_id: string
          event_type: string
          id: string
          idempotency_key: string
          organization_id: string
          outcome_id: string
          result_snapshot: Json
          version_after: number
        }
        Insert: {
          actor_profile_id: string
          actor_role: string
          command_payload: Json
          created_at?: string
          event_id: string
          event_type: string
          id?: string
          idempotency_key: string
          organization_id: string
          outcome_id: string
          result_snapshot: Json
          version_after: number
        }
        Update: {
          actor_profile_id?: string
          actor_role?: string
          command_payload?: Json
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          outcome_id?: string
          result_snapshot?: Json
          version_after?: number
        }
        Relationships: [
          {
            foreignKeyName: "decision_outcome_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_outcome_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_outcome_events_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "decision_outcomes"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_outcomes: {
        Row: {
          approved_at: string | null
          approved_by_profile_id: string | null
          assigned_at: string | null
          candidate_id: string
          candidate_snapshot: Json | null
          created_at: string
          executed_at: string | null
          expected_outcome: string
          id: string
          measured_outcome: Json | null
          organization_id: string
          owner_profile_id: string | null
          proposed_by_profile_id: string
          reason: string | null
          rule_id: string
          rule_version: string
          state: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by_profile_id?: string | null
          assigned_at?: string | null
          candidate_id: string
          candidate_snapshot?: Json | null
          created_at?: string
          executed_at?: string | null
          expected_outcome: string
          id?: string
          measured_outcome?: Json | null
          organization_id: string
          owner_profile_id?: string | null
          proposed_by_profile_id: string
          reason?: string | null
          rule_id: string
          rule_version: string
          state: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by_profile_id?: string | null
          assigned_at?: string | null
          candidate_id?: string
          candidate_snapshot?: Json | null
          created_at?: string
          executed_at?: string | null
          expected_outcome?: string
          id?: string
          measured_outcome?: Json | null
          organization_id?: string
          owner_profile_id?: string | null
          proposed_by_profile_id?: string
          reason?: string | null
          rule_id?: string
          rule_version?: string
          state?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "decision_outcomes_approved_by_profile_id_fkey"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_outcomes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_outcomes_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_outcomes_proposed_by_profile_id_fkey"
            columns: ["proposed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_bank_statement_line_matches: {
        Row: {
          id: string
          journal_entry_id: string
          journal_line_number: number
          matched_at: string
          matched_by_profile_id: string
          organization_id: string
          statement_line_id: string
        }
        Insert: {
          id?: string
          journal_entry_id: string
          journal_line_number: number
          matched_at?: string
          matched_by_profile_id: string
          organization_id: string
          statement_line_id: string
        }
        Update: {
          id?: string
          journal_entry_id?: string
          journal_line_number?: number
          matched_at?: string
          matched_by_profile_id?: string
          organization_id?: string
          statement_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_bank_statement_line_m_journal_entry_id_journal_lin_fkey"
            columns: ["journal_entry_id", "journal_line_number"]
            isOneToOne: false
            referencedRelation: "accounting_journal_lines"
            referencedColumns: ["journal_entry_id", "line_number"]
          },
          {
            foreignKeyName: "finance_bank_statement_line_m_organization_id_journal_entr_fkey"
            columns: ["organization_id", "journal_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_bank_statement_line_m_organization_id_statement_li_fkey"
            columns: ["organization_id", "statement_line_id"]
            isOneToOne: true
            referencedRelation: "finance_bank_statement_lines"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_bank_statement_line_matches_matched_by_profile_id_fkey"
            columns: ["matched_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_bank_statement_line_matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_bank_statement_lines: {
        Row: {
          created_at: string
          created_by_profile_id: string
          description: string
          external_reference: string | null
          id: string
          idempotency_key: string
          line_number: number
          organization_id: string
          payload_fingerprint: string
          signed_amount: number
          statement_id: string
          transaction_date: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          description: string
          external_reference?: string | null
          id?: string
          idempotency_key: string
          line_number: number
          organization_id: string
          payload_fingerprint: string
          signed_amount: number
          statement_id: string
          transaction_date: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          description?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string
          line_number?: number
          organization_id?: string
          payload_fingerprint?: string
          signed_amount?: number
          statement_id?: string
          transaction_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_bank_statement_lines_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_bank_statement_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_bank_statement_lines_organization_id_statement_id_fkey"
            columns: ["organization_id", "statement_id"]
            isOneToOne: false
            referencedRelation: "finance_bank_statements"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      finance_bank_statement_reconciliation_runs: {
        Row: {
          id: string
          ledger_difference: number
          ledger_net_movement: number
          matched_line_count: number
          organization_id: string
          outcome: string
          reason: string
          reviewed_at: string
          reviewed_by_profile_id: string
          run_number: number
          statement_difference: number
          statement_id: string
          statement_line_count: number
          statement_net_movement: number
          unmatched_ledger_lines: number
          unmatched_statement_lines: number
        }
        Insert: {
          id?: string
          ledger_difference: number
          ledger_net_movement: number
          matched_line_count: number
          organization_id: string
          outcome: string
          reason: string
          reviewed_at?: string
          reviewed_by_profile_id: string
          run_number: number
          statement_difference: number
          statement_id: string
          statement_line_count: number
          statement_net_movement: number
          unmatched_ledger_lines: number
          unmatched_statement_lines: number
        }
        Update: {
          id?: string
          ledger_difference?: number
          ledger_net_movement?: number
          matched_line_count?: number
          organization_id?: string
          outcome?: string
          reason?: string
          reviewed_at?: string
          reviewed_by_profile_id?: string
          run_number?: number
          statement_difference?: number
          statement_id?: string
          statement_line_count?: number
          statement_net_movement?: number
          unmatched_ledger_lines?: number
          unmatched_statement_lines?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_bank_statement_reconc_organization_id_statement_id_fkey"
            columns: ["organization_id", "statement_id"]
            isOneToOne: false
            referencedRelation: "finance_bank_statements"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_bank_statement_reconciliati_reviewed_by_profile_id_fkey"
            columns: ["reviewed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_bank_statement_reconciliation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_bank_statement_voids: {
        Row: {
          id: string
          organization_id: string
          reason: string
          statement_id: string
          voided_at: string
          voided_by_profile_id: string
        }
        Insert: {
          id?: string
          organization_id: string
          reason: string
          statement_id: string
          voided_at?: string
          voided_by_profile_id: string
        }
        Update: {
          id?: string
          organization_id?: string
          reason?: string
          statement_id?: string
          voided_at?: string
          voided_by_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_bank_statement_voids_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_bank_statement_voids_organization_id_statement_id_fkey"
            columns: ["organization_id", "statement_id"]
            isOneToOne: true
            referencedRelation: "finance_bank_statements"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_bank_statement_voids_voided_by_profile_id_fkey"
            columns: ["voided_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_bank_statements: {
        Row: {
          created_at: string
          created_by_profile_id: string
          currency: string
          evidence_id: string
          id: string
          organization_id: string
          period_from: string
          period_to: string
          settlement_account_mapping_id: string
          statement_closing_balance: number
          statement_opening_balance: number
          statement_reference: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          currency: string
          evidence_id: string
          id?: string
          organization_id: string
          period_from: string
          period_to: string
          settlement_account_mapping_id: string
          statement_closing_balance: number
          statement_opening_balance: number
          statement_reference: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          currency?: string
          evidence_id?: string
          id?: string
          organization_id?: string
          period_from?: string
          period_to?: string
          settlement_account_mapping_id?: string
          statement_closing_balance?: number
          statement_opening_balance?: number
          statement_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_bank_statements_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_bank_statements_organization_id_evidence_id_fkey"
            columns: ["organization_id", "evidence_id"]
            isOneToOne: false
            referencedRelation: "finance_cash_account_evidence"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_bank_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_bank_statements_organization_id_settlement_account_fkey"
            columns: ["organization_id", "settlement_account_mapping_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_payment_settlement_accounts"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      finance_cash_account_evidence: {
        Row: {
          byte_size: number
          content_sha256: string
          created_at: string
          evidence_kind: string
          file_name: string
          id: string
          mime_type: string
          organization_id: string
          settlement_account_mapping_id: string
          storage_path: string
          uploaded_by_profile_id: string
        }
        Insert: {
          byte_size: number
          content_sha256: string
          created_at?: string
          evidence_kind: string
          file_name: string
          id?: string
          mime_type: string
          organization_id: string
          settlement_account_mapping_id: string
          storage_path: string
          uploaded_by_profile_id: string
        }
        Update: {
          byte_size?: number
          content_sha256?: string
          created_at?: string
          evidence_kind?: string
          file_name?: string
          id?: string
          mime_type?: string
          organization_id?: string
          settlement_account_mapping_id?: string
          storage_path?: string
          uploaded_by_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_cash_account_evidence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_cash_account_evidence_organization_id_settlement_a_fkey"
            columns: ["organization_id", "settlement_account_mapping_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_payment_settlement_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_cash_account_evidence_uploaded_by_profile_id_fkey"
            columns: ["uploaded_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_cash_opening_balance_proposals: {
        Row: {
          as_of_date: string
          created_at: string
          created_by_profile_id: string
          currency: string
          evidence_id: string
          id: string
          idempotency_key: string
          opening_balance: number
          organization_id: string
          payload_fingerprint: string
          settlement_account_mapping_id: string
        }
        Insert: {
          as_of_date: string
          created_at?: string
          created_by_profile_id: string
          currency: string
          evidence_id: string
          id?: string
          idempotency_key: string
          opening_balance: number
          organization_id: string
          payload_fingerprint: string
          settlement_account_mapping_id: string
        }
        Update: {
          as_of_date?: string
          created_at?: string
          created_by_profile_id?: string
          currency?: string
          evidence_id?: string
          id?: string
          idempotency_key?: string
          opening_balance?: number
          organization_id?: string
          payload_fingerprint?: string
          settlement_account_mapping_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_cash_opening_balance__organization_id_settlement_a_fkey"
            columns: ["organization_id", "settlement_account_mapping_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_payment_settlement_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_cash_opening_balance_p_organization_id_evidence_id_fkey"
            columns: ["organization_id", "evidence_id"]
            isOneToOne: false
            referencedRelation: "finance_cash_account_evidence"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_cash_opening_balance_proposa_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_cash_opening_balance_proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_cash_opening_balance_reviews: {
        Row: {
          decision: string
          id: string
          organization_id: string
          posted_gl_balance: number
          posted_gl_line_count: number
          proposal_id: string
          reason: string
          reviewed_at: string
          reviewer_profile_id: string
        }
        Insert: {
          decision: string
          id?: string
          organization_id: string
          posted_gl_balance: number
          posted_gl_line_count: number
          proposal_id: string
          reason: string
          reviewed_at?: string
          reviewer_profile_id: string
        }
        Update: {
          decision?: string
          id?: string
          organization_id?: string
          posted_gl_balance?: number
          posted_gl_line_count?: number
          proposal_id?: string
          reason?: string
          reviewed_at?: string
          reviewer_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_cash_opening_balance_r_organization_id_proposal_id_fkey"
            columns: ["organization_id", "proposal_id"]
            isOneToOne: true
            referencedRelation: "finance_cash_opening_balance_proposals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_cash_opening_balance_reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_cash_opening_balance_reviews_reviewer_profile_id_fkey"
            columns: ["reviewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_job_request_keys: {
        Row: {
          actor_profile_id: string
          created_at: string
          import_job_id: string | null
          organization_id: string
          request_key: string
          request_payload: Json
        }
        Insert: {
          actor_profile_id: string
          created_at?: string
          import_job_id?: string | null
          organization_id: string
          request_key: string
          request_payload: Json
        }
        Update: {
          actor_profile_id?: string
          created_at?: string
          import_job_id?: string | null
          organization_id?: string
          request_key?: string
          request_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "import_job_request_keys_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_job_request_keys_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: true
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_job_request_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_job_rows: {
        Row: {
          created_at: string
          data: Json | null
          errors: Json | null
          id: string
          import_job_id: string
          row_number: number
          status: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          errors?: Json | null
          id?: string
          import_job_id: string
          row_number: number
          status?: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          errors?: Json | null
          id?: string
          import_job_id?: string
          row_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_job_rows_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          data_quality_score: number | null
          error_summary: Json | null
          external_source_reference: string | null
          failed_rows: number | null
          file_hash: string | null
          file_name: string | null
          file_size: number | null
          id: string
          job_type: string
          merge_strategy: string
          organization_id: string | null
          period_key: string | null
          processed_rows: number | null
          profile_id: string | null
          profile_version: number | null
          purge_status: string
          quality_breakdown: Json
          raw_file_retained: boolean
          retention_expires_at: string | null
          review_required: boolean
          source_system: string
          status: string
          success_rows: number | null
          total_rows: number | null
          upload_session_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          data_quality_score?: number | null
          error_summary?: Json | null
          external_source_reference?: string | null
          failed_rows?: number | null
          file_hash?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          job_type: string
          merge_strategy?: string
          organization_id?: string | null
          period_key?: string | null
          processed_rows?: number | null
          profile_id?: string | null
          profile_version?: number | null
          purge_status?: string
          quality_breakdown?: Json
          raw_file_retained?: boolean
          retention_expires_at?: string | null
          review_required?: boolean
          source_system?: string
          status?: string
          success_rows?: number | null
          total_rows?: number | null
          upload_session_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          data_quality_score?: number | null
          error_summary?: Json | null
          external_source_reference?: string | null
          failed_rows?: number | null
          file_hash?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          job_type?: string
          merge_strategy?: string
          organization_id?: string | null
          period_key?: string | null
          processed_rows?: number | null
          profile_id?: string | null
          profile_version?: number | null
          purge_status?: string
          quality_breakdown?: Json
          raw_file_retained?: boolean
          retention_expires_at?: string | null
          review_required?: boolean
          source_system?: string
          status?: string
          success_rows?: number | null
          total_rows?: number | null
          upload_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "import_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_upload_session_id_fkey"
            columns: ["upload_session_id"]
            isOneToOne: false
            referencedRelation: "import_upload_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      import_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          date_rules: Json
          id: string
          ignored_columns: Json
          is_full_dataset: boolean
          matching_key: string
          merge_strategy: string
          optional_columns: Json
          organization_id: string
          profile_name: string
          published_at: string | null
          report_type: string
          required_columns: Json
          source: string
          status: string
          synonyms: Json
          transformation_rules: Json
          updated_at: string
          validation_rules: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_rules?: Json
          id?: string
          ignored_columns?: Json
          is_full_dataset?: boolean
          matching_key?: string
          merge_strategy?: string
          optional_columns?: Json
          organization_id: string
          profile_name: string
          published_at?: string | null
          report_type: string
          required_columns?: Json
          source?: string
          status?: string
          synonyms?: Json
          transformation_rules?: Json
          updated_at?: string
          validation_rules?: Json
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_rules?: Json
          id?: string
          ignored_columns?: Json
          is_full_dataset?: boolean
          matching_key?: string
          merge_strategy?: string
          optional_columns?: Json
          organization_id?: string
          profile_name?: string
          published_at?: string | null
          report_type?: string
          required_columns?: Json
          source?: string
          status?: string
          synonyms?: Json
          transformation_rules?: Json
          updated_at?: string
          validation_rules?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_upload_chunks: {
        Row: {
          byte_offset: number
          byte_size: number
          chunk_hash: string
          chunk_number: number
          id: string
          organization_id: string
          session_id: string
          verified_at: string
        }
        Insert: {
          byte_offset: number
          byte_size: number
          chunk_hash: string
          chunk_number: number
          id?: string
          organization_id: string
          session_id: string
          verified_at?: string
        }
        Update: {
          byte_offset?: number
          byte_size?: number
          chunk_hash?: string
          chunk_number?: number
          id?: string
          organization_id?: string
          session_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_upload_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_upload_chunks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "import_upload_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      import_upload_sessions: {
        Row: {
          chunk_size_bytes: number
          created_at: string
          created_by: string | null
          external_source_reference: string | null
          extraction_status: string
          file_hash: string
          file_name: string
          file_size: number
          file_type: string
          id: string
          import_job_id: string | null
          organization_id: string
          period_key: string | null
          profile_id: string | null
          profile_version: number | null
          purge_status: string
          purged_at: string | null
          raw_file_retained: boolean
          retention_expires_at: string
          status: string
          total_chunks: number
          updated_at: string
          verified_chunks: number
        }
        Insert: {
          chunk_size_bytes?: number
          created_at?: string
          created_by?: string | null
          external_source_reference?: string | null
          extraction_status?: string
          file_hash: string
          file_name: string
          file_size: number
          file_type: string
          id?: string
          import_job_id?: string | null
          organization_id: string
          period_key?: string | null
          profile_id?: string | null
          profile_version?: number | null
          purge_status?: string
          purged_at?: string | null
          raw_file_retained?: boolean
          retention_expires_at?: string
          status?: string
          total_chunks?: number
          updated_at?: string
          verified_chunks?: number
        }
        Update: {
          chunk_size_bytes?: number
          created_at?: string
          created_by?: string | null
          external_source_reference?: string | null
          extraction_status?: string
          file_hash?: string
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          import_job_id?: string | null
          organization_id?: string
          period_key?: string | null
          profile_id?: string | null
          profile_version?: number | null
          purge_status?: string
          purged_at?: string | null
          raw_file_retained?: boolean
          retention_expires_at?: string
          status?: string
          total_chunks?: number
          updated_at?: string
          verified_chunks?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_upload_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_upload_sessions_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_upload_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_upload_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "import_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          created_at: string
          id: string
          last_movement_at: string | null
          product_id: string
          quantity_available: number | null
          quantity_on_hand: number
          quantity_reserved: number
          reorder_point: number | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_movement_at?: string | null
          product_id: string
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number
          reorder_point?: number | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_movement_at?: string | null
          product_id?: string
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number
          reorder_point?: number | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          balance_after: number | null
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          warehouse_id: string
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          warehouse_id: string
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reconciliation_items: {
        Row: {
          created_at: string
          difference: number | null
          id: string
          imported_quantity: number | null
          item_code: string
          live_quantity: number | null
          notes: Json
          organization_id: string
          outcome: string
          product_id: string | null
          run_id: string
          snapshot_row_id: string | null
        }
        Insert: {
          created_at?: string
          difference?: number | null
          id?: string
          imported_quantity?: number | null
          item_code: string
          live_quantity?: number | null
          notes?: Json
          organization_id: string
          outcome: string
          product_id?: string | null
          run_id: string
          snapshot_row_id?: string | null
        }
        Update: {
          created_at?: string
          difference?: number | null
          id?: string
          imported_quantity?: number | null
          item_code?: string
          live_quantity?: number | null
          notes?: Json
          organization_id?: string
          outcome?: string
          product_id?: string | null
          run_id?: string
          snapshot_row_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reconciliation_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "inventory_reconciliation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_items_snapshot_row_id_fkey"
            columns: ["snapshot_row_id"]
            isOneToOne: false
            referencedRelation: "onyx_snapshot_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reconciliation_runs: {
        Row: {
          changed_count: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_summary: Json
          id: string
          invalid_count: number
          matched_count: number
          new_count: number
          organization_id: string
          snapshot_id: string
          source_row_count: number
          started_at: string
          status: string
        }
        Insert: {
          changed_count?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_summary?: Json
          id?: string
          invalid_count?: number
          matched_count?: number
          new_count?: number
          organization_id: string
          snapshot_id: string
          source_row_count?: number
          started_at?: string
          status?: string
        }
        Update: {
          changed_count?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_summary?: Json
          id?: string
          invalid_count?: number
          matched_count?: number
          new_count?: number
          organization_id?: string
          snapshot_id?: string
          source_row_count?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reconciliation_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_runs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "onyx_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_reconciliation_runs_snapshot_org_fk"
            columns: ["snapshot_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "onyx_snapshots"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      inventory_transfer_batches: {
        Row: {
          created_at: string
          created_by: string
          destination_warehouse_id: string
          id: string
          idempotency_key: string
          line_count: number
          organization_id: string
          payload: Json
          reason: string
          source_warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          destination_warehouse_id: string
          id?: string
          idempotency_key: string
          line_count: number
          organization_id: string
          payload: Json
          reason: string
          source_warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          destination_warehouse_id?: string
          id?: string
          idempotency_key?: string
          line_count?: number
          organization_id?: string
          payload?: Json
          reason?: string
          source_warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfer_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_batches_destination_warehouse_id_fkey"
            columns: ["destination_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_batches_source_warehouse_id_fkey"
            columns: ["source_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_transfer_batches_destination_org_fk"
            columns: ["destination_warehouse_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_transfer_batches_source_org_fk"
            columns: ["source_warehouse_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          batch_id: string | null
          created_at: string
          created_by: string
          destination_warehouse_id: string
          id: string
          idempotency_key: string
          organization_id: string
          product_id: string
          quantity: number
          reason: string
          source_warehouse_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          created_by: string
          destination_warehouse_id: string
          id?: string
          idempotency_key: string
          organization_id: string
          product_id: string
          quantity: number
          reason: string
          source_warehouse_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          created_by?: string
          destination_warehouse_id?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          product_id?: string
          quantity?: number
          reason?: string
          source_warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfer_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_destination_warehouse_id_fkey"
            columns: ["destination_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_source_warehouse_id_fkey"
            columns: ["source_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_inventory_transfers_actor_org_fk"
            columns: ["created_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_inventory_transfers_product_org_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_inventory_transfers_source_warehouse_org_fk"
            columns: ["source_warehouse_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_transfer_dest_warehouse_org_fk"
            columns: ["destination_warehouse_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      notification_delivery_suppressions: {
        Row: {
          id: string
          notification_id: string
          notification_type: string
          organization_id: string
          profile_id: string
          reason: string
          severity: string
          suppressed_at: string
        }
        Insert: {
          id?: string
          notification_id: string
          notification_type: string
          organization_id: string
          profile_id: string
          reason: string
          severity: string
          suppressed_at?: string
        }
        Update: {
          id?: string
          notification_id?: string
          notification_type?: string
          organization_id?: string
          profile_id?: string
          reason?: string
          severity?: string
          suppressed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_suppressions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          organization_id: string | null
          profile_id: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          organization_id?: string | null
          profile_id?: string | null
          title: string
          type?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          organization_id?: string | null
          profile_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onyx_inventory_reconciliation_commands: {
        Row: {
          adjusted_lines: number
          applied_at: string | null
          applied_by: string | null
          apply_idempotency_key: string | null
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          organization_id: string
          reason: string
          rollback_idempotency_key: string | null
          rollback_reason: string | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          snapshot_id: string
          snapshot_metrics: Json
          snapshot_report_type: string
          snapshot_row_count: number
          snapshot_source_hash: string
          source_row_count: number
          status: string
          warehouse_id: string
        }
        Insert: {
          adjusted_lines?: number
          applied_at?: string | null
          applied_by?: string | null
          apply_idempotency_key?: string | null
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          organization_id: string
          reason: string
          rollback_idempotency_key?: string | null
          rollback_reason?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          snapshot_id: string
          snapshot_metrics?: Json
          snapshot_report_type: string
          snapshot_row_count: number
          snapshot_source_hash: string
          source_row_count?: number
          status?: string
          warehouse_id: string
        }
        Update: {
          adjusted_lines?: number
          applied_at?: string | null
          applied_by?: string | null
          apply_idempotency_key?: string | null
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          reason?: string
          rollback_idempotency_key?: string | null
          rollback_reason?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          snapshot_id?: string
          snapshot_metrics?: Json
          snapshot_report_type?: string
          snapshot_row_count?: number
          snapshot_source_hash?: string
          source_row_count?: number
          status?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onyx_inventory_reconciliation_commands_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_inventory_reconciliation_commands_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_inventory_reconciliation_commands_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_inventory_reconciliation_commands_rolled_back_by_fkey"
            columns: ["rolled_back_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_inventory_reconciliation_commands_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "onyx_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_inventory_reconciliation_commands_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_onyx_commands_actor_org_fk"
            columns: ["created_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_onyx_commands_snapshot_org_fk"
            columns: ["snapshot_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "onyx_snapshots"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_onyx_commands_warehouse_org_fk"
            columns: ["warehouse_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      onyx_inventory_reconciliation_items: {
        Row: {
          applied_delta: number | null
          applied_last_movement_at: string | null
          applied_movement_created_at: string | null
          applied_movement_id: string | null
          applied_quantity_on_hand: number | null
          applied_quantity_reserved: number | null
          applied_updated_at: string | null
          baseline_balance_exists: boolean
          baseline_last_movement_at: string | null
          baseline_latest_movement_at: string | null
          baseline_movement_count: number
          baseline_quantity_on_hand: number
          baseline_quantity_reserved: number
          baseline_updated_at: string | null
          command_id: string
          created_at: string
          id: string
          item_code: string
          organization_id: string
          product_id: string
          rollback_movement_id: string | null
          rolled_back_at: string | null
          snapshot_row_id: string
          source_quantity: number
          source_row_hash: string
        }
        Insert: {
          applied_delta?: number | null
          applied_last_movement_at?: string | null
          applied_movement_created_at?: string | null
          applied_movement_id?: string | null
          applied_quantity_on_hand?: number | null
          applied_quantity_reserved?: number | null
          applied_updated_at?: string | null
          baseline_balance_exists: boolean
          baseline_last_movement_at?: string | null
          baseline_latest_movement_at?: string | null
          baseline_movement_count: number
          baseline_quantity_on_hand: number
          baseline_quantity_reserved: number
          baseline_updated_at?: string | null
          command_id: string
          created_at?: string
          id?: string
          item_code: string
          organization_id: string
          product_id: string
          rollback_movement_id?: string | null
          rolled_back_at?: string | null
          snapshot_row_id: string
          source_quantity: number
          source_row_hash: string
        }
        Update: {
          applied_delta?: number | null
          applied_last_movement_at?: string | null
          applied_movement_created_at?: string | null
          applied_movement_id?: string | null
          applied_quantity_on_hand?: number | null
          applied_quantity_reserved?: number | null
          applied_updated_at?: string | null
          baseline_balance_exists?: boolean
          baseline_last_movement_at?: string | null
          baseline_latest_movement_at?: string | null
          baseline_movement_count?: number
          baseline_quantity_on_hand?: number
          baseline_quantity_reserved?: number
          baseline_updated_at?: string | null
          command_id?: string
          created_at?: string
          id?: string
          item_code?: string
          organization_id?: string
          product_id?: string
          rollback_movement_id?: string | null
          rolled_back_at?: string | null
          snapshot_row_id?: string
          source_quantity?: number
          source_row_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "onyx_inventory_reconciliation_items_command_id_fkey"
            columns: ["command_id"]
            isOneToOne: false
            referencedRelation: "onyx_inventory_reconciliation_commands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_inventory_reconciliation_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_inventory_reconciliation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_inventory_reconciliation_items_snapshot_row_id_fkey"
            columns: ["snapshot_row_id"]
            isOneToOne: false
            referencedRelation: "onyx_snapshot_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_onyx_items_command_org_fk"
            columns: ["command_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "onyx_inventory_reconciliation_commands"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_onyx_items_product_org_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_onyx_items_snapshot_row_org_fk"
            columns: ["snapshot_row_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "onyx_snapshot_rows"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      onyx_live_sync_attempts: {
        Row: {
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_summary: string | null
          external_request_id: string | null
          http_status: number | null
          id: string
          operation: string
          order_id: string | null
          organization_id: string
          request_sha256: string
          response_sha256: string | null
          snapshot_id: string | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_summary?: string | null
          external_request_id?: string | null
          http_status?: number | null
          id?: string
          operation: string
          order_id?: string | null
          organization_id: string
          request_sha256: string
          response_sha256?: string | null
          snapshot_id?: string | null
          started_at?: string
          status: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_summary?: string | null
          external_request_id?: string | null
          http_status?: number | null
          id?: string
          operation?: string
          order_id?: string | null
          organization_id?: string
          request_sha256?: string
          response_sha256?: string | null
          snapshot_id?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "onyx_live_sync_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_live_sync_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_live_sync_attempts_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "onyx_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      onyx_order_export_requests: {
        Row: {
          actor_profile_id: string
          audit_id: string | null
          created_at: string
          item_count: number
          order_id: string
          organization_id: string
          request_key: string
          source_snapshot_id: string | null
        }
        Insert: {
          actor_profile_id: string
          audit_id?: string | null
          created_at?: string
          item_count: number
          order_id: string
          organization_id: string
          request_key: string
          source_snapshot_id?: string | null
        }
        Update: {
          actor_profile_id?: string
          audit_id?: string | null
          created_at?: string
          item_count?: number
          order_id?: string
          organization_id?: string
          request_key?: string
          source_snapshot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onyx_order_export_requests_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_order_export_requests_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: true
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_order_export_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_order_export_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      onyx_snapshot_rows: {
        Row: {
          canonical_key: string | null
          created_at: string
          data: Json
          errors: Json
          id: string
          organization_id: string
          row_hash: string
          row_number: number
          snapshot_id: string
          status: string
        }
        Insert: {
          canonical_key?: string | null
          created_at?: string
          data?: Json
          errors?: Json
          id?: string
          organization_id: string
          row_hash: string
          row_number: number
          snapshot_id: string
          status: string
        }
        Update: {
          canonical_key?: string | null
          created_at?: string
          data?: Json
          errors?: Json
          id?: string
          organization_id?: string
          row_hash?: string
          row_number?: number
          snapshot_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "onyx_snapshot_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_snapshot_rows_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "onyx_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_onyx_rows_snapshot_org_fk"
            columns: ["snapshot_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "onyx_snapshots"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      onyx_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          data_quality_score: number
          id: string
          metrics: Json
          normalization_version: number
          organization_id: string
          period_key: string | null
          profile_id: string | null
          profile_version: number | null
          quality_breakdown: Json
          report_type: string
          row_count: number
          snapshot_version: number
          source_file_hash: string
          source_file_name: string | null
          source_import_job_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_quality_score: number
          id?: string
          metrics?: Json
          normalization_version?: number
          organization_id: string
          period_key?: string | null
          profile_id?: string | null
          profile_version?: number | null
          quality_breakdown?: Json
          report_type: string
          row_count?: number
          snapshot_version?: number
          source_file_hash: string
          source_file_name?: string | null
          source_import_job_id: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_quality_score?: number
          id?: string
          metrics?: Json
          normalization_version?: number
          organization_id?: string
          period_key?: string | null
          profile_id?: string | null
          profile_version?: number | null
          quality_breakdown?: Json
          report_type?: string
          row_count?: number
          snapshot_version?: number
          source_file_hash?: string
          source_file_name?: string | null
          source_import_job_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "onyx_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_snapshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "import_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onyx_snapshots_source_import_job_id_fkey"
            columns: ["source_import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_onyx_snapshot_import_org_fk"
            columns: ["source_import_job_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      operational_shift_cash_counts: {
        Row: {
          correction_reason: string | null
          counted_amount: number
          counted_by_profile_id: string
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          note: string | null
          organization_id: string
          payload_fingerprint: string
          phase: string
          shift_id: string
          version: number
        }
        Insert: {
          correction_reason?: string | null
          counted_amount: number
          counted_by_profile_id: string
          created_at?: string
          currency: string
          id?: string
          idempotency_key: string
          note?: string | null
          organization_id: string
          payload_fingerprint: string
          phase: string
          shift_id: string
          version: number
        }
        Update: {
          correction_reason?: string | null
          counted_amount?: number
          counted_by_profile_id?: string
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          note?: string | null
          organization_id?: string
          payload_fingerprint?: string
          phase?: string
          shift_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "operational_shift_cash_counts_counted_by_profile_id_fkey"
            columns: ["counted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_shift_cash_counts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_shift_cash_counts_organization_id_shift_id_fkey"
            columns: ["organization_id", "shift_id"]
            isOneToOne: false
            referencedRelation: "operational_shifts"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      operational_shift_handover_events: {
        Row: {
          action: string
          actor_profile_id: string
          created_at: string
          current_shift_id: string
          handover_id: string | null
          id: string
          idempotency_key: string
          incoming_owner_profile_id: string
          note: string | null
          open_item_refs: Json
          organization_id: string
          outgoing_owner_profile_id: string
          payload_fingerprint: string
          previous_shift_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_profile_id: string
          created_at?: string
          current_shift_id: string
          handover_id?: string | null
          id?: string
          idempotency_key: string
          incoming_owner_profile_id: string
          note?: string | null
          open_item_refs?: Json
          organization_id: string
          outgoing_owner_profile_id: string
          payload_fingerprint: string
          previous_shift_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string
          created_at?: string
          current_shift_id?: string
          handover_id?: string | null
          id?: string
          idempotency_key?: string
          incoming_owner_profile_id?: string
          note?: string | null
          open_item_refs?: Json
          organization_id?: string
          outgoing_owner_profile_id?: string
          payload_fingerprint?: string
          previous_shift_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_shift_handover_ev_organization_id_current_shif_fkey"
            columns: ["organization_id", "current_shift_id"]
            isOneToOne: false
            referencedRelation: "operational_shifts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "operational_shift_handover_ev_organization_id_previous_shi_fkey"
            columns: ["organization_id", "previous_shift_id"]
            isOneToOne: false
            referencedRelation: "operational_shifts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "operational_shift_handover_eve_organization_id_handover_id_fkey"
            columns: ["organization_id", "handover_id"]
            isOneToOne: false
            referencedRelation: "operational_shift_handover_events"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "operational_shift_handover_event_incoming_owner_profile_id_fkey"
            columns: ["incoming_owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_shift_handover_event_outgoing_owner_profile_id_fkey"
            columns: ["outgoing_owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_shift_handover_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_shift_handover_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_shift_workspace_snapshots: {
        Row: {
          captured_at: string
          captured_by_profile_id: string
          id: string
          idempotency_key: string
          organization_id: string
          payload: Json
          payload_fingerprint: string
          shift_id: string
          snapshot_kind: string
          source_fingerprint: string
          version: number
        }
        Insert: {
          captured_at?: string
          captured_by_profile_id: string
          id?: string
          idempotency_key: string
          organization_id: string
          payload: Json
          payload_fingerprint: string
          shift_id: string
          snapshot_kind: string
          source_fingerprint: string
          version: number
        }
        Update: {
          captured_at?: string
          captured_by_profile_id?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          payload?: Json
          payload_fingerprint?: string
          shift_id?: string
          snapshot_kind?: string
          source_fingerprint?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "operational_shift_workspace_snaps_organization_id_shift_id_fkey"
            columns: ["organization_id", "shift_id"]
            isOneToOne: false
            referencedRelation: "operational_shifts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "operational_shift_workspace_snapsho_captured_by_profile_id_fkey"
            columns: ["captured_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_shift_workspace_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_shifts: {
        Row: {
          business_date: string
          id: string
          idempotency_key: string
          organization_id: string
          organization_time_zone: string
          owner_profile_id: string
          payload_fingerprint: string
          previous_shift_id: string | null
          shift_label: string
          started_at: string
          started_by_profile_id: string
        }
        Insert: {
          business_date: string
          id?: string
          idempotency_key: string
          organization_id: string
          organization_time_zone: string
          owner_profile_id: string
          payload_fingerprint: string
          previous_shift_id?: string | null
          shift_label: string
          started_at?: string
          started_by_profile_id: string
        }
        Update: {
          business_date?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          organization_time_zone?: string
          owner_profile_id?: string
          payload_fingerprint?: string
          previous_shift_id?: string | null
          shift_label?: string
          started_at?: string
          started_by_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_shifts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_shifts_organization_id_previous_shift_id_fkey"
            columns: ["organization_id", "previous_shift_id"]
            isOneToOne: false
            referencedRelation: "operational_shifts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "operational_shifts_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_shifts_started_by_profile_id_fkey"
            columns: ["started_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_task_audit_settings: {
        Row: {
          coverage_started_at: string
          singleton: boolean
        }
        Insert: {
          coverage_started_at: string
          singleton?: boolean
        }
        Update: {
          coverage_started_at?: string
          singleton?: boolean
        }
        Relationships: []
      }
      operational_task_quality_events: {
        Row: {
          actionability: string | null
          actor_profile_id: string
          actor_role: string
          alert_verdict: string | null
          cause_key: string | null
          command_payload: Json
          created_at: string
          decision_outcome_id: string | null
          disposition: string | null
          event_id: string
          id: string
          idempotency_key: string
          organization_id: string
          reason_code: string | null
          reason_note: string | null
          result_snapshot: Json
          review_type: string
          task_id: string
          task_role_snapshot: string
          task_status_snapshot: string
          task_type_snapshot: string
          task_updated_at: string
        }
        Insert: {
          actionability?: string | null
          actor_profile_id: string
          actor_role: string
          alert_verdict?: string | null
          cause_key?: string | null
          command_payload: Json
          created_at?: string
          decision_outcome_id?: string | null
          disposition?: string | null
          event_id: string
          id?: string
          idempotency_key: string
          organization_id: string
          reason_code?: string | null
          reason_note?: string | null
          result_snapshot: Json
          review_type: string
          task_id: string
          task_role_snapshot: string
          task_status_snapshot: string
          task_type_snapshot: string
          task_updated_at: string
        }
        Update: {
          actionability?: string | null
          actor_profile_id?: string
          actor_role?: string
          alert_verdict?: string | null
          cause_key?: string | null
          command_payload?: Json
          created_at?: string
          decision_outcome_id?: string | null
          disposition?: string | null
          event_id?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          reason_code?: string | null
          reason_note?: string | null
          result_snapshot?: Json
          review_type?: string
          task_id?: string
          task_role_snapshot?: string
          task_status_snapshot?: string
          task_type_snapshot?: string
          task_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_task_quality_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_task_quality_events_decision_outcome_id_fkey"
            columns: ["decision_outcome_id"]
            isOneToOne: false
            referencedRelation: "decision_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_task_quality_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_task_quality_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ai_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          adjusted_at: string | null
          adjusted_by: string | null
          approved_quantity: number
          approved_unit_price: number
          created_at: string
          discount_snapshot: number
          id: string
          item_code: string | null
          line_total: number
          order_id: string
          price_override_reason: string | null
          product_id: string | null
          product_name_snapshot: string
          promotion_discount_per_unit_snapshot: number
          promotion_discount_type_snapshot: string | null
          promotion_discount_value_snapshot: number | null
          promotion_id_snapshot: string | null
          promotion_title_snapshot: string | null
          proposed_price_reason: string | null
          proposed_quantity: number | null
          proposed_unit_price: number | null
          quantity: number
          requested_quantity: number
          unit_price_snapshot: number
          unit_snapshot: string | null
        }
        Insert: {
          adjusted_at?: string | null
          adjusted_by?: string | null
          approved_quantity: number
          approved_unit_price: number
          created_at?: string
          discount_snapshot?: number
          id?: string
          item_code?: string | null
          line_total?: number
          order_id: string
          price_override_reason?: string | null
          product_id?: string | null
          product_name_snapshot: string
          promotion_discount_per_unit_snapshot?: number
          promotion_discount_type_snapshot?: string | null
          promotion_discount_value_snapshot?: number | null
          promotion_id_snapshot?: string | null
          promotion_title_snapshot?: string | null
          proposed_price_reason?: string | null
          proposed_quantity?: number | null
          proposed_unit_price?: number | null
          quantity?: number
          requested_quantity: number
          unit_price_snapshot?: number
          unit_snapshot?: string | null
        }
        Update: {
          adjusted_at?: string | null
          adjusted_by?: string | null
          approved_quantity?: number
          approved_unit_price?: number
          created_at?: string
          discount_snapshot?: number
          id?: string
          item_code?: string | null
          line_total?: number
          order_id?: string
          price_override_reason?: string | null
          product_id?: string | null
          product_name_snapshot?: string
          promotion_discount_per_unit_snapshot?: number
          promotion_discount_type_snapshot?: string | null
          promotion_discount_value_snapshot?: number | null
          promotion_id_snapshot?: string | null
          promotion_title_snapshot?: string | null
          proposed_price_reason?: string | null
          proposed_quantity?: number | null
          proposed_unit_price?: number | null
          quantity?: number
          requested_quantity?: number
          unit_price_snapshot?: number
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_adjusted_by_fkey"
            columns: ["adjusted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          notes: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_adjusted_at: string | null
          business_name_snapshot: string | null
          contact_name_snapshot: string | null
          created_at: string
          created_by: string | null
          customer_adjustment_note: string | null
          customer_confirmed_at: string | null
          customer_id: string
          customer_payment_requested_at: string | null
          delivery_address_fingerprint: string | null
          delivery_address_id: string | null
          delivery_address_snapshot: Json | null
          id: string
          idempotency_key: string | null
          idempotency_payload_hash: string | null
          notes: string | null
          order_number: string
          organization_id: string
          payment_request_status: string
          payment_terms: string
          phone_snapshot: string | null
          quantity_review_required: boolean
          status: string
          total_amount: number
          total_items: number
          updated_at: string
        }
        Insert: {
          admin_adjusted_at?: string | null
          business_name_snapshot?: string | null
          contact_name_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          customer_adjustment_note?: string | null
          customer_confirmed_at?: string | null
          customer_id: string
          customer_payment_requested_at?: string | null
          delivery_address_fingerprint?: string | null
          delivery_address_id?: string | null
          delivery_address_snapshot?: Json | null
          id?: string
          idempotency_key?: string | null
          idempotency_payload_hash?: string | null
          notes?: string | null
          order_number: string
          organization_id: string
          payment_request_status?: string
          payment_terms?: string
          phone_snapshot?: string | null
          quantity_review_required?: boolean
          status?: string
          total_amount?: number
          total_items?: number
          updated_at?: string
        }
        Update: {
          admin_adjusted_at?: string | null
          business_name_snapshot?: string | null
          contact_name_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          customer_adjustment_note?: string | null
          customer_confirmed_at?: string | null
          customer_id?: string
          customer_payment_requested_at?: string | null
          delivery_address_fingerprint?: string | null
          delivery_address_id?: string | null
          delivery_address_snapshot?: Json | null
          id?: string
          idempotency_key?: string | null
          idempotency_payload_hash?: string | null
          notes?: string | null
          order_number?: string
          organization_id?: string
          payment_request_status?: string
          payment_terms?: string
          phone_snapshot?: string | null
          quantity_review_required?: boolean
          status?: string
          total_amount?: number
          total_items?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_orders_customer_org_fk"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      outbox_event_deliveries: {
        Row: {
          completed_at: string
          consumer_key: string
          event_id: string
          organization_id: string
          result: Json
        }
        Insert: {
          completed_at?: string
          consumer_key: string
          event_id: string
          organization_id: string
          result?: Json
        }
        Update: {
          completed_at?: string
          consumer_key?: string
          event_id?: string
          organization_id?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "outbox_event_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "outbox_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_event_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox_events: {
        Row: {
          aggregate_id: string | null
          attempts: number
          created_at: string
          dead_letter_at: string | null
          error_class: string | null
          event_key: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          last_attempt_at: string | null
          last_error: Json | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          organization_id: string | null
          payload: Json | null
          payload_schema_version: number
          processed_at: string | null
          provider_reference: string | null
          status: string
        }
        Insert: {
          aggregate_id?: string | null
          attempts?: number
          created_at?: string
          dead_letter_at?: string | null
          error_class?: string | null
          event_key?: string | null
          event_type: string
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          last_error?: Json | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          organization_id?: string | null
          payload?: Json | null
          payload_schema_version?: number
          processed_at?: string | null
          provider_reference?: string | null
          status?: string
        }
        Update: {
          aggregate_id?: string | null
          attempts?: number
          created_at?: string
          dead_letter_at?: string | null
          error_class?: string | null
          event_key?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          last_error?: Json | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          organization_id?: string | null
          payload?: Json | null
          payload_schema_version?: number
          processed_at?: string | null
          provider_reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbox_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      price_change_log: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_price: number | null
          old_price: number | null
          product_id: string | null
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_price?: number | null
          old_price?: number | null
          product_id?: string | null
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_price?: number | null
          old_price?: number | null
          product_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_change_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_change_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rule_approval_context: {
        Row: {
          actor_id: string
          created_at: string
          rule_id: string
          transaction_id: number
        }
        Insert: {
          actor_id: string
          created_at?: string
          rule_id: string
          transaction_id: number
        }
        Update: {
          actor_id?: string
          created_at?: string
          rule_id?: string
          transaction_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rule_approval_context_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rule_approval_context_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          adjustment_type: string
          adjustment_value: number
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          base_source: string
          base_type: string
          calculation_method: string
          created_at: string
          effective_from: string | null
          effective_until: string | null
          id: string
          is_active: boolean
          manually_locked: boolean
          max_price: number | null
          min_price: number | null
          min_quantity: number
          name: string
          organization_id: string
          priority: number
          requires_approval: boolean
          scope_type: string
          scope_value: string | null
          submitted_by: string | null
          target_tier: string
          updated_at: string
          version: number
        }
        Insert: {
          adjustment_type?: string
          adjustment_value?: number
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          base_source?: string
          base_type?: string
          calculation_method?: string
          created_at?: string
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean
          manually_locked?: boolean
          max_price?: number | null
          min_price?: number | null
          min_quantity?: number
          name: string
          organization_id: string
          priority?: number
          requires_approval?: boolean
          scope_type?: string
          scope_value?: string | null
          submitted_by?: string | null
          target_tier?: string
          updated_at?: string
          version?: number
        }
        Update: {
          adjustment_type?: string
          adjustment_value?: number
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          base_source?: string
          base_type?: string
          calculation_method?: string
          created_at?: string
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean
          manually_locked?: boolean
          max_price?: number | null
          min_price?: number | null
          min_quantity?: number
          name?: string
          organization_id?: string
          priority?: number
          requires_approval?: boolean
          scope_type?: string
          scope_value?: string | null
          submitted_by?: string | null
          target_tier?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          min_quantity: number
          price: number
          product_id: string
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          min_quantity?: number
          price?: number
          product_id: string
          tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          min_quantity?: number
          price?: number
          product_id?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_unit_conversions: {
        Row: {
          base_units_per_unit: number
          created_at: string
          id: string
          organization_id: string
          product_id: string
          unit_name: string
          updated_at: string
        }
        Insert: {
          base_units_per_unit: number
          created_at?: string
          id?: string
          organization_id: string
          product_id: string
          unit_name: string
          updated_at?: string
        }
        Update: {
          base_units_per_unit?: number
          created_at?: string
          id?: string
          organization_id?: string
          product_id?: string
          unit_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_unit_conversions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_unit_conversions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          base_price: number
          category_id: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_featured: boolean
          item_code: string
          max_stock: number | null
          min_order_quantity: number
          min_stock: number | null
          name: string
          name_en: string | null
          normalization_version: number
          order_quantity_multiple: number
          organization_id: string
          retail_price: number
          search_name_norm: string
          sku: string | null
          sort_order: number
          status: string
          unit: string
          updated_at: string
          wholesale_price: number
        }
        Insert: {
          barcode?: string | null
          base_price?: number
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          item_code: string
          max_stock?: number | null
          min_order_quantity?: number
          min_stock?: number | null
          name: string
          name_en?: string | null
          normalization_version?: number
          order_quantity_multiple?: number
          organization_id: string
          retail_price?: number
          search_name_norm: string
          sku?: string | null
          sort_order?: number
          status?: string
          unit?: string
          updated_at?: string
          wholesale_price?: number
        }
        Update: {
          barcode?: string | null
          base_price?: number
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          item_code?: string
          max_stock?: number | null
          min_order_quantity?: number
          min_stock?: number | null
          name?: string
          name_en?: string | null
          normalization_version?: number
          order_quantity_multiple?: number
          organization_id?: string
          retail_price?: number
          search_name_norm?: string
          sku?: string | null
          sort_order?: number
          status?: string
          unit?: string
          updated_at?: string
          wholesale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_products_category_org_fk"
            columns: ["category_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      profile_notification_channel_consents: {
        Row: {
          channel: string
          consent_version: string
          created_at: string
          data_classes: string[]
          destination_id: string
          destination_label: string
          granted_at: string
          id: string
          organization_id: string
          profile_id: string
          purpose: string
          revoked_at: string | null
          source: string
        }
        Insert: {
          channel: string
          consent_version: string
          created_at?: string
          data_classes: string[]
          destination_id: string
          destination_label: string
          granted_at?: string
          id?: string
          organization_id: string
          profile_id: string
          purpose: string
          revoked_at?: string | null
          source?: string
        }
        Update: {
          channel?: string
          consent_version?: string
          created_at?: string
          data_classes?: string[]
          destination_id?: string
          destination_label?: string
          granted_at?: string
          id?: string
          organization_id?: string
          profile_id?: string
          purpose?: string
          revoked_at?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_notification_channel_consents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_personalization_preferences: {
        Row: {
          detail_level: string
          external_processing_enabled: boolean
          notification_channels: string[]
          notification_level: string
          organization_id: string
          personalization_enabled: boolean
          profile_id: string
          quiet_hours_enabled: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          quiet_hours_time_zone: string
          reduced_motion: boolean
          updated_at: string
        }
        Insert: {
          detail_level?: string
          external_processing_enabled?: boolean
          notification_channels?: string[]
          notification_level?: string
          organization_id: string
          personalization_enabled?: boolean
          profile_id: string
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          quiet_hours_time_zone?: string
          reduced_motion?: boolean
          updated_at?: string
        }
        Update: {
          detail_level?: string
          external_processing_enabled?: boolean
          notification_channels?: string[]
          notification_level?: string
          organization_id?: string
          personalization_enabled?: boolean
          profile_id?: string
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          quiet_hours_time_zone?: string
          reduced_motion?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_personalization_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          organization_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
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
      promotions: {
        Row: {
          category_ids: string[] | null
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          end_date: string
          id: string
          is_active: boolean
          organization_id: string
          product_ids: string[] | null
          start_date: string
          title: string
        }
        Insert: {
          category_ids?: string[] | null
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date: string
          id?: string
          is_active?: boolean
          organization_id: string
          product_ids?: string[] | null
          start_date: string
          title: string
        }
        Update: {
          category_ids?: string[] | null
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          product_ids?: string[] | null
          start_date?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          item_code_snapshot: string
          line_total: number | null
          organization_id: string
          product_id: string
          product_name_snapshot: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number
          unit_cost: number | null
          unit_snapshot: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_code_snapshot: string
          line_total?: number | null
          organization_id: string
          product_id: string
          product_name_snapshot: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number
          unit_cost?: number | null
          unit_snapshot?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_code_snapshot?: string
          line_total?: number | null
          organization_id?: string
          product_id?: string
          product_name_snapshot?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number
          unit_cost?: number | null
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_po_items_parent_org_fk"
            columns: ["purchase_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_po_items_product_org_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          notes: string | null
          organization_id: string
          payload_fingerprint: string
          purchase_order_number: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          supplier_id: string
          total_cost: number | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          notes?: string | null
          organization_id: string
          payload_fingerprint: string
          purchase_order_number: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          supplier_id: string
          total_cost?: number | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          notes?: string | null
          organization_id?: string
          payload_fingerprint?: string
          purchase_order_number?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          supplier_id?: string
          total_cost?: number | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_purchase_orders_supplier_org_fk"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_purchase_orders_warehouse_org_fk"
            columns: ["warehouse_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      purchase_receipt_accounting_postings: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          id: string
          idempotency_key: string
          inventory_account_id: string
          journal_entry_id: string
          organization_id: string
          payable_account_id: string
          payload_fingerprint: string
          receipt_id: string
          source_amount: number
          source_currency: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          idempotency_key: string
          inventory_account_id: string
          journal_entry_id: string
          organization_id: string
          payable_account_id: string
          payload_fingerprint: string
          receipt_id: string
          source_amount: number
          source_currency: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          idempotency_key?: string
          inventory_account_id?: string
          journal_entry_id?: string
          organization_id?: string
          payable_account_id?: string
          payload_fingerprint?: string
          receipt_id?: string
          source_amount?: number
          source_currency?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipt_accounting_p_organization_id_inventory_ac_fkey"
            columns: ["organization_id", "inventory_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_receipt_accounting_p_organization_id_journal_entr_fkey"
            columns: ["organization_id", "journal_entry_id"]
            isOneToOne: true
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_receipt_accounting_p_organization_id_payable_acco_fkey"
            columns: ["organization_id", "payable_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_receipt_accounting_postings_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_accounting_postings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_accounting_postings_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipt_items: {
        Row: {
          batch_number: string | null
          created_at: string
          expiry_date: string | null
          id: string
          line_total: number | null
          organization_id: string
          product_id: string
          purchase_order_item_id: string
          quantity_received: number
          receipt_id: string
          unit_cost: number | null
        }
        Insert: {
          batch_number?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          line_total?: number | null
          organization_id: string
          product_id: string
          purchase_order_item_id: string
          quantity_received: number
          receipt_id: string
          unit_cost?: number | null
        }
        Update: {
          batch_number?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          line_total?: number | null
          organization_id?: string
          product_id?: string
          purchase_order_item_id?: string
          quantity_received?: number
          receipt_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipt_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_receipt_items_po_item_org_fk"
            columns: ["purchase_order_item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_receipt_items_product_org_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_receipt_items_receipt_org_fk"
            columns: ["receipt_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      purchase_receipts: {
        Row: {
          id: string
          idempotency_key: string
          notes: string | null
          organization_id: string
          payload_fingerprint: string
          purchase_order_id: string
          receipt_number: string
          received_at: string
          received_by: string
          received_cost: number | null
          warehouse_id: string
        }
        Insert: {
          id?: string
          idempotency_key: string
          notes?: string | null
          organization_id: string
          payload_fingerprint: string
          purchase_order_id: string
          receipt_number: string
          received_at?: string
          received_by: string
          received_cost?: number | null
          warehouse_id: string
        }
        Update: {
          id?: string
          idempotency_key?: string
          notes?: string | null
          organization_id?: string
          payload_fingerprint?: string
          purchase_order_id?: string
          receipt_number?: string
          received_at?: string
          received_by?: string
          received_cost?: number | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_purchase_receipts_order_org_fk"
            columns: ["purchase_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_purchase_receipts_warehouse_org_fk"
            columns: ["warehouse_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      purchase_supplier_credit_note_accounting_drafts: {
        Row: {
          actual_amount: number
          created_at: string
          created_by_profile_id: string
          credit_note_id: string
          currency: string
          id: string
          idempotency_key: string
          inventory_account_id: string
          journal_entry_id: string
          organization_id: string
          payable_account_id: string
          payload_fingerprint: string
          source_amount: number
          source_journal_entry_id: string
          source_receipt_id: string
          supplier_return_id: string
          variance_account_id: string | null
          variance_amount: number
        }
        Insert: {
          actual_amount: number
          created_at?: string
          created_by_profile_id: string
          credit_note_id: string
          currency: string
          id?: string
          idempotency_key: string
          inventory_account_id: string
          journal_entry_id: string
          organization_id: string
          payable_account_id: string
          payload_fingerprint: string
          source_amount: number
          source_journal_entry_id: string
          source_receipt_id: string
          supplier_return_id: string
          variance_account_id?: string | null
          variance_amount: number
        }
        Update: {
          actual_amount?: number
          created_at?: string
          created_by_profile_id?: string
          credit_note_id?: string
          currency?: string
          id?: string
          idempotency_key?: string
          inventory_account_id?: string
          journal_entry_id?: string
          organization_id?: string
          payable_account_id?: string
          payload_fingerprint?: string
          source_amount?: number
          source_journal_entry_id?: string
          source_receipt_id?: string
          supplier_return_id?: string
          variance_account_id?: string | null
          variance_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_credit_not_organization_id_credit_note__fkey1"
            columns: ["organization_id", "credit_note_id"]
            isOneToOne: true
            referencedRelation: "purchase_supplier_credit_notes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_not_organization_id_supplier_ret_fkey1"
            columns: ["organization_id", "supplier_return_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_returns"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_note_accoun_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_note_accounting_d_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_note_accounting_source_receipt_id_fkey"
            columns: ["source_receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_note_organization_id_inventory_ac_fkey"
            columns: ["organization_id", "inventory_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_note_organization_id_journal_entr_fkey"
            columns: ["organization_id", "journal_entry_id"]
            isOneToOne: true
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_note_organization_id_payable_acco_fkey"
            columns: ["organization_id", "payable_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_note_organization_id_source_journ_fkey"
            columns: ["organization_id", "source_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_note_organization_id_variance_acc_fkey"
            columns: ["organization_id", "variance_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      purchase_supplier_credit_note_review_events: {
        Row: {
          action: string
          actor_profile_id: string
          created_at: string
          credit_note_id: string
          details: Json
          id: string
          organization_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_profile_id: string
          created_at?: string
          credit_note_id: string
          details?: Json
          id?: string
          organization_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string
          created_at?: string
          credit_note_id?: string
          details?: Json
          id?: string
          organization_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_credit_note_organization_id_credit_note__fkey"
            columns: ["organization_id", "credit_note_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_credit_notes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_note_review_even_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_note_review_event_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_credit_notes: {
        Row: {
          actual_amount: number
          created_at: string
          created_by_profile_id: string
          currency: string
          id: string
          idempotency_key: string
          issued_on: string
          organization_id: string
          payload_fingerprint: string
          source_amount: number
          status: string
          supplier_credit_note_number: string
          supplier_id: string
          supplier_return_id: string
          updated_at: string
          variance_amount: number
          variance_review_reason: string | null
          variance_reviewed_at: string | null
          variance_reviewed_by_profile_id: string | null
        }
        Insert: {
          actual_amount: number
          created_at?: string
          created_by_profile_id: string
          currency: string
          id?: string
          idempotency_key: string
          issued_on: string
          organization_id: string
          payload_fingerprint: string
          source_amount: number
          status: string
          supplier_credit_note_number: string
          supplier_id: string
          supplier_return_id: string
          updated_at?: string
          variance_amount: number
          variance_review_reason?: string | null
          variance_reviewed_at?: string | null
          variance_reviewed_by_profile_id?: string | null
        }
        Update: {
          actual_amount?: number
          created_at?: string
          created_by_profile_id?: string
          currency?: string
          id?: string
          idempotency_key?: string
          issued_on?: string
          organization_id?: string
          payload_fingerprint?: string
          source_amount?: number
          status?: string
          supplier_credit_note_number?: string
          supplier_id?: string
          supplier_return_id?: string
          updated_at?: string
          variance_amount?: number
          variance_review_reason?: string | null
          variance_reviewed_at?: string | null
          variance_reviewed_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_credit_note_organization_id_supplier_ret_fkey"
            columns: ["organization_id", "supplier_return_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_returns"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_note_variance_reviewed_by_profile_fkey"
            columns: ["variance_reviewed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_notes_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_credit_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_invoice_accounting_drafts: {
        Row: {
          created_at: string
          created_by_profile_id: string
          currency: string
          handoff_sequence: number
          handoff_status: string
          id: string
          idempotency_key: string
          invoice_id: string
          invoice_merchandise_subtotal: number
          invoice_tax_amount: number
          invoice_total_amount: number
          journal_entry_id: string | null
          merchandise_variance_account_id: string | null
          merchandise_variance_amount: number
          net_adjustment_amount: number
          organization_id: string
          payload_fingerprint: string
          source_merchandise_amount: number
          source_payable_account_id: string
          tax_account_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          currency: string
          handoff_sequence: number
          handoff_status: string
          id?: string
          idempotency_key: string
          invoice_id: string
          invoice_merchandise_subtotal: number
          invoice_tax_amount: number
          invoice_total_amount: number
          journal_entry_id?: string | null
          merchandise_variance_account_id?: string | null
          merchandise_variance_amount: number
          net_adjustment_amount: number
          organization_id: string
          payload_fingerprint: string
          source_merchandise_amount: number
          source_payable_account_id: string
          tax_account_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          currency?: string
          handoff_sequence?: number
          handoff_status?: string
          id?: string
          idempotency_key?: string
          invoice_id?: string
          invoice_merchandise_subtotal?: number
          invoice_tax_amount?: number
          invoice_total_amount?: number
          journal_entry_id?: string | null
          merchandise_variance_account_id?: string | null
          merchandise_variance_amount?: number
          net_adjustment_amount?: number
          organization_id?: string
          payload_fingerprint?: string
          source_merchandise_amount?: number
          source_payable_account_id?: string
          tax_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_invoice_acc_organization_id_journal_entr_fkey"
            columns: ["organization_id", "journal_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_acc_organization_id_merchandise__fkey"
            columns: ["organization_id", "merchandise_variance_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_acc_organization_id_source_payab_fkey"
            columns: ["organization_id", "source_payable_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_acc_organization_id_tax_account__fkey"
            columns: ["organization_id", "tax_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_accou_organization_id_invoice_id_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_accounting_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_accounting_draft_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_invoice_due_dates: {
        Row: {
          due_date: string
          id: string
          idempotency_key: string
          invoice_id: string
          organization_id: string
          payload_fingerprint: string
          reason: string
          recorded_at: string
          recorded_by_profile_id: string
          source_evidence_id: string
          source_reference: string
        }
        Insert: {
          due_date: string
          id?: string
          idempotency_key: string
          invoice_id: string
          organization_id: string
          payload_fingerprint: string
          reason: string
          recorded_at?: string
          recorded_by_profile_id: string
          source_evidence_id: string
          source_reference: string
        }
        Update: {
          due_date?: string
          id?: string
          idempotency_key?: string
          invoice_id?: string
          organization_id?: string
          payload_fingerprint?: string
          reason?: string
          recorded_at?: string
          recorded_by_profile_id?: string
          source_evidence_id?: string
          source_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_invoice_due_d_organization_id_invoice_id_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: true
            referencedRelation: "purchase_supplier_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_due_dates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_due_dates_recorded_by_profile_id_fkey"
            columns: ["recorded_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_due_organization_id_source_evide_fkey"
            columns: ["organization_id", "source_evidence_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_invoice_evidence"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      purchase_supplier_invoice_events: {
        Row: {
          action: string
          actor_profile_id: string
          created_at: string
          details: Json
          id: string
          invoice_id: string
          organization_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_profile_id: string
          created_at?: string
          details?: Json
          id?: string
          invoice_id: string
          organization_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string
          created_at?: string
          details?: Json
          id?: string
          invoice_id?: string
          organization_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_invoice_event_organization_id_invoice_id_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_invoice_evidence: {
        Row: {
          byte_size: number
          content_sha256: string
          created_at: string
          file_name: string
          id: string
          invoice_id: string
          mime_type: string
          organization_id: string
          storage_path: string
          uploaded_by_profile_id: string
        }
        Insert: {
          byte_size: number
          content_sha256: string
          created_at?: string
          file_name: string
          id?: string
          invoice_id: string
          mime_type: string
          organization_id: string
          storage_path: string
          uploaded_by_profile_id: string
        }
        Update: {
          byte_size?: number
          content_sha256?: string
          created_at?: string
          file_name?: string
          id?: string
          invoice_id?: string
          mime_type?: string
          organization_id?: string
          storage_path?: string
          uploaded_by_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_invoice_evide_organization_id_invoice_id_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_evidence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_evidence_uploaded_by_profile_id_fkey"
            columns: ["uploaded_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_invoice_lines: {
        Row: {
          actual_line_total: number
          created_at: string
          expected_line_total: number
          id: string
          invoice_id: string
          invoiced_quantity: number
          invoiced_unit_cost: number
          item_code_snapshot: string
          ordered_unit_cost: number
          organization_id: string
          price_match: boolean
          product_id: string
          product_name_snapshot: string
          purchase_order_item_id: string
          receipt_id: string
          receipt_item_id: string
          received_unit_cost: number
          source_received_quantity: number
          unit_snapshot: string | null
        }
        Insert: {
          actual_line_total: number
          created_at?: string
          expected_line_total: number
          id?: string
          invoice_id: string
          invoiced_quantity: number
          invoiced_unit_cost: number
          item_code_snapshot: string
          ordered_unit_cost: number
          organization_id: string
          price_match: boolean
          product_id: string
          product_name_snapshot: string
          purchase_order_item_id: string
          receipt_id: string
          receipt_item_id: string
          received_unit_cost: number
          source_received_quantity: number
          unit_snapshot?: string | null
        }
        Update: {
          actual_line_total?: number
          created_at?: string
          expected_line_total?: number
          id?: string
          invoice_id?: string
          invoiced_quantity?: number
          invoiced_unit_cost?: number
          item_code_snapshot?: string
          ordered_unit_cost?: number
          organization_id?: string
          price_match?: boolean
          product_id?: string
          product_name_snapshot?: string
          purchase_order_item_id?: string
          receipt_id?: string
          receipt_item_id?: string
          received_unit_cost?: number
          source_received_quantity?: number
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_invoice_lin_organization_id_purchase_ord_fkey"
            columns: ["organization_id", "purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_lin_organization_id_receipt_item_fkey"
            columns: ["organization_id", "receipt_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipt_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_lines_organization_id_invoice_id_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_lines_organization_id_receipt_id_fkey"
            columns: ["organization_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_invoices: {
        Row: {
          created_at: string
          created_by_profile_id: string
          currency: string
          expected_merchandise_subtotal: number
          id: string
          idempotency_key: string
          invoice_date: string
          invoice_total_amount: number
          match_status: string
          merchandise_subtotal: number
          merchandise_variance_amount: number
          organization_id: string
          payload_fingerprint: string
          purchase_order_id: string
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by_profile_id: string | null
          supplier_id: string
          supplier_invoice_number: string
          tax_accounting_status: string
          tax_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          currency: string
          expected_merchandise_subtotal: number
          id?: string
          idempotency_key: string
          invoice_date: string
          invoice_total_amount: number
          match_status: string
          merchandise_subtotal: number
          merchandise_variance_amount: number
          organization_id: string
          payload_fingerprint: string
          purchase_order_id: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_profile_id?: string | null
          supplier_id: string
          supplier_invoice_number: string
          tax_accounting_status: string
          tax_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          currency?: string
          expected_merchandise_subtotal?: number
          id?: string
          idempotency_key?: string
          invoice_date?: string
          invoice_total_amount?: number
          match_status?: string
          merchandise_subtotal?: number
          merchandise_variance_amount?: number
          organization_id?: string
          payload_fingerprint?: string
          purchase_order_id?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_profile_id?: string | null
          supplier_id?: string
          supplier_invoice_number?: string
          tax_accounting_status?: string
          tax_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_invoices_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoices_organization_id_purchase_order__fkey"
            columns: ["organization_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoices_organization_id_supplier_id_fkey"
            columns: ["organization_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_invoices_reviewed_by_profile_id_fkey"
            columns: ["reviewed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_payment_accounting_drafts: {
        Row: {
          created_at: string
          created_by_profile_id: string
          currency: string
          id: string
          idempotency_key: string
          journal_entry_id: string
          organization_id: string
          payable_account_id: string
          payload_fingerprint: string
          payment_id: string
          settlement_account_id: string
          source_amount: number
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          currency: string
          id?: string
          idempotency_key: string
          journal_entry_id: string
          organization_id: string
          payable_account_id: string
          payload_fingerprint: string
          payment_id: string
          settlement_account_id: string
          source_amount: number
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          currency?: string
          id?: string
          idempotency_key?: string
          journal_entry_id?: string
          organization_id?: string
          payable_account_id?: string
          payload_fingerprint?: string
          payment_id?: string
          settlement_account_id?: string
          source_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_payment_acc_organization_id_journal_entr_fkey"
            columns: ["organization_id", "journal_entry_id"]
            isOneToOne: true
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_acc_organization_id_payable_acco_fkey"
            columns: ["organization_id", "payable_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_acc_organization_id_settlement_a_fkey"
            columns: ["organization_id", "settlement_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_accou_organization_id_payment_id_fkey"
            columns: ["organization_id", "payment_id"]
            isOneToOne: true
            referencedRelation: "purchase_supplier_payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_accounting_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_accounting_draft_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_payment_allocations: {
        Row: {
          allocated_amount: number
          created_at: string
          currency: string
          id: string
          organization_id: string
          payable_account_id: string
          payment_id: string
          receipt_id: string
          source_journal_entry_id: string
        }
        Insert: {
          allocated_amount: number
          created_at?: string
          currency: string
          id?: string
          organization_id: string
          payable_account_id: string
          payment_id: string
          receipt_id: string
          source_journal_entry_id: string
        }
        Update: {
          allocated_amount?: number
          created_at?: string
          currency?: string
          id?: string
          organization_id?: string
          payable_account_id?: string
          payment_id?: string
          receipt_id?: string
          source_journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_payment_all_organization_id_payable_acco_fkey"
            columns: ["organization_id", "payable_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_all_organization_id_source_journ_fkey"
            columns: ["organization_id", "source_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_alloc_organization_id_payment_id_fkey"
            columns: ["organization_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_alloc_organization_id_receipt_id_fkey"
            columns: ["organization_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_payment_events: {
        Row: {
          action: string
          actor_profile_id: string
          created_at: string
          details: Json
          id: string
          organization_id: string
          payment_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_profile_id: string
          created_at?: string
          details?: Json
          id?: string
          organization_id: string
          payment_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string
          created_at?: string
          details?: Json
          id?: string
          organization_id?: string
          payment_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_payment_event_organization_id_payment_id_fkey"
            columns: ["organization_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_payment_reconciliation_events: {
        Row: {
          action: string
          actor_profile_id: string
          created_at: string
          currency: string
          evidence_reference: string
          evidence_type: string
          id: string
          idempotency_key: string
          observed_amount: number
          organization_id: string
          payload_fingerprint: string
          payment_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_profile_id: string
          created_at?: string
          currency: string
          evidence_reference: string
          evidence_type: string
          id?: string
          idempotency_key: string
          observed_amount: number
          organization_id: string
          payload_fingerprint: string
          payment_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string
          created_at?: string
          currency?: string
          evidence_reference?: string
          evidence_type?: string
          id?: string
          idempotency_key?: string
          observed_amount?: number
          organization_id?: string
          payload_fingerprint?: string
          payment_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_payment_recon_organization_id_payment_id_fkey"
            columns: ["organization_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_reconciliation__actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_reconciliation_e_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_payment_settlement_accounts: {
        Row: {
          accounting_account_id: string
          created_at: string
          created_by_profile_id: string
          currency: string
          display_name: string
          id: string
          is_active: boolean
          organization_id: string
          settlement_kind: string
        }
        Insert: {
          accounting_account_id: string
          created_at?: string
          created_by_profile_id: string
          currency: string
          display_name: string
          id?: string
          is_active?: boolean
          organization_id: string
          settlement_kind: string
        }
        Update: {
          accounting_account_id?: string
          created_at?: string
          created_by_profile_id?: string
          currency?: string
          display_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          settlement_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_payment_set_organization_id_accounting_a_fkey"
            columns: ["organization_id", "accounting_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_settlement_accou_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_payment_settlement_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by_profile_id: string
          currency: string
          id: string
          idempotency_key: string
          organization_id: string
          payable_account_id: string
          payload_fingerprint: string
          payment_date: string
          payment_method: string
          payment_number: number
          payment_reference: string
          settlement_account_id: string
          settlement_account_mapping_id: string
          status: string
          supplier_id: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by_profile_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by_profile_id: string
          currency: string
          id?: string
          idempotency_key: string
          organization_id: string
          payable_account_id: string
          payload_fingerprint: string
          payment_date: string
          payment_method: string
          payment_number?: never
          payment_reference: string
          settlement_account_id: string
          settlement_account_mapping_id: string
          status?: string
          supplier_id: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_profile_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by_profile_id?: string
          currency?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          payable_account_id?: string
          payload_fingerprint?: string
          payment_date?: string
          payment_method?: string
          payment_number?: never
          payment_reference?: string
          settlement_account_id?: string
          settlement_account_mapping_id?: string
          status?: string
          supplier_id?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_payments_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_payments_organization_id_payable_account_fkey"
            columns: ["organization_id", "payable_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payments_organization_id_settlement_acc_fkey1"
            columns: ["organization_id", "settlement_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payments_organization_id_settlement_acco_fkey"
            columns: ["organization_id", "settlement_account_mapping_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_payment_settlement_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payments_organization_id_supplier_id_fkey"
            columns: ["organization_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_payments_voided_by_profile_id_fkey"
            columns: ["voided_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_quote_items: {
        Row: {
          created_at: string
          id: string
          item_code_snapshot: string
          line_total: number
          organization_id: string
          product_id: string
          product_name_snapshot: string
          quantity_quoted: number
          quote_id: string
          unit_cost: number
          unit_snapshot: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_code_snapshot: string
          line_total: number
          organization_id: string
          product_id: string
          product_name_snapshot: string
          quantity_quoted: number
          quote_id: string
          unit_cost: number
          unit_snapshot?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_code_snapshot?: string
          line_total?: number
          organization_id?: string
          product_id?: string
          product_name_snapshot?: string
          quantity_quoted?: number
          quote_id?: string
          unit_cost?: number
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_quote_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_quote_items_quote_id_fkey1"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_quotes: {
        Row: {
          created_at: string
          created_by: string
          currency: string
          delivery_days: number | null
          id: string
          idempotency_key: string
          notes: string | null
          organization_id: string
          payload_fingerprint: string
          payment_terms: string | null
          purchase_order_id: string | null
          quote_number: string
          status: string
          supplier_id: string
          supplier_reference: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          currency: string
          delivery_days?: number | null
          id?: string
          idempotency_key: string
          notes?: string | null
          organization_id: string
          payload_fingerprint: string
          payment_terms?: string | null
          purchase_order_id?: string | null
          quote_number: string
          status?: string
          supplier_id: string
          supplier_reference?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: string
          delivery_days?: number | null
          id?: string
          idempotency_key?: string
          notes?: string | null
          organization_id?: string
          payload_fingerprint?: string
          payment_terms?: string | null
          purchase_order_id?: string | null
          quote_number?: string
          status?: string
          supplier_id?: string
          supplier_reference?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_quotes_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_return_items: {
        Row: {
          created_at: string
          id: string
          item_code_snapshot: string
          line_total: number | null
          organization_id: string
          product_id: string
          product_name_snapshot: string
          purchase_order_item_id: string
          quantity_returned: number
          return_id: string
          source_receipt_item_id: string
          source_received_quantity: number
          unit_cost: number | null
          unit_snapshot: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_code_snapshot: string
          line_total?: number | null
          organization_id: string
          product_id: string
          product_name_snapshot: string
          purchase_order_item_id: string
          quantity_returned: number
          return_id: string
          source_receipt_item_id: string
          source_received_quantity: number
          unit_cost?: number | null
          unit_snapshot?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_code_snapshot?: string
          line_total?: number | null
          organization_id?: string
          product_id?: string
          product_name_snapshot?: string
          purchase_order_item_id?: string
          quantity_returned?: number
          return_id?: string
          source_receipt_item_id?: string
          source_received_quantity?: number
          unit_cost?: number | null
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_return_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_return_items_organization_id_return_id_fkey"
            columns: ["organization_id", "return_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_returns"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_supplier_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_return_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "purchase_supplier_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_return_items_source_receipt_item_id_fkey"
            columns: ["source_receipt_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipt_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_supplier_returns: {
        Row: {
          created_at: string
          created_by: string
          currency: string
          id: string
          idempotency_key: string
          notes: string | null
          organization_id: string
          payload_fingerprint: string
          posted_at: string | null
          posted_by: string | null
          purchase_order_id: string
          reason: string
          return_number: string
          source_receipt_id: string
          status: string
          supplier_id: string
          total_cost: number | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          currency: string
          id?: string
          idempotency_key: string
          notes?: string | null
          organization_id: string
          payload_fingerprint: string
          posted_at?: string | null
          posted_by?: string | null
          purchase_order_id: string
          reason: string
          return_number: string
          source_receipt_id: string
          status?: string
          supplier_id: string
          total_cost?: number | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          idempotency_key?: string
          notes?: string | null
          organization_id?: string
          payload_fingerprint?: string
          posted_at?: string | null
          posted_by?: string | null
          purchase_order_id?: string
          reason?: string
          return_number?: string
          source_receipt_id?: string
          status?: string
          supplier_id?: string
          total_cost?: number | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_supplier_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_returns_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_returns_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_returns_source_receipt_id_fkey"
            columns: ["source_receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_supplier_returns_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      reorder_template_items: {
        Row: {
          created_at: string
          id: string
          item_code: string | null
          organization_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_code?: string | null
          organization_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_code?: string | null
          organization_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reorder_template_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_template_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "reorder_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_reorder_template_items_product_org_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_reorder_template_items_template_org_fk"
            columns: ["template_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reorder_templates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      reorder_templates: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          name: string
          organization_id: string
          source_order_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          name: string
          organization_id: string
          source_order_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          name?: string
          organization_id?: string
          source_order_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reorder_templates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_templates_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_reorder_templates_customer_org_fk"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_reorder_templates_source_order_org_fk"
            columns: ["source_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      sales_quote_items: {
        Row: {
          created_at: string
          id: string
          item_code: string | null
          organization_id: string
          product_id: string | null
          product_name_snapshot: string
          quote_id: string
          quoted_unit_price: number | null
          requested_quantity: number
          target_unit_price: number | null
          unit_snapshot: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_code?: string | null
          organization_id: string
          product_id?: string | null
          product_name_snapshot: string
          quote_id: string
          quoted_unit_price?: number | null
          requested_quantity: number
          target_unit_price?: number | null
          unit_snapshot?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_code?: string | null
          organization_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quote_id?: string
          quoted_unit_price?: number | null
          requested_quantity?: number
          target_unit_price?: number | null
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_quote_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_sales_quote_items_product_org_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_sales_quote_items_quote_org_fk"
            columns: ["quote_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      sales_quotes: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          notes: string | null
          organization_id: string
          quote_number: string
          quoted_at: string | null
          responded_by: string | null
          response_note: string | null
          status: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          organization_id: string
          quote_number: string
          quoted_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          status?: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          quote_number?: string
          quoted_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          status?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_sales_quotes_customer_org_fk"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      stock_count_lines: {
        Row: {
          completed_at: string | null
          completed_quantity: number | null
          counted_at: string | null
          counted_by: string | null
          counted_quantity: number | null
          expected_last_movement_at: string | null
          expected_quantity: number
          expected_reserved_quantity: number
          id: string
          organization_id: string
          product_code: string
          product_id: string
          product_name: string
          session_id: string
          unit: string | null
          variance: number | null
        }
        Insert: {
          completed_at?: string | null
          completed_quantity?: number | null
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          expected_last_movement_at?: string | null
          expected_quantity: number
          expected_reserved_quantity: number
          id?: string
          organization_id: string
          product_code: string
          product_id: string
          product_name: string
          session_id: string
          unit?: string | null
          variance?: number | null
        }
        Update: {
          completed_at?: string | null
          completed_quantity?: number | null
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          expected_last_movement_at?: string | null
          expected_quantity?: number
          expected_reserved_quantity?: number
          id?: string
          organization_id?: string
          product_code?: string
          product_id?: string
          product_name?: string
          session_id?: string
          unit?: string | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_lines_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stock_count_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_sessions: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          completed_by: string | null
          counted_lines: number
          id: string
          idempotency_key: string
          notes: string | null
          organization_id: string
          started_at: string
          started_by: string
          status: string
          total_lines: number
          warehouse_id: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          counted_lines?: number
          id?: string
          idempotency_key: string
          notes?: string | null
          organization_id: string
          started_at?: string
          started_by: string
          status?: string
          total_lines?: number
          warehouse_id: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          counted_lines?: number
          id?: string
          idempotency_key?: string
          notes?: string | null
          organization_id?: string
          started_at?: string
          started_by?: string
          status?: string
          total_lines?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_sessions_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_sessions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_sessions_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_sessions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_announcements: {
        Row: {
          audience: string
          color: string
          content: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          href: string | null
          id: string
          is_active: boolean
          organization_id: string
          priority: number
          starts_at: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: string
          color?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          href?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          priority?: number
          starts_at?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string
          color?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          href?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          priority?: number
          starts_at?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_announcements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_announcements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_publication_config: {
        Row: {
          is_enabled: boolean
          organization_id: string
          singleton: boolean
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          is_enabled?: boolean
          organization_id: string
          singleton?: boolean
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          is_enabled?: boolean
          organization_id?: string
          singleton?: boolean
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_publication_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_publication_config_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_saved_products: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          product_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          product_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          product_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_saved_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_saved_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_saved_products_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_integrity_saved_products_product_org_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tenant_integrity_saved_products_profile_org_fk"
            columns: ["profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      storefront_search_demand_coverage: {
        Row: {
          organization_id: string
          tracking_started_at: string
        }
        Insert: {
          organization_id: string
          tracking_started_at?: string
        }
        Update: {
          organization_id?: string
          tracking_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_search_demand_coverage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_unavailable_product_search_observations: {
        Row: {
          created_at: string
          observed_on: string
          organization_id: string
          product_id: string
          searcher_fingerprint: string
        }
        Insert: {
          created_at?: string
          observed_on: string
          organization_id: string
          product_id: string
          searcher_fingerprint: string
        }
        Update: {
          created_at?: string
          observed_on?: string
          organization_id?: string
          product_id?: string
          searcher_fingerprint?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_unavailable_product_search_obse_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          status: string
          supplier_code: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          status?: string
          supplier_code: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          status?: string
          supplier_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          role?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          branch_id: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
        }
        Insert: {
          branch_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
        }
        Update: {
          branch_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrity_warehouses_branch_org_fk"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _decision_memory_resolve_evidence: {
        Args: {
          p_as_of: string
          p_evidence_ids: string[]
          p_namespace: string
          p_organization_id: string
          p_period: Json
        }
        Returns: Json
      }
      _decision_memory_snapshot: {
        Args: { p_decision_outcome_id: string; p_organization_id: string }
        Returns: Json
      }
      _decision_outcome_snapshot: {
        Args: { p_organization_id: string; p_outcome_id: string }
        Returns: Json
      }
      _is_valid_decision_candidate_snapshot: {
        Args: {
          p_candidate_id: string
          p_expected_outcome: string
          p_rule_id: string
          p_rule_version: string
          p_snapshot: Json
        }
        Returns: boolean
      }
      _my_personalization_profile: {
        Args: never
        Returns: {
          organization_id: string
          profile_id: string
        }[]
      }
      accept_customer_activation_invitation: {
        Args: { p_token: string }
        Returns: Json
      }
      accept_customer_company_invitation: {
        Args: { p_token: string }
        Returns: Json
      }
      accept_operational_shift_handover: {
        Args: { p_handover_id: string; p_idempotency_key: string }
        Returns: Json
      }
      add_customer_service_case_staff_message: {
        Args: { p_case_id: string; p_message: string }
        Returns: Json
      }
      add_my_customer_service_case_message: {
        Args: { p_case_id: string; p_message: string }
        Returns: Json
      }
      apply_onyx_inventory_reconciliation: {
        Args: { p_command_id: string; p_idempotency_key: string }
        Returns: Json
      }
      approve_pricing_rule: {
        Args: { p_approval_note: string; p_rule_id: string }
        Returns: Json
      }
      archive_admin_catalog_category: {
        Args: { p_category_id: string }
        Returns: Json
      }
      archive_admin_catalog_product: {
        Args: { p_product_id: string }
        Returns: Json
      }
      assert_product_order_quantity: {
        Args: {
          p_organization_id: string
          p_product_id: string
          p_quantity: number
        }
        Returns: undefined
      }
      assign_operational_task: {
        Args: { p_assigned_to?: string; p_task_id: string }
        Returns: Json
      }
      assign_operational_tasks: {
        Args: { p_assigned_to?: string; p_task_ids: string[] }
        Returns: Json
      }
      award_purchase_supplier_quote: {
        Args: { p_notes?: string; p_quote_id: string; p_warehouse_id: string }
        Returns: Json
      }
      calculate_active_pricing_rule_price: {
        Args: {
          p_organization_id: string
          p_product_id: string
          p_quantity?: number
          p_tier: string
        }
        Returns: number
      }
      calculate_import_job_quality: {
        Args: { p_job_id: string }
        Returns: Json
      }
      can_access_customer_return_receipt_print_snapshot: {
        Args: { p_receipt_id: string }
        Returns: boolean
      }
      can_list_customer_return_receipt_print_history: {
        Args: never
        Returns: boolean
      }
      can_manage_finance: { Args: never; Returns: boolean }
      can_manage_pricing: { Args: never; Returns: boolean }
      can_manage_user_roles: { Args: never; Returns: boolean }
      can_receive_customer_return_request: {
        Args: { p_return_request_id: string }
        Returns: boolean
      }
      can_view_assigned_customer_return_receipt_queue: {
        Args: never
        Returns: boolean
      }
      can_view_operational_task_role: {
        Args: { p_task_role: string }
        Returns: boolean
      }
      cancel_customer_order: {
        Args: {
          p_idempotency_key: string
          p_order_id: string
          p_reason: string
        }
        Returns: Json
      }
      cancel_customer_return_request: {
        Args: { p_reason: string; p_return_request_id: string }
        Returns: Json
      }
      cancel_my_async_export_job: { Args: { p_job_id: string }; Returns: Json }
      cancel_operational_task: {
        Args: { p_reason: string; p_task_id: string }
        Returns: Json
      }
      cancel_purchase_order: {
        Args: { p_purchase_order_id: string; p_reason: string }
        Returns: Json
      }
      cancel_stock_count: {
        Args: { p_reason: string; p_session_id: string }
        Returns: Json
      }
      capture_operational_shift_snapshot: {
        Args: {
          p_idempotency_key: string
          p_shift_id: string
          p_snapshot_kind: string
        }
        Returns: Json
      }
      claim_async_export_jobs: {
        Args: {
          p_job_id?: string
          p_lease_seconds?: number
          p_limit?: number
          p_worker: string
        }
        Returns: {
          artifact_path: string | null
          attempt_count: number
          byte_size: number | null
          completed_at: string | null
          content_type: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          expires_at: string | null
          export_type: string
          file_name: string | null
          filters: Json
          id: string
          idempotency_key: string
          lease_expires_at: string | null
          lease_owner: string | null
          next_attempt_at: string
          organization_id: string
          request_hash: string
          requested_by: string
          row_count: number | null
          sha256: string | null
          started_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "async_export_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_background_jobs: {
        Args: { p_limit?: number; p_queue: string; p_worker: string }
        Returns: {
          attempt_count: number
          cancel_requested: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_stage: string | null
          estimated_seconds_remaining: number | null
          failed_units: number
          id: string
          job_type: string
          last_error: Json | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          memory_budget_mb: number
          organization_id: string
          pause_requested: boolean
          payload: Json
          processed_units: number
          progress_percent: number
          queue_name: string
          scheduled_at: string
          started_at: string | null
          status: string
          timeout_seconds: number
          total_units: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "background_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_my_async_export_job: {
        Args: { p_job_id: string; p_worker: string }
        Returns: {
          artifact_path: string | null
          attempt_count: number
          byte_size: number | null
          completed_at: string | null
          content_type: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          expires_at: string | null
          export_type: string
          file_name: string | null
          filters: Json
          id: string
          idempotency_key: string
          lease_expires_at: string | null
          lease_owner: string | null
          next_attempt_at: string
          organization_id: string
          request_hash: string
          requested_by: string
          row_count: number | null
          sha256: string | null
          started_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "async_export_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_outbox_events: {
        Args: {
          p_event_id?: string
          p_lease_seconds?: number
          p_limit?: number
          p_worker: string
        }
        Returns: {
          aggregate_id: string | null
          attempts: number
          created_at: string
          dead_letter_at: string | null
          error_class: string | null
          event_key: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          last_attempt_at: string | null
          last_error: Json | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          organization_id: string | null
          payload: Json | null
          payload_schema_version: number
          processed_at: string | null
          provider_reference: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "outbox_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clear_expired_async_export_artifact: {
        Args: { p_job_id: string; p_object_path: string }
        Returns: boolean
      }
      command_decision_outcome: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_expected_version: number
          p_idempotency_key: string
          p_measured_outcome?: Json
          p_outcome_id: string
          p_owner_profile_id?: string
          p_reason?: string
        }
        Returns: Json
      }
      commerce_policy_source_snapshot: {
        Args: {
          p_organization_id: string
          p_source_id: string
          p_source_table: string
        }
        Returns: Json
      }
      complete_ai_gateway_usage: {
        Args: {
          p_actual_cost: number
          p_execution_time_ms: number
          p_fallback_used: boolean
          p_input_tokens: number
          p_model_name: string
          p_output_tokens: number
          p_provider: string
          p_reservation_id: string
          p_result_status: string
        }
        Returns: Json
      }
      complete_ai_gateway_usage_v2: {
        Args: {
          p_estimated_cost: number
          p_execution_time_ms: number
          p_fallback_used: boolean
          p_input_tokens: number
          p_model_name: string
          p_observed_input_tokens: number
          p_observed_output_tokens: number
          p_output_tokens: number
          p_provider: string
          p_provider_attempts: Json
          p_reservation_id: string
          p_result_status: string
          p_usage_measurement_status: string
        }
        Returns: Json
      }
      complete_async_export_job: {
        Args: {
          p_byte_size: number
          p_content_type: string
          p_file_name: string
          p_job_id: string
          p_object_path: string
          p_row_count: number
          p_sha256: string
          p_worker: string
        }
        Returns: Json
      }
      complete_stock_count: { Args: { p_session_id: string }; Returns: Json }
      configure_ai_usage_budget: { Args: { p_settings: Json }; Returns: Json }
      create_accounting_account: {
        Args: {
          p_account_type: string
          p_code: string
          p_description?: string
          p_name: string
          p_parent_account_id?: string
        }
        Returns: Json
      }
      create_admin_catalog_category: {
        Args: { p_code?: string; p_name: string; p_parent_id?: string }
        Returns: Json
      }
      create_cash_expense_journal_draft: {
        Args: {
          p_expense_account_id: string
          p_expense_id: string
          p_idempotency_key: string
          p_settlement_account_id: string
        }
        Returns: Json
      }
      create_central_synonym: {
        Args: {
          p_canonical_field: string
          p_locale?: string
          p_profile_id?: string
          p_source_header: string
        }
        Returns: Json
      }
      create_customer_activation_invitation: {
        Args: {
          p_customer_id: string
          p_email: string
          p_expires_hours?: number
        }
        Returns: Json
      }
      create_customer_company_invitation: {
        Args: { p_email: string; p_member_role: string }
        Returns: Json
      }
      create_customer_invoice_journal_draft: {
        Args: {
          p_idempotency_key: string
          p_invoice_id: string
          p_receivable_account_id: string
          p_revenue_account_id: string
          p_tax_account_id: string
        }
        Returns: Json
      }
      create_customer_payment_journal_draft: {
        Args: {
          p_idempotency_key: string
          p_payment_id: string
          p_settlement_account_id: string
        }
        Returns: Json
      }
      create_customer_service_case: {
        Args: {
          p_case_type: string
          p_customer_id: string
          p_description: string
          p_idempotency_key: string
          p_priority?: string
          p_subject: string
        }
        Returns: Json
      }
      create_customer_source_reversal_draft: {
        Args: {
          p_idempotency_key: string
          p_reason: string
          p_source_id: string
          p_source_type: string
        }
        Returns: Json
      }
      create_decision_outcome_proposal: {
        Args: {
          p_candidate_id: string
          p_expected_outcome: string
          p_idempotency_key: string
          p_owner_profile_id: string
          p_reason: string
          p_rule_id: string
          p_rule_version: string
        }
        Returns: Json
      }
      create_decision_outcome_proposal_with_snapshot: {
        Args: {
          p_candidate_id: string
          p_candidate_snapshot: Json
          p_expected_outcome: string
          p_idempotency_key: string
          p_owner_profile_id: string
          p_reason: string
          p_rule_id: string
          p_rule_version: string
        }
        Returns: Json
      }
      create_finance_bank_statement: {
        Args: {
          p_closing_balance: number
          p_evidence_id: string
          p_opening_balance: number
          p_period_from: string
          p_period_to: string
          p_settlement_account_mapping_id: string
          p_statement_reference: string
        }
        Returns: Json
      }
      create_general_journal_draft: {
        Args: {
          p_description: string
          p_entry_date: string
          p_idempotency_key: string
          p_lines: Json
          p_source_reference?: string
        }
        Returns: Json
      }
      create_import_job: {
        Args: {
          p_file_hash: string
          p_file_name: string
          p_file_size: number
          p_job_type: string
          p_period_key?: string
          p_profile_id?: string
          p_source_system?: string
        }
        Returns: Json
      }
      create_import_job_idempotent:
        | {
            Args: {
              p_external_source_reference: string
              p_file_hash: string
              p_file_name: string
              p_file_size: number
              p_intent?: string
              p_job_type: string
              p_period_key?: string
              p_profile_id?: string
              p_request_key: string
              p_source_system?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_file_hash: string
              p_file_name: string
              p_file_size: number
              p_intent?: string
              p_job_type: string
              p_period_key?: string
              p_profile_id?: string
              p_request_key: string
              p_source_system?: string
            }
            Returns: Json
          }
      create_import_upload_session: {
        Args: { p_job_id: string }
        Returns: Json
      }
      create_my_customer_service_case: {
        Args: {
          p_case_type: string
          p_description: string
          p_idempotency_key: string
          p_priority?: string
          p_subject: string
        }
        Returns: Json
      }
      create_operational_task: {
        Args: {
          p_assigned_to?: string
          p_description?: string
          p_due_at?: string
          p_priority?: string
          p_task_role?: string
          p_title: string
        }
        Returns: string
      }
      create_purchase_order: {
        Args: {
          p_idempotency_key: string
          p_lines: Json
          p_notes: string
          p_supplier_id: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      create_purchase_supplier_quote: {
        Args: {
          p_delivery_days: number
          p_idempotency_key: string
          p_lines: Json
          p_notes: string
          p_payment_terms: string
          p_quote_number: string
          p_supplier_id: string
          p_supplier_reference: string
          p_valid_until: string
        }
        Returns: Json
      }
      create_purchase_supplier_return: {
        Args: {
          p_idempotency_key: string
          p_lines: Json
          p_notes: string
          p_reason: string
          p_receipt_id: string
        }
        Returns: Json
      }
      create_staff_order: {
        Args: {
          p_customer_id: string
          p_idempotency_key?: string
          p_items: Json
          p_notes?: string
          p_payment_terms?: string
        }
        Returns: Json
      }
      create_unavailable_product_demand_follow_up_task: {
        Args: {
          p_as_of: string
          p_from: string
          p_product_id: string
          p_to: string
        }
        Returns: Json
      }
      current_auth_session_id: { Args: never; Returns: string }
      current_customer_can: { Args: { p_capability: string }; Returns: boolean }
      current_customer_id: { Args: never; Returns: string }
      current_organization_id: { Args: never; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      customer_activation_invitation_random_token: {
        Args: never
        Returns: string
      }
      customer_activation_invitation_sha256: {
        Args: { p_token: string }
        Returns: string
      }
      customer_company_invitation_sha256: {
        Args: { p_token: string }
        Returns: string
      }
      customer_payment_request_sha256: {
        Args: { p_payload: string }
        Returns: string
      }
      customer_product_unit_price: {
        Args: {
          p_organization_id: string
          p_product_id: string
          p_quantity: number
          p_tier: string
        }
        Returns: number
      }
      customer_respond_to_quote: {
        Args: { p_accept: boolean; p_quote_id: string }
        Returns: undefined
      }
      defer_decision_outcome: {
        Args: {
          p_event_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_outcome_id: string
          p_reason: string
        }
        Returns: Json
      }
      delete_customer_address: {
        Args: { p_address_id: string }
        Returns: boolean
      }
      delete_customer_company_contact: {
        Args: { p_contact_id: string }
        Returns: boolean
      }
      ensure_profile: { Args: { _full_name?: string }; Returns: Json }
      fail_async_export_job: {
        Args: { p_error_code: string; p_job_id: string; p_worker: string }
        Returns: Json
      }
      fail_import_job_safely: {
        Args: { p_error_summary: Json; p_job_id: string }
        Returns: Json
      }
      fail_outbox_event: {
        Args: {
          p_error_class: string
          p_error_message: string
          p_event_id: string
          p_worker: string
        }
        Returns: Json
      }
      fetch_business_health_product_revenue_concentration: {
        Args: { p_as_of?: string; p_from: string; p_to: string }
        Returns: Json
      }
      fetch_business_health_supplier_posted_payable_activity: {
        Args: { p_as_of: string; p_from: string; p_to: string }
        Returns: Json
      }
      fetch_cash_expense_accounting_inbox: {
        Args: { p_limit?: number; p_offset?: number; p_status?: string }
        Returns: Json
      }
      fetch_commerce_policy_catalog: { Args: never; Returns: Json }
      fetch_commerce_policy_owners: { Args: never; Returns: Json }
      fetch_commerce_policy_simulation_history: {
        Args: { p_limit?: number; p_simulation_type?: string }
        Returns: Json
      }
      fetch_commerce_policy_sources: {
        Args: { p_limit?: number; p_search?: string; p_source_table: string }
        Returns: Json
      }
      fetch_customer_invoice_accounting_inbox: {
        Args: { p_limit?: number; p_offset?: number; p_status?: string }
        Returns: Json
      }
      fetch_customer_manager_directory: {
        Args: { p_page?: number; p_page_size?: number; p_search?: string }
        Returns: Json
      }
      fetch_customer_payment_accounting_inbox: {
        Args: { p_limit?: number; p_offset?: number; p_status?: string }
        Returns: Json
      }
      fetch_customer_quote_pipeline: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      fetch_customer_return_credit_memo_queue: {
        Args: { p_limit?: number }
        Returns: Json
      }
      fetch_decision_outcomes: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      fetch_executive_liquidity_workspace: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      fetch_executive_receivable_customer_aging: { Args: never; Returns: Json }
      fetch_finance_bank_statement_match_candidates: {
        Args: { p_statement_id: string; p_statement_line_id: string }
        Returns: Json
      }
      fetch_finance_cash_reconciliation_workspace: {
        Args: never
        Returns: Json
      }
      fetch_general_journal_reversal_links: {
        Args: { p_entry_ids: string[] }
        Returns: {
          original_journal_entry_id: string
          reversal_journal_entry_id: string
        }[]
      }
      fetch_general_ledger: {
        Args: {
          p_account_id?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_to?: string
        }
        Returns: Json
      }
      fetch_intelligence_sales_order_status_summary: {
        Args: never
        Returns: Json
      }
      fetch_my_personalization_consents: { Args: never; Returns: Json }
      fetch_my_personalization_preferences: { Args: never; Returns: Json }
      fetch_operational_shift_handover_acceptance: {
        Args: { p_current_shift_id: string }
        Returns: Json
      }
      fetch_operational_shift_snapshot: {
        Args: { p_snapshot_id: string }
        Returns: Json
      }
      fetch_operational_shift_workspace: {
        Args: { p_business_date: string; p_shift_id?: string }
        Returns: Json
      }
      fetch_operational_task_quality_metrics: { Args: never; Returns: Json }
      fetch_process_bottleneck_snapshot: {
        Args: {
          p_baseline_from?: string
          p_baseline_to?: string
          p_from: string
          p_to: string
        }
        Returns: Json
      }
      fetch_product_performance_growth_aggregate: {
        Args: { p_as_of?: string; p_period_days?: number }
        Returns: Json
      }
      fetch_purchase_order_receipt_history: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_purchase_order_id: string
        }
        Returns: Json
      }
      fetch_purchase_orders: { Args: never; Returns: Json }
      fetch_purchase_receipt_accounting_queue: {
        Args: { p_limit?: number; p_purchase_order_id?: string }
        Returns: Json
      }
      fetch_purchase_supplier_credit_note_workspace: {
        Args: never
        Returns: Json
      }
      fetch_purchase_supplier_invoice_accounting_status: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      fetch_purchase_supplier_invoice_due_dates: {
        Args: { p_invoice_id?: string }
        Returns: Json
      }
      fetch_purchase_supplier_invoice_evidence: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      fetch_purchase_supplier_invoice_workspace: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_purchase_order_id?: string
        }
        Returns: Json
      }
      fetch_purchase_supplier_payment_workspace: {
        Args: {
          p_currency?: string
          p_limit?: number
          p_offset?: number
          p_supplier_id?: string
        }
        Returns: Json
      }
      fetch_purchase_supplier_quotes: { Args: never; Returns: Json }
      fetch_purchase_supplier_returns: { Args: never; Returns: Json }
      fetch_staff_cash_expenses: {
        Args: {
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      fetch_staff_finance_data: { Args: never; Returns: Json }
      fetch_staff_finance_invoice_page: {
        Args: {
          p_before_id?: string
          p_before_issued_at?: string
          p_limit?: number
        }
        Returns: Json
      }
      fetch_staff_order_items: {
        Args: { p_order_id: string }
        Returns: {
          adjusted_at: string | null
          adjusted_by: string | null
          approved_quantity: number
          approved_unit_price: number
          created_at: string
          discount_snapshot: number
          id: string
          item_code: string | null
          line_total: number
          order_id: string
          price_override_reason: string | null
          product_id: string | null
          product_name_snapshot: string
          promotion_discount_per_unit_snapshot: number
          promotion_discount_type_snapshot: string | null
          promotion_discount_value_snapshot: number | null
          promotion_id_snapshot: string | null
          promotion_title_snapshot: string | null
          proposed_price_reason: string | null
          proposed_quantity: number | null
          proposed_unit_price: number | null
          quantity: number
          requested_quantity: number
          unit_price_snapshot: number
          unit_snapshot: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "order_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fetch_staff_orders: {
        Args: never
        Returns: {
          admin_adjusted_at: string | null
          business_name_snapshot: string | null
          contact_name_snapshot: string | null
          created_at: string
          created_by: string | null
          customer_adjustment_note: string | null
          customer_confirmed_at: string | null
          customer_id: string
          customer_payment_requested_at: string | null
          delivery_address_fingerprint: string | null
          delivery_address_id: string | null
          delivery_address_snapshot: Json | null
          id: string
          idempotency_key: string | null
          idempotency_payload_hash: string | null
          notes: string | null
          order_number: string
          organization_id: string
          payment_request_status: string
          payment_terms: string
          phone_snapshot: string | null
          quantity_review_required: boolean
          status: string
          total_amount: number
          total_items: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fetch_staff_products: {
        Args: { p_product_id?: string }
        Returns: {
          barcode: string | null
          base_price: number
          category_id: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_featured: boolean
          item_code: string
          max_stock: number | null
          min_order_quantity: number
          min_stock: number | null
          name: string
          name_en: string | null
          normalization_version: number
          order_quantity_multiple: number
          organization_id: string
          retail_price: number
          search_name_norm: string
          sku: string | null
          sort_order: number
          status: string
          unit: string
          updated_at: string
          wholesale_price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fetch_staff_receivables_aging: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      fetch_supplier_account_activity: {
        Args: {
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_to?: string
        }
        Returns: Json
      }
      fetch_supplier_payable_cashflow_schedule: {
        Args: {
          p_as_of: string
          p_currency?: string
          p_from: string
          p_to: string
        }
        Returns: Json
      }
      fetch_supplier_performance_snapshot: {
        Args: { p_from: string; p_limit?: number; p_to: string }
        Returns: Json
      }
      fetch_task_intelligence_report: {
        Args: { p_from: string; p_report_kind: string; p_to: string }
        Returns: Json
      }
      fetch_task_performance_scorecard: { Args: never; Returns: Json }
      fetch_task_performance_scorecard_with_quality: {
        Args: never
        Returns: Json
      }
      fetch_unavailable_product_search_demand: {
        Args: { p_as_of: string; p_from: string; p_to: string }
        Returns: Json
      }
      finalize_finance_bank_statement_reconciliation: {
        Args: { p_reason: string; p_statement_id: string }
        Returns: Json
      }
      finalize_import_job:
        | { Args: { p_job_id: string }; Returns: Json }
        | {
            Args: { p_duplicate_action: string; p_job_id: string }
            Returns: Json
          }
      finalize_import_job_without_manifest_guard: {
        Args: { p_duplicate_action: string; p_job_id: string }
        Returns: Json
      }
      find_import_duplicate: {
        Args: {
          p_file_hash: string
          p_period_key?: string
          p_profile_id?: string
        }
        Returns: Json
      }
      generate_order_code: { Args: never; Returns: string }
      get_admin_product_price_grid: {
        Args: never
        Returns: {
          base_price: number
          id: string
          is_active: boolean
          item_code: string
          name: string
          price_retail: number
          price_wholesale: number
          price_wholesale_of_wholesale: number
          unit: string
        }[]
      }
      get_admin_product_price_grid_with_inventory: {
        Args: never
        Returns: {
          base_price: number
          id: string
          inventory_warehouse_count: number
          is_active: boolean
          item_code: string
          name: string
          price_retail: number
          price_wholesale: number
          price_wholesale_of_wholesale: number
          quantity_available_total: number
          quantity_on_hand_total: number
          quantity_reserved_total: number
          reorder_point_total: number
          unit: string
        }[]
      }
      get_admin_promotions: {
        Args: never
        Returns: {
          category_ids: string[] | null
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          end_date: string
          id: string
          is_active: boolean
          organization_id: string
          product_ids: string[] | null
          start_date: string
          title: string
        }[]
        SetofOptions: {
          from: "*"
          to: "promotions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_admin_storefront_announcements: {
        Args: never
        Returns: {
          audience: string
          color: string
          content: string
          created_at: string
          ends_at: string
          href: string
          id: string
          is_active: boolean
          priority: number
          starts_at: string
          title: string
          updated_at: string
        }[]
      }
      get_ai_gateway_budget: { Args: never; Returns: Json }
      get_ai_gateway_runtime_config: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_current_tenant_context: { Args: never; Returns: Json }
      get_customer_account_statement: { Args: never; Returns: Json }
      get_customer_cart: { Args: never; Returns: Json }
      get_customer_interaction_history: {
        Args: { p_customer_id: string; p_limit?: number }
        Returns: Json
      }
      get_customer_invoice_pdf: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      get_customer_payment_receipt_print_options: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      get_customer_retention_aggregate: {
        Args: { p_as_of?: string; p_period_days?: number }
        Returns: Json
      }
      get_customer_return_credit_memo_pdf: {
        Args: { p_credit_memo_id: string }
        Returns: Json
      }
      get_customer_return_receipt_print_data: {
        Args: { p_receipt_id: string }
        Returns: Json
      }
      get_customer_service_case_messages: {
        Args: { p_case_id: string }
        Returns: Json
      }
      get_customer_service_case_operations: {
        Args: { p_customer_id: string; p_limit?: number }
        Returns: Json
      }
      get_customer_service_cases: {
        Args: { p_customer_id: string; p_limit?: number }
        Returns: Json
      }
      get_customer_service_sla_policies: { Args: never; Returns: Json }
      get_customer_service_work_queue: {
        Args: {
          p_after_created_at?: string
          p_after_id?: string
          p_assignment_filter?: string
          p_limit?: number
          p_overdue_only?: boolean
          p_priority?: string
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      get_customer_service_work_queue_summary: { Args: never; Returns: Json }
      get_finance_document_print_options:
        | { Args: { p_limit?: number }; Returns: Json }
        | { Args: { p_limit: number; p_offset: number }; Returns: Json }
      get_intelligence_aggregate: { Args: { p_request: Json }; Returns: Json }
      get_inventory_intelligence_aggregate: {
        Args: { p_as_of: string; p_period_from: string; p_period_to: string }
        Returns: Json
      }
      get_my_async_export_download: {
        Args: { p_job_id: string }
        Returns: Json
      }
      get_my_customer_account_profile: { Args: never; Returns: Json }
      get_my_customer_service_cases: {
        Args: { p_limit?: number }
        Returns: Json
      }
      get_my_customer_service_cases_page: {
        Args: {
          p_after_created_at?: string
          p_after_id?: string
          p_case_type?: string
          p_limit?: number
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      get_my_customer_service_portal_context: { Args: never; Returns: Json }
      get_onyx_live_sync_attempt_evidence: {
        Args: { p_snapshot_id: string }
        Returns: Json
      }
      get_onyx_reconciliation_warehouses: { Args: never; Returns: Json }
      get_onyx_snapshot_analytics: {
        Args: { p_snapshot_id: string }
        Returns: Json
      }
      get_onyx_snapshot_source_evidence: {
        Args: { p_snapshot_id: string }
        Returns: Json
      }
      get_product_unit_conversions: {
        Args: { p_product_id: string }
        Returns: Json
      }
      get_public_storefront_context: { Args: never; Returns: Json }
      get_public_storefront_settings: { Args: never; Returns: Json }
      get_purchase_receipt_print_data: {
        Args: { p_receipt_id: string }
        Returns: Json
      }
      get_staff_customer_360: { Args: { p_customer_id: string }; Returns: Json }
      get_staff_customer_account_statement: {
        Args: { p_customer_id: string }
        Returns: Json
      }
      get_staff_customer_account_statement_full: {
        Args: { p_customer_id: string }
        Returns: Json
      }
      get_staff_customer_invoice_print_data: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      get_staff_customer_payment_receipt_print_data: {
        Args: { p_receipt_id: string }
        Returns: Json
      }
      get_staff_dashboard_metrics: {
        Args: never
        Returns: {
          active_customers: number
          active_products: number
          available_stock: number
          completed_sales: number
          orders_cancelled: number
          orders_completed: number
          orders_confirmed: number
          orders_pending: number
          orders_preparing: number
          orders_ready: number
          orders_total: number
          receivables_issued: number
        }[]
      }
      get_store_executive_analytics: { Args: never; Returns: Json }
      get_store_product_activity_report: { Args: never; Returns: Json }
      get_storefront_announcements: {
        Args: never
        Returns: {
          audience: string
          color: string
          content: string
          ends_at: string
          href: string
          id: string
          priority: number
          starts_at: string
          title: string
        }[]
      }
      get_storefront_catalog_page: {
        Args: {
          p_available_only?: boolean
          p_category_id?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
        }
        Returns: Json
      }
      get_storefront_product_prices: {
        Args: { p_product_ids: string[]; p_quantity?: number }
        Returns: {
          product_id: string
          unit_price: number
        }[]
      }
      get_storefront_promotions: {
        Args: never
        Returns: {
          created_at: string
          description: string
          discount_type: string
          discount_value: number
          end_date: string
          id: string
          is_active: boolean
          start_date: string
          title: string
        }[]
      }
      is_staff: { Args: never; Returns: boolean }
      is_valid_import_quality_date: {
        Args: { p_value: string }
        Returns: boolean
      }
      list_customer_activation_invitations: {
        Args: { p_customer_id: string }
        Returns: Json
      }
      list_customer_company_members: { Args: never; Returns: Json }
      list_customer_order_amendment_history: {
        Args: { p_order_id: string }
        Returns: Json
      }
      list_customer_return_receipt_print_history: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      list_customer_return_receipt_queue: {
        Args: { p_limit?: number }
        Returns: Json
      }
      list_customer_return_review_queue: {
        Args: { p_limit?: number }
        Returns: Json
      }
      list_inventory_transfer_history: {
        Args: { p_limit?: number }
        Returns: {
          batch_id: string
          batch_line_count: number
          created_at: string
          created_by: string
          destination_warehouse_id: string
          destination_warehouse_name: string
          id: string
          item_code: string
          organization_id: string
          product_id: string
          product_name: string
          quantity: number
          reason: string
          source_warehouse_id: string
          source_warehouse_name: string
          unit: string
        }[]
      }
      list_my_async_export_jobs: { Args: { p_limit?: number }; Returns: Json }
      list_my_customer_return_history: {
        Args: {
          p_after_created_at?: string
          p_after_id?: string
          p_limit?: number
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      list_my_customer_return_requests: {
        Args: { p_order_id: string }
        Returns: Json
      }
      list_onyx_inventory_reconciliation_commands: {
        Args: { p_snapshot_id: string }
        Returns: Json
      }
      list_operational_task_assignees: { Args: never; Returns: Json }
      list_organization_sessions: {
        Args: {
          p_after_activity_at?: string
          p_after_created_at?: string
          p_after_session_id?: string
          p_limit?: number
        }
        Returns: Json
      }
      list_organization_user_roles: { Args: never; Returns: Json }
      list_storefront_saved_products: { Args: never; Returns: string[] }
      manage_customer_interaction_follow_up: {
        Args: {
          p_action: string
          p_idempotency_key?: string
          p_interaction_id: string
          p_new_due_at?: string
          p_reason?: string
        }
        Returns: Json
      }
      manage_customer_service_case_operations: {
        Args: {
          p_assigned_to: string
          p_case_id: string
          p_escalate?: boolean
          p_note?: string
          p_resolution_due_at: string
          p_response_due_at: string
        }
        Returns: Json
      }
      match_finance_bank_statement_line: {
        Args: {
          p_journal_entry_id: string
          p_journal_line_number: number
          p_statement_id: string
          p_statement_line_id: string
        }
        Returns: Json
      }
      mutate_staff_product_gallery_image: {
        Args: { p_action: string; p_image_url: string; p_product_id: string }
        Returns: Json
      }
      normalize_arabic_search: { Args: { p_value: string }; Returns: string }
      normalize_storefront_catalog_search: {
        Args: { p_value: string }
        Returns: string
      }
      normalize_storefront_catalog_text: {
        Args: { p_value: string }
        Returns: string
      }
      operational_tasks_can_manage: { Args: never; Returns: boolean }
      place_order: {
        Args: {
          _business_name: string
          _contact_name: string
          _idempotency_key?: string
          _items: Json
          _notes: string
          _payment_terms?: string
          _phone: string
        }
        Returns: Json
      }
      post_general_journal_entry: {
        Args: { p_entry_id: string }
        Returns: Json
      }
      post_purchase_supplier_return: {
        Args: { p_return_id: string }
        Returns: Json
      }
      prepare_customer_return_credit_memo: {
        Args: {
          p_idempotency_key: string
          p_receivable_account_id: string
          p_return_request_id: string
          p_revenue_account_id: string
          p_tax_account_id: string
        }
        Returns: Json
      }
      prepare_purchase_receipt_accounting_draft: {
        Args: {
          p_idempotency_key: string
          p_inventory_account_id: string
          p_payable_account_id: string
          p_receipt_id: string
        }
        Returns: Json
      }
      prepare_purchase_supplier_credit_note_journal_draft: {
        Args: {
          p_credit_note_id: string
          p_idempotency_key: string
          p_variance_account_id: string
        }
        Returns: Json
      }
      prepare_purchase_supplier_invoice_accounting_draft: {
        Args: {
          p_idempotency_key: string
          p_invoice_id: string
          p_merchandise_variance_account_id: string
          p_tax_account_id: string
        }
        Returns: Json
      }
      prepare_purchase_supplier_payment_journal_draft: {
        Args: { p_idempotency_key: string; p_payment_id: string }
        Returns: Json
      }
      preview_commerce_policy_rollback: {
        Args: { p_source_id: string; p_source_table: string }
        Returns: Json
      }
      preview_customer_order_pricing: {
        Args: { p_items: Json; p_surface: string }
        Returns: Json
      }
      preview_customer_tier_price: {
        Args: {
          p_customer_id: string
          p_product_id: string
          p_quantity: number
        }
        Returns: Json
      }
      preview_onyx_inventory_reconciliation: {
        Args: {
          p_idempotency_key: string
          p_reason: string
          p_snapshot_id: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      preview_order_pricing: { Args: { _items: Json }; Returns: Json }
      process_outbox_event: {
        Args: { p_event_id: string; p_worker: string }
        Returns: Json
      }
      public_storefront_organization_id: { Args: never; Returns: string }
      public_storefront_warehouse_id: { Args: never; Returns: string }
      purchase_order_detail: {
        Args: { p_purchase_order_id: string }
        Returns: Json
      }
      purchase_orders_can_manage: { Args: never; Returns: boolean }
      purchase_supplier_quote_detail: {
        Args: { p_quote_id: string }
        Returns: Json
      }
      purchase_supplier_return_detail: {
        Args: { p_return_id: string }
        Returns: Json
      }
      receive_customer_return: {
        Args: {
          p_idempotency_key: string
          p_lines: Json
          p_notes: string
          p_return_request_id: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      receive_purchase_order: {
        Args: {
          p_idempotency_key: string
          p_lines: Json
          p_notes: string
          p_purchase_order_id: string
        }
        Returns: Json
      }
      reconcile_purchase_supplier_payment: {
        Args: {
          p_action: string
          p_currency: string
          p_evidence_reference: string
          p_evidence_type: string
          p_idempotency_key: string
          p_observed_amount: number
          p_payment_id: string
          p_reason: string
        }
        Returns: Json
      }
      record_ai_gateway_no_provider_attempt: {
        Args: { p_reason: string; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      record_cash_expense: {
        Args: {
          p_amount: number
          p_category: string
          p_currency?: string
          p_description: string
          p_expense_date?: string
          p_idempotency_key: string
          p_payment_method?: string
          p_reference?: string
        }
        Returns: Json
      }
      record_customer_interaction: {
        Args: {
          p_customer_id: string
          p_details: string
          p_idempotency_key: string
          p_interaction_at?: string
          p_interaction_type: string
          p_next_follow_up_at?: string
          p_subject: string
        }
        Returns: string
      }
      record_customer_payment: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_invoice_id: string
          p_notes?: string
          p_payment_method: string
          p_reference?: string
        }
        Returns: string
      }
      record_customer_payment_allocation: {
        Args: {
          p_allocations: Json
          p_idempotency_key: string
          p_notes?: string
          p_payment_method: string
          p_reference?: string
        }
        Returns: Json
      }
      record_finance_bank_statement_line: {
        Args: {
          p_description: string
          p_external_reference: string
          p_idempotency_key: string
          p_line_number: number
          p_signed_amount: number
          p_statement_id: string
          p_transaction_date: string
        }
        Returns: Json
      }
      record_finance_cash_account_evidence: {
        Args: {
          p_byte_size: number
          p_content_sha256: string
          p_evidence_kind: string
          p_file_name: string
          p_mime_type: string
          p_settlement_account_mapping_id: string
          p_storage_path: string
        }
        Returns: Json
      }
      record_import_upload_chunk: {
        Args: {
          p_byte_offset: number
          p_byte_size: number
          p_chunk_hash: string
          p_chunk_number: number
          p_session_id: string
        }
        Returns: Json
      }
      record_onyx_live_sync_attempt: {
        Args: {
          p_attempt_id: string
          p_error_code: string
          p_error_summary: string
          p_external_request_id: string
          p_http_status: number
          p_operation: string
          p_order_id: string
          p_organization_id: string
          p_request_sha256: string
          p_response_sha256: string
          p_snapshot_id: string
          p_status: string
        }
        Returns: string
      }
      record_onyx_order_export: {
        Args: {
          p_item_count: number
          p_order_id: string
          p_request_key?: string
          p_source_snapshot_id?: string
        }
        Returns: string
      }
      record_operational_shift_cash_count: {
        Args: {
          p_correction_reason: string
          p_counted_amount: number
          p_currency: string
          p_idempotency_key: string
          p_note: string
          p_phase: string
          p_shift_id: string
        }
        Returns: Json
      }
      record_operational_shift_handover: {
        Args: {
          p_current_shift_id: string
          p_idempotency_key: string
          p_note: string
          p_open_item_refs: Json
          p_reason: string
        }
        Returns: Json
      }
      record_operational_task_quality_review: {
        Args: {
          p_event_id: string
          p_expected_task_updated_at: string
          p_idempotency_key: string
          p_review: Json
          p_review_type: string
          p_task_id: string
        }
        Returns: Json
      }
      record_purchase_supplier_credit_note: {
        Args: {
          p_actual_amount: number
          p_currency: string
          p_idempotency_key: string
          p_issued_on: string
          p_return_id: string
          p_supplier_credit_note_number: string
        }
        Returns: Json
      }
      record_purchase_supplier_invoice: {
        Args: {
          p_idempotency_key: string
          p_invoice_date: string
          p_invoice_total_amount: number
          p_lines: Json
          p_merchandise_subtotal: number
          p_purchase_order_id: string
          p_supplier_invoice_number: string
          p_tax_amount: number
        }
        Returns: Json
      }
      record_purchase_supplier_invoice_due_date: {
        Args: {
          p_due_date: string
          p_idempotency_key: string
          p_invoice_id: string
          p_reason: string
          p_source_evidence_id: string
          p_source_reference: string
        }
        Returns: Json
      }
      record_purchase_supplier_invoice_evidence: {
        Args: {
          p_byte_size: number
          p_content_sha256: string
          p_file_name: string
          p_invoice_id: string
          p_mime_type: string
          p_storage_path: string
        }
        Returns: Json
      }
      record_purchase_supplier_payment: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_currency: string
          p_idempotency_key: string
          p_payment_date: string
          p_payment_method: string
          p_payment_reference: string
          p_settlement_account_mapping_id: string
          p_supplier_id: string
        }
        Returns: Json
      }
      record_storefront_unavailable_product_search: {
        Args: {
          p_category_id?: string
          p_product_ids: string[]
          p_search: string
        }
        Returns: Json
      }
      refresh_operational_tasks: { Args: never; Returns: Json }
      refresh_operational_tasks_pre_credit_memo_v1: {
        Args: never
        Returns: Json
      }
      refresh_operational_tasks_pre_purchase_v1: { Args: never; Returns: Json }
      refresh_operational_tasks_pre_stock_count_v1: {
        Args: never
        Returns: Json
      }
      refresh_product_tier_prices: {
        Args: { p_organization_id: string; p_product_id?: string }
        Returns: undefined
      }
      register_commerce_policy_metadata: {
        Args: {
          p_business_rule: string
          p_conflict_priority: number
          p_effective_from: string
          p_effective_until: string
          p_idempotency_key: string
          p_owner_profile_id: string
          p_rationale: string
          p_source_id: string
          p_source_table: string
          p_test_examples: Json
        }
        Returns: Json
      }
      register_purchase_supplier_settlement_account: {
        Args: {
          p_accounting_account_id: string
          p_currency: string
          p_display_name: string
          p_settlement_kind: string
        }
        Returns: Json
      }
      rename_admin_catalog_category: {
        Args: { p_category_id: string; p_name: string }
        Returns: Json
      }
      request_async_export_job: {
        Args: {
          p_export_type: string
          p_filters: Json
          p_idempotency_key: string
        }
        Returns: Json
      }
      request_customer_return: {
        Args: {
          p_idempotency_key?: string
          p_lines: Json
          p_notes?: string
          p_order_id: string
          p_reason: string
        }
        Returns: Json
      }
      request_sales_quote: {
        Args: { p_lines: Json; p_notes?: string }
        Returns: string
      }
      reserve_ai_gateway_usage: {
        Args: {
          p_estimated_cost: number
          p_estimated_input_tokens: number
          p_estimated_output_tokens: number
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      reserve_order_inventory: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      resolve_active_promotion_price: {
        Args: {
          p_gross_unit_price: number
          p_organization_id: string
          p_product_id: string
        }
        Returns: {
          discount_per_unit: number
          discount_type: string
          discount_value: number
          net_unit_price: number
          promotion_id: string
          promotion_title: string
        }[]
      }
      resolve_promotion_snapshot_discount: {
        Args: {
          p_discount_type: string
          p_discount_value: number
          p_gross_unit_price: number
          p_product_id: string
        }
        Returns: number
      }
      respond_to_sales_quote: {
        Args: {
          p_prices: Json
          p_quote_id: string
          p_response_note?: string
          p_valid_until?: string
        }
        Returns: undefined
      }
      restore_admin_catalog_category: {
        Args: { p_category_id: string }
        Returns: Json
      }
      resume_deferred_decision_outcome: {
        Args: {
          p_event_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_outcome_id: string
          p_reason: string
        }
        Returns: Json
      }
      return_order_for_customer_amendment: {
        Args: { p_order_id: string; p_reason: string }
        Returns: Json
      }
      reverse_customer_return_credit_memo: {
        Args: {
          p_credit_memo_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      reverse_general_journal_entry: {
        Args: {
          p_entry_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      review_customer_return_request: {
        Args: {
          p_decision: string
          p_return_request_id: string
          p_review_note: string
        }
        Returns: Json
      }
      review_finance_cash_opening_balance: {
        Args: { p_decision: string; p_proposal_id: string; p_reason: string }
        Returns: Json
      }
      review_order_lines: {
        Args: {
          p_action: string
          p_customer_note?: string
          p_lines: Json
          p_order_id: string
        }
        Returns: Json
      }
      review_purchase_supplier_credit_note_variance: {
        Args: { p_approve: boolean; p_credit_note_id: string; p_reason: string }
        Returns: Json
      }
      review_purchase_supplier_invoice_variance: {
        Args: { p_approve: boolean; p_invoice_id: string; p_reason: string }
        Returns: Json
      }
      revoke_customer_activation_invitation: {
        Args: { p_invitation_id: string }
        Returns: boolean
      }
      revoke_customer_company_invitation: {
        Args: { p_invitation_id: string }
        Returns: boolean
      }
      revoke_customer_company_member: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      revoke_my_personalization_channel_consent: {
        Args: { p_consent_id: string; p_expected_granted_at: string }
        Returns: Json
      }
      revoke_organization_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      revoke_other_auth_sessions: { Args: never; Returns: Json }
      rollback_import_snapshot: {
        Args: { p_job_id: string; p_reason: string }
        Returns: Json
      }
      rollback_onyx_inventory_reconciliation: {
        Args: {
          p_command_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      run_inventory_reconciliation: {
        Args: { p_snapshot_id: string }
        Returns: Json
      }
      save_admin_catalog_product: {
        Args: { p_payload: Json; p_product_id: string }
        Returns: Json
      }
      save_admin_product_with_metadata: {
        Args: { p_payload: Json; p_product_id: string }
        Returns: Json
      }
      save_customer_address: {
        Args: {
          p_address_id: string
          p_address_line1: string
          p_address_line2: string
          p_city: string
          p_country: string
          p_delivery_instructions: string
          p_is_default: boolean
          p_label: string
          p_phone: string
          p_postal_code: string
          p_recipient_name: string
          p_region: string
        }
        Returns: string
      }
      save_customer_company_contact: {
        Args: {
          p_contact_id: string
          p_department: string
          p_email: string
          p_full_name: string
          p_is_primary: boolean
          p_job_title: string
          p_phone: string
        }
        Returns: string
      }
      save_decision_memory_snapshot: {
        Args: {
          p_decision_outcome_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_reason: string
          p_snapshot: Json
        }
        Returns: Json
      }
      save_my_personalization_preferences: {
        Args: { p_changes: Json; p_expected_updated_at: string }
        Returns: Json
      }
      save_product_price_grid: { Args: { p_changes: Json }; Returns: Json }
      save_product_unit_conversions: {
        Args: { p_product_id: string; p_units: Json }
        Returns: Json
      }
      save_promotion: {
        Args: {
          p_category_ids: string[]
          p_description: string
          p_discount_type: string
          p_discount_value: number
          p_end_date: string
          p_is_active: boolean
          p_product_ids: string[]
          p_promotion_id: string
          p_start_date: string
          p_title: string
        }
        Returns: string
      }
      save_reorder_template: {
        Args: { p_lines: Json; p_name: string; p_source_order_id?: string }
        Returns: string
      }
      save_storefront_announcement: {
        Args: {
          p_announcement_id: string
          p_audience: string
          p_color: string
          p_content: string
          p_ends_at: string
          p_href: string
          p_is_active: boolean
          p_priority: number
          p_starts_at: string
          p_title: string
        }
        Returns: string
      }
      search_admin_workspace: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      set_admin_customer_status: {
        Args: {
          p_customer_id: string
          p_expected_status: string
          p_reason: string
          p_status: string
        }
        Returns: Json
      }
      set_admin_customer_tier: {
        Args: {
          p_customer_id: string
          p_expected_tier: string
          p_reason: string
          p_tier: string
        }
        Returns: Json
      }
      set_customer_service_sla_policy: {
        Args: {
          p_first_response_minutes: number
          p_priority: string
          p_resolution_minutes: number
        }
        Returns: Json
      }
      set_inventory_reorder_point: {
        Args: {
          p_product_id: string
          p_reason: string
          p_reorder_point: number
          p_warehouse_id: string
        }
        Returns: Json
      }
      set_organization_user_roles: {
        Args: { p_profile_id: string; p_roles: string[] }
        Returns: Json
      }
      set_promotion_active: {
        Args: { p_is_active: boolean; p_promotion_id: string }
        Returns: string
      }
      set_staff_product_image: {
        Args: {
          p_expected_image_url: string
          p_image_url: string
          p_product_id: string
        }
        Returns: Json
      }
      set_stock_count_line: {
        Args: {
          p_counted_quantity: number
          p_product_id: string
          p_session_id: string
        }
        Returns: Json
      }
      set_storefront_saved_product: {
        Args: { p_product_id: string; p_saved: boolean }
        Returns: Json
      }
      simulate_commerce_policy: {
        Args: { p_input: Json; p_simulation_type: string }
        Returns: Json
      }
      start_operational_shift: {
        Args: {
          p_business_date: string
          p_idempotency_key: string
          p_previous_shift_id?: string
          p_shift_label: string
          p_time_zone: string
        }
        Returns: Json
      }
      start_stock_count: {
        Args: {
          p_idempotency_key: string
          p_notes?: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      storefront_catalog_token_matches: {
        Args: { p_candidate: string; p_query: string }
        Returns: boolean
      }
      submit_customer_order: {
        Args: {
          _business_name: string
          _contact_name: string
          _delivery_address_id?: string
          _idempotency_key?: string
          _items: Json
          _notes: string
          _payment_terms?: string
          _phone: string
        }
        Returns: Json
      }
      submit_customer_order_amendment: {
        Args: {
          p_idempotency_key?: string
          p_lines: Json
          p_note?: string
          p_order_id: string
        }
        Returns: Json
      }
      submit_finance_cash_opening_balance: {
        Args: {
          p_as_of_date: string
          p_evidence_id: string
          p_idempotency_key: string
          p_opening_balance: number
          p_settlement_account_mapping_id: string
        }
        Returns: Json
      }
      submit_purchase_order: {
        Args: { p_purchase_order_id: string }
        Returns: Json
      }
      supplier_invoice_verified_due_receipts: {
        Args: { p_currency?: string; p_organization_id: string }
        Returns: {
          currency: string
          due_date: string
          due_date_evidence_id: string
          due_date_recorded_at: string
          invoice_created_at: string
          invoice_id: string
          invoice_number: string
          outstanding_payable: number
          receipt_date: string
          receipt_id: string
          receipt_number: string
          source_journal_entry_id: string
          supplier_id: string
          supplier_name: string
        }[]
      }
      supplier_payment_open_receipts: {
        Args: {
          p_currency?: string
          p_organization_id: string
          p_supplier_id?: string
        }
        Returns: {
          available_to_allocate: number
          credit_note_total: number
          currency: string
          outstanding_payable: number
          payable_account_code: string
          payable_account_id: string
          payable_account_name: string
          posted_payment_total: number
          purchase_order_number: string
          receipt_date: string
          receipt_id: string
          receipt_number: string
          reserved_payment_total: number
          source_amount: number
          source_journal_entry_id: string
          source_journal_entry_number: string
          supplier_id: string
          supplier_name: string
        }[]
      }
      sweep_expired_async_export_jobs: {
        Args: { p_limit?: number }
        Returns: {
          job_id: string
          object_path: string
        }[]
      }
      sync_customer_cart: { Args: { p_items: Json }; Returns: Json }
      transfer_inventory: {
        Args: {
          p_destination_warehouse_id: string
          p_idempotency_key: string
          p_product_id: string
          p_quantity: number
          p_reason: string
          p_source_warehouse_id: string
        }
        Returns: Json
      }
      transfer_inventory_batch: {
        Args: {
          p_destination_warehouse_id: string
          p_idempotency_key: string
          p_lines: Json
          p_reason: string
          p_source_warehouse_id: string
        }
        Returns: Json
      }
      update_customer_service_case: {
        Args: {
          p_case_id: string
          p_note?: string
          p_priority?: string
          p_status?: string
        }
        Returns: Json
      }
      update_manual_operational_task: {
        Args: { p_description?: string; p_task_id: string; p_title: string }
        Returns: Json
      }
      update_my_customer_account_profile: {
        Args: {
          p_business_name: string
          p_contact_name: string
          p_email: string
          p_expected_updated_at: string
          p_phone: string
        }
        Returns: Json
      }
      update_operational_task_details: {
        Args: { p_due_at?: string; p_priority: string; p_task_id: string }
        Returns: Json
      }
      update_operational_task_status: {
        Args: {
          p_resolution_note?: string
          p_status: string
          p_task_id: string
        }
        Returns: Json
      }
      update_operational_tasks_details: {
        Args: { p_due_at?: string; p_priority: string; p_task_ids: string[] }
        Returns: Json
      }
      upsert_operational_task: {
        Args: {
          p_description: string
          p_due_at?: string
          p_entity_id: string
          p_entity_type: string
          p_event_key: string
          p_org: string
          p_payload?: Json
          p_priority: string
          p_reopen?: boolean
          p_role: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      validate_checkout_cart: { Args: { p_items: Json }; Returns: Json }
      void_cash_expense: {
        Args: { p_expense_id: string; p_reason: string }
        Returns: Json
      }
      void_customer_return_credit_memo_draft: {
        Args: { p_credit_memo_id: string; p_reason: string }
        Returns: Json
      }
      void_finance_bank_statement: {
        Args: { p_reason: string; p_statement_id: string }
        Returns: Json
      }
      void_general_journal_draft: {
        Args: { p_entry_id: string; p_reason: string }
        Returns: Json
      }
      void_purchase_supplier_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: Json
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
    Enums: {},
  },
} as const
