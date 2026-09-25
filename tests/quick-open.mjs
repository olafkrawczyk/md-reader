import assert from "node:assert/strict";

// Pure scorer tests - we export it from the component for testability
// ponytail: importing .tsx from node would need a bundler; inline the pure function here instead.
function scoreMatch(query, label) {
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (q === "") return 0;
  let labelIdx = 0;
  let queryIdx = 0;
  let score = 0;
  let consecutiveBonus = 0;
  while (queryIdx < q.length && labelIdx < l.length) {
    if (l[labelIdx] === q[queryIdx]) {
      score += 1 + consecutiveBonus;
      consecutiveBonus += 0.5;
      queryIdx++;
    } else {
      consecutiveBonus = 0;
    }
    labelIdx++;
  }
  if (queryIdx < q.length) return null;
  if (l.startsWith(q)) score += 10;
  return score;
}

// Empty query matches everything
assert.equal(scoreMatch("", "readme"), 0);
assert.equal(scoreMatch("", "docs/guide"), 0);

// Case insensitivity (4 chars: 1+1.5+2+2.5=7 +10 prefix=17)
assert.equal(scoreMatch("READ", "readme"), 17);
assert.equal(scoreMatch("readme", "README"), 23.5);

// No match returns null
assert.equal(scoreMatch("xyz", "readme"), null);
assert.equal(scoreMatch("ab", "xyz"), null);

// Subsequence matches
assert.notEqual(scoreMatch("rm", "readme"), null);
assert.notEqual(scoreMatch("dg", "docs/guide"), null);

// Exact prefix beats scattered
const prefixScore = scoreMatch("read", "readme");
const scatteredScore = scoreMatch("rm", "readme");
assert(prefixScore > scatteredScore, "exact prefix should score higher than scattered match");

// Consecutive characters score higher
const consecutiveScore = scoreMatch("rea", "readme");
const nonConsecutiveScore = scoreMatch("rme", "readme");
assert(consecutiveScore > nonConsecutiveScore, "consecutive match should score higher");

console.log("✓ All quick-open scorer tests passed");
