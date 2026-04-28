// TruncationDetailsCard — renders truncation details when token_budget_applied is true.
// Design reference: docs/design/lld-v5-e1-token-budget.md §Story 1.3
// Issue: #330

export interface TruncationDetailsCardProps {
  readonly token_budget_applied: boolean | null;
  readonly truncation_notes: readonly string[] | null;
  readonly rubric_tool_call_count: number | null;
}

export default function TruncationDetailsCard(
  props: TruncationDetailsCardProps,
): React.ReactElement | null {
  if (!props.token_budget_applied) return null;

  const notes = props.truncation_notes ?? [];
  const retrievalEnabled = (props.rubric_tool_call_count ?? 0) > 0;

  return (
    <section className="bg-surface border border-border rounded-md shadow-sm p-card-pad">
      <h3 className="text-heading-md font-display">Truncation details</h3>
      <ul className="list-disc pl-5 mt-2 space-y-1">
        {notes.map((note, i) => (
          <li key={i} className="text-body text-text-secondary">{note}</li>
        ))}
      </ul>
      {!retrievalEnabled && (
        <p className="text-body text-text-secondary mt-3">
          Some artefacts were truncated to fit the model&apos;s context window.
          Enable retrieval in organisation settings to let the LLM fetch
          additional content on demand.
        </p>
      )}
    </section>
  );
}
