import { toID } from './pokeapi.js';


// src/dexLocal.js

import * as DexMod from './pokedex.ts';

// Supports both `export const Pokedex = ...` and `export default ...`
const POKEDEX =
  DexMod.Pokedex ??
  DexMod.pokedex ??
  DexMod.default ??
  DexMod;

// Build an index by National Dex number.
// IMPORTANT: Prefer the *base species* entry for each num.
// Your pokedex.ts includes many alternate forms that share the same num
// (e.g. venusaurmega, butterfreegmax). If we let later entries overwrite
// earlier ones, getDexEntryByNum(3) can become a form.
const byNum = new Map();

function isBaseSpeciesEntry(entry) {
  // Base species entries do NOT have `forme` or `baseSpecies`.
  return !!entry && !entry.forme && !entry.baseSpecies;
}

for (const [id, entry] of Object.entries(POKEDEX)) {
  if (!entry || typeof entry.num !== 'number') continue;

  const cur = byNum.get(entry.num);
  if (!cur) {
    byNum.set(entry.num, { id, entry });
    continue;
  }

  // If the current stored entry is a form and this one is base, replace it.
  if (!isBaseSpeciesEntry(cur.entry) && isBaseSpeciesEntry(entry)) {
    byNum.set(entry.num, { id, entry });
  }
  // Otherwise keep the existing mapping.
}
// Build a map by PS id (keys of pokedex.ts)
const byId = new Map();

const PIKA_LINE_WHITELIST = new Set(['pichu', 'pikachu', 'raichu', 'raichu-alola']);
function isPikaLine(id, entry) {
  const base = String(entry?.baseSpecies || entry?.name || '').toLowerCase();
  return base === 'pichu' || base === 'pikachu' || base === 'raichu';
}

function isBannedForm(id, entry) {
  const baseSpecies = String(entry?.baseSpecies || entry?.name || '').toLowerCase();
  const forme = String(entry?.forme || '').toLowerCase();

  // Ban Mega and Gigantamax forms
  if (entry?.isMega || String(id).includes('mega') || forme.includes('mega')) {
    // Don't accidentally ban Meganium
    if (!String(id).startsWith('meganium')) return true;
  }
  if (entry?.canGigantamax || String(id).includes('gmax') || forme.includes('gmax')) return true;

  // Hard-limit Pikachu line to base forms only
  if (isPikaLine(id, entry)) {
    return !PIKA_LINE_WHITELIST.has(String(id));
  }

  // Ban Arceus/Silvally type-changing forms (keep only the base).
  if (baseSpecies === 'arceus' && id !== 'arceus') return true;
  if (baseSpecies === 'silvally' && id !== 'silvally') return true;

  // Ban annoying extra-sprite troublemakers.
  if (String(id).includes('totem') || forme.includes('totem')) return true;
  if (String(id).includes('busted') || forme.includes('busted')) return true;

  // "Crowned" (Zacian/Zamazenta) and Calyrex Ice forms excluded.
  if (String(id).includes('crowned') || forme.includes('crowned')) return true;
  if (baseSpecies === 'calyrex' && (String(id).endsWith('ice') || forme.includes('ice'))) return true;

  return false;
}

for (const [id, entry] of Object.entries(POKEDEX)) {
  byId.set(id, entry);
}

export function getDexById(arg) {
  const { id, num } = (arg ?? {});
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

export const MAX_POKEDEX_NUM = 1025;

// helper: base entry = no forme + no baseSpecies
function isBaseDexEntry(e) {
  return !!e && !e.forme && !e.baseSpecies;
}

// helper: given an entry, return the base species name (if it’s a form)
function getBaseSpeciesName(e) {
  if (!e) return null;
  if (e.baseSpecies) return e.baseSpecies; // forms have baseSpecies: "Venusaur"
  // sometimes base already
  return e.name || null;
}

export function getAllBaseDexEntries() {
  const out = [];
  const usedNums = new Set();

  for (let n = 1; n <= MAX_POKEDEX_NUM; n++) {
    if (usedNums.has(n)) continue;

    let e = getDexEntryByNum(n);
    if (!e) continue;

    // If dex # still points at a form, resolve to its base species entry.
    if (!isBaseDexEntry(e)) {
      const baseName = getBaseSpeciesName(e);
      const baseId = baseName ? toID(baseName) : '';
      const baseEntry = baseId ? byId.get(baseId) : null;
      if (baseEntry && isBaseDexEntry(baseEntry) && baseEntry.num === n) {
        e = baseEntry;
      }
    }

    // Use the base species id.
    const id = toID(e.name);
    if (!id) continue;

    usedNums.add(n);

    out.push({
      id,
      name: e.name,
      num: typeof e.num === 'number' ? e.num : n,
    });
  }

  // Ensure sorted 1..1025
  out.sort((a, b) => a.num - b.num);

  // Guarantee exactly 1025 items (pad/trim if needed)
  if (out.length !== MAX_POKEDEX_NUM) {
    console.warn(`[dexLocal] Expected ${MAX_POKEDEX_NUM} entries, got ${out.length}.`);
  }

  return out.slice(0, MAX_POKEDEX_NUM);
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

// Like pinkmon-generator: return a random dex id, excluding problematic/banned forms.
export function getRandomSpawnableDexId(rng = Math.random) {
  const ids = getAllDexIds().filter((id) => {
    const entry = byId.get(id);
    if (!entry) return false;
    if (isBannedForm(id, entry)) return false;
    // Keep "real" mons only (exclude num <= 0)
    if (typeof entry.num !== 'number' || entry.num <= 0) return false;
    return true;
  });
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
