/* eslint-disable */
// Self-check for the mermaid render service core, driven by a fake mermaid.
// No browser: node strips the types and runs the real source.
// `npm run test:mermaid:service`.
import assert from "node:assert/strict";
import { createMermaidService } from "../src/extensions/mermaidService.ts";

function setup() {
  let loadCount = 0;
  const removed = [];
  const failures = new Map();
  let theme = "default";
  let inFlight = 0;
  const fake = {
    inits: [],
    renders: [],
    maxConcurrent: 0,
    failOn: (text, err) => failures.set(text, err),
    initialize(config) {
      fake.inits.push(config);
      theme = config.theme;
    },
    async render(id, text) {
      fake.renders.push({ id, text });
      inFlight++;
      fake.maxConcurrent = Math.max(fake.maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      if (text === "") throw new Error("Empty diagram");
      if (failures.has(text)) throw failures.get(text);
      return { svg: `<svg>${theme}:${text}</svg>` };
    },
    async parse(text) {
      if (failures.has(text)) throw failures.get(text);
      return {};
    },
  };
  const svc = createMermaidService({
    load: async () => (loadCount++, fake),
    removeTemp: (id) => removed.push(id),
  });
  return { svc, fake, removed, loads: () => loadCount };
}

// lazy: no load until render/preload
const { svc, fake, removed, loads } = setup();
let loadedEvents = 0;
svc.onLoaded(() => loadedEvents++);
assert.equal(svc.isLoaded(), false);
assert.equal(await svc.parse("graph TD"), null, "parse before load is null");
assert.equal(loads(), 0, "parse never loads");

// render loads once, caches, peek hits
assert.deepEqual(await svc.render("graph TD", "light"), { svg: "<svg>default:graph TD</svg>" });
assert.deepEqual(svc.peek("graph TD", "light"), { svg: "<svg>default:graph TD</svg>" });
assert.equal(svc.peek("graph TD", "dark"), null);
await svc.render("graph TD", "light");
assert.equal(fake.renders.length, 1, "second render served from cache");
assert.equal(loads(), 1);
assert.equal(svc.isLoaded(), true);
assert.equal(loadedEvents, 1, "onLoaded fires once");

// appearance switch re-initializes with dark theme, once
await svc.render("graph TD", "dark");
await svc.render("graph LR", "dark");
assert.deepEqual(fake.inits.map((c) => c.theme), ["default", "dark"]);
assert.equal(fake.inits[0].securityLevel, "strict");
assert.equal(fake.inits[0].htmlLabels, false);
assert.equal(fake.inits[0].startOnLoad, false);
assert.deepEqual(fake.inits[0].flowchart, { htmlLabels: false });

// errors cached, queue keeps going, temp cleanup on both paths
fake.failOn("bad", Object.assign(new Error("Parse error on line 2:\n..."), { hash: { loc: { first_line: 2 } } }));
const [bad, good] = await Promise.all([svc.render("bad", "light"), svc.render("ok", "light")]);
assert.deepEqual(bad, { error: "Parse error on line 2:" });
assert.ok("svg" in good, "a failing render does not stall the next");
assert.ok(removed.includes(fake.renders.at(-1).id) && removed.length === fake.renders.length);
await svc.render("bad", "light");
assert.equal(fake.renders.filter((r) => r.text === "bad").length, 1);
assert.deepEqual(svc.peek("bad", "light"), { error: "Parse error on line 2:" });

// rejected render (empty source) resolves { error } and is cached
assert.deepEqual(await svc.render("", "light"), { error: "Empty diagram" });
await svc.render("", "light");
assert.equal(fake.renders.filter((r) => r.text === "").length, 1);

// serialization: never two renders in flight
assert.equal(fake.maxConcurrent, 1);
assert.ok(fake.renders.every((r) => /^mdr-mermaid-\d+$/.test(r.id)));

// parse after load
assert.deepEqual(await svc.parse("bad"), { line: 2, message: "Parse error on line 2:" });
assert.equal(await svc.parse("ok"), null);
assert.equal(loadedEvents, 1);

// onLoaded unsubscribe, and no retroactive call
{
  const s = setup();
  let n = 0;
  const off = s.svc.onLoaded(() => n++);
  off();
  await s.svc.render("x", "light");
  assert.equal(n, 0, "unsubscribed listener not called");
  let late = 0;
  s.svc.onLoaded(() => late++);
  assert.equal(late, 0, "no retroactive call");
}

// preload loads without rendering
{
  const s = setup();
  s.svc.preload();
  s.svc.preload();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(s.loads(), 1);
  assert.equal(s.svc.isLoaded(), true);
  assert.equal(s.fake.renders.length, 0);
}

// load failure is terminal
{
  let loads = 0;
  let fired = 0;
  const s = createMermaidService({ load: () => (loads++, Promise.reject(new Error("net"))) });
  s.onLoaded(() => fired++);
  assert.deepEqual(await s.render("a", "light"), { error: "Mermaid failed to load" });
  assert.deepEqual(await s.render("b", "dark"), { error: "Mermaid failed to load" });
  assert.equal(loads, 1, "no retry");
  assert.equal(s.isLoaded(), false);
  assert.equal(fired, 0);
  assert.equal(await s.parse("a"), null);
}

console.log("mermaid-service: ok");
