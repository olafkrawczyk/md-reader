# Design — Content-Change Reload

## Context

- The watcher pipeline (`src-tauri/src/workspace.rs:132-177`) is a chain of three stages: the `notify` closure filters ignored paths and forwards `Vec<String>` into an mpsc channel; a debounce thread collects everything arriving within 250ms, sorts + dedups, and emits `workspace-fs-changed` with a single `paths` list; the frontend `Workspace` (`workspace.ts:69-80`) treats any event as "rescan".
- `notify` events carry their kind (`EventKind::Create|Remove|Rename|Modify(ModifyKind::…)`) today; the pipeline discards it. Classification data is already in hand at the only place it can be cheaply captured.
- `Document` (`document.ts`) holds `#text`, `#version`, `#dirty`. `setText` is the only content mutation and always sets `#dirty = true` — there is no way to ingest external text today.
- The rescan (`#rescan` in `workspace.ts`) rebuilds the tree and runs `#signalDeleted`, which drops open documents whose paths vanished. It never re-reads file contents.
- The unsaved-changes design (`unsaved-changes-protection-and-autosave/design.md`) explicitly defers external-modification conflict UI and accepts last-writer-wins semantics; this change must not reopen that decision.

## Goals / Non-Goals

**Goals:**

- Content-only watcher events stop triggering full tree rescans.
- Open, clean documents pick up external edits automatically and stay clean.
- Dirty documents are never silently overwritten by external edits.

**Non-Goals:**

- Conflict UI or diff views for external-vs-buffer conflicts (still deferred, per the unsaved-changes design).
- Partial-tree rescans or diffing the old vs. new tree (structural events keep the full-rescan behavior).
- Watching files outside the workspace, or re-reading documents that are not open.

## Decisions

### D1 — Classify in Rust, coalesce with structural-wins

The watcher closure maps each `notify::Event` to `(path, structural: bool)` pairs instead of bare path strings. Classification: `EventKind::Modify(ModifyKind::Data(_))` (and `ModifyKind::Metadata`) is content-only; everything else — `Create`, `Remove`, `Rename`, `Modify(ModifyKind::Name(_))`, `Modify(Other/Any)`, and any `Access`/`Other` noise — is structural. The debounce thread merges its batch into a `HashMap<String, bool>` (structural flag per path); any structural touch wins for that path.

Rationale: editors that save via temp-file-plus-rename (common on macOS) produce `Rename`/`Create` events, which must stay structural — a rescan there is correct, not waste. Only pure in-place writes (`Data`) are provably tree-neutral. `Modify(Any)` is treated as structural because it is indistinguishable from a possible attribute/rename hybrid.

*Alternative considered:* classifying in the frontend from payload heuristics. Rejected — the event kind is only available in Rust; guessing from paths would misclassify.

### D2 — Two-list payload, no compatibility shim

`FsEventPayload` becomes `{ changed: Vec<String>, modified: Vec<String> }` (`changed` = structural, `modified` = content-only), and the frontend `FsEvent` type (`types.ts`) mirrors it. No versioning or fallback: backend and frontend ship in the same binary, so a stale frontend is not a scenario.

*Alternative considered:* a nullable `modified` field added to the existing payload. Rejected — a "both lists possibly present" union makes every consumer handle three states to support a transition that cannot actually occur.

### D3 — Workspace routes; dirty docs and unknown paths are skipped

`onFsChanged` splits in `Workspace`: non-empty `changed` → the existing `#rescan()` (which also runs `#signalDeleted`, so delete semantics are untouched); then a new `#reloadModified(paths)` runs over `changed ∪ modified`:

1. Collect open documents whose path is exactly in the union (exact match only; a modified *directory* path never matches an open document and is dropped — content events name files).
2. Skip dirty documents (buffer wins) — and `Document.reload` re-checks the dirty flag as defense in depth.
3. For each remaining document, `readTextFile(path)` then `reload(text)`; read failures are logged to the console and skipped (the file may have been deleted moments later — the deletion flow will surface it via a structural event or the next rescan).

The union matters: editors that save via temp-file-plus-rename surface as `Rename`/`Create` (structural) events, and the spec requires those saves to reach clean open documents too — a rescan alone refreshes the tree but never re-reads text. No dedup or ordering requirements beyond that: duplicates collapse in Rust already, and `reload` early-returns when the text is unchanged.

### D4 — `Document.reload(text)` swaps text without dirtying

New mutation on `Document`: sets `#text`, emits, but touches neither `#dirty` nor `#version`. Version counts *in-app* edits (per the existing workspace spec's version/dirty requirement); an external overwrite is not an in-app edit, so bumping it would lie about user activity. Dirty stays false — a clean document that receives external text is still clean, which is exactly what the autosave/dirty invariant expects.

No-op when `text === this.#text` (avoids pointless re-renders when a watcher event fires but content is identical) or when the document is dirty.

*Alternative considered:* reusing `setText` with a flag parameter. Rejected — a boolean-mode parameter on the only edit entry point invites accidental external calls that dirty silently; a named method keeps the two ingest paths legible.

### D5 — Editor text sync rides the existing subscription

The reader already re-renders off `Document.text` via `useSyncExternalStore`, and the editor syncs through the same document subscription; `reload`'s emit is therefore sufficient — no new wiring. Split-view stays consistent because both panes subscribe to the same `Document`.

### D6 — Bug-fix revision: diagnose before fixing (2026-09-11)

Field report: external saves never update an open document's text. Static review of D1–D5 finds the implementation consistent with the design, so the defect lives in an untested seam. This revision is diagnosis-first: reproduce the failure in the test harness, fix the confirmed cause, then re-run manual verification.

**Confirmed root cause (2026-09-11, via the new UI tests):** the reader renders through the markdown extension's AST cache (`src/extensions/markdown.ts`), keyed on `(path, version)`. Because `Document.reload` intentionally does not bump `version` (D4), a reloaded document's cache entry is still considered fresh, so the reader keeps rendering the stale AST even though `Document.text` is new. The event pipeline (Rust classification → payload → `#reloadModified` → `Document.reload`) works end to end. This also exposes an internal contradiction: D5 claimed the reader re-renders off `Document.text`, but the reader renders from the version-keyed AST cache.

**Fix:** key the AST cache entry on the document's text instead of its version (`{ text, ast }`, hit when `cached.text === document.text`). This invalidates on any content change (in-app edits and external reloads alike) without touching D4's version semantics.

The test harness can already simulate backend events — `tests/file-management.mjs` and `tests/file-naming.mjs` register `plugin:event|listen` handlers and invoke them with `workspace-fs-changed` payloads — but every existing test emits only `changed` (structural) lists. The `modified` → reload route had zero coverage, so a frontend-route regression test came first (TDD): emit `{ changed: [], modified: [path] }` after re-writing the stubbed file, assert the open clean document re-renders the new text, and assert a dirty document keeps its buffer.

**Root-cause candidates, ranked (diagnosis in this order):**

1. **Stale binary.** The Rust side (classification + payload shape) requires an app rebuild; the frontend fix requires the dev server to pick it up. Cheap to rule out; do it first.
2. **Event-path vs document-path mismatch.** `#reloadModified` matches paths exactly (`Set.has`). Tree/document paths come from `fs::read_dir` over the canonicalized root; watcher event paths are whatever `notify`/FSEvents reports. If the forms ever differ (symlinked root, `/private` prefix, case), the re-read is silently skipped. Fix if confirmed: normalize both sides before matching (e.g. compare against the canonicalized document path), keeping the spec's observable behavior unchanged.
3. **Listener-attach race in `openFolder`** (`workspace.ts`): `activateWorkspace` is awaited *before* `onFsChanged` subscribes, so any event in that window is lost, and every re-open drops and re-creates the listener. Fix if confirmed: subscribe before activating (event before listener attach is then impossible), and remember the unlisten per workspace.
4. **FSEvents delivery on the affected machine** (latency, imprecise mode, network/iCloud volumes where FSEvents is unreliable). Confirm only after 1–3 are ruled out; mitigation if confirmed: fall back to a lightweight mtime check on open-document reads when a workspace-wide event names the containing directory rather than the file.

Candidates 1–4 were all ruled out by the simulated-event test (the route works end to end); the defect was in the render path above.

## Risks / Trade-offs

- [FSEvents may coalesce a create+write into one Modify event] → Worst case a freshly created file is reported content-only and the tree misses it until the next structural event. Accepted: the 250ms batch plus "structural wins" makes this rare, and any subsequent save burst is structural. The tree self-corrects on the next rescan trigger.
- [A content-only re-read of a file that just got deleted] → `read_text_file` fails; the error is logged and the document left as-is. Deletion signaling owns that case.
- [Dirty document misses external edits until saved] → Intentional (buffer wins); recorded as the accepted tradeoff in the unsaved-changes design and now in the spec scenario.

## Migration Plan

Single change across Rust + frontend; no data migration. Order: Rust classification + payload → bridge/types → `Document.reload` → `Workspace` routing → tests. Rollback is a revert on both sides.

## Open Questions

None.
