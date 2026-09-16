/* eslint-disable */
// Playwright harness for the search extension (tasks 2.3, 3.4, 8.1, 8.2).
// Runs the vite dev server, stubs the Tauri IPC bridge with an in-memory
// workspace, and drives the real find bar and explorer search.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

/** Installs a Tauri bridge stub backed by an in-memory nested folder. */
function tauriStubInit({ folderPath, files }) {
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
    _folder: F,
    _tree: [
      {
        name: "docs",
        path: `${F}/docs`,
        kind: "folder",
        children: [
          { name: "note.md", path: `${F}/docs/note.md`, kind: "file" },
          { name: "guide.md", path: `${F}/docs/guide.md`, kind: "file" },
        ],
      },
      {
        name: "archive",
        path: `${F}/archive`,
        kind: "folder",
        children: [
          {
            name: "old",
            path: `${F}/archive/old`,
            kind: "folder",
            children: [
              { name: "notes-old.md", path: `${F}/archive/old/notes-old.md`, kind: "file" },
            ],
          },
        ],
      },
      { name: "code.txt", path: `${F}/code.txt`, kind: "file" },
    ],
    _files: files,
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

async function openFolder(page) {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "docs" }).waitFor();
}

async function openDocument(page, name, folder) {
  if (folder !== undefined) {
    await page.locator(".mdr-explorer-row", { hasText: folder }).click();
  }
  await page.locator(".mdr-explorer-row", { hasText: name }).click();
  await page.locator(".mdr-reader").waitFor();
}

const SEARCH_ICON = '[aria-label="Search file names"]';
const SEARCH_INPUT = ".mdr-explorer-search";
const FIND_INPUT = ".mdr-findbar-input";

async function registryHighlights(page) {
  return page.evaluate(() => {
    const matches = CSS.highlights.get("mdr-find-matches");
    const current = CSS.highlights.get("mdr-find-current");
    return {
      matchCount: matches === undefined ? 0 : [...matches].length,
      hasCurrent: current !== undefined,
    };
  });
}

// ---- unit-level checks (task 2.3, 3.4) ----

check("default provider filters names case-insensitively and prunes", async (page) => {
  const result = await page.evaluate(async () => {
    const module = await import("/src/extensions/search.tsx");
    const provider = module.defaultSearchProvider;
    const tree = [
      {
        name: "Docs",
        path: "/w/Docs",
        kind: "folder",
        children: [
          { name: "Alpha.md", path: "/w/Docs/Alpha.md", kind: "file" },
          { name: "beta.txt", path: "/w/Docs/beta.txt", kind: "file" },
        ],
      },
      {
        name: "empty",
        path: "/w/empty",
        kind: "folder",
        children: [{ name: "zeta.md", path: "/w/empty/zeta.md", kind: "file" }],
      },
      { name: "loose.txt", path: "/w/loose.txt", kind: "file" },
    ];
    const hit = provider.filterFileNames(tree, "ALPH");
    const folderHit = provider.filterFileNames(tree, "docs");
    const none = provider.filterFileNames(tree, "zzz");
    return {
      hitDocsChildren: hit
        .filter((e) => e.name === "Docs")
        .flatMap((e) => (e.children ?? []).map((c) => c.name)),
      hitCapable: provider.capabilities.fileNameFilter && provider.capabilities.findInDocument,
      folderHitCount: folderHit.length,
      noneCount: none.length,
      passthrough: provider.filterFileNames(tree, "  ") === tree,
    };
  });
  assert(result.hitCapable, "provider should declare both capabilities");
  assert(
    JSON.stringify(result.hitDocsChildren) === JSON.stringify(["Alpha.md"]),
    `expected pruned [Alpha.md] under Docs, got ${JSON.stringify(result.hitDocsChildren)}`,
  );
  // Query "docs" matches no file name: the folder itself must not appear.
  assert(result.folderHitCount === 0, `expected 0 entries for folder-name query, got ${result.folderHitCount}`);
  assert(result.noneCount === 0, `expected 0 entries for no-hit query, got ${result.noneCount}`);
  assert(result.passthrough, "empty query should return the tree unchanged");
});

check("target registry resolves focused pane with reader fallback", async (page) => {
  const result = await page.evaluate(async () => {
    const module = await import("/src/core/search/searchTypes.ts");
    const registry = new module.SearchTargetRegistryImpl();
    const editor = { find() {}, next() {}, prev() {}, refresh() {}, clear() {}, onState() { return () => {}; } };
    const reader = { ...editor };
    registry.register("editor", () => editor);
    registry.register("reader", () => reader);
    const focused = registry.resolve("editor");
    const fallback = registry.resolve("sidebar");
    const noneFocused = registry.resolve(null);
    registry.unregister("reader");
    const afterUnregister = registry.resolve("sidebar");
    return {
      focusedIsEditor: focused?.paneId === "editor" && focused?.target === editor,
      fallbackIsReader: fallback?.paneId === "reader" && fallback?.target === reader,
      noneFocusedIsReader: noneFocused?.paneId === "reader",
      afterUnregisterIsEditor: afterUnregister?.paneId === "editor",
    };
  });
  for (const [name, value] of Object.entries(result)) {
    assert(value === true, `${name} failed`);
  }
});

// ---- find bar in reader (task 8.1) ----

check("reader find: open, count, highlight, navigate, wrap, escape", async (page) => {
  await openFolder(page);
  await openDocument(page, "note.md", "docs");
  await page.keyboard.press("Control+f");
  await page.locator(".mdr-findbar").waitFor();
  assert(
    await page.evaluate(() => document.activeElement?.classList.contains("mdr-findbar-input")),
    "find input should be focused after ⌘F",
  );
  await page.keyboard.type("alpha");
  await page.locator(".mdr-findbar-count", { hasText: "1 of 2" }).waitFor();
  const highlights = await registryHighlights(page);
  assert(highlights.matchCount === 2, `expected 2 reader match ranges, got ${highlights.matchCount}`);
  assert(highlights.hasCurrent, "current-match highlight should be registered");

  await page.keyboard.press("Enter");
  await page.locator(".mdr-findbar-count", { hasText: "2 of 2" }).waitFor();
  await page.keyboard.press("Enter");
  await page.locator(".mdr-findbar-count", { hasText: "1 of 2" }).waitFor(); // wrap
  await page.keyboard.press("Shift+Enter");
  await page.locator(".mdr-findbar-count", { hasText: "2 of 2" }).waitFor(); // wrap backwards

  await page.keyboard.press("Escape");
  await page.locator(".mdr-findbar").waitFor({ state: "detached" });
  const cleared = await registryHighlights(page);
  assert(cleared.matchCount === 0 && !cleared.hasCurrent, "highlights should clear on close");
  assert(
    await page.evaluate(
      () => document.activeElement?.getAttribute("data-pane-id") === "reader",
    ),
    "focus should return to the reader pane",
  );
});

check("find bar does not open without a document", async (page) => {
  await page.keyboard.press("Control+w"); // close the tab from the previous check
  await page.locator(".mdr-welcome").waitFor();
  await page.keyboard.press("Control+f");
  assert(await page.locator(".mdr-findbar").count() === 0, "find bar should stay closed");
});

// ---- split view targeting (task 8.1) ----

check("split view: find targets the focused editor pane", async (page) => {
  await openDocument(page, "note.md"); // docs folder is still expanded
  await page.keyboard.press("Alt+Meta+e");
  await page.locator(".mdr-editor .cm-content").waitFor();
  await page.locator(".mdr-editor .cm-content").click();
  await page.keyboard.press("Control+f");
  await page.locator(".mdr-findbar").waitFor();
  await page.keyboard.type("alpha");
  await page.locator(".mdr-findbar-count", { hasText: "1 of 2" }).waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".mdr-editor .cm-searchMatch").length > 0,
  );
  const editorMatches = await page.evaluate(
    () => document.querySelectorAll(".mdr-editor .cm-searchMatch").length,
  );
  assert(editorMatches === 2, `expected 2 editor match decorations, got ${editorMatches}`);
  const readerHighlights = await registryHighlights(page);
  assert(
    readerHighlights.matchCount === 0 && !readerHighlights.hasCurrent,
    "reader pane must not highlight when the editor is targeted",
  );
  await page.keyboard.press("Escape");
});

check("split view: focus outside document panes falls back to the reader", async (page) => {
  await page.getByRole("button", { name: "Toggle Sidebar" }).click(); // moves focus out of panes
  await page.keyboard.press("Control+f");
  await page.locator(".mdr-findbar").waitFor();
  await page.keyboard.type("alpha");
  await page.locator(".mdr-findbar-count", { hasText: "1 of 2" }).waitFor();
  const highlights = await registryHighlights(page);
  assert(highlights.matchCount === 2, `expected reader fallback highlights, got ${highlights.matchCount}`);
  const editorMatches = await page.evaluate(
    () => document.querySelectorAll(".mdr-editor .cm-searchMatch").length,
  );
  assert(editorMatches === 0, "editor must not highlight when the reader is targeted");
  await page.keyboard.press("Escape");
});

// ---- sidebar filename search (task 8.2) ----

check("sidebar search unfolds, filters across subdirs, restores", async (page) => {
  const sidebarVisible = await page.locator(SEARCH_ICON).isVisible();
  if (!sidebarVisible) {
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  }
  await page.locator(SEARCH_ICON).click();
  assert(
    await page.evaluate(() => document.activeElement?.classList.contains("mdr-explorer-search")),
    "search input should be focused immediately after unfolding",
  );
  await page.keyboard.type("old");
  await page.locator(".mdr-explorer-row", { hasText: "notes-old.md" }).waitFor();
  assert(
    await page.locator(".mdr-explorer-row", { hasText: "guide.md" }).count() === 0,
    "non-matching files should be pruned",
  );
  assert(
    await page.locator(".mdr-explorer-row", { hasText: "notes-old.md" }).isVisible(),
    "matches inside collapsed folders should be visible",
  );
  await page.keyboard.press("Escape");
  assert(await page.locator(SEARCH_INPUT).count() === 0, "input should collapse back to the icon");
  // The sidebar was re-toggled this session, so folder disclosure restarted:
  // expand docs, then the pruned file must be gone and the full tree back.
  await page.locator(".mdr-explorer-row", { hasText: "docs" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "guide.md" }).waitFor();
  assert(
    await page.locator(".mdr-explorer-row", { hasText: "notes-old.md" }).count() === 0,
    "previously matching deep file should not linger in the restored tree",
  );
});

check("sidebar search matches nested files case-insensitively", async (page) => {
  await page.locator(SEARCH_ICON).click();
  await page.keyboard.type("NOTE");
  await page.waitForFunction(() => {
    const rows = [
      ...document.querySelectorAll(".mdr-explorer-row[data-type='file'] .mdr-explorer-name"),
    ];
    return rows.some((row) => row.textContent === "note.md") &&
      rows.every((row) => /note/i.test(row.textContent ?? ""));
  });
  await page.keyboard.press("Escape");
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-search-test-"));
  const files = {
    [`${workspaceDir}/docs/note.md`]: "# Title\n\nalpha beta and alpha again.\n",
    [`${workspaceDir}/docs/guide.md`]: "# Guide\n\nunrelated body text.\n",
    [`${workspaceDir}/archive/old/notes-old.md`]: "# Old\n\narchived notes.\n",
    [`${workspaceDir}/code.txt`]: "plain text file\n",
  };

  const vite = startVite();
  const pageErrors = [];
  let failed = false;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(tauriStubInit, { folderPath: workspaceDir, files });
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
