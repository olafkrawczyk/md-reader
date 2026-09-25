/* eslint-disable */
// Regression test: local markdown images must be rewritten to asset-protocol
// URLs, and a missing asset bridge must never take down the whole document.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webkit } from "playwright";

const PORT = 5229;
const BASE = `http://localhost:${PORT}`;

const CHECKS = [];
function check(name, fn) {
  CHECKS.push({ name, fn });
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("vite dev server did not start");
}

function startVite() {
  return spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "ignore", "ignore"] },
  );
}

/** Tauri bridge stub. `withAssetBridge` toggles __TAURI_INTERNALS__.convertFileSrc. */
function tauriStubInit({ folderPath, fileName, fileContents, withAssetBridge }) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    registerListener() {
      return { id: 0 };
    },
    unregisterListener() {},
  };
  const internals = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
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
        case "recent_folders":
          return Promise.resolve([]);
        case "set_ignored_directories":
        case "set_workspace_menu_enabled":
        case "plugin:event|listen":
        case "plugin:event|unlisten":
          return Promise.resolve(0);
        default:
          return Promise.reject(new Error(`unexpected command: ${command}`));
      }
    },
  };
  if (withAssetBridge) {
    internals.convertFileSrc = (filePath, protocol = "asset") =>
      `${protocol}://localhost/${encodeURIComponent(filePath)}`;
  }
  window.__TAURI_INTERNALS__ = internals;
}

const DOC = [
  "# Images",
  "",
  "Relative: ![a](./images/diagram.png)",
  "",
  "Parent-relative: ![b](../outside.png)",
  "",
  "Remote: ![c](https://example.com/x.png)",
  "",
  "Inline: ![d](data:image/gif;base64,R0lGODlhAQABAAAAACw=)",
  "",
].join("\n");

async function openDoc(page) {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "images.md" }).waitFor();
  await page.locator(".mdr-explorer-row", { hasText: "images.md" }).click();
  await page.waitForTimeout(1200);
}

async function readImages(page) {
  return page.evaluate(() => {
    const reader = document.querySelector(".mdr-reader");
    return {
      readerPresent: reader !== null,
      heading: reader?.querySelector("h1")?.textContent ?? null,
      srcs: Array.from(reader?.querySelectorAll("img") ?? []).map((i) => i.getAttribute("src")),
    };
  });
}

let folderPath = "";

check("relative image is rewritten to an asset URL", async (page) => {
  const state = await readImages(page);
  assert(state.readerPresent, "reader should be present");
  assert(state.srcs.length === 4, `expected 4 images, got ${state.srcs.length}`);
  assert(
    state.srcs[0].startsWith("asset://localhost/"),
    `relative src should be an asset URL, got ${state.srcs[0]}`,
  );
  assert(
    state.srcs[0].includes(encodeURIComponent(`${folderPath}/images/diagram.png`)),
    `asset URL should point at the resolved file, got ${state.srcs[0]}`,
  );
});

check("parent-relative src resolves against the document folder", async (page) => {
  const state = await readImages(page);
  assert(
    state.srcs[1].includes(encodeURIComponent(`${folderPath}/../outside.png`)) ||
      state.srcs[1].includes(encodeURIComponent(`${join(folderPath, "..")}/outside.png`)),
    `parent-relative src should climb one level, got ${state.srcs[1]}`,
  );
});

check("remote and data URLs are left untouched", async (page) => {
  const state = await readImages(page);
  assert(state.srcs[2] === "https://example.com/x.png", `http src must be untouched, got ${state.srcs[2]}`);
  assert(state.srcs[3].startsWith("data:image/gif;base64,"), `data src must be untouched, got ${state.srcs[3]}`);
});

check("a missing asset bridge degrades without killing the document", async (page) => {
  const crashState = await page.evaluate(() => {
    const reader = document.querySelector(".mdr-reader");
    return { readerPresent: reader !== null, text: reader?.textContent ?? "" };
  });
  // Sanity: the host page must still be alive for the next check to run.
  assert(crashState.readerPresent, "reader should still be mounted");
});

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "img-render-"));
  folderPath = join(dir, "ws");
  const child = startVite();
  let browser;
  let failures = 0;
  try {
    await waitForServer();
    browser = await webkit.launch();

    // Pass 1: with the asset bridge present.
    const page = await browser.newPage();
    await page.addInitScript(tauriStubInit, {
      folderPath,
      fileName: "images.md",
      fileContents: DOC,
      withAssetBridge: true,
    });
    await page.goto(BASE);
    await openDoc(page);
    for (const { name, fn } of CHECKS.slice(0, 3)) {
      try {
        await fn(page);
        console.log(`✓ ${name}`);
      } catch (error) {
        failures++;
        console.error(`✗ ${name}\n    ${error.message}`);
      }
    }

    // Pass 2: WITHOUT the asset bridge — must not crash the render.
    const noBridge = await browser.newPage();
    const errors = [];
    noBridge.on("pageerror", (error) => errors.push(error.message));
    await noBridge.addInitScript(tauriStubInit, {
      folderPath,
      fileName: "images.md",
      fileContents: DOC,
      withAssetBridge: false,
    });
    await noBridge.goto(BASE);
    await openDoc(noBridge);
    const state = await readImages(noBridge);
    try {
      assert(state.readerPresent, "reader unmounted when convertFileSrc was unavailable");
      assert(state.heading === "Images", `document should still render, heading was ${state.heading}`);
      assert(state.srcs[0] !== null && !state.srcs[0].startsWith("asset://"), "src should be left as a path");
      assert(errors.length === 0, `page errors: ${errors.join("; ")}`);
      console.log("✓ missing asset bridge degrades without killing the document");
    } catch (error) {
      failures++;
      console.error(`✗ missing asset bridge degrades without killing the document\n    ${error.message}`);
    }
  } finally {
    if (browser) await browser.close();
    child.kill();
    await rm(dir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll image rendering checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
