/* eslint-disable */
// UI regression for issue #2: a "cannot open folder" error raised by a CLI /
// Finder open must clear once a folder opens successfully.
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const GOOD = "/good";
const BAD = "/nonexistent";

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

function tauriStubInit({ good, bad }) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    registerListener() {
      return { id: 0 };
    },
    unregisterListener() {},
  };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    _nextCallbackId: 0,
    _callbacks: {},
    _cliHandler: null,
    transformCallback(callback) {
      const T = window.__TAURI_INTERNALS__;
      const id = T._nextCallbackId++;
      T._callbacks[id] = callback;
      return id;
    },
    invoke(command, args) {
      const T = window.__TAURI_INTERNALS__;
      switch (command) {
        case "take_pending_cli_open":
          return Promise.resolve({ kind: "folder", path: bad });
        case "activate_workspace":
          return args.root === bad
            ? Promise.reject(`cannot open folder ${bad}: No such file or directory (os error 2)`)
            : Promise.resolve(null);
        case "read_dir_tree":
          return Promise.resolve([{ name: "readme.md", path: `${good}/readme.md`, kind: "file" }]);
        case "read_text_file":
          return Promise.resolve("# Readme\n");
        case "plugin:event|listen":
          if (args.event === "cli-open") T._cliHandler = args.handler;
          return Promise.resolve(0);
        case "plugin:event|unlisten":
          return Promise.resolve(0);
        default:
          return Promise.reject(new Error(`unexpected command: ${command}`));
      }
    },
  };
  window.__emitCliOpen = (payload) => {
    const T = window.__TAURI_INTERNALS__;
    T._callbacks[T._cliHandler]({ event: "cli-open", id: 0, payload });
  };
}

async function main() {
  const vite = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "inherit", "inherit"] },
  );
  let failed = false;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.addInitScript(tauriStubInit, { good: GOOD, bad: BAD });
    await page.goto(BASE, { waitUntil: "networkidle" });

    process.stdout.write("- failed launch open shows the error ... ");
    const status = page.locator(".mdr-status");
    await status.filter({ hasText: "cannot open folder" }).waitFor({ timeout: 5000 });
    process.stdout.write("OK\n");

    process.stdout.write("- a later successful CLI open clears it ... ");
    await page.waitForFunction(() => window.__TAURI_INTERNALS__._cliHandler !== null);
    await page.evaluate((good) => window.__emitCliOpen({ kind: "folder", path: good }), GOOD);
    await page.locator(".mdr-explorer-row", { hasText: "readme.md" }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(200);
    const remaining = await status.allTextContents();
    assert(remaining.length === 0, `status still shown: ${remaining.join("; ")}`);
    process.stdout.write("OK\n");

    await browser.close();
  } catch (error) {
    failed = true;
    process.stderr.write(`\nFAILED: ${error.message}\n`);
  } finally {
    vite.kill("SIGTERM");
  }
  process.exit(failed ? 1 : 0);
}

main();
