# Focus Mode Test Document

This document has enough height to test the predictable focal band and unit dimming.

## Introduction

Focus mode keeps the active block centered in the focal band while dimming surrounding content.

Paragraph one introduces the concept. As you scroll down or step with keyboard shortcuts, each unit should smoothly transition into the focal area.

## Detailed Units

Each paragraph below is an independent focus unit:

Unit Alpha: When focused, the header above should remain legible while subsequent paragraphs dim down to secondary contrast.

Unit Beta: Scrolling through should hold focus stably without oscillation across boundaries.

Unit Gamma: Code blocks below should act as single focus units even when tall.

```python
def fibonacci(n: int) -> int:
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

for i in range(10):
    print(f"fib({i}) = {fibonacci(i)}")
```

## List Unit Tests

- First list item focusing independently
- Second list item with a child:
  - Nested sub-item riding along with parent
- Third list item

Return to [[README]].

Or read [[tasks]].
