## 1. Reader-First Long-Form Ergonomics

- [x] 1.1 Add heading extraction AST utility in markdown pipeline to collect H1-H6 nodes with titles, line positions, and slugs
- [x] 1.2 Implement the Outline pane component rendering hierarchical headings with indentation and item click handlers
- [x] 1.3 Implement scroll tracking in reader and editor panes to synchronize and highlight the currently active heading in the outline
- [x] 1.4 Register the Outline pane contribution in the extension platform and add a toggle button to the reader toolbar
- [x] 1.5 Implement Focus/Dimming mode in reader pane using an IntersectionObserver to dim non-active document sections
- [x] 1.6 Add Focus mode setting and toggle control in reading experience settings
- [x] 1.7 Implement optional Bionic Reading typography transformer highlighting initial word fixations in the reading pane

## 2. Zero-Database Bidirectional Linking

- [x] 2.1 Implement `remark-wiki-link` or custom AST tokenizer to parse `[[target]]` and `[[target|alias]]` syntax
- [x] 2.2 Add in-memory `LinkIndexService` in the extension platform to scan markdown files in workspace and index link relationships
- [x] 2.3 Wire workspace folder open and file change events to update the `LinkIndexService` incrementally
- [x] 2.4 Render interactive wikilinks in reading pane that resolve target files and open them via document tabs
- [x] 2.5 Implement Backlinks & Context pane displaying incoming document references and snippet previews
- [x] 2.6 Register Backlinks pane contribution in the extension platform
- [x] 2.7 Implement CodeMirror completion extension providing auto-complete suggestions when typing `[[` in editor

## 3. Native Rust-Powered Workspace Search

- [x] 3.1 Implement `workspace_search` Tauri command in `src-tauri/src/workspace.rs` using parallel traversal to scan markdown files
- [x] 3.2 Ensure `workspace_search` filters out ignored paths (`.git`, `node_modules`, hidden directories) and binary files
- [x] 3.3 Register `workspace_search` command in Tauri invoke handler in `src-tauri/src/lib.rs`
- [x] 3.4 Create search service bridge in frontend to invoke `workspace_search` and return structured match results
- [x] 3.5 Build workspace search results UI displaying grouped file matches with line numbers, snippets, and highlights
- [x] 3.6 Implement match click handling to open the target document tab and center the viewport on the matching line

## 4. Layout Presets and Integration Verification

- [x] 4.1 Update layout presets in `src/extensions/presets.tsx` to offer dedicated "Reader Focus" and "Research / Knowledge" layouts
- [x] 4.2 Run linter and typecheck across frontend and backend (`npm run lint`, `npm run typecheck`, `cargo check`)
- [x] 4.3 Add unit and integration tests verifying outline extraction, link index resolution, and search result navigation
