/* eslint-disable */
// Regression test: a code block that is the focal unit must be genuinely
// focused, fully opaque, and STILL syntax-highlighted in focus mode.
// Runs in WebKit — the engine the macOS Tauri webview actually uses, where
// requestIdleCallback is absent and the setTimeout fallback drives highlighting.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webkit } from "playwright";

const PORT = 5226;
const BASE = `http://localhost:${PORT}`;

const CHECKS = [];
function check(name, fn) {
  CHECKS.push({ name, fn });
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("vite dev server did not start");
}

function startVite() {
  return spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "ignore", "ignore"] },
  );
}

/** Tauri bridge stub backed by an in-memory folder. */
function tauriStubInit({ folderPath, fileName, fileContents }) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    registerListener() {
      return { id: 0 };
    },
    unregisterListener() {},
  };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    _nextCallbackId: 0,
    _callbacks: {},
    _folder: folderPath,
    _tree: [{ name: fileName, path: `${folderPath}/${fileName}`, kind: "file" }],
    _files: { [`${folderPath}/${fileName}`]: fileContents },
    transformCallback(callback) {
      const T = window.__TAURI_INTERNALS__;
      const id = T._nextCallbackId++;
      T._callbacks[id] = callback;
      return id;
    },
    invoke(command, args) {
      const T = window.__TAURI_INTERNALS__;
      switch (command) {
        case "plugin:dialog|open":
          return Promise.resolve(T._folder);
        case "activate_workspace":
          return Promise.resolve(null);
        case "read_dir_tree":
          return Promise.resolve(T._tree);
        case "read_text_file":
          return Promise.resolve(T._files[args.path] ?? "");
        case "write_text_file":
          T._files[args.path] = args.contents;
          return Promise.resolve(null);
        case "recent_folders":
          return Promise.resolve([]);
        case "set_ignored_directories":
        case "set_workspace_menu_enabled":
        case "plugin:event|listen":
        case "plugin:event|unlisten":
          return Promise.resolve(0);
        default:
          return Promise.reject(new Error(`unexpected command: ${command}`));
      }
    },
  };
}

const CODE = [
  "// a comment",
  'const greeting = "hello world";',
  "function add(a, b) {",
  "  return a + b;",
  "}",
].join("\n");

const DOC = ["# Focus And Code", "", "Intro paragraph.", "", "```javascript", CODE, "```", ""].join("\n");

async function openDocument(page) {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "code.md" }).waitFor();
  await page.locator(".mdr-explorer-row", { hasText: "code.md" }).click();
  await page.locator(".mdr-reader").waitFor();
}

async function enableFocusMode(page) {
  const toggle = page.locator('button[title*="Focus Mode"]');
  if ((await toggle.getAttribute("title")) === "Enable Focus Mode") {
    await toggle.click();
  }
  await page.locator('.mdr-reader[data-focus-mode="true"]').waitFor();
}

/** Reads the live state of the code block and whichever unit holds focus. */
async function readState(page) {
  return page.evaluate(() => {
    const reader = document.querySelector(".mdr-reader");
    const pre = reader.querySelector("pre");
    const focused = reader.querySelector(".is-focused");
    const spans = pre ? Array.from(pre.querySelectorAll("span")) : [];
    const colors = spans.map((s) => getComputedStyle(s).color);
    return {
      preIsShiki: pre?.classList.contains("shiki") ?? false,
      preConnected: pre?.isConnected ?? false,
      preFocused: pre?.classList.contains("is-focused") ?? false,
      preOpacity: pre ? Number(getComputedStyle(pre).opacity) : null,
      preIsFocusedNode: focused !== null && focused === pre,
      focusedIsConnected: focused?.isConnected ?? false,
      focusedIsShiki: focused?.classList.contains("shiki") ?? false,
      distinctSpanColors: [...new Set(colors)].length,
      spanCount: spans.length,
    };
  });
}

/** Scrolls so the code block (the last unit) sits inside the focal band. */
async function scrollCodeBlockIntoBand(page) {
  await page.evaluate(() => {
    const pane = document.querySelector('[data-pane-id="reader"]');
    pane.scrollTop = pane.scrollHeight;
    pane.dispatchEvent(new Event("scroll"));
  });
  // Long enough for the 180ms opacity transition to settle.
  await page.waitForTimeout(600);
}

check("code block is syntax-highlighted before focus mode", async (page) => {
  await page.waitForFunction(() => document.querySelector("pre.shiki") !== null, null, { timeout: 15000 });
  const state = await readState(page);
  assert(state.preIsShiki, "expected a shiki-highlighted pre");
  assert(state.distinctSpanColors > 1, `expected varied token colours, got ${state.distinctSpanColors}`);
});

check("focused code block is fully opaque and still highlighted", async (page) => {
  await enableFocusMode(page);
  await scrollCodeBlockIntoBand(page);

  const state = await readState(page);
  assert(state.preFocused, `code block should be the focused unit, got ${JSON.stringify(state)}`);
  assert(state.preIsFocusedNode, "the focused node should be the code block itself");
  assert(state.preOpacity === 1, `focused code block should be opaque, got ${state.preOpacity}`);

  // The complaint this locks in: focus mode must not strip syntax highlighting.
  assert(
    state.distinctSpanColors > 1,
    `focused code block lost its highlighting: ${state.distinctSpanColors} distinct colour(s)`,
  );
});

check("focused code block is the live node, not a stale detached one", async (page) => {
  // The focus cache stores element references; the idle-sliced highlighter
  // replaces each <pre> via replaceWith(). If the cache goes stale, the class
  // lands on a detached node and the live block stays dim.
  await scrollCodeBlockIntoBand(page);
  const state = await readState(page);
  assert(state.preConnected, "code block should be connected to the document");
  assert(state.focusedIsConnected, "the focused unit must be connected to the document");
  assert(state.focusedIsShiki, "the focused unit must be the live shiki pre, not the original");
});

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "focus-code-"));
  const child = startVite();
  let browser;
  let failures = 0;
  try {
    await waitForServer();
    browser = await webkit.launch();
    const page = await browser.newPage();
    const folder = join(dir, "ws");
    await page.addInitScript(tauriStubInit, {
      folderPath: folder,
      fileName: "code.md",
      fileContents: DOC,
    });
    await page.goto(BASE);
    await openDocument(page);

    for (const { name, fn } of CHECKS) {
      try {
        await fn(page);
        console.log(`✓ ${name}`);
      } catch (error) {
        failures++;
        console.error(`✗ ${name}\n    ${error.message}`);
      }
    }
  } finally {
    if (browser) await browser.close();
    child.kill();
    await rm(dir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} of ${CHECKS.length} checks failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${CHECKS.length} checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
