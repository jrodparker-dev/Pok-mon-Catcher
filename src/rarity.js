export const RARITIES = [
  { key: 'common', label: 'Common', weight: 70, badge: { shape: 'circle', color: '#9ca3af' } },
  { key: 'uncommon', label: 'Uncommon', weight: 20, badge: { shape: 'triangle', color: '#22c55e' } },
  { key: 'rare', label: 'Rare', weight: 8, badge: { shape: 'square', color: '#a855f7' } },
  { key: 'legendary', label: 'Legendary', weight: 2, badge: { shape: 'star', color: '#f97316' } },
];

// Delta is a separate roll that can stack with any rarity.
// Export the badge so UI can force the gold triangle when a mon is Delta.
export const DELTA_BADGE = { shape: 'delta', color: '#facc15' };

export function pickWeightedRarity(rng = Math.random) {
  const total = RARITIES.reduce((a, r) => a + r.weight, 0);
  let roll = rng() * total;
  for (const r of RARITIES) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return RARITIES[0];
}

export const DELTA_CHANCE_FLAT = 0.05;
export function rollDelta(rarityKey, rng = Math.random) {
  return rng() < DELTA_CHANCE_FLAT;
}

export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export function pickOne(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

export function randInt(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickTwoStats(rng = Math.random) {
  const s1 = pickOne(STAT_KEYS, rng);
  let s2 = pickOne(STAT_KEYS, rng);
  while (s2 === s1) s2 = pickOne(STAT_KEYS, rng);
  return [s1, s2];
}

export function describeBuff(buff) {
  if (!buff) return '';
  if (buff.kind === 'stat') return `+${buff.amount} ${buff.stat.toUpperCase()}`;
  if (buff.kind === 'stat2') return `+${buff.amount} ${buff.stats[0].toUpperCase()} +${buff.amount} ${buff.stats[1].toUpperCase()}`;
  if (buff.kind === 'catch-active') return `+${buff.pct}% catch (active)`;
  if (buff.kind === 'catch-team') return `+${buff.pct}% catch (team)`;
  if (buff.kind === 'shiny-active') return `+${buff.pct}% shiny (active)`;
  if (buff.kind === 'shiny-team') return `+${buff.pct}% shiny (team)`;
  if (buff.kind === 'rarity-active') return `+${buff.pct}% rarity (active)`;
  if (buff.kind === 'rarity-team') return `+${buff.pct}% rarity (team)`;
  if (buff.kind === 'ko-ball-active') return `${buff.pct}% ball on KO (active)`;
  if (buff.kind === 'custom-move') return `Custom Move`;
  if (buff.kind === 'chosen-ability') return `Chosen Ability`;
  return buff.kind;
}

/**
 * NEW BUFF SYSTEM (2026-02):
 * - Every Pokémon ALWAYS has 1 stat buff from its rarity tier.
 * - Then it has a chance to roll additional buffs.
 *   * Common/Uncommon: up to 2 buffs total
 *   * Rare: up to 3 buffs total
 *   * Legendary: up to 4 buffs total
 * - Additional buffs are mostly "active/team" bonuses + KO-ball chance.
 * - Legendary can additionally roll Custom Move / Chosen Ability (kept where they were).
 */
export function rollBuffs(rarityKey, pokemonData, rng = Math.random) {
  // 1) Mandatory stat buff
  const buffs = [];
  if (rarityKey === 'common') {
    buffs.push({ kind: 'stat', stat: pickOne(STAT_KEYS, rng), amount: 10 });
  } else if (rarityKey === 'uncommon') {
    // +15-20 to 1 stat OR +10 to 2 stats
    if (rng() < 0.55) {
      buffs.push({ kind: 'stat', stat: pickOne(STAT_KEYS, rng), amount: randInt(15, 20, rng) });
    } else {
      const [a, b] = pickTwoStats(rng);
      buffs.push({ kind: 'stat2', stats: [a, b], amount: 10 });
    }
  } else if (rarityKey === 'rare') {
    // +20-30 to 1 stat OR +15 to 2 stats
    if (rng() < 0.55) {
      buffs.push({ kind: 'stat', stat: pickOne(STAT_KEYS, rng), amount: randInt(20, 30, rng) });
    } else {
      const [a, b] = pickTwoStats(rng);
      buffs.push({ kind: 'stat2', stats: [a, b], amount: 15 });
    }
  } else if (rarityKey === 'legendary') {
    // +30-40 to 1 stat OR +20 to 2 stats
    if (rng() < 0.55) {
      buffs.push({ kind: 'stat', stat: pickOne(STAT_KEYS, rng), amount: randInt(30, 40, rng) });
    } else {
      const [a, b] = pickTwoStats(rng);
      buffs.push({ kind: 'stat2', stats: [a, b], amount: 20 });
    }
  } else {
    // safety
    buffs.push({ kind: 'stat', stat: pickOne(STAT_KEYS, rng), amount: 10 });
  }

  // 2) Determine max buffs and chance per extra slot
  const maxByRarity = {
    common: 2,
    uncommon: 2,
    rare: 3,
    legendary: 4,
  };
  const chanceByRarity = {
    common:   [0.35],
    uncommon: [0.45],
    rare:     [0.70, 0.28],
    legendary:[0.85, 0.55, 0.25],
  };
  const max = maxByRarity[rarityKey] ?? 2;
  const chances = chanceByRarity[rarityKey] ?? [0.4];

  // 3) Additional buff pool (non-stat), avoid duplicates by kind
  const pool = [];
  if (rarityKey === 'common') {
    pool.push(
      { kind: 'catch-active', pct: randInt(1, 5, rng) },
      { kind: 'shiny-active', pct: 1 },
      { kind: 'rarity-active', pct: 1 },
      { kind: 'ko-ball-active', pct: randInt(1, 5, rng) },
    );
  } else if (rarityKey === 'uncommon') {
    pool.push(
      { kind: 'catch-active', pct: randInt(5, 10, rng) },
      { kind: 'shiny-active', pct: 2 },
      { kind: 'rarity-active', pct: 2 },
      { kind: 'ko-ball-active', pct: randInt(5, 10, rng) },
    );
  } else if (rarityKey === 'rare') {
    pool.push(
      { kind: 'catch-active', pct: randInt(10, 15, rng) },
      { kind: 'catch-team', pct: 5 },
      { kind: 'shiny-active', pct: 3 },
      { kind: 'shiny-team', pct: 1 },
      { kind: 'rarity-active', pct: 3 },
      { kind: 'rarity-team', pct: 1 },
      { kind: 'ko-ball-active', pct: randInt(15, 20, rng) },
    );
  } else if (rarityKey === 'legendary') {
    pool.push(
      { kind: 'catch-active', pct: randInt(20, 30, rng) },
      { kind: 'catch-team', pct: 10 },
      { kind: 'shiny-active', pct: 5 },
      { kind: 'shiny-team', pct: 2 },
      { kind: 'rarity-active', pct: 5 },
      { kind: 'rarity-team', pct: 2 },
      { kind: 'ko-ball-active', pct: randInt(20, 30, rng) },
      // keep these where they were (legendary-only)
      { kind: 'custom-move', name: 'Custom Move' },
      { kind: 'chosen-ability' },
    );
  }

  const usedKinds = new Set(buffs.map(b => b.kind));

  for (let i = 1; i < max; i++) {
    const p = chances[i - 1] ?? 0;
    if (rng() >= p) break;

    // pick a buff not already in use
    const candidates = pool.filter(b => !usedKinds.has(b.kind));
    if (!candidates.length) break;
    const chosen = candidates[Math.floor(rng() * candidates.length)];

    // clone to avoid accidental shared objects
    const picked = JSON.parse(JSON.stringify(chosen));
    buffs.push(picked);
    usedKinds.add(picked.kind);
  }

  return buffs;
}
