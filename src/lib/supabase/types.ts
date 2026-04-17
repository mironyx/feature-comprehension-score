export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
  public: {
    Tables: {
      assessment_participants: {
        Row: {
          assessment_id: string
          contextual_role: string
          created_at: string
          github_user_id: number
          github_username: string
          id: string
          org_id: string
          removed_at: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assessment_id: string
          contextual_role: string
          created_at?: string
          github_user_id: number
          github_username: string
          id?: string
          org_id: string
          removed_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assessment_id?: string
          contextual_role?: string
          created_at?: string
          github_user_id?: number
          github_username?: string
          id?: string
          org_id?: string
          removed_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_participants_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_participants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          aggregate_score: number | null
          assessment_id: string
          created_at: string
          hint: string | null
          id: string
          naur_layer: string
          org_id: string
          question_number: number
          question_text: string
          reference_answer: string
          weight: number
        }
        Insert: {
          aggregate_score?: number | null
          assessment_id: string
          created_at?: string
          hint?: string | null
          id?: string
          naur_layer: string
          org_id: string
          question_number: number
          question_text: string
          reference_answer: string
          weight: number
        }
        Update: {
          aggregate_score?: number | null
          assessment_id?: string
          created_at?: string
          hint?: string | null
          id?: string
          naur_layer?: string
          org_id?: string
          question_number?: number
          question_text?: string
          reference_answer?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_questions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          aggregate_score: number | null
          artefact_quality: string | null
          artefact_quality_dimensions: Json | null
          artefact_quality_score: number | null
          artefact_quality_status: string
          check_run_id: number | null
          conclusion: string | null
          config_comprehension_depth: string
          config_enforcement_mode: string
          config_min_pr_size: number
          config_question_count: number
          config_score_threshold: number
          created_at: string
          feature_description: string | null
          feature_name: string | null
          id: string
          org_id: string
          pr_head_sha: string | null
          pr_number: number | null
          repository_id: string
          scoring_incomplete: boolean
          skip_reason: string | null
          skipped_at: string | null
          skipped_by: string | null
          status: string
          superseded_by: string | null
          type: string
          updated_at: string
        }
        Insert: {
          aggregate_score?: number | null
          artefact_quality?: string | null
          artefact_quality_dimensions?: Json | null
          artefact_quality_score?: number | null
          artefact_quality_status?: string
          check_run_id?: number | null
          conclusion?: string | null
          config_comprehension_depth?: string
          config_enforcement_mode: string
          config_min_pr_size: number
          config_question_count: number
          config_score_threshold: number
          created_at?: string
          feature_description?: string | null
          feature_name?: string | null
          id?: string
          org_id: string
          pr_head_sha?: string | null
          pr_number?: number | null
          repository_id: string
          scoring_incomplete?: boolean
          skip_reason?: string | null
          skipped_at?: string | null
          skipped_by?: string | null
          status?: string
          superseded_by?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          aggregate_score?: number | null
          artefact_quality?: string | null
          artefact_quality_dimensions?: Json | null
          artefact_quality_score?: number | null
          artefact_quality_status?: string
          check_run_id?: number | null
          conclusion?: string | null
          config_comprehension_depth?: string
          config_enforcement_mode?: string
          config_min_pr_size?: number
          config_question_count?: number
          config_score_threshold?: number
          created_at?: string
          feature_description?: string | null
          feature_name?: string | null
          id?: string
          org_id?: string
          pr_head_sha?: string | null
          pr_number?: number | null
          repository_id?: string
          scoring_incomplete?: boolean
          skip_reason?: string | null
          skipped_at?: string | null
          skipped_by?: string | null
          status?: string
          superseded_by?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      fcs_merged_prs: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          org_id: string
          pr_number: number
          pr_title: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          org_id: string
          pr_number: number
          pr_title: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          org_id?: string
          pr_number?: number
          pr_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fcs_merged_prs_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fcs_merged_prs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_config: {
        Row: {
          artefact_quality_threshold: number
          context_file_patterns: string[]
          created_at: string
          enforcement_mode: string
          exempt_file_patterns: string[]
          fcs_enabled: boolean
          fcs_low_threshold: number
          fcs_question_count: number
          id: string
          min_pr_size: number
          org_id: string
          prcc_enabled: boolean
          prcc_question_count: number
          score_threshold: number
          trivial_commit_threshold: number
          updated_at: string
        }
        Insert: {
          artefact_quality_threshold?: number
          context_file_patterns?: string[]
          created_at?: string
          enforcement_mode?: string
          exempt_file_patterns?: string[]
          fcs_enabled?: boolean
          fcs_low_threshold?: number
          fcs_question_count?: number
          id?: string
          min_pr_size?: number
          org_id: string
          prcc_enabled?: boolean
          prcc_question_count?: number
          score_threshold?: number
          trivial_commit_threshold?: number
          updated_at?: string
        }
        Update: {
          artefact_quality_threshold?: number
          context_file_patterns?: string[]
          created_at?: string
          enforcement_mode?: string
          exempt_file_patterns?: string[]
          fcs_enabled?: boolean
          fcs_low_threshold?: number
          fcs_question_count?: number
          id?: string
          min_pr_size?: number
          org_id?: string
          prcc_enabled?: boolean
          prcc_question_count?: number
          score_threshold?: number
          trivial_commit_threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_contexts: {
        Row: {
          context: Json
          created_at: string
          id: string
          org_id: string
          project_id: string | null
          updated_at: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          org_id: string
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          org_id?: string
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_contexts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          github_org_id: number
          github_org_name: string
          id: string
          installation_id: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          github_org_id: number
          github_org_name: string
          id?: string
          installation_id: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          github_org_id?: number
          github_org_name?: string
          id?: string
          installation_id?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      participant_answers: {
        Row: {
          answer_text: string
          assessment_id: string
          attempt_number: number
          created_at: string
          id: string
          is_reassessment: boolean
          is_relevant: boolean | null
          org_id: string
          participant_id: string
          question_id: string
          relevance_explanation: string | null
          score: number | null
          score_rationale: string | null
        }
        Insert: {
          answer_text: string
          assessment_id: string
          attempt_number?: number
          created_at?: string
          id?: string
          is_reassessment?: boolean
          is_relevant?: boolean | null
          org_id: string
          participant_id: string
          question_id: string
          relevance_explanation?: string | null
          score?: number | null
          score_rationale?: string | null
        }
        Update: {
          answer_text?: string
          assessment_id?: string
          attempt_number?: number
          created_at?: string
          id?: string
          is_reassessment?: boolean
          is_relevant?: boolean | null
          org_id?: string
          participant_id?: string
          question_id?: string
          relevance_explanation?: string | null
          score?: number | null
          score_rationale?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participant_answers_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_answers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_answers_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "assessment_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      repositories: {
        Row: {
          created_at: string
          github_repo_id: number
          github_repo_name: string
          id: string
          org_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          github_repo_id: number
          github_repo_name: string
          id?: string
          org_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          github_repo_id?: number
          github_repo_name?: string
          id?: string
          org_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repositories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      repository_config: {
        Row: {
          context_file_patterns: string[] | null
          created_at: string
          enforcement_mode: string | null
          exempt_file_patterns: string[] | null
          fcs_enabled: boolean | null
          fcs_question_count: number | null
          id: string
          min_pr_size: number | null
          org_id: string
          prcc_enabled: boolean | null
          prcc_question_count: number | null
          repository_id: string
          score_threshold: number | null
          trivial_commit_threshold: number | null
          updated_at: string
        }
        Insert: {
          context_file_patterns?: string[] | null
          created_at?: string
          enforcement_mode?: string | null
          exempt_file_patterns?: string[] | null
          fcs_enabled?: boolean | null
          fcs_question_count?: number | null
          id?: string
          min_pr_size?: number | null
          org_id: string
          prcc_enabled?: boolean | null
          prcc_question_count?: number | null
          repository_id: string
          score_threshold?: number | null
          trivial_commit_threshold?: number | null
          updated_at?: string
        }
        Update: {
          context_file_patterns?: string[] | null
          created_at?: string
          enforcement_mode?: string | null
          exempt_file_patterns?: string[] | null
          fcs_enabled?: boolean | null
          fcs_question_count?: number | null
          id?: string
          min_pr_size?: number | null
          org_id?: string
          prcc_enabled?: boolean | null
          prcc_question_count?: number | null
          repository_id?: string
          score_threshold?: number | null
          trivial_commit_threshold?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repository_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repository_config_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: true
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_debounce: {
        Row: {
          id: string
          latest_sha: string
          org_id: string
          pr_number: number
          process_after: string
          processed: boolean
          received_at: string
          repository_id: string
        }
        Insert: {
          id?: string
          latest_sha: string
          org_id: string
          pr_number: number
          process_after: string
          processed?: boolean
          received_at?: string
          repository_id: string
        }
        Update: {
          id?: string
          latest_sha?: string
          org_id?: string
          pr_number?: number
          process_after?: string
          processed?: boolean
          received_at?: string
          repository_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_debounce_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_debounce_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_organisations: {
        Row: {
          created_at: string
          github_role: string
          github_user_id: number
          github_username: string
          id: string
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          github_role: string
          github_user_id: number
          github_username: string
          id?: string
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          github_role?: string
          github_user_id?: number
          github_username?: string
          id?: string
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organisations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_fcs_assessment: {
        Args: {
          p_config_comprehension_depth?: string
          p_config_enforcement_mode: string
          p_config_min_pr_size: number
          p_config_question_count: number
          p_config_score_threshold: number
          p_feature_description: string
          p_feature_name: string
          p_id: string
          p_merged_prs: Json
          p_org_id: string
          p_participants: Json
          p_repository_id: string
        }
        Returns: string
      }
      finalise_rubric_v2: {
        Args: {
          p_assessment_id: string
          p_org_id: string
          p_quality_dimensions: Json | null
          p_quality_score: number | null
          p_quality_status: string
          p_questions: Json
        }
        Returns: undefined
      }
      get_effective_config: {
        Args: { repo_id: string }
        Returns: {
          context_file_patterns: string[]
          enforcement_mode: string
          exempt_file_patterns: string[]
          fcs_enabled: boolean
          fcs_question_count: number
          min_pr_size: number
          prcc_enabled: boolean
          prcc_question_count: number
          score_threshold: number
          trivial_commit_threshold: number
        }[]
      }
      get_user_org_ids: { Args: never; Returns: string[] }
      handle_installation_created: {
        Args: {
          p_github_org_id: number
          p_github_org_name: string
          p_installation_id: number
          p_repos?: Json
        }
        Returns: string
      }
      handle_installation_deleted: {
        Args: { p_installation_id: number }
        Returns: undefined
      }
      handle_repositories_added: {
        Args: { p_installation_id: number; p_repos: Json }
        Returns: undefined
      }
      is_assessment_participant: {
        Args: { check_assessment_id: string }
        Returns: boolean
      }
      is_org_admin: { Args: { check_org_id: string }; Returns: boolean }
      link_all_participants: {
        Args: { p_github_user_id: number; p_user_id: string }
        Returns: number
      }
      link_participant: {
        Args: { p_assessment_id: string; p_github_user_id: number }
        Returns: string
      }
      persist_scoring_results: {
        Args: {
          p_aggregate_score: number
          p_assessment_id: string
          p_scored: Json
          p_scoring_incomplete: boolean
        }
        Returns: undefined
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

