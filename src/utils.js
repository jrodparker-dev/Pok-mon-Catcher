export function pickUnique(arr, count, rng = Math.random) {
  const pool = arr.slice();
  // Fisher-Yates-ish partial shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

export function uid(prefix = 'c') {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}
