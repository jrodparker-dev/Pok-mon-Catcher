import React, { useEffect, useMemo, useState } from 'react';
import RarityBadge from './RarityBadge.jsx';
import PokeballIcon from './PokeballIcon.jsx';
import { getEvolutionOptions } from '../evolution.js';
import { getDexById } from '../dexLocal.js';
import { rollRandomMoveIds, getMoveDisplay } from '../randomMoveTokens.js';
import { cacheSpriteSuccess, getShowdownSpriteCandidates, SPRITE_CACHE_EVENT } from '../spriteLookup.js';
import { RARITIES, DELTA_BADGE, describeBuff } from '../rarity.js';

const STAT_ORDER = [
  ['hp', 'HP'],
  ['atk', 'Atk'],
  ['def', 'Def'],
  ['spa', 'SpA'],
  ['spd', 'SpD'],
  ['spe', 'Spe'],
];

function cap(s) {
  return String(s || '')
    .split('-')
    .map(x => (x ? x[0].toUpperCase() + x.slice(1) : x))
    .join(' ');
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

  return (
    <img
      className={className}
      src={src}
      alt={mon?.name || ''}
      onLoad={(e) => cacheSpriteSuccess(mon, e.currentTarget.currentSrc || src)}
      onError={() => setIdx((i) => Math.min(i + 1, (candidates?.length ?? 1) - 1))}
    />
  );
}

export default function PokemonDetail({ mon, onClose, onEvolve, teamUids, onToggleTeam, moveTokens, onReplaceMove, onRelease, onToggleLock, onStartFuse, fusionTokens }) {
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
              <span className="modalTitleText">#{mon.dexId ?? mon.id} {cap(mon.name)}</span>
              {mon.shiny ? <span className="modalTitleIcon" aria-label="Shiny">✨</span> : null}
              {(Array.isArray(mon.buffs) && mon.buffs.some(b => b?.superRare)) ? <span className="modalTitleIcon superRareSparkle" aria-label="Super rare buff">✦</span> : null}
              <span className="modalTitleIcon">
                <PokeballIcon variant={(mon.caughtBall || mon.ballKey || "poke")} size={18} />
              </span>
            </div>
            <div className="modalSub">
              {cap(mon.rarity)} • {(Array.isArray(mon.buffs) ? mon.buffs.map(describeBuff).filter(Boolean).join(' • ') : (mon.buff ? describeBuff(mon.buff) : 'none'))}{mon.shiny ? ' • ✨ Shiny' : ''}
            </div>
          </div>
          <button className="btnSmall" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 180, textAlign: 'center' }}>
            <SpriteWithFallback mon={mon} className="gridSprite" />
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {STAT_ORDER.map(([k, label]) => {
                const base = mon.baseStats?.[k];
                const final = mon.finalStats?.[k];
                const changed =
                  typeof base === 'number' && typeof final === 'number' && base !== final;
                const superBlue = Array.isArray(mon.superChangedStats) && mon.superChangedStats.includes(k);

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
                        color: (() => {
                          const isFusion = !!mon.isFusion;
                          const fromOther = isFusion && Array.isArray(mon?.fusionMeta?.statsFromOther) && mon.fusionMeta.statsFromOther.includes(k);
                          if (fromOther) return '#a3e635';
                          // For non-fusion, keep existing behavior
                          if (changed) return superBlue ? '#60a5fa' : '#facc15';
                          // Fusion base-body stats should be white
                          return 'rgba(255,255,255,.95)';
                        })(), // blue if super-rare changed, else yellow
                      }}
                    >
                      {final ?? '-'}
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          color: 'rgba(156,163,175,.95)',
                          fontWeight: 700,
                        }}
                      >
                        (base {base ?? '-'})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

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
                    {cap(m.name)}
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
                    <div style={{ fontWeight: 900 }}>{cap(m.name)}</div>
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
                onClick={() => onToggleTeam(mon.uid)}
                disabled={!inTeam && !canAddMore}
                title={inTeam ? "Remove from Team" : (canAddMore ? "Add to Team" : "Team full")}
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
                if (canEvolve) { alert('Only fully evolved Pokémon can be fused.'); return; }
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

{onRelease ? (
            <button
              className="btnSmall"
              disabled={!!mon?.locked}
              onClick={() => {
                if (mon?.locked) { alert('This Pokémon is locked and cannot be released unless you unlock it (or do a full reset from scratch).'); return; }
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
      </div>
    </div>
  );
}
