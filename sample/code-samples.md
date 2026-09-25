# Code Highlighting Samples

Verifying Shiki syntax highlighting and unlabeled code fallbacks.

## Rust

```rust
use std::path::PathBuf;

pub fn list_recents() -> Vec<PathBuf> {
    vec![
        PathBuf::from("/Users/alice/notes"),
        PathBuf::from("/Users/alice/projects"),
    ]
}
```

## TypeScript

```typescript
export interface Shortcut {
  readonly keys: string;
  readonly action: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: "⌘O", action: "Open Folder…" },
  { keys: "⌘E", action: "Toggle Mode" },
];
```

## CSS

```css
:root {
  --mdr-color-accent: #007aff;
  --mdr-radius: 6px;
}

.mdr-shortcuts-keys kbd {
  font-family: var(--mdr-font-ui);
  padding: 2px 6px;
}
```

## Unlabeled Fallback Block

```
Plain preformatted text block without language tag.
Should render cleanly in the reader pane with standard styling.
```

Reference: [[README]]
