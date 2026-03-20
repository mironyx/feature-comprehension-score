-- Seed data for local development and integration tests.
-- Applied by `supabase db reset` after all migrations.
-- Scenario: 2 orgs, 3 repos, 3 users, 2 assessments.
-- Design reference: lld-phase-2-web-auth-db.md §2.1

-- ---------------------------------------------------------------------------
-- Auth users (fixed UUIDs for deterministic test data)
-- UUID range: a0000000-0000-0000-0000-* (distinct from org/repo/assessment ranges)
-- ---------------------------------------------------------------------------
-- alice: a0000000-0000-0000-0000-000000000001 (admin of acme-corp)
-- bob:   a0000000-0000-0000-0000-000000000002 (member of acme-corp)
-- carol: a0000000-0000-0000-0000-000000000003 (admin of beta-inc)

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  aud,
  role,
  raw_app_meta_data,
  raw_user_meta_data
) VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'alice@example.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    'authenticated',
    'authenticated',
    '{"provider":"github","providers":["github"]}',
    '{"name":"Alice"}'
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'bob@example.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    'authenticated',
    'authenticated',
    '{"provider":"github","providers":["github"]}',
    '{"name":"Bob"}'
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'carol@example.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    'authenticated',
    'authenticated',
    '{"provider":"github","providers":["github"]}',
    '{"name":"Carol"}'
  );

-- ---------------------------------------------------------------------------
-- Organisations
-- ---------------------------------------------------------------------------

-- Organisation 1: Acme Corp (active)
INSERT INTO organisations (id, github_org_id, github_org_name, installation_id, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  1001,
  'acme-corp',
  9001,
  'active'
);

-- Organisation 2: Beta Inc (active)
INSERT INTO organisations (id, github_org_id, github_org_name, installation_id, status)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  1002,
  'beta-inc',
  9002,
  'active'
);

-- ---------------------------------------------------------------------------
-- Org configs
-- ---------------------------------------------------------------------------

INSERT INTO org_config (org_id, enforcement_mode, score_threshold, prcc_question_count, fcs_question_count)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'soft', 70, 3, 5),
  ('00000000-0000-0000-0000-000000000002', 'hard', 80, 4, 5);

-- ---------------------------------------------------------------------------
-- Repositories
-- ---------------------------------------------------------------------------

-- Repositories for Acme Corp
INSERT INTO repositories (id, org_id, github_repo_id, github_repo_name, status)
VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 2001, 'api', 'active'),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 2002, 'web', 'active');

-- Repository for Beta Inc
INSERT INTO repositories (id, org_id, github_repo_id, github_repo_name, status)
VALUES
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000002', 2003, 'platform', 'active');

-- ---------------------------------------------------------------------------
-- Repository config overrides
-- ---------------------------------------------------------------------------

-- acme/web overrides prcc_question_count = 5
INSERT INTO repository_config (org_id, repository_id, prcc_question_count)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0001-000000000002',
  5
);

-- ---------------------------------------------------------------------------
-- User → org memberships
-- ---------------------------------------------------------------------------

-- Alice → acme-corp (admin)
INSERT INTO user_organisations (user_id, org_id, github_user_id, github_username, github_role)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  10001,
  'alice',
  'admin'
);

-- Bob → acme-corp (member)
INSERT INTO user_organisations (user_id, org_id, github_user_id, github_username, github_role)
VALUES (
  'a0000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  10002,
  'bob',
  'member'
);

-- Carol → beta-inc (admin)
INSERT INTO user_organisations (user_id, org_id, github_user_id, github_username, github_role)
VALUES (
  'a0000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  10003,
  'carol',
  'admin'
);

-- ---------------------------------------------------------------------------
-- Assessments
-- ---------------------------------------------------------------------------

-- Assessment 1: PRCC on acme/api (awaiting_responses)
INSERT INTO assessments (
  id, org_id, repository_id, type, status,
  config_enforcement_mode, config_score_threshold, config_question_count, config_min_pr_size,
  pr_number, pr_head_sha
) VALUES (
  '00000000-0000-0000-0002-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0001-000000000001',
  'prcc',
  'awaiting_responses',
  'soft', 70, 3, 20,
  42,
  'abc123def456abc123def456abc123def456abc1'
);

-- Assessment 2: FCS on acme/web (completed)
INSERT INTO assessments (
  id, org_id, repository_id, type, status,
  config_enforcement_mode, config_score_threshold, config_question_count, config_min_pr_size,
  feature_name, feature_description,
  aggregate_score, conclusion
) VALUES (
  '00000000-0000-0000-0002-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0001-000000000002',
  'fcs',
  'completed',
  'soft', 70, 3, 20,
  'User authentication',
  'GitHub OAuth integration for the web frontend',
  0.8200,
  'success'
);

-- ---------------------------------------------------------------------------
-- Questions (3 per assessment)
-- ---------------------------------------------------------------------------

-- PRCC questions (assessment 1)
INSERT INTO assessment_questions (
  id, org_id, assessment_id, question_number, naur_layer,
  question_text, weight, reference_answer
) VALUES
  (
    '00000000-0000-0000-0003-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0002-000000000001',
    1, 'world_to_program',
    'What problem does this pull request solve?',
    2,
    'Adds paginated listing of repository events to the API.'
  ),
  (
    '00000000-0000-0000-0003-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0002-000000000001',
    2, 'design_justification',
    'Why was cursor-based pagination chosen over offset pagination?',
    2,
    'Cursor-based pagination is stable under concurrent inserts and avoids page drift.'
  ),
  (
    '00000000-0000-0000-0003-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0002-000000000001',
    3, 'modification_capacity',
    'How would you add filtering by event type to this endpoint?',
    1,
    'Add an optional event_type query parameter and extend the WHERE clause in the query builder.'
  );

-- FCS questions (assessment 2)
INSERT INTO assessment_questions (
  id, org_id, assessment_id, question_number, naur_layer,
  question_text, weight, reference_answer
) VALUES
  (
    '00000000-0000-0000-0003-000000000004',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0002-000000000002',
    1, 'world_to_program',
    'What does the GitHub OAuth callback route do?',
    2,
    'Exchanges the OAuth code for an access token, fetches org membership, and creates a session.'
  ),
  (
    '00000000-0000-0000-0003-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0002-000000000002',
    2, 'design_justification',
    'Why are GitHub tokens stored encrypted rather than as plain text?',
    3,
    'Encrypted storage limits exposure if the database is compromised; pgsodium provides envelope encryption with key rotation support.'
  ),
  (
    '00000000-0000-0000-0003-000000000006',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0002-000000000002',
    3, 'modification_capacity',
    'How would you extend authentication to support GitLab in addition to GitHub?',
    1,
    'Add a GitLab OAuth provider, a separate token table or a provider column, and update the org-membership sync logic.'
  );

-- ---------------------------------------------------------------------------
-- Participants
-- ---------------------------------------------------------------------------

-- PRCC participants: Alice (author) + Bob (reviewer)
INSERT INTO assessment_participants (
  id, org_id, assessment_id,
  user_id, github_user_id, github_username, contextual_role, status
) VALUES
  (
    '00000000-0000-0000-0004-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0002-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    10001, 'alice', 'author', 'pending'
  ),
  (
    '00000000-0000-0000-0004-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0002-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    10002, 'bob', 'reviewer', 'pending'
  );

-- FCS participant: Alice (submitted)
INSERT INTO assessment_participants (
  id, org_id, assessment_id,
  user_id, github_user_id, github_username, contextual_role, status, submitted_at
) VALUES (
  '00000000-0000-0000-0004-000000000003',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0002-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  10001, 'alice', 'author', 'submitted', now()
);

-- ---------------------------------------------------------------------------
-- Answers (Alice's FCS answers with scores for self-view testing)
-- ---------------------------------------------------------------------------

INSERT INTO participant_answers (
  id, org_id, assessment_id, participant_id, question_id,
  answer_text, score, score_rationale, attempt_number, is_reassessment
) VALUES
  (
    '00000000-0000-0000-0005-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0002-000000000002',
    '00000000-0000-0000-0004-000000000003',
    '00000000-0000-0000-0003-000000000004',
    'The callback exchanges the OAuth code for a GitHub access token, looks up org memberships, and stores a Supabase session.',
    0.90,
    'Answer covers all three core steps described in the reference answer.',
    1, false
  ),
  (
    '00000000-0000-0000-0005-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0002-000000000002',
    '00000000-0000-0000-0004-000000000003',
    '00000000-0000-0000-0003-000000000005',
    'To keep tokens safe in case the database leaks.',
    0.65,
    'Partially correct — identifies the security rationale but omits the pgsodium and key rotation detail.',
    1, false
  ),
  (
    '00000000-0000-0000-0005-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0002-000000000002',
    '00000000-0000-0000-0004-000000000003',
    '00000000-0000-0000-0003-000000000006',
    'Add a new OAuth provider and update the sign-in flow to route to the correct provider.',
    0.70,
    'Covers the provider addition but does not address token storage or org membership sync differences.',
    1, false
  );
