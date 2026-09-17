## 1. Focus units in the render pass

- [x] 1.1 Extend the hast pass in `src/extensions/reader.tsx` to stamp `data-focus-unit` on paragraphs, headings, `pre`, `table`, `hr`, standalone images and `blockquote`, and on each top-level `li` of a `ul`/`ol` — the list element itself is not stamped, and nested lists are not stamped (design D3)
- [x] 1.2 Verify a nested list rides with its top-level `li`: stamped units for a two-level list equal the number of top-level items
- [x] 1.3 Confirm the stamped HTML is byte-identical across re-renders with unchanged source, so the element-identity memo boundary still holds

## 2. Band geometry in CSS

- [x] 2.1 Add `--mdr-focus-band` and derive top/bottom scroll padding from it, applied only under `.mdr-reader[data-focus-mode="true"]` (design D1)
- [x] 2.2 Decide `vh` vs container query units for the band by checking the target WebKit version's container-query support; if unreliable, set `--mdr-pane-height` from the existing `ResizeObserver` instead (design Risks)
- [x] 2.3 Invert the dimming rules: dim `[data-focus-unit]`, light `.is-focused`, add the `.is-ancestor` middle tier, and remove the `> *` container rules (design D4)
- [x] 2.4 Add `scroll-margin-block-start: var(--mdr-focus-band)` on focus units under focus mode (design D5)
- [x] 2.5 Guard the opacity transition with `prefers-reduced-motion: reduce`
- [x] 2.6 Verify with focus mode off that no focus-mode padding, margin or dimming applies and scroll extent is unchanged

## 3. Selection

- [x] 3.1 Build the cached unit geometry array (`element`, `top`, `bottom` in scroll-container coordinates) once per content change, accumulating offsets to the scroll container (design D6)
- [x] 3.2 Invalidate the cache from one `ResizeObserver` on the reader container
- [x] 3.3 Replace nearest-center selection with binary search for the band plus containment, keeping the previous focus when the band lies in a gap (design D2)
- [x] 3.4 Implement first-focus fallback: first unit whose top is at or below the band, else the last unit
- [x] 3.5 Apply `.is-focused`, and `.is-ancestor` on the nearest preceding heading unit, only when the focused index changes
- [x] 3.6 Delete the `IntersectionObserver` and the `scrollRatio`/`focalRatio`/`maxScroll` computation
- [x] 3.7 Anchor on toggle: record the focused unit before `data-focus-mode` flips and scroll it back to the band after, so enabling and disabling do not jump the document

## 4. Reader-driven focus

- [x] 4.1 Install a pane keydown handler through `PaneHostValue.setKeyHandler` — `ArrowDown`/`j` next unit, `ArrowUp`/`k` previous unit, `Escape` turns the setting off (design D7)
- [x] 4.2 Keyboard stepping sets the focused index and scrolls that unit to the band; clamp at both ends without scrolling past the document
- [x] 4.3 Rewrite the click handler to resolve the clicked `[data-focus-unit]` and scroll it to the band, so the selection pass re-derives the same unit and click focus persists
- [x] 4.4 Verify the handler is uninstalled when focus mode is off or the pane unmounts, and that it does not intercept keys while the find bar has focus

## 5. Navigation alignment

- [x] 5.1 Verify outline jumps, `#Lnn` links and backlinks land at the band with focus mode on and keep their current alignment with it off — without editing those call sites
- [x] 5.2 In `scrollRangeIntoView`, when focus mode is on, scroll the containing focus unit instead of the range so the match highlight sits on a full-opacity unit (design D5)
- [x] 5.3 Verify a search match inside a dimmed unit is still counted and steppable

## 6. Verification

- [x] 6.1 Add `tests/focus-mode.mjs` following the existing Playwright harness convention, and a `test:focus` script
- [x] 6.2 Cover: first and last unit focus unclipped; focused unit appears at the same pane offset across a long document; a single `li` focuses while its siblings dim; a code block taller than the pane holds focus while scrolled through; focus does not oscillate across a unit boundary; an outline jump lands at the band
- [x] 6.3 Assert a cached unit top matches `getBoundingClientRect()` for a nested `li`, covering the offset-parent accumulation (design Risks)
- [x] 6.4 Run `npm run lint`, `npm run typecheck`, `npm run test:focus`, plus `test:ui`, `test:outline` and `test:search` for regressions on shared scroll paths
- [x] 6.5 Tune `--mdr-focus-band` and the dim/ancestor opacity values against a real document, then record the chosen values in the design's Open Questions
