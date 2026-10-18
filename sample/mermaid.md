# Mermaid Diagrams

One diagram per supported starter template, for checking rendering in light and dark themes.

## Flowchart

```mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Done]
    B -->|No| A
```

## Sequence

```mermaid
sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello
    Bob-->>Alice: Hi back
```

## Class

```mermaid
classDiagram
    class Animal {
        +String name
        +speak()
    }
    class Dog
    Animal <|-- Dog
```

## State

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Running: start
    Running --> [*]
```

## Entity Relationship

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER {
        int id
    }
```

## Gantt

```mermaid
gantt
    title Plan
    dateFormat YYYY-MM-DD
    section Phase
    Task :a1, 2024-01-01, 7d
```

## Pie

```mermaid
pie title Pets
    "Dogs" : 386
    "Cats" : 85
```

## Mindmap

```mermaid
mindmap
  root((Topic))
    Branch A
    Branch B
```

## Intentionally invalid diagram

This one should show an error caption instead of a rendered diagram, and a lint marker in the editor.

```mermaid
flowchart TD
    A -->
```
