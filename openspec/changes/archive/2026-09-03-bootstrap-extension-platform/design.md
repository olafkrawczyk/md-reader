## Context

Greenfield; no existing code or specs. The proposal (`proposal.md`) fixes the architecture stance: Tauri 2 shell on macOS, WKWebView as both UI and extension runtime, Rust as capability broker, a product-opinion-free core, and a built-in extension pack that dogfoods the public extension contract from day one. Npm-registry installation is a north star explicitly out of scope.

## Goals / Non-Goals

**Goals:**
- A `activate(api)` + manifest contract stable enough that bundled built-ins and future `mdext://`-loaded extensions are indistinguishable
- Core small enough to audit in an afternoon: document model, workspace, pane engine, extension host, service registry, settings store, theme tokens
- Prove the WKWebView-ESM-from-custom-protocol assumption before building anything on it
- A pane component contract derived from exactly three real consumers (sidebar, editor, reader) before being declared stable

**Non-Goals:**
- Extension installation/discovery (npm registry, in-app browser, CLI)
- Permission gating of dangerous Rust commands, semver-range enforcement
- Sandboxed extension execution (local-trust model, like pi/VS Code desktop)
- Anything but macOS in this change

## Decisions

### D1 — Tauri 2, WKWebView as the extension runtime
Extensions are npm-style JS/TS modules; the webview is already a full ESM runtime, so no embedded engine (QuickJS), WASM host, or Node sidecar is shipped. Rust's role is loader/broker: custom URI protocol serving extension files, fs access, future gated commands.
*Alternatives:* Electron (full Node, but ~150MB and non-native feel), embedded QuickJS via rquickjs (sandboxed but headless — can't host UI panes), WASM/Zed model (best sandbox, wrong ecosystem — extensions would not be npm modules), Node sidecar (+40-60MB, lifecycle complexity).

### D2 — Extension host lives in the webview, in-process with the UI
Built-in extensions are build-time-bundled ESM modules; external ones (later) are served via `mdext://<id>/<file>` from `~/.config/md-reader/extensions/`. Both go through identical `activate(api)`. Trust posture: extensions run unsandboxed in the webview, same as pi — accepted for a local tool.
*Alternative:* separate extension process with IPC — deferred until a security story is actually needed.

### D3 — Inter-extension communication via typed service registry, never direct imports
`@mdr/reader` consumes `"md:ast-cache"` registered by `@mdr/markdown`. Direct imports between extensions would make replaceability (the whole point) impossible. Registry supports late consumption: consumers subscribe to a key and fire when the service appears, since activation order is unguaranteed.

### D4 — Modes are layout presets, contributed data
`read = { sidebar, main:[reader] }`, `edit = { sidebar, main:[editor] }`, `split = { sidebar, main:[editor, reader] }`. Core knows regions and pane slots, not modes. The mode switcher is itself contributed UI.

### D5 — Editor: CodeMirror 6
TS-native, small, first-class `@codemirror/lang-markdown` for syntax highlighting, and its own extension system mirrors the app's philosophy one level down. `@mdr/editor` should surface CM extensions as a service so future extensions (e.g. vim mode) can enhance the editor without forking it.
*Alternatives:* Monaco (too heavy, poor mac feel), textarea+highlight overlay (rebuilds a solved problem).

### D6 — Reading render: unified/remark → rehype pipeline; Shiki for code blocks
The remark AST is the `md:ast-cache` service (with source positions retained for future scroll sync); transformers (`@mdr/gfm`, `@mdr/shiki`) attach to this pipeline, dogfooding the transformer extension point. Shiki over Prism/HIGHLIGHT.js for accuracy and theme-ability.
*Alternative:* a monolithic renderer — rejected because it would leave the transformer extension point unexercised.

### D7 — Single React instance owned by core
Extensions register React components but must not bundle their own React (hooks break across copies). Core exposes its React through the extension API/import surface. Same discipline later for CodeMirror (editor-owned, exposed as a service).

### D8 — Settings: schema contributions, generic renderer
`@mdr/theme` contributes the reading-font choice (Atkinson Hyperlegible / Lexend). Core stores namespaced KV and renders one settings UI from schemas. Extensions never ship their own settings screens.

### D9 — Spike first: custom-protocol ESM in WKWebView — RESOLVED
One-evening spike: `register_uri_scheme_protocol` serving a `.js` file with `text/javascript` MIME, dynamic `import()` of it, call an export. Fallback if WebKit refuses module loading from a custom scheme: fetch code via a Tauri command → `URL.createObjectURL` → import the blob URL. The platform design is only finalized after the spike outcome.

**Outcome (spike run 2026-09-03):** custom scheme works. `mdext://<id>/<file>` served from `~/.config/md-reader/extensions/` with `text/javascript` + `Access-Control-Allow-Origin: *` headers; WKWebView (Tauri 2 dev page on `http://localhost:1420`) dynamically imported the module and a callable export returned the expected value (`greet("spike") → "hello, spike"`). The blob-URL fallback was **not needed**; the Tauri command fetch path (`read_extension_source`) remains in the spike code as an insurance path but is not load-bearing. External extension loading via `mdext://` proceeds.

## Risks / Trade-offs

- [WKWebView may reject ESM `import()` from a custom scheme (the load-bearing assumption)] → spike before any platform code; blob-URL fallback designed in D9; worst case, built-ins stay bundled and external loading waits on a WebKit fix
- [Extension API churn while building the built-in pack] → accepted deliberately; every painful built-in is API feedback at its cheapest moment; API marked unstable until the pack is complete
- [Pane component contract frozen too early hurts third-party panes forever] → contract derived from exactly three consumers (sidebar, editor, reader) and marked experimental until all three feel natural
- [Scroll sync in split mode could force pane-coupling into core] → keep it out of core; resolved via pane-level `reveal`/`onScroll` capabilities wired by the split preset or a small sync extension (see Open Questions)
- [In-process extensions can tamper with the whole UI] → accepted local-trust model, documented; permission-gated Rust commands are the north-star mitigation
- [Multiple bundled React copies creep in via dependencies] → single-instance rule (D7) enforced by import surface + review

## Migration Plan

Greenfield — no migration. Build order de-risked as: spike (D9) → core (document model, workspace, pane engine, extension host) → built-in extension pack (markdown, editor, reader, sidebar, theme, gfm, shiki) → polish (fonts, presets UX). Rollback is trivial at every stage until external extension loading exists; the spike result decides whether the `mdext://` path proceeds or external loading is deferred.

## Open Questions

- Scroll sync in split mode: proportional scroll via source positions, or discrete reveal-on-cursor-move? Deferrable — split preset ships usable without sync, sync lands as a follow-up. **RESOLVED as follow-up (2026-09-03, task 8.4):** ships without sync; the remark AST already retains source positions, so a future sync extension can wire pane-level scroll/cursor events without core changes. Tracked as a follow-up, not a blocker.
- Exact pane host contract surface (props vs context vs hooks for focus/keyboard routing): decided while building the three built-in panes, before the contract is documented as stable. **RESOLVED for v0 (2026-09-03, task 8.4):** React context (`usePaneHost()`) exposes `{ document, focused, requestFocus, setKeyHandler }`; document routing flows through a core `DocumentRouter` store. Contract ships `@experimental` — revisit after real third-party-pane pressure; all three built-ins (sidebar, editor, reader) consume it naturally.
- Transformer ordering semantics — RESOLVED (2026-09-03, task 3.5): **priority number, lower runs first; ties broken by attachment order**. The registry buffers attachments made before a document type's pipeline is claimed and flushes them on claim, so ordering is independent of activation order. Rationale: a numeric default is predictable and costs nothing to implement; explicit before/after constraints are only worth their complexity if a real conflict surfaces while wiring `@mdr/gfm` + `@mdr/shiki` — escalate then if needed. **Outcome while wiring (task 7.4/7.5):** the conflict did surface — `@mdr/gfm` re-parses the tree (priority 0) and must run before `@mdr/shiki` (priority 10), which rewrites code-block nodes in place; priorities express this cleanly, no before/after constraints needed.
