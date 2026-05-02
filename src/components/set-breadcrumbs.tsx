// SetBreadcrumbs — effectful client component that registers breadcrumb
// segments with BreadcrumbProvider via useEffect. Renders nothing.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md §B.2
// Issue: #433

'use client';

import { useEffect } from 'react';
import { useBreadcrumbSegments } from '@/components/breadcrumb-provider';
import type { BreadcrumbSegment } from '@/components/ui/breadcrumbs';

interface SetBreadcrumbsProps {
  readonly segments: BreadcrumbSegment[];
}

export function SetBreadcrumbs({ segments }: SetBreadcrumbsProps): null {
  const { setSegments } = useBreadcrumbSegments();
  // JSON.stringify avoids re-runs from new array references with the same content.
  const segmentsKey = JSON.stringify(segments);
  useEffect(() => {
    setSegments(segments);
    return () => setSegments([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentsKey, setSegments]);
  return null;
}
