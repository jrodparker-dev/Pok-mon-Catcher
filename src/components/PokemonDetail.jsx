import React, { useEffect, useMemo, useState } from 'react';
import RarityBadge from './RarityBadge.jsx';
import PokeballIcon from './PokeballIcon.jsx';
import { getEvolutionOptions } from '../evolution.js';
import { getDexById } from '../dexLocal.js';
import { rollRandomMoveIds, getMoveDisplay } from '../randomMoveTokens.js';
import { cacheSpriteSuccess, getShowdownSpriteCandidates, getFusionSpriteUrls, SPRITE_CACHE_EVENT } from '../spriteLookup.js';
import { RARITIES, DELTA_BADGE, describeBuff } from '../rarity.js';

const STAT_ORDER = [
  ['hp', 'HP'],
  ['atk', 'Atk'],
  ['def', 'Def'],
  ['spa', 'SpA'],
  ['spd', 'SpD'],
  ['spe', 'Spe'],
];
const STAT_KEYS = STAT_ORDER.map(([k]) => k);

function cap(s) {
  return String(s || '')
    .split('-')
    .map(x => (x ? x[0].toUpperCase() + x.slice(1) : x))
    .join(' ');
}



function formatVariantName(mon, rawName = null) {
  const base = cap(rawName ?? mon?.name ?? '');
  const isGolden = !!mon?.isGolden;
  const isMiracle = !!mon?.isMiracle;
  if (isGolden && isMiracle) return `${base} - Prismatic`;
  if (isGolden) return `${base} - Golden`;
  if (isMiracle) return `${base} - Miracle`;
  return base;
}

function applyGoldenStats(baseStats = {}) {
  const keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const boosts = [10, 15, 20, 25, 30, 40];
  const ranked = keys.map((k) => [k, Number(baseStats?.[k] ?? 0)]).sort((a, b) => b[1] - a[1]);
  const out = { ...baseStats };
  ranked.forEach(([k], idx) => {
    out[k] = Math.max(1, Math.min(255, Math.round(Number(out?.[k] ?? 0) + (boosts[idx] ?? 0))));
  });
  return out;
}

function applyMiracleStats(baseStats = {}) {
  const keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const out = { ...baseStats };
  keys.forEach((k) => {
    const v = Number(out?.[k] ?? 0);
    const mult = v < 100 ? 1.5 : 1.15;
    out[k] = Math.max(1, Math.min(255, Math.round(v * mult)));
  });
  return out;
}

function applyPrismaticStats(baseStats = {}) {
  const keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const out = { ...baseStats };
  keys.forEach((k) => {
    const v = Number(out?.[k] ?? 0);
    out[k] = Math.max(1, Math.min(255, Math.round(v * 2)));
  });
  return out;
}

function getVariantAdjustedBaseStats(mon) {
  const raw = mon?.rawBaseStats ?? mon?.baseStats ?? {};
  let out = { ...raw };
  if (!(mon?.isGolden || mon?.isMiracle)) return out;
  const shouldApplyNow = !!mon?.rawBaseStats || !mon?.variantApplied;
  if (!shouldApplyNow) return out;
  if (mon?.isGolden && mon?.isMiracle) return applyPrismaticStats(out);
  if (mon?.isGolden) return applyGoldenStats(out);
  if (mon?.isMiracle) return applyMiracleStats(out);
  return out;
}

function isBuffLike(value) {
  return !!(value && typeof value === 'object' && typeof value.kind === 'string');
}

function normalizeLegacyBuff(buff) {
  if (!isBuffLike(buff)) return null;
  const b = { ...buff };
  if (b.kind === 'stat+10' || b.kind === 'stat+20' || b.kind === 'stat+30') {
    const amount = Number(b.amount);
    const fallback = b.kind === 'stat+10' ? 10 : (b.kind === 'stat+20' ? 20 : 30);
    return { ...b, kind: 'stat', amount: Number.isFinite(amount) ? amount : fallback };
  }
  if (b.kind === 'stat+15x2') {
    const amount = Number(b.amount);
    return { ...b, kind: 'stat2', amount: Number.isFinite(amount) ? amount : 15 };
  }
  return b;
}

function resolveBuffsForDisplay(mon) {
  const raw = getDisplayBuffs(mon).map(normalizeLegacyBuff).filter(Boolean);
  if (!raw.length) return [];

  const base = mon?.baseStats ?? {};
  const final = mon?.finalStats ?? {};
  const diffs = STAT_KEYS
    .map((k) => ({ k, d: (final?.[k] ?? base?.[k]) - (base?.[k] ?? final?.[k]) }))
    .filter((x) => Number.isFinite(x.d) && x.d !== 0)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));

  const used = new Set();
  return raw.map((b) => {
    if (b.kind === 'stat' || b.kind === 'stat-mult') {
      if (b.stat) return b;
      const pick = diffs.find((x) => !used.has(x.k))?.k || diffs[0]?.k;
      if (pick) used.add(pick);
      return pick ? { ...b, stat: pick } : b;
    }
    if (b.kind === 'stat2') {
      if (Array.isArray(b.stats) && b.stats.length >= 2) return b;
      const picks = diffs.filter((x) => !used.has(x.k)).slice(0, 2).map((x) => x.k);
      if (picks.length === 1 && diffs[1]?.k && diffs[1].k !== picks[0]) picks.push(diffs[1].k);
      picks.forEach((k) => used.add(k));
      return picks.length >= 2 ? { ...b, stats: picks } : b;
    }
    return b;
  });
}

function getDisplayFinalStats(mon, buffs) {
  const base = mon?.baseStats;
  if (!base || typeof base !== 'object') return mon?.finalStats ?? {};

  const currentFinal = mon?.finalStats;
  const hasStoredFinal = STAT_KEYS.some((k) => typeof currentFinal?.[k] === 'number');
  const storedDiffers = hasStoredFinal && STAT_KEYS.some((k) => (currentFinal?.[k] ?? 0) !== (base?.[k] ?? 0));
  if (storedDiffers) return currentFinal;

  const s = { ...base };
  for (const b of buffs) {
    if (!b || !b.kind) continue;
    if (b.kind === 'stat' && b.stat) s[b.stat] = (s[b.stat] ?? 0) + (b.amount ?? 0);
    if (b.kind === 'stat2') {
      const [a, c] = b.stats ?? [];
      if (a) s[a] = (s[a] ?? 0) + (b.amount ?? 0);
      if (c) s[c] = (s[c] ?? 0) + (b.amount ?? 0);
    }
    if (b.kind === 'stat-all') {
      for (const k of STAT_KEYS) s[k] = (s[k] ?? 0) + (b.amount ?? 0);
    }
  }
  return s;
}

function getDisplayBuffs(mon) {
  if (!mon || typeof mon !== 'object') return [];

  const direct = Array.isArray(mon.buffs) ? mon.buffs.filter(isBuffLike) : [];
  if (direct.length) return direct;
  if (isBuffLike(mon.buff)) return [mon.buff];

  // Legacy save support: some old records nested buff payloads in older object shapes.
  // Walk recursively and return the first buff list/object we can confidently parse.
  const seen = new WeakSet();
  const stack = [{ value: mon, depth: 0 }];
  const MAX_DEPTH = 6;

  while (stack.length) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (seen.has(value)) continue;
    seen.add(value);

    const buffs = Array.isArray(value.buffs) ? value.buffs.filter(isBuffLike) : [];
    if (buffs.length) return buffs;
    if (isBuffLike(value.buff)) return [value.buff];

    if (depth >= MAX_DEPTH) continue;
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') {
        stack.push({ value: child, depth: depth + 1 });
      }
    }
  }

  return [];
}

function SpriteWithFallback({ mon, className }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const h = () => setTick((x) => x + 1);
    window.addEventListener(SPRITE_CACHE_EVENT, h);
    return () => window.removeEventListener(SPRITE_CACHE_EVENT, h);
  }, []);

  const candidates = useMemo(() => getShowdownSpriteCandidates(mon), [mon, tick]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [tick]);

  const src = (Array.isArray(candidates) && candidates.length)
    ? candidates[Math.min(idx, candidates.length - 1)]
    : undefined;

  if (!src) return null;

  const imgEl = (
    <img
      className={[className, mon?.isGolden ? 'goldenSprite' : ''].filter(Boolean).join(' ')}
      src={src}
      alt={mon?.name || ''}
      onLoad={(e) => cacheSpriteSuccess(mon, e.currentTarget.currentSrc || src)}
      onError={() => setIdx((i) => Math.min(i + 1, (candidates?.length ?? 1) - 1))}
    />
  );

  const sparkleStyles = useMemo(
    () => Array.from({ length: 8 }, (_, idx) => ({
      animationDuration: `${(1.0 + Math.random() * 2.2).toFixed(2)}s`,
      animationDelay: `${(Math.random() * 1.2).toFixed(2)}s`,
      animationName: (idx % 2 === 0 && Math.random() < 0.5) ? 'miracleTwinkleAlt' : 'miracleTwinkle',
    })),
    [mon?.uid, mon?.name, mon?.dexId]
  );

  if (!mon?.isMiracle) return imgEl;

  return (
    <div className="spriteFxWrap miracleFx">
      {imgEl}
      <div className="miracleSparkles" aria-hidden="true">
        {sparkleStyles.map((st, i2) => <span key={i2} style={st} />)}
      </div>
    </div>
  );
}

export default function PokemonDetail({ mon, onClose, onEvolve, teamUids, teamMons, onToggleTeam, onReplaceTeamMember, moveTokens, onReplaceMove, onRelease, onToggleLock, onSetFusionSpriteChoice, onStartFuse, onUnfuse, fusionTokens }) {
  // Fusion sprite availability + UI (only shown if BOTH orientations exist).
  const [fusionAvail, setFusionAvail] = useState({ primary: false, flipped: false });
  const [fusionMenuOpen, setFusionMenuOpen] = useState(false);
  const [showTeamReplace, setShowTeamReplace] = useState(false);


  const [localFusionSpriteChoice, setLocalFusionSpriteChoice] = useState(() => (mon?.fusionSpriteChoice || 'base'));
  useEffect(() => {
    // Keep local choice in sync when a different Pokémon is opened
    setLocalFusionSpriteChoice(mon?.fusionSpriteChoice || 'base');
  }, [mon?.uid]);

  const effectiveFusionSpriteChoice = onSetFusionSpriteChoice ? (mon?.fusionSpriteChoice || 'base') : localFusionSpriteChoice;

  useEffect(() => {
    setFusionMenuOpen(false);
    const urls = getFusionSpriteUrls(mon);
    if (!urls?.primary || !urls?.flipped) {
      setFusionAvail({ primary: false, flipped: false });
      return;
    }

    let alive = true;
    const probe = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });

    (async () => {
      const [a, b] = await Promise.all([probe(urls.primary), probe(urls.flipped)]);
      if (!alive) return;
      setFusionAvail({ primary: !!a, flipped: !!b });
    })();

    return () => { alive = false; };
  }, [mon?.uid]);
  const [canEvolve, setCanEvolve] = useState(false);
  const [checkingEvo, setCheckingEvo] = useState(true);
  const [evoOptions, setEvoOptions] = useState([]);
  const [showEvoPicker, setShowEvoPicker] = useState(false);

  const [showMovePicker, setShowMovePicker] = useState(false);
  const [movePickerSlot, setMovePickerSlot] = useState(null);
  const [moveChoices, setMoveChoices] = useState([]);

  useEffect(() => {
    let alive = true;
    setCheckingEvo(true);
    setCanEvolve(false);

    (async () => {
      try {
        // Caught mons store mon.dexId as a PS-style dex id string.
        const opts = getEvolutionOptions(mon.formId ?? mon.speciesId ?? mon.name);
        if (!alive) return;
        setEvoOptions(opts);
        setCanEvolve(opts.length > 0);
      } catch {
        if (!alive) return;
        setEvoOptions([]);
        setCanEvolve(false);
      } finally {
        if (!alive) return;
        setCheckingEvo(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [mon.formId, mon.speciesId, mon.dexId, mon.id]);

  const teamSet = useMemo(() => new Set(Array.isArray(teamUids) ? teamUids : []), [teamUids]);
  const inTeam = teamSet.has(mon.uid);
  const canAddMore = teamSet.size < 3;

  const handleEvolveClick = () => {
    if (!onEvolve) return;
    if (!evoOptions || evoOptions.length === 0) return;
    if (evoOptions.length === 1) {
      onEvolve(mon.uid, evoOptions[0]);
      return;
    }
    setShowEvoPicker((v) => !v);
  };

  const evoLabel = (id) => {
    const hit = getDexById({ id });
    return hit?.entry?.name || id;
  };

  if (!mon) return null;

  const monBuffs = resolveBuffsForDisplay(mon);
  const variantAdjustedBase = useMemo(() => getVariantAdjustedBaseStats(mon), [mon]);
  const displayFinalStats = getDisplayFinalStats(mon, monBuffs);

  const baseRarityBadge = (RARITIES.find(r => r.key === mon.rarity)?.badge ?? null);
  const isDelta = !!(mon.isDelta);

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modalCard">
        <div className="modalHeader">
          <div>
            <div className="modalTitle" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isDelta ? <RarityBadge badge={DELTA_BADGE} size={18} /> : null}
                {baseRarityBadge ? <RarityBadge badge={baseRarityBadge} size={18} /> : null}
              </div>
              <span className="modalTitleText">{mon?.locked ? '🔒 ' : ''}#{mon.dexId ?? mon.id} {(() => {
                const baseName = formatVariantName(mon, mon.fusionBaseName ?? mon.name);
                const otherName = formatVariantName(mon, mon.fusionOtherName ?? '');
                return (mon?.isFusion && otherName) ? `${baseName} / ${otherName}` : baseName;
              })()}</span>
              {mon.shiny ? <span className="modalTitleIcon" aria-label="Shiny">✨</span> : null}
              {(monBuffs.some(b => b?.superRare)) ? <span className="modalTitleIcon superRareSparkle" aria-label="Super rare buff">✦</span> : null}
              <span className="modalTitleIcon">
                <PokeballIcon variant={(mon.caughtBall || mon.ballKey || "poke")} size={18} />
              </span>
            </div>
            <div className="modalSub">
              {cap(mon.rarity)} • {(monBuffs.length ? monBuffs.map(describeBuff).filter(Boolean).join(' • ') : 'none')}{mon.shiny ? ' • ✨ Shiny' : ''}
            </div>
          </div>
          <button className="btnSmall" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 180, textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <SpriteWithFallback mon={{...mon, fusionSpriteChoice: effectiveFusionSpriteChoice}} className="gridSprite" />

              {(mon?.isFusion && fusionAvail.primary && fusionAvail.flipped) ? (
                <>
                  <button
                    type="button"
                    title="Choose fusion sprite"
                    onClick={() => setFusionMenuOpen(v => !v)}
                    style={{
                      position: 'absolute',
                      right: 4,
                      bottom: 4,
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.35)',
                      background: 'rgba(0,0,0,0.45)',
                      color: '#fff',
                      fontWeight: 900,
                      lineHeight: '18px',
                      cursor: 'pointer',
                    }}
                  >
                    ▾
                  </button>

                  {fusionMenuOpen ? (
                    <div style={{
                      position: 'absolute',
                      left: '100%',
                      bottom: 4,
                      marginLeft: 8,
                      transform: 'translateY(-100%)',
                      background: 'rgba(0,0,0,0.75)',
                      border: '1px solid rgba(255,255,255,0.25)',
                      borderRadius: 10,
                      padding: 6,
                      minWidth: 170,
                      zIndex: 50,
                    }}>
                      <button
                        type="button"
                        onClick={() => { onSetFusionSpriteChoice?.(mon.uid, 'normal'); setFusionMenuOpen(false); }}
                        style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, color: '#fff', padding: '6px 8px', cursor: 'pointer' }}
                      >
                        Base / Other {String(mon?.fusionSpriteChoice || '').toLowerCase() === 'flip' ? '' : '✓'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { onSetFusionSpriteChoice?.(mon.uid, 'flip'); setFusionMenuOpen(false); }}
                        style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, color: '#fff', padding: '6px 8px', cursor: 'pointer' }}
                      >
                        Other / Base {String(mon?.fusionSpriteChoice || '').toLowerCase() === 'flip' ? '✓' : ''}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
            <div style={{ marginTop: 8, fontWeight: 800 }}>
              Types: {mon.types?.map(cap).join(' / ')}
            </div>

            <div style={{ marginTop: 6, color: 'rgba(229,231,235,.85)', fontWeight: 700 }}>
              Ability: {cap(mon.ability?.name ?? 'unknown')}
              {mon.ability?.kind === 'custom' ? ' (Custom)' : ''}
              {(mon.prevAbilities?.length ?? 0) > 0 && (
                <div
                  style={{
                    marginTop: 4,
                    color: 'rgba(156,163,175,.95)',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  ({mon.prevAbilities.map(cap).join(', ')})
                </div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Stats</div>
            {mon.shiny ? (
              <div style={{marginTop:-4, marginBottom:10, color:'#facc15', fontWeight:800}}>
                Shiny bonus: +50 to lowest stat ({(mon.shinyBoostStat || "").toUpperCase()})
              </div>
            ) : null}
            {(mon?.isGolden && mon?.isMiracle) ? (
              <div style={{marginTop:-2, marginBottom:10, color:'#a78bfa', fontWeight:800}}>
                Prismatic bonus: base stats are doubled.
              </div>
            ) : null}
            {(mon?.isGolden && !mon?.isMiracle) ? (
              <div style={{marginTop:-2, marginBottom:10, color:'#fbbf24', fontWeight:800}}>
                Golden bonus: ranked base stat boosts applied.
              </div>
            ) : null}
            {(mon?.isMiracle && !mon?.isGolden) ? (
              <div style={{marginTop:-2, marginBottom:10, color:'#93c5fd', fontWeight:800}}>
                Miracle bonus: &lt;100 stats ×1.5, ≥100 stats ×1.15.
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {STAT_ORDER.map(([k, label]) => {
                const baseRaw = mon.rawBaseStats?.[k] ?? mon.baseStats?.[k];
                const variantBase = variantAdjustedBase?.[k];
                const final = displayFinalStats?.[k];
                const superBlue = Array.isArray(mon.superChangedStats) && mon.superChangedStats.includes(k);
                const isFusion = !!mon.isFusion;
                const fromOther = isFusion && Array.isArray(mon?.fusionMeta?.statsFromOther) && mon.fusionMeta.statsFromOther.includes(k);
                const variantChanged = (typeof baseRaw === 'number' && typeof variantBase === 'number' && baseRaw !== variantBase);
                const buffChanged = (typeof variantBase === 'number' && typeof final === 'number' && variantBase !== final);

                const color = (() => {
                  if (fromOther) return '#a3e635';
                  if (buffChanged) return superBlue ? '#60a5fa' : '#facc15';
                  if (variantChanged && mon?.isGolden && mon?.isMiracle) return '#c4b5fd';
                  if (variantChanged && mon?.isMiracle) return '#93c5fd';
                  if (variantChanged && mon?.isGolden) return '#fef08a';
                  return 'rgba(255,255,255,.95)';
                })();
                const textShadow = (variantChanged && mon?.isGolden && !buffChanged && !fromOther)
                  ? '0 0 8px rgba(254, 240, 138, 0.45)'
                  : 'none';

                return (
                  <div
                    key={k}
                    style={{
                      padding: 10,
                      border: '1px solid rgba(255,255,255,.08)',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,.04)',
                    }}
                  >
                    <div style={{ fontWeight: 800, color: 'rgba(229,231,235,.85)' }}>
                      {label}
                    </div>

                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 16,
                        color,
                        textShadow,
                      }}
                    >
                      {final ?? '-'}
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          color: 'rgba(156,163,175,.95)',
                          fontWeight: 700,
                          textShadow: 'none',
                        }}
                      >
                        (base {baseRaw ?? '-'})
                      </span>
                    </div>
                  </div>
                );
              })}            </div>

            <div style={{ fontWeight: 900, margin: '14px 0 8px' }}>Moves</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(mon.moves ?? []).slice(0, 4).map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 10,
                    border: '1px solid rgba(255,255,255,.08)',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,.04)',
                    cursor: (moveTokens ?? 0) > 0 && onReplaceMove ? 'pointer' : 'default',
                    opacity: (moveTokens ?? 0) > 0 && onReplaceMove ? 1 : 0.95,
                  }}
                  onClick={() => {
                    if (!onReplaceMove) return;
                    if ((moveTokens ?? 0) <= 0) return;
                    const currentId = (mon.moves?.[idx]?.id) || null;
                    const picks = rollRandomMoveIds(4, Math.random, currentId ? [currentId] : []);
                    setMoveChoices(picks.map(getMoveDisplay));
                    setMovePickerSlot(idx);
                    setShowMovePicker(true);
                  }}
                  title={(moveTokens ?? 0) > 0 && onReplaceMove ? 'Spend 1 token to replace this move' : undefined}
                >
                  <div style={{ fontWeight: 900 }}>
                    {formatVariantName(m)}
                    {m.kind === 'illegal' ? ' (Illegal)' : ''}
                    {m.kind === 'custom' ? ' (Custom)' : ''}
                  </div>

                  {m.kind === 'illegal' && m.meta ? (
                    <div
                      style={{
                        marginTop: 4,
                        color: 'rgba(156,163,175,.95)',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {cap(m.meta.type)} • {cap(m.meta.damageClass)} • Power {m.meta.power ?? '—'}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>


        {showMovePicker ? (
          <div className="modalOverlay" role="dialog" aria-modal="true">
            <div className="modalCard" style={{ maxWidth: 520 }}>
              <div className="modalHeader">
                <div>
                  <div className="modalTitle">Replace Move</div>
                  <div className="modalSub">Spend 1 token • Pick a new move for slot #{(movePickerSlot ?? 0) + 1}</div>
                </div>
                <button className="btnSmall" onClick={() => setShowMovePicker(false)}>Close</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                {moveChoices.map((m) => (
                  <button
                    key={m.id}
                    className="btn"
                    onClick={() => {
                      if (!onReplaceMove) return;
                      if (movePickerSlot == null) return;
                      onReplaceMove(mon.uid, movePickerSlot, m);
                      setShowMovePicker(false);
                    }}
                    style={{ textAlign: 'left' }}
                  >
                    <div style={{ fontWeight: 900 }}>{formatVariantName(m)}</div>
                    {m.meta ? (
                      <div style={{ marginTop: 4, color: 'rgba(156,163,175,.95)', fontWeight: 700, fontSize: 12 }}>
                        {cap(m.meta.type)} • {cap(m.meta.damageClass)} • Power {m.meta.power ?? '—'}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 12, color: 'rgba(156,163,175,.9)', fontWeight: 700, fontSize: 12 }}>
                Tokens remaining: {moveTokens ?? 0}
              </div>
            </div>
          </div>
        ) : null}

        {/* Bottom action bar: Evolve (bottom-left) + Close (bottom-right) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 16,
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {onToggleTeam ? (
              <button
                className={inTeam ? "btnSmall" : "btnGhost"}
                onClick={() => {
                  if (inTeam) {
                    onToggleTeam(mon.uid);
                    return;
                  }
                  if (!canAddMore) {
                    setShowTeamReplace(true);
                    return;
                  }
                  onToggleTeam(mon.uid);
                }}
                disabled={!inTeam && !canAddMore && !(Array.isArray(teamMons) && teamMons.length)}
                title={inTeam ? "Remove from Team" : (canAddMore ? "Add to Team" : ((Array.isArray(teamMons) && teamMons.length) ? "Team full (click to replace)" : "Team full"))}
              >
                {inTeam ? "Remove from Team" : "Add to Team"}
              </button>
            ) : null}

            {onEvolve && !checkingEvo && canEvolve ? (
              <div style={{ position: 'relative' }}>
                <button className="btnSmall" onClick={handleEvolveClick}>
                  Evolve
                </button>
                {showEvoPicker && evoOptions.length > 1 ? (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '110%',
                      left: 0,
                      minWidth: 180,
                      background: 'rgba(18, 24, 36, 0.96)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: 12,
                      padding: 10,
                      boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
                      zIndex: 50,
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                      Choose evolution
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {evoOptions.map((optId) => {
                        const hit = getDexById({ id: optId });
                        const label = hit?.entry?.name || optId;
                        return (
                          <button
                            key={optId}
                            className="btnSmall"
                            onClick={() => {
                              setShowEvoPicker(false);
                              onEvolve(mon.uid, optId);
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                      <button className="btnSmall" onClick={() => setShowEvoPicker(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          
          {onToggleLock ? (
            <button
              className="btnSmall"
              onClick={() => onToggleLock(mon.uid)}
              type="button"
              title={mon?.locked ? 'Unlock (allow release)' : 'Lock (prevent release)'}
            >
              {mon?.locked ? 'Unlock' : 'Lock'}
            </button>
          ) : null}

{onStartFuse ? (
            <button
              className="btnSmall"
              disabled={checkingEvo || canEvolve}
              onClick={() => {
                if (checkingEvo) { alert('Checking evolution…'); return; }
                if (canEvolve) { alert("You can't fuse a not fully evolved pokemon"); return; }
                const have = Number(fusionTokens ?? 0) || 0;
                if (have <= 0) { alert('You have no Fusion Tokens. Release a Legendary-tier Pokémon to earn one.'); return; }
                const ok = window.confirm('Use 1 Fusion Token to start fusing this Pokémon? (You can cancel and refund it before confirming the fusion.)');
                if (!ok) return;
                onStartFuse(mon.uid);
                onClose();
              }}
              type="button"
              title={canEvolve ? "Only fully evolved Pokémon can be fused." : "Fuse this Pokémon with another (costs 1 Fusion Token)"}
            >
              Fuse
            </button>
          ) : null}

          {onUnfuse && mon?.isFusion ? (
            <button
              className="btnSmall"
              onClick={() => {
                if (!mon?.fusionParts?.a || !mon?.fusionParts?.b) {
                  alert("This fusion was created before Unfuse support existed, so it can't be undone.");
                  return;
                }
                const ok = window.confirm('Unfuse this Pokémon? You will get back both original Pokémon (with their buffs) and your Fusion Token will be refunded.');
                if (!ok) return;
                onUnfuse(mon.uid);
                onClose();
              }}
              type="button"
              title="Undo this fusion and refund the Fusion Token"
            >
              Unfuse
            </button>
          ) : null}

{onRelease ? (
            <button
              className="btnSmall"
              onClick={() => {
                if (mon?.locked) { alert("You can't release this pokemon when it's locked."); return; }
                const ok = window.confirm('Release this Pokémon?');
                if (!ok) return;
                onRelease(mon.uid);
                onClose();
              }}
            >
              Release
            </button>
          ) : null}
        </div>


        {/* Team replace picker (when team is full) */}
        {showTeamReplace ? (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 16,
            }}
            role="dialog"
            aria-modal="true"
          >
            <div
              style={{
                width: 'min(520px, 96vw)',
                background: 'rgba(18, 24, 36, 0.98)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 16,
                padding: 14,
                boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16 }}>Your team is full</div>
              <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>
                Choose which Pokémon to replace.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {(Array.isArray(teamMons) ? teamMons : []).slice(0, 3).map((tm) => {
                  const buffs = getDisplayBuffs(tm);
                  const buffText = buffs.map(describeBuff).filter(Boolean).join(' • ');
                  return (
                    <button
                      key={tm?.uid}
                      type="button"
                      className="btnGhost"
                      style={{
                        textAlign: 'left',
                        padding: 12,
                        borderRadius: 14,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(255,255,255,0.04)',
                      }}
                      onClick={() => {
                        if (onReplaceTeamMember) {
                          onReplaceTeamMember(tm.uid, mon.uid);
                        } else if (onToggleTeam) {
                          onToggleTeam(tm.uid);
                          onToggleTeam(mon.uid);
                        }
                        setShowTeamReplace(false);
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{tm?.name || 'Team member'}</div>
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>
                        {buffText || 'No buffs'}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btnSmall" type="button" onClick={() => setShowTeamReplace(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}


      </div>
    </div>
  );
}
