// src/dexLocal.js

import * as DexMod from './pokedex.ts';

// Supports both `export const Pokedex = ...` and `export default ...`
const POKEDEX =
  DexMod.Pokedex ??
  DexMod.pokedex ??
  DexMod.default ??
  DexMod;

// Build an index by National Dex number
const byNum = new Map();
for (const [id, entry] of Object.entries(POKEDEX)) {
  if (!entry || typeof entry.num !== 'number') continue;
  byNum.set(entry.num, { id, entry });
}
// Build a map by PS id (keys of pokedex.ts)
const byId = new Map();
for (const [id, entry] of Object.entries(POKEDEX)) {
  byId.set(id, entry);
}

export function getDexById({ id, num }) {
  if (id) {
    const entry = byId.get(id);
    if (!entry) return null;
    return { id, num: entry.num, entry };
  }
  if (typeof num === 'number') {
    // If you already have your "byNum prefers base form" map:
    const hit = byNum.get(num);
    if (!hit) return null;
    return { id: hit.id, num, entry: hit.entry };
  }
  return null;
}


export function getDexEntryByNum(num) {
  return byNum.get(num)?.entry ?? null;
}


export function getAllDexIds() {
  return Array.from(byId.keys());
}

export function getRandomDexId(rng = Math.random) {
  const ids = getAllDexIds();
  return ids[Math.floor(rng() * ids.length)];
}

export function normalizeStats(psBaseStats) {
  // PS uses hp/atk/def/spa/spd/spe already
  // We return a guaranteed 6-stat object
  return {
    hp: psBaseStats?.hp ?? 0,
    atk: psBaseStats?.atk ?? 0,
    def: psBaseStats?.def ?? 0,
    spa: psBaseStats?.spa ?? 0,
    spd: psBaseStats?.spd ?? 0,
    spe: psBaseStats?.spe ?? 0,
  };
}

export function normalizeTypes(types) {
  // PS types are usually ["Electric"] capitalized; we'll normalize to lower-case
  return (types ?? []).map(t => String(t).toLowerCase());
}

export function normalizeAbilities(abilities) {
  // PS abilities object usually like: {0:"Static", 1:"", H:"Lightning Rod", S:""}
  // Return array like App expects: [{name,isHidden,slot}, ...]
  const out = [];

  if (!abilities || typeof abilities !== 'object') return out;

  if (abilities[0]) out.push({ name: abilities[0], isHidden: false, slot: 1 });
  if (abilities[1]) out.push({ name: abilities[1], isHidden: false, slot: 2 });
  if (abilities.H) out.push({ name: abilities.H, isHidden: true, slot: 3 });
  if (abilities.S) out.push({ name: abilities.S, isHidden: false, slot: 4 }); // special slot (if you use it)

  // Normalize to lower-case names to match PokéAPI style elsewhere (optional)
  return out.map(a => ({
    ...a,
    name: String(a.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  }));
}
