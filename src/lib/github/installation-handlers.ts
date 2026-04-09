
// GitHub App installation event handlers.
// Design reference: docs/design/v1-design.md §4.4, §4.5
// Extended by issue #180: docs/design/lld-onboarding-auth-webhooks.md

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { logger } from '@/lib/logger';

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

export interface InstallationSuspendedPayload {
  action: 'suspend' | 'unsuspend';
  installation: { id: number };
}

export interface InstallationRepositoriesPayload {
  action: 'added' | 'removed';
  installation: { id: number };
  repositories_added: GithubRepo[];
  repositories_removed: GithubRepo[];
}

type Db = SupabaseClient<Database>;
type Handler = (payload: unknown, db: Db) => Promise<void>;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

// Justification: toRepoJson replaces buildRepoRows after the #118 transactional RPC refactor.
// The RPC functions accept JSONB arrays directly, so we only need id + full_name projection.
function toRepoJson(repos: GithubRepo[]) {
  return repos.map(r => ({ id: r.id, full_name: r.full_name }));
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, Handler> = {
  'installation:created':    (p, db) => handleInstallationCreated(p as InstallationCreatedPayload, db),
  'installation:deleted':    (p, db) => handleInstallationDeleted(p as InstallationDeletedPayload, db),
  'installation:suspend':    (p, db) => handleInstallationSuspended(p as InstallationSuspendedPayload, db),
  'installation:unsuspend':  (p, db) => handleInstallationSuspended(p as InstallationSuspendedPayload, db),
  'installation_repositories:added':   (p, db) => handleRepositoriesAdded(p as InstallationRepositoriesPayload, db),
  'installation_repositories:removed': (p, db) => handleRepositoriesRemoved(p as InstallationRepositoriesPayload, db),
};

export async function handleWebhookEvent(
  event: string,
  payload: Record<string, unknown>,
  supabase: Db,
): Promise<void> {
  const action = typeof payload.action === 'string' ? payload.action : '';
  const handler = HANDLERS[`${event}:${action}`];
  if (handler) await handler(payload, supabase);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

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
    logger.error({ err: error }, 'handleInstallationCreated: rpc failed');
    throw error;
  }
}

export async function handleInstallationDeleted(
  payload: InstallationDeletedPayload,
  supabase: Db,
): Promise<void> {
  const { error } = await supabase.rpc('handle_installation_deleted', {
    p_installation_id: payload.installation.id,
  });
  if (error) {
    logger.error({ err: error }, 'handleInstallationDeleted: rpc failed');
    throw error;
  }
}

export async function handleInstallationSuspended(
  payload: InstallationSuspendedPayload,
  supabase: Db,
): Promise<void> {
  const status = payload.action === 'suspend' ? 'inactive' : 'active';
  const { error } = await supabase
    .from('organisations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('installation_id', payload.installation.id);
  if (error) {
    logger.error({ err: error, action: payload.action }, 'handleInstallationSuspended: org update failed');
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
    logger.error({ err: error }, 'handleRepositoriesAdded: rpc failed');
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
    logger.error({ err: error }, 'handleRepositoriesRemoved: repos update failed');
    throw error;
  }
}
