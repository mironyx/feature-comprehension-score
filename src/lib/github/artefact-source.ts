import type { Octokit } from '@octokit/rest';
import type { ArtefactSource, PRExtractionParams } from '../engine/ports/artefact-source';
import type {
  ArtefactFile,
  FileListingEntry,
  LinkedIssue,
  RawArtefactSet,
} from '../engine/prompts/artefact-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TEST_PATTERNS = [
  /^tests?\//,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
];

const MAX_FILES_FOR_CONTENT = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitHubFileEntry {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

interface SinglePRResult {
  artefactSet: RawArtefactSet;
  headSha: string;
}

// ---------------------------------------------------------------------------
// GitHubArtefactSource
// ---------------------------------------------------------------------------

export class GitHubArtefactSource implements ArtefactSource {
  constructor(private readonly octokit: Octokit) {}

  async extractFromPRs(params: PRExtractionParams): Promise<RawArtefactSet> {
    const perPR = await Promise.all(
      params.prNumbers.map(prNumber =>
        this.extractSinglePR(params.owner, params.repo, prNumber),
      ),
    );

    const artefactType = params.prNumbers.length === 1 ? 'pull_request' : 'feature';
    const merged = mergeRawArtefacts(
      perPR.map(r => r.artefactSet),
      artefactType,
    );

    if (params.contextFilePatterns && params.contextFilePatterns.length > 0) {
      const headSha = perPR[0]!.headSha;
      const contextFiles = await this.fetchContextFiles(
        params.owner,
        params.repo,
        headSha,
        params.contextFilePatterns,
      );
      if (contextFiles.length > 0) {
        return { ...merged, context_files: contextFiles };
      }
    }

    return merged;
  }

  // ---------------------------------------------------------------------------
  // Single PR extraction
  // ---------------------------------------------------------------------------

  private async extractSinglePR(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<SinglePRResult> {
    const [diff, pr, changedFiles] = await Promise.all([
      this.fetchDiff(owner, repo, prNumber),
      this.fetchPR(owner, repo, prNumber),
      this.fetchChangedFiles(owner, repo, prNumber),
    ]);

    const fileListing: FileListingEntry[] = changedFiles.map(f => ({
      path: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      status: f.status,
    }));

    const topFiles = selectTopFiles(changedFiles, MAX_FILES_FOR_CONTENT);

    // Fetch linked issues and file contents concurrently — both depend only on `pr`
    const [linkedIssues, fileContents] = await Promise.all([
      this.fetchLinkedIssues(owner, repo, pr.body ?? ''),
      this.fetchFileContents(owner, repo, pr.head.sha, topFiles),
    ]);

    const testFiles = filterTestFiles(fileContents);
    const sourceFiles = filterSourceFiles(fileContents);

    return {
      headSha: pr.head.sha,
      artefactSet: {
        artefact_type: 'pull_request',
        pr_description: pr.body ?? undefined,
        pr_diff: diff,
        file_listing: fileListing,
        file_contents: sourceFiles,
        test_files: testFiles.length > 0 ? testFiles : undefined,
        linked_issues: linkedIssues.length > 0 ? linkedIssues : undefined,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GitHub API calls
  // ---------------------------------------------------------------------------

  private async fetchDiff(owner: string, repo: string, prNumber: number): Promise<string> {
    const response = await this.octokit.request(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}',
      {
        owner,
        repo,
        pull_number: prNumber,
        headers: { accept: 'application/vnd.github.diff' },
      },
    );
    return response.data as unknown as string;
  }

  private async fetchPR(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<{ body: string | null; head: { sha: string }; merged_at?: string | null }> {
    const response = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });
    return {
      body: response.data.body,
      head: { sha: response.data.head.sha },
      merged_at: response.data.merged_at,
    };
  }

  private async fetchChangedFiles(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GitHubFileEntry[]> {
    const response = await this.octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });
    return response.data.map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    }));
  }

  private async fetchLinkedIssues(
    owner: string,
    repo: string,
    body: string,
  ): Promise<LinkedIssue[]> {
    const issueNumbers = parseLinkedIssueNumbers(body);
    if (issueNumbers.length === 0) return [];

    const issues = await Promise.all(
      issueNumbers.map(async issueNumber => {
        try {
          const response = await this.octokit.rest.issues.get({
            owner,
            repo,
            issue_number: issueNumber,
          });
          return { title: response.data.title, body: response.data.body ?? '' };
        } catch {
          return null;
        }
      }),
    );

    return issues.filter((i): i is LinkedIssue => i !== null);
  }

  private async fetchFileContents(
    owner: string,
    repo: string,
    ref: string,
    files: GitHubFileEntry[],
  ): Promise<ArtefactFile[]> {
    const results = await Promise.all(
      files.map(async file => {
        try {
          const content = await this.fetchSingleFile(owner, repo, file.filename, ref);
          return content !== null ? { path: file.filename, content } : null;
        } catch {
          return null;
        }
      }),
    );

    return results.filter((f): f is ArtefactFile => f !== null);
  }

  private async fetchContextFiles(
    owner: string,
    repo: string,
    treeSha: string,
    patterns: string[],
  ): Promise<ArtefactFile[]> {
    const treeResponse = await this.octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: '1',
    });

    // Compile each glob pattern once to avoid O(P×F) regex recompilation
    const matchers = patterns.map(compileGlobPattern);
    const matchingPaths = treeResponse.data.tree
      .filter(entry => entry.type === 'blob' && entry.path)
      .map(entry => entry.path as string)
      .filter(path => matchers.some(matches => matches(path)));

    if (matchingPaths.length === 0) return [];

    const files = await Promise.all(
      matchingPaths.map(async filePath => {
        try {
          const content = await this.fetchSingleFile(owner, repo, filePath, treeSha);
          return content !== null ? { path: filePath, content } : null;
        } catch {
          return null;
        }
      }),
    );

    return files.filter((f): f is ArtefactFile => f !== null);
  }

  /**
   * Fetches the content of a single file from the GitHub API.
   * Encodes each path segment individually to preserve forward slashes as URL
   * separators — Octokit's {path} parameter would encode slashes to %2F, which
   * breaks routing both in tests (MSW) and in the real GitHub API.
   */
  private async fetchSingleFile(
    owner: string,
    repo: string,
    filePath: string,
    ref: string,
  ): Promise<string | null> {
    const encodedPath = filePath
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');

    const response = await this.octokit.request(
      `GET /repos/{owner}/{repo}/contents/${encodedPath}`,
      { owner, repo, ref },
    );

    const data = response.data as Record<string, unknown>;
    if (typeof data.content === 'string') {
      return Buffer.from((data.content as string).replace(/\n/g, ''), 'base64').toString('utf-8');
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function selectTopFiles(
  files: GitHubFileEntry[],
  maxFiles: number,
): GitHubFileEntry[] {
  return [...files]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, maxFiles);
}

function filterTestFiles(files: ArtefactFile[]): ArtefactFile[] {
  return files.filter(f => DEFAULT_TEST_PATTERNS.some(p => p.test(f.path)));
}

function filterSourceFiles(files: ArtefactFile[]): ArtefactFile[] {
  return files.filter(f => !DEFAULT_TEST_PATTERNS.some(p => p.test(f.path)));
}

function parseLinkedIssueNumbers(body: string): number[] {
  const pattern = /(?:closes|fixes|fix|resolve|resolves)\s+#(\d+)/gi;
  const seen = new Set<number>();
  const numbers: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    const n = parseInt(match[1]!, 10);
    if (!seen.has(n)) {
      seen.add(n);
      numbers.push(n);
    }
  }

  return numbers;
}

/** Compiles a glob pattern to a reusable matcher function. */
function compileGlobPattern(pattern: string): (path: string) => boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\x00/g, '.*');
  const regex = new RegExp(`^${regexStr}$`);
  return (path: string) => regex.test(path);
}

// ---------------------------------------------------------------------------
// Multi-PR merge
// ---------------------------------------------------------------------------

export function mergeRawArtefacts(
  artefacts: RawArtefactSet[],
  artefactType: 'pull_request' | 'feature',
): RawArtefactSet {
  if (artefacts.length === 1) {
    return { ...artefacts[0]!, artefact_type: artefactType };
  }

  // Concatenate diffs with PR header separators
  const pr_diff = artefacts
    .map((a, i) => `## PR #${i + 1}\n${a.pr_diff}`)
    .join('\n\n');

  // Concatenate descriptions
  const descriptions = artefacts
    .map((a, i) => (a.pr_description ? `## PR #${i + 1}\n${a.pr_description}` : null))
    .filter((d): d is string => d !== null);
  const pr_description = descriptions.length > 0 ? descriptions.join('\n\n') : undefined;

  // Merge file listings — deduplicate by path, aggregate additions/deletions
  const fileMap = new Map<string, FileListingEntry>();
  for (const a of artefacts) {
    for (const f of a.file_listing) {
      const existing = fileMap.get(f.path);
      if (existing) {
        fileMap.set(f.path, {
          ...existing,
          additions: existing.additions + f.additions,
          deletions: existing.deletions + f.deletions,
        });
      } else {
        fileMap.set(f.path, { ...f });
      }
    }
  }
  const file_listing = Array.from(fileMap.values());

  // Merge file contents — deduplicate by path (last PR wins)
  const contentMap = new Map<string, ArtefactFile>();
  for (const a of artefacts) {
    for (const f of a.file_contents) contentMap.set(f.path, f);
  }
  const file_contents = Array.from(contentMap.values());

  // Merge test files — deduplicate by path (last wins)
  const testMap = new Map<string, ArtefactFile>();
  for (const a of artefacts) {
    for (const f of a.test_files ?? []) testMap.set(f.path, f);
  }
  const test_files = testMap.size > 0 ? Array.from(testMap.values()) : undefined;

  // Merge linked issues — deduplicate by title
  const issueMap = new Map<string, LinkedIssue>();
  for (const a of artefacts) {
    for (const issue of a.linked_issues ?? []) issueMap.set(issue.title, issue);
  }
  const linked_issues = issueMap.size > 0 ? Array.from(issueMap.values()) : undefined;

  return {
    artefact_type: artefactType,
    pr_description,
    pr_diff,
    file_listing,
    file_contents,
    test_files,
    linked_issues,
  };
}
