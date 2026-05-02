// Track last-visited project — client component that writes localStorage on mount.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md § B.3
// Issue: #434
'use client';

import { useEffect } from 'react';
import { setLastVisitedProject } from '@/lib/last-visited-project';

interface TrackLastVisitedProjectProps {
  readonly projectId: string;
}

export function TrackLastVisitedProject({ projectId }: TrackLastVisitedProjectProps) {
  useEffect(() => {
    setLastVisitedProject(projectId);
  }, [projectId]);
  return null;
}
