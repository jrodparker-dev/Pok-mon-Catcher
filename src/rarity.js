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

export function makeBuff(rarityKey, pokemonData, rng = Math.random) {
  // pokemonData: { abilities: [...], moves: [...] } from PokéAPI /pokemon/{id}
  // EXACTLY ONE BUFF per rarity.
  if (rarityKey === 'common') return { kind: 'none' };

  if (rarityKey === 'uncommon') {
    return { kind: 'stat+10', stat: pickOne(STAT_KEYS, rng), amount: 10 };
  }

  if (rarityKey === 'rare') {
  return { kind: 'stat+20', stat: pickOne(STAT_KEYS, rng), amount: 20 };
}


  if (rarityKey === 'legendary') {
    const options = ['stat+30', 'stat+15x2', 'custom-move', 'chosen-ability'];
    const pick = pickOne(options, rng);
    if (pick === 'stat+30') return { kind: 'stat+30', stat: pickOne(STAT_KEYS, rng), amount: 30 };
    if (pick === 'stat+15x2') {
      const s1 = pickOne(STAT_KEYS, rng);
      let s2 = pickOne(STAT_KEYS, rng);
      while (s2 === s1) s2 = pickOne(STAT_KEYS, rng);
      return { kind: 'stat+15x2', stats: [s1, s2], amount: 15 };
    }
    if (pick === 'custom-move') return { kind: 'custom-move', name: 'Custom Move' };
    return { kind: 'chosen-ability' }; // will choose from native abilities
  }

  // Delta typing is now rolled separately (like shiny) in App.jsx via rollDelta().
  return { kind: 'none' };
}
