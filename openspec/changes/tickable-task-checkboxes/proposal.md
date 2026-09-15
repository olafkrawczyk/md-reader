## Why

GFM task lists (`- [ ]` / `- [x]`) render in the reading pane as inert, disabled checkboxes — the reader can see a todo list but cannot act on it, which is the single most common interactive element in markdown notes. Ticking should be a first-class reading action: click the box, the source updates, the file persists through the same dirty/autosave machinery as a text edit. (Reference design discussion: `02436b0d` change series.)

## What Changes

- **Tickable task checkboxes in the reading pane.** GFM task-list checkboxes render as real, enabled, token-styled controls; clicking (or Tab + Space) toggles the corresponding `[ ]` / `[x]` marker in the markdown source.
- **Ticks are ordinary edits.** A tick goes through `document.setText`, so the dirty marker, autosave, close guard, and rendering-follows-changes behavior all apply unchanged.
- **Precise marker replacement.** The swapped marker is the one belonging to the clicked list item, addressed by its exact source span from the parsed AST — text like `[\s|x]` in code blocks or prose is never touched.
- **Editor stays live in split view.** The editing pane currently never observes external document changes; it now reflects changes made outside the editor (a reader tick) instead of silently holding stale text whose next keystroke would revert the tick.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `markdown-reading`: New requirement for interactive (tickable) GFM task checkboxes in the reading pane.
- `markdown-editing`: New requirement that the editing pane reflects document changes made outside the editor, so split-view editing cannot revert them.

## Impact

- New `src/extensions/taskTicks.ts` — markdown transformer annotating task-list items with source spans; pure span-swap helper.
- `src/extensions/reader.tsx` — enable rendered task checkboxes after render; delegated click handling.
- `src/extensions/editor.tsx` — CodeMirror external-change sync in `useCodeMirror`.
- `src/extensions/index.ts` — register the new extension.
- `src/theme.css` — checkbox styling on the token set (both appearances).
- No document-format, save-pipeline, or settings changes.
