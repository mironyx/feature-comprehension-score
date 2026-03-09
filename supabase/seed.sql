-- Seed data for local development and integration tests.
-- Applied by `supabase db reset` after all migrations.
-- Two organisations, three repositories, org configs, and repository configs.

-- Organisation 1: Acme Corp (active)
INSERT INTO organisations (id, github_org_id, github_org_name, installation_id, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  1001,
  'acme-corp',
  9001,
  'active'
);

-- Organisation 2: Beta Co (active)
INSERT INTO organisations (id, github_org_id, github_org_name, installation_id, status)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  1002,
  'beta-co',
  9002,
  'active'
);

-- Org configs (org defaults)
INSERT INTO org_config (org_id, enforcement_mode, score_threshold, prcc_question_count, fcs_question_count)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'soft', 70, 3, 5),
  ('00000000-0000-0000-0000-000000000002', 'hard', 80, 4, 5);

-- Repositories for Acme Corp
INSERT INTO repositories (id, org_id, github_repo_id, github_repo_name, status)
VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 2001, 'acme-api', 'active'),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 2002, 'acme-frontend', 'active');

-- Repository for Beta Co
INSERT INTO repositories (id, org_id, github_repo_id, github_repo_name, status)
VALUES
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000002', 2003, 'beta-platform', 'active');

-- Repository config override: acme-api uses hard mode with higher threshold
INSERT INTO repository_config (org_id, repository_id, enforcement_mode, score_threshold)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0001-000000000001',
  'hard',
  85
);
