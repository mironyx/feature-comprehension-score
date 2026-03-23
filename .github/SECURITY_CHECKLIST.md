# GitHub Actions Security Checklist

## Supply Chain Attack Prevention

### ✅ Current Status
- [x] Trivy action is commented out (not vulnerable to March 2026 compromise)
- [ ] Actions pinned to commit SHAs instead of tags
- [ ] Secret rotation plan documented

### 🔒 Action Pinning Strategy

**Why**: Tags can be force-pushed by attackers (as seen in Trivy compromise). Commit SHAs are immutable.

**Current Actions to Pin**:
- `actions/checkout@v4` → Pin to specific SHA
- `actions/setup-node@v4` → Pin to specific SHA

**When Enabling Commented Actions**:
- `aquasecurity/trivy-action@0.28.0` → Upgrade to v0.35.0+ and pin to SHA
- `hadolint/hadolint-action@v3.1.0` → Pin to SHA
- `SonarSource/sonarcloud-github-action@v3` → Pin to SHA

### 🔑 Secrets Exposed in Workflows

**Currently Commented (Safe)**:
- `SUPABASE_SECRET_KEY` - Used in integration tests
- `SUPABASE_PUBLISHABLE_KEY` - Used in integration tests
- `SONAR_TOKEN` - Used in SonarCloud analysis

**Action Required Before Enabling**:
1. Document secret rotation procedure
2. Set up monitoring for workflow runs
3. Review logs after any security incident

### 📋 Incident Response Plan

**If a GitHub Action is compromised**:
1. Check workflow run logs for the compromise window
2. Identify which secrets were exposed
3. Rotate all exposed secrets immediately
4. Update action to safe version with SHA pinning
5. Document incident in this file

### 🔄 Maintenance

- Review and update pinned SHAs quarterly
- Monitor security advisories for used actions
- Test workflow after SHA updates

## References
- [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- Trivy Compromise (March 2026): Demonstrates tag force-push attack vector
