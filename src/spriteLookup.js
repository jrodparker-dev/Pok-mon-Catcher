// Shared Pokémon Showdown sprite lookup with lightweight in-memory caching.
// Goal: minimize requests by preferring a "hyphen-fixed" id first, and
// remembering the first URL that successfully loads for a given sprite key.

export const SHOWDOWN_BASE = 'https://play.pokemonshowdown.com/sprites';

// Common forme suffixes that sometimes get saved without a hyphen
// (e.g. palkiaorigin -> palkia-origin). Add new ones here.
export const FORME_SUFFIXES = [
  'alola','galar','hisui','paldea',
  'origin','therian','incarnate',
  'primal','crowned','complete',
  'attack','defense','speed',
  'sky','land','sea',
  'dusk','dawn','ice','shadow',
  'school','solo','busted',
  'white','black',
  'gmax',
  'mega','megax','megay', 'eternamax',
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

function insertHyphenBeforeSuffix(id) {
  if (!id || id.includes('-')) return null;
  const suffixes = [...FORME_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const suf of suffixes) {
    if (id.endsWith(suf) && id.length > suf.length) {
      const base = id.slice(0, -suf.length);
      if (/^[a-z0-9]+$/.test(base)) return `${base}-${suf}`;
    }
  }
  return null;
}

export function getSpriteKey(mon) {
  const raw = mon?.formId || mon?.speciesId || mon?.dexId || mon?.id || mon?.name;
  const id = sanitizeId(raw);
  // IMPORTANT: cache shiny and non-shiny separately
  return `${id}|${mon?.shiny ? 'shiny' : 'normal'}`;
}


export function getSpriteIdCandidates(mon) {
  const id0 = getSpriteKey(mon);
  const out = [];

  // Prefer the hyphen-fixed id FIRST to reduce failed requests.
  const hyphenFixed = insertHyphenBeforeSuffix(id0);
  if (hyphenFixed) out.push(hyphenFixed);
  if (id0 && !out.includes(id0)) out.push(id0);

  const base1 = id0.split('-')[0];
  if (base1 && !out.includes(base1)) out.push(base1);
  if (hyphenFixed) {
    const base2 = hyphenFixed.split('-')[0];
    if (base2 && !out.includes(base2)) out.push(base2);
  }

  return out.filter(Boolean);
}

export function getShowdownSpriteCandidates(mon) {
  const key = getSpriteKey(mon);
  const cached = key ? spriteCache.get(key) : null;
  const ids = getSpriteIdCandidates(mon);
  const isShiny = !!mon?.shiny;

  const urls = [];
  if (cached) urls.push(cached);

  for (const id of ids) {
    // Shiny first (only if shiny)
    if (isShiny) {
      urls.push(`${SHOWDOWN_BASE}/ani-shiny/${id}.gif`);
      urls.push(`${SHOWDOWN_BASE}/gen5ani-shiny/${id}.gif`);
    }

    // Normal animated + PNG fallbacks
    urls.push(`${SHOWDOWN_BASE}/ani/${id}.gif`);
    urls.push(`${SHOWDOWN_BASE}/gen5ani/${id}.gif`);
    urls.push(`${SHOWDOWN_BASE}/dex/${id}.png`);
    urls.push(`${SHOWDOWN_BASE}/home/${id}.png`);
  }

  if (mon?.spriteUrl) urls.push(mon.spriteUrl);
  return [...new Set(urls.filter(Boolean))];
}


export function cacheSpriteSuccess(mon, src) {
  const key = getSpriteKey(mon);
  if (!key || !src) return;
  const prev = spriteCache.get(key);
  if (prev === src) return;
  spriteCache.set(key, src);
  // Notify listeners (PC box, detail, team preview) so they can re-render
  // and pick up the cached URL immediately.
  try {
    window.dispatchEvent(new CustomEvent(SPRITE_CACHE_EVENT, { detail: { key, src } }));
  } catch {}
}
