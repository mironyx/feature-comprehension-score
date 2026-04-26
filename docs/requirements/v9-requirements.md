# Organisation Switcher UX — V9 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.1 |
| Status | Draft — Structure |
| Author | LS / Claude |
| Created | 2026-04-26 |
| Last updated | 2026-04-26 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-26 | LS / Claude | Initial draft from freeform brief |

---

## Context / Background

Users may belong to multiple GitHub organisations registered in FCS. The authenticated layout already stores the selected org in an `fcs-org-id` cookie (set via `/api/org-select`) and redirects to `/org-select` if none is chosen — so the concept of a "current org" is correctly implemented at the data layer.

The gap is in the header UI. The current `OrgSwitcher` component (`src/components/org-switcher.tsx`) renders a persistent, unstyled list of all other orgs below the current org name when a user belongs to more than one org. This makes it unclear which org is active and provides no way to dismiss the list without navigating away. Single-org users see a plain text span with no visual treatment.

This requirements doc covers the header UX only. No API, cookie, or database changes are required.

---

## Glossary

| Term | Definition |
|------|-----------|
| **Current org** | The organisation whose `id` is stored in the `fcs-org-id` cookie. All authenticated pages operate within this context. |
| **Org picker** | An inline UI element (dropdown or popover) that lists all the user's orgs and allows switching. Opened on demand; dismissible without switching. |
| **Trigger** | The button or icon in the nav bar that opens the org picker. Visible only when the user belongs to more than one org. |
| **Switch** | The act of selecting a different org, which calls `/api/org-select?orgId=...` and reloads the app in the new org context. |

---

## Design Principles / Constraints

1. **No backend changes.** The `currentOrg` and `allOrgs` props are already correctly populated in `NavBar`. This work is component-level UI only.
2. **Single-org users see no picker UI.** Their experience must not be cluttered by switcher controls they will never use.
3. **Current org must be visually unambiguous.** A user opening the picker must immediately know which org is active without reading carefully.
4. **Cancellable.** Opening the picker is a non-destructive action. The user must be able to dismiss it without any org switch occurring.
5. **Consistent with the existing design system.** Use tokens from `docs/design/frontend-system.md`. No new dependencies.
6. **Small PR.** The entire change should fit in a single PR (< 200 lines).

---

## Roles

| Role | Type | Description |
|------|------|-----------|
| **Authenticated User** | Persistent | Any signed-in user. May belong to one or more orgs. |
| **Single-org User** | Contextual | An authenticated user who belongs to exactly one org. Sees no picker controls. |
| **Multi-org User** | Contextual | An authenticated user who belongs to two or more orgs. Sees the trigger and picker. |

---

## Epic 1: Organisation Switcher UX [Priority: High]

Replaces the current persistent org list in the nav bar with a clear, on-demand org picker. Single-org users are unaffected. Multi-org users see the current org name prominently, with a trigger to open a picker when they want to switch.

**Rationale:** This is the only epic because the scope is a single component. It is split into two stories along the single-org / multi-org boundary — each story is independently deployable and testable.

### Story 1.1: Single-org header display

**As a** single-org user,
**I want to** see my organisation name clearly in the nav bar,
**so that** I know which org I am acting on behalf of without any distracting switcher controls.

**Notes:** The current implementation already renders a `<span>` with the org name. This story formalises the requirement and may refine the visual treatment (e.g. label style, truncation for long names) without adding any interactive element.

*(Acceptance criteria in next pass)*

---

### Story 1.2: Multi-org picker — passive state

**As a** multi-org user,
**I want to** see my current organisation name and a visual cue that I can switch,
**so that** I know which org is active and that switching is available.

**Notes:** In the passive (closed) state the nav bar shows the current org name alongside a small icon (e.g. chevron-down or a swap icon) that signals interactivity. No list is shown. Clicking the trigger opens the picker (Story 1.3).

*(Acceptance criteria in next pass)*

---

### Story 1.3: Multi-org picker — open state and selection

**As a** multi-org user,
**I want to** open an org picker, see all my organisations with the current one clearly marked, and either select a different org or cancel,
**so that** I can switch context or change my mind without being forced to navigate.

**Notes:** Clicking the trigger from Story 1.2 opens a picker (inline dropdown or popover). The picker lists all orgs; the current org is marked (e.g. checkmark or highlighted). Selecting another org navigates to `/api/org-select?orgId=...`. An explicit close action (× button, pressing Escape, or clicking outside) dismisses the picker without switching.

*(Acceptance criteria in next pass)*

---

## Cross-Cutting Concerns

### Accessibility

- The trigger button must have an accessible label (e.g. `aria-label="Switch organisation"`).
- The picker must be keyboard-navigable: Tab/Arrow to move between options, Enter to select, Escape to dismiss.
- Focus must return to the trigger button after the picker is dismissed without switching.

### Responsive / Mobile

- The existing `MobileNavMenu` (`src/components/mobile-nav-menu.tsx`) also renders org switching. Any UX changes should be reflected there too, or the divergence documented as a deliberate deferral.

---

## What We Are NOT Building

- A way to belong to more orgs or leave an org — org membership is managed via GitHub.
- An org management page — covered by the existing `/organisation` route.
- Persistence of picker state between page loads — the picker is always closed on load.
- Any change to the `/org-select` full-page picker used at sign-in — it is out of scope.

---

## Open Questions

| # | Question | Context | Options | Impact |
|---|----------|---------|---------|--------|
| 1 | Dropdown vs modal for the picker? | Dropdown is lighter; modal is easier to dismiss on mobile. Current design system has no modal component. | A) Inline dropdown/popover B) Lightweight modal | Affects implementation complexity and Story 1.3 AC wording. |
| 2 | Should the mobile nav menu receive the same treatment in this scope? | `MobileNavMenu` currently renders the same org list inline. Keeping it in sync avoids divergence but adds lines. | A) Include mobile in this scope B) Defer mobile to a follow-up | If deferred, Story 1.3 notes the gap explicitly. |

---

## Cross-Reference

**Source brief:** User belongs to multiple orgs; at any moment they act on behalf of one. The header shows all orgs with no clear indication of the current one and no way to cancel selection.

| Brief item | Story |
|-----------|-------|
| Current org not clearly shown | Story 1.2 (passive state), Story 1.1 (single-org) |
| All orgs shown all the time | Story 1.2 (passive state hides list by default) |
| Need a way to select | Story 1.3 (picker open state) |
| Need a way to cancel selection | Story 1.3 (dismiss without switching) |
