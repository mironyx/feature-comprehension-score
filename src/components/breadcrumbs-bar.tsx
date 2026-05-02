// BreadcrumbsBar — renders breadcrumb segments either from BreadcrumbProvider
// context (project-scoped pages register via SetBreadcrumbs) or from the static
// ROUTE_MAP fallback (top-level routes such as /assessments, /organisation).
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md §B.2
// Issue: #340, #433

'use client';

import { usePathname } from 'next/navigation';
import { Breadcrumbs, type BreadcrumbSegment } from '@/components/ui/breadcrumbs';
import { useBreadcrumbSegments } from '@/components/breadcrumb-provider';

const ROUTE_MAP: Record<string, BreadcrumbSegment[]> = {
  '/assessments': [{ label: 'My Assessments' }],
  '/assessments/new': [
    { label: 'My Assessments', href: '/assessments' },
    { label: 'New Assessment' },
  ],
  '/organisation': [{ label: 'Organisation' }],
};

export function BreadcrumbsBar() {
  const pathname = usePathname();
  const { segments: contextSegments } = useBreadcrumbSegments();

  const segments = contextSegments.length > 0
    ? contextSegments
    : ROUTE_MAP[pathname];

  if (!segments) return null;
  return (
    <div className="mx-auto w-full max-w-page px-content-pad-sm md:px-content-pad pt-4">
      <Breadcrumbs segments={segments} />
    </div>
  );
}
