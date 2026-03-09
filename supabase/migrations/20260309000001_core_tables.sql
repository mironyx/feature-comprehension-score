-- Migration: core tables
-- Creates the tenant registry, configuration, repository, and user identity tables.
-- Design reference: v1-design.md section 4.1

-- organisations: tenant registry. One row per GitHub App installation (Story 1.1).
CREATE TABLE organisations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_org_id   bigint UNIQUE NOT NULL,
  github_org_name text NOT NULL,
  installation_id bigint UNIQUE NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- org_config: organisation-level default settings (Story 1.4).
-- One row per organisation; created alongside the organisation on app installation.
CREATE TABLE org_config (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL UNIQUE
                              REFERENCES organisations(id) ON DELETE CASCADE,
  prcc_enabled             boolean NOT NULL DEFAULT true,
  fcs_enabled              boolean NOT NULL DEFAULT true,
  enforcement_mode         text NOT NULL DEFAULT 'soft'
                              CHECK (enforcement_mode IN ('soft', 'hard')),
  score_threshold          integer NOT NULL DEFAULT 70
                              CHECK (score_threshold BETWEEN 0 AND 100),
  prcc_question_count      integer NOT NULL DEFAULT 3
                              CHECK (prcc_question_count BETWEEN 3 AND 5),
  fcs_question_count       integer NOT NULL DEFAULT 5
                              CHECK (fcs_question_count BETWEEN 3 AND 5),
  min_pr_size              integer NOT NULL DEFAULT 20
                              CHECK (min_pr_size > 0),
  trivial_commit_threshold integer NOT NULL DEFAULT 5
                              CHECK (trivial_commit_threshold > 0),
  exempt_file_patterns     text[] NOT NULL DEFAULT '{}',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- repositories: registered repositories (Story 1.1).
CREATE TABLE repositories (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL
                      REFERENCES organisations(id) ON DELETE CASCADE,
  github_repo_id   bigint NOT NULL,
  github_repo_name text NOT NULL,
  status           text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'inactive')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, github_repo_id)
);

CREATE INDEX idx_repositories_org ON repositories (org_id);

-- repository_config: per-repository settings (Story 1.3).
-- All config columns nullable — null means inherit from org_config.
-- The get_effective_config() function resolves the cascade.
CREATE TABLE repository_config (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL
                              REFERENCES organisations(id) ON DELETE CASCADE,
  repository_id            uuid NOT NULL UNIQUE
                              REFERENCES repositories(id) ON DELETE CASCADE,
  prcc_enabled             boolean,
  fcs_enabled              boolean,
  enforcement_mode         text CHECK (enforcement_mode IN ('soft', 'hard')),
  score_threshold          integer CHECK (score_threshold BETWEEN 0 AND 100),
  prcc_question_count      integer CHECK (prcc_question_count BETWEEN 3 AND 5),
  fcs_question_count       integer CHECK (fcs_question_count BETWEEN 3 AND 5),
  min_pr_size              integer CHECK (min_pr_size > 0),
  trivial_commit_threshold integer CHECK (trivial_commit_threshold > 0),
  exempt_file_patterns     text[],
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- user_organisations: user ↔ org membership junction table (ADR-0004).
-- Populated at login from GitHub API, refreshed on each sign-in.
CREATE TABLE user_organisations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  github_user_id  bigint NOT NULL,
  github_username text NOT NULL,
  github_role     text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE INDEX idx_user_orgs_user ON user_organisations (user_id);
CREATE INDEX idx_user_orgs_org ON user_organisations (org_id);

-- user_github_tokens: encrypted GitHub OAuth provider tokens (ADR-0003).
-- Captured once at /auth/callback. Encrypted via pgsodium.
CREATE TABLE user_github_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE
                     REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_token text NOT NULL,
  key_id          uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
