/* eslint-disable */
// Playwright harness for native workspace search (spec scenarios, tasks 3.1-3.6).
// Runs the vite dev server, stubs the Tauri IPC bridge with an in-memory
// workspace and stubbed workspace_search command, and asserts:
// - submitting a query returns grouped file matches with snippets
// - case-insensitive matching is supported
// - empty state displays when no matches are found
// - clicking a match opens the target file in document tabs
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5205;
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
        case "workspace_search": {
          const q = (args.query || "").toLowerCase();
          const matches = [];
          if (!q.trim()) return Promise.resolve(matches);
          for (const [name, content] of Object.entries(files)) {
            const lines = content.split("\n");
            lines.forEach((line, idx) => {
              const lower = line.toLowerCase();
              let start = 0;
              while ((start = lower.indexOf(q, start)) !== -1) {
                matches.push({
                  filePath: `${folderPath}/${name}`,
                  relativePath: name,
                  lineNumber: idx + 1,
                  lineContent: line,
                  matchStart: start,
                  matchEnd: start + q.length,
                });
                start += q.length;
              }
            });
          }
          return Promise.resolve(matches);
        }
        default:
          return Promise.reject(new Error(`unexpected command: ${command}`));
      }
    },
  };
}

const FILES = {
  "api.md": [
    "# API Reference",
    "",
    "Tauri commands for high performance workspace operations.",
    "Native rust backend handles file search across markdown files.",
    "",
  ].join("\n"),
  "guide.md": [
    "# Getting Started",
    "",
    "Using Tauri with React and Rust.",
    "Search features are built with ripgrep speeds.",
    "",
  ].join("\n"),
  "empty.md": [
    "# Plain document",
    "",
    "Nothing special here.",
    "",
  ].join("\n"),
};

// 1. Submitting a query returns grouped file matches with highlighted snippets
check("search popover displays grouped file matches and snippets", async (page) => {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-workspace-search-toolbar-wrapper .mdr-quiet-button").click();
  await page.locator(".mdr-workspace-search-popover").waitFor();

  const input = page.locator(".mdr-workspace-search-popover input");
  await input.fill("tauri");

  await page.locator(".mdr-search-group").first().waitFor();
  const groups = await page.locator(".mdr-search-group-header").allTextContents();
  assert(
    groups.includes("api.md") && groups.includes("guide.md"),
    `expected api.md and guide.md in results, got: ${JSON.stringify(groups)}`,
  );

  const snippets = await page.locator(".mdr-search-line").allTextContents();
  assert(
    snippets.some((s) => s.includes("high performance workspace operations")),
    `expected matching snippet content, got: ${JSON.stringify(snippets)}`,
  );

  const highlightText = await page.locator(".mdr-search-highlight").first().innerText();
  assert(
    highlightText.toLowerCase() === "tauri",
    `expected highlight text "tauri", got "${highlightText}"`,
  );
});

// 2. Empty state displays when no matches are found
check("empty state displays when no matches found", async (page) => {
  const input = page.locator(".mdr-workspace-search-popover input");
  await input.fill("nonexistentqueryxyz");
  await page.waitForFunction(() => {
    const el = document.querySelector(".mdr-workspace-search-popover .mdr-empty");
    return el !== null && el.textContent.includes("No results");
  });
});

// 3. Clicking a match opens the target file in document tabs
check("clicking search match opens target document in tab", async (page) => {
  const input = page.locator(".mdr-workspace-search-popover input");
  await input.fill("ripgrep");
  await page.locator(".mdr-search-match").first().waitFor();
  await page.locator(".mdr-search-match").first().click();

  await page.waitForFunction(() => {
    const activeTab = document.querySelector('.mdr-tab[data-active="true"] .mdr-tab-name');
    return activeTab !== null && activeTab.textContent === "guide.md";
  });
  const heading = await page.locator(".mdr-reader h1").innerText();
  assert(heading === "Getting Started", `expected guide.md to be open, got "${heading}"`);
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-test-search-"));

  const vite = startVite();
  const pageErrors = [];
  let failed = false;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(tauriStubInit, {
      folderPath: workspaceDir,
      files: FILES,
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
    process.stderr.write(`\nFAILED: ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    vite.kill("SIGTERM");
    await rm(workspaceDir, { recursive: true, force: true });
  }
  if (!failed) {
    process.stdout.write(`\nAll ${CHECKS.length} checks passed.\n`);
  }
  process.exit(failed ? 1 : 0);
}

main();
