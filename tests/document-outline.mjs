/* eslint-disable */
// Playwright harness for the document outline (spec scenarios, tasks 1.1-1.4).
// Runs the vite dev server, stubs the Tauri IPC bridge with an in-memory
// workspace seeded with multi-level heading markdown, and drives the real
// reader UI: extraction, hierarchy indentation, jump navigation, and
// scroll-synced active heading highlight.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5201;
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
  const child = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "inherit", "inherit"] },
  );
  return child;
}

/** Installs a Tauri bridge stub backed by an in-memory folder before app code runs. */
function tauriStubInit({ folderPath, fileName, fileContents }) {
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
        case "plugin:event|listen":
        case "plugin:event|unlisten":
          return Promise.resolve(0);
        default:
          return Promise.reject(new Error(`unexpected command: ${command}`));
      }
    },
  };
}

const OUTLINE_DOC = [
  "# Introduction",
  "",
  "Intro paragraph. ".repeat(40),
  "",
  "## Background",
  "",
  "Background paragraph. ".repeat(40),
  "",
  "### Deep details",
  "",
  "Details paragraph. ".repeat(40),
  "",
  "## Usage",
  "",
  "Usage paragraph. ".repeat(40),
  "",
].join("\n");

const NO_HEADING_DOC = [
  "Just a plain document.",
  "",
  "No headings at all here.",
  "",
].join("\n");

async function openDocument(page) {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "doc.md" }).waitFor();
  await page.locator(".mdr-explorer-row", { hasText: "doc.md" }).click();
  await page.locator(".mdr-reader").waitFor();
}

function outlineItems(page) {
  return page.locator(".mdr-outline-item");
}

// 1. Outline popover opens and extracts H1-H3 in order.
check("outline popover lists headings in document order", async (page) => {
  await openDocument(page);
  await page.locator(".mdr-outline-toolbar-wrapper .mdr-quiet-button").click();
  await page.locator(".mdr-outline-popover").waitFor();
  const titles = await page.locator(".mdr-outline-item .mdr-outline-title").allTextContents();
  assert(
    JSON.stringify(titles) === JSON.stringify([
      "Introduction",
      "Background",
      "Deep details",
      "Usage",
    ]),
    `unexpected outline entries: ${JSON.stringify(titles)}`,
  );
});

// 2. Heading ids are slugged and rendered into the reader.
check("reader headings carry slugged ids", async (page) => {
  const ids = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".mdr-reader h1, .mdr-reader h2, .mdr-reader h3")).map(
      (el) => el.id,
    ),
  );
  assert(
    JSON.stringify(ids) === JSON.stringify(["introduction", "background", "deep-details", "usage"]),
    `unexpected heading ids: ${JSON.stringify(ids)}`,
  );
});

// 3. Clicking an outline entry scrolls the reader to the heading.
check("outline click scrolls the reader to the heading", async (page) => {
  const target = page.locator(".mdr-outline-item", { hasText: "Usage" });
  await target.locator(".mdr-outline-link").click();
  await page.locator(".mdr-outline-popover").waitFor({ state: "detached" });
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mdr-reader h2[id="usage"]');
    if (heading === null) return false;
    const rect = heading.getBoundingClientRect();
    return rect.top >= 0 && rect.top < window.innerHeight;
  });
});

// 4. Scrolling updates the active heading highlight in the outline.
check("scrolling marks the current section active in the outline", async (page) => {
  await page.locator(".mdr-outline-toolbar-wrapper .mdr-quiet-button").click();
  await page.locator(".mdr-outline-popover").waitFor();
  await page.evaluate(() => {
    document.querySelector('.mdr-reader h2[id="background"]')?.scrollIntoView();
  });
  await page.waitForFunction(() => {
    const active = document.querySelector('.mdr-outline-item[data-active="true"] .mdr-outline-title');
    return active !== null && active.textContent === "Background";
  });
});

// 5. slugify normalizes punctuation/case (unit-level check via module import).
check("slugify normalizes punctuation and case", async (page) => {
  const slug = await page.evaluate(async () => {
    const module = await import("/src/extensions/markdownContract.ts");
    return module.slugify("Hello, World!  Again — mixed CASE");
  });
  assert(slug === "hello-world-again-mixed-case", `unexpected slug: ${slug}`);
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-test-"));
  const fileName = "doc.md";

  const vite = startVite();
  const pageErrors = [];
  let failed = false;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(tauriStubInit, {
      folderPath: workspaceDir,
      fileName,
      fileContents: OUTLINE_DOC,
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

    // Empty-state scenario: swap the file contents for a heading-less doc.
    const context2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context2.addInitScript(tauriStubInit, {
      folderPath: workspaceDir,
      fileName,
      fileContents: NO_HEADING_DOC,
    });
    const page2 = await context2.newPage();
    page2.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    await page2.goto(BASE, { waitUntil: "networkidle" });
    await page2.locator(".mdr-welcome").waitFor();
    await openDocument(page2);
    await page2.locator(".mdr-outline-toolbar-wrapper .mdr-quiet-button").click();
    await page2.locator(".mdr-outline-popover").waitFor();
    const emptyState = await page2
      .locator(".mdr-outline-popover .mdr-empty")
      .textContent()
      .catch(() => null);
    assert(
      emptyState !== null && emptyState.includes("No headings"),
      `expected empty-state message, got: ${emptyState}`,
    );
    await browser.close();
  } catch (error) {
    failed = true;
    process.stderr.write(`\nFAILED: ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    vite.kill("SIGTERM");
    await rm(workspaceDir, { recursive: true, force: true });
  }
  if (!failed) {
    process.stdout.write(`\nAll ${CHECKS.length + 1} checks passed.\n`);
  }
  process.exit(failed ? 1 : 0);
}

main();
