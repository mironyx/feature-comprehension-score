// Tabs — client-side tab bar with optional URL query-param sync for deep linking.
// Design reference: docs/design/lld-v7-frontend-ux.md §T8
// Issue: #347
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  queryParam?: string;
}

const TAB_BASE_CLASSES = 'px-3 py-2 text-label font-medium transition-colors cursor-pointer';
const ACTIVE_TAB_CLASSES = `${TAB_BASE_CLASSES} text-accent border-b-2 border-accent`;
const INACTIVE_TAB_CLASSES = `${TAB_BASE_CLASSES} text-text-secondary hover:text-text-primary`;

function resolveInitialTab(tabs: Tab[], defaultTab: string | undefined, urlTab: string | null): string {
  if (urlTab && tabs.some((t) => t.id === urlTab)) return urlTab;
  if (defaultTab && tabs.some((t) => t.id === defaultTab)) return defaultTab;
  return tabs[0]?.id ?? '';
}

function TabButton({ tab, isActive, onSelect }: { tab: Tab; isActive: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={isActive ? ACTIVE_TAB_CLASSES : INACTIVE_TAB_CLASSES}
      onClick={() => onSelect(tab.id)}
    >
      {tab.label}
    </button>
  );
}

export function Tabs({ tabs, defaultTab, queryParam }: TabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = queryParam ? searchParams.get(queryParam) : null;
  const [activeId, setActiveId] = useState<string>(resolveInitialTab(tabs, defaultTab, urlTab));

  function handleSelect(id: string) {
    setActiveId(id);
    if (!queryParam) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(queryParam, id);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const activePanel = tabs.find((t) => t.id === activeId)?.content ?? null;

  return (
    <div>
      <div role="tablist" className="flex border-b border-border">
        {tabs.map((tab) => (
          <TabButton key={tab.id} tab={tab} isActive={tab.id === activeId} onSelect={handleSelect} />
        ))}
      </div>
      <div role="tabpanel" className="py-section-gap">
        {activePanel}
      </div>
    </div>
  );
}
