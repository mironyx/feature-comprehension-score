// Shared types for the Project entity. Design reference: lld-v11-e11-1-project-management.md §B.3

export interface ProjectResponse {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}
