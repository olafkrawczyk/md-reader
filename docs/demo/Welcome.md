# Welcome to md-reader

A calm, native macOS home for your **markdown notes, docs, and specs**.
This folder is a small demo vault — open it, click around, and try the
keyboard shortcuts in the [[Getting Started]] guide.

> **Tip:** Press **⌘E** to flip between reading and writing, **⌥⌘E** for a
> side-by-side split, and **⌘F** to find text in the open document.

## What's inside

| Folder    | What it shows                                        |
| --------- | ---------------------------------------------------- |
| `Projects`| Wikilinks, backlinks, and cross-document references  |
| `Daily`   | Task lists you can tick straight from the reader     |
| `Guides`  | Typography, focus mode, and code highlighting        |

## A quick tour

- **Reader-first** — rendered documents with comfortable type and measure.
- **Edit in place** — toggle to the CodeMirror source when you need to.
- **Research view** — see every document that links back to the one you're reading.
- **Workspace search** — find files by name and text across the whole folder.

### Code, highlighted

```ts
interface Note {
  readonly title: string;
  readonly links: readonly string[];
}

export function backlinksOf(note: Note): readonly string[] {
  return note.links.filter((target) => target !== note.title);
}
```

### Tasks that actually tick

- [x] Open the demo vault
- [x] Read this page
- [ ] Toggle Focus mode in Settings
- [ ] Jump to [[Projects/Alpha|the Alpha project]]

### Wikilinks

Link between notes with `[[Projects/Alpha]]` or relabel them like
[[Guides/Typography|the typography guide]]. Every link becomes a backlink
in the document it points to — no database, just plain files.

---

*Everything here is local. No accounts, no sync, no telemetry.*
