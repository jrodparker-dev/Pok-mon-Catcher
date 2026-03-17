import { toID } from './pokeapi.js';
import { pokemonBiomes } from './pokemonBiomes.ts';


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
  // Only ban explicit Gigantamax forms; base species can still be spawnable.
  if (String(id).includes('gmax') || forme.includes('gmax')) return true;

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
  return getRandomSpawnableDexIdForBiome(null, rng);
}

const BIOME_KEY_TO_NAME = {
  cave: 'Cave',
  sea: 'Sea',
  grass: 'Grass',
  desert: 'Desert',
  tallgrass: 'Forest',
  snow: 'Snow',
  powerplant: 'Power Plant / City',
  mountain: 'Mountain',
  wetlands: 'Wetlands',
  volcanic: 'Volcanic',
  wormhole: 'Wormhole',
};

const FORM_IDS_BY_NUM = new Map();
for (const [id, entry] of byId.entries()) {
  if (!entry) continue;
  if (isBannedForm(id, entry)) continue;
  if (typeof entry.num !== 'number' || entry.num <= 0) continue;
  const list = FORM_IDS_BY_NUM.get(entry.num) || [];
  list.push(id);
  FORM_IDS_BY_NUM.set(entry.num, list);
}

const BIOME_ENTRY_BY_NUM = new Map(
  (pokemonBiomes || []).map((p) => [Number(p?.dex), p])
);

function biomeWeightForNum(num, biomeName) {
  if (!biomeName) return 1;

  const row = BIOME_ENTRY_BY_NUM.get(num);
  const primary = String(row?.primaryBiome || 'Grass').toLowerCase();
  const secondary = String(row?.secondaryBiome || '').toLowerCase();
  const target = String(biomeName).toLowerCase();
  const isMatch = primary === target || secondary === target;

  // Exact-only pool: only Pokémon that list this biome as primary or secondary can spawn.
  if (target === 'grass' || target === 'forest' || target === 'mountain' || target === 'wormhole') {
    return isMatch ? 1 : 0;
  }

  // 95/5 split: matching-biome Pokémon are heavily favored but off-biome Pokémon still appear.
  if (target === 'cave' || target === 'wetlands' || target === 'power plant / city' || target === 'sea') {
    return isMatch ? 19 : 1;
  }

  // 90/10 split.
  if (target === 'volcanic' || target === 'snow' || target === 'desert') {
    return isMatch ? 9 : 1;
  }

  return isMatch ? 3 : 1;
}

function pickWeightedNumForBiome(biomeKey, rng = Math.random) {
  const biomeName = BIOME_KEY_TO_NAME[String(biomeKey || '').toLowerCase()] || null;
  const pairs = [];
  let totalWeight = 0;

  for (const [num, ids] of FORM_IDS_BY_NUM.entries()) {
    if (!Array.isArray(ids) || !ids.length) continue;
    const w = biomeWeightForNum(num, biomeName);
    if (w <= 0) continue;
    totalWeight += w;
    pairs.push([num, totalWeight]);
  }

  if (!pairs.length || totalWeight <= 0) return null;
  const roll = rng() * totalWeight;
  for (const [num, ceiling] of pairs) {
    if (roll < ceiling) return num;
  }
  return pairs[pairs.length - 1][0];
}

export function getRandomSpawnableDexIdForBiome(biomeKey = null, rng = Math.random) {
  const pickedNum = pickWeightedNumForBiome(biomeKey, rng);
  if (pickedNum == null) return null;

  const forms = FORM_IDS_BY_NUM.get(pickedNum) || [];
  if (!forms.length) return null;
  return forms[Math.floor(rng() * forms.length)];
}

export function getMissingBiomeSpecies() {
  const missing = [];
  for (let n = 1; n <= MAX_POKEDEX_NUM; n++) {
    if (BIOME_ENTRY_BY_NUM.has(n)) continue;
    const hit = byNum.get(n);
    if (!hit?.entry) continue;
    missing.push({
      dex: n,
      id: hit.id,
      name: hit.entry?.name || String(hit.id),
      primaryBiome: '',
      secondaryBiome: '',
    });
  }
  return missing;
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
