// Shared membership types and helpers used by pages that check org admin status.
// Issue: #121

export interface MembershipRow {
  github_role: string;
}

export function isOrgAdmin(rows: MembershipRow[]): boolean {
  return rows.length > 0 && rows[0]?.github_role === 'admin';
}
