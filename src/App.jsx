// App.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getShowdownSpriteCandidates, cacheSpriteSuccess, SPRITE_CACHE_EVENT } from './spriteLookup.js';
import RarityBadge from './components/RarityBadge.jsx';
import GrassPatches from './components/GrassPatches.jsx';
import Pokedex from './components/Pokedex.jsx';
import TrainerProfile from './components/TrainerProfile.jsx';
import NewMiniRunModal from './components/NewMiniRunModal.jsx';
import MiniRunSummariesModal from './components/MiniRunSummariesModal.jsx';
import MiniRunSummaryModal from './components/MiniRunSummaryModal.jsx';
import MiniRunInfoModal from './components/MiniRunInfoModal.jsx';
import PokemonDetail from './components/PokemonDetail.jsx';
import { BALLS, SPECIAL_BALLS, getBallDef, calcCatchChance, computeBallEffect } from './balls.js';
import { rollRandomBiomeKey } from './biomes.js';
import { fetchPokemonBundleByDexId, toID } from './pokeapi.js';
import { defaultSave, defaultMiniRun, loadSave, saveSave, loadActiveMiniRun, saveActiveMiniRun, clearActiveMiniRun, loadMiniSummaries, saveMiniSummaries, addMiniSummary } from './storage.js';
import { getEvolutionOptions } from './evolution.js';
import { getRandomSpawnableDexId, getDexEntryByNum } from './dexLocal.js';
import { spriteFallbacksFromBundle } from './sprites.js';
import { getAllBaseDexEntries } from './dexLocal.js';
import { getDexById } from './dexLocal.js';


const BASE_SHINY_CHANCE = 1 / 500; // default: 1 in 500
const SHINY_STREAK_BONUS = 0.005; // +0.5% per consecutive catch
const MAX_SHINY_CHANCE = 0.05; // safety cap (5%)

import PokeballIcon from './components/PokeballIcon.jsx';
import PCBox from './components/PCBox.jsx';

import { pickWeightedRarity, rollBuffs, rollFusionBuffs, describeBuff, rollDelta, RARITIES, DELTA_BADGE } from './rarity.js';
import { getAllAbilities, rollAbility } from './abilityPool.js';
import { rollDeltaTypes } from './typePool.js';
import { pickUnique, uid } from './utils.js';
import { applyCatchProgress } from './trainer.js';

function capName(name) {
  if (!name) return '';
  return name
    .split('-')
    .map(s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s))
    .join(' ');
}

function useIsMobile(breakpointPx = 820) {
  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${breakpointPx}px)`).matches;
  });
  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [breakpointPx]);
  return isMobile;
}

export default function App() {
  const [mode, setMode] = useState('main'); // 'main' | 'mini' | 'runview'
  const [runViewId, setRunViewId] = useState(null);
  const mainSaveRef = useRef(null);
  const suppressPersistOnceRef = useRef(false);
  const saveRef = useRef(null);
  const miniEndLockRef = useRef(false);
  const miniLastEncounterRef = useRef(false); // true when the current encounter is the last allowed encounter in a mini-run
  const pendingMiniEndReasonRef = useRef(null); // 'Ran out of balls' etc (deferred until after throw outcome renders)


  function hydrateSave(loaded, base = defaultSave()) {
    if (!loaded) return base;
    return {
      ...base,
      ...loaded,
      balls: { ...base.balls, ...(loaded.balls ?? {}) },
      encounter: { ...base.encounter, ...(loaded.encounter ?? {}) },
      trainer: { ...base.trainer, ...(loaded.trainer ?? {}) },
      settings: { ...(base.settings ?? {}), ...(loaded.settings ?? {}) },
      specialBalls: {
        ...(base.specialBalls ?? {}),
        ...(loaded.specialBalls ?? {}),
        unlocked: { ...((base.specialBalls ?? {}).unlocked ?? {}), ...(((loaded.specialBalls ?? {}).unlocked) ?? {}) },
        equipped: Array.isArray((loaded.specialBalls ?? {}).equipped) ? (loaded.specialBalls.equipped) : ((base.specialBalls ?? {}).equipped ?? []),
      },
      favorites: Array.isArray(loaded.favorites) ? loaded.favorites.slice(0, 5) : (base.favorites ?? [null, null, null, null, null]),
      miniRun: loaded.miniRun ?? base.miniRun,
      // ensure pokedex bucket exists
      pokedex: { ...(base.pokedex ?? {}), ...(loaded.pokedex ?? {}) },
      caught: (loaded.caught ?? base.caught ?? []).map((m) => {
        const dexNum = m.dexId ?? m.dexNum ?? m.num ?? (typeof m.id === 'number' ? m.id : undefined);
        const formId =
          m.formId ??
          m.speciesId ??
          m.dexIdString ??
          m.dexIdPS ??
          (typeof m.dexId === 'string' ? m.dexId : null) ??
          toID(m.name);
        return {
          ...m,
          dexId: typeof dexNum === 'number' ? dexNum : m.dexId,
          formId: formId,
          speciesId: m.speciesId ?? formId,
          isDelta: !!(m.isDelta || m.delta),
        };
      }),
    };
  }

  const [save, setSave] = useState(() => hydrateSave(loadSave()));

  // wild encounter = full bundle + rarity info
  const [wild, setWild] = useState(null);

  // idle|loading|ready|throwing|caught|broke
  const [stage, setStage] = useState('idle');
  const [miniLastEncounter, setMiniLastEncounter] = useState(false);
  const [catchStreak, setCatchStreak] = useState(0);

  const [message, setMessage] = useState('');
  const [activeBall, setActiveBall] = useState(null);
  const [showPC, setShowPC] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [showBackpack, setShowBackpack] = useState(false);
  const [exchangeBallKey, setExchangeBallKey] = useState('premier');
  const [exchangeQty, setExchangeQty] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [miniStartPendingSpawn, setMiniStartPendingSpawn] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const [showNewRun, setShowNewRun] = useState(false);
  const [showMiniInfo, setShowMiniInfo] = useState(false);
  const [showRunSummaries, setShowRunSummaries] = useState(false);
  const [runSummaries, setRunSummaries] = useState(() => loadMiniSummaries());
  const [hasActiveMini, setHasActiveMini] = useState(() => !!loadActiveMiniRun());
  const [openSummary, setOpenSummary] = useState(null);
  const [summaryDetail, setSummaryDetail] = useState(null); // { summaryId, uid, index }
  // ✅ NEW: Pokedex modal state
  const [showDex, setShowDex] = useState(false);
  const [pickFavoriteSlot, setPickFavoriteSlot] = useState(null);
const fullDexList = useMemo(() => getAllBaseDexEntries(), []);

  // NEW: 3 hidden queued encounters behind grass
  const [grassSlots, setGrassSlots] = useState([]); // array length 3

  const isMobile = useIsMobile();

  // pity: 0..4 => multiplier 1..5
  const [pityFails, setPityFails] = useState(0);
  const pityMultiplier = Math.min(5, 1 + pityFails);

  const encounter = save.encounter ?? defaultSave().encounter;
  const settings = { ...(defaultSave().settings ?? {}), ...(save.settings ?? {}) };
  const trainer = { ...(defaultSave().trainer ?? {}), ...(save.trainer ?? {}) };


// keep exchange selection/qty valid as unlocks or token counts change
useEffect(() => {
  const unlocked = save?.specialBalls?.unlocked ?? {};
  const unlockedKeys = Object.entries(unlocked).filter(([, v]) => !!v).map(([k]) => String(k));
  if (unlockedKeys.length && !unlocked[exchangeBallKey]) {
    setExchangeBallKey(unlockedKeys[0]);
  }
  const maxQty = Math.floor((save?.moveTokens ?? 0) / 10);
  setExchangeQty(q => {
    const next = Math.max(1, Math.floor(Number(q || 1)));
    return maxQty > 0 ? Math.min(next, maxQty) : 1;
  });
}, [save?.specialBalls?.unlocked, save?.moveTokens]);


  function updateSetting(key, value) {
    setSave(prev => {
      const base = defaultSave();
      const nextSettings = { ...(base.settings ?? {}), ...(prev.settings ?? {}) };
      nextSettings[key] = value;
      return { ...prev, settings: nextSettings };
    });
  }

  function resetBallsToDefault() {
    const base = defaultSave();
    setSave(prev => ({ ...prev, balls: { ...(base.balls ?? {}) } }));
  }

  function resetEncounterTotalsOnly() {
    const base = defaultSave();
    setSave(prev => ({ ...prev, encounter: { ...(base.encounter ?? {}) } }));
  }

  function confirmResetEncounterTotalsOnly() {
    const ok = window.confirm('Reset encounter totals? This only resets the totals in this tracker and will not affect your Pokédex, PC Box, balls, or settings.');
    if (!ok) return;
    resetEncounterTotalsOnly();
  }



  function resetPCBox() {
    setSave(prev => {
      const caught = Array.isArray(prev.caught) ? prev.caught : [];
      const locked = caught.filter(m => !!m.locked);
      const lockedUids = new Set(locked.map(m => m.uid));
      const teamUids = Array.isArray(prev.teamUids) ? prev.teamUids.filter(uid => lockedUids.has(uid)) : [];
      const activeTeamUid = teamUids.includes(prev.activeTeamUid) ? prev.activeTeamUid : (teamUids[0] ?? null);
      return { ...prev, caught: locked, teamUids, activeTeamUid };
    });
  }

  function toggleLockPokemon(uid) {
    setSave(prev => {
      const caught = Array.isArray(prev.caught) ? prev.caught : [];
      const idx = caught.findIndex(m => m.uid === uid);
      if (idx < 0) return prev;
      const next = caught.slice();
      next[idx] = { ...next[idx], locked: !next[idx].locked };
      return { ...prev, caught: next };
    });
  }


  // --- Buff helpers (active/team bonuses) ---
  function getBuffTotalsFromMons(mons, activeUid) {
    let catchPct = 0;
    // Shiny buffs are multiplicative now (e.g. 1.25x). Start at 1.0.
    let shinyMult = 1;
    let rarityPct = 0;
    let koBallPct = 0;

    for (const m of mons || []) {
      const bs = Array.isArray(m?.buffs) ? m.buffs : (m?.buff ? [m.buff] : []);
      for (const b of bs) {
        if (!b || !b.kind) continue;

        // team buffs apply if mon is on team
        if (b.kind === 'catch-team') catchPct += (b.pct ?? 0);
        if (b.kind === 'shiny-team') shinyMult *= (b.mult ?? 1);
        if (b.kind === 'rarity-team') rarityPct += (b.pct ?? 0);

        // active-only buffs apply only for the active mon
        if (m?.uid === activeUid) {
          if (b.kind === 'catch-active') catchPct += (b.pct ?? 0);
          if (b.kind === 'shiny-active') shinyMult *= (b.mult ?? 1);
          if (b.kind === 'rarity-active') rarityPct += (b.pct ?? 0);
          if (b.kind === 'ko-ball-active') koBallPct += (b.pct ?? 0);
          if (b.kind === 'boost-all-active') {
            catchPct += (b.catchPct ?? 0);
            // Legacy field is shinyPct (%). Treat as multiplier: +5% => 1.05x.
            const pct = (b.shinyPct ?? 0);
            shinyMult *= (1 + pct / 100);
            rarityPct += (b.rarityPct ?? 0);
          }
        }
      }
    }
    return { catchPct, shinyMult, rarityPct, koBallPct };
  }

  function applyRarityBoost(rarityObj, rarityBoostPct, rng = Math.random) {
    const order = ['common', 'uncommon', 'rare', 'legendary'];
    let key = rarityObj?.key ?? 'common';
    let i = order.indexOf(key);
    if (i < 0) i = 0;

    // Allow a small chance to "upgrade" the rolled rarity.
    // Multiple steps are possible but diminishing (prevents jumping too far too often).
    let p = Math.max(0, rarityBoostPct) / 100;
    while (p > 0 && i < order.length - 1) {
      if (rng() < p) {
        i++;
        p *= 0.5;
      } else {
        break;
      }
    }
    const newKey = order[i];
    return RARITIES.find(r => r.key === newKey) ?? rarityObj;
  }

  function formatBuffsShort(buffs) {
    const arr = Array.isArray(buffs) ? buffs : [];
    const parts = arr.map(describeBuff).filter(Boolean);
    return parts.length ? parts.join(' • ') : 'none';
  }
  // Team (up to 3) and battle-assist state (per encounter)
  const teamUids = Array.isArray(save.teamUids) ? save.teamUids.slice(0, 3) : [];
  const activeTeamUid = save.activeTeamUid ?? (teamUids[0] ?? null);

  const teamMons = useMemo(() => {
    const map = new Map((save.caught ?? []).map(m => [m.uid, m]));
    return teamUids.map(u => map.get(u)).filter(Boolean).map(m => ({ ...m, name: capName(m.name) }));
  }, [save.caught, save.teamUids]);

  const activeMon = useMemo(
    () => teamMons.find(m => m.uid === activeTeamUid) ?? teamMons[0] ?? null,
    [teamMons, activeTeamUid]
  );

  // Encounter UI helper: compute whether the current wild is new (species/rarity/shiny/delta).
  const wildProgress = useMemo(() => {
    if (!wild) {
      return {
        baseNum: undefined,
        baseId: undefined,
        entry: {},
        rarityKey: undefined,
        hasSpecies: false,
        hasRarity: false,
        hasShiny: false,
        hasDelta: false,
      };
    }
    // Resolve base species as robustly as possible without touching spawn/form/sprite logic.
    // Some bundles prefer string dexId (form-ish) even when a numeric dex num exists, so we
    // try multiple identifiers until we can resolve a numeric baseNum.
    const idCandidates = [
      wild.num,
      wild.dexNum,
      wild.id,
      wild.dexId,
      wild.formId,
      wild.speciesId,
      wild.name,
    ].filter(v => v !== null && v !== undefined && String(v).trim() !== '');

    let baseNum;
    let baseId;
    for (const cand of idCandidates) {
      const info = getBaseDexInfoFromAny(cand);
      baseNum = info.baseNum;
      baseId = info.baseId;
      if (typeof baseNum === 'number') break;
    }

    // Final fallback: if we only got a baseId, try to resolve its dex number.
    if (typeof baseNum !== 'number' && baseId) {
      try {
        const e = getDexById({ id: baseId });
        if (e?.num) baseNum = e.num;
      } catch {}
    }

    const entry = (typeof baseNum === 'number') ? (save?.pokedex?.[String(baseNum)] || {}) : {};
    const rarityKey = wild?.rarity;

    const hasSpecies = (entry.caught ?? 0) > 0;
    const hasRarity = !!(rarityKey && entry?.rarityCaught && entry.rarityCaught[rarityKey]);
    const hasShiny = !!(entry.shinyCaught ?? 0);
    const hasDelta = !!(entry.deltaCaught ?? 0);

    return { baseNum, baseId, entry, rarityKey, hasSpecies, hasRarity, hasShiny, hasDelta };
  }, [wild, save?.pokedex]);

  // Encounter status badge (single badge):
  // - Gray NEW: never caught this species
  // - Yellow NEW: species caught, but something about this encounter is new (rarity/delta/shiny)
  // - Green CAUGHT: already caught this exact combo (rarity + delta/shiny flags)
  const encounterStatus = useMemo(() => {
    if (!wild) return null;

    const isNewSpecies = !wildProgress.hasSpecies;
    const isNewSomething = wildProgress.hasSpecies && (
      (wildProgress.rarityKey && !wildProgress.hasRarity) ||
      (wild?.shiny && !wildProgress.hasShiny) ||
      (wild?.isDelta && !wildProgress.hasDelta)
    );

    if (isNewSpecies) {
      return { label: 'NEW', title: 'New species (never caught before)', cls: 'new' };
    }
    if (isNewSomething) {
      return { label: 'NEW', title: 'New variant (rarity/delta/shiny not caught yet)', cls: 'new-variant' };
    }
    return { label: 'CAUGHT', title: 'Already caught', cls: 'caught' };
  }, [wild, wildProgress]);


  // Per-encounter move usage + catch bonus from attacks
  const [moveUsedByUid, setMoveUsedByUid] = useState(() => ({})); // { [uid]: boolean[4] }
  const [attackBonus, setAttackBonus] = useState(0);
  const [attackAnim, setAttackAnim] = useState(null); // {id, amount}
  const [movesUsedSinceThrow, setMovesUsedSinceThrow] = useState(0);
  const [ballsThrownThisEncounter, setBallsThrownThisEncounter] = useState(0);
  // Total attacks allowed per encounter across the whole team
  const [attacksLeft, setAttacksLeft] = useState(4);

  const usedMoves = activeMon ? (moveUsedByUid[activeMon.uid] ?? [false, false, false, false]) : [false, false, false, false];
  const monMovesUsedCount = usedMoves.filter(Boolean).length;
  const nextKoChance = [0.05, 0.15, 0.25, 0.45][Math.min(3, movesUsedSinceThrow)] ?? 0.45;

  function setTeamUids(nextUids) {
    const uniq = Array.from(new Set(nextUids)).slice(0, 3);
    setSave(prev => ({
      ...prev,
      teamUids: uniq,
      activeTeamUid: prev.activeTeamUid && uniq.includes(prev.activeTeamUid) ? prev.activeTeamUid : (uniq[0] ?? null),
    }));
  }

  function toggleTeam(uidToToggle) {
    const cur = Array.isArray(save.teamUids) ? save.teamUids : [];
    if (cur.includes(uidToToggle)) {
      setTeamUids(cur.filter(u => u !== uidToToggle));
    } else {
      if (cur.length >= 3) return;
      setTeamUids([...cur, uidToToggle]);
    }
  }

  function setActiveTeam(uidToActivate) {
    setSave(prev => ({ ...prev, activeTeamUid: uidToActivate }));
  }
function todayKey() {
  // local date, stable across refreshes (YYYY-MM-DD)
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function setFusionSpriteChoice(uid, choice) {
  if (!uid) return;
  setSave(prev => {
    const caught = (prev.caught || []).map(p => {
      if (p.uid !== uid) return p;
      return { ...p, fusionSpriteChoice: choice };
    });
    return { ...prev, caught };
  });
}

function markPokedexCaught(baseIdRaw, { shiny = false } = {}) {
  const baseId = toID(baseIdRaw);
  if (!baseId) return;

  setSave(prev => {
    const nextPokedex = { ...(prev.pokedex ?? {}) };
    const cur = nextPokedex[baseId] ?? {};
    const next = { ...cur };

    next.seen = Math.max(next.seen ?? 0, 1);
    next.caught = Math.max(next.caught ?? 0, 1);
    if (shiny) next.shinyCaught = Math.max(next.shinyCaught ?? 0, 1);

    nextPokedex[baseId] = next;
    return { ...prev, pokedex: nextPokedex };
  });
}

function grantDailyGiftIfAvailable() {
  const key = todayKey();
  let claimed = false;

  setSave(prev => {
    const last = prev.lastDailyGiftKey || null;
    if (last === key) return prev;

    claimed = true;

    const balls = { ...(prev.balls ?? {}) };
    balls.poke = (balls.poke ?? 0) + 10;
    balls.great = (balls.great ?? 0) + 10;
    balls.ultra = (balls.ultra ?? 0) + 10;
    balls.master = (balls.master ?? 0) + 1;

    // +10 random unlocked special balls
    const unlocked = prev.specialBalls?.unlocked ?? {};
    const unlockedKeys = Object.entries(unlocked).filter(([, v]) => !!v).map(([k]) => String(k));
    for (let i = 0; i < 10; i++) {
      if (!unlockedKeys.length) break;
      const k = unlockedKeys[Math.floor(Math.random() * unlockedKeys.length)];
      balls[k] = (balls[k] ?? 0) + 1;
    }

    return { ...prev, balls, lastDailyGiftKey: key };
  });

  // NOTE: claimed won't reliably reflect inside setSave due to async batching,
  // so do it a cleaner way by reading current save:
  const already = (save.lastDailyGiftKey || null) === key;
  if (already) {
    setMessage('Daily Gift already claimed today.');
  } else {
    setMessage('Daily Gift claimed: +10 Poké, +10 Great, +10 Ultra, +1 Master, +10 random unlocked Special Balls!');
  }
}

function exchangeMoveTokensForSpecialBalls(ballKey, qty) {
  const key = String(ballKey || '');
  const n = Math.max(1, Math.floor(Number(qty || 0)));
  setSave(prev => {
    const tokens = prev.moveTokens ?? 0;
    const unlocked = prev.specialBalls?.unlocked ?? {};
    if (!unlocked[key]) return prev;
    const maxQty = Math.floor(tokens / 10);
    if (maxQty <= 0) return prev;
    const take = Math.min(maxQty, n);
    const balls = { ...(prev.balls ?? {}) };
    balls[key] = (balls[key] ?? 0) + take;
    return { ...prev, moveTokens: tokens - (take * 10), balls };
  });
}



  function resetEncounterAssist() {
    setAttackBonus(0);
    setMoveUsedByUid({});
    setAttackAnim(null);
    setMovesUsedSinceThrow(0);
    setBallsThrownThisEncounter(0);
    setAttacksLeft(4);
  }

  function pickRandomBallKey() {
    const r = Math.random();
    return r < 0.05 ? 'master' : r < 0.20 ? 'ultra' : r < 0.45 ? 'great' : 'poke';
  }

  function awardRandomBall() {
    const key = pickRandomBallKey();
    setSave(prev => ({
      ...prev,
      balls: { ...prev.balls, [key]: (prev.balls?.[key] ?? 0) + 1 },
    }));
    return key;
  }

  function replaceMoveWithToken(uid, slotIndex, moveDisplay) {
    if (uid === null || uid === undefined) return;
    setSave(prev => {
      const tokens = prev.moveTokens ?? 0;
      if (tokens <= 0) return prev;
      const nextCaught = (prev.caught ?? []).map(m => {
        if (m.uid !== uid) return m;
        const moves = (m.moves ?? []).slice(0, 4);
        const next = { kind: 'token', id: moveDisplay.id, name: moveDisplay.name, meta: moveDisplay.meta };
        moves[slotIndex] = next;
        return { ...m, moves };
      });
      return { ...prev, moveTokens: Math.max(0, tokens - 1), caught: nextCaught };
    });
  }

  function releasePokemon(uid) {
    setSave(prev => {
      const caught = Array.isArray(prev.caught) ? prev.caught : [];
      const idx = caught.findIndex(m => m.uid === uid);
      if (idx < 0) return prev;


      if (caught[idx]?.locked) {
        // Locked Pokémon cannot be released except via full reset.
        setMessage('That Pokémon is locked. Unlock it in the detail screen to release.');
        return prev;
      }

      const base = defaultSave();
      const curSettings = { ...(base.settings ?? {}), ...(prev.settings ?? {}) };

      const balls = { ...(prev.balls ?? {}) };
      if (mode !== 'mini' && curSettings.ballOnRelease) {
        const ballKey = pickRandomBallKey();
        balls[ballKey] = (balls[ballKey] ?? 0) + 1;
      }

      const moveTokens = curSettings.moveTokenOnRelease ? ((prev.moveTokens ?? 0) + 1) : (prev.moveTokens ?? 0);

      // Fusion tokens are earned by releasing Legendary-tier Pokémon (enabled in mini-runs too)
      const fusionTokens = (String(caught[idx]?.rarity || '').toLowerCase() === 'legendary')
        ? ((prev.fusionTokens ?? 0) + 1)
        : (prev.fusionTokens ?? 0);
      const pendingFusionToken = !!(prev.pendingFusionToken);

      const nextCaught = caught.slice(0, idx).concat(caught.slice(idx + 1));
      const teamUids = Array.isArray(prev.teamUids) ? prev.teamUids.filter(x => x !== uid) : [];
      const activeTeamUid = teamUids.includes(prev.activeTeamUid) ? prev.activeTeamUid : (teamUids[0] ?? null);

      return { ...prev, balls, moveTokens, fusionTokens, pendingFusionToken, caught: nextCaught, teamUids, activeTeamUid };
    });
  }


  function releaseManyPokemon(uids) {
    const uidSet = new Set((uids || []).filter(Boolean));
    if (!uidSet.size) return;

    setSave(prev => {
      const caught = Array.isArray(prev.caught) ? prev.caught : [];
      if (!caught.length) return prev;

      const base = defaultSave();
      const curSettings = { ...(base.settings ?? {}), ...(prev.settings ?? {}) };

      const balls = { ...(prev.balls ?? {}) };
      let moveTokens = prev.moveTokens ?? 0;
      let fusionTokens = prev.fusionTokens ?? 0;
      const pendingFusionToken = !!(prev.pendingFusionToken);

      const remaining = [];
      let removed = 0;
      let removedLocked = 0;

      for (const m of caught) {
        if (!m || !uidSet.has(m.uid)) {
          remaining.push(m);
          continue;
        }
        if (m.locked) {
          removedLocked++;
          remaining.push(m);
          continue;
        }
        removed++;
        // Fusion tokens are earned by releasing Legendary-tier Pokémon (enabled in mini-runs too)
        if (String(m?.rarity || '').toLowerCase() === 'legendary') fusionTokens += 1;

        if (mode !== 'mini' && curSettings.ballOnRelease) {
          const ballKey = pickRandomBallKey();
          balls[ballKey] = (balls[ballKey] ?? 0) + 1;
        }
        if (mode !== 'mini' && curSettings.moveTokenOnRelease) {
          moveTokens += 1;
        }
      }

      // Remove from team if released
      const teamUids = Array.isArray(prev.teamUids) ? prev.teamUids.filter(x => remaining.some(m => m.uid === x)) : [];
      const activeTeamUid = teamUids.includes(prev.activeTeamUid) ? prev.activeTeamUid : (teamUids[0] ?? null);

      if (removedLocked > 0 && removed === 0) {
        setMessage('All selected Pokémon are locked.');
      } else if (removed > 0) {
        setMessage(removedLocked > 0 ? `Released ${removed} Pokémon. (${removedLocked} locked skipped.)` : `Released ${removed} Pokémon.`);
      }

      return { ...prev, balls, moveTokens, fusionTokens, pendingFusionToken, caught: remaining, teamUids, activeTeamUid };
    });
  }

  function startFusion(uid) {
    setSave(prev => {
      const have = Number(prev.fusionTokens ?? 0) || 0;
      if (have <= 0) return prev;
      // consume 1 token; refundable until confirm
      return { ...prev, fusionTokens: have - 1, pendingFusionToken: true };
    });
  }

  function cancelFusion() {
    setSave(prev => {
      if (!prev.pendingFusionToken) return prev;
      return { ...prev, fusionTokens: (prev.fusionTokens ?? 0) + 1, pendingFusionToken: false };
    });
  }

  
  // DEBUG: One-time "refresh" to normalize older saved Pokémon records after big balance/feature changes.
  // You can delete this entire function + the PC Box refresh button once you're done.
  function refreshAllCaughtDebug() {
    if (!window.confirm(
  `Refresh ALL saved Pokémon?

This recalculates derived fields (final stats, badges, missing buff fields, and fusion display names when metadata exists).

This will NOT reroll buffs. Continue?`
)) return;

    const TEAM_KO_PCT_BY_RARITY = {common: 15, uncommon: 25, rare: 40, legendary: 60};
    const ACTIVE_KO_PCT_BY_RARITY = {common: 25, uncommon: 35, rare: 50, legendary: 80};

    setSave(prev => {
      const caught = Array.isArray(prev.caught) ? prev.caught : [];
      const nextCaught = caught.map(mon => {
        if (!mon || typeof mon !== 'object') return mon;

        const rarityKey = String(mon.rarity || '').toLowerCase();
        const rarity = (RARITIES.find(r => r.key === rarityKey)?.key) ? rarityKey : (rarityKey || 'common');
        const badge = (RARITIES.find(r => r.key === rarity)?.badge) ?? mon.badge;

        // Normalize buffs (fill missing pct fields for KO ball buffs if present)
        const buffs = Array.isArray(mon.buffs) ? mon.buffs.map(b => ({...b})) : [];
        for (const b of buffs) {
          if (!b || typeof b !== 'object') continue;
          if (b.kind === 'ko-ball-team' && (b.pct == null || Number.isNaN(Number(b.pct)))) b.pct = TEAM_KO_PCT_BY_RARITY[rarity] ?? 0;
          if (b.kind === 'ko-ball-active' && (b.pct == null || Number.isNaN(Number(b.pct)))) b.pct = ACTIVE_KO_PCT_BY_RARITY[rarity] ?? 0;
        }

        // Repair fusion metadata & keep base name in `name` (UI renders "Base / Other").
        // NOTE: We intentionally do NOT bake the slash into `name`, because PCBox/PokemonDetail
        // will append the partner name when `fusionOtherName` exists.
        let name = mon.name;
        let fusionBaseName = mon.fusionBaseName;
        let fusionOtherName = mon.fusionOtherName || mon.fusionPartnerName;

        if (mon.isFusion) {
          // If older builds baked "Base / Other" into `name`, split it once.
          if (typeof name === 'string' && name.includes(' / ') && !fusionOtherName) {
            const parts = name.split(' / ');
            if (parts.length >= 2) {
              fusionBaseName = fusionBaseName || parts[0].trim();
              fusionOtherName = fusionOtherName || parts.slice(1).join(' / ').trim();
              name = fusionBaseName || parts[0].trim();
            }
          }

          // If we have partner metadata but name is still the full combined string, normalize.
          if (fusionBaseName && fusionOtherName && typeof name === 'string' && name.includes(' / ')) {
            name = fusionBaseName;
          }
          // If we only know the partner, treat current name as base.
          if (!fusionBaseName && fusionOtherName) fusionBaseName = name;
        }

        // Recompute finalStats from baseStats + buffs
        const baseStats = mon.baseStats && typeof mon.baseStats === 'object' ? {...mon.baseStats} : null;
        let finalStats = mon.finalStats && typeof mon.finalStats === 'object' ? {...mon.finalStats} : null;
        let superChangedStats = mon.superChangedStats;

        if (baseStats) {
          const res = applyStatBuffs(baseStats, buffs, Math.random);
          finalStats = res.stats;
          superChangedStats = res.superChangedStats;

          // Re-apply shiny boost
          if (mon.shiny) {
            let shinyBoostStat = mon.shinyBoostStat;
            const keys = ['hp','atk','def','spa','spd','spe'];
            if (!shinyBoostStat || !keys.includes(shinyBoostStat)) {
              let minVal = Infinity;
              for (const k of keys) {
                const v = finalStats?.[k];
                if (typeof v === 'number') minVal = Math.min(minVal, v);
              }
              const mins = keys.filter(k => typeof finalStats?.[k] === 'number' && finalStats[k] === minVal);
              shinyBoostStat = mins.length ? mins[Math.floor(Math.random() * mins.length)] : 'hp';
            }
            finalStats = {...finalStats, [shinyBoostStat]: (finalStats?.[shinyBoostStat] ?? 0) + 50};
            return {
              ...mon,
              rarity,
              badge,
              buffs,
              name,
              fusionBaseName,
              fusionOtherName,
              baseStats,
              finalStats,
              superChangedStats,
              shinyBoostStat,
            };
          }
        }

        return {
          ...mon,
          rarity,
          badge,
          buffs,
          name,
          fusionBaseName,
          fusionOtherName,
          baseStats: baseStats ?? mon.baseStats,
          finalStats,
          superChangedStats,
        };
      });

      return {...prev, caught: nextCaught};
    });
  }

function confirmFusion(uidA, uidB) {
    setSave(prev => {
      const caught = Array.isArray(prev.caught) ? prev.caught : [];
      const a = caught.find(m => m?.uid === uidA);
      const b = caught.find(m => m?.uid === uidB);
      if (!a || !b) return { ...prev, pendingFusionToken: false };
      if (a.uid === b.uid) return { ...prev, pendingFusionToken: false };

      // Determine offspring shiny chance
      const aSh = !!a.shiny;
      const bSh = !!b.shiny;
      let shinyChance = 0.01;
      if (aSh && bSh) shinyChance = 1.0;
      else if (aSh || bSh) shinyChance = 0.50;
      const isShiny = Math.random() < shinyChance;

      // Rarity inheritance
      const tiers = ['common','uncommon','rare','legendary'];
      const aR = String(a.rarity || '').toLowerCase();
      const bR = String(b.rarity || '').toLowerCase();
      const highestIdx = Math.max(
  tiers.indexOf(aR),
  tiers.indexOf(bR)
);
      let rarity = aR;
      let rolledUpgrade = false;
      let cannotUpgradeBonus = false;
      if (aR === bR) {
        rarity = aR;
        const idx = tiers.indexOf(rarity);
        if (Math.random() < 0.05) {
          rolledUpgrade = true;
          if (idx >= 0 && idx < tiers.length - 1) {
            rarity = tiers[idx + 1];
          } else {
            // can't increase (already top tier) => +10 to all base stats
            cannotUpgradeBonus = true;
            rarity = aR;
          }
        }
      } else {
        rarity = tiers[Math.max(0, highestIdx - 1)];
      }

      // Choose orientation to maximize BST (base provides typing + 2 moves + 3 stats)
      function bestSplitStats(baseMon, otherMon) {
        const keys = ['hp','atk','def','spa','spd','spe'];
        const A = baseMon.baseStats || {};
        const B = otherMon.baseStats || {};
        // pick 3 stats for A with largest (A-B)
        const diffs = keys.map(k => ({ k, d: (A[k] ?? 0) - (B[k] ?? 0) }));
        diffs.sort((x,y) => y.d - x.d);
        const takeA = new Set(diffs.slice(0,3).map(x => x.k));
        const out = {};
        for (const k of keys) out[k] = takeA.has(k) ? (A[k] ?? 0) : (B[k] ?? 0);
        const bst = keys.reduce((t,k) => t + (out[k] ?? 0), 0);
        return { baseUid: baseMon.uid, otherUid: otherMon.uid, takeA, out, bst };
      }

      const opt1 = bestSplitStats(a, b);
      const opt2 = bestSplitStats(b, a);
      let base = a, other = b, split = opt1;
      if (opt2.bst > opt1.bst || (opt2.bst === opt1.bst && Math.random() < 0.5)) {
        base = b; other = a; split = opt2;
      }

      // Build fused baseStats
      let fusedBaseStats = { ...split.out };
      if (cannotUpgradeBonus) {
        for (const k of ['hp','atk','def','spa','spd','spe']) {
          fusedBaseStats[k] = (fusedBaseStats[k] ?? 0) + 10;
        }
      }

      // Moves: 2 from base, 2 from other
      function pickMoves(mon, n) {
        const ms = Array.isArray(mon.moves) ? mon.moves : [];
        const copy = ms.slice();
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.slice(0, n);
      }
      const m1 = pickMoves(base, 2);
      const m2 = pickMoves(other, 2);
      const fusedMoves = [...m1, ...m2].slice(0, 4);

      // Ability from other
      const ability = other.ability ?? base.ability;

      // Delta guarantee
      const baseTypes = Array.isArray(base.types) ? base.types : [];
      const otherTypes = Array.isArray(other.types) ? other.types : [];
      const hasDeltaParent = !!(base.isDelta || other.isDelta);
      const isDelta = hasDeltaParent ? true : false;
      // Delta fusion typing: allow mono OR dual typings (random). Delta ignores normal "take 1 type from each parent" rule.
      // Roll 1 or 2 new types that do not match either parent's current types.
      const types = (() => {
        if (!isDelta) {
          // Non-delta fusion: take 1 random type from each parent (prefer distinct) => always dual type when possible.
          const pick = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);
          const t1 = pick(baseTypes) ?? pick(otherTypes) ?? 'normal';
          let t2 = pick(otherTypes) ?? pick(baseTypes) ?? 'normal';
          // try to make them distinct
          let guard = 0;
          while (t2 === t1 && guard++ < 20) {
            t2 = pick(otherTypes) ?? pick(baseTypes) ?? t2;
          }
          // If still same, fall back to mono
          return t2 && t2 !== t1 ? [t1, t2] : [t1];
        }
        const banned = new Set([...baseTypes, ...otherTypes].map(t => String(t).toLowerCase()));
        const ALL = [
          'normal','fire','water','electric','grass','ice','fighting','poison','ground',
          'flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'
        ];
        const pool = ALL.filter(t => !banned.has(t));
        const safePool = pool.length ? pool : ALL;
        const t1 = safePool[Math.floor(Math.random() * safePool.length)];
        // 50% mono / 50% dual
        if (Math.random() < 0.5) return [t1];
        let t2 = safePool[Math.floor(Math.random() * safePool.length)];
        let guard = 0;
        while (t2 === t1 && guard++ < 20) {
          t2 = safePool[Math.floor(Math.random() * safePool.length)];
        }
        return [t1, t2];
      })();

      // Roll buffs for the fused mon based on resulting rarity
      const rollBase = {
        baseStats: fusedBaseStats,
        rarity,
      };
      const buffsRolled = rollFusionBuffs(rarity, rollBase, Math.random);

      // Super-rare stat buffs (blue sparkle) should always transfer from parents into the fusion.
      const parentSuper = []
        .concat(Array.isArray(a?.buffs) ? a.buffs : [])
        .concat(Array.isArray(b?.buffs) ? b.buffs : [])
        .filter(x => x && x.superRare);

      const dedupeKey = (x) => JSON.stringify({
        kind: x.kind,
        stat: x.stat,
        stats: x.stats,
        amount: x.amount,
        mult: x.mult,
        superRare: !!x.superRare,
      });

      const seen = new Set();
      const buffs = [];
      for (const x of buffsRolled) {
        const k = dedupeKey(x);
        if (seen.has(k)) continue;
        seen.add(k);
        buffs.push(x);
      }
      for (const x of parentSuper) {
        const k = dedupeKey(x);
        if (seen.has(k)) continue;
        seen.add(k);
        buffs.push(x);
      }

      const { stats: finalStats, superChangedStats } = applyStatBuffs(fusedBaseStats, buffs);

      // Shiny boost (+50 to lowest final stat)
      let shinyBoostStat = null;
      if (isShiny) {
        const keys = ['hp','atk','def','spa','spd','spe'];
        let minVal = Infinity;
        for (const k of keys) {
          const v = finalStats?.[k];
          if (typeof v === 'number') minVal = Math.min(minVal, v);
        }
        const mins = keys.filter(k => typeof finalStats?.[k] === 'number' && finalStats[k] === minVal);
        const pick = mins.length ? mins[Math.floor(Math.random() * mins.length)] : 'hp';
        shinyBoostStat = pick;
        finalStats[pick] = (finalStats[pick] ?? 0) + 50;
      }

      // Create fused record (keeps base species identity)
      const fusionStatKeys = ['hp','atk','def','spa','spd','spe'];
      const statsFromOther = fusionStatKeys.filter(k => !split.takeA.has(k));
      const fused = {
        uid: uid('c'),
        dexId: base.dexId,
        formId: base.formId,
        speciesId: base.speciesId ?? base.formId,
        // Keep base name in `name`; UI appends " / Other" when fusionOtherName exists.
        name: base.name,
        fusionBaseName: base.name,
        fusionOtherName: other.name,
        fusionMeta: {
          // used for green stat coloring in PokemonDetail
          statsFromOther,
          // used for fusion sprite lookups (Pokeathlon numbering map + fallbacks)
          baseFormId: base.formId,
          otherFormId: other.formId,
          baseDexId: base.dexId,
          otherDexId: other.dexId,
        },
        rarity,
        badge: (RARITIES?.find(r => r?.key === rarity)?.badge) ?? base.badge,
        buffs,
        spriteUrl: base.spriteUrl,
        shiny: isShiny,
        isDelta,
        isFusion: true,
        shinyBoostStat,
        baseStats: fusedBaseStats,
        finalStats,
        superChangedStats,
        types,
        ability,
        moves: fusedMoves,
        caughtBall: base.caughtBall ?? null,
        caughtAt: Date.now(),
        fusedFrom: [a.uid, b.uid],
      };

      // Remove parents, add child
      const nextCaught = caught.filter(m => m?.uid !== a.uid && m?.uid !== b.uid);
      nextCaught.unshift(fused);

      // Team handling: remove parents from team; child not auto-added
      const teamUids = Array.isArray(prev.teamUids) ? prev.teamUids.filter(x => x !== a.uid && x !== b.uid) : [];
      const activeTeamUid = teamUids.includes(prev.activeTeamUid) ? prev.activeTeamUid : (teamUids[0] ?? null);

      return { ...prev, caught: nextCaught, teamUids, activeTeamUid, pendingFusionToken: false };
    });
  }


    function setFusionSpriteChoice(uid, choice) {
    setSave(prev => {
      const caught = Array.isArray(prev.caught) ? prev.caught : [];
      if (!caught.length) return prev;
      const next = caught.map(m => {
        if (!m || m.uid !== uid) return m;
        return { ...m, fusionSpriteChoice: choice };
      });
      return { ...prev, caught: next };
    });
  }

function setLockManyPokemon(uids, locked) {
    const uidSet = new Set((uids || []).filter(Boolean));
    if (!uidSet.size) return;

    setSave(prev => {
      const caught = Array.isArray(prev.caught) ? prev.caught : [];
      if (!caught.length) return prev;

      const next = caught.map(m => {
        if (!m || !uidSet.has(m.uid)) return m;
        return { ...m, locked: !!locked };
      });
      return { ...prev, caught: next };
    });
  }

  // (you still have a duplicate awardRandomBall below in your original file;
  // leaving it untouched to avoid changing unrelated behavior)

  function advanceActiveTeam() {
    if (!teamUids.length) return;
    const idx = Math.max(0, teamUids.indexOf(activeTeamUid));
    for (let step = 1; step <= teamUids.length; step++) {
      const next = teamUids[(idx + step) % teamUids.length];
      if (next) {
        setActiveTeam(next);
        return;
      }
    }
  }

  function pityAdjustedCaptureRate(base, fails) {
    if (typeof base !== 'number') return base;
    if (base > 100) return base;
    const f = Math.max(0, Math.min(4, fails));
    if (f === 0) return base;
    if (base <= 10) {
      return Math.min(100, Math.round(base * (2 ** f)));
    }
    const frac = [0, 0.18, 0.55, 0.73, 1.0][f] ?? 1.0;
    const out = Math.round(base + (100 - base) * frac);
    return Math.max(base, Math.min(100, out));
  }

  function currentEffectiveCaptureRate() {
    if (!wild) return 0;
    const pityRate0 = pityAdjustedCaptureRate(wild.captureRate, pityFails);
    const totals = getBuffTotalsFromMons(teamMons, activeTeamUid);
    const pityRate = Math.min(255, pityRate0 * (1 + (totals.catchPct / 100)));
    const total = Math.min(255, Math.round(pityRate + attackBonus));
    return { pityRate, total };
  }

  async function useAssistMove(moveIndex) {
    if (!wild || stage !== 'ready') return;
    if (!activeMon) {
      setMessage('Add a Pokémon to your team in the PC to use moves.');
      return;
    }
    if (attacksLeft <= 0) {
      setMessage('No attacks left this encounter.');
      return;
    }
    const used = (moveUsedByUid[activeMon.uid] ?? [false, false, false, false]).slice();
    if (used[moveIndex]) return;

    const amount = 1 + Math.floor(Math.random() * 30);
    setAttackBonus(prev => prev + amount);
    setAttackAnim({ id: uid(), amount });

    // Mark move used
    used[moveIndex] = true;
    setMoveUsedByUid(prev => ({ ...prev, [activeMon.uid]: used }));

    // Spend one of the 4 total attacks for this encounter
    setAttacksLeft(prev => Math.max(0, prev - 1));

    // KO roll
    const idx = Math.min(3, movesUsedSinceThrow);
    const koChance = [0.05, 0.15, 0.25, 0.45][idx] ?? 0.45;
    const ko = Math.random() < koChance;
    setMovesUsedSinceThrow(prev => prev + 1);

    if (ko) {
      let rewardText = '';
      if (settings.ballOnDefeat) {
        const ballKey = awardRandomBall();
        rewardText = ` You found a ${capName(ballKey)} ball!`;
      }

      // Extra KO-ball chance from active/team buffs (independent of the guaranteed defeat reward setting)
      const totals = getBuffTotalsFromMons(teamMons, activeTeamUid);
      if (totals.koBallPct > 0 && Math.random() < (totals.koBallPct / 100)) {
        const ballKey2 = awardRandomBall();
        rewardText += rewardText ? ` Also found a ${capName(ballKey2)} ball!` : ` You found a ${capName(ballKey2)} ball!`;
      }
      setMessage(`Oh no! ${capName(wild.name)} was KO'd.${rewardText}`);
      advanceActiveTeam();
      setPityFails(0);
      setCatchStreak(0);
      setAttacksLeft(4);
      window.setTimeout(() => {
        resetEncounterAssist();
        spawn();
      }, 900);
    }
  }

  // Build list for PC
  const caughtList = useMemo(() => {
    const arr = Array.isArray(save.caught) ? save.caught : [];
    return arr.map(m => {
      const dex = m.dexId ?? m.id ?? '';
      let dexNum = m.dexNum ?? (typeof m.dexId === 'number' ? m.dexId : undefined);

      const speciesId = typeof m.dexId === 'string' ? m.dexId : (m.speciesId ?? undefined);

      const rawName = String(m.name ?? '').trim();
      const noDexPrefix = rawName.replace(/^\s*#?\d+\s+/i, '').trim();

      const parts = noDexPrefix.split(/\s+/).filter(Boolean);
      const half = Math.floor(parts.length / 2);
      const deduped =
        parts.length >= 2 &&
          parts.length % 2 === 0 &&
          parts.slice(0, half).join(' ').toLowerCase() === parts.slice(half).join(' ').toLowerCase()
          ? parts.slice(0, half).join(' ')
          : noDexPrefix;

      const cleanName = capName(deduped);

      return {
        ...m,
        name: cleanName,
        pcLabel: dex ? `#${dex} ${cleanName}` : cleanName,
      };
    });
  }, [save.caught]);

  useEffect(() => {
    saveRef.current = save;
    if (suppressPersistOnceRef.current) {
      suppressPersistOnceRef.current = false;
      return;
    }
    if (mode === 'mini') {
      saveActiveMiniRun(save);
    } else if (mode === 'runview') {
      // Persist edits back into the saved run snapshot(s)
      if (runViewId) {
        setRunSummaries((prev) => {
          const next = (prev || []).map((s) => (s?.id === runViewId ? { ...s, saveSnapshot: save, caught: save?.caught ?? s?.caught ?? [] } : s));
          saveMiniSummaries(next);
          return next;
        });
      }
    } else {
      saveSave(save);
    }
  }, [save, mode, runViewId]);

  useEffect(() => {
    if (!attackAnim) return;
    const t = window.setTimeout(() => setAttackAnim(null), 650);
    return () => window.clearTimeout(t);
  }, [attackAnim]);

  async function evolveCaught(uidToEvolve, targetDexId) {
    const idx = (save.caught ?? []).findIndex(m => m.uid === uidToEvolve);
    if (idx < 0) return;

    const mon = save.caught[idx];
    const fromBaseId = toID(mon.formId ?? mon.speciesId ?? mon.name);


    const options = targetDexId ? [targetDexId] : getEvolutionOptions(mon.formId ?? mon.speciesId ?? mon.name);
    if (!options || options.length === 0) {
      alert('This Pokémon cannot evolve.');
      return;
    }

    const chosenDexId = targetDexId || options[Math.floor(Math.random() * options.length)];
    const evolvedBundle = await fetchPokemonBundleByDexId(chosenDexId);

    const evoCandidates = spriteFallbacksFromBundle(evolvedBundle, !!mon.shiny);
    const evoFinalFallback = mon.shiny ? (evolvedBundle.fallbackShinySprite || evolvedBundle.fallbackSprite) : evolvedBundle.fallbackSprite;
    const spriteCandidates = [...evoCandidates, evoFinalFallback].filter(Boolean);
    const spriteUrlResolved = spriteCandidates[0] || "";

    const evolvedWild = {
      ...evolvedBundle,
      rarity: mon.rarity,
      badge: mon.badge,
      buffs: mon.buffs ?? (mon.buff ? [mon.buff] : []),
      isDelta: !!(mon.isDelta),
      types: mon.isDelta ? mon.types : (evolvedBundle.types ?? []),
    };

    const evolvedRecord = await buildCaughtRecord(evolvedWild, spriteUrlResolved, !!mon.shiny, mon.caughtBall);

    evolvedRecord.uid = mon.uid;
    evolvedRecord.caughtAt = mon.caughtAt;
    evolvedRecord.locked = !!mon.locked;

    evolvedRecord.caughtBall = mon.caughtBall ?? mon.ballKey ?? evolvedRecord.caughtBall ?? null;

    evolvedRecord.prevAbilities = [...(mon.prevAbilities ?? []), mon.ability?.name].filter(Boolean);
    evolvedRecord.isDelta = !!(mon.isDelta);

    if (mon.isDelta) {
      evolvedRecord.types = mon.types;
    }
    const toBaseId = toID(evolvedRecord.formId ?? evolvedRecord.speciesId ?? evolvedRecord.name);

    // Net Ball unlock tracking: count evolutions of Bug-type Pokémon (main save only)
    const evolvedWasBug = Array.isArray(mon?.types) && mon.types.some(t => String(t).toLowerCase() === 'bug');

// ✅ Keep the old base forever + add the new base forever (forms map to base species)
bumpDexCaughtFromAny(fromBaseId, !!mon.shiny, !!(mon.isDelta ), mon?.rarity);
bumpDexCaughtFromAny(toBaseId, !!mon.shiny, !!(evolvedRecord.isDelta ), evolvedRecord?.rarity ?? mon?.rarity);



    setSave(prev => {
      const base = defaultSave();
      const cur = { ...base, ...prev };
      const next = [...(cur.caught ?? [])];
      next[idx] = evolvedRecord;

      let trainer = cur.trainer ?? base.trainer;
      let specialBalls = cur.specialBalls ?? base.specialBalls;

      if (mode !== 'mini' && evolvedWasBug) {
        const stats = { ...(trainer.stats ?? {}) };
        stats.bugEvolves = Math.max(0, Math.floor(stats.bugEvolves ?? 0)) + 1;
        trainer = { ...trainer, stats };

        if (stats.bugEvolves >= 25) {
          const unlocked = { ...(specialBalls.unlocked ?? {}) };
          if (!unlocked.net) unlocked.net = { unlockedAt: Date.now() };
          specialBalls = { ...specialBalls, unlocked };
        }
      }

      return { ...cur, caught: next, trainer, specialBalls };
    });
  }
function getBaseDexInfoFromAny(anyIdOrNum) {
  // Returns { baseId, baseNum } where baseId is Showdown id of the base species
  // and baseNum is its National Dex number (if available).

  // If it's already a number, assume it's a National Dex num.
  if (typeof anyIdOrNum === 'number') {
    return { baseId: null, baseNum: anyIdOrNum };
  }

  const raw = String(anyIdOrNum ?? '').trim();
  if (!raw) return { baseId: null, baseNum: undefined };

  // If someone passed "479" as a string, treat as number
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return { baseId: null, baseNum: Number.isFinite(n) ? n : undefined };
  }

  // Try multiple candidate ids (handles things like "rotomfrost" -> "rotom-frost")
  const baseInputId = toID(raw);
  const candidates = expandDexIdCandidates(baseInputId);

  let entry = null;
  let usedId = null;

  for (const cid of candidates) {
    try {
      // dexLocal.getDexById expects an object {id} or {num}
      const e = getDexById({ id: cid });
      if (e) {
        entry = e;
        usedId = cid;
        break;
      }
    } catch {
      // keep trying
    }
  }

  // If dexLocal doesn't recognize it, at least return the normalized id (best effort)
  if (!entry) {
    return { baseId: baseInputId, baseNum: undefined };
  }

  // baseSpecies is how we map forms -> base
  const baseId = toID(entry.baseSpecies || entry.baseSpeciesId || entry.id || entry.name || usedId || baseInputId);

  let baseEntry = null;
  try {
    baseEntry = getDexById({ id: baseId });
  } catch {
    baseEntry = null;
  }

  const baseNum = baseEntry?.num ?? entry?.num;
  return { baseId, baseNum: (typeof baseNum === 'number' ? baseNum : undefined) };
}

function expandDexIdCandidates(id) {
  const out = [];
  const seen = new Set();

  const push = (x) => {
    const t = toID(x);
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  // original
  push(id);

  // If already hyphenated, also try de-hyphenated (rare, but harmless)
  if (id.includes('-')) {
    push(id.replace(/-/g, ''));
    return out;
  }

  // Common suffix tokens that appear in Showdown ids
  const suffixes = [
    'alola', 'galar', 'hisui', 'paldea',
    'dusk', 'dawn',
    'frost', 'fan', 'heat', 'wash', 'mow',
    'origin', 'crowned', 'complete', 'school', 'zen',
    'therian', 'incarnate',
    'attack', 'defense', 'speed',
    'sunny', 'rainy', 'snowy',
    'stretchy', 'droopy',
    'artisan', // poltchageistartisan etc
    'stellar', // terapagosstellar etc
  ];

  // Try inserting a hyphen before any matching suffix at the end
  for (const suf of suffixes) {
    if (id.endsWith(suf) && id.length > suf.length) {
      push(id.slice(0, -suf.length) + '-' + suf);
    }
  }

  return out;
}

  // ======== POKEDEX (base forms only) ========
  // We key Dex by numeric National Dex number (base forms only).
  function bumpDexSeenByNum(dexNum, isShiny, isDelta, baseIdMaybe) {
  // dexNum is the base species National Dex number
  // baseIdMaybe is optional base species id (e.g. "lycanroc") so Pokedex.jsx can read it too
  if (typeof dexNum !== 'number' && !baseIdMaybe) return;

  setSave(prev => {
    const base = defaultSave();
    const cur = { ...base, ...prev };
    const dex = { ...(cur.pokedex ?? {}) };

    const apply = (key) => {
      const old = dex[key] ?? {};
      dex[key] = {
        ...(old ?? {}),
        // keep a copy if present
        dexNum: old.dexNum ?? dexNum,

        // Count EVERY encounter as "seen"
        seen: (old.seen ?? 0) + 1,
        caught: old.caught ?? 0,

        shinySeen: isShiny ? ((old.shinySeen ?? 0) + 1) : (old.shinySeen ?? 0),
        deltaSeen: isDelta ? ((old.deltaSeen ?? 0) + 1) : (old.deltaSeen ?? 0),

        shinyCaught: old.shinyCaught ?? 0,
        deltaCaught: old.deltaCaught ?? 0,

        // preserve any permanent rarity progress if present
        rarityCaught: (old.rarityCaught && typeof old.rarityCaught === 'object') ? old.rarityCaught : undefined,
      };
    };

    if (typeof dexNum === 'number') apply(String(dexNum));
    if (baseIdMaybe) apply(toID(baseIdMaybe));

    return { ...cur, pokedex: dex };
  });
}



  function bumpDexCaughtByNum(dexNum, isShiny, isDelta, rarityKey, baseIdMaybe, buffCount = 0, streak = 0) {
  if (typeof dexNum !== 'number' && !baseIdMaybe) return;

  setSave(prev => {
    const base = defaultSave();
    const cur = { ...base, ...prev };
    const dex = { ...(cur.pokedex ?? {}) };

    const dexCaughtBefore = (function(){
      let c = 0;
      const dexObj = cur.pokedex ?? {};
      for (const [k,v] of Object.entries(dexObj)) {
        if (!/^\\d+$/.test(k)) continue;
        if ((v?.caught ?? 0) > 0) c++;
      }
      return c;
    })();

    const apply = (key) => {
      const old = dex[key] ?? {};
      const prevRarity = (old.rarityCaught && typeof old.rarityCaught === 'object') ? old.rarityCaught : {};
      const nextRarity = { ...prevRarity };
      const rk = String(rarityKey || '').toLowerCase();
      if (rk) nextRarity[rk] = Math.max(nextRarity[rk] ?? 0, 1);

      dex[key] = {
        ...(old ?? {}),
        dexNum: old.dexNum ?? dexNum,

        // Do NOT increment seen here (spawn already does it); just ensure it isn't empty.
        seen: Math.max(old.seen ?? 0, 1),

        // Count EVERY catch permanently (even if later released/evolved)
        caught: (old.caught ?? 0) + 1,

        shinyCaught: isShiny ? ((old.shinyCaught ?? 0) + 1) : (old.shinyCaught ?? 0),
        deltaCaught: isDelta ? ((old.deltaCaught ?? 0) + 1) : (old.deltaCaught ?? 0),

        // Permanent rarity unlocks (do NOT derive from PC box)
        rarityCaught: nextRarity,

        // preserve seen counters
        shinySeen: old.shinySeen ?? 0,
        deltaSeen: old.deltaSeen ?? 0,
      };
    };

    if (typeof dexNum === 'number') apply(String(dexNum));
    if (baseIdMaybe) apply(toID(baseIdMaybe));

const dexCaughtAfter = (function(){
  let c = 0;
  for (const [k,v] of Object.entries(dex)) {
    if (!/^\d+$/.test(k)) continue;
    if ((v?.caught ?? 0) > 0) c++;
  }
  return c;
})();

const { nextTrainer, achievementUnlocks } = applyCatchProgress(cur.trainer ?? base.trainer, {
  rarityKey,
  isShiny,
  isDelta,
  dexCaughtBefore,
  dexCaughtAfter,
  buffCount,
  streak,
  disableAchievements: (mode === 'mini'),
});

// --- Special ball unlock checks (main save only) ---
let nextSpecialBalls = { ...(cur.specialBalls ?? {}) };
if (mode !== 'mini') {
  const unlocked = { ...(nextSpecialBalls.unlocked ?? {}) };
  const now = Date.now();
  const tryUnlock = (key) => {
    if (!key) return;
    if (unlocked[key]) return;
    unlocked[key] = { unlockedAt: now };
  };

  const trainerLevel = Math.max(1, Math.floor(nextTrainer?.level ?? 1));
  if (trainerLevel >= 10) tryUnlock('quick');
  if (trainerLevel >= 15) tryUnlock('dream');
  if (trainerLevel >= 20) tryUnlock('moon');
  if (trainerLevel >= 25) tryUnlock('beast');

  if (dexCaughtAfter >= 250) tryUnlock('repeat');

  const commonTotal = Math.max(0, Math.floor(nextTrainer?.stats?.commonCaught ?? 0));
  if (commonTotal >= 100) tryUnlock('nest');

  const shinyTotal = Math.max(0, Math.floor(nextTrainer?.stats?.shinyCaught ?? 0));
  if (shinyTotal >= 50) tryUnlock('fast');

  // Love Ball: if the caught species is currently favorited
  const fav = Array.isArray(cur.favorites) ? cur.favorites : [];
  if (typeof dexNum === 'number' && fav.some((x) => Number(x) === Number(dexNum))) {
    tryUnlock('love');
  }

  // Timer Ball: if THIS dex entry is now fully complete (all rarities + shiny)
  const entryKey = (typeof dexNum === 'number') ? String(dexNum) : null;
  const entry = entryKey ? (dex?.[entryKey] ?? null) : null;
  if (entry) {
    const rc = (entry.rarityCaught && typeof entry.rarityCaught === 'object') ? entry.rarityCaught : {};
    const need = ['common','uncommon','rare','legendary'];
    const hasAll = need.every((k) => (rc[k] ?? 0) > 0);
    const hasShiny = (entry.shinyCaught ?? 0) > 0;
    if (hasAll && hasShiny) tryUnlock('timer');
  }

  nextSpecialBalls = { ...nextSpecialBalls, unlocked };
}

const balls2 = { ...(cur.balls ?? {}) };
if (mode !== 'mini') {
  const add = Array.isArray(achievementUnlocks) ? achievementUnlocks.length : 0;
  if (add > 0) balls2.master = (balls2.master ?? 0) + add;
}
return { ...cur, pokedex: dex, trainer: nextTrainer, balls: balls2, specialBalls: nextSpecialBalls };
  });
}



function bumpDexSeenFromAny(anyIdOrNum, isShiny, isDelta) {
  const { baseId, baseNum } = getBaseDexInfoFromAny(anyIdOrNum);
  bumpDexSeenByNum(baseNum, isShiny, isDelta, baseId);
}

function bumpDexCaughtFromAny(anyIdOrNum, isShiny, isDelta, rarityKey, buffCount = 0, streak = 0) {
  const { baseId, baseNum } = getBaseDexInfoFromAny(anyIdOrNum);
  bumpDexCaughtByNum(baseNum, isShiny, isDelta, rarityKey, baseId, buffCount, streak);
}


  // Build Dex list once (1..1025) from your local dex.
  // If your local dex is shorter, entries will just be missing/skipped.
  const dexEntries = useMemo(() => {
    const out = [];
    const MAX = 1025;
    for (let n = 1; n <= MAX; n++) {
      const e = getDexEntryByNum?.(n);
      if (!e) continue;
      // Expect { num, id, name } at minimum
      out.push({
        dexNum: e.num ?? n,
        dexId: e.id ?? toID(e.name ?? String(n)),
        name: e.name ?? `#${n}`,
      });
    }
    return out;
  }, []);
  // ==========================================

  // --- encounter tracker helper (reused for grass-slot rolls too)
  function bumpSeen(rarityKey, isShiny, isDelta) {
    setSave(prev => {
      const base = defaultSave();
      const cur = { ...base, ...prev, encounter: { ...base.encounter, ...(prev.encounter ?? {}) } };
      const e = { ...cur.encounter };
      const rk = rarityKey;
      if (e[rk]) e[rk] = { ...e[rk], seen: (e[rk].seen ?? 0) + 1 };
      if (isShiny) e.shiny = { ...e.shiny, seen: (e.shiny.seen ?? 0) + 1 };
      if (isDelta) e.delta = { ...e.delta, seen: (e.delta?.seen ?? 0) + 1 };
      return { ...cur, encounter: e };
    });
  }

  // Roll ONE wild (used for main spawn + grass slots)
  async function rollOneEncounter(opts = {}) {
    const { trackSeen = true } = opts;
    const dexId = getRandomSpawnableDexId();
    const bundle = await fetchPokemonBundleByDexId(dexId);

    const baseRarity = pickWeightedRarity();
    const totals = getBuffTotalsFromMons(teamMons, activeTeamUid);
    const rarity = applyRarityBoost(baseRarity, totals.rarityPct);
    const buffs = rollBuffs(rarity.key, bundle);
    const baseShiny = settings.shinyCharm ? 0.025 : BASE_SHINY_CHANCE;
    const totals2 = getBuffTotalsFromMons(teamMons, activeTeamUid);
    const shinyMult = (totals2.shinyMult ?? 1);
    const shinyChance = Math.min(MAX_SHINY_CHANCE, (baseShiny + SHINY_STREAK_BONUS * catchStreak) * shinyMult);
    const isShiny = Math.random() < shinyChance;

    const isDelta = rollDelta(rarity.key);
    const rolledTypesForWild = isDelta ? rollDeltaTypes(bundle.types ?? []) : (bundle.types ?? []);
    if (trackSeen) {
      bumpSeen(rarity.key, isShiny, isDelta);
      // ✅ Dex seen (base species, regardless of form)
      bumpDexSeenFromAny(bundle.dexId ?? bundle.name ?? bundle.num ?? bundle.id, isShiny, isDelta);
    }
    const finalFallback = isShiny
      ? (bundle.fallbackShinySprite || bundle.fallbackSprite)
      : bundle.fallbackSprite;

    // NOTE: SpriteWithFallback will do the real lookup + caching.
    return {
      ...bundle,
      rarity: rarity.key,
      badge: rarity.badge,
      buffs,
      shiny: isShiny,
      types: rolledTypesForWild,
      isDelta,

      fallbackSprite: bundle.fallbackSprite,
      fallbackShinySprite: bundle.fallbackShinySprite,
      spriteUrl: finalFallback, // last-resort
    };
  }

  async function rollGrassSlots() {
    try {
      const biomeKeys = [rollRandomBiomeKey(), rollRandomBiomeKey(), rollRandomBiomeKey()];
      const mons = await Promise.all([
        rollOneEncounter({ trackSeen: false }),
        rollOneEncounter({ trackSeen: false }),
        rollOneEncounter({ trackSeen: false }),
      ]);
      const withBiomes = (mons || []).map((m, i) => ({ ...(m || {}), biome: biomeKeys[i] || 'grass' }));
      setGrassSlots(withBiomes);
    } catch (e) {
      console.error('Failed to roll grass slots', e);
      setGrassSlots([]);
    }
  }

  async function chooseGrassSlot(index) {
    const picked = grassSlots[index];
    if (!picked) return;

    // Hide the other two immediately
    setGrassSlots([]);

    // Mini run: choosing a grass patch counts as starting a new encounter
    if (inMiniRun()) {
      const left = saveRef.current?.miniRun?.caps?.encountersLeft;
      if (left === 0) {
        endMiniRun('Out of encounters');
        return;
      }
      const isLast = (typeof left === 'number' && left === 1);
      miniLastEncounterRef.current = isLast;
      setMiniLastEncounter(isLast);

      if (typeof left === 'number') {
        setSave((prev) => {
          const curLeft = prev?.miniRun?.caps?.encountersLeft;
          if (typeof curLeft !== 'number') return prev;
          const nextLeft = Math.max(0, curLeft - 1);
          return {
            ...prev,
            miniRun: {
              ...prev.miniRun,
              caps: { ...prev.miniRun.caps, encountersLeft: nextLeft },
            },
          };
        });
      }
    } else {
      miniLastEncounterRef.current = false;
      setMiniLastEncounter(false);
    }


    // Start the picked encounter
    setMessage('');
    setStage('ready');
    setWild(picked);
    setBallsThrownThisEncounter(0);

    // Track "seen" ONLY when the player actually chooses an encounter (not on grass previews)
    try {
      bumpSeen(picked?.rarityKey || picked?.rarity || picked?.rarity?.key || 'common', !!picked?.shiny, !!picked?.isDelta);
      bumpDexSeenFromAny(picked?.dexId ?? picked?.name ?? picked?.num ?? picked?.id, !!picked?.shiny, !!picked?.isDelta);
    } catch {}
    setActiveBall(null);
    setPityFails(0);
    resetEncounterAssist();

    // IMPORTANT: Do NOT roll new grass here.
    // Grass only appears after you catch a Pokémon.
  }



  // ===== Mini run helpers =====
  function inMiniRun() {
    return mode === 'mini' && !!save?.miniRun;
  }


  function closeSettings() {
    setShowSettings(false);
    // When a new mini-run starts, show settings first, then spawn once settings is closed.
    if (inMiniRun() && miniStartPendingSpawn) {
      setMiniStartPendingSpawn(false);
      window.setTimeout(() => spawn(), 50);
    }
  }

  function allBallsEmpty(s) {
    const b = s?.balls ?? {};
    return (b.poke ?? 0) <= 0 && (b.great ?? 0) <= 0 && (b.ultra ?? 0) <= 0 && (b.master ?? 0) <= 0;
  }

  function resetSoftState() {
    setMessage('');
    setStage('idle');
    setWild(null);
    setActiveBall(null);
    setPityFails(0);
    setAttacksLeft(4);
    setCatchStreak(0);
    resetEncounterAssist();
    setGrassSlots([]);
    setMiniLastEncounter(false);
  }

  function endMiniRun(reason = 'Game Over') {
  if (miniEndLockRef.current) return;
  const cur = saveRef.current;
  if (!cur?.miniRun || cur.miniRun.gameOver) return;

  miniEndLockRef.current = true;
  const endedAt = Date.now();

  const endedSave = {
    ...cur,
    miniRun: {
      ...cur.miniRun,
      gameOver: true,
      endedAt,
      endReason: reason,
    },
  };

  const summary = {
    id: cur.miniRun.id,
    createdAt: cur.miniRun.createdAt,
    endedAt,
    reason,
    capsInitial: cur.miniRun.capsInitial,
    ballsInitial: cur.miniRun.ballsInitial,
    caught: endedSave.caught ?? [],
    counts: { caught: (endedSave.caught ?? []).length },
    // full snapshot so we can view/edit (evolve, move tokens) later from Run Saves
    saveSnapshot: endedSave,
  };

  const next = addMiniSummary(summary, 3);
  setRunSummaries(next);

  // Once ended, treat it as a saved snapshot (not resumable as an active run).
  clearActiveMiniRun();
  setHasActiveMini(false);

  // Return player to main save immediately.
  suppressPersistOnceRef.current = true;
  setMode('main');
  // Always reload main from storage (source of truth), then reconcile pokedex for profile.
  const mainLoaded = hydrateSave(loadSave()) ?? mainSaveRef.current ?? defaultSave();
  const main = reconcilePokedexForProfile(mainLoaded);
  setSave(main);

  setOpenSummary(summary);
}

  function startMiniRun(config) {
    if (mode !== 'mini') mainSaveRef.current = save;
    miniEndLockRef.current = false;
    const runSave = defaultMiniRun(config);
    saveActiveMiniRun(runSave);
    setHasActiveMini(true);
    suppressPersistOnceRef.current = true;
    setMode('mini');
    setSave(runSave);
    resetSoftState();
    setMiniStartPendingSpawn(true);
    setShowSettings(true);
  }

  function resumeMiniRun() {
    miniEndLockRef.current = false;
    const loaded = loadActiveMiniRun();
    if (!loaded) return;
    if (mode !== 'mini') mainSaveRef.current = save;
    suppressPersistOnceRef.current = true;
    setMode('mini');
    setSave(hydrateSave(loaded));
    resetSoftState();
    window.setTimeout(() => spawn(), 50);
  }


function viewSavedRun(summary) {
  if (!summary?.saveSnapshot) return;
  // Load the saved run snapshot in a read-only "run view" mode (no encounters),
  // but allow Pokémon detail actions (evolve, move tokens).
  miniEndLockRef.current = true;
  suppressPersistOnceRef.current = true;
  setMode('runview');
  setRunViewId(summary.id);
  setSave(hydrateSave(summary.saveSnapshot));
  resetSoftState();
  setShowPC(true);
}


  // --- Mini run summary editing (PokemonDetail from the summary modal) ---
  function updateRunSummaryById(summaryId, updater) {
    setRunSummaries((prev) => {
      const next = (prev || []).map((s) => (s?.id === summaryId ? updater(s) : s));
      try { saveMiniSummaries(next); } catch {}
      return next;
    });
    setOpenSummary((prev) => (prev && prev.id === summaryId ? updater(prev) : prev));
  }

  function replaceMoveWithTokenInSummary(summaryId, uid, slotIndex, moveDisplay) {
    updateRunSummaryById(summaryId, (sum) => {
      const snap = sum?.saveSnapshot;
      if (!snap) return sum;
      const tokens = snap.moveTokens ?? 0;
      if (tokens <= 0) return sum;

      const nextCaught = (snap.caught ?? []).map((m) => {
        if (m.uid !== uid) return m;
        const moves = (m.moves ?? []).slice(0, 4);
        moves[slotIndex] = { kind: 'token', id: moveDisplay.id, name: moveDisplay.name, meta: moveDisplay.meta };
        return { ...m, moves };
      });

      return { ...sum, saveSnapshot: { ...snap, moveTokens: Math.max(0, tokens - 1), caught: nextCaught } };
    });
  }

  async function evolveCaughtInSummary(summaryId, uidToEvolve, targetDexId) {
    const sum = (openSummary?.id === summaryId) ? openSummary : (runSummaries || []).find(s => s?.id === summaryId);
    const snap = sum?.saveSnapshot;
    if (!snap) return;

    const idx = (snap.caught ?? []).findIndex(m => m.uid === uidToEvolve);
    if (idx < 0) return;

    const mon = snap.caught[idx];
    const options = targetDexId ? [targetDexId] : getEvolutionOptions(mon.formId ?? mon.speciesId ?? mon.name);
    if (!options || options.length === 0) {
      alert('This Pokémon cannot evolve.');
      return;
    }

    const chosenDexId = targetDexId || options[Math.floor(Math.random() * options.length)];
    const evolvedBundle = await fetchPokemonBundleByDexId(chosenDexId);

    const evoCandidates = spriteFallbacksFromBundle(evolvedBundle, !!mon.shiny);
    const evoFinalFallback = mon.shiny ? (evolvedBundle.fallbackShinySprite || evolvedBundle.fallbackSprite) : evolvedBundle.fallbackSprite;
    const spriteCandidates = [...evoCandidates, evoFinalFallback].filter(Boolean);
    const spriteUrlResolved = spriteCandidates[0] || "";

    const evolvedWild = {
      ...evolvedBundle,
      rarity: mon.rarity,
      badge: mon.badge,
      buffs: mon.buffs ?? (mon.buff ? [mon.buff] : []),
      isDelta: !!(mon.isDelta),
      types: mon.isDelta ? mon.types : (evolvedBundle.types ?? []),
    };

    const evolvedRecord = await buildCaughtRecord(evolvedWild, spriteUrlResolved, !!mon.shiny, mon.caughtBall);

    evolvedRecord.uid = mon.uid;
    evolvedRecord.caughtAt = mon.caughtAt;
    evolvedRecord.locked = !!mon.locked;

    evolvedRecord.caughtBall = mon.caughtBall ?? mon.ballKey ?? evolvedRecord.caughtBall ?? null;

    evolvedRecord.prevAbilities = [...(mon.prevAbilities ?? []), mon.ability?.name].filter(Boolean);
    evolvedRecord.isDelta = !!(mon.isDelta);
    if (mon.isDelta) evolvedRecord.types = mon.types;

    updateRunSummaryById(summaryId, (s) => {
      const snap2 = s?.saveSnapshot;
      if (!snap2) return s;
      const nextCaught = [...(snap2.caught ?? [])];
      const i = nextCaught.findIndex(m => m.uid === uidToEvolve);
      if (i < 0) return s;
      nextCaught[i] = evolvedRecord;
      return { ...s, saveSnapshot: { ...snap2, caught: nextCaught } };
    });
  }

  function returnToMain() {
    if (mode !== 'mini') return;
    suppressPersistOnceRef.current = true;
    setMode('main');
    const mainLoaded = hydrateSave(loadSave()) ?? mainSaveRef.current ?? defaultSave();
    const main = reconcilePokedexForProfile(mainLoaded);
    mainSaveRef.current = null;
    setSave(main);
    resetSoftState();
  }

  // If main pokedex got out of sync (e.g., after mini-run transitions),
  // reconcile it using the caught list so the Trainer Profile dex count is correct.
  function reconcilePokedexForProfile(s) {
    if (!s) return s;
    const pokedex = { ...(s.pokedex ?? {}) };

    const countFromPokedex = () => {
      let c = 0;
      for (const [k, v] of Object.entries(pokedex)) {
        if (!/^\d+$/.test(k)) continue;
        if ((v?.caught ?? 0) > 0) c += 1;
      }
      return c;
    };

    const baseNums = new Set();
    for (const m of (s.caught ?? [])) {
      const n = getBaseDexNumFromMon(m);
      if (typeof n === 'number') baseNums.add(n);
    }

    const dexCount = countFromPokedex();
    if (baseNums.size <= dexCount) return s;

    for (const n of baseNums) {
      const key = String(n);
      const cur = pokedex[key] ?? {};
      if ((cur.caught ?? 0) > 0) continue;
      pokedex[key] = { ...cur, caught: 1, seen: Math.max(cur.seen ?? 0, 1) };
    }

    return { ...s, pokedex };
  }

  function getBaseDexNumFromMon(m) {
    if (!m) return undefined;
    const direct = m.dexId ?? m.dexNum ?? m.num;
    if (typeof direct === 'number') return direct;
    const anyId = toID(m.formId ?? m.speciesId ?? m.name ?? '');
    if (!anyId) return undefined;
    try {
      const entry = getDexById({ id: anyId });
      if (!entry) return undefined;
      const baseId = toID(entry.baseSpecies || entry.id || entry.name || anyId);
      try {
        const baseEntry = getDexById({ id: baseId });
        return baseEntry?.num ?? entry?.num;
      } catch {
        return entry?.num;
      }
    } catch {
      return undefined;
    }
  }

  async function spawn() {
    if (stage === 'loading' || stage === 'throwing') return;

    // Starting a new encounter via "Find another" / "Run & find another" resets the shiny chain.
    setCatchStreak(0);

// Mini run: encounters cap
    if (inMiniRun()) {
      const left = saveRef.current?.miniRun?.caps?.encountersLeft;
      if (left === 0) {
        endMiniRun('Out of encounters');
        return;
      }
      const isLast = (typeof left === 'number' && left === 1);
      miniLastEncounterRef.current = isLast;
      setMiniLastEncounter(isLast);
    } else {
      miniLastEncounterRef.current = false;
      setMiniLastEncounter(false);
    }


    setMessage('');
    setStage('loading');
    setWild(null);
    setActiveBall(null);
    setPityFails(0);

    // New encounter: reset per-encounter assist state
    resetEncounterAssist();

    try {
      const w = await rollOneEncounter();
      setWild(w);
      setStage('ready');

      // Mini run: decrement encounters after a successful spawn
      if (inMiniRun()) {
        const left = saveRef.current?.miniRun?.caps?.encountersLeft;
        if (typeof left === 'number') {
          setSave((prev) => {
            const curLeft = prev?.miniRun?.caps?.encountersLeft;
            if (typeof curLeft !== 'number') return prev;
            const nextLeft = Math.max(0, curLeft - 1);
            return {
              ...prev,
              miniRun: {
                ...prev.miniRun,
                caps: { ...prev.miniRun.caps, encountersLeft: nextLeft },
              },
            };
          });
        }
      }
    } catch (e) {
      console.error(e);
      setMessage('Failed to load Pokémon. Check internet and try again.');
      setStage('idle');
    }
  }

  function canThrow(ballKey) {
    return (save.balls?.[ballKey] ?? 0) > 0 && wild && stage === 'ready';
  }

  function decrementBall(ballKey) {
    setSave(prev => {
      const nextBalls = {
        ...prev.balls,
        [ballKey]: Math.max(0, (prev.balls?.[ballKey] ?? 0) - 1),
      };
      return { ...prev, balls: nextBalls };
    });
  }

  function resetToReady() {
    if (!wild) return;
    setStage('ready');
    setActiveBall(null);
    setMessage('');
    setAttackAnim(null);
  }

  function resetToIdle() {
    setStage('idle');
    setActiveBall(null);
    setWild(null);
    setMessage('');
    setPityFails(0);
    setAttacksLeft(4);
    resetEncounterAssist();
    setCatchStreak(0);
    setGrassSlots([]);
  }

  function applyStatBuffs(baseStats, buffs, rng = Math.random) {
    // Stats are stored as {hp, atk, def, spa, spd, spe}
    const STAT_KEYS_LOCAL = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

    const arr = Array.isArray(buffs) ? buffs : (buffs ? [buffs] : []);
    const superChanged = new Set();

    function clampStat(v) {
      v = Math.trunc(Number(v) || 0);
      if (v < 1) return 1;
      if (v > 255) return 255;
      return v;
    }

    function calcBST(s) {
      let t = 0;
      for (const k of STAT_KEYS_LOCAL) t += (s?.[k] ?? 0);
      return t;
    }

    function genUnhingedBalancedStats(minBST = 500, maxBST = 650) {
      // Spiky (unhinged) split with guardrails + compensation:
      // - 1..255 per stat
      // - BST target in [minBST..maxBST]
      // - if any stat is very low (<=25), force at least one very high (>=180)
      // - avoid all-stats-high or all-stats-low outcomes
      for (let tries = 0; tries < 1000; tries++) {
        const target = Math.floor(minBST + rng() * (maxBST - minBST + 1));

        // spiky weights
        const exp = 3.0;
        const w = STAT_KEYS_LOCAL.map(() => Math.pow(rng(), exp));
        let sumW = w.reduce((a, b) => a + b, 0) || 1;
        const raw = w.map(x => x / sumW * target);

        // round + ensure >= 1
        let s = {};
        let total = 0;
        for (let i = 0; i < STAT_KEYS_LOCAL.length; i++) {
          const k = STAT_KEYS_LOCAL[i];
          const v = Math.max(1, Math.round(raw[i]));
          s[k] = v;
          total += v;
        }

        // fix sum to target
        const keys = STAT_KEYS_LOCAL.slice();
        while (total !== target) {
          if (total < target) {
            const k = keys[Math.floor(rng() * keys.length)];
            if (s[k] < 255) { s[k]++; total++; }
            else { /* try another */ }
          } else {
            const k = keys[Math.floor(rng() * keys.length)];
            if (s[k] > 1) { s[k]--; total--; }
            else { /* try another */ }
          }
          // escape infinite loops if everything is capped
          if (total < target && keys.every(k => s[k] >= 255)) break;
          if (total > target && keys.every(k => s[k] <= 1)) break;
        }

        // clamp
        for (const k of STAT_KEYS_LOCAL) s[k] = clampStat(s[k]);
        total = calcBST(s);

        // if clamp moved us off target, it's still ok as long as within range
        if (total < minBST || total > maxBST) continue;

        const vals = STAT_KEYS_LOCAL.map(k => s[k]);
        const minV = Math.min(...vals);
        const maxV = Math.max(...vals);

        // compensation rule
        if (minV <= 25 && maxV < 180) continue;

        // guardrails: avoid "all high" and "all low"
        const allHigh = vals.every(v => v >= 130);
        const allLow = vals.every(v => v <= 90);
        if (allHigh || allLow) continue;

        return s;
      }

      // fallback: just clamp baseStats
      const fallback = {};
      for (const k of STAT_KEYS_LOCAL) fallback[k] = clampStat(baseStats?.[k] ?? 50);
      return fallback;
    }

    // Start with base stats, but allow a reroll buff to replace them.
    let s = { ...baseStats };

    const hasReroll = arr.some(b => b?.kind === 'reroll-stats');
    if (hasReroll) {
      // If multiple rerolls exist, just use the last one's range.
      const last = [...arr].reverse().find(b => b?.kind === 'reroll-stats') || {};
      s = genUnhingedBalancedStats(last.minBST ?? 500, last.maxBST ?? 650);
    }

    // Apply additive stat buffs (order doesn't matter; they stack)
    for (const b of arr) {
      if (!b || !b.kind) continue;
      if (b.kind === 'reroll-stats' || b.kind === 'bst-to-600') continue;

      // legacy kinds
      if (b.kind === 'stat+10' || b.kind === 'stat+20' || b.kind === 'stat+30') {
        s[b.stat] = (s[b.stat] ?? 0) + (b.amount ?? 0);
        continue;
      }
      if (b.kind === 'stat+15x2') {
        const [a, c] = b.stats || [];
        if (a) s[a] = (s[a] ?? 0) + (b.amount ?? 0);
        if (c) s[c] = (s[c] ?? 0) + (b.amount ?? 0);
        continue;
      }

      // current kinds
      if (b.kind === 'stat') {
        s[b.stat] = (s[b.stat] ?? 0) + (b.amount ?? 0);
        if (b?.superRare && b?.stat) superChanged.add(b.stat);
        continue;
      }
      if (b.kind === 'stat2') {
        const [a, c] = b.stats ?? [];
        if (a) s[a] = (s[a] ?? 0) + (b.amount ?? 0);
        if (c) s[c] = (s[c] ?? 0) + (b.amount ?? 0);
        if (b?.superRare) { if (a) superChanged.add(a); if (c) superChanged.add(c); }
        continue;
      }
      if (b.kind === 'stat-all') {
        for (const k of STAT_KEYS_LOCAL) s[k] = (s[k] ?? 0) + (b.amount ?? 0);
        if (b?.superRare) for (const k of STAT_KEYS_LOCAL) superChanged.add(k);
        continue;
      }
    }

    // Clamp after additive buffs
    for (const k of STAT_KEYS_LOCAL) s[k] = clampStat(s[k]);

    // Apply "BST to 600" last (it modifies all stats evenly)
    const hasBST600 = arr.some(b => b?.kind === 'bst-to-600');
    const bst600Buff = arr.find(b => b?.kind === 'bst-to-600');
    if (hasBST600) {
      if (bst600Buff?.superRare) for (const k of STAT_KEYS_LOCAL) superChanged.add(k);
      const target = 600;
      let bst = calcBST(s);
      let diff = target - bst;

      if (diff > 0) {
        // Add evenly first
        let baseAdd = Math.floor(diff / 6);
        if (baseAdd > 0) {
          for (const k of STAT_KEYS_LOCAL) {
            const add = Math.min(baseAdd, 255 - s[k]);
            s[k] += add;
            diff -= add;
          }
        }

        // Distribute remainder randomly
        let safety = 0;
        while (diff > 0 && safety++ < 2000) {
          const k = STAT_KEYS_LOCAL[Math.floor(rng() * STAT_KEYS_LOCAL.length)];
          if (s[k] < 255) {
            s[k] += 1;
            diff -= 1;
          }
          if (STAT_KEYS_LOCAL.every(k2 => s[k2] >= 255)) break;
        }
      }
    }

    // Apply multiplicative stat buffs (after BST normalization)
    for (const b of arr) {
      if (!b || !b.kind) continue;
      if (b.kind !== 'stat-mult') continue;
      const k = b.stat;
      if (!k) continue;
      const baseVal = baseStats?.[k];
      if (typeof baseVal === 'number' && typeof b.onlyIfBaseBelow === 'number') {
        if (!(baseVal < b.onlyIfBaseBelow)) continue;
      }
      const mult = Number(b.mult ?? 2) || 2;
      if (typeof s[k] === 'number') {
        s[k] = clampStat(Math.round(s[k] * mult));
        if (b?.superRare) superChanged.add(k);
      }
    }

    // Final clamp
    for (const k of STAT_KEYS_LOCAL) s[k] = clampStat(s[k]);

    return { stats: s, superChangedStats: Array.from(superChanged) };
  }

  async function buildCaughtRecord(w, spriteUrlResolved, isShiny = false, caughtBallKey = null) {
    const learnset = w.learnsetMoves ?? [];
    let moves = pickUnique(learnset, 4).map(m => ({ kind: 'learnset', name: m }));

    let ability;
    if (((w.buffs ?? []).some(b => b?.kind === 'chosen-ability')) || (w.buff?.kind === 'chosen-ability')) {
      const native = w.nativeAbilities ?? [];
      const picked = native.length
        ? native[Math.floor(Math.random() * native.length)].name
        : 'pressure';
      ability = { kind: 'chosen', name: picked };
    } else {
      const all = await getAllAbilities();
      ability = rollAbility(all);
    }

    if (((w.buffs ?? []).some(b => b?.kind === 'custom-move')) || (w.buff?.kind === 'custom-move')) {
      const others = pickUnique(learnset, 3).map(m => ({ kind: 'learnset', name: m }));
      moves = [{ kind: 'custom', name: 'Custom Move' }, ...others];
    }

    const baseTypes = w.types ?? [];
    const types = w?.isDelta ? rollDeltaTypes(baseTypes) : baseTypes;

    const baseStats = w.baseStats ?? {};
    const { stats: finalStats, superChangedStats } = applyStatBuffs(baseStats, w.buffs ?? w.buff);

    let shinyBoostStat = null;
    if (isShiny) {
      const keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
      let minVal = Infinity;
      for (const k of keys) {
        const v = finalStats?.[k];
        if (typeof v === 'number') minVal = Math.min(minVal, v);
      }
      const mins = keys.filter(k => typeof finalStats?.[k] === 'number' && finalStats[k] === minVal);
      const pick = mins.length ? mins[Math.floor(Math.random() * mins.length)] : 'hp';
      shinyBoostStat = pick;
      finalStats[pick] = (finalStats[pick] ?? 0) + 50;
    }

    const dexNum = w.dexNum ?? w.num ?? (typeof w.id === 'number' ? w.id : undefined);
    const formId = w.dexId ?? w.speciesId ?? toID(w.name);

    return {
      uid: uid('c'),
      dexId: dexNum,
      formId: formId,
      speciesId: w.dexId ?? w.speciesId ?? formId,
      name: w.name,

      rarity: w.rarity,
      badge: w.badge,
      buffs: w.buffs ?? (w.buff ? [w.buff] : []),

      spriteUrl: spriteUrlResolved,
      shiny: !!isShiny,
      isDelta: !!w?.isDelta,
      shinyBoostStat,

      baseStats,
      finalStats,
      superChangedStats,
      types,

      ability,
      moves: moves.slice(0, 4),

      caughtBall: caughtBallKey || w.caughtBall || w.ballKey || null,

      caughtAt: Date.now(),
    };
  }

  async function throwBall(ballKey) {
    if (!wild || stage !== 'ready') return;

    const count = save.balls?.[ballKey] ?? 0;
    if (count <= 0) {
      setMessage('You are out of that ball type!');
      return;
    }

    const ball = getBallDef(ballKey);
    if (!ball) return;

    // Pre-compute balls-after-this-throw so mini-run ball cap can end AFTER the result is shown.
    const ballsAfterThrow = {
      ...(saveRef.current?.balls ?? save.balls ?? {}),
      [ballKey]: Math.max(0, count - 1),
    };
    const relevantKeys = ['poke', 'great', 'ultra', 'master', ...((saveRef.current?.specialBalls?.equipped ?? save.specialBalls?.equipped ?? []).slice(0, 4))].filter(Boolean);
    const ballsEmptyAfterThrow = relevantKeys.every((k) => (ballsAfterThrow?.[k] ?? 0) <= 0);

    decrementBall(ballKey);
    setBallsThrownThisEncounter(prev => prev + 1);

    setMovesUsedSinceThrow(0);

    setActiveBall(ballKey);
    setStage('throwing');
    setMessage('');

    const spriteUrlResolved = wild.spriteUrl;
    const isShiny = !!wild.shiny;

    const { pityRate, total: effectiveRate } = currentEffectiveCaptureRate();
    let chance = calcCatchChance(effectiveRate, ball);

    // Special ball effects (may force 100% catch or multiply chance)
    const baseDexNum = Number(wild?.dexNum ?? wild?.num ?? wild?.id ?? 0);
    const effect = computeBallEffect(ballKey, {
      wild,
      biome: wild?.biome,
      ballsThrownSoFar: ballsThrownThisEncounter,
      favorites: save.favorites,
      pokedex: save.pokedex,
      baseDexNum,
    });
    if (effect?.forceCatch) {
      chance = 1;
    } else if (effect?.mult) {
      chance = Math.max(0, Math.min(1, chance * Number(effect.mult)));
    }

    const caught = Math.random() < chance;

    window.setTimeout(() => {
      (async () => {
        if (caught) {
          setStage('caught');
          let rewardText = '';
          if (settings.ballOnCatch) {
            const ballKey = awardRandomBall();
            rewardText = ` You found a ${capName(ballKey)} ball!`;
          }
          setMessage(`Gotcha! ${capName(wild.name)} was caught!${rewardText}`);
          setPityFails(0);
          setAttacksLeft(4);
          const nextStreak = catchStreak + 1;
          setCatchStreak(nextStreak);
          resetEncounterAssist();
          rollGrassSlots();

          const record = await buildCaughtRecord(wild, spriteUrlResolved, isShiny, ballKey);

          // ✅ Dex caught (base species, regardless of form)
bumpDexCaughtFromAny(
  record?.formId ?? record?.speciesId ?? wild.dexId ?? wild.name ?? wild.num ?? wild.id,
  isShiny,
  !!record?.isDelta,
  wild?.rarity ?? record?.rarity,
  (record?.buffs?.length ?? 0),
  nextStreak
);


          setSave(prev => {
            const base = defaultSave();
            const cur = { ...base, ...prev, encounter: { ...base.encounter, ...(prev.encounter ?? {}) } };
            const nextCaught = Array.isArray(cur.caught) ? [...cur.caught, record] : [record];

            const e = { ...cur.encounter };
            const rk = wild.rarity;
            if (e[rk]) e[rk] = { ...e[rk], caught: (e[rk].caught ?? 0) + 1 };
            if (isShiny) e.shiny = { ...e.shiny, caught: (e.shiny.caught ?? 0) + 1 };
            if (record?.isDelta) e.delta = { ...e.delta, caught: (e.delta?.caught ?? 0) + 1 };

            let next = { ...cur, caught: nextCaught, encounter: e };

            // Mini run: decrement catches cap
            if (mode === 'mini' && next?.miniRun && typeof next.miniRun.caps?.catchesLeft === 'number') {
              const left = Math.max(0, next.miniRun.caps.catchesLeft - 1);
              next = { ...next, miniRun: { ...next.miniRun, caps: { ...next.miniRun.caps, catchesLeft: left } } };
              if (left === 0) {
                window.setTimeout(() => endMiniRun('Out of catches'), 0);
              }
            }

            return next;
          });

          // Mini run: end conditions that must wait until the throw outcome is shown/logged.
          if (mode === 'mini' && saveRef.current?.miniRun?.caps?.encountersLeft === 0 && miniLastEncounterRef.current) {
            window.setTimeout(() => endMiniRun('Out of encounters'), 0);
          } else if (mode === 'mini' && saveRef.current?.miniRun?.caps?.ballsCapEnabled && ballsEmptyAfterThrow) {
            window.setTimeout(() => endMiniRun('Ran out of balls'), 0);
          }
        } else {
          setStage('broke');
          setCatchStreak(0);
          setMessage(`${capName(wild.name)} broke free!`);
          if ((wild.captureRate ?? 255) <= 100) {
            setPityFails(prev => Math.min(4, prev + 1));
          } else {
            setPityFails(0);
            setCatchStreak(0);
            setAttacksLeft(4);
          }
          setAttackAnim(null);

          // Mini run: if balls are now empty and ball cap is enabled, end after showing the breakout.
          if (mode === 'mini' && saveRef.current?.miniRun?.caps?.ballsCapEnabled && ballsEmptyAfterThrow) {
            window.setTimeout(() => endMiniRun('Ran out of balls'), 0);
          }
        }
      })();
    }, 900);
  }

  // ===== PC Export =====
  function toShowdownName(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s
      .split(/[-_\s]+/g)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function formatBuffLine(mon) {
    const parts = [];
    if (mon?.rarity) {
      const r = String(mon.rarity);
      if (r && r !== 'common') parts.push(r.charAt(0).toUpperCase() + r.slice(1));
    }
    const buffArr = Array.isArray(mon?.buffs) ? mon.buffs : (mon?.buff ? [mon.buff] : []);
    for (const b of buffArr) {
      const d = describeBuff(b);
      if (d) parts.push(d);
    }
    if (mon?.shiny) parts.push('Shiny');
    if (mon?.isDelta) parts.push('Delta Typing');
    if (mon?.types && Array.isArray(mon.types) && mon.isDelta) {
      parts.push(`Typing: ${mon.types.map(t => toShowdownName(t)).join(' / ')}`);
    }
    if (!parts.length) return '';
    return `(${parts.join(' • ')})`;
  }

  function formatMonToShowdown(mon) {
    const header = formatBuffLine(mon);
    const name = toShowdownName(mon?.name || mon?.dexId || 'Pokemon');
    const lines = [];
    if (header) lines.push(header);

    lines.push(`${name}`);

    const abil = mon?.ability;
    let abilLine = 'Custom';
    if (abil && typeof abil === 'object') {
      if (abil.kind === 'custom') abilLine = 'Custom';
      else if (abil.name) abilLine = toShowdownName(abil.name);
    } else if (typeof abil === 'string') {
      abilLine = toShowdownName(abil);
    }
    lines.push(`Ability: ${abilLine}`);

    const prev = Array.isArray(mon?.prevAbilities) ? mon.prevAbilities.filter(Boolean) : [];
    if (prev.length) {
      lines.push(`# Previous Abilities: ${prev.map(toShowdownName).join(' / ')}`);
    }

    const tera = Array.isArray(mon?.types) && mon.types.length ? toShowdownName(mon.types[0]) : 'Normal';
    lines.push(`Tera Type: ${tera}`);

    lines.push(`EVs: 252 HP / 4 Def / 252 SpD`);
    lines.push(`Calm Nature`);

    const moves = Array.isArray(mon?.moves) ? mon.moves : [];
    for (let i = 0; i < 4; i++) {
      const mv = moves[i];
      let mvName = '';
      if (!mv) {
        mvName = 'Tackle';
      } else if (typeof mv === 'string') {
        mvName = toShowdownName(mv);
      } else {
        if (mv.kind === 'illegal' || mv.kind === 'custom') mvName = 'Custom';
        else mvName = toShowdownName(mv.name || mv.id || '');
      }
      if (!mvName) mvName = 'Tackle';
      lines.push(`- ${mvName}`);
    }

    return lines.join('\n');
  }

  function buildPCExportText() {
    const mons = save?.caught || [];
    if (!mons.length) return '';
    return mons.map(formatMonToShowdown).join('\n\n');
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportPCToFile() {
    const text = buildPCExportText();
    if (!text) {
      setMessage('PC is empty.');
      return;
    }
    downloadTextFile('pc-box.txt', text + '\n');
    setMessage('Exported PC to pc-box.txt');
  }

  async function copyPCToClipboard() {
    const text = buildPCExportText();
    if (!text) {
      setMessage('PC is empty.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text + '\n');
      setMessage('Copied PC export to clipboard.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text + '\n';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setMessage('Copied PC export to clipboard.');
    }
  }
  // ======================

  // HUD: show current shiny chance after buffs + streak so it's easy to verify
  const hudTotals = getBuffTotalsFromMons(teamMons, activeTeamUid);
  const hudBaseShiny = settings.shinyCharm ? 0.025 : BASE_SHINY_CHANCE;
  const hudShinyChance = Math.min(
    MAX_SHINY_CHANCE,
    (hudBaseShiny + SHINY_STREAK_BONUS * catchStreak) * (hudTotals.shinyMult ?? 1)
  );
  const hudShinyPct = hudShinyChance * 100;
  const hudOneIn = hudShinyChance > 0 ? Math.round(1 / hudShinyChance) : 0;

  return (
    <div className="app">
      <header className="topBar">
        <div className="brand">Pokémon Catcher</div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <div
            className="shinyChancePill"
            title={`Current shiny chance: ${hudShinyPct.toFixed(2)}% (≈ 1 in ${hudOneIn})\nIncludes active/team buffs (multipliers) and catch streak.`}
            aria-label={`Current shiny chance ${hudShinyPct.toFixed(2)} percent`}
          >
            <span className="sparkle">✨</span>
            <span>{hudShinyPct.toFixed(2)}%</span>
          </div>
          {mode !== 'mini' ? (
            <button
              className="btnSmall topEmojiBtn"
              onClick={() => setShowSettings(true)}
              aria-label="Open Settings"
              title="Settings"
              type="button"
            >
              ⚙️
            </button>
          ) : null}


<button
  className="btnSmall topEmojiBtn"
  onClick={() => setShowProfile(true)}
  aria-label="Open Trainer Profile"
  title="Trainer Profile"
  type="button"
>
  👤
</button>

          {mode === 'mini' ? (
            <>
              <button
                className="runBadge topEmojiBtn"
                title="Mini run info"
                type="button"
                onClick={() => setShowMiniInfo(true)}
              >
                🎮 Mini Run
              </button>
              <button className="btnSmall topEmojiBtn" onClick={returnToMain} title="Return to main save" type="button">🏠</button>
            </>
          ) : (
            <>
              <button
                className="btnSmall topEmojiBtn"
                onClick={() => (mode === 'mini' ? setShowMiniInfo(true) : setShowNewRun(true))}
                title={mode === 'mini' ? 'Mini run info' : 'Start a new mini run'}
                type="button"
              >
                🎮
              </button>
              <button className="btnSmall topEmojiBtn" onClick={() => setShowRunSummaries(true)} title="View mini run summaries" type="button">🗂️</button>
              {hasActiveMini && (
                <button className="btnSmall topEmojiBtn" onClick={resumeMiniRun} title="Resume active mini run" type="button">▶️</button>
              )}
            </>
          )}


          <button
            className="pcButton"
            onClick={exportPCToFile}
            aria-label="Export PC to TXT"
            title="Export PC to TXT"
          >
            <span className="pcText">Export</span>
          </button>
          <button
            className="pcButton"
            onClick={copyPCToClipboard}
            aria-label="Copy PC to clipboard"
            title="Copy PC to clipboard"
          >
            <span className="pcText">Copy</span>
          </button>

          <button
            className="pcButton"
            onClick={() => setShowPC(true)}
            aria-label="Open PC Box"
          >
            <span className="pcIcon" />
            <span className="pcText">PC</span>
          </button>

          <div className="fabCluster">
  <button
    className="btn dexFab"
    onClick={() => {
      setShowDex(true);
    }}
    title="Pokédex"
    aria-label="Open Pokédex"
    type="button"
  >
    📘
  </button>

  <button
    className="btn backpackFab"
    onClick={() => { setShowBackpack(v => !v); }}

    title="Backpack"
    aria-label="Open Backpack"
    type="button"
  >
    🎒 {save.moveTokens ?? 0}
  </button>
</div>

        </div>
      </header>
      {/* Mobile right-side rail: keeps emoji buttons off the top row */}
      <div className="mobileRightRail" aria-label="Quick actions">
        <button
          className="btnSmall railBtn railBtnBackpack"
          onClick={() => { setShowBackpack(v => !v); }}
          title="Backpack"
          aria-label="Backpack"
          type="button"
        >
          <span className="railIcon">🎒</span>
          <span className="railSub" aria-label="Move tokens">{save?.moveTokens ?? 0}</span>
        </button>

        <button className="btnSmall railBtn" onClick={() => setShowDex(true)} title="Pokédex" aria-label="Pokédex" type="button">📘</button>

        {/* Mini-run controls mirror desktop behavior on mobile */}
        {mode === 'mini' ? (
          <>
            <button
              className="btnSmall railBtn railActive"
              title="Mini run info"
              aria-label="Mini run info"
              type="button"
              onClick={() => setShowMiniInfo(true)}
            >
              🎮
            </button>
            <button className="btnSmall railBtn" onClick={returnToMain} title="Return to main save" aria-label="Return to main save" type="button">🏠</button>
          </>
        ) : (
          <>
            <button className="btnSmall railBtn" onClick={() => setShowNewRun(true)} title="Start new run" aria-label="Start new run" type="button">🎮</button>
            <button className="btnSmall railBtn" onClick={() => setShowRunSummaries(true)} title="Run summaries" aria-label="Run summaries" type="button">🗂️</button>
            {hasActiveMini ? (
              <button className="btnSmall railBtn" onClick={resumeMiniRun} title="Resume run" aria-label="Resume run" type="button">▶️</button>
            ) : null}
          </>
        )}

        <button className="btnSmall railBtn" onClick={() => setShowProfile(true)} title="Trainer profile" aria-label="Trainer profile" type="button">👤</button>
        {mode !== 'mini' ? (
          <button className="btnSmall railBtn" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings" type="button">⚙️</button>
        ) : null}
      </div>


      <main className="stage">
        {stage === 'idle' || stage === 'loading' ? (
          <button
            className={`bigBall ${stage === 'loading' ? 'disabled' : ''}`}
            onClick={spawn}
            disabled={stage === 'loading'}
            aria-label="Tap to find a random Pokémon"
          >
            <PokeballIcon variant="poke" size={isMobile ? 140 : 180} />
            <div className="hint">{stage === 'loading' ? 'Searching...' : 'Tap the Poké Ball'}</div>
          </button>
        ) : null}

        {(stage === 'ready' || stage === 'throwing' || stage === 'caught' || stage === 'broke') && wild ? (
          <div className="encounter">
            {/* MOBILE: grass patches above the encounter card */}
            {isMobile && stage === 'caught' && grassSlots.length ? (
              <GrassPatches
                slots={grassSlots}
                onPick={chooseGrassSlot}
                Sprite={SpriteWithFallback}
              />
            ) : null}

            <div className="catchLayout">
              <aside className="teamPane">
                <div className="paneTitle">Team (3)</div>
                {teamMons.length === 0 ? (
                  <div className="paneEmpty">Open PC and add up to 3 Pokémon.</div>
                ) : (
                  <div className="teamList">
                    {teamMons.map((m) => (
                      <button
                        key={m.uid}
                        className={`teamSlot ${m.uid === activeTeamUid ? 'active' : ''}`}
                        onClick={() => setActiveTeam(m.uid)}
                        aria-label={`Set active ${m.name}`}
                      >
                        <SpriteWithFallback mon={m} className="teamSprite" alt={m.name} title={m.name} />
                        <div className="teamMeta">
                          <div className="teamName">{m.name}</div>
                          <div className="teamSub">#{m.dexId}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </aside>

              <div className="wildArea">
                <div className="wildName">Wild {capName(wild.name)} appeared!</div>
                {mode === 'mini' && miniLastEncounter ? (
                  <div className="lastEncounterBadge" title="Last encounter in this run" aria-label="Last encounter">
                    ❗ Last encounter
                  </div>
                ) : null}

                <div className="wildSpriteWrap">
                  <div className="rarityCorner">
                    {wild.isDelta ? <RarityBadge badge={DELTA_BADGE} size={22} /> : null}
                    <RarityBadge badge={wild.badge} size={22} />
                  </div>

                  {/* Shiny indicator (top-right). Keep separate from NEW/CAUGHT badge. */}
                  {wild.shiny ? (
                    <div className="shinyCorner" title="Shiny" aria-label="Shiny">
                      ✨
                    </div>
                  ) : null}

                  {encounterStatus ? (
                    <div
                      className={`caughtStatusCorner ${encounterStatus.cls}`}
                      title={encounterStatus.title}
                      aria-label={encounterStatus.title}
                    >
                      {encounterStatus.label}
                    </div>
                  ) : null}

                  {attackAnim ? (
                    <>
                      <div key={attackAnim.id} className="attackProjectile" />
                      <div key={attackAnim.id + '-n'} className="attackFloat">+{attackAnim.amount}</div>
                    </>
                  ) : null}

                  {activeMon ? (
                    <>
                      <SpriteWithFallback
                        mon={activeMon}
                        className="activeOverlaySprite"
                        alt={activeMon.name}
                        title={activeMon.name}
                      />
                      <div className="activeLabel">Active</div>
                    </>
                  ) : null}

                  <SpriteWithFallback
                    mon={wild}
                    className={`wildSprite ${(stage === 'throwing' || stage === 'caught') ? 'fadeOut' : ''} ${(stage === 'broke') ? 'popIn' : ''}`}
                    alt={wild.name}
                    title={wild.name}
                  />

                  {activeBall && (stage === 'throwing' || stage === 'caught' || stage === 'broke') && (
                    <div className={`ballOverlay ${stage}`}>
                      <PokeballIcon variant={activeBall} size={96} />
                      {stage === 'caught' && <div className="sparkles" />}
                      {stage === 'broke' && <div className="crack" />}
                    </div>
                  )}

                  {(() => {
                    const r = currentEffectiveCaptureRate();
                    const pct = Math.round((r.total / 255) * 100);
                    return (
                      <div className="mobileCatchCorner" aria-label="Current catch rate">
                        <div className="mccTop">{r.total}/255</div>
                        <div className="mccBot">{pct}%</div>
                      </div>
                    );
                  })()}
                </div>

                <div className="subInfo">
                  {(() => {
                    const r = currentEffectiveCaptureRate();
                    return (
                      <>
                        <div>Base catch rate: {wild.captureRate} / 255</div>
                        <div className="catchRateNow">Current catch rate: <b>{r.total} / 255</b></div>
                        {attackBonus > 0 ? <div>Move bonus: +{Math.round(attackBonus)}</div> : null}
                        {(wild.captureRate ?? 255) <= 100 && pityFails > 0 ? (
                          <div>Pity: {Math.round(r.pityRate)} / 255 (max 100)</div>
                        ) : null}
                        {wild.rarity ? (
                          <div style={{ marginTop: 6 }}>
                            Rarity: <b>{capName(wild.rarity)}</b> • Buffs: <b>{formatBuffsShort(wild.buffs)}</b>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </div>

				<div className="ballsArea">
				  <div className="ballsRow" aria-label="Standard balls">
				    {BALLS.map(ball => (
				      <button
				        key={ball.key}
				        className={`ballBtn ${canThrow(ball.key) ? '' : 'disabled'}`}
				        onClick={() => throwBall(ball.key)}
				        disabled={!canThrow(ball.key)}
				        aria-label={`Throw ${ball.label}`}
				      >
				        <PokeballIcon variant={ball.key} size={54} />
				        <div className="ballCount">{save.balls?.[ball.key] ?? 0}</div>
				      </button>
				    ))}
				  </div>

				  <div className="ballsRow specialBallsRow" aria-label="Special balls">
				    {Array.from({ length: 4 }).map((_, i) => {
				      const key = (save.specialBalls?.equipped ?? [])[i] || null;
				      if (!key) {
				        return (
				          <div key={`empty-${i}`} className="ballBtn emptySlot" aria-hidden="true">
				            <div className="ballCount"> </div>
				          </div>
				        );
				      }
				      const def = getBallDef(key);
				      const label = def?.label || key;
				      return (
				        <button
				          key={`special-${key}-${i}`}
				          className={`ballBtn ${canThrow(key) ? '' : 'disabled'}`}
				          onClick={() => throwBall(key)}
				          disabled={!canThrow(key)}
				          aria-label={`Throw ${label}`}
				        >
				          <PokeballIcon variant={key} size={54} />
				          <div className="ballCount">{save.balls?.[key] ?? 0}</div>
				        </button>
				      );
				    })}
				  </div>
				</div>

                <div className="mobileMovesArea" aria-label="Moves">
                  {!activeMon ? (
                    <div className="mobileHint">Pick a team Pokémon (👥) to use moves.</div>
                  ) : (
                    <>
                      <div className="mobileActiveMeta">
                        <span className="mobileActiveName">{activeMon.name}</span>
                        <span className="mobileActiveSub">
                          {monMovesUsedCount}/4 • Attacks {attacksLeft}/4 • KO {Math.round(nextKoChance * 100)}%
                        </span>
                        <div className="mobileBuffDesc">
                          {(() => {
                            // Buff system uses wild.buffs (array). Mobile previously looked at wild.buff (legacy)
                            // which made everything show as "No buff".
                            const parts = [];
                            if (wild?.isDelta) parts.push('Delta Typing');
                            const buffsText = formatBuffsShort(wild?.buffs);
                            if (!buffsText || buffsText === 'none') parts.push('No buff');
                            else parts.push(buffsText);
                            return `Buff: ${parts.join(' • ')}`;
                          })()}
                        </div>
                      </div>

                      <div className="mobileMovesGrid">
                        {(activeMon.moves ?? []).slice(0, 4).map((mv, idx) => (
                          <button
                            key={idx}
                            className={`mobileMoveBtn ${usedMoves[idx] ? 'used' : ''}`}
                            disabled={usedMoves[idx] || stage !== 'ready' || attacksLeft <= 0}
                            onClick={() => useAssistMove(idx)}
                          >
                            {mv?.name ?? `Move ${idx + 1}`}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="message">{message}</div>

                <div className="actionsRow">
                  {stage === 'caught' ? (
                    <>
                      <button className="btn" onClick={spawn}>Find another</button>
                      <button className="btnGhost" onClick={() => setShowPC(true)}>Open PC</button>
                    </>
                  ) : stage === 'broke' ? (
                    <>
                      <button className="btn" onClick={resetToReady}>Try again</button>
                      {mode === 'mini' && miniLastEncounter ? (
                        <button className="btnGhost" onClick={() => endMiniRun('Out of encounters')}>Give up &amp; end run</button>
                      ) : (
                        <button className="btnGhost" onClick={spawn}>Run &amp; find another</button>
                      )}
                    </>
                  ) : (
                    <button className="btnGhost" onClick={resetToIdle}>Reset</button>
                  )}
                </div>
              </div>

              <aside className="movesPane">
                <div className="paneTitle">Active Pokémon</div>
                {!activeMon ? (
                  <div className="paneEmpty">Pick a team Pokémon in the PC to use moves.</div>
                ) : (
                  <>
                    <div className="activeMonCard">
                      <SpriteWithFallback mon={activeMon} className="activeMonSprite" alt={activeMon.name} title={activeMon.name} />
                      <div>
                        <div className="activeMonName">{activeMon.name}</div>
                        <div className="activeMonSub">
                          Moves used: {monMovesUsedCount}/4 • Next KO chance: {Math.round(nextKoChance * 100)}%
                        </div>
                      </div>
                    </div>

                    <div className="movesGrid">
                      {(activeMon.moves ?? []).slice(0, 4).map((mv, idx) => (
                        <button
                          key={idx}
                          className={`moveBtn ${usedMoves[idx] ? 'used' : ''}`}
                          disabled={usedMoves[idx] || stage !== 'ready' || attacksLeft <= 0}
                          onClick={() => useAssistMove(idx)}
                        >
                          {mv?.name ?? `Move ${idx + 1}`}
                        </button>
                      ))}
                    </div>

                    <div className="assistTip">
                      Attack to increase catch rate by 1–30. {Math.round(nextKoChance * 100)}% chance to KO.
                      <div style={{ opacity: 0.8, marginTop: 6 }}>
                        Each move can be used once per encounter.
                      </div>
                    </div>
                  </>
                )}

                {/* DESKTOP: grass patches under the right pane */}
                {!isMobile && stage === 'caught' && grassSlots.length ? (
                  <div style={{ marginTop: 12 }}>
                    <GrassPatches
                      slots={grassSlots}
                      onPick={chooseGrassSlot}
                      Sprite={SpriteWithFallback}
                    />
                  </div>
                ) : null}
              </aside>
            </div>
          </div>
        ) : null}
      </main>

      {showPC && (
        <PCBox
          caughtList={caughtList}
          moveTokens={save.moveTokens ?? 0}
          fusionTokens={save.fusionTokens ?? 0}
          onRefreshAllCaught={refreshAllCaughtDebug}
          onStartFuse={startFusion}
          onCancelFuse={cancelFusion}
          onConfirmFuse={confirmFusion}
          onReplaceMove={replaceMoveWithToken}
          onRelease={releasePokemon}
          onReleaseMany={releaseManyPokemon}
          onToggleLock={toggleLockPokemon}
          onSetLockMany={setLockManyPokemon}
          teamUids={teamUids}
          activeTeamUid={activeTeamUid}
          onToggleTeam={toggleTeam}
          onSetActiveTeam={setActiveTeam}
          onClose={() => setShowPC(false)}
          onEvolve={evolveCaught}
        onSetFusionSpriteChoice={setFusionSpriteChoice}
        />
      )}

      {/* ✅ NEW: Pokédex modal */}
      <TrainerProfile
        open={showProfile}
        onClose={() => setShowProfile(false)}
        save={save}
        setSave={setSave}
        onPickFavoriteSlot={(i) => {
          setPickFavoriteSlot(i);
          setShowDex(true);
        }}
      />

      <NewMiniRunModal
        open={showNewRun}
        onClose={() => setShowNewRun(false)}
        onConfirm={(cfg) => {
          setShowNewRun(false);
          startMiniRun(cfg);
        }}
      />

      <MiniRunInfoModal
        open={showMiniInfo}
        onClose={() => setShowMiniInfo(false)}
        save={save}
        mode={mode}
        hasActiveMini={hasActiveMini}
      />

      <MiniRunSummariesModal
        open={showRunSummaries}
        onClose={() => setShowRunSummaries(false)}
        summaries={runSummaries}
        onOpenSummary={(s) => {
          setShowRunSummaries(false);
          setOpenSummary(s);
        }}
      />

      <MiniRunSummaryModal
        open={!!openSummary}
        onClose={() => {
          setOpenSummary(null);
          setSummaryDetail(null);
        }}
        summary={openSummary}
        onSelectMon={(m, idx) => setSummaryDetail({ summaryId: openSummary?.id, uid: m?.uid, index: idx })}
      />

      {summaryDetail && openSummary?.saveSnapshot ? (
        <PokemonDetail
          mon={(openSummary.saveSnapshot.caught ?? [])[summaryDetail.index]}
          onSetFusionSpriteChoice={setFusionSpriteChoice}
          onClose={() => setSummaryDetail(null)}
          onEvolve={(uid, targetDexId) => evolveCaughtInSummary(openSummary.id, uid, targetDexId)}
          teamUids={[]} // run summary is separate from team management
          onToggleTeam={() => {}}
          moveTokens={openSummary.saveSnapshot.moveTokens ?? 0}
          onReplaceMove={(uid, slot, moveDisplay) => replaceMoveWithTokenInSummary(openSummary.id, uid, slot, moveDisplay)}
          onRelease={() => {}}
          onToggleLock={() => {}}
        />
      ) : null}

      {showDex && (
      <Pokedex
    open={showDex}
    onClose={() => { setShowDex(false); setPickFavoriteSlot(null); }}
    dexList={fullDexList}
    pokedex={save.pokedex ?? {}}
    caughtList={caughtList}
    pickMode={pickFavoriteSlot !== null}
    pickCaughtOnly={true}
    onPickDexNum={(dexNum) => {
      const slot = pickFavoriteSlot;
      if (slot === null || slot === undefined) return;
      setSave(prev => {
        const fav = Array.isArray(prev.favorites) ? prev.favorites.slice(0, 5) : [null, null, null, null, null];
        fav[slot] = Number(dexNum);
        return { ...prev, favorites: fav };
      });
      setShowDex(false);
      setPickFavoriteSlot(null);
    }}
  />
)}


      {/* Team Drawer (mobile) */}
      <div
        className={`teamDrawer ${teamOpen ? 'open' : 'closed'}`}
        aria-label="Team menu"
      >
        <button
          className="teamToggle"
          onClick={() => setTeamOpen(true)}
          aria-label="Open team menu"
          title="Team"
          type="button"
        >
          👥
        </button>

        <div className="teamPanel" role="dialog" aria-label="Team panel">
          <button
            className="teamClose"
            onClick={() => setTeamOpen(false)}
            aria-label="Close team menu"
            title="Close"
            type="button"
          >
            ✕
          </button>

          {teamMons.length === 0 ? (
            <div className="teamPanelEmpty">Open PC and add up to 3 Pokémon.</div>
          ) : (
            <div className="teamCircles">
              {teamMons.map((m) => (
                <button
                  key={m.uid}
                  className={`teamCircle ${m.uid === activeTeamUid ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTeam(m.uid);
                    setTeamOpen(false);
                  }}
                  aria-label={`Switch to ${m.name}`}
                  title={m.name}
                  type="button"
                >
                  <SpriteWithFallback mon={m} className="teamCircleSprite" alt={m.name} title={m.name} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Encounter Tracker */}
      <div
        className={`encounterTracker ${trackerOpen ? 'open' : 'closed'}`}
        aria-label="Encounter tracker"
      >
        <button
          className="trackerToggle"
          onClick={() => setTrackerOpen(true)}
          aria-label="Open encounter tracker"
          title="Encounter stats"
          type="button"
        >
          👁
        </button>

        <div className="trackerPanel" role="dialog" aria-label="Encounter stats panel">

          <div className="trackerHeader">
            <button
              className="trackerReset"
              onClick={confirmResetEncounterTotalsOnly}
              aria-label="Reset encounter totals"
              title="Reset totals"
              type="button"
            >
              Reset
            </button>

            <button
              className="trackerClose"
              onClick={() => setTrackerOpen(false)}
              aria-label="Close encounter tracker"
              title="Close"
              type="button"
            >
              ✕
            </button>
          </div>

          {RARITIES.map(r => (
            <div className="trackerRow" key={r.key}>
              <div className="trackerIcon"><RarityBadge badge={r.badge} size={16} /></div>
              <div className="trackerCounts">
                <span className="trackerPair"><span className="trackerSym" title="Seen">👁</span>{encounter?.[r.key]?.seen ?? 0}</span>
                <span className="trackerPair"><PokeballIcon size={14} />{encounter?.[r.key]?.caught ?? 0}</span>
              </div>
            </div>
          ))}
          <div className="trackerRow">
            <div className="trackerIcon" title="Shiny">✨</div>
            <div className="trackerCounts">
              <span className="trackerPair"><span className="trackerSym" title="Shiny seen">👁</span>{encounter?.shiny?.seen ?? 0}</span>
              <span className="trackerPair"><PokeballIcon size={14} />{encounter?.shiny?.caught ?? 0}</span>
            </div>
          </div>
          <div className="trackerRow">
            <div className="trackerIcon" title="Delta">Δ</div>
            <div className="trackerCounts">
              <span className="trackerPair"><span className="trackerSym" title="Delta seen">👁</span>{encounter?.delta?.seen ?? 0}</span>
              <span className="trackerPair"><PokeballIcon size={14} />{encounter?.delta?.caught ?? 0}</span>
            </div>
          </div>

          <div className="trackerRow trackerTotalRow">
            <div className="trackerIcon" title="Total">Σ</div>
            <div className="trackerCounts">
              <span className="trackerPair"><span className="trackerSym" title="Total seen">👁</span>{
                Object.entries(encounter || {}).filter(([k]) => k !== 'shiny' && k !== 'delta').reduce((a, [, x]) => a + (x?.seen || 0), 0)
              }</span>
              <span className="trackerPair"><PokeballIcon size={14} />{
                Object.entries(encounter || {}).filter(([k]) => k !== 'shiny' && k !== 'delta').reduce((a, [, x]) => a + (x?.caught || 0), 0)
              }</span>
            </div>
          </div>
        </div>
      </div>

      
      {showBackpack ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Backpack" onClick={() => setShowBackpack(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">Backpack</div>
                <div className="modalSub">Tokens & daily gift</div>
              </div>
              <button className="btnGhost" onClick={() => setShowBackpack(false)} aria-label="Close backpack" title="Close" type="button">✕</button>
            </div>

            <div className="settingsGroup">
              <div className="settingsHeading">Tokens</div>
              <div className="settingsRow" style={{justifyContent:'space-between'}}>
                <span>Move Tokens</span>
                <b>{save.moveTokens ?? 0}</b>
              </div>
              <div className="settingsRow" style={{justifyContent:'space-between'}}>
                <span>Fusion Tokens</span>
                <b>{save.fusionTokens ?? 0}</b>
              </div>
            </div>


<div className="settingsGroup">
  <div className="settingsHeading">Exchange</div>
  <div className="settingsHint">Trade <b>10</b> Move Tokens for <b>1</b> unlocked Special Ball.</div>
  {(() => {
    const unlocked = save?.specialBalls?.unlocked ?? {};
    const unlockedKeys = Object.entries(unlocked).filter(([, v]) => !!v).map(([k]) => String(k));
    const maxQty = Math.floor((save?.moveTokens ?? 0) / 10);
    const labelByKey = Object.fromEntries((SPECIAL_BALLS || []).map(b => [b.key, b.label]));
    return (
      <div style={{display:'flex', flexDirection:'column', gap:10}}>
        <div className="settingsRow" style={{justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap'}}>
          <span style={{minWidth:90}}>Special Ball</span>
          <select
            value={exchangeBallKey}
            onChange={(e) => setExchangeBallKey(e.target.value)}
            disabled={!unlockedKeys.length}
            style={{flex:'1 1 180px', maxWidth:240}}
          >
            {unlockedKeys.length ? unlockedKeys.map(k => (
              <option key={k} value={k}>{labelByKey[k] ?? k}</option>
            )) : <option value="premier">No unlocked balls</option>}
          </select>

          <span style={{minWidth:40}}>Qty</span>
          <input
            type="number"
            min={1}
            max={Math.max(1, maxQty)}
            value={exchangeQty}
            onChange={(e) => setExchangeQty(e.target.value)}
            disabled={maxQty <= 0 || !unlockedKeys.length}
            style={{width:90}}
          />
        </div>

        <input
          type="range"
          min={1}
          max={Math.max(1, maxQty)}
          value={exchangeQty}
          onChange={(e) => setExchangeQty(e.target.value)}
          disabled={maxQty <= 0 || !unlockedKeys.length}
        />

        <button
          className="btnSmall"
          type="button"
          disabled={maxQty <= 0 || !unlockedKeys.length}
          onClick={() => {
            const maxNow = Math.floor((save?.moveTokens ?? 0) / 10);
            const take = Math.min(Math.max(1, Math.floor(Number(exchangeQty || 1))), maxNow);
            exchangeMoveTokensForSpecialBalls(exchangeBallKey, take);
            setMessage(`Exchanged ${take * 10} tokens for ${take} ${labelByKey[exchangeBallKey] ?? 'Special Ball'}(s).`);
          }}
        >
          Exchange
        </button>

        <div className="settingsHint">You can exchange up to <b>{maxQty}</b> ball(s) right now.</div>
      </div>
    );
  })()}
</div>


            <div className="settingsGroup">
              <div className="settingsHeading">Daily Gift</div>
              <button
                className={`btnSmall giftBtn ${((save.lastDailyGiftKey || null) !== todayKey()) ? 'giftBtnAvailable' : 'giftBtnUnavailable'}`}
                type="button"
                disabled={((save.lastDailyGiftKey || null) === todayKey())}
                onClick={() => grantDailyGiftIfAvailable()}
                aria-label="Claim daily gift"
              >
                {((save.lastDailyGiftKey || null) !== todayKey()) ? 'Claim Daily Gift' : 'Daily Gift Claimed'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Settings" onClick={closeSettings}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">Settings</div>
                <div className="modalSub">Difficulty & rewards</div>
              </div>
              <button className="btnGhost" onClick={closeSettings} aria-label="Close settings" title="Close" type="button">✕</button>
            </div>

            <div className="settingsGroup">
              <div className="settingsHeading">Rewards</div>

              <label className="settingsRow">
                <input type="checkbox" checked={!!settings.ballOnCatch} onChange={(e) => updateSetting('ballOnCatch', e.target.checked)} />
                <span>Receive Ball on catch</span>
              </label>
              <label className="settingsRow">
                <input type="checkbox" checked={!!settings.ballOnDefeat} onChange={(e) => updateSetting('ballOnDefeat', e.target.checked)} />
                <span>Receive Ball on defeat (KO)</span>
              </label>
              <label className="settingsRow">
                <input type="checkbox" checked={!!settings.ballOnRelease} onChange={(e) => updateSetting('ballOnRelease', e.target.checked)} />
                <span>Receive Ball on release</span>
              </label>
              <label className="settingsRow">
                <input type="checkbox" checked={!!settings.moveTokenOnRelease} onChange={(e) => updateSetting('moveTokenOnRelease', e.target.checked)} />
                <span>Receive Move token on release</span>
              </label>
            </div>

            <div className="settingsGroup">
              <div className="settingsHeading">Shiny rates</div>
              <label className="settingsRow">
                <input type="checkbox" checked={!!settings.shinyCharm} onChange={(e) => updateSetting('shinyCharm', e.target.checked)} />
                <span>Shiny Charm (boosts base rate from 1/500 to 2.5%)</span>
              </label>
              <div className="settingsHint">
                Current base shiny rate: <b>{settings.shinyCharm ? '2.5%' : '1/500'}</b>
              </div>
            </div>

            <div className="settingsActions">
              <button
                className="btnSmall"
                onClick={() => {
                  if (!window.confirm('Reset balls back to the default amounts?')) return;
                  resetBallsToDefault();
                  setMessage('Balls reset to default amounts.');
                }}
                type="button"
              >
                Reset Balls
              </button>

              <button
                className="btnSmall"
                onClick={() => {
                  if (!window.confirm('Release all unlocked Pokémon in your PC Box? Locked Pokémon will be kept. (No rewards)')) return;
                  resetPCBox();
                  setMessage('PC Box cleared (locked Pokémon kept).');
                }}
                type="button"
              >
                Reset PC Box
              </button>

              <button
                className="btnSmall danger"
                onClick={() => {
                  if (!window.confirm('Reset all progress and start over?')) return;
                  const fresh = defaultSave();
                  setSave(fresh);
                  saveSave(fresh);
                  resetToIdle();
                  setShowSettings(false);
                }}
                type="button"
              >
                Reset from scratch
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

function SpriteWithFallback({ mon, className, alt, title }) {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const h = () => setTick((x) => x + 1);
    window.addEventListener(SPRITE_CACHE_EVENT, h);
    return () => window.removeEventListener(SPRITE_CACHE_EVENT, h);
  }, []);

  const candidates = React.useMemo(() => getShowdownSpriteCandidates(mon), [mon, tick]);
  const [i, setI] = React.useState(0);

  React.useEffect(() => {
    setI(0);
  }, [tick]);

  const src = candidates[i] || candidates[candidates.length - 1] || '';

  return (
    <img
      className={className}
      src={src}
      alt={alt || ''}
      title={title}
      onLoad={(e) => {
        cacheSpriteSuccess(mon, e.currentTarget.currentSrc || src);
      }}
      onError={() => setI((prev) => Math.min(prev + 1, candidates.length - 1))}
    />
  );
}