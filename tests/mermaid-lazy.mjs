/* eslint-disable */
// Playwright harness for the mermaid lazy-loading guarantees.
// Mermaid is heavy: documents without diagrams must never fetch it, it must
// stay out of the startup bundle graph, and edits re-render at most once per
// typing pause (300 ms debounce).
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const PORT = 5232;
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
  return spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "inherit", "inherit"] },
  );
}

/** Installs a Tauri bridge stub backed by an in-memory folder before app code runs. */
function tauriStubInit({ folderPath, files }) {
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
    _tree: Object.keys(files).map((name) => ({
      name,
      path: `${folderPath}/${name}`,
      kind: "file",
    })),
    _files: Object.fromEntries(
      Object.entries(files).map(([name, contents]) => [`${folderPath}/${name}`, contents]),
    ),
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

const fence = (body) => ["```mermaid", body, "```", ""].join("\n");

const DOCS = {
  "plain.md": ["# Plain", "", "No diagrams here."].join("\n"),
  "one.md": ["# One", "", fence("flowchart TD\n  A-->B")].join("\n"),
  "typing.md": ["# Typing", "", fence("flowchart TD\n  A-->B")].join("\n"),
};

const READER = ".mdr-reader";
// Only mermaid's own packages count; our src/extensions/mermaid*.ts do not.
const MERMAID_URL = /node_modules\/.*mermaid|\.vite\/deps\/mermaid/;
const mermaidRequests = [];

check("plain document never loads mermaid", async (page) => {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "plain.md" }).click();
  await page.locator(READER).waitFor();
  await page.keyboard.press("Meta+e");
  await page.locator(".mdr-editor .cm-content").waitFor();
  await page.locator(".mdr-editor .cm-line", { hasText: "No diagrams" }).first().click();
  await page.keyboard.press("End");
  await page.keyboard.type("x");
  await page.waitForTimeout(2000);
  assert(
    mermaidRequests.length === 0,
    `mermaid was fetched for a plain document: ${mermaidRequests.join(", ")}`,
  );
});

check("diagram document loads mermaid", async (page) => {
  await page.keyboard.press("Meta+e");
  await page.locator(".mdr-explorer-row", { hasText: "one.md" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".mdr-reader .mdr-mermaid svg").length === 1,
    undefined,
    { timeout: 10000 },
  );
  assert(mermaidRequests.length > 0, "matcher saw no mermaid request for a diagram document");
});

check("mermaid is not in the startup graph", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "mdr-build-"));
  try {
    await new Promise((resolve, reject) => {
      const build = spawn(
        process.execPath,
        ["node_modules/vite/bin/vite.js", "build", "--manifest", "--outDir", outDir, "--emptyOutDir"],
        { cwd: process.cwd(), stdio: ["ignore", "ignore", "inherit"] },
      );
      build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build exit ${code}`))));
    });
    const manifest = JSON.parse(await readFile(join(outDir, ".vite", "manifest.json"), "utf8"));
    const isMermaid = (key) => /node_modules\/mermaid/.test(key) || /mermaid/i.test(manifest[key].file ?? "");
    const entries = Object.keys(manifest).filter((k) => manifest[k].isEntry);
    assert(entries.length > 0, "manifest has no entry chunk");
    const walk = (starts, field) => {
      const seen = new Set();
      const stack = [...starts];
      while (stack.length > 0) {
        const key = stack.pop();
        if (seen.has(key)) continue;
        seen.add(key);
        stack.push(...(manifest[key][field] ?? []));
      }
      return seen;
    };
    const staticGraph = walk(entries, "imports");
    const eager = [...staticGraph].filter(isMermaid);
    assert(eager.length === 0, `mermaid is statically reachable from the entry: ${eager.join(", ")}`);
    // Rollup inlines a statically imported mermaid into the entry chunk, so
    // there is no separate manifest key to spot; look for its core's code too.
    for (const key of staticGraph) {
      const code = await readFile(join(outDir, manifest[key].file), "utf8");
      assert(
        !code.includes("UnknownDiagramError"),
        `mermaid core is inlined into startup chunk ${manifest[key].file}`,
      );
    }
    const dynamicRoots = [...staticGraph].flatMap((k) => manifest[k].dynamicImports ?? []);
    const lazy = [...walk(dynamicRoots, "imports")].filter(isMermaid);
    assert(lazy.length > 0, "no dynamic import reaches mermaid (matcher not live)");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

check("edits render at most once per typing pause", async (page) => {
  await page.locator(".mdr-explorer-row", { hasText: "typing.md" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".mdr-reader .mdr-mermaid svg").length === 1,
    undefined,
    { timeout: 10000 },
  );
  await page.keyboard.press("Alt+Meta+e");
  await page.locator(".mdr-editor .cm-content").waitFor();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__states = [];
    const labels = () => {
      const svg = document.querySelector(".mdr-reader .mdr-mermaid svg");
      if (svg === null) return null;
      return [...svg.querySelectorAll("g.node")].map((n) => n.textContent.trim());
    };
    const record = () => {
      const l = labels();
      if (l === null) return;
      const key = l.join("|");
      if (window.__states[window.__states.length - 1] !== key) window.__states.push(key);
    };
    record();
    new MutationObserver(record).observe(document.querySelector(".mdr-reader").parentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  });
  await page.locator(".mdr-editor .cm-line", { hasText: "A-->B" }).first().click();
  await page.keyboard.press("End");
  await page.keyboard.type("-->XYZ", { delay: 40 });
  await page.waitForTimeout(1500);
  const states = await page.evaluate(() => window.__states);
  const last = states[states.length - 1] ?? "";
  assert(last.includes("XYZ"), `final render lacks XYZ: ${JSON.stringify(states)}`);
  const partial = states.filter((s) => s.split("|").some((l) => l === "X" || l === "XY"));
  assert(partial.length === 0, `partial renders mid-typing: ${JSON.stringify(states)}`);
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-test-"));
  const vite = startVite();
  const pageErrors = [];
  let failed = false;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(tauriStubInit, { folderPath: workspaceDir, files: DOCS });
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("request", (request) => {
      if (MERMAID_URL.test(request.url())) mermaidRequests.push(request.url());
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
    process.stdout.write("FAIL\n");
    console.error(error);
  } finally {
    vite.kill();
    await rm(workspaceDir, { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
}

main();
