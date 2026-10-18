/**
 * A string-keyed LRU with a budget measured in characters retained rather than
 * entry count — for values whose size varies by orders of magnitude, where a
 * fixed entry count would hold anywhere from kilobytes to hundreds of
 * megabytes depending on the input.
 *
 * A Map iterates in insertion order, and reinserting on every hit makes that
 * order least-recently-used, so a frequently-read entry is never the one
 * evicted. An entry larger than `maxEntryChars` is not stored, so one huge
 * value cannot flush everything else out to seat itself.
 *
 * Kept dependency-free so tests/highlight-cache.mjs can import it directly
 * under node's type stripping.
 */
export function budgetedLru(
  maxChars: number,
  maxEntryChars = maxChars / 4,
): { get(key: string): string | undefined; set(key: string, value: string): void } {
  const cache = new Map<string, string>();
  let used = 0;
  const sizeOf = (key: string, value: string): number => key.length + value.length;

  return {
    get(key) {
      const cached = cache.get(key);
      if (cached !== undefined) {
        cache.delete(key); // reinsert at the end: most recently used
        cache.set(key, cached);
      }
      return cached;
    },
    set(key, value) {
      const size = sizeOf(key, value);
      if (size > maxEntryChars) {
        return;
      }
      const existing = cache.get(key);
      if (existing !== undefined) {
        cache.delete(key);
        used -= sizeOf(key, existing);
      }
      while (used + size > maxChars) {
        const oldest = cache.entries().next();
        if (oldest.done) {
          break;
        }
        const [oldestKey, oldestValue] = oldest.value;
        cache.delete(oldestKey);
        used -= sizeOf(oldestKey, oldestValue);
      }
      cache.set(key, value);
      used += size;
    },
  };
}

// ponytail: null is stored as a sentinel so the LRU stays string-valued; a
// real result can't collide because it would have to equal this exact string.
const NULL_RESULT = "\u0000null";

/**
 * Memoizes synchronous compute-on-miss on top of budgetedLru. A null result is
 * cached too (a miss is worth remembering), and an outsized result is returned
 * uncached.
 */
export function budgetedMemo(
  maxChars: number,
  maxEntryChars = maxChars / 4,
): (key: string, compute: () => string | null) => string | null {
  const lru = budgetedLru(maxChars, maxEntryChars);

  return (key, compute) => {
    const cached = lru.get(key);
    if (cached !== undefined) {
      return cached === NULL_RESULT ? null : cached;
    }
    const value = compute();
    lru.set(key, value ?? NULL_RESULT);
    return value;
  };
}
