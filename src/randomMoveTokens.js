import { Moves as MoveTable } from './moves.ts';

// Build a stable pool once.
// We include basically everything except "Struggle" and obvious unusables.
const POOL = Object.keys(MoveTable).filter((id) => {
  if (!id) return false;
  if (id === 'struggle') return false;
  const m = MoveTable[id];
  if (!m || !m.name) return false;
  // Skip Max Moves (they aren't real learnable moves in this context)
  if (m.isMax) return false;
  return true;
});

export function rollRandomMoveIds(count = 4, rng = Math.random, excludeIds = []) {
  const exclude = new Set((excludeIds || []).filter(Boolean));
  const picks = [];
  let guard = 0;
  if (!POOL.length) return [];
  while (picks.length < count && guard++ < 2000) {
    const id = POOL[Math.floor(rng() * POOL.length)];
    if (!id || exclude.has(id)) continue;
    exclude.add(id);
    picks.push(id);
  }
  return picks;
}

export function getMoveDisplay(id) {
  const m = MoveTable[id];
  if (!m) return { id, name: id, meta: null };
  const meta = {
    type: m.type,
    damageClass: m.category,
    power: typeof m.basePower === 'number' ? m.basePower : null,
  };
  return { id, name: m.name || id, meta };
}
