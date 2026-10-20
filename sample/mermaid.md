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

## Wide diagram

This one is wider than the reading column and should scroll inside its figure.

```mermaid
flowchart LR
    N1[Step 1] --> N2[Step 2]
    N2[Step 2] --> N3[Step 3]
    N3[Step 3] --> N4[Step 4]
    N4[Step 4] --> N5[Step 5]
    N5[Step 5] --> N6[Step 6]
    N6[Step 6] --> N7[Step 7]
    N7[Step 7] --> N8[Step 8]
    N8[Step 8] --> N9[Step 9]
    N9[Step 9] --> N10[Step 10]
    N10[Step 10] --> N11[Step 11]
    N11[Step 11] --> N12[Step 12]
    N12[Step 12] --> N13[Step 13]
    N13[Step 13] --> N14[Step 14]
    N14[Step 14] --> N15[Step 15]
    N15[Step 15] --> N16[Step 16]
    N16[Step 16] --> N17[Step 17]
    N17[Step 17] --> N18[Step 18]
    N18[Step 18] --> N19[Step 19]
    N19[Step 19] --> N20[Step 20]
    N20[Step 20] --> N21[Step 21]
    N21[Step 21] --> N22[Step 22]
    N22[Step 22] --> N23[Step 23]
    N23[Step 23] --> N24[Step 24]
    N24[Step 24] --> N25[Step 25]
    N25[Step 25] --> N26[Step 26]
    N26[Step 26] --> N27[Step 27]
    N27[Step 27] --> N28[Step 28]
    N28[Step 28] --> N29[Step 29]
    N29[Step 29] --> N30[Step 30]
```

## Intentionally invalid diagram

This one should show an error caption instead of a rendered diagram, and a lint marker in the editor.

```mermaid
flowchart TD
    A -->
```
