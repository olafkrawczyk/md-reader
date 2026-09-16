/* eslint-disable */
// Test harness for editor experience:
// 1. Tab and Shift-Tab indentation in CodeMirror editor
// 2. ⌘E mode toggle (Read ⇄ Write)
// 3. ⌘⌥E split toggle
// 4. Toolbar mode toggle button
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5208;
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
        case "set_workspace_menu_enabled":
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

async function setupPage(browser, content = "- Item 1\n- Item 2\n") {
  const page = await browser.newPage();
  const folder = await mkdtemp(join(tmpdir(), "mdr-edit-"));
  await page.addInitScript(tauriStubInit, {
    folderPath: folder,
    fileName: "test.md",
    fileContents: content,
  });
  await page.goto(BASE);
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "test.md" }).waitFor();
  await page.locator(".mdr-explorer-row", { hasText: "test.md" }).click();
  await page.locator(".mdr-reader").waitFor();
  return { page, folder };
}

// 1. Mode toggle via keyboard ⌘E
check("⌘E toggles between Read and Write mode", async (browser) => {
  const { page, folder } = await setupPage(browser);
  try {
    assert(await page.locator(".mdr-reader").isVisible(), "reader should be visible initially");
    assert(await page.locator(".mdr-editor").count() === 0, "editor should not be visible initially");

    await page.keyboard.press("Meta+e");
    await page.locator(".mdr-editor").waitFor();
    assert(await page.locator(".mdr-editor").isVisible(), "editor should be visible after ⌘E");
    assert(await page.locator(".mdr-reader").count() === 0, "reader should not be visible in write mode");

    await page.keyboard.press("Meta+e");
    await page.locator(".mdr-reader").waitFor();
    assert(await page.locator(".mdr-reader").isVisible(), "reader should be visible after second ⌘E");
    assert(await page.locator(".mdr-editor").count() === 0, "editor should not be visible after second ⌘E");
  } finally {
    await page.close();
    await rm(folder, { recursive: true, force: true });
  }
});

// 2. Split toggle via keyboard ⌘⌥E
check("⌘⌥E toggles Split mode", async (browser) => {
  const { page, folder } = await setupPage(browser);
  try {
    assert(await page.locator(".mdr-reader").isVisible(), "reader should be visible");
    assert(await page.locator(".mdr-editor").count() === 0, "editor should not be visible");

    await page.keyboard.press("Alt+Meta+e");
    await page.locator(".mdr-editor").waitFor();
    assert(await page.locator(".mdr-reader").isVisible(), "reader should remain visible in split mode");
    assert(await page.locator(".mdr-editor").isVisible(), "editor should become visible in split mode");

    await page.keyboard.press("Alt+Meta+e");
    await page.locator(".mdr-reader").waitFor();
    assert(await page.locator(".mdr-reader").isVisible(), "reader should remain visible");
    assert(await page.locator(".mdr-editor").count() === 0, "editor should be closed after exiting split");
  } finally {
    await page.close();
    await rm(folder, { recursive: true, force: true });
  }
});

// 3. Toolbar mode toggle button
check("toolbar mode toggle button switches between Read and Write", async (browser) => {
  const { page, folder } = await setupPage(browser);
  try {
    const toggleButton = page.locator('button[title*="Switch to Writing"]');
    await toggleButton.waitFor();
    await toggleButton.click();

    await page.locator(".mdr-editor").waitFor();
    assert(await page.locator(".mdr-editor").isVisible(), "editor should be open after clicking toggle");

    const readButton = page.locator('button[title*="Switch to Reading"]');
    await readButton.waitFor();
    await readButton.click();

    await page.locator(".mdr-reader").waitFor();
    assert(await page.locator(".mdr-reader").isVisible(), "reader should be open after clicking toggle again");
  } finally {
    await page.close();
    await rm(folder, { recursive: true, force: true });
  }
});

// 4. Toolbar split button
check("toolbar split button toggles Split view", async (browser) => {
  const { page, folder } = await setupPage(browser);
  try {
    const splitButton = page.locator('button[title*="Split View"]');
    await splitButton.waitFor();
    await splitButton.click();

    await page.locator(".mdr-editor").waitFor();
    assert(await page.locator(".mdr-reader").isVisible(), "reader should be visible in split");
    assert(await page.locator(".mdr-editor").isVisible(), "editor should be visible in split");

    // Click again to close split view
    const closeSplitButton = page.locator('button[title*="Close Split View"]');
    await closeSplitButton.waitFor();
    await closeSplitButton.click();

    await page.locator(".mdr-reader").waitFor();
    assert(await page.locator(".mdr-reader").isVisible(), "reader should remain");
    assert(await page.locator(".mdr-editor").count() === 0, "editor should close when split closed");
  } finally {
    await page.close();
    await rm(folder, { recursive: true, force: true });
  }
});

// 5. Toolbar research button
check("toolbar research button toggles Backlinks pane alongside reader", async (browser) => {
  const { page, folder } = await setupPage(browser);
  try {
    const researchButton = page.locator('button[title*="Research View"]');
    await researchButton.waitFor();
    await researchButton.click();

    // Reader and backlinks panes both present in main slots
    await page.locator(".mdr-reader").waitFor();
    await page.locator(".mdr-backlinks").waitFor();
    assert(await page.locator(".mdr-reader").isVisible(), "reader should be visible in research view");
    assert(await page.locator(".mdr-backlinks").isVisible(), "backlinks pane should be visible in research view");

    // Click again to exit research view
    const closeResearchButton = page.locator('button[title*="Close Research View"]');
    await closeResearchButton.waitFor();
    await closeResearchButton.click();

    await page.locator(".mdr-reader").waitFor();
    assert(await page.locator(".mdr-reader").isVisible(), "reader should remain after exiting research");
    assert(await page.locator(".mdr-backlinks").count() === 0, "backlinks pane should be closed");
  } finally {
    await page.close();
    await rm(folder, { recursive: true, force: true });
  }
});

// 6. Tab and Shift-Tab in editor indents and outdents list items
check("Tab and Shift-Tab indent and outdent in the editor", async (browser) => {
  const { page, folder } = await setupPage(browser, "- Item 1\n- Item 2\n");
  try {
    await page.keyboard.press("Meta+e");
    await page.locator(".mdr-editor .cm-content").waitFor();

    const line2 = page.locator(".mdr-editor .cm-line").nth(1);
    await line2.click();

    await page.keyboard.press("Tab");

    let lines = await page.evaluate(() =>
      [...document.querySelectorAll(".mdr-editor .cm-line")].map((el) => el.textContent),
    );
    assert(lines[1] === "  - Item 2", `expected indented second line, got: ${JSON.stringify(lines)}`);

    await page.keyboard.press("Shift+Tab");

    lines = await page.evaluate(() =>
      [...document.querySelectorAll(".mdr-editor .cm-line")].map((el) => el.textContent),
    );
    assert(lines[1] === "- Item 2", `expected outdented second line, got: ${JSON.stringify(lines)}`);
  } finally {
    await page.close();
    await rm(folder, { recursive: true, force: true });
  }
});

async function main() {
  const vite = startVite();
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    for (const { name, fn } of CHECKS) {
      process.stdout.write(`- ${name} ... `);
      await fn(browser);
      console.log("OK");
    }
    console.log(`\nAll ${CHECKS.length} checks passed.`);
  } catch (err) {
    console.error(`\nFAILED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    vite.kill("SIGTERM");
  }
}

main();
