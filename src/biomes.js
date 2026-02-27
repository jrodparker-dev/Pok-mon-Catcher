// Biomes (encounter tile backgrounds)
// Visuals are intentionally simple placeholders so you can swap in assets later.
export const BIOMES = [
  { key: 'cave', label: 'Cave' },
  { key: 'sea', label: 'Sea' },
  { key: 'grass', label: 'Grass' },
  { key: 'desert', label: 'Desert' },
  { key: 'tallgrass', label: 'Tall Grass' },
  { key: 'snow', label: 'Snow' },
  { key: 'powerplant', label: 'City' },
];

export function rollRandomBiomeKey(rng = Math.random) {
  const i = Math.floor(rng() * BIOMES.length);
  return BIOMES[Math.max(0, Math.min(BIOMES.length - 1, i))].key;
}

export function getBiomeLabel(key) {
  return (BIOMES.find(b => b.key === key)?.label) || 'Grass';
}
