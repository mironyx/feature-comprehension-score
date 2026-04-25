// PageHeader — title + optional subtitle + optional right-side action slot.
// Design reference: docs/design/frontend-system.md § PageHeader
// Issue: #166

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-heading-xl font-display break-words">{title}</h1>
        {subtitle ? (
          <p className="text-body text-text-secondary mt-1">{subtitle}</p>
        ) : null}
      </div>
      {action ?? null}
    </div>
  );
}
