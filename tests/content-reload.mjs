/* eslint-disable */
// Playwright harness for content-change reload: drives the real UI against a
// stubbed Tauri IPC and simulates external editor saves by emitting
// workspace-fs-changed payloads (content-only and structural shapes) and
// asserting open documents pick up the new on-disk text.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5198;
const BASE = `http://localhost:${PORT}`;
const FILE = "note.md";

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
function tauriStubInit({ folderPath, fileName, initialContent }) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    registerListener() {
      return { id: 0 };
    },
    unregisterListener() {},
  };
  const path = `${folderPath}/${fileName}`;
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
    _nextCallbackId: 0,
    _callbacks: {},
    _listeners: {},
    _folder: folderPath,
    _path: path,
    _tree: [{ name: fileName, path, kind: "file" }],
    _files: { [path]: initialContent },
    _calls: [],
    transformCallback(callback) {
      const T = window.__TAURI_INTERNALS__;
      const id = T._nextCallbackId++;
      T._callbacks[id] = callback;
      return id;
    },
    /** Simulates the backend watcher emitting a classified batch. */
    emitFsEvent(payload) {
      const T = window.__TAURI_INTERNALS__;
      setTimeout(() => {
        for (const handler of T._listeners["workspace-fs-changed"] ?? []) {
          handler({ event: "workspace-fs-changed", id: 0, payload });
        }
      }, 0);
    },
    invoke(command, args) {
      const T = window.__TAURI_INTERNALS__;
      T._calls.push({ command, args });
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
          T._listeners[args.event] = T._listeners[args.event] ?? [];
          T._listeners[args.event].push(T._callbacks[args.handler]);
          return Promise.resolve(0);
        case "plugin:event|unlisten":
          return Promise.resolve(null);
        default:
          return Promise.reject(new Error(`unexpected command: ${command}`));
      }
    },
  };
}

async function openDocument(page) {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: FILE }).waitFor();
  await page.locator(".mdr-explorer-row", { hasText: FILE }).click();
  await page.locator(".mdr-reader").waitFor();
  await page.locator(".mdr-reader", { hasText: "version one" }).waitFor();
  await page.getByRole("radiogroup", { name: "Layout" }).getByRole("radio", { name: "Split" }).click();
  await page.locator(".mdr-editor .cm-content").waitFor();
}

/** The watcher saw an external save; update the stubbed disk, then emit. */
async function externalSave(page, payload, newContent) {
  await page.evaluate(
    ({ payload, newContent, path }) => {
      const T = window.__TAURI_INTERNALS__;
      T._files[path] = newContent;
      T.emitFsEvent(payload);
    },
    { payload, newContent, path: await filePath(page) },
  );
}

async function filePath(page) {
  return page.evaluate(() => window.__TAURI_INTERNALS__._path);
}

async function readDirTreeCalls(page) {
  return page.evaluate(
    () =>
      window.__TAURI_INTERNALS__._calls.filter(
        (call) => call.command === "read_dir_tree",
      ).length,
  );
}

async function readerText(page) {
  return page.locator(".mdr-reader").textContent();
}

async function waitForReaderText(page, needle, timeout = 5000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const text = await readerText(page);
    if (text.includes(needle)) return;
    if (Date.now() > deadline) {
      throw new Error(
        `reader never showed ${JSON.stringify(needle)}; got ${JSON.stringify(text)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function editorText(page) {
  return page.evaluate(() => {
    const editor = document.querySelector(".mdr-editor .cm-content");
    return editor === null ? null : editor.textContent;
  });
}

// 1. In-place external save (content-only event): the clean open document
//    re-reads the new text, stays clean, and no tree rescan happens.
check("content-only save reloads a clean open document", async (page) => {
  await openDocument(page);
  const rescansBefore = await readDirTreeCalls(page);
  await externalSave(page, { changed: [], modified: [await filePath(page)] }, "version two\n");
  await waitForReaderText(page, "version two");
  assert(
    (await readDirTreeCalls(page)) === rescansBefore,
    "content-only event triggered a tree rescan",
  );
  assert(
    (await page.locator(".mdr-tab-dirty").count()) === 0,
    "reloaded document became dirty",
  );
});

// 2. Rename-style save (temp file + rename, structural event): the clean
//    open document still re-reads the new content.
check("rename-style save reloads a clean open document", async (page) => {
  await externalSave(page, { changed: [await filePath(page)], modified: [] }, "version three\n");
  await waitForReaderText(page, "version three");
  assert(
    (await page.locator(".mdr-tab-dirty").count()) === 0,
    "reloaded document became dirty",
  );
  // The tree still contains the file, so no deletion signal fired.
  assert(
    (await page.locator(".mdr-welcome").count()) === 0,
    "document was dropped despite its file still existing",
  );
});

// 3. Dirty document: external saves must not clobber the in-app buffer.
check("external save does not clobber a dirty document", async (page) => {
  // Disable autosave so the edit stays dirty.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator(".mdr-sheet").waitFor();
  await page.getByRole("switch", { name: "Autosave" }).click();
  await page.keyboard.press("Escape");
  await page.locator(".mdr-editor .cm-content").waitFor();
  await page.locator(".mdr-editor .cm-content").click();
  await page.keyboard.type(" my local edit");
  await page.locator(".mdr-tab-dirty").waitFor();

  await externalSave(page, { changed: [], modified: [await filePath(page)] }, "version four\n");
  await page.waitForTimeout(500);
  const buffer = await editorText(page);
  assert(
    buffer !== null && buffer.includes("my local edit"),
    `dirty buffer was clobbered by the external save: ${JSON.stringify(buffer)}`,
  );
  assert(
    !buffer.includes("version four"),
    `dirty buffer picked up external content: ${JSON.stringify(buffer)}`,
  );
  assert(
    (await page.locator(".mdr-tab-dirty").count()) === 1,
    "dirty state was lost after an external save",
  );
  // The user's buffer still wins on save.
  await page.locator(".mdr-tab-dirty").click();
  await page.locator(".mdr-sheet", { hasText: "Unsaved Changes" }).waitFor();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".mdr-welcome").waitFor();
  const disk = await page.evaluate(
    (path) => window.__TAURI_INTERNALS__._files[path],
    await filePath(page),
  );
  assert(
    disk.includes("my local edit"),
    `saving the dirty buffer did not win: ${JSON.stringify(disk)}`,
  );
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-content-reload-"));
  const vite = startVite();
  const pageErrors = [];
  let failed = false;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(tauriStubInit, {
      folderPath: workspaceDir,
      fileName: FILE,
      initialContent: "version one\n",
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
