
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

// Justification: toRepoJson replaces buildRepoRows after the #118 transactional RPC refactor.
// The RPC functions accept JSONB arrays directly, so we only need id + full_name projection.
function toRepoJson(repos: GithubRepo[]) {
  return repos.map(r => ({ id: r.id, full_name: r.full_name }));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleWebhookEvent(
  event: string,
  payload: Record<string, unknown>,
  supabase: Db,
): Promise<void> {
  const action = typeof payload.action === 'string' ? payload.action : '';
  if (event === 'installation' ) 
    if (action === 'created') 
        return handleInstallationCreated(payload as unknown as InstallationCreatedPayload, supabase);
    else if (action === 'deleted') 
        return handleInstallationDeleted(payload as unknown as InstallationDeletedPayload, supabase);
  if (event === 'installation_repositories')
    if (action === 'added') 
        return handleRepositoriesAdded(payload as unknown as InstallationRepositoriesPayload, supabase);
    else if (action === 'removed') 
       return handleRepositoriesRemoved(payload as unknown as InstallationRepositoriesPayload, supabase);
}

export async function handleInstallationCreated(
  payload: InstallationCreatedPayload,
  supabase: Db,
): Promise<void> {
  const { installation, repositories } = payload;
  const { error } = await supabase.rpc('handle_installation_created', {
    p_github_org_id: installation.account.id,
    p_github_org_name: installation.account.login,
    p_installation_id: installation.id,
    p_repos: toRepoJson(repositories ?? []),
  });
  if (error) {
    console.error('handleInstallationCreated: rpc failed:', error);
    throw error;
  }
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
  const { error } = await supabase.rpc('handle_repositories_added', {
    p_installation_id: payload.installation.id,
    p_repos: toRepoJson(payload.repositories_added),
  });
  if (error) {
    console.error('handleRepositoriesAdded: rpc failed:', error);
    throw error;
  }
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
