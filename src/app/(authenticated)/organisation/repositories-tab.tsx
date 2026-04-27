// Repositories tab — registered repos table + accessible-but-unregistered list.
// Server component. Data is fetched by the parent page (organisation/page.tsx).
// Design reference: docs/design/lld-v8-repository-management.md §T1
// Issue: #365

import type {
  RegisteredRepo,
  AccessibleRepo,
} from '@/app/api/organisations/[id]/repositories/service';
import { AddRepositoryButton } from './add-repository-button';

interface RepositoriesTabProps {
  readonly orgId: string;
  readonly registered: ReadonlyArray<RegisteredRepo>;
  readonly accessible: ReadonlyArray<AccessibleRepo>;
}

const TD = 'px-3 py-2 text-text-secondary';

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function renderRegisteredRow(r: RegisteredRepo) {
  return (
    <tr key={r.id} className="border-t border-border hover:bg-surface-hover">
      <td className="px-3 py-2 text-text-primary">{r.github_repo_name}</td>
      <td className={TD}>{formatDate(r.created_at)}</td>
    </tr>
  );
}

function renderAccessibleRow(orgId: string, r: AccessibleRepo) {
  return (
    <li
      key={r.github_repo_id}
      className="flex items-center justify-between px-3 py-2"
    >
      <span className="text-text-primary text-label">{r.github_repo_name}</span>
      <AddRepositoryButton
        orgId={orgId}
        githubRepoId={r.github_repo_id}
        githubRepoName={r.github_repo_name}
      />
    </li>
  );
}

export function RepositoriesTab({ orgId, registered, accessible }: RepositoriesTabProps) {
  const unregistered = accessible.filter((r) => !r.is_registered);
  return (
    <div className="space-y-section-gap">
      <section className="space-y-2">
        <h2 className="text-h3 text-text-primary">Registered repositories</h2>
        {registered.length === 0 ? (
          <div className="bg-surface border border-border rounded-md p-card-pad text-text-secondary">
            <p className="text-body font-medium text-text-primary">No repositories registered yet</p>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-md overflow-hidden">
            <table className="w-full text-label">
              <thead className="text-text-secondary text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Repository</th>
                  <th className="px-3 py-2 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody>{registered.map(renderRegisteredRow)}</tbody>
            </table>
          </div>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-h3 text-text-primary">Accessible repositories</h2>
        {unregistered.length === 0 ? (
          <div className="bg-surface border border-border rounded-md p-card-pad text-text-secondary">
            <p className="text-body font-medium text-text-primary">No additional accessible repositories</p>
          </div>
        ) : (
          <ul className="bg-surface border border-border rounded-md divide-y divide-border">
            {unregistered.map((r) => renderAccessibleRow(orgId, r))}
          </ul>
        )}
      </section>
    </div>
  );
}
