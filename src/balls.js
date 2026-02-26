// balls.js
// Base + Special ball definitions and helpers.

export const BASE_BALLS = [
  { key: 'poke',   label: 'Poké Ball',   modifier: 1.0, alwaysCatch: false },
  { key: 'great',  label: 'Great Ball',  modifier: 1.5, alwaysCatch: false },
  { key: 'ultra',  label: 'Ultra Ball',  modifier: 2.0, alwaysCatch: false },
  { key: 'master', label: 'Master Ball', modifier: 255.0, alwaysCatch: true },
];

// Special balls (unlock/equip controlled in save.specialBalls)
export const SPECIAL_BALLS = [
  { key: 'net',     label: 'Net Ball' },
  { key: 'dive',    label: 'Dive Ball' },
  { key: 'love',    label: 'Love Ball' },
  { key: 'beast',   label: 'Beast Ball' },
  { key: 'dusk',    label: 'Dusk Ball' },
  { key: 'luxury',  label: 'Luxury Ball' },
  { key: 'premier', label: 'Premier Ball' },
  { key: 'timer',   label: 'Timer Ball' },
  { key: 'repeat',  label: 'Repeat Ball' },
  { key: 'fast',    label: 'Fast Ball' },
  { key: 'moon',    label: 'Moon Ball' },
  { key: 'dream',   label: 'Dream Ball' },
  { key: 'nest',    label: 'Nest Ball' },
  { key: 'quick',   label: 'Quick Ball' }, // locked by default per your note
];

// Back-compat: BALLS is the base row shown in the encounter UI.
export const BALLS = BASE_BALLS;

export const ALL_BALLS = [...BASE_BALLS, ...SPECIAL_BALLS.map(b => ({
  key: b.key,
  label: b.label,
  modifier: 1.0,
  alwaysCatch: false,
}))];

export function getBallDef(key) {
  return ALL_BALLS.find(b => b.key === key) || null;
}

export function calcCatchChance(captureRate, ball) {
  if (ball?.alwaysCatch) return 1;
  const mod = Number(ball?.modifier ?? 1);
  const chance = (captureRate * mod) / 255;
  return Math.max(0, Math.min(1, chance));
}

export function applyPity(chance, pityMultiplier) {
  const capped = Math.min(0.99, (Number(chance) || 0) * (Number(pityMultiplier) || 1));
  return Math.max(0, Math.min(0.99, capped));
}

/**
 * computeBallEffect(ballKey, ctx)
 * Returns:
 *  - { forceCatch: boolean } to override to 100%
 *  - { mult: number } to multiply the chance (capped later)
 *  - or null for no effect
 *
 * ctx fields used:
 *  - wild: { types?: string[], rarity?: string, shiny?: boolean, stats?: {spe?:number}, isUltraBeast?: boolean }
 *  - biome: string
 *  - ballsThrownSoFar: number (0-based, before this throw)
 *  - favorites: number[] | string[] (dex nums / ids)
 *  - pokedex: object (progress by dex num)
 *  - baseDexNum: number (species dex num)
 */
export function computeBallEffect(ballKey, ctx = {}) {
  const key = String(ballKey || '');
  const wild = ctx.wild || {};
  const types = Array.isArray(wild.types) ? wild.types.map(t => String(t).toLowerCase()) : [];
  const rarity = String(wild.rarity || '').toLowerCase();
  const shiny = !!wild.shiny;
  const biome = String(ctx.biome || '').toLowerCase();
  const ballsThrownSoFar = Number(ctx.ballsThrownSoFar || 0);
  const spe = Number(wild?.stats?.spe ?? wild?.stats?.speed ?? 0);
  const baseDexNum = Number(ctx.baseDexNum || 0);

  // Convenience helpers
  const hasType = (t) => types.includes(String(t).toLowerCase());

  if (key === 'net') {
    if (hasType('bug') || hasType('flying')) return { forceCatch: true };
  }

  if (key === 'dive') {
    if (hasType('water') || biome === 'sea') return { forceCatch: true };
  }

  if (key === 'love') {
    const fav = Array.isArray(ctx.favorites) ? ctx.favorites : [];
    const favSet = new Set(fav.map(x => Number(x)));
    if (baseDexNum && favSet.has(baseDexNum)) return { forceCatch: true };
  }

  if (key === 'beast') {
    if (wild.isUltraBeast) return { forceCatch: true };
  }

  if (key === 'dusk') {
    if (hasType('dark') || biome === 'cave') return { forceCatch: true };
  }

  if (key === 'luxury') {
    if (rarity === 'legendary') return { forceCatch: true };
  }

  if (key === 'premier') {
    if (shiny) return { forceCatch: true };
  }

  if (key === 'repeat') {
    const dex = ctx.pokedex || {};
    const entry = dex[String(baseDexNum)] || {};
    const caught = Number(entry.caught ?? 0) > 0;
    if (caught) return { forceCatch: true };
  }

  if (key === 'moon') {
    if (hasType('fairy')) return { forceCatch: true };
  }

  if (key === 'timer') {
    // 4th or more ball (0-based, so >=3 before this throw)
    if (ballsThrownSoFar >= 3) return { forceCatch: true };
  }

  if (key === 'fast') {
    if (spe > 90) return { mult: 3 };
  }

  if (key === 'quick') {
    if (ballsThrownSoFar === 0) return { mult: 2 };
  }

  if (key === 'nest') {
    if (rarity === 'common' || rarity === 'uncommon') return { forceCatch: true };
  }

  // dream: placeholder for later
  return null;
}
