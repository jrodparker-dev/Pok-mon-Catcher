let cachedMoveNames = null;

export async function getAllMoves() {
  if (cachedMoveNames) return cachedMoveNames;
  const res = await fetch(`https://pokeapi.co/api/v2/move?limit=100000`);
  if (!res.ok) throw new Error('Failed to fetch move list');
  const data = await res.json();
  cachedMoveNames = data.results.map(x => x.name);
  return cachedMoveNames;
}

async function fetchMoveDetails(name) {
  const res = await fetch(`https://pokeapi.co/api/v2/move/${name}`);
  if (!res.ok) return null;
  return await res.json();
}

function isAttackingMove(moveData) {
  // PokéAPI: damage_class is "physical" | "special" | "status"
  const dc = moveData?.damage_class?.name;
  return dc === 'physical' || dc === 'special';
}

export async function rollIllegalAttackingMove(excludedMoveNamesSet, rng = Math.random) {
  const allMoves = await getAllMoves();

  // Try a bunch of random samples; the pool is huge so this finds one quickly.
  const MAX_TRIES = 60;
  for (let i = 0; i < MAX_TRIES; i++) {
    const candidate = allMoves[Math.floor(rng() * allMoves.length)];
    if (excludedMoveNamesSet.has(candidate)) continue;

    const details = await fetchMoveDetails(candidate);
    if (!details) continue;
    if (!isAttackingMove(details)) continue;

    return {
      name: candidate,
      damageClass: details.damage_class.name, // "physical" or "special"
      power: details.power, // may be null for some
      type: details.type?.name ?? null,
    };
  }

  // Fallback if something weird happens
  return { name: 'struggle', damageClass: 'physical', power: 50, type: 'normal' };
}
