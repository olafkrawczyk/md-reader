/* eslint-disable */
// Playwright harness: double-click reading content → edit mode, app version
// in Settings, and the startup update notice against a mocked updater feed
// (update available / no update / network error).
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 5217;
const BASE = `http://localhost:${PORT}`;
const FOLDER = "/tmp/mdr-update-test";
const DOC = "# Title\n\nSome paragraph to double-click.\n\n[a link](https://example.com)\n";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("vite dev server did not start");
}

/** Tauri bridge stub; `feed` drives the plugin:updater|check response. */
function tauriStubInit({ folder, doc, feed, terminalCommand }) {
  window.__calls = [];
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { registerListener: () => ({ id: 0 }), unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    _next: 0,
    _callbacks: {},
    transformCallback(callback) {
      const id = this._next++;
      this._callbacks[id] = callback;
      return id;
    },
    invoke(command) {
      window.__calls.push(command);
      switch (command) {
        case "plugin:dialog|open":
          return Promise.resolve(folder);
        case "read_dir_tree":
          return Promise.resolve([{ name: "doc.md", path: `${folder}/doc.md`, kind: "file" }]);
        case "read_text_file":
          return Promise.resolve(doc);
        case "plugin:app|version":
          return Promise.resolve("0.2.0");
        case "recent_folders":
          return Promise.resolve([]);
        case "plugin:updater|check":
          if (feed === "error") return Promise.reject(new Error("network unreachable"));
          if (feed === "none") return Promise.resolve(null);
          return Promise.resolve({ rid: 7, currentVersion: "0.2.0", version: "0.3.0", rawJson: {} });
        case "terminal_setup":
          return Promise.resolve(terminalCommand ? { command: terminalCommand } : null);
        default:
          return Promise.resolve(null);
      }
    },
  };
}

async function openPage(browser, feed, terminalCommand = null) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await context.addInitScript(tauriStubInit, { folder: FOLDER, doc: DOC, feed, terminalCommand });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator(".mdr-welcome").waitFor();
  return { page, errors };
}

const CHECKS = {
  async "double-click in reading mode switches to edit mode"(browser) {
    const { page, errors } = await openPage(browser, "none");
    await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
    await page.locator(".mdr-explorer-row", { hasText: "doc.md" }).click();
    await page.locator(".mdr-reader p").first().waitFor();
    assert((await page.locator(".mdr-editor").count()) === 0, "editor visible before double-click");
    await page.locator(".mdr-reader a").dblclick();
    assert((await page.locator(".mdr-editor").count()) === 0, "double-click on a link must not enter edit mode");
    await page.locator(".mdr-reader p").first().dblclick();
    await page.locator(".mdr-editor").waitFor({ timeout: 3000 });
    assert(errors.length === 0, errors.join("; "));
  },
  async "settings shows the runtime app version"(browser) {
    const { page } = await openPage(browser, "none");
    await page.locator('button[title="Settings"]').click();
    await page.locator(".mdr-settings-version", { hasText: "md-reader 0.2.0" }).waitFor({ timeout: 3000 });
    assert((await page.locator(".mdr-settings-terminal").count()) === 0, "setup note shown when the command exists");
  },
  async "settings copies a terminal setup command when md-reader is missing"(browser) {
    const command = "echo setup-md-reader";
    const { page, errors } = await openPage(browser, "none", command);
    await page.locator('button[title="Settings"]').click();
    const note = page.locator(".mdr-settings-terminal");
    await note.waitFor({ timeout: 3000 });
    assert((await note.textContent()).includes("md-reader"), "note should name the command");
    await note.getByRole("button", { name: "Copy setup command" }).click();
    await note.getByRole("button", { name: "Copied" }).waitFor({ timeout: 3000 });
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert(copied === command, `clipboard: ${copied}`);
    assert(errors.length === 0, errors.join("; "));
  },
  async "update available: notice installs and relaunches"(browser) {
    const { page, errors } = await openPage(browser, "available");
    const notice = page.locator(".mdr-update-notice");
    await notice.waitFor({ timeout: 3000 });
    const text = await notice.textContent();
    assert(text.includes("0.3.0") && text.includes("0.2.0"), `notice text: ${text}`);
    await notice.getByRole("button", { name: "Update & Restart" }).click();
    await page.waitForFunction(() => window.__calls.includes("plugin:process|restart"), null, { timeout: 3000 });
    const calls = await page.evaluate(() => window.__calls);
    assert(
      calls.indexOf("plugin:updater|download_and_install") < calls.indexOf("plugin:process|restart"),
      "install must precede restart",
    );
    assert(errors.length === 0, errors.join("; "));
  },
  async "no update: no notice"(browser) {
    const { page } = await openPage(browser, "none");
    await page.waitForFunction(() => window.__calls.includes("plugin:updater|check"));
    await page.waitForTimeout(300);
    assert((await page.locator(".mdr-update-notice").count()) === 0, "notice shown without update");
  },
  async "network error: no notice, no page error"(browser) {
    const { page, errors } = await openPage(browser, "error");
    await page.waitForFunction(() => window.__calls.includes("plugin:updater|check"));
    await page.waitForTimeout(300);
    assert((await page.locator(".mdr-update-notice").count()) === 0, "notice shown after failed check");
    assert(errors.length === 0, errors.join("; "));
  },
};

const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"], {
  stdio: ["ignore", "ignore", "inherit"],
});
let failed = false;
try {
  await waitForServer();
  const browser = await chromium.launch();
  for (const [name, fn] of Object.entries(CHECKS)) {
    process.stdout.write(`- ${name} ... `);
    await fn(browser);
    process.stdout.write("OK\n");
  }
  await browser.close();
} catch (error) {
  failed = true;
  process.stderr.write(`\nFAILED: ${error.message}\n`);
} finally {
  vite.kill("SIGTERM");
}
process.exit(failed ? 1 : 0);
