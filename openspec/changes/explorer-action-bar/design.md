## Context

See proposal.md — Why. Current implementation facts that shape the design:

- Creation already flows through `ExplorerActionsController.#beginCreate(parentPath, mode)`, which opens the inline field at any parent path; the sidebar already reveals and expands ancestors after creation (`handleConfirmInline`). Only the *entry points* are root-bound.
- The action-bar buttons need to know the explorer's selection. Selection lives in two places: the sidebar reducer owns the clicked-row highlight, while the router's `activeSource` owns the active document. The action bar renders inside `SidebarPane`, so it can see both without new state plumbing.
- The sidebar's filter UI is a small state machine (`searchOpen` + `query` in `ExplorerState`) toggled by a magnifier button. The query itself already drives `filterFileNames` and forced expansion of match folders — that machinery is reusable as-is.
- The toolbar buttons are registered in `fileManagement.tsx` under slot `toolbar` (id `explorer-file-actions`) and hidden when no folder is open.

## Goals / Non-Goals

**Goals:**
- One persistent strip at the bottom of the explorer that owns both affordances, following the Xcode navigator bottom-bar pattern.
- Creation that lands where the user is looking, driven by selection.
- Deletion of the search toggle state machine — fewer states, no mode to get lost in.

**Non-Goals:**
- Document find (⌘F find bar) is untouched.
- No new global keyboard shortcuts; ⌘N / ⌘⇧N keep their current meaning.
- No drag-and-drop, context-menu, or rename behavior changes.
- No persistence of filter text across sessions (it stays session-transient, cleared on folder close as today).

## Decisions

### D1 — Action bar at the bottom of the explorer (Xcode navigator pattern), not the header

Apple's file navigators (Xcode's project navigator, Finder's status area) anchor list-mutation controls and filtering in a bar *below* the list, not above it. Rationale: pointer travel — the eye and cursor are already in the tree when the user decides to create or filter; a bottom bar minimizes the round trip. The header alternative was rejected because the header currently carries nothing else, and stacking buttons above a long tree separates them from the rows they act on (the exact complaint about the top toolbar). Buttons go left, filter field fills the remainder to the right edge — the same left-actions/right-filter split Xcode uses.

### D2 — Contextual target computed from selection at click time

When a create button is clicked, resolve the target as: selected folder → that folder; selected file → its parent; nothing selected (or selection is not in the tree) → workspace root. Computed once per click, not stored. Alternative considered: a dropdown menu on a single "+" button (Xcode uses a menu). Rejected: two buttons with distinct icons are zero-ambiguity and one click; a menu adds a hover/press decision layer for a two-item choice.

### D3 — Filter field is always visible; the toggle state machine is deleted

`searchOpen` leaves `ExplorerState` entirely; `query` stays. The field renders unconditionally in the action bar. Escape clears the query (one keystroke, no mode exit); a clear (ⓧ) button appears only when the field has text — standard macOS text-field behavior. Alternative considered: keep the click-to-reveal but auto-focus on ⌘F-like shortcuts. Rejected: it preserves the exact friction being removed, and a persistent field costs 28px of height in a bar that would otherwise be empty space.

### D4 — Create buttons live in the sidebar extension, driven by the existing controller service

`fileManagement.tsx` loses `ToolbarFileActions` and gains nothing visual; the action bar is rendered by `sidebar.tsx` (it already consumes `explorerActionsKey`). The controller's public surface changes `beginCreate(mode)` (root-bound) to accept an explicit parent or a selection resolver. This keeps the established split — the sidebar owns explorer chrome, file-management owns file operations — rather than re-homing UI into the operations extension.

### D5 — Selection source: the sidebar's own clicked-row highlight

The action bar reads the explorer's clicked-row selection (the sidebar reducer's `activePath` analog — the row the user last clicked), because that is what the user perceives as "here". The router's active-document path is the fallback for the case where the user clicked a row, switched panes, and returned. Edge case: selection highlight exists only on file rows today; the design extends the selected style to folder rows when computing the create target (the row the user last clicked, folder or file).

## Risks / Trade-offs

- [Selection ambiguity: active document vs. clicked row] → One deterministic rule (D5): last-clicked tree row wins, active document is the fallback, root is the final fallback. Documented in the spec scenarios.
- [Bottom bar steals vertical space from the tree] → One 28–32px strip replaces the header's search-button row and the top toolbar buttons, so net window chrome shrinks; the field and buttons share a single row.
- [Contextual creation may surprise users who expect root] → The inline field appears *at the target location* (expanded, revealed), so the destination is visible before Enter; Escape cancels. Context-menu "New File" on a folder already behaves this way — the action bar simply matches it.
- [Removing the toolbar registration breaks hidden consumers] → Grep for `explorer-file-actions` / `toolbar` slot usage during implementation; only `fileManagement.tsx` registers it today.

## Migration Plan

Single-PR UI change; no data or API migration. Rollback is a revert. Order within the change: controller surface first (selection-aware create), then sidebar action bar, then delete the toolbar registration and search toggle, then CSS cleanup.
