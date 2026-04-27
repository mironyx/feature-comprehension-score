// Design reference: docs/design/lld-v9-org-switcher.md §src/hooks/use-dismiss-effect.ts
import { useEffect } from 'react';
import type { Dispatch, SetStateAction, RefObject } from 'react';

export function useDismissEffect(
  containerRef: RefObject<HTMLElement | null>,
  setIsOpen: Dispatch<SetStateAction<boolean>>,
): void {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (containerRef.current && target && containerRef.current.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [containerRef, setIsOpen]);
}
