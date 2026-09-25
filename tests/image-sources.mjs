/* eslint-disable */
// Validates image source resolution for local markdown images.
// Tests the pure URL-decision and path-resolution logic without browser harness.
import assert from "node:assert";

// Inline copy of decision logic from reader.tsx for testing
function hasScheme(url) {
  return /^(https?:|data:|asset:|mailto:|\/\/)/.test(url);
}

function resolvePath(dir, relative) {
  if (relative.startsWith("/")) {
    return relative;
  }
  const parts = dir.split("/");
  const segments = relative.split("/");
  for (const segment of segments) {
    if (segment === "..") {
      parts.pop();
    } else if (segment !== ".") {
      parts.push(segment);
    }
  }
  return parts.join("/");
}

// Test: scheme detection
assert.strictEqual(hasScheme("https://example.com/img.png"), true, "https: should be recognized");
assert.strictEqual(hasScheme("http://example.com/img.png"), true, "http: should be recognized");
assert.strictEqual(hasScheme("data:image/png;base64,iVBORw0KG"), true, "data: should be recognized");
assert.strictEqual(hasScheme("asset://workspace/file.png"), true, "asset: should be recognized");
assert.strictEqual(hasScheme("mailto:user@example.com"), true, "mailto: should be recognized");
assert.strictEqual(hasScheme("//cdn.example.com/img.png"), true, "protocol-relative should be recognized");
assert.strictEqual(hasScheme("./diagram.png"), false, "relative path should not be recognized");
assert.strictEqual(hasScheme("../images/photo.jpg"), false, "parent-relative should not be recognized");
assert.strictEqual(hasScheme("plain.png"), false, "plain filename should not be recognized");
assert.strictEqual(hasScheme(""), false, "empty string should not be recognized");

// Test: path resolution
const docDir = "/workspace/notes";

assert.strictEqual(
  resolvePath(docDir, "./diagram.png"),
  "/workspace/notes/diagram.png",
  "Same-directory relative path"
);

assert.strictEqual(
  resolvePath(docDir, "../images/photo.jpg"),
  "/workspace/images/photo.jpg",
  "Parent-directory relative path"
);

assert.strictEqual(
  resolvePath(docDir, "plain.png"),
  "/workspace/notes/plain.png",
  "Plain filename resolves to document directory"
);

assert.strictEqual(
  resolvePath(docDir, "../../shared/icon.svg"),
  "/shared/icon.svg",
  "Multiple parent directories"
);

assert.strictEqual(
  resolvePath(docDir, "./sub/./nested/../final.png"),
  "/workspace/notes/sub/final.png",
  "Mixed . and .. segments"
);

assert.strictEqual(
  resolvePath("/workspace/deep/nested/path", "../../../top.png"),
  "/workspace/top.png",
  "Climb multiple levels from deep path"
);

assert.strictEqual(
  resolvePath(docDir, "/absolute/path.png"),
  "/absolute/path.png",
  "Absolute paths pass through unchanged"
);

console.log("✓ All image source resolution tests passed");
