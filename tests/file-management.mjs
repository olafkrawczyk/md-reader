/* eslint-disable */
// Playwright harness for the file-management extension: drives the real
// explorer through create (menu + ⌘N), rename, duplicate, delete, and
// drag-and-drop move against a stubbed Tauri IPC with an in-memory tree.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const PORT = 5198;
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

function tauriStubInit({ folderPath, empty = false }) {
  const F = folderPath;
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
    _listeners: {},
    _folder: F,
    _calls: [],
    _flat: empty
      ? []
      : [
          { path: `${F}/docs`, kind: "folder" },
          { path: `${F}/docs/note.md`, kind: "file" },
          { path: `${F}/docs/guide.md`, kind: "file" },
          { path: `${F}/archive`, kind: "folder" },
          { path: `${F}/archive/old`, kind: "folder" },
          { path: `${F}/archive/old/notes-old.md`, kind: "file" },
          { path: `${F}/code.txt`, kind: "file" },
        ],
    _files: {},
    transformCallback(callback) {
      const T = window.__TAURI_INTERNALS__;
      const id = T._nextCallbackId++;
      T._callbacks[id] = callback;
      return id;
    },
    tree() {
      const T = window.__TAURI_INTERNALS__;
      const index = new Map();
      const root = [];
      for (const { path, kind } of T._flat) {
        const node = {
          name: path.split("/").pop(),
          path,
          kind,
          ...(kind === "folder" ? { children: [] } : {}),
        };
        index.set(path, node);
        const parentPath = path.slice(0, path.lastIndexOf("/"));
        const parent = index.get(parentPath);
        if (parent !== undefined) {
          parent.children.push(node);
        } else {
          root.push(node);
        }
      }
      return root;
    },
    emitFsChanged(paths) {
      const T = window.__TAURI_INTERNALS__;
      setTimeout(() => {
        for (const id of T._listeners["workspace-fs-changed"] ?? []) {
          T._callbacks[id]({ event: "workspace-fs-changed", id: 0, payload: { changed: paths, modified: [] } });
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
          return Promise.resolve(T.tree());
        case "read_text_file":
          return Promise.resolve(T._files[args.path] ?? "");
        case "write_text_file":
          T._files[args.path] = args.contents;
          return Promise.resolve(null);
        case "create_entry": {
          if (T._flat.some((entry) => entry.path === args.path)) {
            return Promise.reject(`already exists: ${args.path}`);
          }
          if (args.kind === "folder") {
            T._flat.push({ path: args.path, kind: "folder" });
          } else {
            const parentPath = args.path.slice(0, args.path.lastIndexOf("/"));
            for (const part = parentPath; part.length > T._folder.length; ) {
              if (!T._flat.some((entry) => entry.path === part)) {
                T._flat.push({ path: part, kind: "folder" });
              }
              break;
            }
            T._flat.push({ path: args.path, kind: "file" });
          }
          T.emitFsChanged([args.path]);
          return Promise.resolve(null);
        }
        case "rename_entry": {
          const source = T._flat.find((entry) => entry.path === args.from);
          if (source === undefined) {
            return Promise.reject(`not found: ${args.from}`);
          }
          if (T._flat.some((entry) => entry.path === args.to)) {
            return Promise.reject(`destination already exists: ${args.to}`);
          }
          for (const entry of T._flat) {
            if (entry.path === args.from || entry.path.startsWith(`${args.from}/`)) {
              entry.path = `${args.to}${entry.path.slice(args.from.length)}`;
            }
          }
          T.emitFsChanged([args.to]);
          return Promise.resolve(null);
        }
        case "copy_entry": {
          const clones = T._flat
            .filter((entry) => entry.path === args.from || entry.path.startsWith(`${args.from}/`))
            .map((entry) => ({
              kind: entry.kind,
              path: `${args.to}${entry.path.slice(args.from.length)}`,
            }));
          if (clones.length === 0) {
            return Promise.reject(`not found: ${args.from}`);
          }
          T._flat.push(...clones);
          T.emitFsChanged([args.to]);
          return Promise.resolve(null);
        }
        case "delete_entry": {
          const before = T._flat.length;
          T._flat = T._flat.filter(
            (entry) => entry.path !== args.path && !entry.path.startsWith(`${args.path}/`),
          );
          if (T._flat.length === before) {
            return Promise.reject(`not found: ${args.path}`);
          }
          T.emitFsChanged([args.path]);
          return Promise.resolve(null);
        }
        case "plugin:event|listen":
          T._listeners[args.event] = T._listeners[args.event] ?? [];
          T._listeners[args.event].push(args.handler);
          return Promise.resolve(0);
        case "plugin:event|unlisten":
          return Promise.resolve(null);
        default:
          return Promise.reject(new Error(`unexpected command: ${command}`));
      }
    },
  };
}

async function openFolder(page) {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "docs" }).waitFor();
}

async function openContextMenu(page, rowText) {
  await page
    .locator(".mdr-explorer-row", { hasText: rowText })
    .first()
    .click({ button: "right" });
  await page.locator(".mdr-explorer-menu").waitFor();
}

async function menuAction(page, label) {
  await page.locator(".mdr-explorer-menu-item", { hasText: label }).click();
}

const callsOf = (page, command) =>
  page.evaluate(
    (name) =>
      window.__TAURI_INTERNALS__._calls
        .filter((call) => call.command === name)
        .map((call) => call.args),
    command,
  );

// ---- checks ----

check("context menu: New File with nested path creates dir + file", async (page) => {
  await openFolder(page);
  await openContextMenu(page, "docs");
  await menuAction(page, "New File");
  const input = page.locator(".mdr-explorer-inline-input");
  await input.waitFor();
  await input.fill("new_dir/new_file.md");
  await input.press("Enter");
  try {
    await page
      .locator(".mdr-explorer-row", { hasText: "new_file.md" })
      .waitFor({ timeout: 5000 });
  } catch (error) {
    const dump = await page.evaluate(() => ({
      calls: window.__TAURI_INTERNALS__._calls.map((c) => `${c.command}:${JSON.stringify(c.args)}`),
      flat: window.__TAURI_INTERNALS__._flat.map((e) => e.path),
      errors: [...document.querySelectorAll(".mdr-explorer-inline-error")].map((e) => e.textContent),
      rows: [...document.querySelectorAll(".mdr-explorer-row")].map((e) => e.textContent),
    }));
    process.stderr.write(`DEBUG DUMP: ${JSON.stringify(dump, null, 2)}\n`);
    throw error;
  }
  const calls = await callsOf(page, "create_entry");
  const last = calls[calls.length - 1];
  assert(
    last?.path.endsWith("/docs/new_dir/new_file.md") && last?.kind === "file",
    `bad create_entry call: ${JSON.stringify(last)}`,
  );
});

check("⌘N opens root inline create and creates a file", async (page) => {
  await page.keyboard.press("Meta+n");
  const input = page.locator(".mdr-explorer-inline-input");
  await input.waitFor();
  await input.fill("hello.md");
  await input.press("Enter");
  await page.locator(".mdr-explorer-row", { hasText: "hello.md" }).waitFor();
  const calls = await callsOf(page, "create_entry");
  const last = calls[calls.length - 1];
  assert(
    last?.path.endsWith("/hello.md") && last?.kind === "file",
    `bad create_entry call: ${JSON.stringify(last)}`,
  );
});

check("inline rename renames a file", async (page) => {
  await openContextMenu(page, "code.txt");
  await menuAction(page, "Rename");
  const input = page.locator(".mdr-explorer-inline-input");
  await input.waitFor();
  assert(
    (await input.inputValue()) === "code.txt",
    "rename input is not prefilled",
  );
  await input.fill("renamed.txt");
  await input.press("Enter");
  await page.locator(".mdr-explorer-row", { hasText: "renamed.txt" }).waitFor();
});

check("Escape cancels create without touching disk", async (page) => {
  const before = (await callsOf(page, "create_entry")).length;
  await page.keyboard.press("Meta+n");
  const input = page.locator(".mdr-explorer-inline-input");
  await input.waitFor();
  await input.fill("never.md");
  await input.press("Escape");
  await page.waitForTimeout(100);
  assert(
    (await page.locator(".mdr-explorer-inline-input").count()) === 0,
    "inline input stayed open after Escape",
  );
  assert(
    (await callsOf(page, "create_entry")).length === before,
    "create_entry was invoked despite Escape",
  );
});

check("duplicate creates a non-colliding copy", async (page) => {
  await openContextMenu(page, "note.md");
  await menuAction(page, "Duplicate");
  await page.locator(".mdr-explorer-row", { hasText: "note copy.md" }).waitFor();
});

check("delete asks for confirmation then deletes", async (page) => {
  await openContextMenu(page, "note copy.md");
  await menuAction(page, "Delete");
  await page.locator(".mdr-sheet").waitFor();
  await page.locator(".mdr-dialog-button", { hasText: "Delete" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "note copy.md" }).waitFor({ state: "detached" });
});

check("drag a file onto a folder moves it", async (page) => {
  await page.dragAndDrop(".mdr-explorer-row:has-text('renamed.txt')", ".mdr-explorer-row:has-text('archive')");
  const calls = await callsOf(page, "rename_entry");
  const last = calls[calls.length - 1];
  assert(
    last?.from.endsWith("/renamed.txt") && last?.to.includes("/archive/"),
    `bad rename_entry call: ${JSON.stringify(last)}`,
  );
  // The destination folder is not auto-expanded; expand and check.
  await page.locator(".mdr-explorer-row", { hasText: "archive" }).first().click();
  await page
    .locator("li:has(> .mdr-explorer-row:has-text('archive')) .mdr-explorer-row", {
      hasText: "renamed.txt",
    })
    .waitFor();
});

check("⌘⇧N opens root new-folder create", async (page) => {
  await page.keyboard.press("Meta+Shift+n");
  const input = page.locator(".mdr-explorer-inline-input");
  await input.waitFor();
  await input.fill("inbox");
  await input.press("Enter");
  const calls = await callsOf(page, "create_entry");
  const last = calls[calls.length - 1];
  assert(
    last?.path.endsWith("/inbox") && last?.kind === "folder",
    `bad create_entry call: ${JSON.stringify(last)}`,
  );
});

let sharedBrowser = null;

check("empty workspace: ⌘N and context menu create entries", async (page) => {
  // Fresh context over an empty workspace directory.
  const { mkdtemp, rm } = await import("node:fs/promises");
  const emptyDir = await mkdtemp(join(tmpdir(), "mdr-file-mgmt-empty-"));
  const context = await sharedBrowser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.addInitScript(tauriStubInit, { folderPath: emptyDir, empty: true });
  const emptyPage = await context.newPage();
  try {
    await emptyPage.goto(BASE, { waitUntil: "networkidle" });
    await emptyPage.locator(".mdr-welcome").waitFor();
    await emptyPage.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
    await emptyPage.locator("nav.mdr-explorer").waitFor();

    await emptyPage.keyboard.press("Meta+n");
    try {
      const input = emptyPage.locator(".mdr-explorer-inline-input");
      await input.waitFor({ timeout: 5000 });
    } catch (error) {
      const dump = await emptyPage.evaluate(() => ({
        calls: window.__TAURI_INTERNALS__._calls.map((c) => c.command),
        navHtml: document.querySelector("nav.mdr-explorer")?.innerHTML.slice(0, 400) ?? null,
      })).catch((e) => ({ evaluateError: String(e) }));
      process.stderr.write(`EMPTY DEBUG: ${JSON.stringify(dump, null, 2)}\n`);
      throw error;
    }
    const input = emptyPage.locator(".mdr-explorer-inline-input");
    await input.fill("first.md");
    await input.press("Enter");
    await emptyPage.locator(".mdr-explorer-row", { hasText: "first.md" }).waitFor();

    // Context menu on the empty explorer area also works.
    await emptyPage.locator("nav.mdr-explorer").click({ button: "right" });
    await emptyPage.locator(".mdr-explorer-menu").waitFor();
    await menuAction(emptyPage, "New Folder");
    const folderInput = emptyPage.locator(".mdr-explorer-inline-input");
    await folderInput.waitFor();
    await folderInput.fill("notes");
    await folderInput.press("Enter");
    const calls = await callsOf(emptyPage, "create_entry");
    const last = calls[calls.length - 1];
    assert(
      last?.path.endsWith("/notes") && last?.kind === "folder",
      `bad create_entry call: ${JSON.stringify(last)}`,
    );
    // Empty folders stay visible in the tree.
    await emptyPage.locator(".mdr-explorer-row", { hasText: "notes" }).waitFor();

    // Top-bar actions create at the workspace root.
    await emptyPage.locator('button[title="New File"]').click();
    const toolbarInput = emptyPage.locator(".mdr-explorer-inline-input");
    await toolbarInput.waitFor();
    await toolbarInput.fill("from-toolbar.md");
    await toolbarInput.press("Enter");
    await emptyPage.locator(".mdr-explorer-row", { hasText: "from-toolbar.md" }).waitFor();
    const toolbarCalls = await callsOf(emptyPage, "create_entry");
    const toolbarLast = toolbarCalls[toolbarCalls.length - 1];
    assert(
      toolbarLast?.path.endsWith("/from-toolbar.md") && toolbarLast?.kind === "file",
      `bad toolbar create_entry call: ${JSON.stringify(toolbarLast)}`,
    );
  } finally {
    await emptyPage.close();
    await context.close();
    await rm(emptyDir, { recursive: true, force: true });
  }
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-file-mgmt-"));
  const vite = startVite();
  const pageErrors = [];
  let failed = false;
  try {
    await waitForServer();
    const browser = await webkit.launch();
    sharedBrowser = browser;
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(tauriStubInit, { folderPath: workspaceDir });
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
