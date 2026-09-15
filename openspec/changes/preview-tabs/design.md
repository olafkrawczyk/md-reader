## Context

`TabStore` (`src/core/tabs/tabStore.ts`) keeps an ordered `#paths` list; `open(path)` dedupes via `#activate(path, alreadyOpen)` and subscribes a per-document dirty watcher (lines 117-119) that feeds `#dirtyPaths` → `TabInfo.dirty`. The router (`src/core/panes/router.ts`) holds a single active document; tabs are session-scoped. `TabStrip` renders per-tab state (dirty marker replaces the close button). The explorer's file-row `onClick` calls `tabs.open(path)` (`src/extensions/sidebar.tsx:535-540`); no `onDoubleClick` exists anywhere in `src/`. Close guards (`requestCloseDecision`) fire when closing dirty tabs.

## Goals / Non-Goals

**Goals:**
- Browsing many files leaves at most one extra tab behind.
- Preview state is visible at a glance; promotion paths are obvious and redundant (row double-click, tab double-click, first edit).
- A dirty preview is never auto-closed (no surprise close-guard dialogs).

**Non-Goals:**
- A "keep" button on the tab; multiple simultaneous previews; per-pane preview slots.
- Changing CLI/menu open behavior (permanent).

## Decisions

- **Preview is a `TabStore` concern, keyed by path.** `#previewPath: string | null`; `TabInfo` gains `readonly preview: boolean`. New `openPreview(path)`: if a different preview exists and its document is clean, `#removeTab` it (bypasses the close guard — only clean previews are removed); then `open(path)` runs normally and `#previewPath` points at the new tab. If the target is already open as permanent, this is just an activate. `open(path)` (permanent) clears `#previewPath` when it matches.
- **Promotion on first edit via the existing dirty subscription.** The per-document watcher (tabStore.ts:117-119) already observes `document.dirty`; when it flips true and the path is the current preview, `#previewPath = null`. This is the decision that makes replacement safe: replacements only ever remove *clean* tabs, so the close guard can never fire from a preview replace.
- **Double-click is free of timers.** Web fires two `click`s then `dblclick`. Two preview-opens of the same file are idempotent (dedupe → activate), then the `dblclick` handler calls permanent open. Explorer row and tab both get `onDoubleClick`.
- **Italic tab name as the marker.** `data-preview` attribute on the tab div, `.mdr-tab-name` styled italic under a preview state — follows the design system's per-tab state pattern (dirty marker) with no layout shift and no new icon vocabulary.
- **Search soft-opens, CLI stays permanent.** The search open path switches to `openPreview`; `tabs.open` call sites for CLI/menu keep permanent semantics.

## Risks / Trade-offs

- [User loses a previewed file they meant to keep] → Redundant promotion paths; a replaced preview's file is one click away again.
- [Preview replace closes a tab the user pinned attention on] → Only clean previews are replaced; any edit (even autosaved-later) promotes first.
- [dblclick may also select text in the tab label] → `user-select: none` on tab labels already applies to strip styling; verify during manual check.

## Open Questions

<!-- none -->
