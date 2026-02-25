// src/spriteLookup.js
// Shared Pokémon Showdown sprite lookup with lightweight in-memory caching.
// - Builds a prioritized list of candidate sprite URLs (animated + PNG).
// - Cycles through them on <img onError>.
// - Caches the first successful URL per (spriteId + shiny) key for the session.

export const SHOWDOWN_BASE = 'https://play.pokemonshowdown.com/sprites';

// Common forme suffixes that sometimes get saved without a hyphen
// (e.g. palkiaorigin -> palkia-origin). Add new ones here.
export const FORME_SUFFIXES = [
  // regional / generational
  'alola','galar','hisui','paldea',

  // common form groups
  'origin','therian','incarnate',
  'primal','crowned','complete', 'dawnwings', 'duskmane', 'ultra',
  'paldeaaqua', 'paldeablaze', 'paldeacombat', 'bloodmoon', 'rapidstrike',
  'four', 'fancy', 'whitestriped', 'bluestriped', 'threesegment',
  'terastal', 'pirouette', 'gorging', 'dada',

  // rotom
  'fan', 'mow', 'heat', 'wash', 'frost',

  //pumkaboo/gourgeist
  'small', 'large', 'super', 'average',

  // deoxys-like
  'attack','defense','speed',

  //castform
  'sunny', 'rainy', 'snowy',

  // weather trio / others
  'sky','land','sea',

  // necrozma-like / calyrex-like / etc
  'dusk','dawn','ice','shadow', 'neutral',

  // schools / mimikyu / etc
  'school','solo','busted', 'trash',

  // kyurem / others
  'white','black', 'midnight', 'noice',

  // max / styles / oricorio
  'gmax', 'sensu', 'pau', 'pompom', 'blue', 'yellow', 'green', 
  'starter',

  // ogerpon masks + tera-ish strings you were using
  'hearthflametera', 'cornerstonetera', 'wellspringtera',
  'tealtera', 'wellspring', 'cornerstone', 'hearthflame',

  // genesect drives etc
  'douse', 'shock', 'sandy', 'unbound', 'burn',

  // poltchageist/sinistcha
  'artisan', 'masterpiece', 'antique',

  // megas + special
  'mega','megax','megay', 'eternamax', 'stellar',

  'roaming',
];

const spriteCache = new Map();
export const SPRITE_CACHE_EVENT = 'spritecache';

export function sanitizeId(x) {
  return String(x || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '')
    .trim();
}

// IMPORTANT: sprite id should NEVER include "__shiny".
// "__shiny" is for cache key only.
export function getSpriteId(mon) {
  // Try a few sources, but NEVER prefer a pure numeric id if we have
  // any string id available (name/form/species).
  const sources = [
    mon?.formId,
    mon?.speciesId,
    mon?.dexId,
    mon?.name,

    mon?.id,
  ];

  // Normalize + sanitize each
  const cleaned = sources
    .map(v => (v == null ? '' : String(v).trim().split('|')[0]))
    .map(sanitizeId)
    .filter(Boolean);

  if (!cleaned.length) return '';

  // Prefer the first non-numeric candidate (e.g. "wormadamtrash")
  const nonNumeric = cleaned.find(x => !/^\d+$/.test(x));
  return nonNumeric || cleaned[0]; // if literally all we have is digits, use it as last resort
}

function getCacheKey(mon) {
  const id = getSpriteId(mon);
  return mon?.shiny ? `${id}__shiny` : id;
}

// Converts e.g. "charizardmegax" -> "charizard-mega-x"
// and general "typhlosionhisui" -> "typhlosion-hisui"
function insertHyphenBeforeSuffix(id) {
  if (!id || id.includes('-')) return null;

  const suffixes = [...FORME_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const suf of suffixes) {
    if (!id.endsWith(suf) || id.length <= suf.length) continue;

    const base = id.slice(0, -suf.length);
    if (!/^[a-z0-9]+$/.test(base)) continue;

    // Special-case megax/megay => mega-x / mega-y
    if (suf === 'megax') return `${base}-mega-x`;
    if (suf === 'megay') return `${base}-mega-y`;

    // Normal case
    return `${base}-${suf}`;
  }

  return null;
}


// Gender form suffixes sometimes get saved without a hyphen (e.g. meowsticf -> meowstic-f).
function insertHyphenForGenderSuffix(id) {
  if (!id || id.includes('-')) return null;

  // Only certain species use gender-form suffixes in their Showdown IDs.
  // Limit to avoid bogus lookups like rotom-m, abomasnow-m, etc.
  const GENDER_FORM_SPECIES = new Set(['meowstic', 'basculegion']);

  const last = id.slice(-1);
  if (last !== 'f' && last !== 'm') return null;

  const base = id.slice(0, -1);
  if (!GENDER_FORM_SPECIES.has(base)) return null;

  return `${base}-${last}`;
}

export function getSpriteIdCandidates(mon) {
  const id0 = getSpriteId(mon); // IMPORTANT: no __shiny here
  const out = [];

  // Prefer hyphen-fixed first (gender forms first, then known suffixes)
  const genderFixed = insertHyphenForGenderSuffix(id0);
  if (genderFixed) out.push(genderFixed);

  const hyphenFixed = insertHyphenBeforeSuffix(id0);
  if (hyphenFixed) out.push(hyphenFixed);

  if (id0 && !out.includes(id0)) out.push(id0);

  // base species fallback: split at first hyphen
  const base1 = id0.split('-')[0];
  if (base1 && !out.includes(base1)) out.push(base1);

  if (hyphenFixed) {
    const base2 = hyphenFixed.split('-')[0];
    if (base2 && !out.includes(base2)) out.push(base2);
  }

  return out.filter(Boolean);
}

// Build ordered candidate URLs.
// This is the ONE function every screen should use.
export function getShowdownSpriteCandidates(mon) {
  const key = getCacheKey(mon);
  const cached = key ? spriteCache.get(key) : null;

  const ids = getSpriteIdCandidates(mon);
  const isShiny = !!mon?.shiny;

  const urls = [];

  


  if (cached) urls.push(cached);

  for (const id of ids) {
    if (isShiny) {
      // Shiny animated first
      urls.push(`${SHOWDOWN_BASE}/ani-shiny/${id}.gif`);
      urls.push(`${SHOWDOWN_BASE}/gen5ani-shiny/${id}.gif`);

      // Shiny PNG fallbacks (VERY IMPORTANT to have these)
      urls.push(`${SHOWDOWN_BASE}/dex-shiny/${id}.png`);
      urls.push(`${SHOWDOWN_BASE}/home-shiny/${id}.png`);
      urls.push(`${SHOWDOWN_BASE}/gen5-shiny/${id}.png`);
    }

    // Normal animated + PNG fallbacks
    urls.push(`${SHOWDOWN_BASE}/ani/${id}.gif`);
    urls.push(`${SHOWDOWN_BASE}/gen5ani/${id}.gif`);

    urls.push(`${SHOWDOWN_BASE}/home/${id}.png`);
    urls.push(`${SHOWDOWN_BASE}/dex/${id}.png`);
    urls.push(`${SHOWDOWN_BASE}/gen5/${id}.png`);
  }

  // Last-resort fallbacks from your bundle
  if (mon?.spriteUrl) urls.push(mon.spriteUrl);
  if (mon?.fallbackShinySprite && isShiny) urls.push(mon.fallbackShinySprite);
  if (mon?.fallbackSprite) urls.push(mon.fallbackSprite);

  // Unique + no empties
  return [...new Set(urls.filter(Boolean))];
}

export function cacheSpriteSuccess(mon, src) {
  const key = getCacheKey(mon);
  if (!key || !src) return;

  const prev = spriteCache.get(key);
  if (prev === src) return;

  spriteCache.set(key, src);

  // Notify listeners (PC box, detail, team preview, encounter) so they can re-render
  try {
    window.dispatchEvent(new CustomEvent(SPRITE_CACHE_EVENT, { detail: { key, src } }));
  } catch {}
}
