// BreadcrumbsBar — derives breadcrumb segments from the current pathname.
// Design reference: docs/design/lld-v7-frontend-ux.md § T1
// Issue: #340

'use client';

import { usePathname } from 'next/navigation';
import { Breadcrumbs, type BreadcrumbSegment } from '@/components/ui/breadcrumbs';

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
  const segments = ROUTE_MAP[pathname];
  if (!segments) return null;
  return (
    <div className="mx-auto w-full max-w-page px-content-pad-sm md:px-content-pad pt-4">
      <Breadcrumbs segments={segments} />
    </div>
  );
}
