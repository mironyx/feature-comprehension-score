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
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-heading-xl font-display">{title}</h1>
        {subtitle ? (
          <p className="text-body text-text-secondary mt-1">{subtitle}</p>
        ) : null}
      </div>
      {action ?? null}
    </div>
  );
}
