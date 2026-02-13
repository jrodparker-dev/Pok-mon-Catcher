import { getLocalAbilityEntries } from './abilitiesLocal.js';

let cachedEntries = null;

export async function getAllAbilities() {
  // Local file load (no fetch)
  if (cachedEntries) return cachedEntries;

  const entries = getLocalAbilityEntries();
  if (!entries.length) throw new Error('Local abilities.ts did not produce any abilities');

  cachedEntries = entries;
  return cachedEntries;
}

export function rollAbility(abilityEntries, rng = Math.random) {
  // 5% chance to be Custom
  if (rng() < 0.05) return { kind: 'custom', id: 'custom', name: 'Custom' };

  const pick = abilityEntries[Math.floor(rng() * abilityEntries.length)];
  return { kind: 'normal', id: pick.id, name: pick.name };
}
