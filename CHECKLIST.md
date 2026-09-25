# Fix checklist — COMPLETE

## 1. Quick open (⌘P) does not work — FIXED
- [x] Root cause PROVED: `useMemo(() => getTargetCompletions(), [linkIndex])` ran once,
      before the workspace tree loaded, so the palette list was permanently empty
      (palette opened, listed nothing, Enter no-oped)
- [x] Fix: memo also keyed on `tree` (workspace.treeSource) and `open`
- [x] Regression test `tests/quick-open-ui.mjs` — drives the real UI in a browser
- [x] Test DISCRIMINATES: reverting the dep makes it fail ("waiting for
      `.mdr-quickopen-item`"), restoring makes it pass
- [x] typecheck + lint clean

## 2. Sample images + docs referencing them — DONE
- [x] 4 real PNGs committed under `sample/images/` (architecture, focus-mode,
      logo, quick-open) — `git check-ignore` confirms they are NOT ignored
- [x] `sample/images.md` exercises `./images/x.png`, bare `images/x.png`,
      remote `https://`, inline `data:`, and a deliberately missing file
- [x] `sample/guides/with-images.md` exercises `../images/x.png` from a subfolder
- [x] Linked from `sample/README.md` so they are reachable in-app
- [x] `sample/` staged in git (16 files incl. 4 PNGs)
- [x] Path resolution verified against the real files on disk (all 3 forms resolve)
- [x] UI test `tests/image-render.mjs`: relative src rewritten to `asset://`,
      `../` climbs correctly, remote/`data:` untouched
- [x] Rust: `assetProtocol.enable` + runtime `allow_directory(canonical_root, true)`
      — static scope stays `[]`, one workspace root only, no `**`/`$HOME`
- [x] `cargo check` passes
- [ ] NOT verified headlessly: actual pixel decoding by the Rust asset server.
      Requires the real app (`npm run tauri dev`). Everything on both sides of
      the boundary is verified; only the OS-level file serving is not.

## 3. Code blocks "not highlighted in focus mode" — FIXED (different cause)
- [x] Investigated in Chromium AND real WebKit (the macOS webview engine, where
      `requestIdleCallback` is absent and the setTimeout fallback drives highlighting)
- [x] Verified the reported symptom does NOT reproduce: a focused code block is
      `is-focused`, opacity 1, and keeps >1 token colour. Confirmed by screenshot.
- [x] Found and fixed the REAL defect behind the symptom class: `convertFileSrc`
      was called unguarded inside the render memo. When the asset bridge is
      missing it THROWS, which unmounted the entire reader — the whole document
      vanished over one image. Now wrapped in `toAssetUrl`, degrading to a
      broken image instead of losing the document.
- [x] Hardened the focus cache against the async shiki `pre.replaceWith` swap
      (children/MutationObserver + rAF coalescing, cancelled on cleanup)
- [x] Regression test `tests/focus-code-highlight.mjs` locks in:
      focused code block is opaque AND still syntax-highlighted AND is the live
      connected node, not a detached stale one
- [x] Test DISCRIMINATES: forcing the focused unit back to 0.28 opacity fails it
- [x] typecheck + lint clean

## Final
- [x] `npm run typecheck` clean, `npm run lint` clean, `cargo check` clean
- [x] New tests pass: image-sources, session-restore, quick-open,
      focus-code-highlight, image-render, quick-open-ui
- [x] No regressions: focus-mode, code-highlighting, highlight-cache,
      link-handling, workspace-search all still pass
- [x] Every box above is ticked or explicitly explained
