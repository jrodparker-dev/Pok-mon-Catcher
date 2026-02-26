export const RARITIES = [
  { key: 'common', label: 'Common', weight: 67, badge: { shape: 'circle', color: '#9ca3af' } },
  { key: 'uncommon', label: 'Uncommon', weight: 20, badge: { shape: 'triangle', color: '#22c55e' } },
  { key: 'rare', label: 'Rare', weight: 9, badge: { shape: 'square', color: '#a855f7' } },
  { key: 'legendary', label: 'Legendary', weight: 4, badge: { shape: 'star', color: '#f97316' } },
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
  if (buff.kind === 'stat-mult') return `×${(buff.mult ?? 2).toFixed(1)} ${buff.stat.toUpperCase()}`;
  if (buff.kind === 'catch-active') return `+${buff.pct}% catch (active)`;
  if (buff.kind === 'catch-team') return `+${buff.pct}% catch (team)`;
  if (buff.kind === 'shiny-active') return `×${(buff.mult ?? 1).toFixed(2)} shiny (active)`;
  if (buff.kind === 'shiny-team') return `×${(buff.mult ?? 1).toFixed(2)} shiny (team)`;
  if (buff.kind === 'rarity-active') return `+${buff.pct}% rarity (active)`;
  if (buff.kind === 'rarity-team') return `+${buff.pct}% rarity (team)`;
  if (buff.kind === 'ko-ball-active') return `${buff.pct}% ball on KO (active)`;
  if (buff.kind === 'ko-ball-team') return `${buff.pct}% ball on KO (team)`;
  if (buff.kind === 'custom-move') return `Custom Move`;
  if (buff.kind === 'chosen-ability') return `Chosen Ability`;
  if (buff.kind === 'stat-all') return `+${buff.amount} all stats`;
  if (buff.kind === 'bst-to-600') return `BST → 600`;
  if (buff.kind === 'reroll-stats') return `Reroll stats (BST 500–650)`;
  if (buff.kind === 'boost-all-active') return `+${buff.shinyPct}% shiny +${buff.catchPct}% catch +${buff.rarityPct}% rarity (active)`;
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
      { kind: 'shiny-active', mult: 1.1 },
      { kind: 'rarity-active', pct: 4 },
      { kind: 'ko-ball-active', pct: randInt(1, 5, rng) },
    );
  } else if (rarityKey === 'uncommon') {
    pool.push(
      { kind: 'catch-active', pct: randInt(5, 10, rng) },
      { kind: 'shiny-active', mult: 1.25 },
      { kind: 'rarity-active', pct: 6 },
      { kind: 'ko-ball-active', pct: randInt(5, 10, rng) },
    );
  } else if (rarityKey === 'rare') {
    pool.push(
      { kind: 'catch-active', pct: randInt(10, 15, rng) },
      { kind: 'catch-team', pct: 5 },
      { kind: 'shiny-active', mult: 1.5 },
      { kind: 'shiny-team', mult: 1.2 },
      { kind: 'rarity-active', pct: 8 },
      { kind: 'rarity-team', pct: 3 },
      { kind: 'ko-ball-active', pct: randInt(15, 20, rng) },
    );
  } else if (rarityKey === 'legendary') {
    pool.push(
      { kind: 'catch-active', pct: randInt(20, 30, rng) },
      { kind: 'catch-team', pct: 10 },
      { kind: 'shiny-active', mult: 2.0 },
      { kind: 'shiny-team', mult: 1.4 },
      { kind: 'rarity-active', pct: 10 },
      { kind: 'rarity-team', pct: 5 },
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

  // 4) Super-rare bonus buff (0.5% chance) - can exceed normal buff limits
  if (rng() < 0.005) {
    const superPool = [
      { kind: 'stat-all', amount: 15, superRare: true },
      { kind: 'bst-to-600', superRare: true },
      // Always +50 to a random stat; 20% chance to also +50 a second (different) stat
      { kind: 'super-stat-50', amount: 50, superRare: true },
      { kind: 'reroll-stats', minBST: 500, maxBST: 650, superRare: true },
      { kind: 'boost-all-active', shinyPct: 5, catchPct: 25, rarityPct: 15, superRare: true },
      // Double a random stat if its BASE stat is < 100
      { kind: 'double-stat-if-low', mult: 2, superRare: true },
    ];
    const chosen = superPool[Math.floor(rng() * superPool.length)];

    if (chosen.kind === 'super-stat-50') {
      const s1 = pickOne(STAT_KEYS, rng);
      buffs.push({ kind: 'stat', stat: s1, amount: 50, superRare: true });
      if (rng() < 0.20) {
        let s2 = pickOne(STAT_KEYS, rng);
        while (s2 === s1) s2 = pickOne(STAT_KEYS, rng);
        buffs.push({ kind: 'stat', stat: s2, amount: 50, superRare: true });
      }
    } else if (chosen.kind === 'double-stat-if-low') {
      const base = pokemonData?.baseStats ?? pokemonData?.stats ?? {};
      const candidates = STAT_KEYS.filter(k => typeof base?.[k] === 'number' && base[k] < 100);
      if (candidates.length) {
        const stat = pickOne(candidates, rng);
        buffs.push({ kind: 'stat-mult', stat, mult: 2, superRare: true, onlyIfBaseBelow: 100 });
      } else {
        // no eligible stats; fall back to a tame super-rare buff
        buffs.push({ kind: 'stat-all', amount: 15, superRare: true });
      }
    } else {
      buffs.push(JSON.parse(JSON.stringify(chosen)));
    }
  }

  return buffs;
}


/**
 * Fusion-only buffs (separate table from normal rarity buffs).
 * Uses the user-provided spreadsheet probabilities and magnitudes.
 */
// Fusion-only buff rolling. Optionally enforce a minimum buff count.
export function rollFusionBuffs(rarityKey, pokemonData, rng = Math.random, minCount = 0) {
  const buffs = [];
  const r = String(rarityKey || '').toLowerCase();

  // Amount of buffs distribution (must be at least 1)
  function rollCount() {
    const x = rng();
    if (r === 'common') return (x < 0.35) ? 1 : 2;
    if (r === 'uncommon') return (x < 0.20) ? 1 : 2;
    if (r === 'rare') {
      if (x < 0.15) return 1;
      if (x < 0.40) return 2; // 0.15 + 0.25
      return 3;
    }
    // legendary
    if (x < 0.05) return 1;
    if (x < 0.15) return 2; // 0.05 + 0.10
    if (x < 0.65) return 3; // + 0.50
    return 4; // 0.35
  }

  const rolled = rollCount();
  const count = Math.max(rolled, Math.max(0, minCount | 0));

  // Table values
  const oneStatAmt = (r === 'common') ? 15 : (r === 'uncommon') ? 25 : (r === 'rare') ? 35 : 45;
  const twoStatAmt = (r === 'common') ? 10 : (r === 'uncommon') ? 15 : (r === 'rare') ? 20 : 30;

  const catchActiveMin = (r === 'common') ? 10 : (r === 'uncommon') ? 20 : (r === 'rare') ? 30 : 40;
  const catchActiveMax = (r === 'common') ? 20 : (r === 'uncommon') ? 30 : (r === 'rare') ? 40 : 50;

  const shinyActiveMult = (r === 'common') ? 2 : (r === 'uncommon') ? 3 : (r === 'rare') ? 4 : 5;
  const rarityActivePct = (r === 'common') ? 5 : (r === 'uncommon') ? 10 : (r === 'rare') ? 15 : 20;

  const koBallActivePct = (r === 'common') ? 25 : (r === 'uncommon') ? 35 : (r === 'rare') ? 50 : 80;
  const koBallTeamPct = (r === 'common') ? 15 : (r === 'uncommon') ? 25 : (r === 'rare') ? 40 : 60;

  const catchTeamPct = (r === 'common') ? 5 : (r === 'uncommon') ? 10 : (r === 'rare') ? 15 : 20;

  const shinyTeamMult = (r === 'uncommon') ? 1.25 : (r === 'rare') ? 1.5 : (r === 'legendary') ? 2 : null;
  const rarityTeamPct = (r === 'uncommon') ? 5 : (r === 'rare') ? 8 : (r === 'legendary') ? 10 : null;

  // Available buff kinds (fusion list)
  const pool = [];
  pool.push(() => ({ kind: 'stat', stat: pickOne(STAT_KEYS, rng), amount: oneStatAmt }));
  pool.push(() => {
    const [a, b] = pickTwoStats(rng);
    return { kind: 'stat2', stats: [a, b], amount: twoStatAmt };
  });
  pool.push(() => ({ kind: 'catch-active', pct: randInt(catchActiveMin, catchActiveMax, rng) }));
  pool.push(() => ({ kind: 'shiny-active', mult: shinyActiveMult }));
  pool.push(() => ({ kind: 'rarity-active', pct: rarityActivePct }));
  pool.push(() => ({ kind: 'ko-ball-active', pct: koBallActivePct }));
  pool.push(() => ({ kind: 'ko-ball-team', pct: koBallTeamPct }));
  pool.push(() => ({ kind: 'catch-team', pct: catchTeamPct }));
  if (shinyTeamMult) pool.push(() => ({ kind: 'shiny-team', mult: shinyTeamMult }));
  if (rarityTeamPct) pool.push(() => ({ kind: 'rarity-team', pct: rarityTeamPct }));

  // Roll without duplicates by kind (prefer variety)
  const used = new Set();
  for (let i = 0; i < count; i++) {
    // attempt a few times to avoid duplicates
    let picked = null;
    for (let tries = 0; tries < 8; tries++) {
      const maker = pool[Math.floor(rng() * pool.length)];
      const b = maker();
      if (!b?.kind) continue;
      if (used.has(b.kind)) continue;
      picked = b;
      break;
    }
    if (!picked) {
      const maker = pool[Math.floor(rng() * pool.length)];
      picked = maker();
    }
    if (picked?.kind) used.add(picked.kind);
    buffs.push(picked);
  }

  return buffs.filter(Boolean);
}
