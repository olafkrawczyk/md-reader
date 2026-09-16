# Design: Deterministic Link Resolution & Context-Aware Backlinks

## Context

`LinkIndexServiceImpl` in `src/extensions/links.tsx` currently resolves targets purely from the target string via `resolveTarget(target: string)`. It has no knowledge of the referencing file (`fromPath`), sorts ambiguous matches by arbitrary path length, and in `getBacklinks(path)` falls back to stem-name matching (`matchesStem || matchesName`). This results in cross-directory false positives and phantom backlinks.

See `proposal.md` for full motivation and `specs/bidirectional-links/spec.md` for behavioral requirements.

## Goals / Non-Goals

**Goals:**
- Provide a deterministic, 4-tier precedence resolution algorithm based on the source document's directory.
- Treat ambiguous bare links as unresolved (`null`) rather than guessing.
- Derive backlinks strictly as the inverse of resolved links.
- Offer disambiguated relative paths in the autocomplete popup for files with duplicate stems.

**Non-Goals:**
- Indexing standard markdown links `[label](./path.md)` (retaining scope to `[[wikilinks]]`).
- Resolving links outside the active workspace directory.

## Decisions

### Decision 1: Pass `fromPath` to `resolveTarget`
- **Choice**: Change signature to `resolveTarget(target: string, fromPath?: string): string | null`.
- **Rationale**: File-relative resolution (`./`, `../`, and bare sibling files) requires the directory of the referencing file.
- **Alternatives considered**: Passing workspace root only (fails for relative paths), or keeping state on the index (stateful, concurrency issues).

### Decision 2: Four-tier resolution hierarchy
1. **Source directory relative**: If `fromPath` is supplied, check `dirname(fromPath) + "/" + target` (with `.md`/`.markdown`).
2. **Path with slashes (relative or root-relative)**:
   - If target starts with `./` or `../`, resolve relative to `dirname(fromPath)`.
   - If target contains `/`, check relative to source dir, then relative to workspace root.
3. **Unique global stem match**: If bare target has no slashes, match workspace markdown files where `stemOf(file).toLowerCase() === targetStem`. If exactly 1 match, return it.
4. **Ambiguous bare target / Not found**: If > 1 global match and none in source directory, return `null` (fail closed). If 0 matches, return `null`.
- **Alternatives considered**: Lexicographic fallback (guesses invisibly and causes phantom links).

### Decision 3: Remove heuristic stem matching from `getBacklinks`
- **Choice**: A backlink item is added if and only if `this.resolveTarget(link.target, sourcePath) === path`.
- **Rationale**: Guarantees consistency between forward navigation and backlink discovery.

### Decision 4: Autocompletion disambiguation
- **Choice**: When indexing workspace files for autocomplete, detect colliding stems. For duplicates, display and insert the workspace-relative path (e.g., `A/readme` vs `B/readme`). For unique stems, keep the bare stem (e.g., `changelog`).

## Risks / Trade-offs

- **[Existing ambiguous notes stop navigating]** → Ambiguous links intentionally become dead links instead of opening the wrong file. Users can re-link via autocomplete.
- **[Performance on large workspaces during backlink computation]** → `resolveTarget` runs per-link. Workspace file lists can be pre-indexed into a Map by directory and stem if needed, but in-memory caching (`#backlinksCache`) already avoids recalculation on idle renders.
