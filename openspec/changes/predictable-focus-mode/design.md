## Context

See `proposal.md` — Why. What matters for the approach:

- The reader renders a memoized HTML string into a single container
  (`src/extensions/reader.tsx`), and the container element identity is itself a
  memo boundary — React must not re-create the subtree, or clicks in flight die.
  Focus mode therefore has to work by mutating attributes/classes on existing
  nodes, never by re-rendering content.
- A hast pass (`stampSourceLines`) already walks the top-level children of the
  tree on every render to stamp `data-line`. Anything that can be decided at
  build time should ride along in that pass rather than being queried from the
  DOM on the scroll path.
- The scroll parent is `.mdr-pane` (`overflow: auto`), not the reader container.
  All geometry is relative to that element.
- `PaneHostValue.setKeyHandler` exists in the pane contract and is currently
  unused by every pane. It is the intended route for pane-scoped keys.
- The webview is WebKit (Tauri on macOS). `requestIdleCallback` is absent —
  the file already carries a shim — so no new scheduling primitive is assumed.

## Goals / Non-Goals

**Goals:**

- Focus geometry that is a pure function of scroll position and cached unit
  extents, so the same scroll position always yields the same focused unit.
- Push everything that CSS can express into CSS: spacing, alignment of jumps,
  dimming, motion preference. JavaScript decides only *which* unit is focused.
- Leave the scroll path free of DOM queries and forced layout.
- Net less code than today.

**Non-Goals:**

- A general "reading position" model shared with the editor. Focus is a reader
  concern; the editor keeps its own cursor.
- Persisting the focused unit across reopen.
- Making focus mode work in the editor pane or in split view's editor half.

## Decisions

### D1: Fixed band + scroll padding, not a sweeping focal line

Today `focalRatio = 0.05 + scrollRatio * 0.9` moves the band down the viewport
as the document scrolls. The sweep exists to solve reachability: with a band
fixed at, say, 42% of the pane, the first unit can never reach it because there
is nothing above it to scroll away, and likewise for the last.

The alternative solves reachability with space instead of motion:

```
.mdr-reader[data-focus-mode="true"] { padding-block: 45vh 55vh; }
```

Now `scrollTop = 0` puts the first unit at the band and `scrollTop = max` puts
the last one there, with the band constant in between. Bottom padding exceeds
top padding because bringing the last unit *up* to 42% requires ~58% of empty
pane beneath it.

This is what every typewriter-scroll editor does (iA Writer, Ulysses, Obsidian);
the padding is the feature, not a workaround. It deletes the `scrollRatio` /
`maxScroll` / `focalRatio` computation entirely.

Band fraction and padding are CSS custom properties on the reader
(`--mdr-focus-band`, and the padding derived from it) so JS reads one number and
the two stay consistent by construction.

*Alternative rejected:* clamping the sweep to a narrower range (e.g. 25%–75%).
It reduces the clipping but keeps focus position unpredictable, which is the
actual complaint.

### D2: Containment with keep-previous, not nearest-center

Current selection picks the unit whose center is nearest the band. Two failures:
adjacent units of similar height swap on a 1px scroll when their centers are
equidistant; and a code block taller than the pane has its center far off-screen,
so a short neighbor wins even while the band sits squarely inside the block.

New rule: the focused unit is the one whose `[top, bottom)` span contains the
band. If no unit contains it — the band is in a margin gap — keep the previous
focus. That is hysteresis for free: no threshold to tune, no dead zone to size,
and strictly fewer branches than the distance loop it replaces.

Initial focus (nothing previously focused) falls back to the first unit whose
top is at or below the band, else the last unit.

### D3: Focus units are stamped in the hast pass, not derived from the DOM

`stampSourceLines` already iterates the top-level children. Extend it to stamp
`data-focus-unit` on:

| Node | Unit |
|---|---|
| `p`, `h1`–`h6`, `pre`, `table`, `hr`, standalone `img` | itself |
| `ul` / `ol` | each top-level `li` (the list itself is not a unit) |
| `blockquote` | itself |
| nested lists | not units — they ride with their top-level `li` |

Consequence for the reader: the focusable set is
`container.querySelectorAll("[data-focus-unit]")`, a flat list in document
order, rather than `container.children`. Nothing on the scroll path has to
understand markdown structure.

*Alternative rejected:* a DOM walk at effect setup. It would produce the same
set but duplicates tree-shape knowledge that the hast pass already has, and has
to re-run on every content change anyway.

### D4: Dimming inverts — dim leaves, never containers

`opacity` on an element creates a stacking context, so a descendant cannot opt
back to full opacity. Today's rule dims `> *`, which is why a single `li` inside
a `ul` can never be lit — the fix is not a stronger selector, it is dimming a
different set of elements.

```css
/* today — containers are dimmed, nested units unreachable */
.mdr-reader[data-focus-mode="true"] > *          { opacity: .28 }

/* instead — units are leaves; containers are never dimmed */
.mdr-reader[data-focus-mode="true"] [data-focus-unit]          { opacity: .28 }
.mdr-reader[data-focus-mode="true"] [data-focus-unit].is-focused { opacity: 1 }
```

The three-tier orientation requirement (owning heading stays legible) is one
more class, `is-ancestor`, set on the nearest preceding heading unit at ~0.55.
It is computed from the same flat unit list — scan backwards from the focused
index for the first heading — so it costs an array walk, not a DOM query.

### D5: Jump alignment is `scroll-margin`, not new JS

Outline jumps, `#Lnn` links, backlinks and search all eventually scroll a
target. They currently use `scrollIntoView({block: "start"})` and, in
`scrollRangeIntoView`, hand-rolled `scrollTop` math. Rather than teaching each
call site about the band:

```css
.mdr-reader[data-focus-mode="true"] [data-focus-unit] {
  scroll-margin-block-start: var(--mdr-focus-band);
}
```

`block: "start"` now means "start of the band". Every existing call site is
corrected without being touched, and when focus mode is off the declaration does
not apply, so current alignment is preserved exactly.

`scrollRangeIntoView` (find) does its own arithmetic and does not honour scroll
margin. It gets the smaller treatment: when focus mode is on, scroll the
*containing unit* via `scrollIntoView` instead of the range, then let the
standard selection pass light it. The match highlight is then guaranteed to sit
on a full-opacity unit.

### D6: Geometry is cached; `IntersectionObserver` is removed

The observer (5 thresholds × N units) fires many times per scroll frame and its
callback does exactly what the scroll listener does — it is pure duplicated
work. Removed.

The scroll listener currently calls `getBoundingClientRect()` once per unit per
event: a forced synchronous layout per unit, unthrottled. Replace with:

- a cached array of `{element, top, bottom}` in scroll-container coordinates,
  built once per content change from `offsetTop`/`offsetHeight`;
- one `ResizeObserver` on the reader container to invalidate it (covers font
  size, measure, line height, window resize, and code blocks being replaced by
  highlighted markup mid-flight);
- binary search for the band on scroll, then class updates only when the index
  actually changes.

Scroll work drops from O(N) forced layouts to O(log N) reads against cached
numbers, and no layout at all in the common case.

### D7: Keyboard via `setKeyHandler`, and click focus that survives

`PaneHostValue.setKeyHandler` is the existing pane-scoped keyboard route and has
no users yet; the reader becomes the first. Bindings: `ArrowDown`/`j` next,
`ArrowUp`/`k` previous, `Escape` turns the setting off.

Keyboard and click both do the same two things: set the focused index, and
scroll that unit to the band. Because they scroll, the subsequent scroll event's
containment test re-derives the same unit — so the selection agrees with itself
and click focus is durable without any "sticky until" flag. Today's click
handler sets a class that the next scroll event immediately overwrites; this
removes that bug as a side effect rather than by adding suppression state.

### D8: `focusMode` stays a boolean

A granularity choice (Off / Block / Sentence) is attractive but Sentence needs
its own decisions — notably whether the containing paragraph stays at an
intermediate tier — and `Intl.Segmenter` sentence segmentation is a separate
correctness surface. Keep the boolean; a later change can widen the setting
without invalidating anything specified here, since the spec is written in terms
of "focus units" rather than "blocks".

## Risks / Trade-offs

- **`padding-block: 45vh 55vh` is visible when focus mode is toggled** — the
  document jumps as the scroll extent changes. → Anchor on toggle: record the
  focused unit before the attribute flips, scroll it back to the band after. One
  measurement on a user-initiated action.
- **`vh` is viewport height, not pane height; in split view the pane is shorter
  than the viewport.** → Use container query units (`cqh`) with the scroll pane
  as the container, or a JS-set `--mdr-pane-height` if WebKit container query
  support in the target webview proves unreliable. Decide during implementation
  by checking the actual webview version; both are one declaration.
- **`offsetTop` is relative to the offset parent, not the scroll container.** →
  The reader container is the only thing between a unit and the pane, and units
  nested in a `ul` have the `ul` as offset parent only if it is positioned.
  Accumulate offsets to the scroll container once when building the cache, and
  assert in the self-check that a cached top matches
  `getBoundingClientRect()` for a nested `li`.
- **Cache goes stale if content resizes without the container resizing** —
  e.g. an image loading at intrinsic size inside a fixed-height container. →
  `ResizeObserver` on the container catches the usual cases; images get
  `loading="eager"` semantics already because content is local, and a stale
  cache degrades to a slightly wrong focus for one frame, not a crash.
- **Scroll padding interacts with the existing scroll-tracking for the outline**
  (`handleScroll` uses a fixed 100px threshold). → The outline's active heading
  will lag the focused unit when focus mode is on. Acceptable for this change;
  aligning the outline threshold to the band is a one-line follow-up if it reads
  wrong.
- **Dimming via `opacity` still creates stacking contexts on units.** → Units
  are leaves in the focus model, so nothing inside one needs to escape. Code
  block highlighting, checkboxes and links are unaffected.

## Open Questions

- Settled tuning values:
  - `--mdr-focus-band`: `42cqh` (places the active reading line comfortably above center, keeping upcoming paragraphs in view while leaving ample room for preceding context).
  - Dimmed unit opacity: `0.28` (suppresses distraction while preserving peripheral structure and paragraph shapes).
  - Ancestor heading opacity: `0.55` (distinct middle tier: twice as prominent as dimmed units to maintain section orientation without competing with the focused unit at `1.0`).
  - Transition duration: `180ms ease`, disabled under `prefers-reduced-motion: reduce`.
