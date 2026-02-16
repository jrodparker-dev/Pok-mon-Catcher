import React, { useEffect, useMemo, useState } from 'react';
import { getShowdownSpriteCandidates, cacheSpriteSuccess, SPRITE_CACHE_EVENT } from './spriteLookup.js';
import RarityBadge from './components/RarityBadge.jsx';
import { BALLS, calcCatchChance } from './balls.js';
import { fetchPokemonBundleByDexId, toID } from './pokeapi.js';
import { defaultSave, loadSave, saveSave } from './storage.js';
import { getEvolutionOptions } from './evolution.js';
import { getRandomSpawnableDexId } from './dexLocal.js';
import { spriteFallbacksFromBundle } from './sprites.js';

const SHINY_CHANCE = 0.025; // 2.5%


import PokeballIcon from './components/PokeballIcon.jsx';
import PCBox from './components/PCBox.jsx';

import { pickWeightedRarity, makeBuff, rollDelta, RARITIES, DELTA_BADGE } from './rarity.js';
import { getAllAbilities, rollAbility } from './abilityPool.js';
import { rollDeltaTypes } from './typePool.js';
import { pickUnique, uid } from './utils.js';

function capName(name) {
  if (!name) return '';
  return name
    .split('-')
    .map(s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s))
    .join(' ');
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
      caught: (loaded.caught ?? base.caught ?? []).map((m) => {
        const dexNum = m.dexId ?? m.dexNum ?? m.num ?? (typeof m.id === 'number' ? m.id : undefined);
        const formId = m.formId ?? m.speciesId ?? m.dexIdString ?? m.dexIdPS ?? (typeof m.dexId === 'string' ? m.dexId : null) ?? toID(m.name);
        return { ...m, dexId: typeof dexNum === 'number' ? dexNum : m.dexId, formId: formId, speciesId: m.speciesId ?? formId, isDelta: !!(m.isDelta || m.delta || m.buff?.kind === 'delta-typing') };
      }),
    };
  });

  // wild encounter = full bundle + rarity info
  const [wild, setWild] = useState(null);

  // idle|loading|ready|throwing|caught|broke
  const [stage, setStage] = useState('idle');

  const [message, setMessage] = useState('');
  const [activeBall, setActiveBall] = useState(null);
  const [showPC, setShowPC] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [showBackpack, setShowBackpack] = useState(false);

  // pity: 0..4 => multiplier 1..5
  const [pityFails, setPityFails] = useState(0);
  const pityMultiplier = Math.min(5, 1 + pityFails);

  const encounter = save.encounter ?? defaultSave().encounter;



// Team (up to 3) and battle-assist state (per encounter)
const teamUids = Array.isArray(save.teamUids) ? save.teamUids.slice(0, 3) : [];
const activeTeamUid = save.activeTeamUid ?? (teamUids[0] ?? null);

const teamMons = useMemo(() => {
  const map = new Map((save.caught ?? []).map(m => [m.uid, m]));
  return teamUids.map(u => map.get(u)).filter(Boolean).map(m => ({...m, name: capName(m.name)}));
}, [save.caught, save.teamUids]);

const activeMon = useMemo(() => teamMons.find(m => m.uid === activeTeamUid) ?? teamMons[0] ?? null, [teamMons, activeTeamUid]);

// Per-encounter move usage + catch bonus from attacks
const [moveUsedByUid, setMoveUsedByUid] = useState(() => ({})); // { [uid]: boolean[4] }
const [attackBonus, setAttackBonus] = useState(0);
const [attackAnim, setAttackAnim] = useState(null); // {id, amount}
const [movesUsedSinceThrow, setMovesUsedSinceThrow] = useState(0);
	// Total attacks allowed per encounter across the whole team
	const [attacksLeft, setAttacksLeft] = useState(4);

const usedMoves = activeMon ? (moveUsedByUid[activeMon.uid] ?? [false,false,false,false]) : [false,false,false,false];
const monMovesUsedCount = usedMoves.filter(Boolean).length;
const nextKoChance = [0.05, 0.15, 0.25, 0.45][Math.min(3, movesUsedSinceThrow)] ?? 0.45;

function setTeamUids(nextUids) {
  const uniq = Array.from(new Set(nextUids)).slice(0, 3);
  setSave(prev => ({...prev, teamUids: uniq, activeTeamUid: prev.activeTeamUid && uniq.includes(prev.activeTeamUid) ? prev.activeTeamUid : (uniq[0] ?? null)}));
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
  setSave(prev => ({...prev, activeTeamUid: uidToActivate}));
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

    const ballKey = pickRandomBallKey();
    const balls = { ...(prev.balls ?? {}) };
    balls[ballKey] = (balls[ballKey] ?? 0) + 1;

    const moveTokens = (prev.moveTokens ?? 0) + 1;

    const nextCaught = caught.slice(0, idx).concat(caught.slice(idx + 1));
    const teamUids = Array.isArray(prev.teamUids) ? prev.teamUids.filter(x => x !== uid) : [];
    const activeTeamUid = teamUids.includes(prev.activeTeamUid) ? prev.activeTeamUid : (teamUids[0] ?? null);

    return { ...prev, balls, moveTokens, caught: nextCaught, teamUids, activeTeamUid };
  });
}



function awardRandomBall() {
  const r = Math.random();
  const key = r < 0.05 ? 'master' : r < 0.20 ? 'ultra' : r < 0.45 ? 'great' : 'poke';
  setSave(prev => ({
    ...prev,
    balls: { ...prev.balls, [key]: (prev.balls?.[key] ?? 0) + 1 },
  }));
  return key;
}

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
  return {pityRate, total};
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
  const used = (moveUsedByUid[activeMon.uid] ?? [false,false,false,false]).slice();
  if (used[moveIndex]) return;

  const amount = 1 + Math.floor(Math.random() * 30);
  setAttackBonus(prev => prev + amount);
  setAttackAnim({ id: uid(), amount });

  // Mark move used
  used[moveIndex] = true;
  setMoveUsedByUid(prev => ({...prev, [activeMon.uid]: used}));

  // Spend one of the 4 total attacks for this encounter
  setAttacksLeft(prev => Math.max(0, prev - 1));

  // KO roll based on which move number this is since the last ball throw (1..)
  const idx = Math.min(3, movesUsedSinceThrow); // count BEFORE marking this one
  const koChance = [0.05, 0.15, 0.25, 0.45][idx] ?? 0.45;
  const ko = Math.random() < koChance;
  setMovesUsedSinceThrow(prev => prev + 1);

  if (ko) {
    const ballKey = awardRandomBall();
    setMessage(`Oh no! ${capName(wild.name)} was KO'd. You found a ${capName(ballKey)} ball!`);
    // force switch to next team mon
    advanceActiveTeam();
    // reset pity and spawn a new wild after a short beat
    setPityFails(0);
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

// If dexId is a string like "charizard", treat it as speciesId, not a number
const speciesId = typeof m.dexId === 'string' ? m.dexId : (m.speciesId ?? undefined);

// If you have a lookup available in your project, resolve dexNum from speciesId here
// dexNum = dexNum ?? lookupDexNum(speciesId);

    // If any path ever stuffed the name into "Pikachu Pikachu" or "#25 Pikachu", normalize it here.
    const rawName = String(m.name ?? '').trim();

    // Strip a leading dex prefix if it exists (e.g. "#25 Pikachu" or "25 Pikachu")
    const noDexPrefix = rawName.replace(/^\s*#?\d+\s+/i, '').trim();

    // If the name accidentally got duplicated (e.g. "Pikachu Pikachu"), collapse it
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
      name: cleanName,                 // ALWAYS just the name
      pcLabel: dex ? `#${dex} ${cleanName}` : cleanName,  // UI label for PC rows
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
  // Find the mon
  const idx = (save.caught ?? []).findIndex(m => m.uid === uidToEvolve);
  if (idx < 0) return;

  const mon = save.caught[idx];

  // Determine evolution target using local PS dex data.
  // - If targetDexId is provided (split evo picker), use it.
  // - Otherwise, pick randomly among all immediate evolutions.
  const options = targetDexId ? [targetDexId] : getEvolutionOptions(mon.formId ?? mon.speciesId ?? mon.name);
  if (!options || options.length === 0) {
    alert('This Pokémon cannot evolve.');
    return;
  }

  const chosenDexId = targetDexId || options[Math.floor(Math.random() * options.length)];

  // Fetch evolved bundle (stats/types/abilities from local pokedex.ts, learnset from PokéAPI)
  const evolvedBundle = await fetchPokemonBundleByDexId(chosenDexId);

  // Sprite resolution (pinkmon-style fallbacks) - preserve shiny through evolution
  const evoCandidates = spriteFallbacksFromBundle(evolvedBundle, !!mon.shiny);
  const evoFinalFallback = mon.shiny ? (evolvedBundle.fallbackShinySprite || evolvedBundle.fallbackSprite) : evolvedBundle.fallbackSprite;
  const spriteCandidates = [...evoCandidates, evoFinalFallback].filter(Boolean);
      const spriteUrlResolved = spriteCandidates[0] || "";

// Build evolved record while keeping buff/rarity
  const evolvedWild = {
    ...evolvedBundle,
    rarity: mon.rarity,
    badge: mon.badge,
    buff: mon.buff,
    isDelta: !!(mon.isDelta || mon.buff?.kind === 'delta-typing'),
    types: mon.isDelta ? mon.types : (evolvedBundle.types ?? []),
  };

  // Rebuild like catching, but preserve uid + caughtAt + prevAbilities
  const evolvedRecord = await buildCaughtRecord(evolvedWild, spriteUrlResolved, !!mon.shiny);

  evolvedRecord.uid = mon.uid;               // replace in-place
  evolvedRecord.caughtAt = mon.caughtAt;     // keep original catch timestamp

  // Ability history
  evolvedRecord.prevAbilities = [...(mon.prevAbilities ?? []), mon.ability?.name].filter(Boolean);
  evolvedRecord.isDelta = !!(mon.isDelta || mon.buff?.kind === 'delta-typing');

  // If Delta typing, KEEP existing delta typing (the “buff”)
  if (mon.isDelta || mon.buff?.kind === 'delta-typing') {
    evolvedRecord.types = mon.types;
  }

  // If illegal-move buff, keep the *buff type* but re-roll illegal move against evolved learnset
  // (buildCaughtRecord already does this as long as buff.kind === 'illegal-move')

  // Replace in save
  setSave(prev => {
    const next = [...(prev.caught ?? [])];
    next[idx] = evolvedRecord;
    return { ...prev, caught: next };
  });
}


  async function spawn() {
    if (stage === 'loading' || stage === 'throwing') return;

    setMessage('');
    setStage('loading');
    setWild(null);
    setActiveBall(null);
    setPityFails(0);
    setAttacksLeft(4);

    try {
      // Pinkmon-style spawn: always pick a random PS dex id (forms spawn distinctly)
      const dexId = getRandomSpawnableDexId();
      const bundle = await fetchPokemonBundleByDexId(dexId);

      const rarity = pickWeightedRarity();
      const buff = makeBuff(rarity.key, bundle);
      const isShiny = Math.random() < SHINY_CHANCE;
      const isDelta = rollDelta(rarity.key);
      const rolledTypesForWild = isDelta ? rollDeltaTypes(bundle.types ?? []) : (bundle.types ?? []);

      // Update encounter tracker (seen)
      setSave(prev => {
        const base = defaultSave();
        const cur = { ...base, ...prev, encounter: { ...base.encounter, ...(prev.encounter ?? {}) } };
        const e = { ...cur.encounter };
        const rk = rarity.key;
        if (e[rk]) e[rk] = { ...e[rk], seen: (e[rk].seen ?? 0) + 1 };
        if (isShiny) e.shiny = { ...e.shiny, seen: (e.shiny.seen ?? 0) + 1 };
        if (isDelta) e.delta = { ...e.delta, seen: (e.delta?.seen ?? 0) + 1 };
        return { ...cur, encounter: e };
      });

      // Resolve a working sprite URL using robust PS fallbacks (pinkmon logic) + official artwork fallback
      const psCandidates = spriteFallbacksFromBundle(bundle, isShiny);
      const finalFallback = isShiny ? (bundle.fallbackShinySprite || bundle.fallbackSprite) : bundle.fallbackSprite;
      const spriteCandidates = [...psCandidates, finalFallback].filter(Boolean);
      const spriteUrlResolved = spriteCandidates[0] || "";

      const badge = isDelta ? DELTA_BADGE : rarity.badge;

      setWild({
        ...bundle,
        rarity: rarity.key,
        badge,
        buff,
        shiny: isShiny,
        types: rolledTypesForWild,
        isDelta: isDelta,
        spriteUrl: spriteUrlResolved,
        fallbackSprite: finalFallback,
      });

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
    // Keep attack bonus and used moves across "Try again" (same encounter)
    setAttackAnim(null);
    // IMPORTANT: do NOT reset pity here, so it stacks across retries
  }

  function resetToIdle() {
    setStage('idle');
    setActiveBall(null);
    setWild(null);
    setMessage('');
    setPityFails(0);
    setAttacksLeft(4);
    resetEncounterAssist();
  }

  function applyStatBuff(baseStats, buff) {
    const s = { ...baseStats }; // hp/atk/def/spa/spd/spe
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
    const learnsetSet = new Set(learnset);

    // Default 4 learnset moves
    let moves = pickUnique(learnset, 4).map(m => ({ kind: 'learnset', name: m }));

    // Ability
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

    // Legendary: custom move
    if (w.buff?.kind === 'custom-move') {
      const others = pickUnique(learnset, 3).map(m => ({ kind: 'learnset', name: m }));
      moves = [{ kind: 'custom', name: 'Custom Move' }, ...others];
    }

    // Delta typing override
    const baseTypes = w.types ?? [];
const types = w?.isDelta ? rollDeltaTypes(baseTypes) : baseTypes;


    const baseStats = w.baseStats ?? {};
    const finalStats = applyStatBuff(baseStats, w.buff);
// Shiny: 1% chance, uses shiny sprite and +50 to lowest final stat
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


    const dexNum = w.dexNum ?? w.num ?? (typeof w.id === 'number' ? w.id : undefined);
    const formId = w.dexId ?? w.speciesId ?? toID(w.name);

    return {
      uid: uid('c'),
      dexId: dexNum,        // numeric NatDex for display/sorting
      formId: formId,       // string PS id for sprites/forms/evolution
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

    // New ball throw starts a new KO-risk sequence
    setMovesUsedSinceThrow(0);

    setActiveBall(ballKey);
    setStage('throwing');
    setMessage('');

    // Sprite was already resolved during spawn(); keep it for caught record
    const spriteUrlResolved = wild.spriteUrl;

	    // Shiny flag for caught record + encounter counters
	    const isShiny = !!wild.shiny;

    // Calculate chance (pity affects capture rate up to 100/255, only if base <= 100)
const {pityRate, total: effectiveRate} = currentEffectiveCaptureRate();
let chance = calcCatchChance(effectiveRate, ball);
const caught = Math.random() < chance;


    // Keep UI timing consistent with shake animation
    window.setTimeout(() => {
      (async () => {
        if (caught) {
          setStage('caught');
          setMessage(`Gotcha! ${capName(wild.name)} was caught!`);
          setPityFails(0);
    setAttacksLeft(4);
          resetEncounterAssist();

          const record = await buildCaughtRecord(wild, spriteUrlResolved, isShiny);

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
    setAttacksLeft(4);
          }
          // Do NOT reset used moves or attack bonus on break-free; those persist for this encounter
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
    // Make buff readable (stat boosts, illegal move, delta typing, etc.)
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

  // Item isn't part of your current data model; omit if unknown
  lines.push(`${name}`);

  // Ability: if ability is custom/unknown, print Custom
  const abil = mon?.ability;
  let abilLine = 'Custom';
  if (abil && typeof abil === 'object') {
    if (abil.kind === 'custom') abilLine = 'Custom';
    else if (abil.name) abilLine = toShowdownName(abil.name);
  } else if (typeof abil === 'string') {
    abilLine = toShowdownName(abil);
  }
  lines.push(`Ability: ${abilLine}`);

  // "Tera Type" doesn't exist in this game yet; choose first type as a default placeholder
  const tera = Array.isArray(mon?.types) && mon.types.length ? toShowdownName(mon.types[0]) : 'Normal';
  lines.push(`Tera Type: ${tera}`);

  // EVs/Nature aren't modeled yet; use a standard placeholder
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
      // if illegal/custom move, output Custom
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
    // Fallback
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
    {/* Full reset */}
    <button
      className="btnSmall"
      onClick={() => {
        if (window.confirm('Reset all progress and start over?')) {
          const fresh = defaultSave();
          setSave(fresh);
          saveSave(fresh);
          resetToIdle();
        }
      }}
      aria-label="Reset game"
    >
      Reset
    </button>
{/* Export / Copy PC */}
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



    {/* PC Box */}
    <button
      className="pcButton"
      onClick={() => setShowPC(true)}
      aria-label="Open PC Box"
    >
      <span className="pcIcon" />
      <span className="pcText">PC</span>
    </button>
          <button className="btn backpackFab" onClick={() => setShowBackpack(v => !v)} title="Backpack">
            🎒 {save.moveTokens ?? 0}
          </button>

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

        {/* Mobile unified panel: Team + Active moves inside the main card */}
        

        <div className="wildSpriteWrap">
          {/* rarity icon top-left */}
          <div className="rarityCorner">
            <RarityBadge badge={wild.badge} size={22} />
          </div>

          {wild.shiny ? (
            <div className="shinyCorner" title="Shiny!">
              ✨ Shiny
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

          <img
            className={`wildSprite ${(stage === 'throwing' || stage === 'caught') ? 'fadeOut' : ''} ${(stage === 'broke') ? 'popIn' : ''}`}
            src={wild.spriteUrl}
            alt={wild.name}
            onError={(e) => {
              if (wild.fallbackSprite && e.currentTarget.src !== wild.fallbackSprite) {
                e.currentTarget.src = wild.fallbackSprite;
              }
            }}
          />

          {activeBall && (stage === 'throwing' || stage === 'caught' || stage === 'broke') && (
            <div className={`ballOverlay ${stage}`}>
              <PokeballIcon variant={activeBall} size={96} />
              {stage === 'caught' && <div className="sparkles" />}
              {stage === 'broke' && <div className="crack" />}
            </div>
          )}
          {/* Mobile catch rate badge (bottom-right) */}
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
    teamUids={teamUids}
    activeTeamUid={activeTeamUid}
    onToggleTeam={toggleTeam}
    onSetActiveTeam={setActiveTeam}
    onClose={() => setShowPC(false)}
    onEvolve={evolveCaught}
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
        {/* Mobile collapsed button */}
        <button
          className="trackerToggle"
          onClick={() => setTrackerOpen(true)}
          aria-label="Open encounter tracker"
          title="Encounter stats"
          type="button"
        >
          👁
        </button>

        {/* Panel (always visible on desktop via CSS) */}
        <div className="trackerPanel" role="dialog" aria-label="Encounter stats panel">
          <button
            className="trackerClose"
            onClick={() => setTrackerOpen(false)}
            aria-label="Close encounter tracker"
            title="Close"
            type="button"
          >
            ✕
          </button>

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

    </div>
  );
}


function SpriteWithFallback({ mon, className, alt, title }) {
  // Listen for global sprite-cache updates so parallel instances (team preview,
  // active slot, PC grid) can immediately reuse the first working URL and avoid
  // repeated 404s.
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const h = () => setTick((x) => x + 1);
    window.addEventListener(SPRITE_CACHE_EVENT, h);
    return () => window.removeEventListener(SPRITE_CACHE_EVENT, h);
  }, []);

  const candidates = React.useMemo(() => getShowdownSpriteCandidates(mon), [mon, tick]);
  const [i, setI] = React.useState(0);

  // If candidates list changes (because cache updated), snap back to the first
  // candidate so we use the cached URL immediately.
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
        // Cache the first working sprite URL for this mon for the current session
        cacheSpriteSuccess(mon, e.currentTarget.currentSrc || src);
      }}
      onError={() => setI((prev) => Math.min(prev + 1, candidates.length - 1))}
    />
  );
}

// --- sprite resolution helpers ---


async function resolveSpriteUrlList(urls) {
  for (const url of (urls || [])) {
    if (!url) continue;
    const ok = await canLoad(url);
    if (ok) return url;
  }
  // if nothing loads, return the first candidate (or empty)
  return (urls && urls[0]) || '';
}

function canLoad(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}