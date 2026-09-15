## 1. Spike — WKWebView ESM from custom protocol (gate for everything)

- [x] 1.1 Scaffold minimal Tauri 2 app (Rust shell + React/TS frontend) that opens a native macOS window
- [x] 1.2 Register a custom URI protocol in Rust serving a `.js` file from a local directory with `text/javascript` MIME type
- [x] 1.3 Verify in the webview: dynamic `import()` of the served module succeeds and its exports are callable
- [x] 1.4 If custom-scheme import fails: verify blob-URL fallback (fetch via Tauri command → `URL.createObjectURL` → import) and record which path works in design.md (D9 outcome)

## 2. Project setup

- [x] 2.1 Set up repo structure: `src/core`, `src/extensions/*` (built-in pack), Rust `src-tauri`; TS strict config, no `any`, lint
- [x] 2.2 Add dependencies: React (single instance, owned by core), CodeMirror 6, unified/remark/rehype, Shiki; verify only one React copy resolves

## 3. Core — extension host (first, since built-ins are extensions)

- [x] 3.1 Manifest type + extension loader for build-time-bundled ESM modules; identical code path for future external modules (module source abstracted)
- [x] 3.2 `activate(api)` lifecycle: activate all built-ins once at startup; an extension that throws is isolated (app continues, others activate)
- [x] 3.3 API object: registration functions (panes, services, transformers, settings, presets) exposed to extensions; React handed to extensions from core (no second React)
- [x] 3.4 Typed service registry: register/consume by key, late-consumption subscription (fires when service appears, order-independent)
- [x] 3.5 Transformer pipeline registry per document type: attach + deterministic run order (record ordering semantics chosen in design.md open question 3)

## 4. Core — workspace and document model

- [x] 4.1 Folder-open via native dialog → active workspace
- [x] 4.2 File tree over the workspace (nested, any depth) exposed to the UI
- [x] 4.3 FS watcher: external add/remove/rename reflected in the tree; open-document deletion signals views
- [x] 4.4 Document model: load text + path, save back to path, version increment on change, dirty flag set/cleared
- [x] 4.5 Document type registry: files map to a type; unclaimed types open as plain text

## 5. Core — pane and layout engine

- [x] 5.1 Pane registration (component + declared viewable document types) without core changes
- [x] 5.2 Layout engine: sidebar + main regions, splittable main region with draggable, session-persistent divider
- [x] 5.3 Layout presets as contributed data: read / edit / split; preset switcher as contributed UI; document survives preset switch; read is default on first open
- [x] 5.4 Document routing: opened document displayed in a pane declaring its type viewable
- [x] 5.5 Pane host contract v0 (props/context for document, focus, keyboard routing) — mark experimental; revisit after all three built-in panes exist

## 6. Core — settings and theme tokens

- [x] 6.1 Schema-driven settings store: extensions contribute schema; namespaced KV persistence
- [x] 6.2 Generic settings UI rendering all contributions (choice/boolean/text); changes apply live, no restart
- [x] 6.3 Theme token set + default theme; tokens exposed as CSS variables extensions style against

## 7. Built-in extension pack

- [x] 7.1 `@mdr/markdown`: claim `text/markdown`, remark parse with source positions, register `md:parse` and `md:ast-cache` services (cache invalidated on document change)
- [x] 7.2 `@mdr/editor`: edit pane on CodeMirror 6, `@codemirror/lang-markdown` syntax highlighting, monospace theme; edits set dirty; save via workspace; responsive on multi-thousand-line docs
- [x] 7.3 `@mdr/reader`: reading pane rendering remark AST via rehype — headings, emphasis, lists, links, blockquotes, tables; consumes `md:ast-cache`; re-renders on document change
- [x] 7.4 `@mdr/gfm`: transformer into the markdown pipeline (tables, strikethrough, task lists)
- [x] 7.5 `@mdr/shiki`: transformer highlighting fenced code blocks by declared language; plain monospace fallback for unlabeled blocks
- [x] 7.6 `@mdr/sidebar`: file-tree pane over workspace tree; click opens document via routing
- [x] 7.7 `@mdr/theme`: default look + reading-font setting (Atkinson Hyperlegible, Lexend) applied live to the reading pane

## 8. App assembly and verification

- [x] 8.1 Wire full flow: open folder → tree in sidebar → click `.md` → read preset; switch to edit and split presets; same document in both split panes
- [x] 8.2 Verify every spec scenario in `specs/` against the running app; fix gaps
- [x] 8.3 Extension-isolation check: force-throw in one built-in's activate; app and remaining extensions unaffected
- [x] 8.4 Mark extension API + pane contract as `@unstable` in code and docs; record design.md open-question outcomes (scroll sync, pane contract) as resolved or follow-up notes
