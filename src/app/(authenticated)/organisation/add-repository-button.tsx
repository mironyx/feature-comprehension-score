// Placeholder — replaced by issue #366 (T2) with a functional client component.
// Renders a non-functional "Add" label so T1 (#365) can ship the Repositories tab UI.
// Design reference: docs/design/lld-v8-repository-management.md §T2

interface AddRepositoryButtonProps {
  readonly orgId: string;
  readonly githubRepoId: number;
  readonly githubRepoName: string;
}

const ADD_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-sm text-label font-medium ' +
  'bg-accent text-background h-7 px-2.5 opacity-50 cursor-not-allowed';

export function AddRepositoryButton(_props: AddRepositoryButtonProps) {
  return (
    <button type="button" disabled className={ADD_BUTTON_CLASSES}>
      Add
    </button>
  );
}
