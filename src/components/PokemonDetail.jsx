import React, { useEffect, useMemo, useState } from 'react';
import { getEvolutionOptions } from '../evolution.js';
import { getDexById } from '../dexLocal.js';

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

export default function PokemonDetail({ mon, onClose, onEvolve, teamUids, onToggleTeam }) {
  const [canEvolve, setCanEvolve] = useState(false);
  const [checkingEvo, setCheckingEvo] = useState(true);
  const [evoOptions, setEvoOptions] = useState([]);
  const [showEvoPicker, setShowEvoPicker] = useState(false);

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

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modalCard">
        <div className="modalHeader">
          <div>
            <div className="modalTitle">
              #{mon.dexId ?? mon.id} {cap(mon.name)}{mon.shiny ? ' ✨' : ''}
            </div>
            <div className="modalSub">
              {cap(mon.rarity)} • {mon.buff?.kind ?? 'none'}{mon.shiny ? ' • ✨ Shiny' : ''}
            </div>
          </div>
          <button className="btnSmall" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 180, textAlign: 'center' }}>
            <img className="gridSprite" src={mon.spriteUrl} alt={mon.name} />
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
                        color: changed ? '#facc15' : 'rgba(229,231,235,.95)', // yellow if buffed
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
                  }}
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
                <button className="btnGhost" onClick={handleEvolveClick}>
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
                      <button className="btnGhost" onClick={() => setShowEvoPicker(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <button className="btnSmall" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
