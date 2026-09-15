## Why

The explorer's two most-used affordances fight the user's mental model. The New File / New Folder buttons sit in the top toolbar — separated from the file tree they act on — and always create at the workspace root, so the new row can appear far from where the user is looking. The filename search is a mode toggle: click the magnifier to reveal the input, press Escape to collapse it. Two clicks and a hidden state for what should be an always-present field. Both violate the platform convention this app otherwise follows ("Predictable Finder-like behavior over novelty"): actions belong next to the list they mutate, and search in a sidebar is a persistent field, not a transient mode. (Reference: `02436b0d`.)

## What Changes

- **Remove the New File / New Folder buttons from the top toolbar.** The `toolbar`-slot registration in the file-management extension goes away; creation no longer lives in the window chrome.
- **Add a persistent action bar at the bottom of the explorer sidebar** (the Xcode project-navigator pattern): New File and New Folder buttons grouped on the left, the filename filter field on the right.
- **Make file creation contextual.** The action-bar buttons create relative to the explorer's current selection: a selected folder receives the new entry inside it, a selected file's parent receives it, and with no selection the workspace root is the target. (Today both buttons always target the root.)
- **Replace the search toggle with an always-visible filter field.** The magnifier button and its open/closed state machine are removed. The field filters the tree as the user types, shows a clear (ⓧ) affordance when it has text, and Escape clears it. No hidden mode to open or close.
- **Keep the existing entry points.** ⌘N / ⌘⇧N, the context menu's New File / New Folder, and inline create-with-reveal behavior are unchanged; the action bar reuses the same controller paths.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `file-explorer`: New requirements for a persistent explorer action bar (contextual creation buttons plus an always-visible filename filter field), replacing the toolbar-creation and search-toggle behavior described today.

## Impact

- `src/extensions/fileManagement.tsx` — drop the `ToolbarFileActions` registration; expose the controller for sidebar-anchored, selection-aware create entry points.
- `src/extensions/sidebar.tsx` — new action-bar region in the explorer (buttons + filter field); explorer state machine loses `searchOpen`; needs selection context to compute the create target.
- `src/core/explorer/explorerActions.tsx` / `searchTypes.ts` — service surface gains a selection-aware `beginCreate`; no protocol changes expected.
- `src/theme.css` — styles for the action bar and filter field; removal of the search-button styles.
- Toolbar slot consumers: confirm nothing else depends on `explorer-file-actions`.
