import { getDexEntryByNum, getDexById, normalizeStats, normalizeTypes, normalizeAbilities } from './dexLocal.js';

export const MAX_POKEMON_ID = 1025;

export function randPokemonId() {
  return Math.floor(Math.random() * MAX_POKEMON_ID) + 1;
}

// Pokemon Showdown sprite filenames usually match "toID(name)".
export function toID(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export function showdownDexSpriteUrl(name) {
  // Example: pikachu -> https://play.pokemonshowdown.com/sprites/dex/pikachu.png
  // Some special cases may not match; we fallback on image load error.
  return `https://play.pokemonshowdown.com/sprites/dex/${toID(name)}.png`;
}

export function showdownDexShinySpriteUrl(name) {
  // Example: pikachu -> https://play.pokemonshowdown.com/sprites/dex-shiny/pikachu.png
  return `https://play.pokemonshowdown.com/sprites/dex-shiny/${toID(name)}.png`;
}

export async function fetchPokemonBundle(id) {
  // Pull species for capture rate
  const sRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  if (!sRes.ok) throw new Error('Failed to fetch PokéAPI species');
  const species = await sRes.json();

  // We still fetch /pokemon for learnset + sprite fallback
  const pRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
  if (!pRes.ok) throw new Error('Failed to fetch PokéAPI pokemon');
  const pokemon = await pRes.json();

  const pokeapiName = pokemon.name;

  const fallbackSprite =
    pokemon.sprites?.other?.['official-artwork']?.front_default ||
    pokemon.sprites?.front_default ||
    null;

  const fallbackShinySprite =
    pokemon.sprites?.front_shiny ||
    null;

  // --- Local dex entry for base stats/types/abilities ---
  const dexEntry = getDexEntryByNum(id);
  if (!dexEntry) {
    throw new Error(`Local pokedex.ts missing entry for National Dex #${id}`);
  }

  // Determine canonical PS id + display name
  const hit = getDexById({ num: id });
  const psId = hit?.id ?? toID(dexEntry.name ?? pokeapiName);
  const displayName = dexEntry.name ?? pokeapiName;

  const baseStats = normalizeStats(dexEntry.baseStats);
  const types = normalizeTypes(dexEntry.types);
  const nativeAbilities = normalizeAbilities(dexEntry.abilities);

  // Learnset moves from PokéAPI (still)
  const learnsetMoves = pokemon.moves.map(m => m.move.name);

  return {
    id,        // numeric national dex
    num: id,   // alias
    dexId: psId, // string PS id used for sprites/forms
    name: displayName,

    // local dex entry (for form-aware sprite fallbacks)
    dexEntry,

    captureRate: species.capture_rate, // official base catch rate

    showdownSprite: showdownDexSpriteUrl(psId),
    shinySpriteUrl: showdownDexShinySpriteUrl(psId),
    fallbackSprite,
    fallbackShinySprite,

    // NOW from your pokedex.ts
    baseStats,
    types,
    nativeAbilities,

    // still from PokéAPI
    learnsetMoves,
  };

}


// Fetch bundle but force the dex entry by exact PS dex id (handles regional forms & custom forms)
export async function fetchPokemonBundleByDexId(dexId) {
  const hit = getDexById({id: dexId});
  if (!hit || !hit.entry) throw new Error(`Unknown dex id: ${dexId}`);
  const base = await fetchPokemonBundle(hit.num);
  // Override everything that should come from local dex entry
  const dexEntry = hit.entry;
    return {
    ...base,
    dexEntry: dexEntry,

    // IMPORTANT:
    // base.id is the National Dex number (hit.num). Keep it numeric.
    // Put the PS/string identifier into a different field.
    dexId: dexId,          // string id like "charizard", "torterra", "pikachualola"
    num: hit.num,          // numeric dex number (redundant but handy)
    name: dexEntry.name ?? base.name,

    baseStats: dexEntry.baseStats ? normalizeStats(dexEntry.baseStats) : base.baseStats,
    types: dexEntry.types ? normalizeTypes(dexEntry.types) : base.types,
    nativeAbilities: dexEntry.abilities ? normalizeAbilities(dexEntry.abilities) : base.nativeAbilities,

    // Sprites should use dexId, not display name (Showdown expects toID)
    showdownSprite: showdownDexSpriteUrl(dexId),
    shinySpriteUrl: showdownDexShinySpriteUrl(dexId),

    fallbackSprite: base.fallbackSprite,
    fallbackShinySprite: base.fallbackShinySprite,
  };

}
