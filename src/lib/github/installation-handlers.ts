// GitHub App installation event handlers.
// Design reference: docs/design/v1-design.md §4.4, §4.5

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Payload types (§4.5 GitHub Webhook Payloads)
// ---------------------------------------------------------------------------

interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
}

interface GithubAccount {
  id: number;
  login: string;
  type: string;
}

export interface InstallationCreatedPayload {
  action: 'created';
  installation: { id: number; account: GithubAccount; app_id: number };
  repositories?: GithubRepo[];
}

export interface InstallationDeletedPayload {
  action: 'deleted';
  installation: { id: number; account: GithubAccount; app_id: number };
}

export interface InstallationRepositoriesPayload {
  action: 'added' | 'removed';
  installation: { id: number };
  repositories_added: GithubRepo[];
  repositories_removed: GithubRepo[];
}

type Db = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildRepoRows(orgId: string, repos: GithubRepo[], now: string) {
  return repos.map(r => ({
    org_id: orgId,
    github_repo_id: r.id,
    github_repo_name: r.full_name,
    status: 'active' as const,
    updated_at: now,
  }));
}

async function upsertOrg(
  supabase: Db,
  installation: InstallationCreatedPayload['installation'],
  now: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('organisations')
    .upsert(
      {
        github_org_id: installation.account.id,
        github_org_name: installation.account.login,
        installation_id: installation.id,
        status: 'active',
        updated_at: now,
      },
      { onConflict: 'github_org_id' },
    )
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('upsertOrg failed:', error);
    throw error;
  }
  if (!data?.id) throw new Error('Could not resolve org ID after upsert');
  return data.id;
}

async function upsertOrgConfig(supabase: Db, orgId: string, now: string): Promise<void> {
  const { error } = await supabase
    .from('org_config')
    .upsert({ org_id: orgId, updated_at: now }, { onConflict: 'org_id' });
  if (error) {
    console.error('upsertOrgConfig failed:', error);
    throw error;
  }
}

async function upsertRepos(supabase: Db, orgId: string, repos: GithubRepo[], now: string): Promise<void> {
  if (repos.length === 0) return;
  const { error } = await supabase
    .from('repositories')
    .upsert(buildRepoRows(orgId, repos, now), { onConflict: 'github_repo_id' });
  if (error) {
    console.error('upsertRepos failed:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleInstallationCreated(
  payload: InstallationCreatedPayload,
  supabase: Db,
): Promise<void> {
  const { installation, repositories } = payload;
  const now = new Date().toISOString();
  const orgId = await upsertOrg(supabase, installation, now);
  await Promise.all([
    upsertOrgConfig(supabase, orgId, now),
    upsertRepos(supabase, orgId, repositories ?? [], now),
  ]);
}

export async function handleInstallationDeleted(
  payload: InstallationDeletedPayload,
  supabase: Db,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('organisations')
    .update({ status: 'inactive', updated_at: now })
    .eq('installation_id', payload.installation.id);
  if (error) {
    console.error('handleInstallationDeleted: org update failed:', error);
    throw error;
  }
}

export async function handleRepositoriesAdded(
  payload: InstallationRepositoriesPayload,
  supabase: Db,
): Promise<void> {
  if (payload.repositories_added.length === 0) return;
  const now = new Date().toISOString();
  const { data: org, error: orgError } = await supabase
    .from('organisations')
    .select('id')
    .eq('installation_id', payload.installation.id)
    .maybeSingle();
  if (orgError) {
    console.error('handleRepositoriesAdded: org lookup failed:', orgError);
    throw orgError;
  }
  const orgId = org?.id;
  if (!orgId) {
    throw new Error(`No org found for installation ${payload.installation.id}`);
  }
  await upsertRepos(supabase, orgId, payload.repositories_added, now);
}

export async function handleRepositoriesRemoved(
  payload: InstallationRepositoriesPayload,
  supabase: Db,
): Promise<void> {
  if (payload.repositories_removed.length === 0) return;
  const now = new Date().toISOString();
  const repoIds = payload.repositories_removed.map(r => r.id);
  const { error } = await supabase
    .from('repositories')
    .update({ status: 'inactive', updated_at: now })
    .in('github_repo_id', repoIds);
  if (error) {
    console.error('handleRepositoriesRemoved: repos update failed:', error);
    throw error;
  }
}
