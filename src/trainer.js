export const DEX_MILESTONES = [50, 100, 200, 300, 500, 750, 1000];

// ===== Achievements (non-dex) =====
export const ACHIEVEMENTS = [
  // Shiny
  { id: 'shiny_1', category: 'shiny', icon: '✨', name: 'Catch a shiny Pokémon', desc: 'Catch any shiny Pokémon.' },
  { id: 'shiny_10', category: 'shiny', icon: '✨', name: 'Catch 10 shiny Pokémon', desc: 'Catch 10 shiny Pokémon total.' },
  { id: 'shiny_50', category: 'shiny', icon: '✨', name: 'Catch 50 shiny Pokémon', desc: 'Catch 50 shiny Pokémon total.' },
  { id: 'shiny_100', category: 'shiny', icon: '✨', name: 'Catch 100 shiny Pokémon', desc: 'Catch 100 shiny Pokémon total.' },

  // Buffs
  { id: 'buffs_4', category: 'buffs', icon: '💪', name: 'Catch a Pokémon with 4 buffs', desc: 'Catch a Pokémon that rolled 4 buffs.' },

  // Delta / special
  { id: 'shiny_delta', category: 'delta', icon: '🔺', name: 'Catch a shiny Delta Pokémon', desc: 'Catch a Pokémon that is both shiny and Delta-typed.' },

  // Catch chains
  { id: 'streak_5', category: 'streak', icon: '🔗', name: '5 catches in a row', desc: 'Reach a catch chain of 5.' },
  { id: 'streak_10', category: 'streak', icon: '🔗', name: '10 catches in a row', desc: 'Reach a catch chain of 10.' },
  { id: 'streak_25', category: 'streak', icon: '🔗', name: '25 catches in a row', desc: 'Reach a catch chain of 25.' },
];

export const ACH_CATEGORY = {
  dex: { icon: '📖', label: 'Dex' },
  shiny: { icon: '✨', label: 'Shiny' },
  buffs: { icon: '💪', label: 'Buffs' },
  delta: { icon: '🔺', label: 'Delta' },
  streak: { icon: '🔗', label: 'Streak' },
};

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

function unlockAchievement(nextAchievements, id) {
  if (nextAchievements[id]) return false;
  nextAchievements[id] = { unlockedAt: Date.now() };
  return true;
}

function applyAchievementRules(trainer, event) {
  const nextAchievements = { ...(trainer.achievements ?? {}) };
  const nextStats = { ...(trainer.stats ?? {}) };

  const unlocks = [];

  if (event?.type === 'catch') {
    const isShiny = !!event.isShiny;
    const isDelta = !!event.isDelta;
    const buffCount = Math.max(0, Math.floor(event.buffCount ?? 0));
    const streak = Math.max(0, Math.floor(event.streak ?? 0));

    // Shiny total
    if (isShiny) {
      nextStats.shinyCaught = Math.max(0, Math.floor(nextStats.shinyCaught ?? 0)) + 1;
    } else {
      nextStats.shinyCaught = Math.max(0, Math.floor(nextStats.shinyCaught ?? 0));
    }

    // Best streak
    nextStats.bestCatchStreak = Math.max(
      Math.max(0, Math.floor(nextStats.bestCatchStreak ?? 0)),
      streak
    );

    // Unlocks
    if (isShiny) {
      if (unlockAchievement(nextAchievements, 'shiny_1')) unlocks.push('shiny_1');
      const sc = nextStats.shinyCaught;
      if (sc >= 10 && unlockAchievement(nextAchievements, 'shiny_10')) unlocks.push('shiny_10');
      if (sc >= 50 && unlockAchievement(nextAchievements, 'shiny_50')) unlocks.push('shiny_50');
      if (sc >= 100 && unlockAchievement(nextAchievements, 'shiny_100')) unlocks.push('shiny_100');
    }
    if (buffCount >= 4) {
      if (unlockAchievement(nextAchievements, 'buffs_4')) unlocks.push('buffs_4');
    }
    if (isShiny && isDelta) {
      if (unlockAchievement(nextAchievements, 'shiny_delta')) unlocks.push('shiny_delta');
    }
    if (streak >= 5) {
      if (unlockAchievement(nextAchievements, 'streak_5')) unlocks.push('streak_5');
    }
    if (streak >= 10) {
      if (unlockAchievement(nextAchievements, 'streak_10')) unlocks.push('streak_10');
    }
    if (streak >= 25) {
      if (unlockAchievement(nextAchievements, 'streak_25')) unlocks.push('streak_25');
    }
  }

  return { nextAchievements, nextStats, unlocks };
}

/**
 * Apply XP for a catch and (optionally) newly completed dex milestones.
 * Also updates achievement flags + lifetime stats (main save).
 *
 * Returns { nextTrainer, gainedXp, milestoneUnlocks, achievementUnlocks }.
 */
export function applyCatchProgress(prevTrainer, { rarityKey, isShiny, isDelta, dexCaughtBefore, dexCaughtAfter, buffCount = 0, streak = 0, disableAchievements = false }) {
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

  let nextAchievements = { ...(trainer.achievements ?? {}) };
  let nextStats = { ...(trainer.stats ?? {}) };
  let achievementUnlocks = [];

  if (!disableAchievements) {
    const a = applyAchievementRules(
      { achievements: nextAchievements, stats: nextStats },
      { type: 'catch', isShiny, isDelta, buffCount, streak }
    );
    nextAchievements = a.nextAchievements;
    nextStats = a.nextStats;
    achievementUnlocks = a.unlocks;
  }

  const nextTrainer = {
    ...trainer,
    totalXp: nextTotalXp,
    level,
    dexMilestones: nextDexMilestones,
    achievements: nextAchievements,
    stats: nextStats,
  };

  return { nextTrainer, gainedXp, milestoneUnlocks, achievementUnlocks };
}
