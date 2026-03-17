-- Migration: add context_file_patterns to org_config and repository_config
-- Enables org admins to specify glob patterns for supplementary context files
-- (design docs, requirements, ADRs) to include in artefact extraction.
-- Design reference: docs/design/lld-artefact-pipeline.md section 2.5
-- Issue: #45

ALTER TABLE org_config
  ADD COLUMN context_file_patterns text[] NOT NULL DEFAULT '{}';

-- repository_config stores nullable overrides; null means inherit from org_config.
ALTER TABLE repository_config
  ADD COLUMN context_file_patterns text[];
