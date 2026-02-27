import {toID} from './pokeapi.js';
// src/spriteLookup.js
// Shared Pokémon Showdown sprite lookup with lightweight in-memory caching.
// - Builds a prioritized list of candidate sprite URLs (animated + PNG).
// - Cycles through them on <img onError>.
// - Caches the first successful URL per (spriteId + shiny) key for the session.

export const SHOWDOWN_BASE = 'https://play.pokemonshowdown.com/sprites';

// Pokeathlon Infinite Fusion numbering map (subset; values < 800).
import pokeathlonFusionNums from './fusionNums.pokeathlon.json';

const POKEATHLON_FUSION_BASE = 'https://play.pokeathlon.com/sprites/fusion-sprites';

// IDs in the numbering map use PS-style toID keys (lowercase alnum).
function toKey(x) {
  return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getPokeathlonFusionNum(formId, natDexNum, opts = {}) {
  const { allowNatDexFallback = true } = (opts && typeof opts === 'object') ? opts : {};
  const k = toKey(formId);
  const mapped = pokeathlonFusionNums?.[k];
  // The uploaded map includes some out-of-range entries (>= 800) for other contexts.
  if (typeof mapped === 'number' && mapped > 0 && mapped < 800) return mapped;

  // Historically we fell back to nat dex numbers. For fusion sprite lookups, this creates
  // incorrect "fusion" requests when a name isn't present in the numbering map.
  // Callers can opt-in to the old fallback if they truly want it.
  if (allowNatDexFallback && typeof natDexNum === 'number' && natDexNum > 0) return natDexNum;

  return null;
}

const fusionSpriteUrlCache = new Map();

export function getFusionSpriteUrls(mon) {
  if (!mon?.isFusion) return null;
  const fm = mon?.fusionMeta || {};
  const baseFormId = fm.baseFormId;
  const otherFormId = fm.otherFormId;
  const baseDexId = fm.baseDexId;
  const otherDexId = fm.otherDexId;

  if (!baseFormId || !otherFormId) return null;

  const key = `${baseFormId}__${otherFormId}`;
  const cached = fusionSpriteUrlCache.get(key);
  if (cached) return cached;

  const aNum = getPokeathlonFusionNum(baseFormId, baseDexId, { allowNatDexFallback: false });
  const bNum = getPokeathlonFusionNum(otherFormId, otherDexId, { allowNatDexFallback: false });
  if (!aNum || !bNum) return null;

  const result = {
    primary: `${POKEATHLON_FUSION_BASE}/${aNum}.${bNum}.png`,
    flipped: `${POKEATHLON_FUSION_BASE}/${bNum}.${aNum}.png`,
  };
  fusionSpriteUrlCache.set(key, result);
  return result;
}


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
  'douse', 'shock', 'sandy', 'unbound', 'burn', 'chill', 'zen', 'bond', 'ash',

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
  if (!mon) return 'unknown';
  // Allow callers to override the cache identity (useful for fusions / alternates)
  if (mon.spriteIdOverride) return String(mon.spriteIdOverride);

  // Fusions: keep cache keys isolated so we don't leak fusion sprites onto base species.
  // Also include the current fusionSpriteChoice so toggling doesn't get "stuck" on a cached URL.
  if (mon.fusionMeta?.baseFormId && mon.fusionMeta?.otherFormId) {
    const choice = mon.fusionSpriteChoice || 'base';
    return `fusion:${mon.fusionMeta.baseFormId}__${mon.fusionMeta.otherFormId}__${choice}`;
  }

  // Older fusion shape (if present)
  if (mon.isFusion && mon.fusionBase && mon.fusionPartner) {
    const choice = mon.fusionSpriteChoice || 'base';
    return `fusion:${toID(mon.fusionBase)}__${toID(mon.fusionPartner)}__${choice}`;
  }

  const baseId = toID(mon.formId || mon.dexId || mon.name || '');
  return baseId || 'unknown';
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

  // If we already resolved a working sprite for this exact key (including fusion choice/shiny),
  // return it directly so we don't re-probe missing fusion sprite URLs on every render.
  if (cached) return [cached];

  // Fusion sprite candidates (Pokeathlon)
  const fusionUrls = getFusionSpriteUrls(mon);
  if (fusionUrls?.primary && fusionUrls?.flipped) {
    const pref = String(mon?.fusionSpriteChoice || '').toLowerCase();
    if (pref === 'flip' || pref === 'other') {
      urls.push(fusionUrls.flipped, fusionUrls.primary);
    } else {
      urls.push(fusionUrls.primary, fusionUrls.flipped);
    }
  }


  


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
