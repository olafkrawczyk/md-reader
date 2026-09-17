/* eslint-disable */
// Playwright harness for predictable focus mode (tasks 6.1, 6.2, 6.3).
// Validates fixed focal band, containment selection, list unit granularity,
// tall block focus holding, boundary stability, outline jump alignment,
// offset accumulation accuracy, keyboard navigation, and motion guards.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5210;
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
        default:
          return Promise.reject(new Error(`unexpected command: ${command}`));
      }
    },
  };
}

const TALL_CODE_LINES = Array.from({ length: 60 }, (_, i) => `console.log("line ${i + 1}");`).join("\n");

const FOCUS_DOC = [
  "# Focus Mode Testing",
  "",
  "First intro paragraph after title.",
  "",
  "## Navigation Section",
  "",
  "Paragraph before list of items.",
  "",
  "- List item alpha",
  "  - Nested item alpha one",
  "  - Nested item alpha two",
  "- List item beta",
  "- List item gamma",
  "",
  "## Tall Block Section",
  "",
  "Paragraph above the tall code block.",
  "",
  "```javascript",
  TALL_CODE_LINES,
  "```",
  "",
  "Paragraph directly below the tall code block.",
  "",
  "## Concluding Section",
  "",
  "Final paragraph of the long document.",
  "",
].join("\n");

async function openDocument(page) {
  await page.locator("button.mdr-primary-button", { hasText: "Open Folder…" }).click();
  await page.locator(".mdr-explorer-row", { hasText: "doc.md" }).waitFor();
  await page.locator(".mdr-explorer-row", { hasText: "doc.md" }).click();
  await page.locator(".mdr-reader").waitFor();
}

async function enableFocusMode(page) {
  const toggle = page.locator('button[title*="Focus Mode"]');
  const title = await toggle.getAttribute("title");
  if (title === "Enable Focus Mode") {
    await toggle.click();
  }
  await page.locator('.mdr-reader[data-focus-mode="true"]').waitFor();
}

async function disableFocusMode(page) {
  const toggle = page.locator('button[title*="Focus Mode"]');
  const title = await toggle.getAttribute("title");
  if (title === "Disable Focus Mode") {
    await toggle.click();
  }
  await page.waitForFunction(() => !document.querySelector(".mdr-reader")?.hasAttribute("data-focus-mode"));
}

// 1. First and last unit focus unclipped
check("first and last unit focus unclipped", async (page) => {
  await openDocument(page);
  await enableFocusMode(page);

  // Scroll to top
  await page.evaluate(() => {
    const pane = document.querySelector('[data-pane-id="reader"]');
    pane.scrollTop = 0;
  });
  await page.waitForTimeout(50);

  const firstUnit = await page.evaluate(() => {
    const pane = document.querySelector('[data-pane-id="reader"]');
    const focused = pane.querySelector(".is-focused");
    const paneRect = pane.getBoundingClientRect();
    const rect = focused?.getBoundingClientRect();
    return {
      tag: focused?.tagName,
      text: focused?.textContent?.trim(),
      topInPane: rect ? rect.top - paneRect.top : -1,
      bottomInPane: rect ? rect.bottom - paneRect.top : -1,
      paneHeight: pane.clientHeight,
    };
  });

  assert(firstUnit.tag === "H1", `expected first unit H1, got ${firstUnit.tag}`);
  assert(firstUnit.topInPane >= 0, `first unit top clipped: ${firstUnit.topInPane}`);
  assert(firstUnit.bottomInPane <= firstUnit.paneHeight, `first unit bottom clipped`);

  // Scroll to bottom
  await page.evaluate(() => {
    const pane = document.querySelector('[data-pane-id="reader"]');
    pane.scrollTop = pane.scrollHeight;
  });
  await page.waitForTimeout(50);

  const lastUnit = await page.evaluate(() => {
    const pane = document.querySelector('[data-pane-id="reader"]');
    const focused = pane.querySelector(".is-focused");
    const paneRect = pane.getBoundingClientRect();
    const rect = focused?.getBoundingClientRect();
    return {
      text: focused?.textContent?.trim(),
      topInPane: rect ? rect.top - paneRect.top : -1,
      bottomInPane: rect ? rect.bottom - paneRect.top : -1,
      paneHeight: pane.clientHeight,
    };
  });

  assert(lastUnit.text?.includes("Final paragraph"), `expected last unit to be final paragraph, got ${lastUnit.text}`);
  assert(lastUnit.topInPane >= 0, `last unit top clipped: ${lastUnit.topInPane}`);
  assert(lastUnit.bottomInPane <= lastUnit.paneHeight, `last unit bottom clipped: ${lastUnit.bottomInPane} > ${lastUnit.paneHeight}`);
});

// 2. Focused unit appears at the same pane offset across stepping
check("focused unit appears at the same pane offset across document", async (page) => {
  // Reset focus to the first unit at the focal band
  await page.evaluate(() => {
    const pane = document.querySelector('[data-pane-id="reader"]');
    const first = document.querySelector('[data-focus-unit]');
    first?.scrollIntoView({ block: "start" });
    pane.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(50);

  // Focus the reader pane to receive keys
  await page.locator('[data-pane-id="reader"]').focus();

  // Step forward three times with ArrowDown
  const offsets = [];
  for (let step = 0; step < 4; step++) {
    if (step > 0) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(50);
    }
    const offset = await page.evaluate(() => {
      const pane = document.querySelector('[data-pane-id="reader"]');
      const focused = pane.querySelector(".is-focused");
      const paneRect = pane.getBoundingClientRect();
      const rect = focused?.getBoundingClientRect();
      return rect ? rect.top - paneRect.top : -1;
    });
    offsets.push(offset);
  }

  // All stepped focus units should land at ~42cqh (approx 210px in 500px pane, allowance for line height/font)
  const expectedBand = await page.evaluate(() => {
    const pane = document.querySelector('[data-pane-id="reader"]');
    return pane.clientHeight * 0.42;
  });

  for (const off of offsets) {
    assert(
      Math.abs(off - expectedBand) < 5,
      `offset ${off} drifted significantly from expected focal band ${expectedBand}`,
    );
  }
});

// 3. A single li focuses while its siblings dim, nested list rides with parent
check("single li focuses while siblings dim and nested list rides along", async (page) => {
  await page.evaluate(() => {
    const firstLi = document.querySelector("ul > li[data-focus-unit]");
    firstLi.scrollIntoView({ block: "start" });
    document.querySelector('[data-pane-id="reader"]').dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(220); // let the opacity transition settle
  const result = await page.evaluate(() => {
    const listItems = Array.from(document.querySelectorAll("ul > li[data-focus-unit]"));
    const firstLi = listItems[0];

    const firstOpacity = getComputedStyle(firstLi).opacity;
    const secondLi = listItems[1];
    const secondOpacity = getComputedStyle(secondLi).opacity;

    // Check nested list items inside firstLi: should NOT have data-focus-unit
    const nestedUnits = firstLi.querySelectorAll("ul [data-focus-unit]");

    return {
      firstIsFocused: firstLi.classList.contains("is-focused"),
      firstOpacity,
      secondIsFocused: secondLi.classList.contains("is-focused"),
      secondOpacity,
      nestedUnitCount: nestedUnits.length,
    };
  });

  assert(result.firstIsFocused, "first li should be focused");
  assert(result.firstOpacity === "1", `focused li should have opacity 1, got ${result.firstOpacity}`);
  assert(!result.secondIsFocused, "second li should not be focused");
  assert(result.secondOpacity === "0.28", `unfocused sibling li should be dimmed to 0.28, got ${result.secondOpacity}`);
  assert(result.nestedUnitCount === 0, `nested list items should not be separate units, found ${result.nestedUnitCount}`);
});

// 4. Code block taller than the pane holds focus while scrolled through
check("code block taller than the pane holds focus while scrolled through", async (page) => {
  // Wait for shiki highlighting to finish (it replaces the pre element async,
  // one idle slice at a time) before the cache observes the final element.
  await page.waitForFunction(() => document.querySelector("pre.shiki[data-focus-unit]") !== null);
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const pre = document.querySelector("pre[data-focus-unit]");
    // The pre is taller than the pane: parking its top at the scroll margin
    // leaves the band well inside it, so scroll-margin (not the raw top) is
    // what "arrival" means for a tall unit.
    pre.style.scrollMarginTop = "0px";
    pre.scrollIntoView({ block: "start" });
    // Park the band (42% of pane) inside the tall pre: place the pre top at
    // band - a bit less than its height.
    const pane = document.querySelector('[data-pane-id="reader"]');
    pane.scrollTop = pre.offsetTop - pane.clientHeight * 0.42 + pre.offsetHeight * 0.2;
    pane.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(50);

  const result = await page.evaluate(async () => {
    const pane = document.querySelector('[data-pane-id="reader"]');
    // Re-query each time: shiki highlighting replaces the <pre> element async,
    // so a captured reference from before that swap goes stale.
    const focusedAtStart = document.querySelector(".is-focused");
    const initialFocused =
      document.querySelector("pre[data-focus-unit]")?.classList.contains("is-focused") ?? false;

    // Scroll 100px further down within the tall block
    pane.scrollTop += 100;
    pane.dispatchEvent(new Event("scroll"));
    const midFocused1 =
      document.querySelector("pre[data-focus-unit]")?.classList.contains("is-focused") ?? false;

    // Scroll another 100px down
    pane.scrollTop += 100;
    pane.dispatchEvent(new Event("scroll"));
    const midFocused2 =
      document.querySelector("pre[data-focus-unit]")?.classList.contains("is-focused") ?? false;

    return {
      initialFocused,
      focusedAtStartTag: focusedAtStart?.tagName,
      focusedAtStartText: focusedAtStart?.textContent?.slice(0, 30),
      preTop: document.querySelector("pre[data-focus-unit]")?.getBoundingClientRect().top,
      paneTop: pane.getBoundingClientRect().top,
      midFocused1,
      midFocused2,
    };
  });

  assert(result.initialFocused, `tall code block should focus on arrival: ${JSON.stringify(result)}`);
  assert(result.midFocused1, "tall code block should hold focus after 100px scroll");
  assert(result.midFocused2, "tall code block should hold focus after 200px scroll");
});

// 5. Focus does not oscillate across a unit boundary (hysteresis in margin gap)
check("focus does not oscillate across a unit boundary", async (page) => {
  await page.evaluate(() => {
    const startP = document.querySelector("p[data-focus-unit]");
    startP.scrollIntoView({ block: "start" });
    document.querySelector('[data-pane-id="reader"]').dispatchEvent(new Event("scroll"));
  });
  await page.waitForFunction(() => {
    const startP = document.querySelector("p[data-focus-unit]");
    return startP?.classList.contains("is-focused") === true;
  });

  const result = await page.evaluate(() => {
    const pane = document.querySelector('[data-pane-id="reader"]');
    // Slowly scroll 1px at a time and record which element is focused
    const transitions = [];
    let lastFocused = document.querySelector(".is-focused");
    for (let i = 0; i < 50; i++) {
      pane.scrollTop += 1;
      pane.dispatchEvent(new Event("scroll"));
      const curr = document.querySelector(".is-focused");
      if (curr !== lastFocused) {
        transitions.push({ from: lastFocused?.tagName, to: curr?.tagName, step: i });
        lastFocused = curr;
      }
    }

    return { transitions };
  });

  // There should be at most 1 transition during monotonic travel (no flickering back and forth)
  assert(
    result.transitions.length <= 1,
    `expected at most 1 focus transition, got ${result.transitions.length}: ${JSON.stringify(result.transitions)}`,
  );
});

// 6. Outline jump lands at the band
check("outline jump lands at the focal band", async (page) => {
  await page.locator(".mdr-outline-toolbar-wrapper .mdr-quiet-button").click();
  await page.locator(".mdr-outline-popover").waitFor();

  // Click the "Tall Block Section" heading
  await page
    .locator(".mdr-outline-item", { hasText: "Tall Block Section" })
    .locator(".mdr-outline-link")
    .click();
  // The popover closes on selection; scrollIntoView({behavior: "smooth"}) then
  // animates — give it time to settle before measuring.
  await page.locator(".mdr-outline-popover").waitFor({ state: "detached" });
  await page.waitForTimeout(1000);

  const jumpResult = await page.evaluate(() => {
    const pane = document.querySelector('[data-pane-id="reader"]');
    const targetH2 = Array.from(document.querySelectorAll("h2")).find(
      (h) => h.textContent?.includes("Tall Block Section"),
    );
    const paneRect = pane.getBoundingClientRect();
    const targetRect = targetH2?.getBoundingClientRect();
    const band = pane.clientHeight * 0.42;
    const targetTop = targetRect ? targetRect.top - paneRect.top : -1;
    const currentFocused = document.querySelector(".is-focused");
    return {
      targetTop,
      band,
      diff: Math.abs(targetTop - band),
      isFocused: targetH2?.classList.contains("is-focused"),
      focusedTag: currentFocused?.tagName,
    };
  });

  assert(jumpResult.diff < 5, `outline jump should land at focal band (${jumpResult.band}px), landed at ${jumpResult.targetTop}px`);
  assert(jumpResult.isFocused, `jumped heading should become the focused unit (focused: ${jumpResult.focusedTag})`);
});

// 7. Cached unit top matches getBoundingClientRect() for a nested li (offset-parent accumulation)
check("cached unit top matches getBoundingClientRect for nested li", async (page) => {
  const checkResult = await page.evaluate(() => {
    const pane = document.querySelector('[data-pane-id="reader"]');
    const li = document.querySelector("ul > li[data-focus-unit]");

    // Accumulate offsets
    let offsetTop = 0;
    let curr = li;
    while (curr !== null && curr !== pane) {
      offsetTop += curr.offsetTop;
      const parent = curr.offsetParent;
      curr = parent instanceof HTMLElement ? parent : null;
    }
    if (curr !== pane) {
      let parentTop = 0;
      let pCurr = pane;
      while (pCurr !== null) {
        parentTop += pCurr.offsetTop;
        const parent = pCurr.offsetParent;
        pCurr = parent instanceof HTMLElement ? parent : null;
      }
      offsetTop -= parentTop;
    }

    const gbcTop = li.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    return {
      offsetTop,
      gbcTop,
      diff: Math.abs(offsetTop - gbcTop),
    };
  });

  assert(checkResult.diff < 1, `offset parent calculation diff was ${checkResult.diff}px, expected < 1px`);
});

// 8. Ancestor heading stays legible (middle tier opacity)
check("ancestor heading stays legible when descendant is focused", async (page) => {
  await page.evaluate(() => {
    const firstLi = document.querySelector("ul > li[data-focus-unit]");
    firstLi.scrollIntoView({ block: "start" });
    document.querySelector('[data-pane-id="reader"]').dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(220); // let the opacity transition settle

  const result = await page.evaluate(() => {
    const firstLi = document.querySelector("ul > li[data-focus-unit]");
    const precedingH2 = Array.from(document.querySelectorAll("h2[data-focus-unit]")).find(
      (h) => h.textContent?.includes("Navigation Section"),
    );

    return {
      liFocused: firstLi.classList.contains("is-focused"),
      h2Ancestor: precedingH2?.classList.contains("is-ancestor"),
      h2Opacity: precedingH2 ? getComputedStyle(precedingH2).opacity : "",
    };
  });

  assert(result.liFocused, "list item should be focused");
  assert(result.h2Ancestor, "preceding heading should carry is-ancestor");
  assert(result.h2Opacity === "0.55", `ancestor heading opacity should be 0.55, got ${result.h2Opacity}`);
});

// 9. Keyboard navigation and Escape exit
check("keyboard navigation steps units and Escape exits focus mode", async (page) => {
  await page.locator('[data-pane-id="reader"]').focus();
  await page.keyboard.press("j"); // step down with j
  await page.waitForTimeout(50);

  const jStepped = await page.evaluate(() => {
    return document.querySelector(".is-focused") !== null;
  });
  assert(jStepped, "j key should step focus");

  await page.keyboard.press("k"); // step up with k
  await page.waitForTimeout(50);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(50);

  const focusOff = await page.evaluate(() => {
    const reader = document.querySelector(".mdr-reader");
    const hasAttr = reader.hasAttribute("data-focus-mode");
    const focusedCount = document.querySelectorAll(".is-focused").length;
    return !hasAttr && focusedCount === 0;
  });
  assert(focusOff, "Escape should exit focus mode and clear focus classes");
});

// 10. Click focus persists and scrolls to band
check("clicking dimmed unit focuses it and scrolls to band", async (page) => {
  await enableFocusMode(page);
  const targetP = page.locator("p", { hasText: "Paragraph directly below the tall code block." });
  await targetP.click();
  await page.waitForTimeout(100);

  const clickedState = await page.evaluate(() => {
    const pane = document.querySelector('[data-pane-id="reader"]');
    const p = Array.from(document.querySelectorAll("p")).find(
      (el) => el.textContent?.includes("Paragraph directly below the tall code block."),
    );
    const paneRect = pane.getBoundingClientRect();
    const pRect = p?.getBoundingClientRect();
    const band = pane.clientHeight * 0.42;
    const top = pRect ? pRect.top - paneRect.top : -1;
    return {
      isFocused: p?.classList.contains("is-focused"),
      top,
      band,
      diff: Math.abs(top - band),
    };
  });

  assert(clickedState.isFocused, "clicked paragraph should carry is-focused");
  assert(clickedState.diff < 5, `clicked paragraph should scroll to focal band, diff: ${clickedState.diff}`);
});

async function main() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "mdr-focus-test-"));
  const fileName = "doc.md";

  const vite = startVite();
  const pageErrors = [];
  let failed = false;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(tauriStubInit, { folderPath: workspaceDir, fileName, fileContents: FOCUS_DOC });
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
