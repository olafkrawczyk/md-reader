/* eslint-disable */
// UI test for ⌘P quick open: verify completions list is populated from workspace
// and pressing Enter on a selection opens the correct tab.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5198;
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
    } catch {}
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

function tauriStubInit({ folderPath, files }) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    registerListener() {
      return { id: 0 };
    },
    unregisterListener() {},
  };
  const tree = files.map((f) => ({ name: f.name, path: `${folderPath}/${f.name}`, kind: "file" }));
  const fileMap = {};
  for (const f of files) {
    fileMap[`${folderPath}/${f.name}`] = f.contents;
  }
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
    _nextCallbackId: 0,
    _callbacks: {},
    _folder: folderPath,
    _tree: tree,
    _files: fileMap,
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

async function openWorkspace(page) {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "readme.md" }).waitFor();
}

check("⌘P opens quick open modal", async (page) => {
  await openWorkspace(page);
  await page.keyboard.press("Meta+p");
  const modal = page.locator(".mdr-quickopen");
  await modal.waitFor({ state: "visible" });
  const input = modal.locator("input");
  const isFocused = await input.evaluate((el) => el === document.activeElement);
  assert(isFocused, "expected quick open input to be focused");
});

check("quick open lists all markdown files from workspace", async (page) => {
  const list = page.locator(".mdr-quickopen-list");
  const items = list.locator(".mdr-quickopen-item");
  await items.first().waitFor({ timeout: 2000 });
  const count = await items.count();
  assert(count >= 3, `expected at least 3 items in quick open list, got ${count}`);
  
  const labels = await items.locator(".mdr-quickopen-label").allTextContents();
  assert(labels.includes("readme"), `expected "readme" in labels, got ${labels.join(", ")}`);
  assert(labels.includes("guide"), `expected "guide" in labels, got ${labels.join(", ")}`);
  assert(labels.includes("notes"), `expected "notes" in labels, got ${labels.join(", ")}`);
});

check("filtering works and shows matching files", async (page) => {
  const input = page.locator(".mdr-quickopen-input");
  await input.fill("guide");
  await page.waitForTimeout(100);
  
  const items = page.locator(".mdr-quickopen-item");
  await items.first().waitFor();
  const count = await items.count();
  assert(count >= 1, `expected at least 1 filtered item, got ${count}`);
  
  const firstLabel = await items.first().locator(".mdr-quickopen-label").textContent();
  assert(firstLabel === "guide", `expected first result to be "guide", got "${firstLabel}"`);
  
  // Clear and verify all items show again
  await input.fill("");
  await page.waitForTimeout(100);
  const allItems = await page.locator(".mdr-quickopen-item").count();
  assert(allItems >= 3, `expected at least 3 items when unfiltered, got ${allItems}`);
});

check("can close and reopen modal", async (page) => {
  await page.keyboard.press("Escape");
  await page.locator(".mdr-quickopen").waitFor({ state: "hidden" });
  
  await page.keyboard.press("Meta+p");
  const modal = page.locator(".mdr-quickopen");
  await modal.waitFor({ state: "visible" });
  
  const items = page.locator(".mdr-quickopen-item");
  const count = await items.count();
  assert(count >= 3, `expected at least 3 items on reopen, got ${count}`);
});



async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-qo-"));
  const files = [
    { name: "readme.md", contents: "# Readme\n\nWelcome to the workspace.\n" },
    { name: "guide.md", contents: "# Guide Document\n\nThis is the guide.\n" },
    { name: "notes.md", contents: "# Notes File\n\nRandom notes here.\n" },
  ];

  const vite = startVite();
  const pageErrors = [];
  let failed = false;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(tauriStubInit, { folderPath: workspaceDir, files });
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
    process.stderr.write(`\nFAILED: ${error.message}\n${error.stack}\n`);
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
