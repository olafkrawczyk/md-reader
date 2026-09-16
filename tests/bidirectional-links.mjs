/* eslint-disable */
// Playwright harness for bidirectional links (spec scenarios, tasks 2.1-2.7).
// Runs the vite dev server, stubs the Tauri IPC bridge with an in-memory
// workspace seeded with wikilinked markdown files, and asserts:
// - wikilinks render with alias and target attributes
// - clicking a wikilink opens the target document in a tab
// - backlinks pane shows incoming references and snippet previews
// - unreferenced document shows empty state in backlinks pane
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5203;
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

function tauriStubInit({ folderPath, files }) {
  function buildTree(folderPath, files) {
    const index = new Map();
    const root = [];
    const entries = Object.keys(files).sort();
    for (const relativePath of entries) {
      const parts = relativePath.split("/");
      let currentPath = folderPath;
      let parentChildren = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        currentPath = `${currentPath}/${part}`;
        let node = index.get(currentPath);
        if (!node) {
          node = {
            name: part,
            path: currentPath,
            kind: isFile ? "file" : "folder",
            ...(isFile ? {} : { children: [] }),
          };
          index.set(currentPath, node);
          parentChildren.push(node);
        }
        if (!isFile) {
          parentChildren = node.children;
        }
      }
    }
    return root;
  }

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
    _tree: buildTree(folderPath, files),
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

const FILES = {
  "Architecture.md": [
    "# Architecture",
    "",
    "Core system architecture and design overview.",
    "",
  ].join("\n"),
  "Roadmap.md": [
    "# Roadmap",
    "",
    "For details, read [[Architecture]] before starting.",
    "Also check [[Guides/Setup|Getting Started]] guide.",
    "",
  ].join("\n"),
  "Tasks.md": [
    "# Tasks",
    "",
    "- [ ] Review [[Architecture]] documentation",
    "",
  ].join("\n"),
  "Isolated.md": [
    "# Isolated",
    "",
    "No document links to this file.",
    "",
  ].join("\n"),
  "A/notes.md": [
    "# A Notes",
    "",
    "Referencing sibling: [[readme]].",
    "Referencing unique global: [[changelog]].",
    "",
  ].join("\n"),
  "A/readme.md": [
    "# Readme in A",
    "",
    "This is documentation A.",
    "",
  ].join("\n"),
  "B/notes.md": [
    "# B Notes",
    "",
    "Referencing sibling: [[readme]].",
    "",
  ].join("\n"),
  "B/readme.md": [
    "# Readme in B",
    "",
    "This is documentation B.",
    "",
  ].join("\n"),
  "index.md": [
    "# Index",
    "",
    "Disambiguated target: [[B/readme]].",
    "Explicit relative target: [[./A/readme]].",
    "Ambiguous bare link: [[readme]].",
    "",
  ].join("\n"),
  "changelog.md": [
    "# Changelog",
    "",
    "Workspace-wide unique changelog.",
    "",
  ].join("\n"),
};

async function openDocument(page, name, folder) {
  if (folder !== undefined) {
    const folderRow = page
      .locator(".mdr-explorer-row")
      .filter({ has: page.locator(".mdr-explorer-name", { hasText: new RegExp(`^${folder}$`) }) });
    if ((await folderRow.getAttribute("aria-expanded")) !== "true") {
      await folderRow.click();
    }
    const container = page.locator("li").filter({ has: folderRow });
    const row = container
      .locator(".mdr-explorer-row")
      .filter({ has: page.locator(".mdr-explorer-name", { hasText: new RegExp(`^${name}$`) }) });
    await row.waitFor();
    await row.click();
  } else {
    const row = page
      .locator(".mdr-explorer-row")
      .filter({ has: page.locator(".mdr-explorer-name", { hasText: new RegExp(`^${name}$`) }) })
      .first();
    await row.waitFor();
    await row.click();
  }
  await page.locator(".mdr-reader").waitFor();
}

// 1. Wikilinks render with alias and target attributes
check("wikilinks render in reader with alias and target attributes", async (page) => {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await openDocument(page, "Roadmap.md");

  const archLink = page.locator('.mdr-reader a.mdr-wikilink[data-wikilink-target="Architecture"]');
  await archLink.waitFor();
  const archText = await archLink.innerText();
  assert(archText === "Architecture", `expected "Architecture", got "${archText}"`);

  const aliasLink = page.locator('.mdr-reader a.mdr-wikilink[data-wikilink-target="Guides/Setup"]');
  await aliasLink.waitFor();
  const aliasText = await aliasLink.innerText();
  assert(aliasText === "Getting Started", `expected "Getting Started", got "${aliasText}"`);
});

// 2. Clicking a wikilink activates target document in a tab
check("clicking a wikilink navigates to target document", async (page) => {
  const archLink = page.locator('.mdr-reader a.mdr-wikilink[data-wikilink-target="Architecture"]');
  await archLink.click();

  await page.waitForFunction(() => {
    const activeTab = document.querySelector('.mdr-tab[data-active="true"] .mdr-tab-name');
    return activeTab !== null && activeTab.textContent === "Architecture.md";
  });
  const heading = await page.locator(".mdr-reader h1").innerText();
  assert(heading === "Architecture", `expected Architecture doc to be open, got "${heading}"`);
});

// 3. Backlinks pane displays incoming references with line numbers and snippets
check("backlinks popover displays incoming references and snippets", async (page) => {
  // Currently on Architecture.md, which is linked from Roadmap.md and Tasks.md
  await page.locator(".mdr-backlinks-toolbar-wrapper .mdr-quiet-button").click();
  await page.locator(".mdr-backlinks-popover").waitFor();

  const sources = await page.locator(".mdr-backlinks-source-name").allTextContents();
  assert(
    sources.includes("Roadmap.md") && sources.includes("Tasks.md"),
    `expected Roadmap.md and Tasks.md in backlinks, got: ${JSON.stringify(sources)}`,
  );

  const snippets = await page.locator(".mdr-backlinks-snippet").allTextContents();
  assert(
    snippets.some((s) => s.includes("read [[Architecture]] before starting")),
    `expected snippet with referencing text, got: ${JSON.stringify(snippets)}`,
  );
  await page.keyboard.press("Escape");
});

// 4. Unreferenced document shows empty state in backlinks pane
check("unreferenced document shows empty state in backlinks pane", async (page) => {
  await openDocument(page, "Isolated.md");
  await page.locator(".mdr-backlinks-toolbar-wrapper .mdr-quiet-button").click();
  await page.locator(".mdr-backlinks-popover").waitFor();

  const emptyText = await page.locator(".mdr-backlinks-popover .mdr-empty").innerText();
  assert(emptyText.includes("No incoming links"), `expected empty state, got "${emptyText}"`);
  await page.keyboard.press("Escape");
});

// 5. Source-relative sibling resolution with colliding filenames (task 3.1)
check("sibling readme resolves source-relative in colliding dirs", async (page) => {
  await openDocument(page, "notes.md", "A");
  const siblingLink = page.locator('.mdr-reader a.mdr-wikilink[data-wikilink-target="readme"]');
  await siblingLink.click();

  await page.waitForFunction(() => {
    const activeTab = document.querySelector('.mdr-tab[data-active="true"] .mdr-tab-name');
    return activeTab !== null && activeTab.textContent === "readme.md";
  });

  const heading = await page.locator(".mdr-reader h1").innerText();
  assert(heading === "Readme in A", `expected "Readme in A", got "${heading}"`);
});

// 6. Explicit path with slashes resolves workspace-relative (task 3.1)
check("explicit path with slashes resolves workspace-relative", async (page) => {
  await openDocument(page, "index.md");
  const explicitLink = page.locator(
    '.mdr-reader a.mdr-wikilink[data-wikilink-target="./A/readme"]',
  );
  await explicitLink.click();

  await page.waitForFunction(() => {
    const activeTab = document.querySelector('.mdr-tab[data-active="true"] .mdr-tab-name');
    return activeTab !== null && activeTab.textContent === "readme.md";
  });

  const heading = await page.locator(".mdr-reader h1").innerText();
  assert(heading === "Readme in A", `expected "Readme in A", got "${heading}"`);
});

// 7. Unique global stem match (task 3.1)
check("unique global stem matches workspace-wide", async (page) => {
  await openDocument(page, "notes.md", "A");
  const uniqueLink = page.locator('.mdr-reader a.mdr-wikilink[data-wikilink-target="changelog"]');
  await uniqueLink.click();

  await page.waitForFunction(() => {
    const activeTab = document.querySelector('.mdr-tab[data-active="true"] .mdr-tab-name');
    return activeTab !== null && activeTab.textContent === "changelog.md";
  });
});

// 8. Ambiguous bare link stays unresolved (fail closed) (task 3.2)
check("ambiguous bare link does not navigate", async (page) => {
  await openDocument(page, "index.md");
  const ambiguousLink = page.locator('.mdr-reader a.mdr-wikilink[data-wikilink-target="readme"]');
  await ambiguousLink.click();

  // Give navigation a chance to (incorrectly) fire, then confirm nothing moved
  await page.waitForTimeout(300);
  const activeTab = await page
    .locator('.mdr-tab[data-active="true"] .mdr-tab-name')
    .innerText();
  assert(activeTab === "index.md", `expected to stay on index.md, got "${activeTab}"`);
});

// 9. Phantom backlink elimination with colliding filenames (task 3.1)
check("backlinks are exact-match with colliding filenames", async (page) => {
  await openDocument(page, "readme.md", "B");
  await page.locator(".mdr-backlinks-toolbar-wrapper .mdr-quiet-button").click();
  await page.locator(".mdr-backlinks-popover").waitFor();

  // B/readme.md is linked from B/notes.md and index.md (via [[B/readme]]).
  // A/notes.md resolves its [[readme]] to A/readme.md and must NOT appear.
  // The ambiguous [[readme]] in index.md resolves to null and must NOT appear.
  // Colliding filename notes.md displays with its directory (B/notes.md).
  const bSources = await page.locator(".mdr-backlinks-source-name").allTextContents();
  assert(
    bSources.includes("B/notes.md") && bSources.includes("index.md"),
    `expected B/notes.md and index.md in B backlinks, got: ${JSON.stringify(bSources)}`,
  );
  assert(
    !bSources.includes("A/notes.md") && !bSources.includes("notes.md"),
    `phantom or ambiguous backlink found in B backlinks: ${JSON.stringify(bSources)}`,
  );
  const bSnippets = await page.locator(".mdr-backlinks-snippet").allTextContents();
  assert(
    !bSnippets.some((s) => s.includes("Referencing unique global")),
    `phantom backlink from A/notes.md found: ${JSON.stringify(bSnippets)}`,
  );
  assert(
    !bSnippets.some((s) => s.includes("Ambiguous bare link")),
    `ambiguous bare link must not generate backlink: ${JSON.stringify(bSnippets)}`,
  );
  const bCount = await page.locator(".mdr-backlinks-item").count();
  assert(bCount === 2, `expected exactly 2 backlinks for B/readme.md, got ${bCount}`);
  await page.keyboard.press("Escape");

  // A/readme.md is linked from A/notes.md and index.md (via [[./A/readme]]).
  // B/notes.md resolves to B/readme.md and must NOT appear in A/readme.md backlinks.
  // Colliding filename notes.md displays with its directory (A/notes.md).
  await openDocument(page, "readme.md", "A");
  await page.locator(".mdr-backlinks-toolbar-wrapper .mdr-quiet-button").click();
  await page.locator(".mdr-backlinks-popover").waitFor();
  const aSources = await page.locator(".mdr-backlinks-source-name").allTextContents();
  assert(
    aSources.includes("A/notes.md") && aSources.includes("index.md"),
    `expected A/notes.md and index.md in A backlinks, got: ${JSON.stringify(aSources)}`,
  );
  assert(
    !aSources.includes("B/notes.md") && !aSources.includes("notes.md"),
    `phantom or ambiguous backlink found in A backlinks: ${JSON.stringify(aSources)}`,
  );
  const aSnippets = await page.locator(".mdr-backlinks-snippet").allTextContents();
  assert(
    aSnippets.some((s) => s.includes("Referencing sibling")),
    `expected A/notes.md snippet, got: ${JSON.stringify(aSnippets)}`,
  );
  assert(
    !aSnippets.some((s) => s.includes("Ambiguous bare link")),
    `ambiguous bare link must not generate backlink: ${JSON.stringify(aSnippets)}`,
  );
  const aCount = await page.locator(".mdr-backlinks-item").count();
  assert(aCount === 2, `expected exactly 2 backlinks for A/readme.md, got ${aCount}`);
  await page.keyboard.press("Escape");
});

// 10. Disambiguated autocompletion for duplicate stems (task 3.2)
check("autocompletion disambiguates duplicate stems", async (page) => {
  await openDocument(page, "index.md");
  await page.keyboard.press("Alt+Meta+e");
  await page.locator(".mdr-editor .cm-content").waitFor();
  await page.locator(".mdr-editor .cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("[[read");
  await page.locator(".cm-tooltip").waitFor();

  const labels = await page.locator(".cm-tooltip .cm-completionLabel").allTextContents();
  assert(
    labels.includes("B/readme") && labels.includes("A/readme"),
    `expected path-qualified completions, got: ${JSON.stringify(labels)}`,
  );
  await page.keyboard.press("Escape");
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-test-links-"));

  const vite = startVite();
  const pageErrors = [];
  let failed = false;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(tauriStubInit, {
      folderPath: workspaceDir,
      files: FILES,
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
