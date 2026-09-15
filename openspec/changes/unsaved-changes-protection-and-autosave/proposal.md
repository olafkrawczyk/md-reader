## Why

Editing is lossy today: closing a tab (button, middle click, `Cmd+W`) silently discards unsaved changes, and quitting the app with dirty documents loses them entirely. An autosave policy plus a save/discard/cancel prompt on close protects user work with no extra keystrokes.

## What Changes

- Add autosave: after an idle delay following the last edit, the document is saved automatically. Autosave is on by default with a 1 second delay.
- Add a Settings surface for autosave: on/off toggle and idle delay.
- Add an unsaved-changes guard on tab close: closing a dirty tab (close button, middle click, `Cmd+W`, external deletion flow) shows a Save / Discard / Cancel dialog instead of silently discarding.
- Add an unsaved-changes guard on window close: quitting or closing the window while documents are dirty prompts before discarding; Cancel aborts the close.
- With autosave enabled, dirty documents are rare, so the close guard stays in place for the windows where a save is still pending.

## Capabilities

### New Capabilities

- `document-safety`: Autosave policy (idle-delay autosave, settings, save/error feedback) and the unsaved-changes guard that protects dirty documents on tab close and window close.

### Modified Capabilities

- `document-tabs`: The closing-tabs requirement changes — closing a dirty tab no longer closes silently; it prompts Save / Discard / Cancel and Cancel aborts the close.

## Impact

- `src/core/workspace/document.ts` / `bridge.ts`: save path stays the same; a debounce wrapper and save-status feedback layer on top.
- `src/core/tabs/tabStore.ts` and `TabStrip.tsx`: close path becomes cancellable and consults the guard before removing a tab.
- `src/core/state/appShellHooks.ts`: window close interception (Tauri close-requested), `Cmd+W` guard, autosave effect wiring.
- `src-tauri/src/lib.rs`: may need a close-requested hook / prevent-close support to make window-close cancellation possible.
- `src/core/settings/`: new setting schema entries (autosave on/off, delay seconds) rendered by the existing Settings panel; per project convention the autosave settings requirements are owned by the `document-safety` capability and contributed through the existing generic settings mechanism, so `extension-platform` itself is unchanged.
- No dependency changes; uses existing Tauri event APIs.
