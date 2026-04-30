// Shared types for the Project entity. Design reference: lld-v11-e11-1-project-management.md §B.3

export interface ProjectResponse {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  org_id: string;
  name: string;
  description?: string;
  glob_patterns?: string[];
  domain_notes?: string;
  question_count?: number;
}

export interface ProjectsListResponse {
  projects: ProjectResponse[];
}
