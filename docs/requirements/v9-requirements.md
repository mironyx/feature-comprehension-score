# Organisation Switcher UX — V9 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.2 |
| Status | Draft — Complete |
| Author | LS / Claude |
| Created | 2026-04-26 |
| Last updated | 2026-04-26 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-26 | LS / Claude | Initial draft from freeform brief |
| 0.2 | 2026-04-26 | LS / Claude | Resolve open questions; write acceptance criteria |

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

**Acceptance Criteria:**

- Given an authenticated user who belongs to exactly one org, when any authenticated page loads, then the nav bar shows the org name as plain text with no interactive switcher controls.
- Given a single-org user, when the page loads, then no trigger button, chevron, or dropdown is rendered.

**Notes:** The current `<span>` rendering is correct. This story may adjust visual style (label weight, truncation for long names) without adding any interactive element. INVEST: Independent — no dependency on 1.2 or 1.3.

---

### Story 1.2: Multi-org passive state — current org with trigger

**As a** multi-org user,
**I want to** see my current organisation name and a visual cue that I can switch,
**so that** I know which org is active and that switching is available without cluttering the nav bar.

**Acceptance Criteria:**

- Given an authenticated user who belongs to two or more orgs, when any authenticated page loads, then the nav bar shows the current org name and a trigger button (e.g. chevron-down icon) adjacent to it.
- Given a multi-org user, when the page loads, then no org list is visible — only the current org name and trigger are shown.
- Given a multi-org user, when the trigger button is focused via keyboard, then it receives the design system's focus ring class (i.e. the element is focusable and the browser's `:focus-visible` state is reachable via Tab).

**Notes:** The trigger button must have `aria-label="Switch organisation"`. No list is rendered until the trigger is activated (Story 1.3). INVEST: Depends on 1.1 being in place; 1.3 depends on this story's trigger.

---

### Story 1.3: Multi-org picker — open, select, and dismiss

**As a** multi-org user,
**I want to** open an org picker, see all my organisations with the current one clearly marked, and either select a different org or dismiss,
**so that** I can switch context or change my mind without being forced to navigate away.

**Acceptance Criteria:**

- Given a multi-org user in passive state, when the trigger button is clicked, then an inline dropdown opens listing all orgs the user belongs to.
- Given the picker is open, when it is rendered, then the current org item has `aria-current="true"` set on its element and is visually differentiated from the other items.
- Given the picker is open, when the user clicks a different org, then the browser navigates to `/api/org-select?orgId=<id>` (which sets the cookie and reloads).
- Given the picker is open, when the user clicks outside the dropdown, then the picker closes and no org switch occurs.
- Given the picker is open, when the user presses Escape, then the picker closes, no org switch occurs, and focus returns to the trigger button.
- Given the picker is open, when the user clicks the current org, then the picker closes and no org switch occurs.
- Given the picker is open, when the user tabs through the org list and presses Enter on an org, then the same action fires as a click on that org.

**Notes:** Implemented as an inline dropdown (no modal, no new component dependencies). The dismiss-on-click-outside and Escape patterns already exist in `MobileNavMenu` (`useDismissEffect`) and can be reused. INVEST: Depends on Story 1.2 for the trigger; independently testable once 1.2 ships.

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

No open questions — both resolved during Gate 1 review.

| # | Question | Resolution |
|---|----------|------------|
| 1 | Dropdown vs modal? | **Inline dropdown.** No modal component in design system; dropdown is sufficient and simpler. |
| 2 | Mobile nav menu in scope? | **Deferred.** On mobile, `OrgSwitcher` renders inside `MobilePanel`, which already provides a dismiss mechanism. The flat list inline is acceptable there. Mobile restyling is a follow-up. |

---

## Cross-Reference

**Source brief:** User belongs to multiple orgs; at any moment they act on behalf of one. The header shows all orgs with no clear indication of the current one and no way to cancel selection.

| Brief item | Story |
|-----------|-------|
| Current org not clearly shown | Story 1.2 (passive state), Story 1.1 (single-org) |
| All orgs shown all the time | Story 1.2 (passive state hides list by default) |
| Need a way to select | Story 1.3 (picker open state) |
| Need a way to cancel selection | Story 1.3 (dismiss without switching) |
