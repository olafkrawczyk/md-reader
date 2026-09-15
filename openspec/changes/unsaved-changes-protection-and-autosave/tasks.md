## 1. Core safety module

- [x] 1.1 Create `src/core/safety/` with a `closeGuard` service: an injectable handler interface (`(documents) => Promise<"save" | "discard" | "cancel">`) plus a module-level registration point the shell can bind the modal to
- [x] 1.2 Create the autosave debouncer in `src/core/safety/autosave.ts`: subscribes to open documents, resets a per-document timer on every change, saves after the configured idle delay, cancels on explicit save or document close, exposes start/stop and current-settings injection
- [x] 1.3 Route autosave and save failures to the shell status surface as error messages, leaving the document dirty

## 2. Guarded close path

- [x] 2.1 Make `TabStore.close` consult the close guard when the document is dirty; implement save-then-close, discard, and cancel outcomes per design D2/D5 (re-check dirty after the dialog resolves)
- [x] 2.2 Make the dirty marker in `TabStrip` clickable to trigger the guarded close (design D4); verify middle click and `Cmd+W` route through the same guard
- [x] 2.3 Build the Save / Discard / Cancel modal in the shell using design-system controls, registered as the close-guard handler; wire `Cmd+W`-on-last-tab through the guard

## 3. Window close interception

- [x] 3.1 Intercept window close with `getCurrentWindow().onCloseRequested`; prevent-close while any open document is dirty, run the guard over all dirty documents, save all on `save`, and `destroy()` only after the decision; add capability permissions if missing
- [ ] 3.2 Verify `Cmd+W`/`Cmd+Q` behavior on macOS with the Tauri window (design risk): if the OS intercepts `Cmd+W`, ensure the window-close guard covers it

## 4. Autosave extension and settings

- [x] 4.1 Create the `@mdr/document-safety` built-in extension contributing `autosave` (boolean, default on) and `autosaveDelay` (number, default 1, bounds 1–60, step 1) settings, registered in the builtin pack
- [x] 4.2 Wire the debouncer to the settings values on activation so toggling autosave or changing the delay applies live; ensure the debouncer stops saving while disabled
- [x] 4.3 Render the settings rows via the existing settings mechanism (switch + stepper) with correct labels and group (satisfied by the generic settings renderer — no per-setting code needed)

## 5. Verification

- [x] 5.1 Cover the debouncer, guard decisions, and dirty re-check (D5) with unit tests (`src/core/safety`)
- [ ] 5.2 Manual pass: type-then-idle save, continued typing postpones save, dirty tab close with each dialog choice, window close with dirty docs (save/cancel), quit with clean docs closes without prompt
- [x] 5.3 Run `npm run lint`, `npm run typecheck`, and `npm run build` clean
