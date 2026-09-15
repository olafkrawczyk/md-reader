## 1. CLI argument capture (Rust)

- [x] 1.1 Add `tauri-plugin-cli` and `tauri-plugin-single-instance` to `src-tauri/Cargo.toml` and register them in `src-tauri/src/lib.rs`
- [x] 1.2 Add `cli:default` and `single-instance:default` permissions to `src-tauri/capabilities/default.json`
- [x] 1.3 In `lib.rs` setup, read CLI matches, resolve the path argument to an absolute path, classify file vs folder, and emit a `cli-open` event (`{ path, kind }`) to the frontend after the window loads (defer emission until frontend ready, e.g. emit-on-listen)
- [x] 1.4 In the single-instance plugin callback, take the forwarded path argument, apply the same resolve/classify logic, and emit `cli-open` to the existing window

## 2. Frontend open routing

- [x] 2.1 Add a `cli-open` event listener in `App.tsx` (or a small module under `src/core/workspace/`) that, for a folder, calls `api.workspace.openFolder(path)` and reactivates the default layout preset (mirroring `handleOpenFolder` without the dialog)
- [x] 2.2 For a file, activate the parent folder as workspace then open the file as the active document via the existing tab store (`api.tabs.open` / `DocumentRouter`)
- [x] 2.3 Handle failure gracefully: nonexistent/unreadable path surfaces the existing status-bar error tone instead of throwing

## 3. Launcher arg forwarding

- [x] 3.1 Update `scripts/launch-md-reader` to forward arguments: direct execution of the bundle's inner binary when a path argument is present (resolving relative paths like `./` to absolute first), plain `open` with no arguments
- [x] 3.2 Verify the `md-reader` PATH shim still works unchanged after reinstall (no install-script changes expected)

## 4. Toolbar leading-controls alignment

- [x] 4.1 In `src/App.tsx`/`src/theme.css`, replace the fixed 80px `--mdr-traffic-inset` approach with clearance that keeps the sidebar-toggle and open-folder controls grouped immediately after the traffic lights, vertically centered, with consistent spacing
- [x] 4.2 Confirm the drag regions still move the window and do not cover the leading controls (clicks on the buttons must not drag)
- [x] 4.3 Verify no overlap/clickability loss at the minimum window width (640px) and with sidebar open/closed

## 5. Verification

- [x] 5.1 Run `npm run lint` and `npm run typecheck` clean
- [x] 5.2 Build and reinstall: `npm run build:app && npm run install:app`
- [ ] 5.3 Scenario checks against the distribution delta: `md-reader` (no arg) preserves workspace; `md-reader <file>` opens parent folder + file; `md-reader <folder>` and `md-reader ./` open the folder; each variant exercised cold (app closed) and warm (app running, foregrounds and opens path)
- [ ] 5.4 Scenario check against the app-shell delta: traffic lights on their own top row, controls starting left-aligned on the row below, no overlap at min width

## 6. Follow-up from user review

- [x] 6.1 Restructure toolbar into two rows in `src/App.tsx`/`src/theme.css`: full-width title-bar band (~28px, drag region) hosting the traffic lights, controls row below starting left-aligned; remove `--mdr-traffic-inset`
- [x] 6.2 Add `--help`/`-h` handling to `scripts/launch-md-reader` printing usage to the terminal without launching the app
- [x] 6.3 Update delta spec (app-shell), design decisions 4–5, and proposal to match the two-row layout and launcher-level help
- [x] 6.4 Rebuild, reinstall, re-verify lint/typecheck, `md-reader --help` output, and single-instance cold/warm behavior
