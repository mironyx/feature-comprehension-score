import type { Octokit } from '@octokit/rest';
import { logger } from '@/lib/logger';
import type {
  ArtefactSource,
  EpicDiscoveryResult,
  IssueQueryParams,
  PRExtractionParams,
  RepoCoords,
} from '../engine/ports/artefact-source';
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

// GraphQL query for Story 19.2 — fetches cross-reference events on an issue
// to discover PRs that close or reference it. Limited to the first 100 events
// per issue (GitHub's per-page max).
const CROSS_REF_QUERY = `
  query($owner: String!, $repo: String!, $issueNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $issueNumber) {
        timelineItems(first: 100, itemTypes: [CROSS_REFERENCED_EVENT]) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  number
                  merged
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Epic 2 / Issue #322 — Query 1 fragment: body + subIssues + each sub-issue's
// cross-referenced PRs. Reused per alias by buildEpicDiscoveryQuery.
const EPIC_DISCOVERY_FRAGMENT = `
  body
  subIssues(first: 50) {
    nodes {
      number
      timelineItems(first: 100, itemTypes: [CROSS_REFERENCED_EVENT]) {
        nodes {
          ... on CrossReferencedEvent {
            source {
              ... on PullRequest {
                number
                merged
              }
            }
          }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitHubFileEntry {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

/** GraphQL response shape for {@link CROSS_REF_QUERY}. */
interface CrossRefQueryResponse {
  repository: {
    issue: {
      timelineItems: {
        nodes: Array<{ source?: { number?: number; merged?: boolean } }>;
      };
    } | null;
  };
}

// Response shape for the batched epic discovery query (Query 1). Keys are
// dynamic aliases of the form `issue<N>` — so the repository record maps
// each alias to the per-issue body + sub-issues payload.
type CrossRefNode = { source?: { number?: number; merged?: boolean } };

interface EpicDiscoveryIssueData {
  body: string | null;
  subIssues: {
    nodes: Array<{
      number: number;
      timelineItems: { nodes: CrossRefNode[] };
    }>;
  };
}

interface EpicDiscoveryQueryResponse {
  repository: Record<string, EpicDiscoveryIssueData | null>;
}

// Response shape for the batched cross-ref query (Query 2).
interface BatchCrossRefResponse {
  repository: Record<string, { timelineItems: { nodes: CrossRefNode[] } } | null>;
}

// Internal result from queryEpicDiscovery — a per-issue payload whose shape
// matches what discoverChildIssues needs to consume.
interface EpicDiscoveryPerIssue {
  body: string | null;
  subIssues: Array<{ number: number; mergedPrs: number[] }>;
}

/** A compiled glob pattern matcher — avoids passing raw string[] as a domain concept. */
type GlobMatcher = (path: string) => boolean;

// ---------------------------------------------------------------------------
// GitHubArtefactSource
// ---------------------------------------------------------------------------

export class GitHubArtefactSource implements ArtefactSource {
  constructor(private readonly octokit: Octokit) {}

  async extractFromPRs(params: PRExtractionParams): Promise<RawArtefactSet> {
    const coords: RepoCoords = { owner: params.owner, repo: params.repo };
    const contextPatterns = params.contextFilePatterns ?? [];
    const contextMatchers: GlobMatcher[] = contextPatterns.map(compileGlobPattern);

    const perPR = await Promise.all(
      params.prNumbers.map(prNumber =>
        this.extractSinglePR(coords, prNumber, contextMatchers),
      ),
    );

    const artefactType = params.prNumbers.length === 1 ? 'pull_request' : 'feature';
    const merged = mergeRawArtefacts(perPR, artefactType);
    // merged.context_files: context-pattern files changed in one or more PRs (last PR version wins per path)

    if (contextPatterns.length > 0) {
      const defaultBranch = params.defaultBranch ?? 'main';
      const baselineFiles = await this.fetchContextFiles(coords, defaultBranch, contextPatterns);

      // Baseline first, then PR-specific overrides win by path
      const contextMap = new Map<string, ArtefactFile>();
      for (const f of baselineFiles) contextMap.set(f.path, f);
      for (const f of merged.context_files ?? []) contextMap.set(f.path, f);

      const contextFiles = Array.from(contextMap.values());
      return { ...merged, context_files: contextFiles.length > 0 ? contextFiles : undefined };
    }

    return merged;
  }

  // ---------------------------------------------------------------------------
  // Issue content (Story 19.1) — fetches body + comments for one or more issues.
  // Returns one LinkedIssue per issue with comments appended to the body.
  // Missing or inaccessible issues surface as null and are filtered out.
  // ---------------------------------------------------------------------------

  async fetchIssueContent(params: IssueQueryParams): Promise<LinkedIssue[]> {
    const coords: RepoCoords = { owner: params.owner, repo: params.repo };
    const issues = await Promise.all(
      params.issueNumbers.map(n => this.fetchSingleIssue(coords, n)),
    );
    return issues.filter((i): i is LinkedIssue => i !== null);
  }

  // ---------------------------------------------------------------------------
  // Linked PR discovery (Story 19.2) — finds merged PRs that close or reference
  // the given issues via CROSS_REFERENCED_EVENT timeline items. One GraphQL query
  // per issue, concurrent via Promise.all. Only merged PRs are included; open and
  // closed-unmerged PRs are filtered out. Returns deduplicated PR numbers.
  // ---------------------------------------------------------------------------

  async discoverLinkedPRs(params: IssueQueryParams): Promise<number[]> {
    const perIssue = await Promise.all(
      params.issueNumbers.map(n => this.queryCrossRefMergedPRs(params.owner, params.repo, n)),
    );
    return Array.from(new Set(perIssue.flat()));
  }

  // ---------------------------------------------------------------------------
  // Epic-aware child issue discovery (Epic 2 — Stories 2.1 + 2.2).
  // Returns both child issue numbers and their merged PRs, resolved via:
  //   Query 1: batched GraphQL — body + subIssues + each sub-issue's PRs (nested)
  //   Query 2 (conditional): batched GraphQL for task-list-only children's PRs
  // ---------------------------------------------------------------------------

  async discoverChildIssues(params: IssueQueryParams): Promise<EpicDiscoveryResult> {
    const q1Results = await this.queryEpicDiscovery(params.owner, params.repo, params.issueNumbers);
    const { childNumbers, childPrs, taskListOnly, mechanism } =
      collectDiscoveryResults(params.issueNumbers, q1Results);
    const uniqueTaskListOnly = Array.from(new Set(taskListOnly));
    const taskListPrs = uniqueTaskListOnly.length > 0
      ? await this.batchDiscoverLinkedPRs(params.owner, params.repo, uniqueTaskListOnly)
      : [];
    const childIssueNumbers = Array.from(new Set(childNumbers));
    const childIssuePrs = Array.from(new Set([...childPrs, ...taskListPrs]));
    if (childIssueNumbers.length > 0) {
      logger.info({
        childIssueCount: childIssueNumbers.length,
        childIssueNumbers,
        discoveryMechanism: mechanism,
        childIssuePrCount: childIssuePrs.length,
      }, 'discoverChildIssues: children found');
    }
    return { childIssueNumbers, childIssuePrs };
  }

  // Query 1 — batched epic discovery via dynamic aliases. One request per call.
  // On GraphQL failure, logs a warn and returns an empty map — discoverChildIssues
  // degenerates to the task-list-only path (or empty if body is null).
  private async queryEpicDiscovery(
    owner: string, repo: string, issueNumbers: number[],
  ): Promise<Map<number, EpicDiscoveryPerIssue>> {
    const results = new Map<number, EpicDiscoveryPerIssue>();
    if (issueNumbers.length === 0) return results;
    try {
      const query = buildEpicDiscoveryQuery(issueNumbers);
      const result = await this.octokit.graphql<EpicDiscoveryQueryResponse>(query, { owner, repo });
      for (const issueNumber of issueNumbers) {
        const issue = result.repository[`issue${issueNumber}`];
        if (!issue) continue;
        results.set(issueNumber, {
          body: issue.body,
          subIssues: issue.subIssues.nodes.map(node => ({
            number: node.number,
            mergedPrs: extractMergedPrNumbers(node.timelineItems.nodes),
          })),
        });
      }
    } catch (err) {
      // Epic 2 LLD invariant: on GraphQL failure, return an empty result so
      // the caller degenerates to "no children found" rather than propagating
      // the error to the rubric pipeline. Task list parsing also cannot run
      // because the body field is only available inside the Query 1 response.
      logger.warn({ err, issueNumbers }, 'queryEpicDiscovery: GraphQL failed — falling back to empty');
    }
    return results;
  }

  // Query 2 — batched cross-ref lookup for task-list-only children. One request per call.
  // On GraphQL failure, logs a warn and returns [] so sub-issue PRs still flow through.
  private async batchDiscoverLinkedPRs(
    owner: string, repo: string, issueNumbers: number[],
  ): Promise<number[]> {
    if (issueNumbers.length === 0) return [];
    try {
      const query = buildBatchCrossRefQuery(issueNumbers);
      const result = await this.octokit.graphql<BatchCrossRefResponse>(query, { owner, repo });
      const prs: number[] = [];
      for (const issueNum of issueNumbers) {
        const issueData = result.repository[`issue${issueNum}`];
        if (issueData) prs.push(...extractMergedPrNumbers(issueData.timelineItems.nodes));
      }
      return Array.from(new Set(prs));
    } catch (err) {
      // Epic 2 LLD invariant: on Query 2 failure, return [] so sub-issue PRs
      // (already resolved by Query 1) still flow through. The missing task-list
      // PRs are a graceful degradation, not a hard error.
      logger.warn({ err, issueNumbers }, 'batchDiscoverLinkedPRs: GraphQL failed');
      return [];
    }
  }

  // Justification: extracted from discoverLinkedPRs to keep the public method short
  // and Promise.all-driven. Filters the timeline nodes to merged PRs only; open/closed
  // -unmerged PRs are dropped with an info-level log (Story 19.2 AC).
  private async queryCrossRefMergedPRs(owner: string, repo: string, issueNumber: number): Promise<number[]> {
    const result = await this.octokit.graphql<CrossRefQueryResponse>(CROSS_REF_QUERY, { owner, repo, issueNumber });
    const nodes = result.repository.issue?.timelineItems.nodes ?? [];
    const merged: number[] = [];
    for (const node of nodes) {
      const source = node.source;
      if (source === undefined || typeof source.number !== 'number') continue;
      if (source.merged === true) {
        merged.push(source.number);
      } else {
        logger.info({ issueNumber, prNumber: source.number }, 'discoverLinkedPRs: skipping non-merged cross-reference');
      }
    }
    return merged;
  }

  // Justification: private helper extracted from fetchIssueContent so that the public method
  // stays short and Promise.all-driven. Missing / inaccessible issues are logged and returned
  // as null; the caller filters them out.
  private async fetchSingleIssue(coords: RepoCoords, issueNumber: number): Promise<LinkedIssue | null> {
    try {
      const [issueResp, commentsResp] = await Promise.all([
        this.octokit.rest.issues.get({ owner: coords.owner, repo: coords.repo, issue_number: issueNumber }),
        this.octokit.rest.issues.listComments({ owner: coords.owner, repo: coords.repo, issue_number: issueNumber, per_page: 100 }),
      ]);
      const body = issueResp.data.body ?? '';
      const comments = commentsResp.data
        .map(c => c.body ?? '')
        .filter(text => text.length > 0);
      const combined = comments.length > 0 ? `${body}\n\n## Comments\n\n${comments.join('\n\n---\n\n')}` : body;
      return { title: issueResp.data.title, body: combined, number: issueNumber };
    } catch (err) {
      logger.error({ err, issueNumber }, 'fetchIssueContent: failed to fetch issue');
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Single PR extraction
  // ---------------------------------------------------------------------------

  private async extractSinglePR(
    coords: RepoCoords,
    prNumber: number,
    contextMatchers: GlobMatcher[],
  ): Promise<RawArtefactSet> {
    const [diff, pr, changedFiles] = await Promise.all([
      this.fetchDiff(coords, prNumber),
      this.fetchPR(coords, prNumber),
      this.fetchChangedFiles(coords, prNumber),
    ]);

    const fileListing: FileListingEntry[] = changedFiles.map(f => ({
      path: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      status: f.status,
    }));

    const topFiles = selectTopFiles(changedFiles, MAX_FILES_FOR_CONTENT);
    const contextMatches = filterByGlobs(changedFiles, contextMatchers);

    // Fetch linked issues, file contents, and PR-specific context overrides concurrently
    const [linkedIssues, fileContents, prContextFiles] = await Promise.all([
      this.fetchLinkedIssues(coords, pr.body ?? ''),
      this.fetchFileContents(coords, pr.head.sha, topFiles),
      contextMatches.length > 0
        ? this.fetchFileContents(coords, pr.head.sha, contextMatches)
        : Promise.resolve([] as ArtefactFile[]),
    ]);

    const testFiles = filterTestFiles(fileContents);
    const sourceFiles = filterSourceFiles(fileContents);

    return {
      artefact_type: 'pull_request',
      pr_description: pr.body ?? undefined,
      pr_diff: diff,
      file_listing: fileListing,
      file_contents: sourceFiles,
      test_files: testFiles.length > 0 ? testFiles : undefined,
      linked_issues: linkedIssues.length > 0 ? linkedIssues : undefined,
      context_files: prContextFiles.length > 0 ? prContextFiles : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // GitHub API calls
  // ---------------------------------------------------------------------------

  private async fetchDiff(coords: RepoCoords, prNumber: number): Promise<string> {
    const response = await this.octokit.request(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}',
      {
        owner: coords.owner,
        repo: coords.repo,
        pull_number: prNumber,
        headers: { accept: 'application/vnd.github.diff' },
      },
    );
    return response.data as unknown as string;
  }

  private async fetchPR(
    coords: RepoCoords,
    prNumber: number,
  ): Promise<{ body: string | null; head: { sha: string }; merged_at?: string | null }> {
    const response = await this.octokit.rest.pulls.get({
      owner: coords.owner,
      repo: coords.repo,
      pull_number: prNumber,
    });
    return {
      body: response.data.body,
      head: { sha: response.data.head.sha },
      merged_at: response.data.merged_at,
    };
  }

  private async fetchChangedFiles(
    coords: RepoCoords,
    prNumber: number,
  ): Promise<GitHubFileEntry[]> {
    const response = await this.octokit.rest.pulls.listFiles({
      owner: coords.owner,
      repo: coords.repo,
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
    coords: RepoCoords,
    body: string,
  ): Promise<LinkedIssue[]> {
    const issueNumbers = parseLinkedIssueNumbers(body);
    if (issueNumbers.length === 0) return [];

    const issues = await Promise.all(
      issueNumbers.map(async issueNumber => {
        try {
          const response = await this.octokit.rest.issues.get({
            owner: coords.owner,
            repo: coords.repo,
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
    coords: RepoCoords,
    ref: string,
    files: GitHubFileEntry[],
  ): Promise<ArtefactFile[]> {
    const results = await Promise.all(
      files.map(async file => {
        try {
          const content = await this.fetchSingleFile(coords, file.filename, ref);
          return content === null ? null : { path: file.filename, content };
        } catch (err) {
          logger.error({ err, filename: file.filename }, 'fetchFileContents: failed to fetch file');
          return null;
        }
      }),
    );

    return results.filter((f): f is ArtefactFile => f !== null);
  }

  private async fetchContextFiles(
    coords: RepoCoords,
    ref: string,
    patterns: string[],
  ): Promise<ArtefactFile[]> {
    const treeResponse = await this.octokit.rest.git.getTree({
      owner: coords.owner,
      repo: coords.repo,
      tree_sha: ref,
      recursive: '1',
    });

    // Compile each glob pattern once to avoid O(P×F) regex recompilation
    const matchers = patterns.map(compileGlobPattern);
    const matchingPaths = treeResponse.data.tree
      .filter((entry): entry is typeof entry & { path: string } =>
        entry.type === 'blob' && entry.path !== undefined,
      )
      .map(entry => entry.path)
      .filter(path => matchers.some(matches => matches(path)));

    if (matchingPaths.length === 0) return [];

    const files = await Promise.all(
      matchingPaths.map(async filePath => {
        try {
          const content = await this.fetchSingleFile(coords, filePath, ref);
          return content === null ? null : { path: filePath, content };
        } catch (err) {
          logger.error({ err, filePath }, 'fetchContextFiles: failed to fetch file');
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
    coords: RepoCoords,
    filePath: string,
    ref: string,
  ): Promise<string | null> {
    const encodedPath = filePath
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');

    const response = await this.octokit.request(
      `GET /repos/{owner}/{repo}/contents/${encodedPath}`,
      { owner: coords.owner, repo: coords.repo, ref },
    );

    const data = response.data as Record<string, unknown>;
    if (typeof data.content === 'string') {
      return Buffer.from(data.content.replaceAll('\n', ''), 'base64').toString('utf-8');
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

/** Returns files whose paths match any of the given compiled glob matchers. */
function filterByGlobs(files: GitHubFileEntry[], matchers: GlobMatcher[]): GitHubFileEntry[] {
  if (matchers.length === 0) return [];
  return files.filter(f => matchers.some(m => m(f.filename)));
}

function filterTestFiles(files: ArtefactFile[]): ArtefactFile[] {
  return files.filter(f => DEFAULT_TEST_PATTERNS.some(p => p.test(f.path)));
}

function filterSourceFiles(files: ArtefactFile[]): ArtefactFile[] {
  return files.filter(f => !DEFAULT_TEST_PATTERNS.some(p => p.test(f.path)));
}

type DiscoveryMechanism = 'sub_issues' | 'task_list' | 'both' | 'none';

// Walks the Query 1 results for each provided issue, returning the raw (not
// yet deduplicated) union of sub-issue + task-list child numbers, their
// Query-1-discovered PRs, the task-list-only subset that still needs a Query 2
// pass, and the aggregate mechanism that surfaced any children. Caller
// deduplicates and fires Query 2 as needed.
function collectDiscoveryResults(
  providedIssueNumbers: number[],
  q1Results: Map<number, EpicDiscoveryPerIssue>,
): { childNumbers: number[]; childPrs: number[]; taskListOnly: number[]; mechanism: DiscoveryMechanism } {
  const childNumbers: number[] = [];
  const childPrs: number[] = [];
  const taskListOnly: number[] = [];
  let sawSubIssue = false;
  let sawTaskList = false;
  for (const issueNumber of providedIssueNumbers) {
    const q1 = q1Results.get(issueNumber);
    if (!q1) continue;
    const subIssueNumbers = q1.subIssues.map(s => s.number);
    const taskListNumbers = q1.body !== null ? parseTaskListReferences(q1.body) : [];
    if (subIssueNumbers.length > 0) sawSubIssue = true;
    if (taskListNumbers.length > 0) sawTaskList = true;
    childNumbers.push(...subIssueNumbers, ...taskListNumbers);
    for (const sub of q1.subIssues) childPrs.push(...sub.mergedPrs);
    const subIssueSet = new Set(subIssueNumbers);
    taskListOnly.push(...taskListNumbers.filter(n => !subIssueSet.has(n)));
  }
  const mechanism: DiscoveryMechanism = sawSubIssue && sawTaskList
    ? 'both'
    : sawSubIssue ? 'sub_issues' : sawTaskList ? 'task_list' : 'none';
  return { childNumbers, childPrs, taskListOnly, mechanism };
}

// Extracts issue numbers from Markdown task list items ("- [x] #N" / "- [ ] #N")
// at the start of a line. Exported for unit testing. Prose references like
// "see #123" or "closes #456" are not matched — the regex requires the
// checkbox prefix anchored with ^ under the /m flag.
export function parseTaskListReferences(body: string): number[] {
  const pattern = /^- \[[x ]\] #(\d+)/gm;
  const numbers: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    numbers.push(Number.parseInt(match[1]!, 10));
  }
  return numbers;
}

// Extracts merged PR numbers from a list of cross-reference timeline nodes.
// Skips nodes with missing source or missing number; drops non-merged PRs.
// Shared between Query 1 (sub-issue nodes) and Query 2 (task-list children).
export function extractMergedPrNumbers(nodes: CrossRefNode[]): number[] {
  const prs: number[] = [];
  for (const node of nodes) {
    const source = node.source;
    if (source === undefined || typeof source.number !== 'number') continue;
    if (source.merged === true) prs.push(source.number);
  }
  return prs;
}

// Builds Query 1 — one batched GraphQL query fetching body + sub-issues
// + each sub-issue's cross-referenced PRs for every provided issue number.
// Dynamic aliases of the form `issueN: issue(number: N)` make the batched
// response addressable by issue number on the caller side.
export function buildEpicDiscoveryQuery(issueNumbers: number[]): string {
  const fragments = issueNumbers
    .map(n => `issue${n}: issue(number: ${n}) { ${EPIC_DISCOVERY_FRAGMENT} }`)
    .join('\n    ');
  return `query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      ${fragments}
    }
  }`;
}

// Builds Query 2 — one batched GraphQL query fetching cross-referenced PRs
// for task-list-only children that were not already found via sub-issues.
export function buildBatchCrossRefQuery(issueNumbers: number[]): string {
  const fragments = issueNumbers
    .map(n => `issue${n}: issue(number: ${n}) {
      timelineItems(first: 100, itemTypes: [CROSS_REFERENCED_EVENT]) {
        nodes {
          ... on CrossReferencedEvent {
            source {
              ... on PullRequest {
                number
                merged
              }
            }
          }
        }
      }
    }`)
    .join('\n    ');
  return `query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      ${fragments}
    }
  }`;
}

function parseLinkedIssueNumbers(body: string): number[] {
  const pattern = /(?:closes|fixes|fix|resolve|resolves)\s+#(\d+)/gi;
  const seen = new Set<number>();
  const numbers: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    const n = Number.parseInt(match[1]!, 10);
    if (!seen.has(n)) {
      seen.add(n);
      numbers.push(n);
    }
  }

  return numbers;
}

/** Compiles a glob pattern to a reusable matcher function. */
function compileGlobPattern(pattern: string): (path: string) => boolean {
  // Escape regex metacharacters, then convert glob wildcards in a single pass:
  // ** matches any path segment sequence (including slashes), * matches within one segment.
  const regexStr = pattern
    .replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`)
    .replaceAll(/\*+/g, (m) => m.length > 1 ? '.*' : '[^/]*');
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

  // Merge PR-specific context file overrides — deduplicate by path (last PR wins)
  const contextMap = new Map<string, ArtefactFile>();
  for (const a of artefacts) {
    for (const f of a.context_files ?? []) contextMap.set(f.path, f);
  }
  const context_files = contextMap.size > 0 ? Array.from(contextMap.values()) : undefined;

  return {
    artefact_type: artefactType,
    pr_description,
    pr_diff,
    file_listing,
    file_contents,
    test_files,
    linked_issues,
    context_files,
  };
}
