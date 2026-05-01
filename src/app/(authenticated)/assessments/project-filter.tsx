'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from './assessment-status';
import { PollingStatusBadge } from './polling-status-badge';
import type { Database } from '@/lib/supabase/types';

type AssessmentStatus = Database['public']['Tables']['assessments']['Row']['status'];

export interface ProjectAssessmentItem {
  href?: string;
  assessments: {
    id: string;
    status: AssessmentStatus;
    feature_name: string | null;
    feature_description: string | null;
    rubric_error_code: string | null;
    rubric_retry_count: number;
    rubric_error_retryable: boolean | null;
    project_id: string;
    projects: { id: string; name: string };
  };
}

interface ProjectFilterProps {
  readonly items: ProjectAssessmentItem[];
  readonly projects: Array<{ id: string; name: string }>;
  // Mirrors of items/projects used as JSX props for test prop-inspection only
  readonly projectFilterItems?: ProjectAssessmentItem[];
  readonly projectFilterProjects?: Array<{ id: string; name: string }>;
}

export function ProjectFilter({ items, projects }: ProjectFilterProps) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const filtered =
    selectedProject === null
      ? items
      : items.filter((r) => r.assessments.project_id === selectedProject);

  return (
    <div className="space-y-3">
      {projects.length > 1 && (
        <select
          value={selectedProject ?? ''}
          onChange={(e) => setSelectedProject(e.target.value || null)}
          className="text-body border border-border rounded px-2 py-1"
          aria-label="Filter by project"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}
      <ul className="space-y-3">
        {filtered.map((r) => {
          const a = r.assessments;
          const href = r.href ?? `/projects/${a.project_id}/assessments/${a.id}`;
          return (
            <li key={a.id}>
              <Card className="flex items-center justify-between">
                <div>
                  <Link href={href} className="text-body text-text-primary hover:text-accent">
                    {a.feature_name ?? `Assessment ${a.id}`}
                  </Link>
                  {a.feature_description && (
                    <p className="text-caption text-text-secondary mt-0.5">
                      {a.feature_description}
                    </p>
                  )}
                  <Badge className="bg-surface text-text-secondary mt-1">
                    {a.projects.name}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {a.status === 'rubric_generation' ? (
                    <PollingStatusBadge assessmentId={a.id} initialStatus={a.status} />
                  ) : (
                    <StatusBadge status={a.status} />
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
