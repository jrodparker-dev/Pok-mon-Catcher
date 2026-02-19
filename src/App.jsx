// App.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getShowdownSpriteCandidates, cacheSpriteSuccess, SPRITE_CACHE_EVENT } from './spriteLookup.js';
import RarityBadge from './components/RarityBadge.jsx';
import GrassPatches from './components/GrassPatches.jsx';
import Pokedex from './components/Pokedex.jsx';
import TrainerProfile from './components/TrainerProfile.jsx';
import { BALLS, calcCatchChance } from './balls.js';
import { fetchPokemonBundleByDexId, toID } from './pokeapi.js';
import { defaultSave, loadSave, saveSave } from './storage.js';
import { getEvolutionOptions } from './evolution.js';
import { getRandomSpawnableDexId, getDexEntryByNum } from './dexLocal.js';
import { spriteFallbacksFromBundle } from './sprites.js';
import { getAllBaseDexEntries } from './dexLocal.js';
import { getDexById } from './dexLocal.js';


const BASE_SHINY_CHANCE = 1 / 500; // default: 1 in 500
const SHINY_STREAK_BONUS = 0.005; // +0.5% per consecutive catch
const MAX_SHINY_CHANCE = 0.10; // safety cap (10%)

import PokeballIcon from './components/PokeballIcon.jsx';
import PCBox from './components/PCBox.jsx';

import { pickWeightedRarity, makeBuff, rollDelta, RARITIES, DELTA_BADGE } from './rarity.js';
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
  const [save, setSave] = useState(() => {
    const base = defaultSave();
    const loaded = loadSave();
    if (!loaded) return base;
    return {
      ...base,
      ...loaded,
      balls: { ...base.balls, ...(loaded.balls ?? {}) },
      encounter: { ...base.encounter, ...(loaded.encounter ?? {}) },
      trainer: { ...base.trainer, ...(loaded.trainer ?? {}) },
      settings: { ...(base.settings ?? {}), ...(loaded.settings ?? {}) },
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
          isDelta: !!(m.isDelta || m.delta || m.buff?.kind === 'delta-typing'),
        };
      }),
    };
  });

  // wild encounter = full bundle + rarity info
  const [wild, setWild] = useState(null);

  // idle|loading|ready|throwing|caught|broke
  const [stage, setStage] = useState('idle');
  const [catchStreak, setCatchStreak] = useState(0);

  const [message, setMessage] = useState('');
  const [activeBall, setActiveBall] = useState(null);
  const [showPC, setShowPC] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [showBackpack, setShowBackpack] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const devCheat = useRef({bagTaps: 0, armed: false, lastTap: 0});


  // ✅ NEW: Pokedex modal state
  const [showDex, setShowDex] = useState(false);
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

    return { ...prev, balls, lastDailyGiftKey: key };
  });

  // NOTE: claimed won't reliably reflect inside setSave due to async batching,
  // so do it a cleaner way by reading current save:
  const already = (save.lastDailyGiftKey || null) === key;
  if (already) {
    setMessage('Daily Gift already claimed today.');
  } else {
    setMessage('Daily Gift claimed: +10 Poké, +10 Great, +10 Ultra, +1 Master!');
  }
}


  function resetEncounterAssist() {
    setAttackBonus(0);
    setMoveUsedByUid({});
    setAttackAnim(null);
    setMovesUsedSinceThrow(0);
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
      if (curSettings.ballOnRelease) {
        const ballKey = pickRandomBallKey();
        balls[ballKey] = (balls[ballKey] ?? 0) + 1;
      }

      const moveTokens = curSettings.moveTokenOnRelease ? ((prev.moveTokens ?? 0) + 1) : (prev.moveTokens ?? 0);

      const nextCaught = caught.slice(0, idx).concat(caught.slice(idx + 1));
      const teamUids = Array.isArray(prev.teamUids) ? prev.teamUids.filter(x => x !== uid) : [];
      const activeTeamUid = teamUids.includes(prev.activeTeamUid) ? prev.activeTeamUid : (teamUids[0] ?? null);

      return { ...prev, balls, moveTokens, caught: nextCaught, teamUids, activeTeamUid };
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

        if (curSettings.ballOnRelease) {
          const ballKey = pickRandomBallKey();
          balls[ballKey] = (balls[ballKey] ?? 0) + 1;
        }
        if (curSettings.moveTokenOnRelease) {
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

      return { ...prev, balls, moveTokens, caught: remaining, teamUids, activeTeamUid };
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
    const pityRate = pityAdjustedCaptureRate(wild.captureRate, pityFails);
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
    saveSave(save);
  }, [save]);

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
      buff: mon.buff,
      isDelta: !!(mon.isDelta || mon.buff?.kind === 'delta-typing'),
      types: mon.isDelta ? mon.types : (evolvedBundle.types ?? []),
    };

    const evolvedRecord = await buildCaughtRecord(evolvedWild, spriteUrlResolved, !!mon.shiny);

    evolvedRecord.uid = mon.uid;
    evolvedRecord.caughtAt = mon.caughtAt;
    evolvedRecord.locked = !!mon.locked;

    evolvedRecord.prevAbilities = [...(mon.prevAbilities ?? []), mon.ability?.name].filter(Boolean);
    evolvedRecord.isDelta = !!(mon.isDelta || mon.buff?.kind === 'delta-typing');

    if (mon.isDelta || mon.buff?.kind === 'delta-typing') {
      evolvedRecord.types = mon.types;
    }
    const toBaseId = toID(evolvedRecord.formId ?? evolvedRecord.speciesId ?? evolvedRecord.name);

// ✅ Keep the old base forever + add the new base forever (forms map to base species)
bumpDexCaughtFromAny(fromBaseId, !!mon.shiny, !!(mon.isDelta || mon.buff?.kind === 'delta-typing'), mon?.rarity);
bumpDexCaughtFromAny(toBaseId, !!mon.shiny, !!(evolvedRecord.isDelta || evolvedRecord.buff?.kind === 'delta-typing'), evolvedRecord?.rarity ?? mon?.rarity);



    setSave(prev => {
      const next = [...(prev.caught ?? [])];
      next[idx] = evolvedRecord;
      return { ...prev, caught: next };
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



  function bumpDexCaughtByNum(dexNum, isShiny, isDelta, rarityKey, baseIdMaybe) {
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

const { nextTrainer } = applyCatchProgress(cur.trainer ?? base.trainer, {
  rarityKey,
  isShiny,
  isDelta,
  dexCaughtBefore,
  dexCaughtAfter,
});

return { ...cur, pokedex: dex, trainer: nextTrainer };
  });
}



function bumpDexSeenFromAny(anyIdOrNum, isShiny, isDelta) {
  const { baseId, baseNum } = getBaseDexInfoFromAny(anyIdOrNum);
  bumpDexSeenByNum(baseNum, isShiny, isDelta, baseId);
}

function bumpDexCaughtFromAny(anyIdOrNum, isShiny, isDelta, rarityKey) {
  const { baseId, baseNum } = getBaseDexInfoFromAny(anyIdOrNum);
  bumpDexCaughtByNum(baseNum, isShiny, isDelta, rarityKey, baseId);
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
  async function rollOneEncounter() {
    const dexId = getRandomSpawnableDexId();
    const bundle = await fetchPokemonBundleByDexId(dexId);

    const rarity = pickWeightedRarity();
    const buff = makeBuff(rarity.key, bundle);
    const baseShiny = settings.shinyCharm ? 0.025 : BASE_SHINY_CHANCE;
    const shinyChance = Math.min(MAX_SHINY_CHANCE, baseShiny + SHINY_STREAK_BONUS * catchStreak);
    const isShiny = Math.random() < shinyChance;

    const isDelta = rollDelta(rarity.key);
    const rolledTypesForWild = isDelta ? rollDeltaTypes(bundle.types ?? []) : (bundle.types ?? []);

    bumpSeen(rarity.key, isShiny, isDelta);

    // ✅ Dex seen (base species, regardless of form)
bumpDexSeenFromAny(bundle.dexId ?? bundle.name ?? bundle.num ?? bundle.id, isShiny, isDelta);


    const finalFallback = isShiny
      ? (bundle.fallbackShinySprite || bundle.fallbackSprite)
      : bundle.fallbackSprite;

    // NOTE: SpriteWithFallback will do the real lookup + caching.
    return {
      ...bundle,
      rarity: rarity.key,
      badge: rarity.badge,
      buff,
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
      const mons = await Promise.all([rollOneEncounter(), rollOneEncounter(), rollOneEncounter()]);
      setGrassSlots(mons);
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

    // Start the picked encounter
    setMessage('');
    setStage('ready');
    setWild(picked);
    setActiveBall(null);
    setPityFails(0);
    resetEncounterAssist();

    // IMPORTANT: Do NOT roll new grass here.
    // Grass only appears after you catch a Pokémon.
  }

  async function spawn() {
    if (stage === 'loading' || stage === 'throwing') return;

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
    setSave(prev => ({
      ...prev,
      balls: {
        ...prev.balls,
        [ballKey]: Math.max(0, (prev.balls?.[ballKey] ?? 0) - 1),
      },
    }));
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

  function applyStatBuff(baseStats, buff) {
    const s = { ...baseStats };
    if (!buff || buff.kind === 'none') return s;

    if (buff.kind === 'stat+10' || buff.kind === 'stat+20' || buff.kind === 'stat+30') {
      s[buff.stat] = (s[buff.stat] ?? 0) + buff.amount;
    }
    if (buff.kind === 'stat+15x2') {
      const [a, b] = buff.stats;
      s[a] = (s[a] ?? 0) + buff.amount;
      s[b] = (s[b] ?? 0) + buff.amount;
    }
    return s;
  }

  async function buildCaughtRecord(w, spriteUrlResolved, isShiny = false) {
    const learnset = w.learnsetMoves ?? [];
    let moves = pickUnique(learnset, 4).map(m => ({ kind: 'learnset', name: m }));

    let ability;
    if (w.buff?.kind === 'chosen-ability') {
      const native = w.nativeAbilities ?? [];
      const picked = native.length
        ? native[Math.floor(Math.random() * native.length)].name
        : 'pressure';
      ability = { kind: 'chosen', name: picked };
    } else {
      const all = await getAllAbilities();
      ability = rollAbility(all);
    }

    if (w.buff?.kind === 'custom-move') {
      const others = pickUnique(learnset, 3).map(m => ({ kind: 'learnset', name: m }));
      moves = [{ kind: 'custom', name: 'Custom Move' }, ...others];
    }

    const baseTypes = w.types ?? [];
    const types = w?.isDelta ? rollDeltaTypes(baseTypes) : baseTypes;

    const baseStats = w.baseStats ?? {};
    const finalStats = applyStatBuff(baseStats, w.buff);

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
      buff: w.buff,

      spriteUrl: spriteUrlResolved,
      shiny: !!isShiny,
      isDelta: !!w?.isDelta,
      shinyBoostStat,

      baseStats,
      finalStats,
      types,

      ability,
      moves: moves.slice(0, 4),

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

    const ball = BALLS.find(b => b.key === ballKey);
    if (!ball) return;

    decrementBall(ballKey);

    setMovesUsedSinceThrow(0);

    setActiveBall(ballKey);
    setStage('throwing');
    setMessage('');

    const spriteUrlResolved = wild.spriteUrl;
    const isShiny = !!wild.shiny;

    const { pityRate, total: effectiveRate } = currentEffectiveCaptureRate();
    let chance = calcCatchChance(effectiveRate, ball);
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
          setCatchStreak((s) => s + 1);
          resetEncounterAssist();
          rollGrassSlots();

          const record = await buildCaughtRecord(wild, spriteUrlResolved, isShiny);

          // ✅ Dex caught (base species, regardless of form)
bumpDexCaughtFromAny(
  record?.formId ?? record?.speciesId ?? wild.dexId ?? wild.name ?? wild.num ?? wild.id,
  isShiny,
  !!record?.isDelta,
  wild?.rarity ?? record?.rarity
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

            return { ...cur, caught: nextCaught, encounter: e };
          });
        } else {
          setStage('broke');
          setMessage(`${capName(wild.name)} broke free!`);
          if ((wild.captureRate ?? 255) <= 100) {
            setPityFails(prev => Math.min(4, prev + 1));
          } else {
            setPityFails(0);
            setCatchStreak(0);
            setAttacksLeft(4);
          }
          setAttackAnim(null);
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
    if (mon?.buff && mon.buff.kind && mon.buff.kind !== 'none') {
      const b = mon.buff;
      if (b.kind?.startsWith('stat+')) {
        if (b.stat && b.amount) parts.push(`+${b.amount} ${String(b.stat).toUpperCase()}`);
        else parts.push(b.kind);
      } else if (b.kind === 'stat+15x2') {
        parts.push(`+${b.amount} ${String(b.stats?.[0] || '').toUpperCase()} & +${b.amount} ${String(b.stats?.[1] || '').toUpperCase()}`);
      } else if (b.kind === 'illegal-move') {
        parts.push('Illegal Move');
      } else if (b.kind === 'custom-move') {
        parts.push('Custom Move');
      } else if (b.kind === 'delta-typing') {
        parts.push('Delta Typing');
      } else if (b.kind === 'chosen-ability') {
        parts.push('Pick Ability');
      } else {
        parts.push(b.kind);
      }
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

  return (
    <div className="app">
      <header className="topBar">
        <div className="brand">Pokémon Catcher</div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btnSmall"
            onClick={() => setShowSettings(true)}
            aria-label="Open Settings"
            title="Settings"
            type="button"
          >
            ⚙️
          </button>


<button
  className="btnSmall"
  onClick={() => setShowProfile(true)}
  aria-label="Open Trainer Profile"
  title="Trainer Profile"
  type="button"
>
  👤
</button>


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
      // Secret dev cheat: tap backpack 5x then Pokédex
      if (devCheat.current.armed) {
        setSave(prev => {
          const base = defaultSave();
          const cur = { ...base, ...prev, balls: { ...base.balls, ...(prev?.balls ?? {}) } };
          const nextBalls = { ...cur.balls };
          for (const k of Object.keys(nextBalls)) nextBalls[k] = (nextBalls[k] ?? 0) + 99;
          return { ...cur, balls: nextBalls };
        });
        devCheat.current.armed = false;
        devCheat.current.bagTaps = 0;
      }
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
    onClick={() => {
  // Secret dev cheat arming: tap backpack 5 times (within 3s between taps)
  const now = Date.now();
  if (now - (devCheat.current.lastTap || 0) > 3000) devCheat.current.bagTaps = 0;
  devCheat.current.lastTap = now;
  devCheat.current.bagTaps = (devCheat.current.bagTaps || 0) + 1;
  if (devCheat.current.bagTaps >= 5) devCheat.current.armed = true;

  grantDailyGiftIfAvailable();
  setShowBackpack(v => !v);
}}

    title="Backpack"
    aria-label="Open Backpack"
    type="button"
  >
    🎒 {save.moveTokens ?? 0}
  </button>
</div>

        </div>
      </header>

      <main className="stage">
        {stage === 'idle' || stage === 'loading' ? (
          <button
            className={`bigBall ${stage === 'loading' ? 'disabled' : ''}`}
            onClick={spawn}
            disabled={stage === 'loading'}
            aria-label="Tap to find a random Pokémon"
          >
            <PokeballIcon variant="poke" size={180} />
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
                          <div>Pity: {r.pityRate} / 255 (max 100)</div>
                        ) : null}
                        {wild.rarity ? (
                          <div style={{ marginTop: 6 }}>
                            Rarity: <b>{capName(wild.rarity)}</b> • Buff: <b>{wild.buff?.kind ?? 'none'}</b>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </div>

                <div className="ballsRow">
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
                            const parts = [];
                            if (wild?.isDelta) parts.push('Delta Typing');
                            const b = wild?.buff;
                            if (!b || b.kind === 'none') {
                              parts.push('No buff');
                            } else if (b.kind === 'stat+10' || b.kind === 'stat+20' || b.kind === 'stat+30') {
                              parts.push(`+${b.amount} ${String(b.stat || '').toUpperCase()}`);
                            } else if (b.kind === 'stat+15x2') {
                              const a = String(b.stats?.[0] || '').toUpperCase();
                              const c = String(b.stats?.[1] || '').toUpperCase();
                              parts.push(`+${b.amount} ${a} & +${b.amount} ${c}`);
                            } else if (b.kind === 'custom-move') {
                              parts.push('Custom Move');
                            } else if (b.kind === 'chosen-ability') {
                              parts.push('Chosen Ability');
                            } else {
                              parts.push(String(b.kind));
                            }
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
                      <button className="btnGhost" onClick={spawn}>Run & find another</button>
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
        />
      )}

      {/* ✅ NEW: Pokédex modal */}
      <TrainerProfile open={showProfile} onClose={() => setShowProfile(false)} save={save} />

      {showDex && (
      <Pokedex
    open={showDex}
    onClose={() => setShowDex(false)}
    dexList={fullDexList}
    pokedex={save.pokedex ?? {}}
    caughtList={caughtList}
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

      {showSettings ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Settings" onClick={() => setShowSettings(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">Settings</div>
                <div className="modalSub">Difficulty & rewards</div>
              </div>
              <button className="btnGhost" onClick={() => setShowSettings(false)} aria-label="Close settings" title="Close" type="button">✕</button>
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