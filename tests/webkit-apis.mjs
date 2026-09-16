/* eslint-disable */
// Guards against using browser APIs the Tauri webview does not have.
//
// The macOS Tauri webview is WKWebView (Safari/WebKit), not Chromium. Vite's
// build target is already set to safari13, but that only rewrites syntax —
// it does not polyfill missing host APIs. requestIdleCallback in particular
// is absent in WebKit, so a bare call throws a ReferenceError; inside a
// React effect that unmounts the pane and blanks the app, which is how the
// read/edit switch was crashing.
//
// This asserts against real WebKit rather than a hardcoded list, so it keeps
// working as WebKit gains APIs. Run: node tests/webkit-apis.mjs
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { webkit } from "playwright";

const SRC = new URL("../src/", import.meta.url).pathname;

// Globals that source code may call bare. Extend when a new one bites.
const GUARDED = [
  "requestIdleCallback",
  "cancelIdleCallback",
  "scheduler",
  "structuredClone",
  "reportError",
];

async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await sourceFiles(full)));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const browser = await webkit.launch();
  const page = await browser.newPage();
  await page.goto("about:blank");
  const missing = await page.evaluate(
    (names) => names.filter((n) => typeof globalThis[n] === "undefined"),
    GUARDED,
  );
  await browser.close();

  console.log(`WebKit lacks: ${missing.join(", ") || "(none)"}`);

  const failures = [];
  for (const file of await sourceFiles(SRC)) {
    const text = await readFile(file, "utf8");
    for (const name of missing) {
      // A bare call `foo(` that is not guarded by a typeof check anywhere in
      // the file. The guarded form assigns through a feature-detected const.
      const called = new RegExp(`(^|[^.\\w"'\`])${name}\\s*\\(`, "m").test(text);
      const guarded = new RegExp(`typeof\\s+${name}`).test(text);
      if (called && !guarded) {
        failures.push(`${file.replace(SRC, "src/")}: calls ${name}(), absent in WebKit`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("FAILED:\n  " + failures.join("\n  "));
    process.exit(1);
  }
  console.log("OK - no unguarded use of WebKit-missing globals");
}

await main();
