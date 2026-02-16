// src/sprites.js
// Sprite URL generation + robust fallbacks (ported from pinkmon-generator)

import { toID } from './pokeapi.js';

// Generate sprite-id variants by progressively removing hyphens.
// Examples:
// - tapu-fini -> tapufini
// - basculin-white-striped -> basculin-whitestriped -> basculinwhitestriped
function spriteIdVariants(id) {
  const out = [];
  const seen = new Set();
  const q = [id];

  while (q.length) {
    const cur = q.shift();
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);

    for (let i = 0; i < cur.length; i++) {
      if (cur[i] !== '-') continue;
      const next = cur.slice(0, i) + cur.slice(i + 1);
      if (!seen.has(next)) q.push(next);
    }
  }

  return out;
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function toSpriteKebab(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Build sprite candidates for a dex entry (form-aware, base-species-aware)
export function spriteFallbacksFromEntry(entry, shiny) {
  const folders = shiny
    ? [
        ['ani-shiny', 'gif'],
        ['gen5-shiny', 'png'],
        ['dex-shiny', 'png'],
      ]
    : [
        ['ani', 'gif'],
        ['gen5', 'png'],
        ['dex', 'png'],
      ];

  // Prefer exact PS id (toID) AND kebab-case (from name/baseSpecies),
  // then progressively de-hyphenated variants, then base species.
  const name = entry?.name ?? '';
  const baseName = entry?.baseSpecies ?? name;

  const spriteId = toSpriteKebab(name);
  const baseSpriteId = toSpriteKebab(baseName);

  const psId = toID(name);
  const basePsId = toID(baseName);

  const candidates = uniq([
    psId,
    spriteId,
    ...spriteIdVariants(spriteId),
    basePsId,
    baseSpriteId,
    ...spriteIdVariants(baseSpriteId),
  ]);

  const urls = [];
  for (const id of candidates) {
    for (const [folder, ext] of folders) {
      urls.push(`https://play.pokemonshowdown.com/sprites/${folder}/${id}.${ext}`);
    }
  }
  return urls;
}

// Convenience: given a bundle (from fetchPokemonBundle*), use its local dex entry
export function spriteFallbacksFromBundle(bundle, shiny) {
  return spriteFallbacksFromEntry(bundle?.dexEntry ?? bundle, shiny);
}
