// Biomes (encounter tile backgrounds)
// Visuals are intentionally simple placeholders so you can swap in assets later.
export const BIOMES = [
  { key: 'cave', label: 'Cave', appearanceWeight: 1 },
  { key: 'sea', label: 'Sea', appearanceWeight: 1 },
  { key: 'grass', label: 'Grass', appearanceWeight: 1 },
  { key: 'desert', label: 'Desert', appearanceWeight: 0.1 },
  { key: 'tallgrass', label: 'Forest', appearanceWeight: 1 },
  { key: 'snow', label: 'Snow', appearanceWeight: 0.1 },
  { key: 'powerplant', label: 'City', appearanceWeight: 1 },
  { key: 'mountain', label: 'Mountain', appearanceWeight: 1 },
  { key: 'wetlands', label: 'Wetlands', appearanceWeight: 1 },
  { key: 'volcanic', label: 'Volcanic', appearanceWeight: 0.1 },
  { key: 'wormhole', label: 'Wormhole', appearanceWeight: 0.01 },
];

export function rollRandomBiomeKey(rng = Math.random) {
  const weightedBiomes = BIOMES.map((b) => ({ ...b, appearanceWeight: Number(b?.appearanceWeight) || 0 }));
  const totalWeight = weightedBiomes.reduce((sum, b) => sum + b.appearanceWeight, 0);

  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    const i = Math.floor(rng() * BIOMES.length);
    return BIOMES[Math.max(0, Math.min(BIOMES.length - 1, i))].key;
  }

  const roll = rng() * totalWeight;
  let running = 0;
  for (const biome of weightedBiomes) {
    running += biome.appearanceWeight;
    if (roll < running) return biome.key;
  }

  return weightedBiomes[weightedBiomes.length - 1].key;
}

export function getBiomeLabel(key) {
  if (String(key || '').toLowerCase() === 'temple') return 'Temple';
  return (BIOMES.find(b => b.key === key)?.label) || 'Grass';
}
