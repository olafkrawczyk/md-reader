/* eslint-disable */
// Playwright harness for external link handling (spec scenarios, task 3.1).
// Runs the vite dev server, stubs the Tauri IPC bridge with an in-memory
// workspace seeded with link markdown plus a recording opener stub, and
// drives the real reader UI. Asserts the webview never navigates.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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
        case "plugin:opener|open_url":
          window.__openerCalls.push(args.url);
          return Promise.resolve(null);
        default:
          return Promise.reject(new Error(`unexpected command: ${command}`));
      }
    },
  };
  window.__openerCalls = [];
}

const LINK_DOC = [
  "# Links",
  "",
  "- [Secure](https://example.com/secure)",
  "- [Insecure](http://example.com/insecure)",
  "- [Mail](mailto:test@example.com)",
  "- [Relative](./other.md)",
  "",
].join("\n");

async function openDocument(page) {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "links.md" }).waitFor();
  await page.locator(".mdr-explorer-row", { hasText: "links.md" }).click();
  await page.locator(".mdr-reader").waitFor();
}

// Exact text match: "Secure" must not also match "Insecure".
function readerLink(page, text) {
  return page.locator(".mdr-reader a", { hasText: new RegExp(`^${text}$`) });
}

async function openerCalls(page) {
  return page.evaluate(() => window.__openerCalls.slice());
}

async function expectNoNavigation(page, run) {
  const before = page.url();
  await run();
  assert(page.url() === before, `webview navigated: ${before} -> ${page.url()}`);
}

// 1. https link is handed to the opener verbatim; no navigation.
check("https link calls the opener with the exact URL", async (page) => {
  await openDocument(page);
  await expectNoNavigation(page, () => readerLink(page, "Secure").click());
  const calls = await openerCalls(page);
  assert(
    calls.includes("https://example.com/secure"),
    `opener was not called with the https URL; calls: ${JSON.stringify(calls)}`,
  );
});

// 2. http link goes through the opener too.
check("http link calls the opener", async (page) => {
  await expectNoNavigation(page, () => readerLink(page, "Insecure").click());
  const calls = await openerCalls(page);
  assert(
    calls.includes("http://example.com/insecure"),
    `opener was not called with the http URL; calls: ${JSON.stringify(calls)}`,
  );
});

// 3. mailto is delegated to the OS handler.
check("mailto link is delegated to the opener", async (page) => {
  await expectNoNavigation(page, () => readerLink(page, "Mail").click());
  const calls = await openerCalls(page);
  assert(
    calls.includes("mailto:test@example.com"),
    `opener was not called with the mailto URL; calls: ${JSON.stringify(calls)}`,
  );
});

// 4. Relative links are inert: no opener call, no navigation.
check("relative link does nothing", async (page) => {
  const callsBefore = await openerCalls(page);
  await expectNoNavigation(page, () => readerLink(page, "Relative").click());
  const calls = await openerCalls(page);
  assert(
    calls.length === callsBefore.length,
    `relative link reached the opener; calls: ${JSON.stringify(calls)}`,
  );
});

// 5. Repeated clicks keep working and the page URL never changes.
check("page URL is unchanged after every click", async (page) => {
  await readerLink(page, "Secure").click();
  await readerLink(page, "Mail").click();
  await readerLink(page, "Relative").click();
  const calls = await openerCalls(page);
  assert(calls.filter((url) => url === "https://example.com/secure").length === 2,
    "repeated https click was not handed to the opener again");
  assert(page.url().startsWith("http://localhost:5199"),
    `unexpected final URL: ${page.url()}`);
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-test-"));
  const fileName = "links.md";

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
      fileContents: LINK_DOC,
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
