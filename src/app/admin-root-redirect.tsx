// Admin root redirect — client component reading lastVisitedProjectId and routing.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md § B.3
// Issue: #434
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getLastVisitedProject, clearLastVisitedProject } from '@/lib/last-visited-project';

interface AdminRootRedirectProps {
  readonly projectIds: string[];
}

export function AdminRootRedirect({ projectIds }: AdminRootRedirectProps) {
  const router = useRouter();
  useEffect(() => {
    const lastId = getLastVisitedProject();
    if (lastId && projectIds.includes(lastId)) {
      router.replace(`/projects/${lastId}`);
      return;
    }
    if (lastId) clearLastVisitedProject();
    router.replace('/projects');
  }, [projectIds, router]);
  return null;
}
