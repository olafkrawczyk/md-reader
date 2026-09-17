## Why

Focus mode ships today but is not predictable enough to rely on. The focal line
sweeps with scroll position (5% of the viewport near the top of a document, 95%
near the bottom), so for roughly the first and last third of every document the
highlighted block sits against the viewport edge and is partly cut off. The
focused unit is the direct child of the reader container, so a twenty-item list
lights up in its entirety instead of the item being read. Nothing about the mode
is specified, so its behavior is whatever the current implementation happens to
do.

## What Changes

- **Fixed focal band.** The focal line stops moving with scroll position and
  sits at a constant fraction of the pane height. Scroll padding above the first
  unit and below the last one keeps every unit reachable at that band, including
  the first and last. Replaces the `scrollRatio`/`focalRatio` sweep.
- **Containment selection with hysteresis.** The focused unit becomes the one
  whose vertical span contains the band, rather than the one whose center is
  nearest it. When the band falls in the gap between two units, the previous
  focus is kept. Removes flicker on adjacent blocks and mis-selection on tall
  code blocks.
- **Per-item focus units.** List items, not whole lists, become focusable units.
  Focus units are stamped during the existing hast pass and dimming inverts:
  leaf units are dimmed, containers are never dimmed, so a unit nested inside a
  container can be lit. (The current `opacity` on the container creates a
  stacking context that makes nested units unreachable at full opacity.)
- **Jump targets land at the band.** Outline jumps, `#Lnn` links, backlinks and
  search hits park their target at the focal band instead of the pane top, via
  scroll margin on focus units — no change to any jump call site.
- **Ancestor heading stays legible.** The heading that owns the focused unit
  renders at an intermediate opacity rather than fully dimmed, so the reader
  keeps their place in the document.
- **Keyboard unit cursor.** Arrow/`j`/`k` step focus between units and scroll the
  stepped-to unit to the band; `Escape` exits focus mode. Clicking a unit focuses
  it durably (today a click's focus is overwritten by the next scroll event).
- **Reduced-motion respected.** The dimming transition is suppressed under
  `prefers-reduced-motion: reduce`.
- **Cheaper scroll path.** The `IntersectionObserver` is removed — it recomputes
  the same thing the scroll listener already computes, several times per frame —
  and per-unit geometry is cached and invalidated by a single `ResizeObserver`
  instead of measuring every unit on every scroll event.

Not in scope: sentence-level focus granularity, a pointer-following reading
ruler, auto-scroll pacing, and nested-list depth tracking. Sentence granularity
is a plausible follow-on once the block unit model is settled; the others are
separate features competing for the same visual channel.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reading-experience`: adds requirements for focus mode — focal band geometry
  and reachability, focus unit granularity, selection stability, jump alignment,
  keyboard and pointer control, and reduced-motion behavior. Focus mode is
  currently implemented but unspecified, so these are additions to an existing
  capability rather than edits to existing requirements.

## Impact

- `src/extensions/reader.tsx` — the focus-mode effect (block selection, click
  handling, `IntersectionObserver`), and the `stampSourceLines` hast pass which
  gains focus-unit stamping.
- `src/theme.css` — `.mdr-reader[data-focus-mode]` rules: scroll padding, scroll
  margin, inverted dimming selectors, reduced-motion guard.
- `src/extensions/theme.ts` — no setting shape change; `reading.focusMode` stays
  a boolean.
- No new dependencies. No change to document source, AST, or saved output: focus
  mode remains a render-time concern.
