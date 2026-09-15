/* eslint-disable */
// Playwright harness for document-safety (autosave + unsaved-changes guard).
// Runs the vite dev server, stubs the Tauri IPC bridge with an in-memory
// workspace, and drives the real UI: autosave, the Save/Discard/Cancel
// dialog, and the settings surface.
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
    _folder: folderPath,
    _path: path,
    _tree: [{ name: fileName, path, kind: "file" }],
    _files: { [path]: initialContent },
    _invocations: [],
    transformCallback(callback) {
      const T = window.__TAURI_INTERNALS__;
      const id = T._nextCallbackId++;
      T._callbacks[id] = callback;
      return id;
    },
    invoke(command, args) {
      const T = window.__TAURI_INTERNALS__;
      T._invocations.push(command);
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
  await page.locator(".mdr-explorer-row", { hasText: FILE }).waitFor();
  await page.locator(".mdr-explorer-row", { hasText: FILE }).click();
  await page.locator(".mdr-reader").waitFor();
  await page.getByRole("radiogroup", { name: "Layout" }).getByRole("radio", { name: "Split" }).click();
  await page.locator(".mdr-editor .cm-content").waitFor();
}

async function typeInEditor(page, text) {
  await page.locator(".mdr-editor .cm-content").click();
  await page.keyboard.type(text);
}

async function diskContent(page) {
  return page.evaluate(() => window.__TAURI_INTERNALS__._files[window.__TAURI_INTERNALS__._path]);
}

async function waitForDiskContent(page, needle, timeout = 5000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const content = await diskContent(page);
    if (content.includes(needle)) return;
    if (Date.now() > deadline) {
      throw new Error(`disk content never contained ${JSON.stringify(needle)}; got ${JSON.stringify(content)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function openSettings(page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator(".mdr-sheet").waitFor();
}

async function settingRow(page, label) {
  return page.locator(".mdr-setting-row", { hasText: label });
}

// 1. Autosave settings render in the document-safety group.
check("autosave settings render as switch and stepper rows", async (page) => {
  await openDocument(page);
  await openSettings(page);
  const section = page.locator(".mdr-settings-section", { hasText: "document-safety" });
  const toggle = section.getByRole("switch", { name: "Autosave" });
  await toggle.waitFor();
  const stepper = section.locator(".mdr-stepper");
  assert((await stepper.count()) === 1, "expected one stepper for the delay setting");
  const value = await stepper.locator(".mdr-stepper-value").textContent();
  assert(value === "1", `expected default delay 1, got ${value}`);
  await page.keyboard.press("Escape");
});

// 2. Editing then idling autosaves; the dirty marker clears.
check("idle delay autosaves and clears the dirty marker", async (page) => {
  await page.locator(".mdr-editor .cm-content").click();
  await page.keyboard.type(" first edit");
  await page.locator(".mdr-tab-dirty").waitFor();
  await waitForDiskContent(page, "first edit");
  await page.locator(".mdr-tab-close").waitFor();
});

// 3. Continued typing postpones the save; the delay setting applies live.
check("continued typing postpones autosave until the new delay elapses", async (page) => {
  await openSettings(page);
  const row = await settingRow(page, "Autosave delay (seconds)");
  await row.getByRole("button", { name: "Increase Autosave delay (seconds)" }).click();
  await row.getByRole("button", { name: "Increase Autosave delay (seconds)" }).click();
  await page.keyboard.press("Escape");
  await page.locator(".mdr-editor .cm-content").click();
  await page.keyboard.type(" postponed");
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const early = await diskContent(page);
  assert(!early.includes("postponed"), `saved before the 3s delay elapsed: ${early}`);
  await waitForDiskContent(page, "postponed", 5000);
  await openSettings(page);
  await row.getByRole("button", { name: "Decrease Autosave delay (seconds)" }).click();
  await row.getByRole("button", { name: "Decrease Autosave delay (seconds)" }).click();
  await page.keyboard.press("Escape");
});

// 4. Disabling autosave applies live: edits stay dirty.
check("disabling autosave leaves edits unsaved", async (page) => {
  await openSettings(page);
  const toggle = page.getByRole("switch", { name: "Autosave" });
  await toggle.click();
  await page.keyboard.press("Escape");
  await page.locator(".mdr-editor .cm-content").click();
  await page.keyboard.type(" unsaved");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const content = await diskContent(page);
  assert(!content.includes("unsaved"), `autosaved while disabled: ${content}`);
  await page.locator(".mdr-tab-dirty").waitFor();
  await openSettings(page);
  await toggle.click();
  await page.keyboard.press("Escape");
});

// 5. Close guard: Cancel aborts the close and keeps the tab dirty.
check("closing a dirty tab shows the dialog; Cancel keeps it", async (page) => {
  await page.locator(".mdr-tab-dirty").click();
  await page.locator(".mdr-sheet", { hasText: "Unsaved Changes" }).waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".mdr-tab-dirty").waitFor();
  const content = await diskContent(page);
  assert(!content.includes("unsaved"), "changes written on cancel");
});

// 6. Close guard: Save persists, then the tab closes.
check("closing a dirty tab with Save writes and closes", async (page) => {
  await page.locator(".mdr-tab-dirty").click();
  await page.locator(".mdr-sheet", { hasText: "Unsaved Changes" }).waitFor();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".mdr-welcome").waitFor();
  await waitForDiskContent(page, "unsaved");
});

// 7. Close guard: Discard closes without writing; a reopen reloads from disk.
check("closing a dirty tab with Discard drops the changes", async (page) => {
  await page.locator(".mdr-explorer-row", { hasText: FILE }).click();
  await page.locator(".mdr-reader").waitFor();
  await page.locator(".mdr-editor .cm-content").click();
  await page.keyboard.type(" throwaway");
  const before = await diskContent(page);
  assert(!before.includes("throwaway"), "disk already contains the throwaway edit");
  await page.locator(".mdr-tab-dirty").click();
  await page.locator(".mdr-sheet", { hasText: "Unsaved Changes" }).waitFor();
  await page.getByRole("button", { name: "Discard" }).click();
  await page.locator(".mdr-welcome").waitFor();
  const after = await diskContent(page);
  assert(after === before, `discard wrote to disk: ${before} -> ${after}`);
});

// 8. Clean tabs close without any dialog.
check("clean tab closes immediately without prompting", async (page) => {
  await page.locator(".mdr-explorer-row", { hasText: FILE }).click();
  await page.locator(".mdr-reader").waitFor();
  await page.locator(".mdr-tab-close").click();
  await page.locator(".mdr-welcome").waitFor();
  const dialog = page.locator(".mdr-sheet", { hasText: "Unsaved Changes" });
  assert((await dialog.count()) === 0, "dialog appeared for a clean tab");
});

// 9. Store-level coverage of the prompt queue and the no-handler fallback.
check("close guard queue resolves decisions; unset handler cancels", async (page) => {
  const result = await page.evaluate(async () => {
    const guard = await import("/src/core/safety/closeGuard.ts");
    const queued = guard.closePromptQueue.request([]);
    const pendingCount = guard.closePromptQueue.pending.length;
    guard.closePromptQueue.decide("discard");
    const decision = await queued;
    guard.setCloseGuardHandler(null);
    const fallback = await guard.requestCloseDecision([]);
    guard.setCloseGuardHandler((documents) => guard.closePromptQueue.request(documents));
    return { decision, pendingCount, fallback };
  });
  assert(result.decision === "discard", `expected queued discard, got ${result.decision}`);
  assert(result.pendingCount === 1, `expected one queued prompt, got ${result.pendingCount}`);
  assert(result.fallback === "cancel", `expected cancel fallback, got ${result.fallback}`);
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-safety-"));
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
      initialContent: "# Hello\n\nSome content.\n",
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
