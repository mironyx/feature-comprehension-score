// Breadcrumbs — presentational trail of segments below the NavBar.
// Design reference: docs/design/lld-v7-frontend-ux.md § T1
// Issue: #340

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  segments: BreadcrumbSegment[];
}

function renderSegment(segment: BreadcrumbSegment): React.ReactElement {
  if (segment.href !== undefined) {
    return (
      <a href={segment.href} className="truncate hover:text-accent">
        {segment.label}
      </a>
    );
  }
  return <span className="truncate text-text-primary">{segment.label}</span>;
}

export function Breadcrumbs({ segments }: BreadcrumbsProps): React.ReactElement {
  return (
    <nav aria-label="Breadcrumb" className="text-caption text-text-secondary">
      <ol className="flex items-center gap-2">
        {segments.map((segment, idx) => (
          <li key={idx} className="flex min-w-0 items-center gap-2">
            {renderSegment(segment)}
            {idx < segments.length - 1 ? (
              <span aria-hidden="true" className="text-text-secondary">/</span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
