/* eslint-disable */
// Playwright harness for the mermaid editor support.
// Highlighting inside mermaid fences and starter-template completion.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5233;
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

const DOCS = {
  "diag.md": [
    "# Diagram",
    "",
    "Plain paragraph words.",
    "",
    "```mermaid",
    "flowchart TD",
    '  A["Start"] --> B',
    "  %% note",
    "```",
    "",
    "```js",
    "const x = 1;",
    "```",
    "",
  ].join("\n"),
  "open.md": ["# Open", "", "```js", "const y = 2;", ""].join("\n"),
  "Other.md": "# Other\n",
};

const LABELS = [
  "mermaid · flowchart",
  "mermaid · sequence",
  "mermaid · class",
  "mermaid · state",
  "mermaid · ER",
  "mermaid · gantt",
  "mermaid · pie",
  "mermaid · mindmap",
];

const EDITOR = ".mdr-editor .cm-content";
const colorOf = (page, text) =>
  page.evaluate((t) => {
    const spans = [...document.querySelectorAll(".mdr-editor .cm-content .cm-line span")];
    const el = spans.find((s) => s.children.length === 0 && s.textContent === t);
    return el ? getComputedStyle(el).color : null;
  }, text);

async function openInEditor(page, name) {
  if (await page.locator(EDITOR).isVisible()) await page.keyboard.press("Meta+e");
  await page.locator(".mdr-explorer-row", { hasText: name }).click();
  await page.locator(".mdr-reader").waitFor();
  await page.keyboard.press("Meta+e");
  await page.locator(EDITOR).waitFor();
}

async function typeAtEnd(page, text) {
  await page.locator(EDITOR).click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.type(text, { delay: 30 });
}

const MERMAID_REQUEST = /node_modules\/.*mermaid|\.vite\/deps\/mermaid/;

// Must run first: any reader render of a mermaid fence loads the library.
check("opening in the editor does not load mermaid", async (page) => {
  const requests = [];
  page.on("request", (r) => {
    if (MERMAID_REQUEST.test(r.url())) requests.push(r.url());
  });
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  // Switch to Writing on a diagram-free doc, then open diag.md; the reader never renders it.
  await page.locator(".mdr-explorer-row", { hasText: "Other.md" }).click();
  await page.locator(".mdr-reader").waitFor();
  await page.keyboard.press("Meta+e");
  await page.locator(EDITOR).waitFor();
  await page.locator(".mdr-explorer-row", { hasText: "diag.md" }).click();
  await page.locator(".mdr-editor .cm-line", { hasText: "flowchart TD" }).waitFor();
  await page.waitForTimeout(1500);
  assert(requests.length === 0, `mermaid requested: ${requests.join(", ")}`);
});

check("mermaid fence is highlighted in the editor", async (page) => {
  await openInEditor(page, "diag.md");
  const plain = await page.locator(".mdr-editor .cm-line", { hasText: "Plain paragraph" }).evaluate(
    (el) => getComputedStyle(el).color,
  );
  for (const token of ["flowchart", "-->", '"Start"', "%% note"]) {
    const color = await colorOf(page, token);
    assert(color !== null, `no span with text ${token}`);
    assert(color !== plain, `${token} has the plain color ${plain}`);
  }
});

check("other fences stay unhighlighted", async (page) => {
  const plain = await page.locator(".mdr-editor .cm-line", { hasText: "Plain paragraph" }).evaluate(
    (el) => getComputedStyle(el).color,
  );
  const line = page.locator(".mdr-editor .cm-line", { hasText: "const x = 1;" });
  const colors = await line.evaluate((el) => [
    getComputedStyle(el).color,
    ...[...el.querySelectorAll("span")].map((s) => getComputedStyle(s).color),
  ]);
  assert(colors.every((c) => c === plain), `js fence is colored: ${JSON.stringify(colors)} vs ${plain}`);
});

const errorLine = (page) =>
  page.evaluate(() => {
    const el = document.querySelector(".mdr-editor .cm-lintRange-error");
    return el ? el.closest(".cm-line")?.textContent ?? "" : null;
  });

async function waitFor(page, fn, timeout, what) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// Places the caret at the end of the diagram's 3rd body line ('  A["Start"] --> B').
async function caretAtThirdBodyLine(page) {
  await page.locator(".mdr-editor .cm-line", { hasText: 'A["Start"] --> B' }).click();
  await page.keyboard.press("End");
}

check("edit inside a fence loads mermaid and marks the error line", async (page) => {
  await openInEditor(page, "diag.md");
  await caretAtThirdBodyLine(page);
  await page.keyboard.type(" -->", { delay: 30 });
  const edited = '  A["Start"] --> B -->';
  await waitFor(page, async () => (await errorLine(page)) === edited, 3000, "error marker on edited line");
  await page.locator(".mdr-editor .cm-lintRange-error").first().hover();
  const tip = page.locator(".cm-tooltip-lint");
  await tip.waitFor({ timeout: 2000 });
  const text = await tip.innerText();
  assert(/Parse error|Parsing failed/.test(text), `unexpected tooltip: ${text}`);
});

check("fixing the line clears the marker", async (page) => {
  await caretAtThirdBodyLine(page);
  for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
  await waitFor(page, async () => (await errorLine(page)) === null, 2000, "marker to clear");
});

check("valid diagram has no markers", async (page) => {
  await openInEditor(page, "Other.md");
  await openInEditor(page, "diag.md");
  await page.locator(".mdr-editor .cm-line", { hasText: "Start" }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" ", { delay: 30 });
  await page.waitForTimeout(2000);
  assert((await errorLine(page)) === null, "unexpected lint marker on valid diagram");
});

check("typing a fence offers templates", async (page) => {
  await typeAtEnd(page, "\n```mer");
  const tooltip = page.locator(".cm-tooltip-autocomplete");
  await tooltip.waitFor();
  const labels = await tooltip.locator("li .cm-completionLabel").allTextContents();
  assert(
    JSON.stringify(labels) === JSON.stringify(LABELS),
    `unexpected options: ${JSON.stringify(labels)}`,
  );
  await tooltip.locator("li", { hasText: "mermaid · sequence" }).click();
  const text = await page.locator(EDITOR).innerText();
  assert(/```mermaid\s*\n?\s*sequenceDiagram/.test(text), `no sequence template in: ${text}`);
  const lines = await page.locator(".mdr-editor .cm-line").allTextContents();
  const opener = lines.findIndex((l, i) => l === "```mermaid" && lines[i + 1] === "sequenceDiagram");
  assert(opener >= 0, `no mermaid opener followed by sequenceDiagram in: ${JSON.stringify(lines)}`);
  assert(lines.slice(opener + 2).includes("```"), `no closing fence after template: ${JSON.stringify(lines)}`);
  const fences = await page.locator(".mdr-editor .cm-line", { hasText: /^```$/ }).count();
  assert(fences >= 3, `expected a closing fence line, saw ${fences}`);
});

check("bare fence then Enter opens a plain block", async (page) => {
  await openInEditor(page, "diag.md");
  await typeAtEnd(page, "\n```");
  await page.waitForTimeout(400);
  const shown = await page.locator(".cm-tooltip-autocomplete li").allTextContents();
  assert(!shown.some((l) => l.includes("mermaid ·")), `templates offered: ${JSON.stringify(shown)}`);
  const mermaidLines = async () =>
    (await page.locator(".mdr-editor .cm-line").allTextContents()).filter((l) => l.includes("mermaid")).length;
  const before = await mermaidLines();
  await page.keyboard.press("Enter");
  const lines = await page.locator(".mdr-editor .cm-line").allTextContents();
  const i = lines.lastIndexOf("```");
  assert(i >= 0 && lines[i + 1] === "" && i + 2 === lines.length, `unexpected doc: ${JSON.stringify(lines)}`);
  assert((await mermaidLines()) === before, `template inserted: ${JSON.stringify(lines)}`);
});

check("closing fence offers no templates", async (page) => {
  await openInEditor(page, "open.md");
  await typeAtEnd(page, "\n```");
  await page.waitForTimeout(600);
  const labels = await page.locator(".cm-tooltip-autocomplete li").allTextContents();
  assert(!labels.some((l) => l.includes("mermaid ·")), `templates offered: ${JSON.stringify(labels)}`);
});

check("wikilink completion still works", async (page) => {
  await page.keyboard.press("Escape");
  await typeAtEnd(page, "\n[[");
  const tooltip = page.locator(".cm-tooltip-autocomplete");
  await tooltip.waitFor();
  const labels = await tooltip.locator("li .cm-completionLabel").allTextContents();
  assert(labels.some((l) => /Other/i.test(l)), `no wikilink options: ${JSON.stringify(labels)}`);
  assert(!labels.some((l) => l.includes("mermaid ·")), "templates leaked into wikilink completion");
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
