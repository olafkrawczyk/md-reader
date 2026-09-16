# Tasks: Deterministic Link Resolution & Context-Aware Backlinks

## 1. Resolver & Precedence Engine

- [x] 1.1 Update `LinkIndexService` and `resolveTarget(target: string, fromPath?: string)` signature in `src/extensions/links.tsx`
- [x] 1.2 Implement source-relative sibling resolution (checking `dirname(fromPath)` first)
- [x] 1.3 Implement explicit path resolution for targets with slashes (`./`, `../`, and workspace-relative paths)
- [x] 1.4 Implement unique global stem resolution and fail-closed handling for ambiguous bare links (return `null` when multiple non-local matches exist)

## 2. Backlinks & Autocomplete Updates

- [x] 2.1 Update `getBacklinks` to strictly match resolved targets against file path (`resolveTarget(link.target, sourcePath) === path`) and eliminate heuristic stem/name fallbacks
- [x] 2.2 Update `getTargetCompletions` to detect duplicate stems and provide disambiguated workspace-relative paths in the autocompletion list
- [x] 2.3 Qualify backlink source filenames with their relative directory when the filename collides with others in the workspace

## 3. Testing & Verification

- [x] 3.1 Add colliding filename scenarios (`A/readme.md` vs `B/readme.md`) to `tests/bidirectional-links.mjs` to verify source-relative navigation and absence of phantom backlinks
- [x] 3.2 Add tests for disambiguated autocompletion and dead link behavior for ambiguous bare links
- [x] 3.3 Run tests and verify the complete link resolution suite passes
