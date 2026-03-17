import { getMissingBiomeSpecies } from './dexLocal.js';

// Pokémon that do not yet have explicit biome rows in pokemonBiomes.ts.
// Fill in biome fields manually, then copy these rows into pokemonBiomes.ts.
export const missingBiomes = getMissingBiomeSpecies().map((p) => ({
  dex: p.dex,
  id: p.id,
  name: p.name,
  primaryBiome: '',
  secondaryBiome: '',
}));

export default missingBiomes;
