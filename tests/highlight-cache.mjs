/* eslint-disable */
// Self-check for budgetedMemo, the character-budgeted LRU behind code
// highlighting. Pure function, so no browser and no bundler: node strips the
// types and runs the real source. `npm run test:cache`.
import assert from "node:assert/strict";
import { budgetedMemo } from "../src/core/budgetedMemo.ts";

// Sizes count key + value. Keys below are 2-3 chars ("k0".."k19"), values 10,
// so an entry is ~12 chars and a 36-char budget holds 3. The LRU cases pass an
// explicit maxEntryChars, since at these toy budgets the default cap
// (maxChars/4) would treat every entry as outsized and cache nothing.
const value = (n) => String(n).repeat(10).slice(0, 10);
const ENTRY = 13; // 3-char key + 10-char value, the largest used below

{
  // Hits are served from cache: compute runs once per distinct key.
  let computes = 0;
  const memo = budgetedMemo(1000);
  const get = (k) => memo(k, () => (computes++, value(1)));
  assert.equal(get("a"), value(1));
  assert.equal(get("a"), value(1));
  assert.equal(computes, 1, "second call should hit the cache");
}

{
  // null results are cached too — a miss costs one compute, not one per call.
  let computes = 0;
  const memo = budgetedMemo(1000);
  const get = () => memo("bad", () => (computes++, null));
  assert.equal(get(), null);
  assert.equal(get(), null);
  assert.equal(computes, 1, "a null result should be cached");
}

{
  // Eviction is least-recently-USED, not least-recently-inserted: touching an
  // old entry must protect it from the next eviction. This is the property a
  // plain insertion-order cache gets wrong, and the one that matters while
  // editing — the block being typed in is the oldest by insertion.
  const memo = budgetedMemo(36, ENTRY); // ~12 chars per entry => 3 entries
  const computed = [];
  const get = (k) => memo(k, () => (computed.push(k), value(1)));
  get("k1");
  get("k2");
  get("k3");
  get("k1"); // touch: k1 is now the most recent, k2 the oldest
  get("k4"); // evicts k2
  get("k1");
  assert.deepEqual(computed, ["k1", "k2", "k3", "k4"], "touched entry was evicted");
  get("k2");
  assert.deepEqual(computed, ["k1", "k2", "k3", "k4", "k2"], "k2 should have been evicted");
}

{
  // The budget is actually enforced: many entries do not grow without bound.
  const memo = budgetedMemo(36, ENTRY);
  const computed = [];
  for (let i = 0; i < 20; i++) {
    memo(`k${i}`, () => (computed.push(i), value(i)));
  }
  // Every key distinct and the cache holds 3, so all 20 miss; the point is
  // that re-asking for an early key still misses (it was evicted, not kept).
  assert.equal(computed.length, 20);
  let recomputed = false;
  memo("k0", () => ((recomputed = true), value(0)));
  assert.ok(recomputed, "k0 should have been evicted long ago");
  // ...while the most recent entry survives.
  let lastRecomputed = false;
  memo("k19", () => ((lastRecomputed = true), value(19)));
  assert.ok(!lastRecomputed, "the newest entry should still be cached");
}

{
  // An outsized entry is returned but not stored, so it cannot flush the cache
  // to seat itself. Budget 100 => maxEntry 25; "big" + 40 chars exceeds it.
  const memo = budgetedMemo(100);
  memo("keep", () => value(1));
  const huge = "x".repeat(40);
  assert.equal(
    memo("big", () => huge),
    huge,
    "an outsized value should still be returned",
  );
  let recomputed = false;
  memo("keep", () => ((recomputed = true), value(1)));
  assert.ok(!recomputed, "outsized entry evicted the rest of the cache");
  let bigRecomputed = false;
  memo("big", () => ((bigRecomputed = true), huge));
  assert.ok(bigRecomputed, "outsized entry should not have been stored");
}

console.log("budgetedMemo: all checks passed");
