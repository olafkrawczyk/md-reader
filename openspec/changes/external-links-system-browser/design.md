## Context

- Nothing intercepts anchor clicks in the reader; rendered `<a href="https://…">` elements navigate the WKWebView (in-app remote rendering; a failed navigation crashes it). The reader already has the delegated-listener pattern from task ticks.
- No opener/shell plugin exists yet: Cargo.toml has dialog/cli/single-instance only; capabilities grant `core:default`, window dragging, dialog, cli.
- `tauri-plugin-opener` is the current Tauri-sanctioned plugin (`openUrl` → system browser/handler). The npm side is `@tauri-apps/plugin-opener`.
- CSP is `null` (no restrictive policy), so no policy change is needed for delegation — the webview never fetches the target at all.

## Goals / Non-Goals

**Goals:**
- The webview is navigation-proof from rendered content.
- http/https/mailto reach the OS handler.

**Non-Goals:**
- Resolving relative markdown links to workspace files (a future change; today they are inert rather than risky).
- Link handling in the editor pane.
- URL validation beyond scheme checking — the OS browser owns error surfacing.

## Decisions

### D1 — Opener plugin, not window.open

`@tauri-apps/plugin-opener`'s `openUrl` hands the URL to the OS explicitly and is auditable via capability permissions. `window.open` in WKWebView is unreliable (popups/blocks) and still webview-adjacent. Rust side: `tauri_plugin_opener::init()` after the dialog plugin; capability gains `opener:default`.

### D2 — One delegated listener; scheme is the switch

In `reader.tsx`, a delegated `click` listener on the reader container (same pattern as task ticks): find `closest("a[href]")`; always `preventDefault()`; if the `href` starts with `http://`, `https://`, or `mailto:`, call `openUrl(href)` (fire-and-forget with a `.catch` to console — the OS surfacing errors keeps the app quiet). Everything else is swallowed by design (non-goal: relative-link resolution). Merging into the task-tick listener was rejected: separate effects keep each feature's cleanup self-contained and the listener keyed on `document` (the container persists across content swaps; anchor listeners don't need the html-dep dance because they attach once per document and the container node survives re-renders — verified by the task-tick debugging).

### D3 — Scheme check on the raw `href`

Parse cheaply: read the `href` attribute's leading scheme (case-insensitive) rather than constructing `new URL(...)` and catching — anchors in rendered markdown have absolute hrefs from remark, but user HTML may not, and a malformed href must simply be ignored, not throw. `preventDefault` happens before any scheme check so nothing navigates regardless.

## Risks / Trade-offs

- [Relative links silently do nothing] → Documented non-goal; strictly better than the current navigate-and-crash behavior. A future change can resolve them against the workspace.
- [Opener plugin expands capability surface] → Limited to `opener:default`; the plugin is Tauri's maintained path.
- [Clicks inside code blocks with `href`s] → Same handling; no special-casing needed since anchors are anchors.

## Migration Plan

Single PR across Rust + frontend; `npm install` and `cargo` fetch on pull. Rollback is a revert of both sides. Order: plugin registration → capability → npm dep → reader listener → tests.

## Open Questions

None.
