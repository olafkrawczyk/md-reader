## 1. Opener plugin (Rust + capability + npm)

- [x] 1.1 Add `tauri-plugin-opener` to `src-tauri/Cargo.toml`, register `.plugin(tauri_plugin_opener::init())` in `lib.rs`, and grant `opener:default` in `src-tauri/capabilities/default.json`
- [x] 1.2 Install `@tauri-apps/plugin-opener` via npm

## 2. Reader link handling

- [x] 2.1 In `reader.tsx`, add a delegated `click` listener (per document, same pattern as task ticks): on any anchor click `preventDefault()`; when the raw `href` starts with `http://`, `https://`, or `mailto:` (case-insensitive), call `openUrl(href).catch(...)`; all other links are inert
- [x] 2.2 Confirm the listener coexists with the task-tick listener and the memoized reader element (no innerHTML writes, no listener loss across re-renders)

## 3. Verification

- [x] 3.1 Automated (`tests/link-handling.mjs`, Playwright with a stubbed opener IPC): http/https/mailto clicks call the opener with the exact URL and do not navigate; relative links do nothing; the page URL is unchanged after every click
- [x] 3.2 Rust side compiles: `cargo check` in `src-tauri`
- [x] 3.3 Lint, typecheck, existing suites (naming, ticks, reading, safety), build all pass
