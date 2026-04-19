// RetrievalDetailsCard — collapsible "Retrieval details" section for the FCS results page.
// Renders the tool-call log, a "Missing artefacts" summary when `not_found` outcomes exist,
// and a header with totals (calls, bytes, extra tokens approx, duration).
// Design reference: docs/design/lld-v2-e17-agentic-retrieval.md §17.2b
// Issue: #247

import type { ToolCallLogEntry, ToolCallOutcome } from '@/lib/engine/llm/tools';

export interface RetrievalDetailsCardProps {
  readonly rubric_tool_call_count: number | null;
  readonly rubric_tool_calls: readonly ToolCallLogEntry[] | null;
  readonly rubric_input_tokens: number | null;
  readonly rubric_output_tokens: number | null;
  readonly rubric_duration_ms: number | null;
}

const WARNING_OUTCOMES: ReadonlySet<ToolCallOutcome> = new Set<ToolCallOutcome>([
  'forbidden_path',
  'budget_exhausted',
  'iteration_limit_reached',
]);

function sumBytes(calls: readonly ToolCallLogEntry[]): number {
  return calls.reduce((acc, c) => acc + c.bytes_returned, 0);
}

function EntryRow({ call }: { readonly call: ToolCallLogEntry }) {
  const isWarning = WARNING_OUTCOMES.has(call.outcome);
  const className = isWarning
    ? 'text-body text-destructive'
    : 'text-body text-text-primary';
  return (
    <li className={className}>
      <code>{call.tool_name}</code>{' '}
      <code>{call.argument_path}</code>
      {' → '}
      <span>{call.outcome}</span>
    </li>
  );
}

function MissingArtefactsSummary({ paths }: { readonly paths: readonly string[] }) {
  return (
    <p className="text-body text-text-secondary">
      <strong>Missing artefacts</strong>
      {`: ${paths.length} not found — `}
      {paths.map((p, i) => (
        <span key={`${i}-${p}`}>
          {i > 0 && ', '}
          <code>{p}</code>
        </span>
      ))}
    </p>
  );
}

export default function RetrievalDetailsCard(
  props: RetrievalDetailsCardProps,
): React.ReactElement | null {
  if (props.rubric_tool_call_count === null || props.rubric_tool_call_count === 0) return null;

  const calls = props.rubric_tool_calls ?? [];
  const totalBytes = sumBytes(calls);
  const notFoundPaths = calls.filter(c => c.outcome === 'not_found').map(c => c.argument_path);
  const duration = props.rubric_duration_ms ?? 0;
  const inputTokens = props.rubric_input_tokens ?? 0;

  return (
    <section className="bg-surface border border-border rounded-md shadow-sm p-card-pad">
      <details>
        <summary className="text-heading-md font-display cursor-pointer">Retrieval details</summary>
        {notFoundPaths.length > 0 && <MissingArtefactsSummary paths={notFoundPaths} />}
        <p className="text-caption text-text-secondary">
          {props.rubric_tool_call_count} calls · {totalBytes} bytes · ~{inputTokens} input tokens · {duration} ms
        </p>
        <ul>
          {calls.map((call, i) => (
            <EntryRow key={`${call.tool_name}-${call.argument_path}-${i}`} call={call} />
          ))}
        </ul>
      </details>
    </section>
  );
}
