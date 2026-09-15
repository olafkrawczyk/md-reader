## Context

- The explorer hides non-displayable files (`isDisplayableFile`: claimed document-type extensions plus a hardcoded `TEXT_EXTENSIONS` set of `txt`/`text` in sidebar.tsx). Any create/rename that lands on a non-displayable name makes the file vanish — the motivation for normalizing instead of trusting typed names.
- "Displayable" is defined in two places today: `DocumentTypeRegistry.claimForPath` (claims md/markdown) and the sidebar's hardcoded plain-text set. The naming rule needs the same definition.
- Create/rename both flow through `ExplorerActionsController` (`confirmInline`, `confirmRename`) — one boundary point per operation. `ExplorerRenameState` carries path/initialName/error but not whether the target is a folder.
- The inline naming field (`InlineInput` in sidebar.tsx) is shared by create and rename; `defaultValue` + `autoFocus` today, caret at end.

## Goals / Non-Goals

**Goals:**
- A supported file can never be created or renamed into invisibility.
- `.md` as the visible default for new files, fully editable before confirm.
- One shared definition of "displayable extension".

**Non-Goals:**
- Extension pickers, template choosers, or per-type defaults beyond markdown.
- Changing what the explorer displays (the display rule itself is unchanged).
- Migrating the sidebar's `isDisplayableFile` beyond switching it to the new registry method (behavior identical).

## Decisions

### D1 — Normalize at the controller boundary with a pure helper

`normalizeDocumentName(name, isSupportedExtension)` lives in `explorerActions.ts` as a pure function: trim; if the extension is present and displayable, return as typed; otherwise append `.md` to the full name (so `notes.cpp` → `notes.cpp.md`, `note.` → `note.md`, dotfiles like `.gitignore` → `.gitignore.md`). The displayability predicate is injected, keeping the helper free of workspace dependencies. Applied in `confirmInline` (file mode only) and `confirmRename` (files only) — every entry point (action bar, context menu, ⌘N) already funnels through these two. Alternative: normalize in the inline input's confirm handler — rejected, it would bypass context-menu/shortcut creates that skip the sidebar input.

### D2 — `isDisplayableExtension` on the registry

`DocumentTypeRegistry` gains `isDisplayableExtension(ext)`: claimed extensions plus plain-text (`txt`, `text` — the set moving from sidebar.tsx). The naming predicate and the sidebar's display filter then share one definition. Behavior of the sidebar is unchanged.

### D3 — Rename state learns `isFolder`

`ExplorerRenameState` gains `isFolder`; `confirmRename` normalizes only when it is false. The rename entry point already has the entry at hand, so this is set at `runMenuAction` time — no tree lookups at confirm time.

### D4 — Prefill with stem selection

File creation passes `initial: "Untitled.md"` plus a `selectUpTo` length to `InlineInput`; on mount the field selects the stem so typing replaces `Untitled` while `.md` remains. Confirming untouched creates `Untitled.md`. Folder creation keeps the empty field. Combined with D1, any wiped extension is re-appended on confirm.

## Risks / Trade-offs

- [Users intentionally creating non-markdown files must type the full supported extension] → That is the requested behavior; plain-text and claimed types all pass through.
- [Prefill makes "cancel by clearing the field" harder] → Empty input on confirm still cancels (existing rule), and Escape cancels; unchanged.
- [Normalization surprises users who wanted the unsupported name] → The alternative is an invisible file; the appended-`.md` name is visible in the inline field's error-free confirm path and immediately revealed.

## Migration Plan

Single PR; no data migration. Rollback is a revert. Order: registry method → helper + rename-state → controller wiring → sidebar prefill → tests.

## Open Questions

None.
