# Change: Deterministic Link Resolution & Context-Aware Backlinks

## Why

Wikilink resolution in `md-reader` is currently context-blind and non-deterministic when filenames collide (e.g. `A/readme.md` vs `B/readme.md`). The resolver matches by bare filename/stem without considering the originating document's directory, and the backlinks engine collects links using global stem matching instead of verified resolved targets. As a result, files show phantom backlinks from unrelated documents and navigation links resolve unpredictably.

Establishing a deterministic, source-relative resolution hierarchy and treating backlinks as a strict inverse of forward links guarantees predictable navigation and eliminates phantom backlinks.

## What Changes

- **Source-relative resolution**: `resolveTarget` accepts the referencing document's path (`fromPath`), prioritizing siblings in the current directory before evaluating root-relative or workspace-wide paths.
- **Root-relative and explicit paths**: Wikilinks containing slashes (e.g. `[[sub/doc]]` or `[[./doc]]` or `[[../doc]]`) resolve relative to the source directory or workspace root.
- **Fail-closed on ambiguous bare links**: When a bare link has multiple candidates across the workspace and none in the source file's directory, resolution returns `null` (dead/unresolved link) rather than guessing by shortest path or sorting order.
- **Exact-match backlinks**: Backlinks are computed strictly by evaluating whether `resolveTarget(link.target, sourcePath) === currentPath`. The stem/basename fallback matching in `getBacklinks` is removed.
- **Disambiguated autocompletion**: Autocompletion suggestions for documents with colliding stems provide the disambiguated path (e.g. `A/readme` vs `B/readme`) so users can insert explicit targets.

## Capabilities

### New Capabilities
- `bidirectional-links`: Deterministic source-relative link resolution, disambiguated autocompletion, and exact-match backlinks.

### Modified Capabilities
<!-- None: base capability is being formalized in this change -->

## Impact

- `src/extensions/links.tsx`: `LinkIndexService`, `resolveTarget`, `getBacklinks`, and autocompletion logic.
- `tests/bidirectional-links.mjs`: Test scenarios updated to verify directory-relative resolution, disambiguation, and absence of phantom backlinks across colliding filenames.
