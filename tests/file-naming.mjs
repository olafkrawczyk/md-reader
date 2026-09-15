/* eslint-disable */
// Playwright harness for document name normalization (spec scenarios).
// Runs the vite dev server, stubs the Tauri IPC bridge with an in-memory
// workspace, and drives the explorer's real create/rename flows.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5195;
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
    _listeners: {},
    transformCallback(callback) {
      const T = window.__TAURI_INTERNALS__;
      const id = T._nextCallbackId++;
      T._callbacks[id] = callback;
      return id;
    },
    invoke(command, args) {
      const T = window.__TAURI_INTERNALS__;
      // Mutating handlers mirror the backend's fs events so the app rescans.
      const emitFs = (paths) => {
        const handler = T._listeners["workspace-fs-changed"];
        if (handler !== undefined) {
          T._callbacks[handler]({ event: "workspace-fs-changed", id: 0, payload: { changed: paths, modified: [] } });
        }
      };
      const baseName = (p) => p.slice(p.lastIndexOf("/") + 1);
      switch (command) {
        case "plugin:dialog|open":
          return Promise.resolve(T._folder);
        case "activate_workspace":
          return Promise.resolve(null);
        case "read_dir_tree":
          // Fresh array per read — the store contract requires snapshot
          // identity to change on mutation, like the real backend.
          return Promise.resolve(T._tree.map((entry) => ({ ...entry })));
        case "read_text_file":
          return Promise.resolve(T._files[args.path] ?? "");
        case "write_text_file":
          T._files[args.path] = args.contents;
          return Promise.resolve(null);
        case "create_entry": {
          T._tree.push({ name: baseName(args.path), path: args.path, kind: args.kind });
          if (args.kind === "file") {
            T._files[args.path] = "";
          }
          emitFs([args.path]);
          return Promise.resolve(null);
        }
        case "rename_entry": {
          for (const entry of T._tree) {
            if (entry.path === args.from) {
              entry.path = args.to;
              entry.name = baseName(args.to);
            }
          }
          if (args.from in T._files) {
            T._files[args.to] = T._files[args.from];
            delete T._files[args.from];
          }
          emitFs([args.from, args.to]);
          return Promise.resolve(null);
        }
        case "copy_entry": {
          T._tree.push({ name: baseName(args.to), path: args.to, kind: T._tree.find((e) => e.path === args.from)?.kind ?? "file" });
          if (args.from in T._files) {
            T._files[args.to] = T._files[args.from];
          }
          emitFs([args.to]);
          return Promise.resolve(null);
        }
        case "delete_entry": {
          T._tree = T._tree.filter((entry) => entry.path !== args.path);
          delete T._files[args.path];
          emitFs([args.path]);
          return Promise.resolve(null);
        }
        case "plugin:event|listen":
          T._listeners[args.event] = args.handler;
          return Promise.resolve(0);
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
  await page.locator(".mdr-explorer-row", { hasText: "note.md" }).waitFor();
}

/** Starts a file create from the action bar and returns the inline input. */
async function beginCreateFile(page) {
  await page.getByRole("button", { name: "New File" }).click();
  const input = page.locator(".mdr-explorer-inline-input");
  await input.waitFor();
  return input;
}

async function confirmAndExpectRow(page, input, text, rowName) {
  await input.fill(text);
  await input.press("Enter");
  await page.locator(".mdr-explorer-row", { hasText: rowName }).waitFor();
}

// 1. Prefill: value and stem selection.
check("new file field is prefilled with Untitled.md, stem selected", async (page) => {
  await openWorkspace(page);
  const input = await beginCreateFile(page);
  const value = await input.inputValue();
  const selection = await input.evaluate((el) => [el.selectionStart, el.selectionEnd]);
  assert(value === "Untitled.md", `expected prefill Untitled.md, got ${value}`);
  assert(selection[0] === 0 && selection[1] === 8, `expected stem selection 0-8, got ${selection}`);
  // Confirming untouched creates Untitled.md.
  await input.press("Enter");
  try {
    await page.locator(".mdr-explorer-row", { hasText: "Untitled.md" }).waitFor({ timeout: 5000 });
  } catch {
    const dump = await page.evaluate(() => ({
      rows: [...document.querySelectorAll(".mdr-explorer-row")].map((r) => r.textContent),
      inline: document.querySelector(".mdr-explorer-inline")?.textContent ?? null,
      error: document.querySelector(".mdr-explorer-inline-error")?.textContent ?? null,
    }));
    console.log("   [dump]", JSON.stringify(dump));
    throw new Error("row not found");
  }
});

// 2. Create without extension.
check("create without extension appends .md", async (page) => {
  const input = await beginCreateFile(page);
  await confirmAndExpectRow(page, input, "groceries", "groceries.md");
});

// 3. Create with a supported extension.
check("create with .txt keeps the typed extension", async (page) => {
  const input = await beginCreateFile(page);
  await confirmAndExpectRow(page, input, "notes.txt", "notes.txt");
});

// 4. Create with an unsupported extension.
check("create with .cpp appends .md and stays visible", async (page) => {
  const input = await beginCreateFile(page);
  await confirmAndExpectRow(page, input, "notes.cpp", "notes.cpp.md");
});

// 5. Create with a blank extension.
check("create with trailing dot normalizes to .md", async (page) => {
  const input = await beginCreateFile(page);
  await confirmAndExpectRow(page, input, "brief.", "brief.md");
});

// 6. Rename that drops the extension.
check("rename dropping the extension re-appends .md", async (page) => {
  const row = page.locator(".mdr-explorer-row", { hasText: "groceries.md" });
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const input = page.locator(".mdr-explorer-inline-input");
  await input.waitFor();
  await input.fill("minutes");
  await input.press("Enter");
  await page.locator(".mdr-explorer-row", { hasText: "minutes.md" }).waitFor();
});

// 7. Folders are never normalized.
check("folder names are not normalized", async (page) => {
  await page.getByRole("button", { name: "New Folder" }).click();
  const input = page.locator(".mdr-explorer-inline-input");
  await input.waitFor();
  await input.fill("docs");
  await input.press("Enter");
  await page.locator(".mdr-explorer-row", { hasText: "docs" }).waitFor();
  const folderTexts = await page.locator('.mdr-explorer-row[data-drop] .mdr-explorer-name').allTextContents();
  assert(folderTexts.includes("docs"), `folder row missing: ${folderTexts}`);
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-test-"));
  const fileName = "note.md";
  const fileContents = "# Hello\n\nSome content.\n";

  const vite = startVite();
  const pageErrors = [];
  let failed = false;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(tauriStubInit, { folderPath: workspaceDir, fileName, fileContents });
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
