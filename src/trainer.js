export const DEX_MILESTONES = [50, 100, 200, 300, 500, 750, 1000];

// XP values tuned for a simple early progression curve.
// You can rebalance later without breaking saves because we store totalXp.
export const XP_BY_RARITY = {
  common: 10,
  uncommon: 25,
  rare: 60,
  legendary: 150,
};

export const XP_BONUS = {
  shiny: 120,
  delta: 60,
};

// Milestone bonus XP (cumulative chase goals)
export function xpForDexMilestone(n) {
  // 50->100, 100->200, 200->400, 300->600, 500->1000, 750->1500, 1000->2000
  return Math.round(n * 2);
}

export function xpForCatch(rarityKey, { isShiny = false, isDelta = false } = {}) {
  const rk = String(rarityKey || 'common').toLowerCase();
  let xp = XP_BY_RARITY[rk] ?? XP_BY_RARITY.common;
  if (isShiny) xp += XP_BONUS.shiny;
  if (isDelta) xp += XP_BONUS.delta;
  return xp;
}

// Returns how much XP is needed to go from `level` to `level+1`.
export function xpToNextLevel(level) {
  const L = Math.max(1, Number(level) || 1);
  // Smooth-ish growth: 100, 125, 155, 190, ...
  return Math.round(100 + (L - 1) * 25 + Math.pow(L - 1, 2) * 2);
}

export function levelFromTotalXp(totalXp) {
  let xp = Math.max(0, Math.floor(totalXp || 0));
  let level = 1;
  while (level < 9999) {
    const need = xpToNextLevel(level);
    if (xp < need) break;
    xp -= need;
    level += 1;
  }
  const xpIntoLevel = xp;
  const xpToNext = xpToNextLevel(level);
  return { level, xpIntoLevel, xpToNext };
}

/**
 * Apply XP for a catch and (optionally) newly completed dex milestones.
 * Returns { nextTrainer, gainedXp, milestoneUnlocks }.
 */
export function applyCatchProgress(prevTrainer, { rarityKey, isShiny, isDelta, dexCaughtBefore, dexCaughtAfter }) {
  const trainer = prevTrainer && typeof prevTrainer === 'object' ? prevTrainer : {};
  const totalXp = Math.max(0, Math.floor(trainer.totalXp || 0));
  const dexMilestones = (trainer.dexMilestones && typeof trainer.dexMilestones === 'object') ? trainer.dexMilestones : {};

  let gainedXp = xpForCatch(rarityKey, { isShiny, isDelta });
  const milestoneUnlocks = [];

  for (const m of DEX_MILESTONES) {
    const had = !!dexMilestones[m];
    const unlockedNow = (dexCaughtBefore < m) && (dexCaughtAfter >= m);
    if (!had && unlockedNow) {
      const bonus = xpForDexMilestone(m);
      gainedXp += bonus;
      milestoneUnlocks.push({ milestone: m, bonusXp: bonus });
    }
  }

  const nextTotalXp = totalXp + gainedXp;
  const { level } = levelFromTotalXp(nextTotalXp);

  const nextDexMilestones = { ...dexMilestones };
  const now = Date.now();
  for (const u of milestoneUnlocks) {
    nextDexMilestones[u.milestone] = { unlockedAt: now, bonusXp: u.bonusXp };
  }

  const nextTrainer = {
    ...trainer,
    totalXp: nextTotalXp,
    level,
    dexMilestones: nextDexMilestones,
  };

  return { nextTrainer, gainedXp, milestoneUnlocks };
}
