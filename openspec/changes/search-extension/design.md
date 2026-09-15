# Design — Search Extension

## Context

Three relevant facts about the current codebase:

1. **The whole workspace tree is already in frontend memory.** `read_dir_tree` returns the fully recursive `FileEntry` tree; `SidebarPane` holds it in state and rebuilds on `workspace-fs-changed`. Filename search needs no Rust work and no IPC per keystroke.
2. **The extension platform has a live-replaceable service registry** (`serviceRegistry.ts`): `register` notifies existing consumers immediately, so re-registration is a hot swap. The reader already uses `consume` + a cache service key — this is the established pattern for cross-extension seams.
3. **The editor is CodeMirror 6** and `@codemirror/search` is already a dependency (unused). The reader renders via `dangerouslySetInnerHTML` from a memoized HTML string; DOM mutations from outside the memo would be wiped on re-render.

`PaneHostValue` (`paneHost.tsx`) already tracks `focused` per pane — the targeting semantics in the spec can be built on the existing focus model.

## Goals / Non-Goals

**Goals:**

- One shared, Safari-styled find bar for both pane renderers, driven by a small adapter interface.
- Provider seam so a future extension (e.g. qmd content search) can replace search behavior at runtime.
- Filename filtering that stays fast at tens of thousands of entries (in-memory, no debounce needed).

**Non-Goals:**

- Full-text content search across files (future change; the provider seam anticipates it but defines no contract for it yet).
- Quick-open palette (⌘P-style flat file results).
- Find-and-replace.
- Cross-pane simultaneous highlighting.

## Decisions

### D1: Search behavior behind a capability-declared `SearchService`

A `ServiceKey`-typed service with a shape roughly:

```ts
interface SearchService {
  readonly capabilities: { readonly findInDocument: boolean; readonly fileNameFilter: boolean };
  findInDocument?(doc: Document, query: string): DocumentSearchSession;
  filterFileNames?(root: readonly FileEntry[], query: string): readonly FileEntry[];
}
```

The default implementation ships inside `@mdr/search` and registers on activate. Consumers (find bar, sidebar) use `services.consume` and handle arrival/replacement. The two capabilities are declared so a partial provider (qmd does content search only, initially) degrades gracefully: consumers keep the last provider that declared a capability for behaviors the replacement omits.

*Alternative considered:* separate service keys per facet. Rejected — a single key makes "replace search wholesale" one call, and capability flags give the partial-replacement semantics for free.

### D2: One custom find bar; CodeMirror search used headlessly

CodeMirror's built-in search panel is not used: its visuals can't adopt the `--mdr-*` token system, and a second find UI would be needed for the reader anyway. Instead a single find bar component (chrome-level overlay below the toolbar, like `SettingsPanel` is chrome) drives both renderers through adapters:

```ts
interface SearchTarget {
  find(query: string): void;      // (re)start search, highlight all matches
  next(): void;
  prev(): void;
  clear(): void;
  onState(handler: (s: MatchState) => void): () => void; // count + current index
}
```

- **Editor adapter:** `setSearchQuery` + `findNext`/`findPrevious` from `@codemirror/search` headless commands; match count via `searchPanelOpen`-independent `SearchQuery` cursor or the search extension's `getSearchQuery` facilities. No CodeMirror panel UI.
- **Reader adapter:** CSS Custom Highlight API — walk text nodes of `.mdr-reader`, collect `Range`s per match, register `CSS.highlights.set("mdr-find", highlight)`. No DOM mutation, so memoized re-renders are safe. Current match gets a second highlight registration.

*Alternative considered:* mark-wrapping in the HTML memo. Rejected — fights the memo pipeline and pollutes reader output.

### D3: Pane search-target registry keyed by pane id

Panes register a `SearchTarget` factory through a small addition to the extension surface (e.g. `api.search`-style registry owned by the search extension, keyed by pane id, populated by editor/reader activations). The find bar resolves the target by the focused pane's id using the `focused` flag from `PaneHostValue`, falling back to reader → first document pane.

*Alternative considered:* adding `searchTarget` to the `PaneHostValue` context. Rejected — v0 pane contract is explicitly experimental; a side registry avoids reshaping it in the same change.

### D4: Sidebar filter as pruned-tree rebuild

On each tree change, flatten the `FileEntry` tree once into an array of `{name, path, kind}` (preorder). On keystroke, filter the flat array (case-insensitive substring; subsequence fuzzy is a stretch goal, not required), then rebuild a pruned tree keeping folders that are ancestors of hits, and derive the expanded-folder set from the result. At 10k files this is well under a millisecond; no debounce.

The sidebar owns the folded/unfolded input state; the search extension contributes the filter *behavior* via the provider, the sidebar renders the input. Keeps the explorer's spec surface minimal.

### D5: ⌘F handling in App.tsx global keydown

`App.tsx` already owns global shortcuts (⌘S, ⌘W, ⌘←/→). ⌘F joins that handler and dispatches through the search extension's opened API (the find bar is chrome rendered by the extension into the app shell). Focused-pane resolution happens in the extension, not in App.

## Risks / Trade-offs

- **CSS Custom Highlight API needs Safari 18.2+ (macOS 15+).** → Spike first; if the runtime lacks support, fall back to Range-based overlay rectangles positioned from `getBoundingClientRect` (same adapter interface, uglier visuals) — decide during implementation, the adapter hides it either way.
- **Editor match count via headless search is fiddly** (no built-in count API). → The editor adapter counts with a one-pass `SearchQuery` cursor over the doc on each query change; docs are small enough that this is cheap.
- **Focus ambiguity when pane container itself is focused** (editor's CodeMirror steals focus internally). → Target resolution uses the pane host's `focused` flag, which is container-level and stable regardless of internal focus.
- **Sidebar re-renders on every keystroke.** → Acceptable at realistic scale; the pruned-tree rebuild is allocation-light. Revisit only if profiling ever shows a problem.
