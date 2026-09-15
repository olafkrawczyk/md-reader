/* eslint-disable */
// Playwright harness for the reading-experience settings (tasks 4.2, 5.1).
// Runs the vite dev server, stubs the Tauri IPC bridge with an in-memory
// workspace, and drives the real UI through the settings sheet.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  const child = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "inherit", "inherit"] },
  );
  return child;
}

/** Installs a Tauri bridge stub backed by an in-memory folder before app code runs. */
function tauriStubInit({ folderPath, fileName }) {
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
    _files: {},
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

async function openDocument(page) {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "note.md" }).waitFor();
  await page.locator(".mdr-explorer-row", { hasText: "note.md" }).click();
  await page.locator(".mdr-reader").waitFor();
  await page.getByRole("radiogroup", { name: "Layout" }).getByRole("radio", { name: "Split" }).click();
  await page.locator(".mdr-editor .cm-content").waitFor();
}

async function openSettings(page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator(".mdr-sheet").waitFor();
}

async function settingRow(page, label) {
  return page.locator(".mdr-setting-row", { hasText: label });
}

async function computedStyle(page, selector, property) {
  return page.$eval(
    selector,
    (element, prop) => getComputedStyle(element).getPropertyValue(prop),
    property,
  );
}

const READER = ".mdr-reader";
const EDITOR_TEXT = ".mdr-editor .cm-scroller";

// 1. Size change applies live to both pane kinds; chrome is unaffected.
check("font size applies live to reader and editor, chrome untouched", async (page) => {
  await openDocument(page);
  const baseReader = await computedStyle(page, READER, "font-size");
  const baseEditor = await computedStyle(page, ".mdr-editor .cm-scroller", "font-size");
  const baseChrome = await computedStyle(page, ".mdr-tab", "font-size");
  assert(baseReader === "13px", `expected base reader font 13px, got ${baseReader}`);
  await openSettings(page);
  const sizeRow = await settingRow(page, "Font size");
  await sizeRow.locator("select").selectOption({ label: "XL" });
  const xlReader = await computedStyle(page, READER, "font-size");
  const xlEditor = await computedStyle(page, ".mdr-editor .cm-scroller", "font-size");
  const xlChrome = await computedStyle(page, ".mdr-tab", "font-size");
  assert(xlReader === "16.9px", `expected XL reader font 16.9px, got ${xlReader}`);
  assert(xlEditor === "16.9px", `expected XL editor font 16.9px, got ${xlEditor}`);
  assert(xlChrome === baseChrome, `chrome font changed: ${baseChrome} -> ${xlChrome}`);
  await page.keyboard.press("Escape");
});

// 2. Tint applies to content only, in both appearances.
check("text tint applies to content only and follows appearance", async (page) => {
  const chromeColor = await computedStyle(page, ".mdr-tab", "color");
  await openSettings(page);
  const tintRow = await settingRow(page, "Text color");
  await tintRow.locator("select").selectOption({ label: "Sepia" });
  const lightSepia = await computedStyle(page, READER, "color");
  assert(lightSepia === "rgb(91, 70, 54)", `expected sepia rgb(91, 70, 54), got ${lightSepia}`);
  const chromeAfter = await computedStyle(page, ".mdr-tab", "color");
  assert(chromeAfter === chromeColor, "chrome text color changed with content tint");
  // Appearance segmented control (3 options): switch to dark.
  const appearanceRow = await settingRow(page, "Appearance");
  await appearanceRow.getByRole("radio", { name: "dark" }).click();
  const darkSepia = await computedStyle(page, READER, "color");
  assert(darkSepia === "rgb(214, 185, 140)", `expected dark sepia rgb(214, 185, 140), got ${darkSepia}`);
  await page.keyboard.press("Escape");
});

// 3. Line height applies live.
check("line height applies live", async (page) => {
  const before = await computedStyle(page, READER, "line-height");
  await openSettings(page);
  const row = await settingRow(page, "Line height");
  await row.getByRole("radio", { name: "Relaxed" }).click();
  const after = await computedStyle(page, READER, "line-height");
  assert(before !== after, `line height did not change: ${before}`);
  await page.keyboard.press("Escape");
});

// 4. Measure caps lines in both panes.
check("measure caps reader and editor line length", async (page) => {
  await openSettings(page);
  const row = await settingRow(page, "Reading measure");
  await row.getByRole("radio", { name: "Narrow" }).click();
  const readerMax = await computedStyle(page, READER, "max-width");
  const editorMax = await computedStyle(page, ".mdr-editor .cm-content", "max-width");
  assert(readerMax === "576px", `expected reader measure 576px, got ${readerMax}`);
  assert(editorMax === "576px", `expected editor measure 576px, got ${editorMax}`);
  await page.keyboard.press("Escape");
});

// 5. Settings group renders one row per setting.
check("reading settings render as one grouped row each", async (page) => {
  await openSettings(page);
  const readingSection = page.locator(".mdr-settings-section", { hasText: "reading" });
  const labels = await readingSection.locator(".mdr-setting-label").allTextContents();
  assert(labels.length === 5, `expected 5 reading settings, got ${labels.length}: ${labels.join(", ")}`);
  await page.keyboard.press("Escape");
});

// 6. Persistence: choice survives a reload.
check("font size choice persists across reload", async (page) => {
  await page.reload({ waitUntil: "networkidle" });
  await openSettings(page);
  const sizeRow = await settingRow(page, "Font size");
  const value = await sizeRow.locator("select").inputValue();
  assert(value === "XL", `expected persisted XL, got ${value}`);
  await page.keyboard.press("Escape");
});

// 7. Store unit coverage: set + getNumber clamping (task 2.2).
check("SettingsStore numbers clamp to bounds", async (page) => {
  const result = await page.evaluate(async () => {
    const module = await import("/src/core/settings/settingsStore.ts");
    const store = new module.SettingsStore();
    store.set("t", "n", 5);
    const stored = store.getNumber("t", "n", 1);
    const clampedDefault = store.getNumber("t", "missing", 3, { min: 0, max: 2 });
    store.set("t", "big", 99);
    const clampedStored = store.getNumber("t", "big", 1, { max: 10 });
    store.set("t", "floor", -50);
    const clampedMin = store.getNumber("t", "floor", 1, { min: 0 });
    return { stored, clampedDefault, clampedStored, clampedMin };
  });
  assert(result.stored === 5, `expected stored 5, got ${result.stored}`);
  assert(result.clampedDefault === 2, `expected default clamped to 2, got ${result.clampedDefault}`);
  assert(result.clampedStored === 10, `expected stored clamped to 10, got ${result.clampedStored}`);
  assert(result.clampedMin === 0, `expected clamped to min 0, got ${result.clampedMin}`);
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-test-"));
  const fileName = "note.md";
  await writeFile(join(workspaceDir, fileName), "# Hello\n\nSome content.\n");

  const vite = startVite();
  const pageErrors = [];
  let failed = false;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(tauriStubInit, { folderPath: workspaceDir, fileName });
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