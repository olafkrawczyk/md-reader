/* eslint-disable */
// Self-check for the pure mermaid helpers (tokenizer, templates, fence opener
// detection, error parsing). No browser: node strips the types and runs the
// real source. `npm run test:mermaid:syntax`.
import assert from "node:assert/strict";
import { StringStream } from "@codemirror/language";
import {
  isMermaidInfo,
  mermaidStreamParser,
  MERMAID_TEMPLATES,
  fenceOpenerPrefix,
  mermaidErrorLine,
  mermaidErrorMessage,
} from "../src/extensions/mermaidSyntax.ts";

// Drive the tokenizer over one line -> [[text, style], ...], skipping whitespace.
function tokens(line) {
  const state = mermaidStreamParser.startState();
  const stream = new StringStream(line, 4, 2);
  const out = [];
  while (!stream.eol()) {
    const start = stream.pos;
    stream.start = start; // StreamLanguage does this before each token
    const style = mermaidStreamParser.token(stream, state);
    assert.ok(stream.pos > start, `tokenizer must advance at ${start} in ${line}`);
    if (style !== null) out.push([line.slice(start, stream.pos), style]);
  }
  return out;
}
const styleOf = (line, text) => tokens(line).find(([t]) => t === text)?.[1];

assert.ok(isMermaidInfo("mermaid") && isMermaidInfo("Mermaid") && isMermaidInfo("mermaid title"));
assert.ok(!isMermaidInfo("mermaidx") && !isMermaidInfo("") && !isMermaidInfo("js"));

assert.deepEqual(styleOf("flowchart TD", "flowchart"), "keyword");
assert.deepEqual(styleOf("stateDiagram-v2", "stateDiagram-v2"), "keyword");
assert.deepEqual(styleOf('A["Start"] --> B', "-->"), "operator");
assert.deepEqual(styleOf('A["Start"] --> B', '"Start"'), "string");
assert.deepEqual(styleOf("A[Start] --> B", "[Start]"), "string");
assert.deepEqual(styleOf("B{Is it?}", "{Is it?}"), "string");
assert.deepEqual(styleOf("%% a note", "%% a note"), "comment");
assert.deepEqual(styleOf("    participant Alice", "participant"), "keyword");
assert.deepEqual(styleOf("A ->> B: hi", "->>"), "operator");
assert.deepEqual(styleOf("A -->> B: hi", "-->>"), "operator");
assert.deepEqual(styleOf("A -.-> B", "-.->"), "operator");
assert.deepEqual(styleOf("A ==> B", "==>"), "operator");
assert.deepEqual(styleOf("A --x B", "--x"), "operator");
assert.deepEqual(styleOf("Foo <|-- Bar", "<|--"), "operator");
assert.deepEqual(styleOf("Foo *-- Bar", "*--"), "operator");
assert.deepEqual(styleOf("Foo o-- Bar", "o--"), "operator");
assert.deepEqual(styleOf("Foo ..> Bar", "..>"), "operator");
assert.deepEqual(styleOf("CUSTOMER ||--o{ ORDER : places", "||--o{"), "operator");
assert.deepEqual(styleOf("A }|..|{ B", "}|..|{"), "operator");
assert.deepEqual(styleOf('"Dogs" : 386', "386"), "number");
// A word that merely starts with an arrow letter is not an arrow.
assert.equal(styleOf("orders --> B", "orders"), undefined);

assert.deepEqual(MERMAID_TEMPLATES.map((t) => t.label), [
  "mermaid · flowchart", "mermaid · sequence", "mermaid · class", "mermaid · state",
  "mermaid · ER", "mermaid · gantt", "mermaid · pie", "mermaid · mindmap",
]);
assert.match(MERMAID_TEMPLATES[1].body, /^sequenceDiagram\n/);
for (const t of MERMAID_TEMPLATES) {
  assert.match(t.body, /\$\{1:/, `${t.label} has a first tab stop`);
  assert.ok(!t.body.includes("```"), `${t.label} body has no fences`);
}

assert.ok(fenceOpenerPrefix("```", 0));
assert.ok(fenceOpenerPrefix("```mer", 2));
assert.ok(fenceOpenerPrefix("  ```MERMAID", 0));
assert.ok(!fenceOpenerPrefix("```", 1), "closing an open block");
assert.ok(!fenceOpenerPrefix("```js", 0));
assert.ok(!fenceOpenerPrefix("```mermaidx", 0));
assert.ok(!fenceOpenerPrefix("text ```", 0));

assert.equal(mermaidErrorLine({ hash: { loc: { first_line: 3 } } }), 3);
assert.equal(mermaidErrorLine({ hash: { line: 1 } }), 2);
assert.equal(mermaidErrorLine({ message: "Parsing failed: unexpected token at line 4, column 2" }), 4);
assert.equal(mermaidErrorLine({ message: "nope" }), null);
assert.equal(mermaidErrorLine(null), null);
assert.equal(mermaidErrorMessage(new Error("\n  Parse error on line 3:\n...A--\n")), "Parse error on line 3:");
assert.equal(mermaidErrorMessage(undefined), "Unknown error");

console.log("mermaid syntax: ok");
