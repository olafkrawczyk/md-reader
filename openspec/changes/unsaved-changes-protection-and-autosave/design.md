## Context

- `Document` (src/core/workspace/document.ts) already owns text/version/dirty and an async `save()`; every close path for a tab converges on `TabStore.close()` (src/core/tabs/tabStore.ts), except window close, which nothing intercepts today.
- When a tab is dirty, the dirty marker currently *replaces* the close button (TabStrip.tsx), so dirty tabs can only be closed by middle click or `Cmd+W` — both discard silently.
- The app ships every feature as a built-in extension (bootstrap-extension-platform) and contributes settings through the schema-driven mechanism (`settingsStore`, generic SettingsPanel). Reading settings follow this pattern (see reading-experience spec).
- Tauri v2: `@tauri-apps/api/window`'s `onCloseRequested` lets the webview veto a window close; the dialog plugin's JS API only supports two-button asks, not Save/Discard/Cancel.
- The app has one window; "quit" and "close window" are the same event.

## Goals / Non-Goals

**Goals:**
- One guarded close path: every tab-close route (marker click, middle click, `Cmd+W`) and window close flows through the same dirty check.
- Autosave as a core-owned debouncer driven by settings contributed from a built-in extension.
- Reuse the existing status-message surface for autosave errors and the design system's control vocabulary for the dialog.

**Non-Goals:**
- Per-document conflict detection with external edits (external deletion already closes tabs; external modification semantics unchanged).
- Session restore of unsaved changes across restarts (crash recovery).
- Save-all / format-on-save, or autosave for untitled documents (all documents are workspace files today).

## Decisions

### D1: In-app modal dialog, not the native dialog plugin
The dialog plugin's `ask`/`confirm` offer two buttons only; Save / Discard / Cancel needs three. An in-app modal styled with the design system's control vocabulary (quiet buttons, one destructive "Discard") is consistent with the macOS-native-redesign approach of owning chrome, and the same component serves both tab close and window close. Alternative rejected: a Rust-side NSAlert — platform-specific code for behavior the webview can render, and it bypasses the theme system.

### D2: The guard lives in `TabStore.close`, the dialog behind a callback
`TabStore.close(path)` returns early with a decision request when the document is dirty instead of closing. The decision UI is resolved through an injected handler (a `closeGuard` service in `src/core/safety/`): `"save" | "discard" | "cancel"`. The shell registers the modal renderer as the handler; `TabStrip` and `useGlobalShortcuts` keep calling `tabs.close*` unchanged. This keeps every close path (button, middle click, shortcut, window close) on one code path and avoids scattering dialog logic.

Flow per decision:
- `save` → `document.save()` → close tab on success (failure shows error status, tab stays open)
- `discard` → close tab immediately
- `cancel` → no-op

Window close uses the same service: `onCloseRequested` calls `event.preventDefault()`, asks the guard about *all* dirty documents, and on `save` saves all before `getCurrentWindow().destroy()`; on `cancel` it does nothing. No Rust changes; if the `core:window` permission for close/destroy is missing from the capabilities config, add it there.

### D3: Autosave is a built-in extension `@mdr/document-safety` over a core debouncer
The debouncing policy engine lives in `src/core/safety/autosave.ts` (framework-free, subscribes to `Document` changes, one timer per document, reset on every `setText`, cancelled by explicit save and on document close). The built-in extension `src/extensions/documentSafety.ts` contributes the two settings (`autosave` boolean default true; `autosaveDelay` number, default 1s, bounds 1–60, step 1) and, on activation, wires the debouncer to the settings values so changes apply live. This follows the project rule that every feature ships through the extension contract; a core-only implementation would bypass settings contribution.

### D4: The dirty marker becomes the close affordance for dirty tabs
Instead of leaving dirty tabs unclosable from the button area, clicking the dirty marker triggers the guarded close (macOS convention: dot stands in for ×). Middle click and `Cmd+W` behave identically because they all route through `TabStore.close`.

### D5: Re-check dirty state after the dialog resolves
A pending autosave or a manual edit may resolve the dirty state while the dialog is open. The guard re-reads `document.dirty` after the user picks `save`/`discard`; if the document became clean, the tab closes without writing. This prevents overwriting a just-saved state with a stale decision.

### D6: Autosave errors reuse the status surface
A failed autosave dispatches an error status message (same path as `showError`) and leaves the document dirty. No retry loop: the next edit re-arms the timer.

## Risks / Trade-offs

- [Tauri `onCloseRequested` veto may require missing capability permissions] → verify in the first implementation task; fall back to adding `core:window:allow-close` / `deny-close` toggling to the capabilities file.
- [Autosave may write while an external editor holds unsaved changes to the same file] → accepted: existing behavior already overwrites external changes on manual save; document this as known behavior rather than building conflict UI now.
- [Debounce timers per document add bookkeeping to the extension] → one `setTimeout` handle per open document in the debouncer, cleared on save/close; no scheduler dependency.
- [In-app modal is invisible if the webview is unresponsive at quit time] → accepted; the OS-level veto still prevents data loss because the close is prevented until the decision resolves.
- [`Cmd+W` in Tauri may close the window natively before the keydown handler sees it on macOS] → verify behavior; if the OS intercepts `Cmd+W`, register a menu accelerator or rely on the window-close guard, which covers the same path.
