# Session Log — 2026-04-27 Session 5

**Issue:** [#372](https://github.com/mironyx/feature-comprehension-score/issues/372) — feat: replace OrgSwitcher with on-demand picker (stories 1.1–1.3)
**PR:** [#375](https://github.com/mironyx/feature-comprehension-score/pull/375)
**Branch:** `feat/org-switcher-picker` (worktree)
**Epic:** [#371](https://github.com/mironyx/feature-comprehension-score/issues/371)

---

## Work completed

### Implementation

- Extracted `useDismissEffect` verbatim from `MobileNavMenu` to `src/hooks/use-dismiss-effect.ts`; widened ref type from `RefObject<HTMLDivElement | null>` to `RefObject<HTMLElement | null>` for reuse across component types.
- Rewrote `src/components/org-switcher.tsx` as a three-state `'use client'` component:
  - Single-org: plain `<span>` with org name, no controls.
  - Multi-org passive: trigger button with `aria-label="Switch organisation"` + `aria-expanded`, ChevronDown icon, no list visible.
  - Multi-org open: inline `OrgPickerDropdown` with all orgs; current org as `<button onClick={onClose}>`, others as `<a href="/api/org-select?orgId=...">`.
- Updated `src/components/mobile-nav-menu.tsx` to import `useDismissEffect` from shared hook; removed inline definition.
- Created `tests/components/org-switcher.test.ts` with 26 tests covering all LLD invariants (I1–I7) and acceptance criteria (AC1–AC10). Tests follow the established hook-mocking pattern from `mobile-nav-menu.test.ts`.

### Review fixes (post-PR)

- **ARIA violation:** removed `role="listbox"` / `role="option"` from dropdown. WAI-ARIA 1.2 prohibits interactive children inside `role="option"`. Replaced with plain `<ul>` + `aria-current` on `<li>`.
- **Duplicate Escape handling:** added `e.stopPropagation()` in the `onKeyDown` Escape branch to prevent `useDismissEffect`'s document-level listener from also calling `setIsOpen(false)`.
- **`aria-expanded`:** added to trigger button for screen-reader disclosure state feedback.
- **Design reference comments:** added to both new files.
- **Deterministic test timestamps:** replaced `new Date().toISOString()` with fixed `'2026-01-01T00:00:00Z'` in test factory.

### LLD sync

Updated `docs/design/lld-v9-org-switcher.md` (Draft → Revised):
- Corrected ARIA roles section.
- Updated Escape focus-return wiring to reflect `onKeyDown` + `stopPropagation` approach.
- Updated test file path (`tests/components/org-switcher.test.ts`).
- Added implementation notes explaining each deviation.

---

## Decisions made

**`OrgPickerDropdown` exported:** The sub-component is exported (not private) to allow direct unit testing of its ARIA/navigation contract. The tests exercise it in isolation from `OrgSwitcher` state. A reviewer flagged this as YAGNI but the testing benefit justifies the export; noted as future cleanup.

**Escape via `onKeyDown` not hook param:** The LLD proposed adding a `dismissedViaEscape` ref or `onEscape` callback to `useDismissEffect` to distinguish Escape from click-outside for focus return. Instead, Escape is handled in the component's `onKeyDown` with `e.stopPropagation()`. This keeps the hook signature unchanged and avoids adding state for a one-call-site concern.

**ARIA: plain list not listbox:** WAI-ARIA 1.2 forbids interactive content inside `role="option"`. A navigation picker (not a form control) is better served by plain list semantics with `aria-current` marking the active item.

---

## Review feedback addressed

| Finding | Severity | Resolution |
|---------|----------|------------|
| `role="listbox"`/`role="option"` with interactive children | block | Removed; plain `<ul>` |
| Escape double-fires `setIsOpen(false)` | block | `e.stopPropagation()` added |
| Missing `aria-expanded` on trigger | warn | Added |
| Missing design reference comments | warn | Added to both files |
| Non-deterministic test timestamps | warn | Fixed to static ISO string |
| `OrgPickerDropdown` unnecessary export | warn | Deferred — needed for tests |
| `useDismissEffect` in single-org path | warn | Deferred — safe no-op when `containerRef.current` is null |
| 20-line function limit | warn | Deferred — CodeScene 10.0, low cognitive complexity |

---

## Cost retrospective

| Stage | Cost |
|-------|------|
| At PR creation | $3.02 |
| Final (post-review fixes) | $5.80 |
| Post-PR delta | $2.78 |

**Cost drivers:**

- **Review fix cycle ($2.78 delta):** Two blockers (ARIA roles, duplicate Escape) required a second commit + CI re-run. The ARIA issue was a spec error in the LLD — the LLD used `role="listbox"`/`role="option"` which is invalid with interactive children. Catching this during LLD authoring (or in the test spec) would have avoided the post-PR fix.
- **Sub-agent spawns:** test-author, test-runner (×3), feature-evaluator, ci-probe, pr-review (×2 agents), lld-sync — each re-reads the diff. Standard cost for a well-tested feature.
- **Cache performance:** 10.97M cache-read tokens vs 385K cache-write — good cache utilisation; the worktree setup kept context warm.

**Improvement actions:**
- LLD ARIA roles should be validated against WAI-ARIA spec during architect phase. A one-line note ("verify interactive children are permitted in the chosen role") in the LLD template would catch this class of error before implementation.
- For future pickers/dropdowns, prefer `role="menu"` / `role="menuitem"` (interactive children permitted) or plain list semantics; avoid `role="listbox"` unless building a form-control replacement.

---

## Next steps

- Epic #371 continues with stories 1.4+ (if defined).
- Run `/drift-scan` after the full epic is complete to verify no design drift.
