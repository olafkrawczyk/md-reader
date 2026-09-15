## Why

There is no lightweight, native-feeling Markdown reader/editor for macOS whose feature set is open rather than fixed. Existing tools either bundle heavy runtimes (Electron-class), lock features into the product, or both. We want a small stable core where every product feature — including the reading view, the editor, and the sidebar — is an extension loaded through a single public contract, so any capability a user wants can be added without touching core.

## What Changes

Greenfield build of the app in three layers:

- **Tauri 2 shell (Rust)** for a native macOS window at ~5-10MB, with webview (WKWebView) as the UI and extension runtime, and Rust acting only as a capability broker (folder open, fs watch, future gated commands).
- **Tiny core with zero product opinions**: document model (text + path + version + dirty), workspace (open folder, file tree, watch, events), pane/layout engine (regions, splittable panes, layout presets), extension host (manifests, `activate(api)` entry, typed service registry, schema-driven settings store), and a theme-token contract.
- **Built-in extension pack shipped through the same `activate(api)` contract as future external extensions**:
  - `@mdr/markdown` — claims `text/markdown`: remark parsing, AST cache service
  - `@mdr/editor` — edit pane (CodeMirror 6) with Markdown syntax highlighting
  - `@mdr/reader` — reading pane with Atkinson Hyperlegible / Lexend font switching, rendered via the AST pipeline
  - `@mdr/sidebar` — file tree pane over the workspace
  - `@mdr/gfm` — transformer: tables, strikethrough, task lists
  - `@mdr/shiki` — transformer: code block syntax highlighting in rendered output
  - `@mdr/theme` — default look, font setting contribution
- **Modes are layout presets, not core concepts**: read = `[sidebar, reader]`, edit = `[sidebar, editor]`, split = `[sidebar, editor, reader]`, contributed by extensions.
- **Validity spike first**: verify WKWebView can `import()` an ES module served from a Tauri custom URI protocol (`mdext://`-style) with correct MIME type; blob-URL import as fallback. This assumption underpins runtime extension loading; it is proven before the platform is built on it.

Deferred (north star, explicitly out of scope for this change): npm-registry installation, external extension discovery, permission-gated dangerous commands, semver range enforcement. The `activate(api)` contract and manifest shape are designed so bundled and externally-loaded extensions are indistinguishable — only the module URL differs.

## Capabilities

### New Capabilities

- `app-shell`: Tauri 2 native macOS window, menu, folder-open dialog, custom URI protocol for serving extension modules
- `workspace`: open a folder, expose its file tree (nested), watch for changes, emit document open/change events, document model (text, path, version, dirty state)
- `pane-engine`: pane registration with declared viewable document types, named regions (sidebar/main), splittable layouts, layout presets ("read", "edit", "split"), pane focus/keyboard routing
- `extension-platform`: manifest + `activate(api)` lifecycle, typed service registry (register/consume by key), transformer pipeline attachment, schema-driven settings contributions and generic settings UI, theme-token contract, single-React-instance rule
- `markdown-reading`: rendered reading pane — headings/text/tables/code blocks with syntax highlighting, Atkinson Hyperlegible and Lexend fonts switchable via a setting
- `markdown-editing`: source editing pane — monospace font, Markdown syntax highlighting, dirty tracking and save

### Modified Capabilities

(none — greenfield)

## Impact

- New codebase: Tauri 2 app (Rust shell) + React/TypeScript frontend; no existing code affected.
- Key dependencies: `@tauri-apps/api` + `tauri` crate, React (single instance owned by core and exposed to extensions), CodeMirror 6 (`@codemirror/lang-markdown`), unified/remark/rehype pipeline, Shiki.
- Biggest technical risk: WKWebView ES-module loading from a Tauri custom protocol — validated by spike before any platform work.
- Hardest-to-reverse contract: the pane component contract (what a pane receives from the host). Designed against exactly three consumers (sidebar, editor, reader) before being declared stable.
- Scroll sync between editor and reader panes in split mode remains an open design question for design.md.
