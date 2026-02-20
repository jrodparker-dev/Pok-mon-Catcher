const MAIN_KEY = 'pokemonCatcherSave_v2';

// Mini-run storage (separate from main save)
const MINI_ACTIVE_KEY = 'pokemonCatcherMiniActive_v1';
const MINI_SUMMARIES_KEY = 'pokemonCatcherMiniSummaries_v1';

// ===== Main save (existing behavior) =====
export function loadSave() {
  try {
    const raw = localStorage.getItem(MAIN_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSave(data) {
  localStorage.setItem(MAIN_KEY, JSON.stringify(data));
}

// ===== Mini runs =====
export function loadActiveMiniRun() {
  try {
    const raw = localStorage.getItem(MINI_ACTIVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveActiveMiniRun(data) {
  localStorage.setItem(MINI_ACTIVE_KEY, JSON.stringify(data));
}

export function clearActiveMiniRun() {
  localStorage.removeItem(MINI_ACTIVE_KEY);
}

export function loadMiniSummaries() {
  try {
    const raw = localStorage.getItem(MINI_SUMMARIES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveMiniSummaries(arr) {
  localStorage.setItem(MINI_SUMMARIES_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
}

export function addMiniSummary(summary, maxKeep = 3) {
  const prev = loadMiniSummaries();
  const next = [summary, ...prev].slice(0, Math.max(1, maxKeep));
  saveMiniSummaries(next);
  return next;
}

// ===== Defaults =====
export function defaultTrainer() {
  return {
    level: 1,
    totalXp: 0,

    // Milestones
    dexMilestones: {}, // e.g. {50: {unlockedAt: 123}, ...}

    // Achievement unlock flags by id
    achievements: {}, // e.g. { 'shiny_1': {unlockedAt: 123}, ... }

    // Lifetime counters used for achievements (main save only)
    stats: {
      shinyCaught: 0,
      bestCatchStreak: 0,
    },
  };
}

export function defaultSave() {
  return {
    // Gameplay settings (difficulty toggles)
    settings: {
      // Rewards
      ballOnCatch: false,
      ballOnDefeat: true,
      ballOnRelease: true,
      moveTokenOnRelease: true,

      // Shiny rates
      // Base rate is 1/500; enabling Shiny Charm boosts to the old 2.5%.
      shinyCharm: false,
    },

    trainer: defaultTrainer(),

    balls: { poke: 25, great: 15, ultra: 10, master: 1 },
    moveTokens: 0,

    // Pokédex progress keyed by base National Dex number (as string) and sometimes base id convenience keys.
    // This must be permanent and not derived from PC contents.
    pokedex: {},

    caught: [], // array of caught Pokémon variants
    teamUids: [], // up to 3 uid's from caught[]
    activeTeamUid: null,

    encounter: {
      common: { seen: 0, caught: 0 },
      uncommon: { seen: 0, caught: 0 },
      rare: { seen: 0, caught: 0 },
      legendary: { seen: 0, caught: 0 },
      delta: { seen: 0, caught: 0 },
      shiny: { seen: 0, caught: 0 },
    },
  };
}

export function defaultMiniRun({ shinyCharm = false, balls = { poke: 15, great: 8, ultra: 4, master: 0 }, caps = {} } = {}) {
  const base = defaultSave();
  return {
    ...base,
    settings: {
      ...base.settings,
      shinyCharm: !!shinyCharm,

      // Mini runs are capped — no rewards regardless of main settings.
      ballOnCatch: false,
      ballOnDefeat: false,
      ballOnRelease: false,
      moveTokenOnRelease: false,
    },
    trainer: {
      ...defaultTrainer(),
      // Mini runs do not affect lifetime stats/achievements; still track streak within run UI.
      stats: {
        shinyCaught: 0,
        bestCatchStreak: 0,
      },
    },
    balls: { ...balls },
    moveTokens: 0,
    pokedex: {},
    caught: [],
    teamUids: [],
    activeTeamUid: null,

    miniRun: {
      id: `run_${Math.random().toString(36).slice(2)}_${Date.now()}`,
      createdAt: Date.now(),
      endedAt: null,
      gameOver: false,
      // caps: any combination can be enabled
      caps: {
        encountersLeft: (typeof caps.encountersLeft === 'number') ? Math.max(0, Math.floor(caps.encountersLeft)) : null,
        catchesLeft: (typeof caps.catchesLeft === 'number') ? Math.max(0, Math.floor(caps.catchesLeft)) : null,
      },
      capsInitial: {
        encountersLeft: (typeof caps.encountersLeft === 'number') ? Math.max(0, Math.floor(caps.encountersLeft)) : null,
        catchesLeft: (typeof caps.catchesLeft === 'number') ? Math.max(0, Math.floor(caps.catchesLeft)) : null,
      },
      ballsInitial: { ...balls },
    },
  };
}
