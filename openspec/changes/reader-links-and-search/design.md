## Context

See `proposal.md` for the motivation and business value behind these three features.

`md-reader` is built as a Tauri v2 desktop application using React 19, an extensible plugin/service platform (`src/core/extension`), a unified/remark Markdown processing pipeline (`src/extensions/markdown.ts`), and a CodeMirror 6 editor (`src/extensions/editor.tsx`). Native operations run in Rust (`src-tauri`) with `rayon` available for parallel execution.

Currently, the reading experience provides font size, tint, line height, and reading measure controls. The editor handles basic markdown input. Document tabs manage open buffers, and workspace file scanning runs via Tauri bridge commands. There is currently no cross-document link resolution, heading outline navigation, or multi-file text search in the Rust backend.

## Goals / Non-Goals

**Goals:**
- Provide a responsive Outline / TOC navigation pane and quick-jump popover that extracts headings and tracks scroll position in real time.
- Implement zero-database bidirectional linking with `[[wikilink]]` syntax parsing, auto-completion in the editor, and a reactive Backlinks context pane.
- Implement a high-performance native Rust text search command returning contextual snippets, line numbers, and file paths with sub-second execution across large workspaces.
- Extend reading comfort with a non-destructive Focus / Dimming mode and optional bionic reading typography.

**Non-Goals:**
- Introducing SQLite, embedded vector databases, or heavy background daemons. All indexing remains lightweight, local-first, and in-memory.
- Supporting non-Markdown document linking or graph visualization canvases.
- Cloud syncing or remote telemetry of document contents or search queries.

## Decisions

### 1. Document Heading Extraction and Outline Synchronization
- **Decision:** Extract headings during the AST parsing pipeline in `@mdr/markdown` using a remark plugin, and emit an outline metadata structure attached to the active document state. In the editor, extract headings from the CodeMirror syntax tree.
- **Rationale:** Ensures heading structure is always synchronized with the current document content without re-parsing the document from scratch on every scroll.
- **Alternatives Considered:** 
  - *Regex parsing on the raw string:* Fragile with code blocks and multi-line comments.
  - *DOM scraping of rendered preview:* Unavailable in editor-only mode and subject to DOM layout delays.

### 2. Zero-Database In-Memory Backlink Indexing
- **Decision:** Maintain a lightweight in-memory `LinkIndexService` in the extension platform. When a workspace folder opens, an initial background scan parses wikilinks (`[[target]]` and `[[target|alias]]`) from all `.md` files. When a document changes or saves, only its entries are re-indexed.
- **Rationale:** Keeps files 100% portable plain Markdown without sidecar databases or hidden lock files, while providing instantaneous lookup for the Backlinks pane and editor auto-completion.
- **Alternatives Considered:**
  - *Persistent SQLite index:* Adds complexity, migration overhead, and cache invalidation bugs when files are edited outside `md-reader`.
  - *Scanning on demand:* Incurring full workspace disk scans on every tab switch would feel sluggish in workspaces with thousands of files.

### 3. Rust-Native Parallel Workspace Search Command
- **Decision:** Implement `workspace_search` in `src-tauri/src/workspace.rs` using `rayon` and Rust's streaming file I/O to walk files in parallel, filtering out ignored folders (`.git`, `node_modules`, hidden dirs) and matching lines case-insensitively.
- **Rationale:** Bypasses webview JS string processing bottlenecks, executing searches at native ripgrep speeds and returning structured match items (`path`, `line_number`, `line_content`, `match_indices`) directly to the frontend.
- **Alternatives Considered:**
  - *Frontend web-worker search:* Slower file reading across the Tauri IPC bridge and high webview memory consumption.

### 4. CSS-Driven Focus and Reading Enhancements
- **Decision:** Implement Focus / Dimming mode via an `IntersectionObserver` on reading pane section containers that attaches an `is-focused` class to the dominant block, applying CSS transitions to dim surrounding blocks. In the editor, apply CodeMirror viewport line decorations.
- **Rationale:** Smooth 60fps performance without re-rendering React trees on scroll.
- **Alternatives Considered:**
  - *React scroll event listener with continuous state updates:* Causes frame drops and layout thrashing during fast scrolling.

## Risks / Trade-offs

- **[Risk] Large workspaces (10,000+ files) slow down initial link indexing.**  
  → *Mitigation:* Background indexing runs asynchronously after app load with debounced batches, excluding ignored paths by default.

- **[Risk] Scroll position mismatch between Reader and Editor when jumping from Outline.**  
  → *Mitigation:* Normalize heading anchor IDs using standard GFM slugging across both reading pane DOM elements and CodeMirror line positions.

- **[Risk] Wikilink ambiguity when files share identical basenames in different subdirectories.**  
  → *Mitigation:* Resolve shortest unambiguous relative path; display disambiguating directory paths in the completion popup and link resolution tooltip.
