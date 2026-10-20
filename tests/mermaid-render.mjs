/* eslint-disable */
// Playwright harness for mermaid diagrams in the reading pane.
// Diagrams render after the plain markup has painted, only near the viewport,
// one at a time. These checks pin that contract plus the editing behavior:
// unchanged diagrams never flicker back to source while typing in Split View,
// and a diagram broken mid-edit keeps its last render, dimmed, with a caption.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5231;
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

const fence = (body, lang = "mermaid") => ["```" + lang, body, "```", ""].join("\n");
const FLOW = "flowchart TD\n  A-->B";

const DOCS = {
  "one.md": ["# One", "", fence(FLOW)].join("\n"),
  "bad.md": ["# Bad", "", fence("flowchart TD\n  A -->")].join("\n"),
  "xss.md": [
    "# Xss",
    "",
    fence(
      'flowchart TD\n  A["<script>window.__pwned=1</script>"] --> B["<img src=x onerror=window.__pwned=1>"]',
    ),
  ].join("\n"),
  "long.md": ["# Long", "", fence("flowchart TD\n  Top-->Start")]
    .concat(Array.from({ length: 400 }, (_, i) => `Paragraph ${i} of filler text.\n`))
    .concat([fence("flowchart TD\n  Bottom-->End")])
    .join("\n"),
  "dupes.md": [
    "# Dupes",
    "",
    fence("flowchart TD\n  D1-->D2"),
    fence("flowchart TD\n  D1-->D2"),
    fence("flowchart TD\n  Cap-->Ital", "Mermaid"),
    fence(""),
  ].join("\n"),
  "wide.md": [
    "# Wide",
    "",
    fence("flowchart LR\n  " + Array.from({ length: 40 }, (_, i) => `N${i}`).join("-->")),
  ].join("\n"),
  "plain.md": ["# Plain", "", "No diagrams here."].join("\n"),
  "two.md": [
    "# Two",
    "",
    fence(FLOW),
    "Middle paragraph.",
    "",
    fence("flowchart TD\n  X-->Y"),
  ].join("\n"),
};

const READER = ".mdr-reader";

async function openFile(page, name) {
  await page.locator(".mdr-explorer-row", { hasText: name }).click();
  await page.locator(READER).waitFor();
}

async function waitForSvgs(page, count, timeout = 10000) {
  await page.waitForFunction(
    (n) => document.querySelectorAll(".mdr-reader .mdr-mermaid svg").length === n,
    count,
    { timeout },
  );
}

// 1. Prose paints first; the diagram swaps in afterwards.
check("document paints before the diagram", async (page) => {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "one.md" }).waitFor();
  // Sample every frame from before the click: the first frame showing the
  // heading must still show the fence as plain code.
  await page.evaluate(() => {
    window.__firstFrame = null;
    const sample = () => {
      const h1 = document.querySelector(".mdr-reader h1");
      if (h1 !== null && h1.textContent === "One") {
        window.__firstFrame = {
          pre: document.querySelectorAll(".mdr-reader pre code.language-mermaid").length,
          figures: document.querySelectorAll(".mdr-reader .mdr-mermaid").length,
        };
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.locator(".mdr-explorer-row", { hasText: "one.md" }).click();
  await page.waitForFunction(() => window.__firstFrame !== null, undefined, { timeout: 5000 });
  const frame = await page.evaluate(() => window.__firstFrame);
  assert(
    frame.figures === 0 && frame.pre === 1,
    `first painted frame already had a diagram: ${JSON.stringify(frame)}`,
  );
});

check("valid diagram renders as svg", async (page) => {
  await waitForSvgs(page, 1);
  const pre = await page.locator(`${READER} pre code.language-mermaid`).count();
  assert(pre === 0, `${pre} mermaid <pre> blocks left after render`);
  const line = await page.locator(`${READER} figure.mdr-mermaid`).getAttribute("data-line");
  assert(line !== null, "figure lost the data-line anchor");
});

check("invalid diagram keeps source with caption", async (page) => {
  await openFile(page, "bad.md");
  await page.locator(`${READER} .mdr-mermaid-error`).waitFor({ timeout: 10000 });
  const pre = await page.locator(`${READER} pre code.language-mermaid`).count();
  assert(pre === 1, "invalid diagram's source is no longer shown");
  const caption = await page.locator(`${READER} .mdr-mermaid-error`).innerText();
  assert(caption.startsWith("Mermaid:"), `caption should start with "Mermaid:", got ${caption}`);
});

check("labels cannot run script", async (page) => {
  await openFile(page, "xss.md");
  await page.locator(`${READER} h1`, { hasText: "Xss" }).waitFor();
  await waitForSvgs(page, 1);
  const pwned = await page.evaluate(() => window.__pwned);
  assert(pwned === undefined, "a diagram label executed script");
  const svg = page.locator(`${READER} .mdr-mermaid svg`);
  assert((await svg.locator("foreignObject").count()) === 0, "svg contains foreignObject");
  assert((await svg.locator("script").count()) === 0, "svg contains a script element");
});

// Cancellation path: a render resolving after a document switch must not
// land in the next document.
check("switching documents mid-render", async (page) => {
  await openFile(page, "long.md");
  await openFile(page, "plain.md");
  await page.locator(`${READER} h1`, { hasText: "Plain" }).waitFor();
  await page.waitForTimeout(2000);
  const figures = await page.locator(`${READER} .mdr-mermaid`).count();
  assert(figures === 0, `plain.md shows ${figures} diagrams from another document`);
});

check("below-fold diagram waits for scroll", async (page) => {
  await openFile(page, "long.md");
  await page.locator(`${READER} h1`, { hasText: "Long" }).waitFor();
  await waitForSvgs(page, 1);
  await page.waitForTimeout(500);
  const plain = await page.locator(`${READER} pre code.language-mermaid`).count();
  assert(plain === 1, "below-fold diagram rendered before it came near the viewport");
  await page.evaluate(() => {
    const pane = document.querySelector(".mdr-reader").closest(".mdr-pane");
    pane.scrollTop = pane.scrollHeight;
  });
  await waitForSvgs(page, 2);
});

check("duplicates, capitalized and empty fences", async (page) => {
  await openFile(page, "dupes.md");
  await page.locator(`${READER} h1`, { hasText: "Dupes" }).waitFor();
  await waitForSvgs(page, 3);
  await page.locator(`${READER} .mdr-mermaid-error`).waitFor({ timeout: 10000 });
  const ids = await page.$$eval(`${READER} .mdr-mermaid svg`, (svgs) => svgs.map((s) => s.id));
  assert(new Set(ids).size === 3, `svg ids are not distinct: ${ids.join(", ")}`);
  const shiki = await page.locator(`${READER} pre.shiki`).count();
  assert(shiki === 0, "a Mermaid fence went through the code highlighter");
});

check("wide diagram scrolls inside its figure", async (page) => {
  await openFile(page, "wide.md");
  await page.locator(`${READER} h1`, { hasText: "Wide" }).waitFor();
  await waitForSvgs(page, 1);
  const m = await page.evaluate(() => {
    const figure = document.querySelector(".mdr-reader .mdr-mermaid");
    const svg = figure.querySelector("svg");
    const reader = document.querySelector(".mdr-reader");
    const pane = reader.closest(".mdr-pane");
    return {
      docScroll: document.scrollingElement.scrollWidth,
      inner: innerWidth,
      paneScroll: pane.scrollWidth,
      paneClient: pane.clientWidth,
      readerScroll: reader.scrollWidth,
      readerClient: reader.clientWidth,
      figScroll: figure.scrollWidth,
      figClient: figure.clientWidth,
      svgWidth: svg.getBoundingClientRect().width,
      figWidth: figure.getBoundingClientRect().width,
    };
  });
  assert(m.docScroll <= m.inner, `page scrolls horizontally: ${JSON.stringify(m)}`);
  assert(m.paneScroll <= m.paneClient, `reader pane overflows horizontally: ${JSON.stringify(m)}`);
  assert(m.readerScroll <= m.readerClient, `reader overflows horizontally: ${JSON.stringify(m)}`);
  assert(m.figScroll > m.figClient, `wide diagram does not scroll inside its figure: ${JSON.stringify(m)}`);
});

check("appearance switch re-renders dark", async (page) => {
  await openFile(page, "one.md");
  await waitForSvgs(page, 1);
  const before = await page.locator(`${READER} .mdr-mermaid svg`).evaluate((s) => s.outerHTML);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator(".mdr-sheet").waitFor();
  await page
    .locator(".mdr-setting-row", { hasText: "Appearance" })
    .getByRole("radio", { name: "dark" })
    .click();
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    (old) => {
      const svg = document.querySelector(".mdr-reader .mdr-mermaid svg");
      return svg !== null && svg.outerHTML !== old;
    },
    before,
    { timeout: 10000 },
  );
});

async function lineEnd(page, text) {
  await page.locator(".mdr-editor .cm-line", { hasText: text }).first().click();
  await page.keyboard.press("End");
}

check("split view typing keeps other diagrams stable", async (page) => {
  await openFile(page, "two.md");
  await waitForSvgs(page, 2);
  await page.keyboard.press("Alt+Meta+e");
  await page.locator(".mdr-editor .cm-content").waitFor();
  await waitForSvgs(page, 2);
  // The reader replaces its whole HTML per keystroke, so element identity
  // cannot be the check — "no flicker" means no painted frame shows the
  // second diagram as plain source.
  await page.evaluate(() => {
    window.__sawPre = false;
    window.__sampling = true;
    const sample = () => {
      const blocks = document.querySelectorAll(
        ".mdr-reader pre > code[class*='language-'], .mdr-reader figure.mdr-mermaid",
      );
      const second = blocks[1];
      if (second === undefined || second.tagName === "CODE") window.__sawPre = true;
      if (window.__sampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await lineEnd(page, "A-->B");
  await page.keyboard.type("-->C", { delay: 60 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__sampling = false;
  });
  const sawPre = await page.evaluate(() => window.__sawPre);
  assert(!sawPre, "the unchanged second diagram painted as plain source while typing");
  const first = await page.locator(`${READER} .mdr-mermaid svg`).first().textContent();
  assert(first.includes("C"), "edited diagram did not update after typing paused");
});

check("broken while editing shows stale render", async (page) => {
  await lineEnd(page, "A-->B-->C");
  await page.keyboard.type(" -->");
  await page.waitForFunction(
    () => {
      const figure = document.querySelector(".mdr-reader .mdr-mermaid");
      return (
        figure !== null &&
        figure.hasAttribute("data-stale") &&
        figure.querySelector(".mdr-mermaid-error") !== null
      );
    },
    undefined,
    { timeout: 1500 },
  );
  for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".mdr-reader .mdr-mermaid svg").length === 2 &&
      document.querySelector(".mdr-reader .mdr-mermaid[data-stale]") === null,
    undefined,
    { timeout: 5000 },
  );
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
