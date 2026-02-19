const KEY = 'pokemonCatcherSave_v2';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSave(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
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

trainer: {
  level: 1,
  totalXp: 0,
  // achievement flags
  dexMilestones: {}, // e.g. {50: {unlockedAt: 123}, ...}
},
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
