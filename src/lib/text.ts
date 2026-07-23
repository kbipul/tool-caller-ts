// Small text utilities used for fuzzy suggestions (tool names, enum values).
// Hand-written Levenshtein — no dependencies.

/** Classic Levenshtein edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Closest candidate to `target` by edit distance, but only if it is "close
 * enough": within `maxDistance`, and no more than ~40% of the target length
 * (so "book_flight" does not get repaired into an unrelated "get_weather").
 */
export function closest(
  target: string,
  candidates: string[],
  maxDistance = 3,
): { value: string; distance: number } | null {
  let best: { value: string; distance: number } | null = null;
  const lenGate = Math.max(1, Math.floor(target.length * 0.4));
  const gate = Math.min(maxDistance, lenGate);
  for (const c of candidates) {
    const d = levenshtein(target.toLowerCase(), c.toLowerCase());
    if (d <= gate && (best === null || d < best.distance)) {
      best = { value: c, distance: d };
    }
  }
  return best;
}
