/* eslint-disable */
// Playwright harness for tickable task checkboxes (spec scenarios, tasks 5.2-5.4).
// Runs the vite dev server, stubs the Tauri IPC bridge with an in-memory
// workspace seeded with task-list markdown, and drives the real reader UI.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5197;
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

const TASK_DOC = [
  "# Todos",
  "",
  "- [ ] Buy milk",
  "- [x] Done already",
  "",
  "1. [ ] Ordered task",
  "",
  "```text",
  "[x] literal in code",
  "```",
  "",
].join("\n");

async function openDocument(page) {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "note.md" }).waitFor();
  await page.locator(".mdr-explorer-row", { hasText: "note.md" }).click();
  await page.locator(".mdr-reader").waitFor();
  await page.keyboard.press("Alt+Meta+e");
  await page.locator(".mdr-editor .cm-content").waitFor();
}

async function editorText(page) {
  return page.locator(".mdr-editor .cm-content").innerText();
}

function readerCheckbox(page, index) {
  return page.locator(".mdr-reader li[data-task-start] input[type=checkbox]").nth(index);
}

async function waitForEditorText(page, needle) {
  await page.waitForFunction(
    (needle) => document.querySelector(".mdr-editor .cm-content")?.innerText.includes(needle),
    needle,
  );
}

// 1. Tick an unchecked task: source updates, reader re-renders checked.
check("ticking rewrites the marker in the source", async (page) => {
  await openDocument(page);
  await readerCheckbox(page, 0).click();
  await waitForEditorText(page, "- [x] Buy milk");
  const checked = await readerCheckbox(page, 0).isChecked();
  assert(checked, "reader checkbox did not render as checked after tick");
});

// 2. Untick a checked task.
check("unticking rewrites the marker back", async (page) => {
  await readerCheckbox(page, 1).click();
  await waitForEditorText(page, "- [ ] Done already");
  const checked = await readerCheckbox(page, 1).isChecked();
  assert(!checked, "reader checkbox did not render as unchecked after untick");
});

// 3. Ordered task ticks independently; code-block lookalike untouched.
check("ordered tasks tick and code-block markers are untouched", async (page) => {
  await readerCheckbox(page, 2).click();
  await waitForEditorText(page, "1. [x] Ordered task");
  const text = await editorText(page);
  assert(text.includes("[x] literal in code"), "code-block marker was modified");
  assert(text.includes("- [x] Buy milk"), "earlier tick was lost");
});

// 4. Keyboard: focus a checkbox and press Space.
check("keyboard space toggles a task", async (page) => {
  const box = readerCheckbox(page, 0);
  await box.focus();
  await page.keyboard.press("Space");
  await waitForEditorText(page, "- [ ] Buy milk");
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-test-"));
  const fileName = "note.md";

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
      fileContents: TASK_DOC,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("console", (msg) => {
      if (msg.text().includes("[task-ticks]")) console.log("   [console]", msg.text());
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
