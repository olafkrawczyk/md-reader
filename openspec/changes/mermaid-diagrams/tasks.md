# Mermaid Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render ```` ```mermaid ```` fences as diagrams in the reader (lazy, post-paint, viewport-gated) and help write them in the editor (highlighting, starter templates, lint markers), at zero cost for documents without diagrams.

**Architecture:** A `@mdr/mermaid` extension registers a `renderMermaid` service whose core (`mermaidService.ts`) is dependency-free and takes an injected loader, so it unit-tests under node; the extension injects `() => import("mermaid")`. The reader adds a post-paint pass beside the Shiki pass; the editor gains a `StreamLanguage`, a completion source and a linter from `mermaidEditor.ts`, whose pure parts live in `mermaidSyntax.ts`.

**Tech Stack:** React 19, CodeMirror 6 (`@codemirror/language` StreamLanguage, `@codemirror/autocomplete`, `@codemirror/lint`), mermaid 12, Vite 7, Playwright 1.54, node 22 type-stripping tests.

**Spec:** `openspec/changes/mermaid-diagrams/` — `proposal.md`, `design.md`, `specs/markdown-reading/spec.md`, `specs/markdown-editing/spec.md`. Read all four before starting.

## Global Constraints

- `mermaid@^12.2.0` added to `dependencies`; `@codemirror/lint` added to `dependencies` at the version already installed (`^6.9.7`).
- `mermaid` is only ever reached through dynamic `import("mermaid")` in `src/extensions/mermaid.ts`. No other file imports it as a value (`import type` is fine).
- Mermaid config: `startOnLoad: false`, `securityLevel: "strict"`, `htmlLabels: false` and `flowchart: { htmlLabels: false }`, `theme: "default"` (light) / `"dark"` (dark).
- No mermaid work inside React render, `useMemo`, or the markdown transformer pipeline.
- Edit-driven render debounce: 300 ms. Lint delay: 500 ms. Viewport `rootMargin`: `"100% 0px"`. SVG cache budget: 4_000_000 chars.
- Error caption copy: `Mermaid: <message>` (first line of mermaid's message, trimmed).
- Template completion labels: `mermaid · flowchart`, `mermaid · sequence`, `mermaid · class`, `mermaid · state`, `mermaid · ER`, `mermaid · gantt`, `mermaid · pie`, `mermaid · mindmap`.
- Fence language match is case-insensitive (`mermaid`, `Mermaid`, `MERMAID`).
- Appearance comes from `effectiveAppearance()` / `subscribeAppearance()` in `src/core/theme/appearance.ts` (this replaces the MutationObserver mentioned in design.md D2 — Task 4 updates design.md accordingly).
- Playwright tests copy the harness (`check`, `assert`, `waitForServer`, `startVite`, `tauriStubInit`, open-folder helper) from `tests/code-highlighting.mjs`. Ports: 5231 (render), 5232 (lazy), 5233 (editor).
- Match existing code style: comment density and tone of `src/extensions/shiki.ts`; `ponytail:` notes for deliberate simplifications.

## Review Focus

1. **Duplicate diagrams in one document** — two fences with identical source must both render (shared cache key, distinct render ids). Test in Task 4.
2. **Switching documents mid-render** — a render resolving after the user opened another document must not insert into the new document. Test in Task 4.
3. **Empty or whitespace-only mermaid fence** — shows an error caption (or nothing breaks); never hangs the render queue for later diagrams. Tests in Task 3 (queue continues after a rejecting render) and Task 4 (caption).
4. **Very wide diagram** — scrolls horizontally inside its figure; the page itself gets no horizontal scroll. Test in Task 4.
5. **Capitalized fence info (```` ```Mermaid ````)** — renders like lowercase, and Shiki does not try to highlight it. Tests in Task 2 (`isMermaidInfo`) and Task 4.

---

### Task 1: Character-budgeted LRU with get/set

`budgetedMemo` only offers synchronous compute-on-miss; the async render cache needs `get`/`set` without poisoning misses. Extract the LRU and rebuild `budgetedMemo` on it.

**Files:**
- Modify: `src/core/budgetedMemo.ts`
- Test: `tests/highlight-cache.mjs` (extend)

**Interfaces:**
- Produces: `budgetedLru(maxChars: number, maxEntryChars = maxChars / 4): { get(key: string): string | undefined; set(key: string, value: string): void }` exported from `src/core/budgetedMemo.ts`. `get` touches (LRU). `set` of an outsized entry is a no-op. `budgetedMemo` keeps its exact signature and behavior.

- [x] **Step 1: Write the failing tests** (append to `tests/highlight-cache.mjs`, importing `budgetedLru` too)

```js
{
  const lru = budgetedLru(1000);
  assert.equal(lru.get("a"), undefined, "a miss is undefined and stores nothing");
  lru.set("a", "x");
  assert.equal(lru.get("a"), "x");
}
{
  const lru = budgetedLru(36, ENTRY);
  lru.set("k1", value(1)); lru.set("k2", value(1)); lru.set("k3", value(1));
  lru.get("k1");            // touch
  lru.set("k4", value(1));  // evicts k2
  assert.equal(lru.get("k2"), undefined);
  assert.equal(lru.get("k1"), value(1));
}
{
  const lru = budgetedLru(100);
  lru.set("big", "x".repeat(40));
  assert.equal(lru.get("big"), undefined, "outsized entry is not stored");
}
```

- [x] **Step 2: Run** `npm run test:cache` — Expected: FAIL (`budgetedLru` is not exported).
- [x] **Step 3: Implement `budgetedLru`** in `src/core/budgetedMemo.ts`, then reimplement `budgetedMemo` as a thin wrapper (store `null` results under an internal sentinel string so the LRU stays `string`-valued). Keep the file dependency-free.
- [x] **Step 4: Run** `npm run test:cache` and `npm run test:highlighting` — Expected: all pass.
- [x] **Step 5: Commit** `refactor(core): extract budgetedLru beneath budgetedMemo`

---

### Task 2: Pure mermaid syntax helpers

Dependency-free logic used by the editor and the service: info matching, tokenizer, templates, fence-opener detection, error line extraction.

**Files:**
- Create: `src/extensions/mermaidSyntax.ts`
- Create: `tests/mermaid-syntax.mjs`
- Modify: `package.json` (script `"test:mermaid:syntax": "node tests/mermaid-syntax.mjs"`)

**Interfaces:**
- Produces (all exported from `src/extensions/mermaidSyntax.ts`; only `import type` from `@codemirror/language`):
  - `isMermaidInfo(info: string): boolean` — first whitespace-separated word, case-insensitive, equals `mermaid`.
  - `mermaidStreamParser: StreamParser<{ line: number }>` — `startState`, `token`; token names `"keyword" | "operator" | "comment" | "string" | "number" | null`.
  - `MERMAID_TEMPLATES: readonly { label: string; body: string }[]` — eight entries in the label order from Global Constraints; `body` is the diagram text without fences, using `${}` snippet placeholders (CodeMirror `snippet()` syntax) with `${1:…}` on the first editable node.
  - `fenceOpenerPrefix(lineBefore: string, openFencesBefore: number): boolean` — true when `lineBefore` matches `/^\s*```[a-z]*$/i`, the letters after the backticks are a prefix of `mermaid`, and `openFencesBefore` is even (not closing a block).
  - `mermaidErrorLine(error: unknown): number | null` — 1-based line within the diagram: `error.hash.loc.first_line` → `error.hash.line + 1` → `/line (\d+)/i` on `String(error.message)` → `null`.
  - `mermaidErrorMessage(error: unknown): string` — first non-empty line of the message, trimmed; `"Unknown error"` fallback.

- [x] **Step 1: Write the failing tests** in `tests/mermaid-syntax.mjs` (node assert; `StringStream` from `@codemirror/language` works in plain node)

```js
import { StringStream } from "@codemirror/language";
// tokens(line) drives mermaidStreamParser.token over one line → [[text, style], ...] skipping whitespace
assert.ok(isMermaidInfo("mermaid") && isMermaidInfo("Mermaid") && isMermaidInfo("mermaid title"));
assert.ok(!isMermaidInfo("mermaidx") && !isMermaidInfo("") && !isMermaidInfo("js"));

assert.deepEqual(styleOf("flowchart TD", "flowchart"), "keyword");
assert.deepEqual(styleOf('A["Start"] --> B', "-->"), "operator");
assert.deepEqual(styleOf('A["Start"] --> B', '"Start"'), "string");
assert.deepEqual(styleOf("%% a note", "%% a note"), "comment");
assert.deepEqual(styleOf("    participant Alice", "participant"), "keyword");
assert.deepEqual(styleOf("A ->> B: hi", "->>"), "operator");
assert.deepEqual(styleOf("Foo <|-- Bar", "<|--"), "operator");
assert.deepEqual(styleOf("CUSTOMER ||--o{ ORDER : places", "||--o{"), "operator");
assert.deepEqual(styleOf('"Dogs" : 386', "386"), "number");

assert.deepEqual(MERMAID_TEMPLATES.map((t) => t.label), [
  "mermaid · flowchart", "mermaid · sequence", "mermaid · class", "mermaid · state",
  "mermaid · ER", "mermaid · gantt", "mermaid · pie", "mermaid · mindmap",
]);
assert.match(MERMAID_TEMPLATES[1].body, /^sequenceDiagram\n/);
for (const t of MERMAID_TEMPLATES) assert.match(t.body, /\$\{1:/, `${t.label} has a first tab stop`);

assert.ok(fenceOpenerPrefix("```", 0));
assert.ok(fenceOpenerPrefix("```mer", 2));
assert.ok(!fenceOpenerPrefix("```", 1), "closing an open block");
assert.ok(!fenceOpenerPrefix("```js", 0));
assert.ok(!fenceOpenerPrefix("text ```", 0));

assert.equal(mermaidErrorLine({ hash: { loc: { first_line: 3 } } }), 3);
assert.equal(mermaidErrorLine({ hash: { line: 1 } }), 2);
assert.equal(mermaidErrorLine({ message: "Parsing failed: unexpected token at line 4, column 2" }), 4);
assert.equal(mermaidErrorLine({ message: "nope" }), null);
assert.equal(mermaidErrorLine(null), null);
assert.equal(mermaidErrorMessage(new Error("\n  Parse error on line 3:\n...A--\n")), "Parse error on line 3:");
assert.equal(mermaidErrorMessage(undefined), "Unknown error");
```

- [x] **Step 2: Run** `npm run test:mermaid:syntax` — Expected: FAIL (module not found).
- [x] **Step 3: Implement** `src/extensions/mermaidSyntax.ts` per the Interfaces and design.md D3/D4. Tokenizer order per position: `%%` comment to EOL → `"…"` string → bracketed label (`[`…`]`, `(`…`)`, `{`…`}` when preceded by an identifier) → arrow regex (longest match first; include every arrow in D3 plus `-.->`, `--x`, `--o`, `o--`, `*--`, `..>`, `}|..|{`-style ER cardinalities) → number → word (keyword if in a `Set` of the D3 header + structural keywords) → advance one char.
- [x] **Step 4: Run** `npm run test:mermaid:syntax` — Expected: PASS.
- [x] **Step 5: Commit** `feat(mermaid): pure syntax helpers — tokenizer, templates, error parsing`

---

### Task 3: Mermaid render service and extension

**Files:**
- Create: `src/extensions/mermaidService.ts` (dependency-free core)
- Create: `src/extensions/mermaid.ts` (extension descriptor; the only `import("mermaid")`)
- Modify: `src/extensions/markdownContract.ts` (types + key)
- Modify: `src/extensions/index.ts` (register `mermaidExtension` right after `shikiExtension`)
- Modify: `package.json` (deps; script `"test:mermaid:service": "node tests/mermaid-service.mjs"`)
- Test: `tests/mermaid-service.mjs`

**Interfaces:**
- Consumes: `budgetedLru` (Task 1); `mermaidErrorLine`, `mermaidErrorMessage` (Task 2).
- Produces, in `markdownContract.ts`:
  ```ts
  export type Appearance = "light" | "dark";
  export type MermaidResult = { readonly svg: string } | { readonly error: string };
  export interface MermaidParseError { readonly line: number | null; readonly message: string }
  export interface RenderMermaid {
    peek(source: string, appearance: Appearance): MermaidResult | null;
    render(source: string, appearance: Appearance): Promise<MermaidResult>;
    parse(source: string): Promise<MermaidParseError | null>;
    preload(): void;
    isLoaded(): boolean;
    /** Notifies once when the library finishes loading (editor re-lints). */
    onLoaded(listener: () => void): () => void;
  }
  export const renderMermaidKey = serviceKey<RenderMermaid>("md:render-mermaid");
  ```
- Produces, in `mermaidService.ts`:
  ```ts
  export interface MermaidLike {
    initialize(config: Record<string, unknown>): void;
    render(id: string, text: string): Promise<{ svg: string }>;
    parse(text: string): Promise<unknown>;
  }
  export function createMermaidService(options: {
    load: () => Promise<MermaidLike>;
    removeTemp?: (id: string) => void;
  }): RenderMermaid;
  ```
  Behaviour: one memoized `load()` promise; on rejection, `render` resolves `{ error: "Mermaid failed to load" }` forever, `isLoaded()` stays false, no retry. `initialize` is called before the first render and again only when appearance changes (config per Global Constraints). All `render`/`parse` calls run through one promise-chain queue; a rejecting call must not stall the queue. Cache key `` `${appearance}\0${source}` `` in a `budgetedLru(4_000_000)`, values encoded `"S"+svg` / `"E"+message`. Render ids `mdr-mermaid-${n}`; `removeTemp(id)` runs after every render, success or failure. `parse` returns `null` immediately if not loaded (never calls `load`), else `null` on success or `{ line: mermaidErrorLine(e), message: mermaidErrorMessage(e) }`.

- [x] **Step 1: Write the failing tests** in `tests/mermaid-service.mjs` with a fake `MermaidLike` that records calls, can be told to fail on a source, and resolves renders with `<svg>${theme}:${text}</svg>`:

```js
// lazy: no load until render/preload
const { svc, fake, loads } = setup();
assert.equal(svc.isLoaded(), false);
assert.equal(await svc.parse("graph TD"), null, "parse before load is null");
assert.equal(loads(), 0, "parse never loads");

// render loads once, caches, peek hits
assert.deepEqual(await svc.render("graph TD", "light"), { svg: "<svg>default:graph TD</svg>" });
assert.deepEqual(svc.peek("graph TD", "light"), { svg: "<svg>default:graph TD</svg>" });
assert.equal(svc.peek("graph TD", "dark"), null);
await svc.render("graph TD", "light");
assert.equal(fake.renders.length, 1, "second render served from cache");
assert.equal(loads(), 1);

// appearance switch re-initializes with dark theme, once
await svc.render("graph TD", "dark"); await svc.render("graph LR", "dark");
assert.deepEqual(fake.inits.map((c) => c.theme), ["default", "dark"]);
assert.equal(fake.inits[0].securityLevel, "strict");
assert.equal(fake.inits[0].htmlLabels, false);

// errors cached, queue keeps going, temp cleanup on both paths
fake.failOn("bad", Object.assign(new Error("Parse error on line 2:\n..."), { hash: { loc: { first_line: 2 } } }));
const [bad, good] = await Promise.all([svc.render("bad", "light"), svc.render("ok", "light")]);
assert.deepEqual(bad, { error: "Parse error on line 2:" });
assert.ok("svg" in good, "a failing render does not stall the next");
assert.ok(removed.includes(fake.renders.at(-1).id) && removed.length === fake.renders.length);
await svc.render("bad", "light"); assert.equal(fake.renders.filter((r) => r.text === "bad").length, 1);

// serialization: never two renders in flight
assert.equal(fake.maxConcurrent, 1);

// parse after load
assert.deepEqual(await svc.parse("bad"), { line: 2, message: "Parse error on line 2:" });
assert.equal(await svc.parse("ok"), null);

// onLoaded fires once; load failure is terminal
// (fresh service whose load rejects) → render → { error: "Mermaid failed to load" }, loads() === 1 after two renders, isLoaded() false
```

- [x] **Step 2: Run** `npm run test:mermaid:service` — Expected: FAIL (module not found).
- [x] **Step 3: Implement** `createMermaidService` and the contract types. Then `npm install mermaid@^12.2.0 @codemirror/lint@^6.9.7`, and write `mermaid.ts`: `activate` registers `createMermaidService({ load: () => import("mermaid").then((m) => m.default), removeTemp: (id) => { document.getElementById(id)?.remove(); document.getElementById(`d${id}`)?.remove(); } })` under `renderMermaidKey`; manifest `{ id: "@mdr/mermaid", displayName: "Mermaid diagrams", version: "0.1.0" }`. Register in `index.ts`.
- [x] **Step 4: Run** `npm run test:mermaid:service && npm run typecheck && npm run lint` — Expected: PASS, no errors.
- [x] **Step 5: Commit** `feat(mermaid): lazily loaded render service`

---

### Task 4: Reader renders diagrams post-paint

**Files:**
- Modify: `src/extensions/reader.tsx` (new effect beside the Shiki effect at ~line 659; Shiki `pending` filter excludes mermaid)
- Modify: `src/theme.css` (`.mdr-mermaid`, `[data-stale]`, `.mdr-mermaid-error` per design.md D6)
- Modify: `openspec/changes/mermaid-diagrams/design.md` (D2: appearance via `subscribeAppearance`, not MutationObserver)
- Modify: `package.json` (`"test:mermaid": "node tests/mermaid-render.mjs"`)
- Test: `tests/mermaid-render.mjs` (port 5231)

**Interfaces:**
- Consumes: `renderMermaidKey`, `RenderMermaid`, `Appearance` (Task 3); `isMermaidInfo` (Task 2); `effectiveAppearance`, `subscribeAppearance` (`src/core/theme/appearance.ts`).
- Produces (DOM contract used by tests and focus mode): `<figure class="mdr-mermaid">` containing the `<svg>`, carrying `data-line`, `data-focus-unit`, `is-focused` copied from the replaced `<pre>`; stale state `data-stale` on the figure; error `<figcaption class="mdr-mermaid-error">Mermaid: …</figcaption>` placed right after the `<pre>` (or inside the stale figure).

- [x] **Step 1: Write the failing Playwright tests** in `tests/mermaid-render.mjs`. Fixtures (in-memory folder): `one.md` (heading + valid `flowchart TD; A-->B`), `bad.md` (`flowchart TD\n  A -->`), `xss.md` (`flowchart TD\n  A["<script>window.__pwned=1</script>"] --> B["<img src=x onerror=window.__pwned=1>"]`), `long.md` (valid diagram, 400 paragraphs, valid diagram), `dupes.md` (same diagram twice + a ```` ```Mermaid ```` fence + an empty ```` ```mermaid ```` fence), `wide.md` (flowchart LR with 40 chained nodes), `plain.md` (no diagram). Checks:
  - `"valid diagram renders as svg"`: open `one.md`; `.mdr-mermaid svg` appears within 10 s; `pre code.language-mermaid` count is 0; figure has a `data-line` attribute.
  - `"document paints before the diagram"`: immediately after clicking `one.md`, the heading text is visible while `.mdr-mermaid` count is 0 or the `<pre>` is present (poll the first frame via `page.evaluate` in a `requestAnimationFrame`).
  - `"invalid diagram keeps source with caption"`: `bad.md` → `pre code.language-mermaid` still present; `.mdr-mermaid-error` text starts with `Mermaid:`.
  - `"labels cannot run script"`: `xss.md` → svg rendered; `window.__pwned` is undefined; svg has no `foreignObject` and no `script` element.
  - `"below-fold diagram waits for scroll"`: `long.md` → first figure renders; second fence is still `pre code.language-mermaid`; scroll the reader to bottom; second renders.
  - `"duplicates, capitalized and empty fences"`: `dupes.md` → three `.mdr-mermaid svg` (two dupes + `Mermaid`), the dupes' svgs have distinct ids, the capitalized block is not `pre.shiki`; empty fence shows `.mdr-mermaid-error`.
  - `"wide diagram scrolls inside its figure"`: `wide.md` → `document.scrollingElement.scrollWidth <= innerWidth` and the reader container has no horizontal overflow; figure `scrollWidth > clientWidth` or svg width ≤ figure width.
  - `"appearance switch re-renders dark"`: open settings, choose Appearance `dark` (as in `tests/reading-settings.mjs:153`); the svg's markup changes (compare `outerHTML` before/after) without reopening.
  - `"split view typing keeps other diagrams stable"`: fixture `two.md` with two diagrams; ⌘⌥E; record the second figure's element handle; in the editor, place the cursor at the end of the first diagram's `A-->B` line and type `-->C`; after 1 s the first svg contains text `C`. While typing, a `requestAnimationFrame` sampler installed via `page.evaluate` records, every frame, whether the reader's second mermaid block is a `<pre>`; assert it never was (the reader replaces its whole HTML per keystroke, so element identity cannot be the check — "no flicker" means no painted frame shows the plain source).
  - `"broken while editing shows stale render"`: in split view on `two.md`, type ` -->` (dangling) into the first diagram; within 1.5 s the first figure has `data-stale` and a `.mdr-mermaid-error`; delete it; `data-stale` disappears.
  - `"switching documents mid-render"`: open `long.md`, immediately open `plain.md`; after 2 s `plain.md`'s reader contains no `.mdr-mermaid`.
  - `"plain document never loads mermaid"` lives in Task 5.
- [x] **Step 2: Run** `npm run test:mermaid` — Expected: FAIL (no `.mdr-mermaid`).
- [x] **Step 3: Implement** the reader pass per design.md D2 with these specifics:
  - `const appearance = useSyncExternalStore(subscribeAppearance, effectiveAppearance)`.
  - Block selection: `pre > code[class*='language-']` filtered by `isMermaidInfo(lang)`; apply the same filter (negated) to the Shiki `pending` list.
  - A per-pane `useRef<Map<number, string>>` of last good svg by block index, cleared when `document.path` changes; a `useRef` holding the previous `html`'s document path to tell "edit" (same path, html changed → debounce 300 ms) from "open/appearance" (no debounce).
  - The sync `peek` pass runs in a `useLayoutEffect` keyed on `[html, renderMermaid, appearance]` so cached diagrams are swapped in before the browser paints (a `useEffect` would paint the plain `<pre>` for a frame on every keystroke). On an edit pass, an uncached block that has a last-good svg at its index is also swapped in here, marked `data-stale`, until its new render resolves. The lazy/async part below stays in a `useEffect`.
  - Then `IntersectionObserver({ root: container's scroll parent, rootMargin: "100% 0px" })`; entering blocks are unobserved and pushed to a FIFO drained one `await render()` at a time; each awaited result is applied only if `!cancelled` and the target `<pre>` is still connected.
  - Cleanup: `cancelled = true`, disconnect observer, clear debounce timer.
  - SVG insertion uses a `<template>` as the Shiki pass does.
- [x] **Step 4: Run** `npm run test:mermaid`, then the regression suites that touch the reader DOM: `npm run test:highlighting && npm run test:focus:code && npm run test:focus && npm run test:outline && npm run test:search` — Expected: all PASS.
- [x] **Step 5: Commit** `feat(reader): render mermaid diagrams post-paint, lazily per viewport`

---

### Task 5: Lazy-load guarantees

**Files:**
- Create: `tests/mermaid-lazy.mjs` (port 5232)
- Modify: `package.json` (`"test:mermaid:lazy": "node tests/mermaid-lazy.mjs"`)

**Interfaces:**
- Consumes: the running app (Tasks 3–4); `vite build --manifest`.

- [x] **Step 1: Write the tests**
  - `"plain document never loads mermaid"`: record `page.on("request")` URLs; open folder, open `plain.md`, switch to Writing (⌘E) and type a character outside any fence, wait 2 s; assert no URL matches `/mermaid/i` except our own `src/extensions/mermaid*.ts` modules (match `/node_modules\/.*mermaid|\.vite\/deps\/mermaid/`).
  - `"diagram document loads mermaid"`: open `one.md`; assert such a request happens (proves the matcher is live).
  - `"mermaid is not in the startup graph"`: run `node node_modules/vite/bin/vite.js build --manifest --outDir <tmpdir>`; read `<tmpdir>/.vite/manifest.json`; walk the entry's static `imports` transitively; assert no visited chunk key/file matches `/node_modules\/mermaid/`, and that some entry reachable via `dynamicImports` does.
- [x] **Step 2: Run** `npm run test:mermaid:lazy` — Expected: PASS (Tasks 3–4 already built this; if it fails, the defect is in Task 3/4 — fix there, not in the test).
- [x] **Step 3: Commit** `test(mermaid): pin lazy-loading guarantees`

---

### Task 6: Editor highlighting and starter templates

**Files:**
- Create: `src/extensions/mermaidEditor.ts`
- Modify: `src/extensions/editor.tsx:264` (`markdown()` → `markdown({ codeLanguages })`), `mdrHighlightStyle` (add `tags.operator` → `var(--mdr-syntax-entity)`), and the autocompletion wiring
- Modify: `src/extensions/links.tsx:608` (`createWikilinkCompletion` → accept extra sources, see Interfaces)
- Modify: `package.json` (`"test:mermaid:editor": "node tests/mermaid-editor.mjs"`)
- Test: `tests/mermaid-editor.mjs` (port 5233)

**Interfaces:**
- Consumes: `mermaidStreamParser`, `isMermaidInfo`, `MERMAID_TEMPLATES`, `fenceOpenerPrefix` (Task 2).
- Produces, from `mermaidEditor.ts`:
  - `mermaidLanguage: StreamLanguage<{ line: number }>` = `StreamLanguage.define(mermaidStreamParser)`.
  - `mermaidCodeLanguages(info: string): Language | null` — `isMermaidInfo(info) ? mermaidLanguage : null`.
  - `mermaidTemplateCompletion: CompletionSource` — uses `fenceOpenerPrefix(lineTextBeforeCursor, countOfFenceLinesBeforeThisLine)`; each option `{ label, type: "text", apply: snippet("```mermaid\n" + body + "\n```") }`, `from` = start of the backticks.
- Changes `createWikilinkCompletion(getLinkIndex, extraSources: readonly CompletionSource[] = [])` so both sources share the one `autocompletion({ override: [...] })` (CodeMirror allows only one `autocompletion` config to win).

- [x] **Step 1: Write the failing Playwright tests** in `tests/mermaid-editor.mjs` (fixture `diag.md` containing a flowchart fence with `flowchart TD`, `A["Start"] --> B`, `%% note`):
  - `"mermaid fence is highlighted in the editor"`: open `diag.md`, ⌘E; in `.cm-content`, the span with text `flowchart` has a computed color different from a plain-text span's; same for `-->`, `"Start"`, `%% note`. (Compare against the color of a word in a normal paragraph line.)
  - `"other fences stay unhighlighted"`: a ```` ```js ```` fence's `const` has the plain-text color.
  - `"typing a fence offers templates"`: on a new empty line after the last fence, type ```` ```mer ````; `.cm-tooltip-autocomplete` lists exactly the 8 labels; press Enter on `mermaid · sequence`; the document text contains "```mermaid\nsequenceDiagram" and a closing "```" line.
  - `"closing fence offers no templates"`: inside an open ```` ```js ```` block, type ```` ``` ```` on its own line; no option labelled `mermaid ·` appears.
  - `"wikilink completion still works"`: type `[[` and see the existing wikilink options (regression guard for the shared `autocompletion`).
- [x] **Step 2: Run** `npm run test:mermaid:editor` — Expected: FAIL.
- [x] **Step 3: Implement** `mermaidEditor.ts` (highlight + templates only) and wire into `editor.tsx`/`links.tsx` per Interfaces.
- [x] **Step 4: Run** `npm run test:mermaid:editor && npm run test:editor && npm run test:wikilinks` — Expected: PASS.
- [x] **Step 5: Commit** `feat(editor): mermaid highlighting and starter templates`

---

### Task 7: Editor lint markers and edit-triggered load

**Files:**
- Modify: `src/extensions/mermaidEditor.ts`
- Modify: `src/extensions/editor.tsx` (add the two extensions; read the service via `useService(api.services, renderMermaidKey)` into a ref, like `linkIndexRef`)
- Modify: `src/theme.css` (`.cm-lintRange-error`, `.cm-tooltip-lint` with `--mdr-*` tokens)
- Test: `tests/mermaid-editor.mjs` (extend)

**Interfaces:**
- Consumes: `RenderMermaid` (Task 3); `isMermaidInfo` (Task 2).
- Produces, from `mermaidEditor.ts`:
  - `mermaidLinter(getService: () => RenderMermaid | null): Extension` — `linter(source, { delay: 500 })` per design.md D5. Walk `syntaxTree(state)` for `FencedCode` nodes whose `CodeInfo` child satisfies `isMermaidInfo`; body = lines between the fence lines; diagnostic range = the full mapped document line (`line - 1` offset from the first body line; `null` → first body line); `severity: "error"`, `message` = parse message. Also re-run lint when `service.onLoaded` fires (dispatch `forceLinting(view)`).
  - `mermaidPreloadOnEdit(getService: () => RenderMermaid | null): Extension` — an `EditorView.updateListener` that, the first time a doc change touches a range inside a mermaid `FencedCode` node, calls `getService()?.preload()`; then stops checking for that view.

- [x] **Step 1: Write the failing tests** (append to `tests/mermaid-editor.mjs`):
  - `"opening in the editor does not load mermaid"`: record requests; open `diag.md` straight into Writing (⌘E before the reader renders is unreliable — instead set preset to Writing first, then open the file); wait 1.5 s; no `/node_modules\/.*mermaid|\.vite\/deps\/mermaid/` request.
  - `"edit inside a fence loads mermaid and marks the error line"`: continue; on the diagram's 3rd body line append ` -->` (dangling); within 3 s a `.cm-lintRange-error` exists whose `.cm-line` ancestor's text equals that edited line; hovering it shows a tooltip containing `Parse error` or `Parsing failed`.
  - `"fixing the line clears the marker"`: delete the appended text; within 2 s no `.cm-lintRange-error`.
  - `"valid diagram has no markers"`: on a fresh `diag.md`, edit a label inside the fence; after 2 s no `.cm-lintRange-error`.
- [x] **Step 2: Run** `npm run test:mermaid:editor` — Expected: the new checks FAIL.
- [x] **Step 3: Implement** `mermaidLinter`, `mermaidPreloadOnEdit`, wire into `editor.tsx`, add lint CSS.
- [x] **Step 4: Run** `npm run test:mermaid:editor && npm run test:editor && npm run test:safety` — Expected: PASS.
- [x] **Step 5: Commit** `feat(editor): mermaid lint markers, load on first fence edit`

---

### Task 8: Full verification

**Files:**
- Modify: `openspec/changes/mermaid-diagrams/tasks.md` (tick boxes)
- Modify: `sample/` — add `sample/mermaid.md` with one diagram of each template type (manual smoke file, matching how `sample/` is used)

- [x] **Step 1: Run** `npm run typecheck && npm run lint && npm run build` — Expected: no errors.
- [x] **Step 2: Run** every `test:*` script: `for s in $(node -p "Object.keys(require('./package.json').scripts).filter(k=>k.startsWith('test:')).join(' ')"); do npm run -s $s || echo "FAILED $s"; done` — Expected: no `FAILED` lines.
- [ ] **Step 3: Manual smoke** with `npm run tauri dev`: open `sample/mermaid.md` in the real WKWebView; every diagram renders in light and dark; Split View editing feels responsive. Record anything WebKit-specific in design.md Risks. (manual — handed to user)
- [x] **Step 4: Commit** `chore(mermaid): sample document and task checklist`
