/* eslint-disable */
// Pure logic tests for session restore (serialize/deserialize/clamp).
import { strict as assert } from "node:assert";

// Inline from src/core/state/session.ts (no .ts import in plain node).
function serialize(workspaceRoot, tabPaths, activePath) {
  if (workspaceRoot === null) {
    return null;
  }
  const activeIndex = activePath === null ? 0 : tabPaths.indexOf(activePath);
  const state = {
    workspaceRoot,
    tabPaths,
    activeIndex: activeIndex === -1 ? 0 : activeIndex,
  };
  return JSON.stringify(state);
}

function deserialize(json) {
  if (json === null || json === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(json);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "workspaceRoot" in parsed &&
      "tabPaths" in parsed &&
      "activeIndex" in parsed &&
      typeof parsed.workspaceRoot === "string" &&
      Array.isArray(parsed.tabPaths) &&
      parsed.tabPaths.every((p) => typeof p === "string") &&
      typeof parsed.activeIndex === "number"
    ) {
      const clamped =
        parsed.tabPaths.length === 0
          ? 0
          : Math.max(0, Math.min(parsed.activeIndex, parsed.tabPaths.length - 1));
      return {
        workspaceRoot: parsed.workspaceRoot,
        tabPaths: parsed.tabPaths,
        activeIndex: clamped,
      };
    }
  } catch {
    // Bad JSON falls through to null.
  }
  return null;
}

// Tests
const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

test("round-trip with active tab", () => {
  const json = serialize("/workspace", ["/workspace/a.md", "/workspace/b.md"], "/workspace/b.md");
  const state = deserialize(json);
  assert.deepEqual(state, {
    workspaceRoot: "/workspace",
    tabPaths: ["/workspace/a.md", "/workspace/b.md"],
    activeIndex: 1,
  });
});

test("null workspace → null", () => {
  assert.strictEqual(serialize(null, ["/a.md"], "/a.md"), null);
});

test("empty tabs → valid session", () => {
  const json = serialize("/workspace", [], null);
  const state = deserialize(json);
  assert.deepEqual(state, {
    workspaceRoot: "/workspace",
    tabPaths: [],
    activeIndex: 0,
  });
});

test("null activePath → index 0", () => {
  const json = serialize("/workspace", ["/workspace/a.md"], null);
  const state = deserialize(json);
  assert.strictEqual(state.activeIndex, 0);
});

test("missing activePath → index 0", () => {
  const json = serialize("/workspace", ["/workspace/a.md"], "/workspace/missing.md");
  const state = deserialize(json);
  assert.strictEqual(state.activeIndex, 0);
});

test("garbage JSON → null", () => {
  assert.strictEqual(deserialize("{not valid json"), null);
});

test("null JSON → null", () => {
  assert.strictEqual(deserialize(null), null);
});

test("empty string → null", () => {
  assert.strictEqual(deserialize(""), null);
});

test("missing fields → null", () => {
  assert.strictEqual(deserialize('{"workspaceRoot":"/w"}'), null);
});

test("wrong types → null", () => {
  assert.strictEqual(deserialize('{"workspaceRoot":123,"tabPaths":[],"activeIndex":0}'), null);
  assert.strictEqual(deserialize('{"workspaceRoot":"/w","tabPaths":"not-array","activeIndex":0}'), null);
  assert.strictEqual(deserialize('{"workspaceRoot":"/w","tabPaths":[123],"activeIndex":0}'), null);
});

test("activeIndex out of range → clamped", () => {
  const json = JSON.stringify({
    workspaceRoot: "/workspace",
    tabPaths: ["/workspace/a.md", "/workspace/b.md"],
    activeIndex: 99,
  });
  const state = deserialize(json);
  assert.strictEqual(state.activeIndex, 1);

  const json2 = JSON.stringify({
    workspaceRoot: "/workspace",
    tabPaths: ["/workspace/a.md"],
    activeIndex: -5,
  });
  const state2 = deserialize(json2);
  assert.strictEqual(state2.activeIndex, 0);
});

test("empty tabs with activeIndex → clamped to 0", () => {
  const json = JSON.stringify({
    workspaceRoot: "/workspace",
    tabPaths: [],
    activeIndex: 5,
  });
  const state = deserialize(json);
  assert.strictEqual(state.activeIndex, 0);
});

// Run all
for (const { name, fn } of TESTS) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}
console.log(`\n${TESTS.length} tests passed`);
