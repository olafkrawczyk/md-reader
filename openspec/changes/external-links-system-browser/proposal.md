## Why

Clicking a web link in the reader navigates the WKWebView away from the app — remote content renders inside md-reader, and a broken/unreachable link crashes the webview. External URLs must go to the system browser; the app webview must never navigate. (Reported as a live crash; reference `02436b0d`.)

## What Changes

- **Add the Tauri opener plugin** (Rust crate, npm package, capability permission) as the sanctioned way to hand URLs to the OS.
- **Intercept link clicks in the reading pane**: clicks on `http`/`https` anchors are handed to the system browser via `openUrl`; `mailto:` is also delegated. The webview itself never navigates — `preventDefault` on every in-reader anchor click, including relative/file links (which the app does not resolve in this change; they are ignored rather than risking an in-app navigation).
- Link handling is read-pane only; CodeMirror link handling stays out of scope.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `markdown-reading`: New requirement for external link handling in the reading pane.

## Impact

- `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json` — opener plugin registration + permission.
- `package.json` — `@tauri-apps/plugin-opener` dependency.
- `src/extensions/reader.tsx` — delegated click listener for anchors.
- `tests/` — link-handling harness (stubbed opener IPC).
