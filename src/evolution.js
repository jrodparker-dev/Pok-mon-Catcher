import { toID } from './pokeapi.js';
import { getDexById, getDexEntryByNum } from './dexLocal.js';

// Cache chains by dexId so we don’t refetch constantly
const chainCache = new Map();

/**
 * Returns the next evolution species name (PokeAPI name), or null if none.
 * Uses PokeAPI evolution chain.
 */
export async function getNextEvolutionName(dexNum) {
  // species -> evolution_chain url
  const sRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${dexNum}`);
  if (!sRes.ok) throw new Error('Failed to fetch species');
  const species = await sRes.json();
  const chainUrl = species.evolution_chain?.url;
  if (!chainUrl) return null;

  let chain = chainCache.get(chainUrl);
  if (!chain) {
    const cRes = await fetch(chainUrl);
    if (!cRes.ok) throw new Error('Failed to fetch evolution chain');
    chain = await cRes.json();
    chainCache.set(chainUrl, chain);
  }

  const targetId = getTargetIdFromDexNum(dexNum);
  if (!targetId) return null;

  const node = findNode(chain.chain, targetId);
  if (!node) return null;

  const next = node.evolves_to?.[0]; // branching: pick first by default
  if (!next?.species?.name) return null;

  return next.species.name; // e.g. "pangoro"
}

/**
 * Convert dex num to our PS base-form id (e.g. 58 -> "growlithe")
 * Uses your local pokedex.ts via dexLocal.
 */
function getTargetIdFromDexNum(dexNum) {
  // Prefer local dex id for base form
  const hit = getDexById({ num: dexNum });
  // If you don't have this helper yet, see dexLocal changes below.
  return hit?.id ?? null;
}

function findNode(chainNode, targetId) {
  if (!chainNode) return null;
  const nodeId = toID(chainNode.species?.name); // pokeapi name -> toID
  if (nodeId === targetId) return chainNode;

  for (const child of (chainNode.evolves_to ?? [])) {
    const found = findNode(child, targetId);
    if (found) return found;
  }
  return null;
}

/**
 * Convert PokeAPI species name to our local dex entry (id + num + entry),
 * using toID(name) mapping.
 */
export function resolveDexFromSpeciesName(speciesName) {
  const id = toID(speciesName); // "mr-mime" -> "mrmime"
  return getDexById({ id });     // should return { id, num, entry } or null
}

/**
 * Return all immediate evolution options for a Pokémon using local PS dex data.
 *
 * Accepts either:
 * - PS-style id string (e.g. "pikachu", "raichualola")
 * - National Dex number (e.g. 25)
 */
export function getEvolutionOptions(dexIdOrNum) {
  let hit = null;
  if (typeof dexIdOrNum === 'number') {
    const entry = getDexEntryByNum(dexIdOrNum);
    if (entry) {
      // Convert name -> id and re-query for the full hit so we can read evos reliably.
      hit = getDexById({ id: toID(entry.name) });
    }
  } else if (typeof dexIdOrNum === 'string' && dexIdOrNum) {
    hit = getDexById({ id: toID(dexIdOrNum) });
  }
  const evos = hit?.entry?.evos;
  if (!Array.isArray(evos) || evos.length === 0) return [];
  // evos are usually names like "Ivysaur" or "Raichu-Alola".
  return evos
    .map((n) => toID(n))
    .filter((id) => !!getDexById({ id }));
}
