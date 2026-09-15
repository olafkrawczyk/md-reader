## 1. Task-tick transformer

- [x] 1.1 Create `src/extensions/taskTicks.ts`: a markdown transformer (id `@mdr/task-ticks`, priority 5) that walks `payload.ast` and sets `data.hProperties = { dataTaskStart, dataTaskEnd }` from `listItem.position` for every item with `checked !== null`
- [x] 1.2 Export a pure `swapTaskMarker(text, start, end, ticked)` helper from the same module: slice `[start, end)`, replace the first `\[( |x|X)\]` with `[x]`/`[ ]`, return the new full text; no match → return text unchanged
- [x] 1.3 Register the extension in `src/extensions/index.ts` (after gfm, before shiki in priority; registration order irrelevant per the index comment)

## 2. Reader wiring

- [x] 2.1 In `reader.tsx`, add a container effect keyed on `document`: one delegated `click` listener on the reader container that resolves `closest("li[data-task-start]")`, parses the offset attributes, calls `swapTaskMarker`, and `document.setText`s the result
- [x] 2.2 After each innerHTML render (effect on `html`), enable task checkboxes: inputs inside `li[data-task-start]` lose `disabled`; verify no other checkboxes are affected
- [x] 2.3 Confirm the render memo, find-in-document highlight re-application, and scroll behavior are unaffected by a tick (read-only inspection plus manual check)

## 3. Editor external-change sync

- [x] 3.1 In `useCodeMirror`, inside the view-owning effect, subscribe to `document.subscribe`; on notification, when `document.text !== view.state.doc.toString()`, dispatch a full-document replace annotated with `Transaction.remote.of(true)`; tear down the subscription in the same effect's cleanup
- [x] 3.2 Verify view-driven edits do not double-apply (the update listener's `setText` must not trigger a redundant dispatch back into the view)

## 4. Styling

- [x] 4.1 In `theme.css`, style `.mdr-reader input[type="checkbox"]` (size, accent color, hover/focus states) against the token set for both appearances
- [x] 4.2 Confirm checkboxes inside task items are the only enabled/interactive inputs in reader output

## 5. Verification

- [x] 5.1 Automated: lint, typecheck, both test suites, build all pass
- [x] 5.2 Automated (`tests/task-ticks.mjs`, real mouse + keyboard via Playwright): tick/untick in reader — source updates, dirty marker, autosave persists, undo in editor unaffected
- [x] 5.3 Automated: split view — tick in reader appears in editor; type in editor afterwards; tick not reverted; `[x]` text in a code block untouched by ticks
- [x] 5.4 Automated: ordered task ticks independently; keyboard Space toggles
