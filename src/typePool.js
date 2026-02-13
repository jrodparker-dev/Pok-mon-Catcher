const TYPES = [
  'normal','fire','water','electric','grass','ice','fighting','poison','ground',
  'flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'
];

function pickOne(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Roll new delta types that do NOT include any of the original types.
 * @param {string[]} originalTypes e.g. ['fire'] or ['water','ground']
 * @param {() => number} rng
 * @returns {string[]} 1 or 2 types
 */
export function rollDeltaTypes(originalTypes = [], rng = Math.random) {
  const banned = new Set((originalTypes ?? []).map(t => String(t).toLowerCase()));
  const pool = TYPES.filter(t => !banned.has(t));

  // Safety: if something weird happens, fall back to full pool
  const safePool = pool.length > 0 ? pool : TYPES.slice();

  const t1 = pickOne(safePool, rng);

  // 50% chance mono-type
  if (rng() < 0.5) return [t1];

  // Dual type: ensure distinct and still not banned
  let t2 = pickOne(safePool, rng);
  let guard = 0;
  while ((t2 === t1) && guard++ < 20) {
    t2 = pickOne(safePool, rng);
  }
  return [t1, t2];
}

