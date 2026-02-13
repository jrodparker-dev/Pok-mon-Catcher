// src/abilitiesLocal.js
import * as AbMod from './abilities.ts';

// Supports `export const Abilities = ...` OR default export
const ABILITIES =
  AbMod.Abilities ??
  AbMod.abilities ??
  AbMod.default ??
  AbMod;

function toID(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Returns an array of { id, name } ability entries from your local abilities.ts
 * id = showdown id key (preferred), name = display name if available
 */
export function getLocalAbilityEntries() {
  if (!ABILITIES || typeof ABILITIES !== 'object') return [];

  const out = [];
  for (const [idKey, data] of Object.entries(ABILITIES)) {
    if (!data) continue;

    // Prefer the object key as the id (Showdown standard)
    const id = toID(idKey);
    if (!id) continue;

    const displayName =
      (typeof data.name === 'string' && data.name.trim()) ? data.name.trim() : idKey;

    out.push({ id, name: displayName });
  }
  return out;
}
