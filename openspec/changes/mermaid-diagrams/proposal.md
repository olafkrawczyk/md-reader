# Mermaid Diagrams

## Why

Notes and docs routinely carry diagrams as ```` ```mermaid ```` fences (GitHub, Obsidian and most doc sites render them). In md-reader they currently show as unlabeled monospace text in the reader and as unhighlighted text in the editor. Rendering them — and helping the user write them — closes a visible gap with the tools the same files are read in elsewhere.

The constraint is performance: mermaid is a large library (~1–2 MB of JS before its own per-diagram splitting). The feature must cost nothing for documents without diagrams, and must not regress startup, first paint, or typing latency for documents with them.

## What Changes

- New `@mdr/mermaid` extension registering a `md:render-mermaid` service. The mermaid library is loaded with dynamic `import()` into its own chunk, only when a document actually needs it.
- Reader: ```` ```mermaid ```` blocks paint as plain code first, then — post-paint, only when near the viewport, one per idle task — are replaced by the rendered SVG. Light/dark follows app appearance. Invalid diagrams keep the source (or the last good render) with an inline error caption.
- Split View: diagrams re-render live while typing, debounced; unchanged diagrams are served from cache with no flicker.
- Editor:
  - (a) syntax highlighting inside mermaid fences via a small hand-written CodeMirror `StreamLanguage` (no mermaid dependency);
  - (b) completion of ```` ```mermaid ```` starter templates (flowchart, sequence, class, state, ER, gantt, pie, mindmap);
  - (c) inline lint markers for diagram syntax errors using mermaid's own parser, active only once the library is loaded.
- New dependencies: `mermaid@^12.2.0`; `@codemirror/lint` promoted from transitive to direct dependency.

## Non-Goals

- Visual (drag-and-drop) diagram editing.
- Inline rendered previews inside the CodeMirror editor (Split View is the live preview).
- Keyword autocompletion inside diagram bodies.
- Exporting diagrams as SVG/PNG.
- Rendering other diagram languages (PlantUML, Graphviz, etc.).

## Capabilities

### Modified Capabilities

- `markdown-reading`: new requirements for rendering mermaid fences, lazy loading, error display, appearance following, and live update.
- `markdown-editing`: new requirements for mermaid syntax highlighting, template completion, and lint markers.

## Impact

- `src/extensions/mermaid.ts` (new) — extension + render/parse service, load-once import, serialized render queue, cache.
- `src/extensions/mermaidEditor.ts` (new) — `StreamLanguage`, template completion source, linter.
- `src/extensions/markdownContract.ts` — `renderMermaidKey` service key and types.
- `src/extensions/reader.tsx` — mermaid post-paint pass; Shiki pass skips `language-mermaid`.
- `src/extensions/editor.tsx` — `markdown({ codeLanguages })`, completion source, linter wiring.
- Extension registration alongside `@mdr/shiki`.
- `src/theme.css` — `.mdr-mermaid` figure, error caption, stale-render dimming, lint marker styling.
- `package.json` — `mermaid`, `@codemirror/lint`; new `test:mermaid*` scripts.
- No Rust changes.
