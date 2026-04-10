// Generated TypeScript types for the Supabase database schema.
// Run `npx supabase gen types typescript --local` to regenerate after schema changes.
// Design reference: v1-design.md section 4.1

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      organisations: {
        Row: {
          id: string;
          github_org_id: number;
          github_org_name: string;
          installation_id: number;
          status: 'active' | 'inactive';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          github_org_id: number;
          github_org_name: string;
          installation_id: number;
          status?: 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          github_org_id?: number;
          github_org_name?: string;
          installation_id?: number;
          status?: 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      org_config: {
        Row: {
          id: string;
          org_id: string;
          prcc_enabled: boolean;
          fcs_enabled: boolean;
          enforcement_mode: 'soft' | 'hard';
          score_threshold: number;
          prcc_question_count: number;
          fcs_question_count: number;
          min_pr_size: number;
          trivial_commit_threshold: number;
          exempt_file_patterns: string[];
          context_file_patterns: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          prcc_enabled?: boolean;
          fcs_enabled?: boolean;
          enforcement_mode?: 'soft' | 'hard';
          score_threshold?: number;
          prcc_question_count?: number;
          fcs_question_count?: number;
          min_pr_size?: number;
          trivial_commit_threshold?: number;
          exempt_file_patterns?: string[];
          context_file_patterns?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          prcc_enabled?: boolean;
          fcs_enabled?: boolean;
          enforcement_mode?: 'soft' | 'hard';
          score_threshold?: number;
          prcc_question_count?: number;
          fcs_question_count?: number;
          min_pr_size?: number;
          trivial_commit_threshold?: number;
          exempt_file_patterns?: string[];
          context_file_patterns?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organisation_contexts: {
        Row: {
          id: string;
          org_id: string;
          project_id: string | null;
          context: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          project_id?: string | null;
          context?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          project_id?: string | null;
          context?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      repositories: {
        Row: {
          id: string;
          org_id: string;
          github_repo_id: number;
          github_repo_name: string;
          status: 'active' | 'inactive';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          github_repo_id: number;
          github_repo_name: string;
          status?: 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          github_repo_id?: number;
          github_repo_name?: string;
          status?: 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      repository_config: {
        Row: {
          id: string;
          org_id: string;
          repository_id: string;
          prcc_enabled: boolean | null;
          fcs_enabled: boolean | null;
          enforcement_mode: 'soft' | 'hard' | null;
          score_threshold: number | null;
          prcc_question_count: number | null;
          fcs_question_count: number | null;
          min_pr_size: number | null;
          trivial_commit_threshold: number | null;
          exempt_file_patterns: string[] | null;
          context_file_patterns: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          repository_id: string;
          prcc_enabled?: boolean | null;
          fcs_enabled?: boolean | null;
          enforcement_mode?: 'soft' | 'hard' | null;
          score_threshold?: number | null;
          prcc_question_count?: number | null;
          fcs_question_count?: number | null;
          min_pr_size?: number | null;
          trivial_commit_threshold?: number | null;
          exempt_file_patterns?: string[] | null;
          context_file_patterns?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          repository_id?: string;
          prcc_enabled?: boolean | null;
          fcs_enabled?: boolean | null;
          enforcement_mode?: 'soft' | 'hard' | null;
          score_threshold?: number | null;
          prcc_question_count?: number | null;
          fcs_question_count?: number | null;
          min_pr_size?: number | null;
          trivial_commit_threshold?: number | null;
          exempt_file_patterns?: string[] | null;
          context_file_patterns?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_organisations: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          github_user_id: number;
          github_username: string;
          github_role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          org_id: string;
          github_user_id: number;
          github_username: string;
          github_role: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          org_id?: string;
          github_user_id?: number;
          github_username?: string;
          github_role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      assessments: {
        Row: {
          id: string;
          org_id: string;
          repository_id: string;
          type: 'prcc' | 'fcs';
          status:
            | 'created'
            | 'rubric_generation'
            | 'generation_failed'
            | 'rubric_failed'
            | 'awaiting_responses'
            | 'scoring'
            | 'completed'
            | 'invalidated'
            | 'skipped';
          pr_number: number | null;
          pr_head_sha: string | null;
          feature_name: string | null;
          feature_description: string | null;
          check_run_id: number | null;
          aggregate_score: number | null;
          scoring_incomplete: boolean;
          artefact_quality: string | null;
          conclusion: 'success' | 'failure' | 'neutral' | null;
          config_enforcement_mode: string;
          config_score_threshold: number;
          config_question_count: number;
          config_min_pr_size: number;
          skip_reason: string | null;
          skipped_by: string | null;
          skipped_at: string | null;
          superseded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          repository_id: string;
          type: 'prcc' | 'fcs';
          status?:
            | 'created'
            | 'rubric_generation'
            | 'generation_failed'
            | 'rubric_failed'
            | 'awaiting_responses'
            | 'scoring'
            | 'completed'
            | 'invalidated'
            | 'skipped';
          pr_number?: number | null;
          pr_head_sha?: string | null;
          feature_name?: string | null;
          feature_description?: string | null;
          check_run_id?: number | null;
          aggregate_score?: number | null;
          scoring_incomplete?: boolean;
          artefact_quality?: string | null;
          conclusion?: 'success' | 'failure' | 'neutral' | null;
          config_enforcement_mode: string;
          config_score_threshold: number;
          config_question_count: number;
          config_min_pr_size: number;
          skip_reason?: string | null;
          skipped_by?: string | null;
          skipped_at?: string | null;
          superseded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          repository_id?: string;
          type?: 'prcc' | 'fcs';
          status?:
            | 'created'
            | 'rubric_generation'
            | 'generation_failed'
            | 'rubric_failed'
            | 'awaiting_responses'
            | 'scoring'
            | 'completed'
            | 'invalidated'
            | 'skipped';
          pr_number?: number | null;
          pr_head_sha?: string | null;
          feature_name?: string | null;
          feature_description?: string | null;
          check_run_id?: number | null;
          aggregate_score?: number | null;
          scoring_incomplete?: boolean;
          artefact_quality?: string | null;
          conclusion?: 'success' | 'failure' | 'neutral' | null;
          config_enforcement_mode?: string;
          config_score_threshold?: number;
          config_question_count?: number;
          config_min_pr_size?: number;
          skip_reason?: string | null;
          skipped_by?: string | null;
          skipped_at?: string | null;
          superseded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      assessment_questions: {
        Row: {
          id: string;
          org_id: string;
          assessment_id: string;
          question_number: number;
          naur_layer: 'world_to_program' | 'design_justification' | 'modification_capacity';
          question_text: string;
          weight: number;
          reference_answer: string;
          aggregate_score: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          assessment_id: string;
          question_number: number;
          naur_layer: 'world_to_program' | 'design_justification' | 'modification_capacity';
          question_text: string;
          weight: number;
          reference_answer: string;
          aggregate_score?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          assessment_id?: string;
          question_number?: number;
          naur_layer?: 'world_to_program' | 'design_justification' | 'modification_capacity';
          question_text?: string;
          weight?: number;
          reference_answer?: string;
          aggregate_score?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      assessment_participants: {
        Row: {
          id: string;
          org_id: string;
          assessment_id: string;
          user_id: string | null;
          github_user_id: number;
          github_username: string;
          contextual_role: 'author' | 'reviewer' | 'participant';
          status: 'pending' | 'submitted' | 'removed' | 'did_not_participate';
          submitted_at: string | null;
          removed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          assessment_id: string;
          user_id?: string | null;
          github_user_id: number;
          github_username: string;
          contextual_role: 'author' | 'reviewer' | 'participant';
          status?: 'pending' | 'submitted' | 'removed' | 'did_not_participate';
          submitted_at?: string | null;
          removed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          assessment_id?: string;
          user_id?: string | null;
          github_user_id?: number;
          github_username?: string;
          contextual_role?: 'author' | 'reviewer' | 'participant';
          status?: 'pending' | 'submitted' | 'removed' | 'did_not_participate';
          submitted_at?: string | null;
          removed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      participant_answers: {
        Row: {
          id: string;
          org_id: string;
          assessment_id: string;
          participant_id: string;
          question_id: string;
          answer_text: string;
          is_relevant: boolean | null;
          relevance_explanation: string | null;
          score: number | null;
          score_rationale: string | null;
          is_reassessment: boolean;
          attempt_number: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          assessment_id: string;
          participant_id: string;
          question_id: string;
          answer_text: string;
          is_relevant?: boolean | null;
          relevance_explanation?: string | null;
          score?: number | null;
          score_rationale?: string | null;
          is_reassessment?: boolean;
          attempt_number?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          assessment_id?: string;
          participant_id?: string;
          question_id?: string;
          answer_text?: string;
          is_relevant?: boolean | null;
          relevance_explanation?: string | null;
          score?: number | null;
          score_rationale?: string | null;
          is_reassessment?: boolean;
          attempt_number?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      fcs_merged_prs: {
        Row: {
          id: string;
          org_id: string;
          assessment_id: string;
          pr_number: number;
          pr_title: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          assessment_id: string;
          pr_number: number;
          pr_title: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          assessment_id?: string;
          pr_number?: number;
          pr_title?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      sync_debounce: {
        Row: {
          id: string;
          org_id: string;
          repository_id: string;
          pr_number: number;
          latest_sha: string;
          received_at: string;
          process_after: string;
          processed: boolean;
        };
        Insert: {
          id?: string;
          org_id: string;
          repository_id: string;
          pr_number: number;
          latest_sha: string;
          received_at?: string;
          process_after: string;
          processed?: boolean;
        };
        Update: {
          id?: string;
          org_id?: string;
          repository_id?: string;
          pr_number?: number;
          latest_sha?: string;
          received_at?: string;
          process_after?: string;
          processed?: boolean;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_user_org_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      is_org_admin: {
        Args: { check_org_id: string };
        Returns: boolean;
      };
      is_assessment_participant: {
        Args: { check_assessment_id: string };
        Returns: boolean;
      };
      link_participant: {
        Args: { p_assessment_id: string; p_github_user_id: number };
        Returns: string;
      };
      get_effective_config: {
        Args: { repo_id: string };
        Returns: {
          prcc_enabled: boolean;
          fcs_enabled: boolean;
          enforcement_mode: string;
          score_threshold: number;
          prcc_question_count: number;
          fcs_question_count: number;
          min_pr_size: number;
          trivial_commit_threshold: number;
          exempt_file_patterns: string[];
          context_file_patterns: string[];
        }[];
      };
      handle_installation_created: {
        Args: {
          p_github_org_id: number;
          p_github_org_name: string;
          p_installation_id: number;
          p_repos?: Json;
        };
        Returns: string;
      };
      handle_installation_deleted: {
        Args: { p_installation_id: number };
        Returns: void;
      };
      handle_repositories_added: {
        Args: { p_installation_id: number; p_repos: Json };
        Returns: void;
      };
      create_fcs_assessment: {
        Args: {
          p_id: string;
          p_org_id: string;
          p_repository_id: string;
          p_feature_name: string;
          p_feature_description: string;
          p_config_enforcement_mode: string;
          p_config_score_threshold: number;
          p_config_question_count: number;
          p_config_min_pr_size: number;
          p_merged_prs: Json;
          p_participants: Json;
        };
        Returns: string;
      };
      finalise_rubric: {
        Args: { p_assessment_id: string; p_org_id: string; p_questions: Json };
        Returns: void;
      };
      persist_scoring_results: {
        Args: {
          p_assessment_id: string;
          p_aggregate_score: number;
          p_scoring_incomplete: boolean;
          p_scored: Json;
        };
        Returns: void;
      };
    };
  };
}
