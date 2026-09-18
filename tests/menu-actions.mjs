/* eslint-disable */
// Self-check for menuAction dispatching and prefix routing.
import assert from "node:assert/strict";
import { registerMenuAction, dispatchMenuAction } from "../src/core/menu/menuActions.ts";

{
  let receivedPath = null;
  const unregister = registerMenuAction("open-recent", (arg) => {
    receivedPath = arg;
  });

  dispatchMenuAction("open-recent:/some/path");
  assert.equal(receivedPath, "/some/path", "payload after colon should reach handler");

  dispatchMenuAction("open-recent:/another/deep/dir");
  assert.equal(receivedPath, "/another/deep/dir", "second path reaches handler");

  unregister();
}

{
  let called = false;
  const unregister = registerMenuAction("open-folder", () => {
    called = true;
  });

  dispatchMenuAction("open-folder");
  assert.equal(called, true, "unprefixed id should reach handler");

  unregister();
}

{
  let called = false;
  const unregister = registerMenuAction("open-recent", () => {
    called = true;
  });

  // Unknown unprefixed id ignored
  dispatchMenuAction("unknown-id");
  assert.equal(called, false, "unknown id should be ignored");

  // Unknown prefixed id ignored
  dispatchMenuAction("unknown-prefix:some/arg");
  assert.equal(called, false, "unknown prefix should be ignored");

  unregister();
}

console.log("menuActions: all checks passed");
