/* eslint-disable */
// Playwright harness for post-paint code highlighting.
// Highlighting moved off the render path (it costs ~8.5ms/KB of code and was
// blocking document open for seconds). These checks pin both halves of that
// bargain: the document paints before highlighting runs, and highlighting
// still lands afterwards.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

const CHECKS = [];
function check(name, fn) {
  CHECKS.push({ name, fn });
}
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("vite dev server did not start");
}

function startVite() {
  return spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "inherit", "inherit"] },
  );
}

/** Installs a Tauri bridge stub backed by an in-memory folder before app code runs. */
function tauriStubInit({ folderPath, files }) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    registerListener() {
      return { id: 0 };
    },
    unregisterListener() {},
  };
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
    _nextCallbackId: 0,
    _callbacks: {},
    _folder: folderPath,
    _tree: Object.keys(files).map((name) => ({
      name,
      path: `${folderPath}/${name}`,
      kind: "file",
    })),
    _files: Object.fromEntries(
      Object.entries(files).map(([name, contents]) => [`${folderPath}/${name}`, contents]),
    ),
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
        case "plugin:event|listen":
        case "plugin:event|unlisten":
          return Promise.resolve(0);
        default:
          return Promise.reject(new Error(`unexpected command: ${command}`));
      }
    },
  };
}

// Blocks differ per index so the highlighter cache cannot collapse the whole
// document into one entry — each block is a genuine miss on the first pass.
const tsBlock = (n = 0) =>
  [
    "```typescript",
    `const greeting${n}: string = compute(a, b).map((v) => v * ${n});`,
    "```",
    "",
  ].join("\n");

const TS_BLOCK = tsBlock();

// ~200KB of code: a block count and byte size that took seconds synchronously.
const HEAVY_DOC = ["# Heavy", "", "Intro paragraph.", ""]
  .concat(Array.from({ length: 200 }, (_, i) => tsBlock(i)))
  .join("\n");

const MIXED_DOC = [
  "# Mixed",
  "",
  TS_BLOCK,
  "```",
  "plain unlabeled block",
  "```",
  "",
  "```nosuchlang",
  "unknown language block",
  "```",
  "",
].join("\n");

async function openFolder(page) {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "heavy.md" }).waitFor();
}

async function openFile(page, name) {
  await page.locator(".mdr-explorer-row", { hasText: name }).click();
  await page.locator(".mdr-reader").waitFor();
}

// 1. The reason for the change: prose paints without waiting on highlighting.
check("heavy document paints before highlighting finishes", async (page) => {
  await openFolder(page);
  const start = Date.now();
  await page.locator(".mdr-explorer-row", { hasText: "heavy.md" }).click();
  // Prose is visible as soon as the sync pipeline is done...
  await page.locator(".mdr-reader h1", { hasText: "Heavy" }).waitFor();
  const paint = Date.now() - start;
  // ...and at that moment the code is still plain, i.e. highlighting had not
  // blocked the paint. (Idle callbacks cannot run before first paint.)
  const highlightedAtPaint = await page.locator(".mdr-reader pre.shiki").count();
  assert(
    paint < 2000,
    `first paint took ${paint}ms — highlighting looks like it is back on the render path`,
  );
  assert(
    highlightedAtPaint < 200,
    "every block was highlighted before first paint — highlighting is still synchronous",
  );
  console.log(`   (painted in ${paint}ms, ${highlightedAtPaint} blocks highlighted at paint)`);
});

async function highlightAll(page, count) {
  const start = Date.now();
  await page.waitForFunction(
    (n) => document.querySelectorAll(".mdr-reader pre.shiki").length === n,
    count,
    { timeout: 30000 },
  );
  return Date.now() - start;
}

let coldMs = 0;

// 2. The other half of the bargain: it does still highlight, all of it.
check("all labeled blocks highlight after paint", async (page) => {
  coldMs = await highlightAll(page, 200);
  const plain = await page.locator(".mdr-reader pre:not(.shiki)").count();
  assert(plain === 0, `${plain} labeled blocks never highlighted`);
});

// 3. Unlabeled and unknown languages keep the plain fallback, not an error.
check("unlabeled and unknown-language blocks stay plain", async (page) => {
  await openFile(page, "mixed.md");
  await page.waitForFunction(
    () => document.querySelectorAll(".mdr-reader pre.shiki").length === 1,
    undefined,
    { timeout: 30000 },
  );
  const plain = await page.locator(".mdr-reader pre:not(.shiki)").count();
  assert(plain === 2, `expected 2 plain blocks (unlabeled + unknown), got ${plain}`);
  const text = await page.locator(".mdr-reader").innerText();
  assert(text.includes("plain unlabeled block"), "unlabeled block lost its content");
  assert(text.includes("unknown language block"), "unknown-language block lost its content");
});

// 4. Switching away mid-highlight must not paint one document's code into
//    another — the cancellation path.
check("switching documents mid-highlight leaves no cross-contamination", async (page) => {
  await openFile(page, "heavy.md");
  await page.locator(".mdr-reader h1", { hasText: "Heavy" }).waitFor();
  await openFile(page, "mixed.md"); // switch while heavy is still highlighting
  await page.locator(".mdr-reader h1", { hasText: "Mixed" }).waitFor();
  await page.waitForTimeout(1500);
  const blocks = await page.locator(".mdr-reader pre").count();
  assert(blocks === 3, `mixed.md should show 3 code blocks, found ${blocks}`);
  const text = await page.locator(".mdr-reader").innerText();
  assert(!text.includes("Heavy"), "previous document's content leaked into the pane");
});

// 5. Re-rendering the same document must not re-pay the highlighting cost.
//    Reopening exercises the same path a keystroke does: fresh markup, every
//    block re-submitted, all but the edited one served from the cache.
check("re-rendering a highlighted document is served from cache", async (page) => {
  await openFile(page, "mixed.md");
  await page.locator(".mdr-reader h1", { hasText: "Mixed" }).waitFor();
  await openFile(page, "heavy.md");
  await page.locator(".mdr-reader h1", { hasText: "Heavy" }).waitFor();
  const warmMs = await highlightAll(page, 200);
  assert(
    warmMs * 4 < coldMs,
    `warm pass took ${warmMs}ms vs ${coldMs}ms cold — cache is not taking effect`,
  );
  console.log(`  (${coldMs}ms cold, ${warmMs}ms warm)`);
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-test-"));
  const vite = startVite();
  const pageErrors = [];
  let failed = false;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(tauriStubInit, {
      folderPath: workspaceDir,
      files: { "heavy.md": HEAVY_DOC, "mixed.md": MIXED_DOC },
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.locator(".mdr-welcome").waitFor();

    for (const { name, fn } of CHECKS) {
      process.stdout.write(`- ${name} ... `);
      await fn(page);
      process.stdout.write("OK\n");
    }
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join("; ")}`);

    await browser.close();
  } catch (error) {
    failed = true;
    process.stdout.write("FAIL\n");
    console.error(error);
  } finally {
    vite.kill();
    await rm(workspaceDir, { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
}

main();
