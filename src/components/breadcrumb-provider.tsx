// BreadcrumbProvider — React context for dynamic breadcrumb segments.
// Pages register their breadcrumb trail via SetBreadcrumbs, which calls
// useBreadcrumbSegments().setSegments. The BreadcrumbsBar reads context
// segments before falling back to the static ROUTE_MAP.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md §B.2
// Issue: #433

'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { BreadcrumbSegment } from '@/components/ui/breadcrumbs';

interface BreadcrumbContextValue {
  readonly segments: BreadcrumbSegment[];
  readonly setSegments: (segments: BreadcrumbSegment[]) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  segments: [],
  setSegments: () => {},
});

interface BreadcrumbProviderProps {
  readonly children: ReactNode;
}

export function BreadcrumbProvider({ children }: BreadcrumbProviderProps) {
  const [segments, setSegments] = useState<BreadcrumbSegment[]>([]);
  return (
    <BreadcrumbContext.Provider value={{ segments, setSegments }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbSegments(): BreadcrumbContextValue {
  return useContext(BreadcrumbContext);
}
