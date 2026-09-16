## Why

Markdown desktop applications typically prioritize either raw editing (VS Code, code editors) or centralized database-backed personal knowledge management (Obsidian, Notion), leaving Markdown consumption and navigation utilitarian and cramped. `md-reader` has the opportunity to establish an unrivaled "reader-first" value proposition without compromising its local-first, privacy-respecting, zero-telemetry DNA.

By combining long-form reading ergonomics, zero-database bidirectional linking with a backlinks context pane, and native Rust-powered workspace search, `md-reader` transforms from a capable file viewer into a distraction-free, high-performance knowledge exploration environment for technical documentation, notes, and specifications.

## What Changes

- **Reader-First Long-Form Ergonomics**:
  - Add a dynamic **Document Outline / Table of Contents** pane and popover that automatically indexes headings (H1–H6) in the active document, tracks scroll position, and enables instant jumps.
  - Introduce a **Focus / Dimming Mode** that dims non-active paragraphs and sections to reduce visual distractions during focused reading.
  - Expand reading comfort with an enhanced typography engine supporting bionic reading and optimal reading line-measures.

- **Zero-Database Bidirectional Linking & Context Pane**:
  - Implement parsing and live rendering for `[[wikilinks]]` in both reader and editor modes without altering file format or relying on a database.
  - Support automatic link target resolution to markdown files across the open workspace.
  - Add a dedicated **Backlinks & Context Pane** that displays incoming references and unlinked mentions for the active document.
  - Provide inline auto-completion for `[[...]]` targets when editing documents.

- **Native Rust-Powered Workspace Search**:
  - Add a high-performance workspace-wide text search command in the Tauri Rust backend leveraging fast file walking and pattern matching.
  - Provide instant multi-file search results with contextual lines, line numbers, and match highlights.
  - Support jumping directly from search results to specific document lines and tabs.

## Capabilities

### New Capabilities
- `document-outline`: Dynamic table of contents and outline navigation extracted from document headings with scroll tracking and jump targets.
- `bidirectional-links`: Parsing, auto-complete, and navigation for `[[wikilinks]]`, along with a Backlinks & Context pane showing incoming document references and unlinked mentions.
- `workspace-search`: Fast multi-file search executed in the native Rust backend returning matching files, lines, and surrounding context.

### Modified Capabilities
- `reading-experience`: Add focus/dimming mode requirements to highlight the current reading block and reduce peripheral visual noise.

## Impact

- **Frontend & Extensions**:
  - New extensions and panes: `outline`, `backlinks`, and an enhanced `search` UI.
  - AST pipeline (`src/extensions/markdown.ts`, `remark` pipeline): Add wikilink tokenizer/transformer and heading extraction plugin.
  - CodeMirror extensions: Add wikilink completion and styling extensions to editor.
- **Tauri Rust Backend (`src-tauri`)**:
  - New Tauri commands in `src-tauri/src/workspace.rs` for fast workspace-wide text search and file pattern scanning.
- **Dependencies**:
  - Rust crate additions if needed (e.g., `ignore` or `grep-searcher` / `regex` for streaming search).
  - No database or network dependencies introduced; remains 100% offline and local-first.
