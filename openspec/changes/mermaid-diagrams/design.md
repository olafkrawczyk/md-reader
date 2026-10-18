# Design — Mermaid Diagrams

## Context

1. **There is a proven post-paint enhancement pattern.** `@mdr/shiki` registers `highlightCodeKey`; `ReaderPane` paints plain `<pre><code>` from a memoized HTML string, then a `useEffect` swaps in highlighted blocks one idle slice at a time, cancelling when `html` changes (commits `e59ee57`, `f76d7ad`). Results are cached with `budgetedMemo`.
2. **The reader re-renders its whole HTML on every keystroke in Split View** (`dangerouslySetInnerHTML` from a memo over the AST). Any DOM replacement done post-paint is wiped and must be cheaply re-applied each pass — hence a source-keyed cache that can be applied synchronously.
3. **The editor uses `markdown()` with no `codeLanguages`**, so fenced code is unhighlighted in Writing mode today. `@codemirror/autocomplete` is already used for wikilink completion; `@codemirror/lint` is present transitively.
4. **Mermaid needs a real DOM** to measure text, so it cannot run in a Web Worker. Its render API is async; its module state is global and not safe for concurrent `render()` calls. Since v10 it lazy-loads per-diagram-type code internally.
5. **Appearance** is the `data-appearance` attribute on `<html>` (`light` | `dark`).

## Goals / Non-Goals

**Goals:**

- Zero cost for documents with no mermaid fence: no chunk request, no extra work in parse/render.
- No change to entry bundle size or time to first paint.
- No mermaid work on React's render path or inside the markdown transformer pipeline.
- Typing in Split View stays responsive with diagrams present.
- Editor help (highlight, templates, lint) for writing diagrams.

**Non-Goals:** see proposal.

## Decisions

### D1: Separate `@mdr/mermaid` extension owning a lazily loaded library

`src/extensions/mermaid.ts` follows the `@mdr/shiki` descriptor shape. Activation imports nothing from `mermaid`; it registers the service immediately (unlike shiki, there is no async init to wait for).

```ts
type Appearance = "light" | "dark";
type MermaidResult = { readonly svg: string } | { readonly error: string };

interface RenderMermaid {
  /** Cached result if present, else null. Synchronous; never loads. */
  peek(source: string, appearance: Appearance): MermaidResult | null;
  /** Loads mermaid on first call; renders through a serialized queue. */
  render(source: string, appearance: Appearance): Promise<MermaidResult>;
  /** null if valid OR library not loaded; never triggers a load. */
  parse(source: string): Promise<{ readonly line: number | null; readonly message: string } | null>;
  /** Triggers the load without rendering (editor: first edit inside a fence). */
  preload(): void;
  isLoaded(): boolean;
}
export const renderMermaidKey = serviceKey<RenderMermaid>("md:render-mermaid");
```

- **Load-once:** a single memoized `import("mermaid")` promise. On rejection the service marks itself failed for the session; `render` resolves `{ error }` and no retry happens.
- **Init:** `mermaid.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, theme })` — re-initialized only when the requested appearance differs from the last one used (`default` for light, `dark` for dark).
- **Serialization:** a promise-chain queue so only one `render`/`parse` touches mermaid at a time.
- **Cache:** `budgetedMemo`-style LRU keyed `appearance \0 source`, ~4 MB budget, storing both SVGs and errors (an invalid diagram costs one parse per distinct source, not one per keystroke).
- **Hygiene:** each render uses a unique id; after every render (success or failure) the service removes any leftover `#d<id>` / `#<id>` temp nodes mermaid appended to `document.body`.

*Alternative considered:* iframe sandbox per diagram — rejected (sizing/theming/search complexity, no perf gain). Rendering inside the transformer pipeline — rejected (sync pipeline runs per keystroke; mermaid is async and tens–hundreds of ms per diagram).

### D2: Reader post-paint mermaid pass

A second effect in `ReaderPane`, keyed on `[html, renderMermaid, appearance]`:

1. Collect `pre > code.language-mermaid`. If none: return (no load, no observer).
2. **Synchronous cache pass:** for each block, `peek()`; on a hit, swap in immediately. This keeps unchanged diagrams stable across the per-keystroke re-render in Split View.
3. **Lazy pass:** remaining blocks are observed with an `IntersectionObserver` (`rootMargin` ≈ one viewport height). Entering blocks are queued; the queue drains one `render()` at a time.
4. **Debounce:** when the pass is triggered by a document *change* (not first open / appearance change), uncached renders wait 300 ms; a newer `html` cancels the pending pass (same `cancelled` flag pattern as the Shiki effect).
5. **Replacement element:** `<figure class="mdr-mermaid" data-mermaid-source-hash="…">` containing the SVG. Copies `data-line`, `data-focus-unit`, and `is-focused` from the `<pre>`, as the Shiki pass does, so focus mode and outline/line jumps keep working.
6. **Errors:** on `{ error }`, the `<pre>` stays (or, if a previous render existed at the same block index during this editing session, that SVG is shown with `data-stale` dimming) and a `<figcaption class="mdr-mermaid-error">Mermaid: …</figcaption>` follows. "Last good render" is tracked per pane as `blockIndex → svg`, reset on document switch.
7. The Shiki pass excludes `language-mermaid` from its `pending` list.

Appearance is read via a small hook observing `data-appearance` (MutationObserver), so a theme switch re-runs the pass; toggling back is a cache hit.

### D3: Editor — highlighting via `StreamLanguage`

`mermaidEditor.ts` exports `mermaidLanguage = StreamLanguage.define({...})`, a line tokenizer (~150 lines) recognizing:

- diagram headers at the start of the first line: `flowchart`/`graph` + direction, `sequenceDiagram`, `classDiagram`, `stateDiagram(-v2)`, `erDiagram`, `gantt`, `pie`, `mindmap`, `journey`, `gitGraph`, `timeline` → `keyword`;
- structural keywords (`subgraph`, `end`, `participant`, `actor`, `loop`, `alt`, `else`, `opt`, `par`, `note`, `class`, `state`, `section`, `title`, `dateFormat`, …) → `keyword`;
- arrows/links (`-->`, `---`, `-.->`, `==>`, `->>`, `-->>`, `--x`, `<|--`, `*--`, `o--`, `||--o{`, …) → `operator`;
- `%%` line comments → `comment`; `"…"` strings → `string`; numbers → `number`;
- bracketed node labels `[...]`, `(...)`, `{...}` → `string`.

Wired as `markdown({ codeLanguages: (info) => (info.trim().toLowerCase() === "mermaid" ? mermaidLanguage : null) })` — `codeLanguages` accepts a function from the fence info string to a `Language` (a `StreamLanguage` is one) or `null`. `mdrHighlightStyle` gains `tags.operator` → `var(--mdr-syntax-entity)`. Only mermaid is mapped; other languages remain unhighlighted in the editor (unchanged behavior).

### D4: Editor — template completion

A `CompletionSource` added to the existing `autocompletion({ override: [...] })` alongside wikilinks. It activates when the text from line start to cursor matches `^\s*```m?e?r?m?a?i?d?$` (i.e. a fence opener being typed, including bare ```` ``` ````). Options, labelled e.g. "mermaid · flowchart", each insert a full fenced skeleton via `snippet()` with the cursor placed on the first editable node, closing fence included:

flowchart, sequence, class, state, ER, gantt, pie, mindmap.

If a closing fence already follows (the user typed ```` ``` ```` inside an existing block), the completion is not offered.

### D5: Editor — lint markers

`linter(source, { delay: 500 })` from `@codemirror/lint`:

1. Walk the syntax tree for `FencedCode` nodes whose `CodeInfo` is `mermaid`. None → return `[]`.
2. If `!isLoaded()` → return `[]` (no load triggered by linting).
3. For each fence, `await parse(body)`; on error, map mermaid's 1-based line (from the error's `hash.loc`/`hash.line`, falling back to the fence's first body line when absent) to a document range spanning that line; severity `error`.

Load trigger for Writing-only mode: an `EditorView.updateListener` that, on a doc-changing transaction whose changed range lies inside a mermaid fence, calls `preload()` once per view. Merely opening the document does not load mermaid.

### D6: Styling

`theme.css` additions: `.mdr-mermaid` (centered, `max-width: 100%`, SVG `height: auto`, horizontal scroll for wide diagrams, same vertical rhythm as `pre`), `.mdr-mermaid[data-stale] svg { opacity: .45 }`, `.mdr-mermaid-error` (small, `--mdr-color-fg-muted`, error tone), CodeMirror `.cm-lintRange-error` and tooltip using `--mdr-*` tokens.

## Performance budget (testable)

| Concern | Guarantee | How verified |
|---|---|---|
| Startup | `mermaid` absent from the entry chunk | build, inspect `dist/assets` entry for mermaid markers |
| Diagram-free docs | no mermaid chunk request | Playwright network log |
| First paint | unchanged; diagrams swap in post-paint | block present as `<pre>` immediately after open |
| Off-screen diagrams | not rendered until near viewport | below-fold block still `<pre>` before scroll |
| Typing (Split View) | unchanged diagrams served from cache synchronously; edited diagram ≤1 render per 300 ms pause | test counts `render` calls during simulated typing |
| Memory | SVG cache ≤ ~4 MB | `budgetedMemo` budget |

## Risks / Trade-offs

- **Chunk parse cost on first diagram** (~100–300 ms, one-time) — happens post-paint; acceptable.
- **Mermaid error shape is not a stable API** — line extraction is best-effort with a fallback to the fence's first line.
- **WKWebView text measurement** — mermaid measures label text with the page fonts; `htmlLabels: false` (SVG text) avoids foreignObject quirks in WebKit.
- **Bundle (installed app) size grows** by mermaid's on-disk footprint; download only, no runtime cost.

## Testing

Playwright `.mjs` tests in the existing style (`tests/`), each with an npm script:

- `tests/mermaid-render.mjs` (`test:mermaid`): valid diagram renders an SVG in a `.mdr-mermaid` figure; invalid diagram keeps the code and shows a caption; appearance toggle swaps theme; below-fold diagram not rendered until scrolled; Split View typing keeps unchanged diagrams stable and shows stale+error while broken.
- `tests/mermaid-lazy.mjs` (`test:mermaid:lazy`): diagram-free document triggers no mermaid chunk request; entry chunk does not contain mermaid.
- `tests/mermaid-editor.mjs` (`test:mermaid:editor`): tokens inside a mermaid fence carry highlight classes; typing ```` ``` ```` offers templates and accepting one inserts the skeleton; a syntax error yields a lint marker on the expected line once loaded.
