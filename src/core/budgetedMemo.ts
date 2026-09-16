/**
 * Memoizes string results under a budget measured in characters retained
 * rather than entry count — for values whose size varies by orders of
 * magnitude, where a fixed entry count would hold anywhere from kilobytes to
 * hundreds of megabytes depending on the input.
 *
 * A Map iterates in insertion order, and reinserting on every hit makes that
 * order least-recently-used, so a frequently-read entry is never the one
 * evicted. A null result is cached too (a miss is worth remembering), and an
 * entry larger than `maxEntryChars` is returned uncached, so one huge value
 * cannot flush everything else out to seat itself.
 *
 * Kept dependency-free so tests/highlight-cache.mjs can import it directly
 * under node's type stripping.
 */
export function budgetedMemo(
  maxChars: number,
  maxEntryChars = maxChars / 4,
): (key: string, compute: () => string | null) => string | null {
  const cache = new Map<string, string | null>();
  let used = 0;
  const sizeOf = (key: string, value: string | null): number => key.length + (value?.length ?? 0);

  return (key, compute) => {
    if (cache.has(key)) {
      const cached = cache.get(key) ?? null;
      cache.delete(key); // reinsert at the end: most recently used
      cache.set(key, cached);
      return cached;
    }

    const value = compute();
    const size = sizeOf(key, value);
    if (size > maxEntryChars) {
      return value;
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
    return value;
  };
}
