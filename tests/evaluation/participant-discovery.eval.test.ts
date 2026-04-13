// Adversarial evaluation tests for issue #206 — participant discovery before link_participant.
//
// These tests analyse the SQL schema files directly to verify structural
// properties of the fix. They do not require a running Supabase instance.
//
// Failures here are findings — do NOT change implementation files to fix them.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Load SQL sources once
// ---------------------------------------------------------------------------

const SCHEMA_ROOT = join(import.meta.dirname, '../../supabase/schemas');
const MIGRATION_ROOT = join(import.meta.dirname, '../../supabase/migrations');

function loadSchema(filename: string): string {
  return readFileSync(join(SCHEMA_ROOT, filename), 'utf-8');
}

function loadMigration(filename: string): string {
  return readFileSync(join(MIGRATION_ROOT, filename), 'utf-8');
}

const functionsSQL = loadSchema('functions.sql');
const policiesSQL = loadSchema('policies.sql');
const migrationSQL = loadMigration('20260413133736_participant_discovery_rls.sql');

// ---------------------------------------------------------------------------
// AC-1: Unlinked participant can see assessments
// Verified by: is_assessment_participant() includes github_user_id fallback
// ---------------------------------------------------------------------------

describe('AC-1: is_assessment_participant() supports unlinked participants', () => {
  it('function body matches by github_user_id when user_id IS NULL', () => {
    expect(functionsSQL).toContain('ap.user_id IS NULL');
    expect(functionsSQL).toContain('ap.github_user_id IN');
    expect(functionsSQL).toContain('uo.user_id = auth.uid()');
  });

  it('function guards against removed participants on the github_user_id path', () => {
    // The is_assessment_participant function must filter removed status even for
    // the unlinked path — the status check must be outside both OR branches.
    // We verify the status filter appears before the OR block (not duplicated inside).
    const fnStart = functionsSQL.indexOf('CREATE OR REPLACE FUNCTION is_assessment_participant');
    const fnEnd = functionsSQL.indexOf('\n$$;', fnStart);
    const fnBody = functionsSQL.slice(fnStart, fnEnd);

    // status != 'removed' must appear in the WHERE clause, not just inside one branch
    const statusCheckCount = (fnBody.match(/status\s*!=\s*'removed'/g) ?? []).length;
    // Exactly one check — positioned before the OR block
    expect(statusCheckCount).toBe(1);

    // The status check must precede the OR block
    const statusCheckPos = fnBody.indexOf("status != 'removed'");
    const orPos = fnBody.indexOf('OR (');
    expect(statusCheckPos).toBeLessThan(orPos);
  });
});

// ---------------------------------------------------------------------------
// AC-2: RLS policies correctly scope visibility for unlinked participants
// ---------------------------------------------------------------------------

describe('AC-2: participants_select_own policy — github_user_id fallback', () => {
  it('policy includes user_id IS NULL guard before github_user_id lookup', () => {
    const policyStart = policiesSQL.indexOf('CREATE POLICY participants_select_own');
    const policyEnd = policiesSQL.indexOf('\n\nCREATE POLICY', policyStart);
    const policyBody = policiesSQL.slice(policyStart, policyEnd);

    expect(policyBody).toContain('user_id IS NULL');
    expect(policyBody).toContain('github_user_id IN');
    expect(policyBody).toContain('uo.user_id = auth.uid()');
  });

  it('participants_select_own does NOT filter removed status (potential over-visibility gap)', () => {
    // This test documents a divergence: is_assessment_participant() filters
    // status != 'removed', but participants_select_own does not.
    // A removed participant can still select their own participant row.
    // This test WILL pass (no status filter exists) — it serves as a finding flag.
    const policyStart = policiesSQL.indexOf('CREATE POLICY participants_select_own');
    const policyEnd = policiesSQL.indexOf('\n\nCREATE POLICY', policyStart);
    const policyBody = policiesSQL.slice(policyStart, policyEnd);

    const hasStatusFilter = policyBody.includes("status != 'removed'");
    // Document the gap: policy does not filter removed participants
    expect(hasStatusFilter).toBe(false);
    // Finding: a removed unlinked participant can still see their own row via
    // participants_select_own, while is_assessment_participant() would deny them
    // access to the assessment itself. The two policies are inconsistent.
  });

  it('participants_update_own does NOT cover unlinked participants', () => {
    // An unlinked participant (user_id IS NULL) cannot update their own participant
    // record via participants_update_own — it only checks user_id = auth.uid().
    // This means submit-answer flows requiring participant_id lookup via user_id
    // will fail for unlinked participants attempting to update their record.
    const updatePolicyStart = policiesSQL.indexOf('CREATE POLICY participants_update_own');
    const updatePolicyEnd = policiesSQL.indexOf('\n\n--', updatePolicyStart);
    const updatePolicyBody = policiesSQL.slice(updatePolicyStart, updatePolicyEnd);

    const hasGithubFallback = updatePolicyBody.includes('github_user_id');
    // Document the gap: no fallback for unlinked participants on UPDATE
    expect(hasGithubFallback).toBe(false);
    // Finding: once a participant is discovered via the github_user_id path, they
    // still cannot update their participant row until link_participant fires.
    // Depending on whether any update is needed pre-link, this may block flows.
  });
});

describe('AC-2: answers policies do NOT cover unlinked participants', () => {
  it('answers_insert_own subquery requires user_id = auth.uid() — blocks unlinked inserts', () => {
    const policyStart = policiesSQL.indexOf('CREATE POLICY answers_insert_own');
    const policyEnd = policiesSQL.indexOf('\n\nCREATE POLICY', policyStart);
    const policyBody = policiesSQL.slice(policyStart, policyEnd);

    // The subquery filters by user_id = auth.uid() only — no github_user_id fallback
    expect(policyBody).toContain('user_id = auth.uid()');
    const hasGithubFallback = policyBody.includes('github_user_id');
    expect(hasGithubFallback).toBe(false);
    // Finding: an unlinked participant who discovered their assessment via AC-1
    // cannot insert answers because answers_insert_own requires user_id to be set.
  });

  it('answers_select_own subquery requires user_id = auth.uid() — blocks unlinked reads', () => {
    const policyStart = policiesSQL.indexOf('CREATE POLICY answers_select_own');
    const policyEnd = policiesSQL.indexOf('\n\nCREATE POLICY', policyStart);
    const policyBody = policiesSQL.slice(policyStart, policyEnd);

    expect(policyBody).toContain('user_id = auth.uid()');
    const hasGithubFallback = policyBody.includes('github_user_id');
    expect(hasGithubFallback).toBe(false);
    // Finding: consistent with answers_insert_own — unlinked participants cannot
    // read their own answers either. Both gaps vanish once link_participant fires,
    // but the combination with AC-1 means a participant can see the assessment
    // list but immediately hit a wall when trying to answer.
  });
});

// ---------------------------------------------------------------------------
// AC-3: link_participant continues to work
// ---------------------------------------------------------------------------

describe('AC-3: link_participant function is unmodified', () => {
  it('link_participant still requires user_id IS NULL (prevents re-linking)', () => {
    const fnStart = functionsSQL.indexOf('CREATE OR REPLACE FUNCTION link_participant');
    const fnEnd = functionsSQL.indexOf('\n$$;', fnStart);
    const fnBody = functionsSQL.slice(fnStart, fnEnd);

    expect(fnBody).toContain('user_id IS NULL');
    expect(fnBody).toContain('SET user_id = auth.uid()');
  });

  it('link_participant matches both assessment_id and github_user_id', () => {
    const fnStart = functionsSQL.indexOf('CREATE OR REPLACE FUNCTION link_participant');
    const fnEnd = functionsSQL.indexOf('\n$$;', fnStart);
    const fnBody = functionsSQL.slice(fnStart, fnEnd);

    expect(fnBody).toContain('assessment_id = p_assessment_id');
    expect(fnBody).toContain('github_user_id = p_github_user_id');
  });
});

// ---------------------------------------------------------------------------
// Migration integrity
// ---------------------------------------------------------------------------

describe('Migration 20260413133736 — structural integrity', () => {
  it('migration drops the old policy before recreating it', () => {
    expect(migrationSQL).toContain('DROP POLICY IF EXISTS participants_select_own');
    expect(migrationSQL).toContain('CREATE POLICY participants_select_own');
    // Drop must precede create
    const dropPos = migrationSQL.indexOf('DROP POLICY IF EXISTS participants_select_own');
    const createPos = migrationSQL.indexOf('CREATE POLICY participants_select_own');
    expect(dropPos).toBeLessThan(createPos);
  });

  it('migration replaces is_assessment_participant with CREATE OR REPLACE', () => {
    expect(migrationSQL).toContain('CREATE OR REPLACE FUNCTION is_assessment_participant');
    // Should not use DROP FUNCTION — OR REPLACE is the safe idempotent form
    expect(migrationSQL).not.toContain('DROP FUNCTION is_assessment_participant');
  });

  it('migration body matches the schema source for is_assessment_participant', () => {
    // Extract the function body from the migration
    const migFnStart = migrationSQL.indexOf('CREATE OR REPLACE FUNCTION is_assessment_participant');
    const migFnEnd = migrationSQL.indexOf('\n$$;', migFnStart);
    const migFnBody = migrationSQL.slice(migFnStart, migFnEnd);

    // Extract from schema
    const schemaFnStart = functionsSQL.indexOf('CREATE OR REPLACE FUNCTION is_assessment_participant');
    const schemaFnEnd = functionsSQL.indexOf('\n$$;', schemaFnStart);
    const schemaFnBody = functionsSQL.slice(schemaFnStart, schemaFnEnd);

    // Core logic must match (normalise whitespace for comparison)
    const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(normalise(migFnBody)).toBe(normalise(schemaFnBody));
  });

  it('migration policy body matches the schema source for participants_select_own', () => {
    // Extract policy from migration
    const migPolicyStart = migrationSQL.indexOf('CREATE POLICY participants_select_own');
    const migPolicyEnd = migrationSQL.indexOf('\n;', migPolicyStart);
    const migPolicyBody = migrationSQL.slice(migPolicyStart, migPolicyEnd);

    // Extract from schema
    const schemaPolicyStart = policiesSQL.indexOf('CREATE POLICY participants_select_own');
    const schemaPolicyEnd = policiesSQL.indexOf('\n\nCREATE POLICY', schemaPolicyStart);
    const schemaPolicyBody = policiesSQL.slice(schemaPolicyStart, schemaPolicyEnd);

    const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(normalise(migPolicyBody)).toBe(normalise(schemaPolicyBody));
  });
});

// ---------------------------------------------------------------------------
// Security boundary: cross-org isolation
// ---------------------------------------------------------------------------

describe('Security: cross-org github_user_id isolation', () => {
  it('github_user_id subquery is scoped by user_id = auth.uid() in user_organisations', () => {
    // The subquery SELECT uo.github_user_id FROM user_organisations uo
    // WHERE uo.user_id = auth.uid() ensures we only return github_user_ids
    // that belong to the authenticated user's own membership rows.
    // This prevents a participant row from being visible to any user who
    // happens to share a github_user_id in a different org.

    // Verify the WHERE clause is present in both the function and the policy.
    const fnStart = functionsSQL.indexOf('CREATE OR REPLACE FUNCTION is_assessment_participant');
    const fnEnd = functionsSQL.indexOf('\n$$;', fnStart);
    const fnBody = functionsSQL.slice(fnStart, fnEnd);

    expect(fnBody).toContain('WHERE uo.user_id = auth.uid()');

    const policyStart = policiesSQL.indexOf('CREATE POLICY participants_select_own');
    const policyEnd = policiesSQL.indexOf('\n\nCREATE POLICY', policyStart);
    const policyBody = policiesSQL.slice(policyStart, policyEnd);

    expect(policyBody).toContain('WHERE uo.user_id = auth.uid()');
  });

  it('user_organisations has no index on github_user_id (performance gap)', () => {
    const tablesSQL = readFileSync(join(SCHEMA_ROOT, 'tables.sql'), 'utf-8');
    // Check whether an index exists on user_organisations.github_user_id
    const hasIndex =
      tablesSQL.includes('idx_user_orgs_github_user_id') ||
      (tablesSQL.includes('user_organisations') &&
        tablesSQL.includes('github_user_id') &&
        /CREATE INDEX[^;]*user_organisations[^;]*github_user_id/s.test(tablesSQL));

    expect(hasIndex).toBe(false);
    // Finding: every RLS evaluation of is_assessment_participant() and
    // participants_select_own now performs a sequential scan of
    // user_organisations filtered by user_id. Without an index on
    // github_user_id, the IN subquery scales linearly with rows per user.
    // For small memberships this is negligible, but it is a gap to flag.
  });
});
