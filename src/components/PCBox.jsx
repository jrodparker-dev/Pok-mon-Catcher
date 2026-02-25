import React, { useEffect, useMemo, useState } from 'react';
import PokemonDetail from './PokemonDetail.jsx';
import RarityBadge from './RarityBadge.jsx';
import { DELTA_BADGE, RARITIES } from '../rarity.js';
import { cacheSpriteSuccess, getShowdownSpriteCandidates, SPRITE_CACHE_EVENT } from '../spriteLookup.js';
import { getEvolutionOptions } from '../evolution.js';

import pokeBallImg from '../assets/balls/pokeball.png'
import greatBallImg from '../assets/balls/greatball.png'
import ultraBallImg from '../assets/balls/ultraball.png'
import masterBallImg from '../assets/balls/masterball.png'

function ballImgFromKey(key) {
  switch (key) {
    case 'great': return greatBallImg;
    case 'ultra': return ultraBallImg;
    case 'master': return masterBallImg;
    case 'poke':
    default: return pokeBallImg;
  }
}

function SpriteWithFallback({ candidates, alt, className, onLoadSrc }) {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const h = () => setTick((x) => x + 1);
    window.addEventListener(SPRITE_CACHE_EVENT, h);
    return () => window.removeEventListener(SPRITE_CACHE_EVENT, h);
  }, []);

  const [idx, setIdx] = React.useState(0);

  // When the cache updates, start again at the top of the candidate list so
  // we immediately use the cached URL (reduces duplicate 404s across views).
  React.useEffect(() => {
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
      alt={alt || ''}
      loading="lazy"
      decoding="async"
      onLoad={(e) => {
        const resolved = e.currentTarget.currentSrc || src;
        if (onLoadSrc) onLoadSrc(resolved);
      }}
      onError={() => setIdx((i) => Math.min(i + 1, (candidates?.length ?? 1) - 1))}
    />
  );
}


const PCBOX_PREFS_KEY = 'pokemon-catcher.pcbox.prefs.v1';

function loadPCBoxPrefs() {
  try {
    const raw = window.localStorage.getItem(PCBOX_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    return {};
  }
}

function savePCBoxPrefs(prefs) {
  try {
    window.localStorage.setItem(PCBOX_PREFS_KEY, JSON.stringify(prefs || {}));
  } catch {}
}
export default function PCBox({ caughtList, onClose, onEvolve, teamUids, onToggleTeam, moveTokens, onReplaceMove, onRelease, onReleaseMany, onToggleLock, onSetLockMany, fusionTokens, onStartFuse, onCancelFuse, onConfirmFuse, onRefreshAllCaught }) {
  const prefs = useMemo(() => loadPCBoxPrefs(), []);
  const [selectedUid, setSelectedUid] = useState(null);
  const [query, setQuery] = useState(() => String(prefs.query ?? ''));
  const [rarityChecks, setRarityChecks] = useState(() => (prefs.rarityChecks && typeof prefs.rarityChecks === 'object') ? prefs.rarityChecks : ({ common: false, uncommon: false, rare: false, legendary: false, delta: false }));
  const [shinyOnly, setShinyOnly] = useState(!!prefs.shinyOnly);
  const [nonShinyOnly, setNonShinyOnly] = useState(!!prefs.nonShinyOnly);
  const [teamOnly, setTeamOnly] = useState(!!prefs.teamOnly);
  const [sortKey, setSortKey] = useState(() => String(prefs.sortKey ?? 'dex'));
  const [sortDir, setSortDir] = useState(() => (prefs.sortDir === 'desc' ? 'desc' : 'asc'));
  const [buffFilter, setBuffFilter] = useState(() => String(prefs.buffFilter ?? ''));

  const [fuseBaseUid, setFuseBaseUid] = useState(null);
  const [fusePickUid, setFusePickUid] = useState(null);

  useEffect(() => {
    savePCBoxPrefs({
      query,
      rarityChecks,
      shinyOnly,
      nonShinyOnly,
      teamOnly,
      sortKey,
      sortDir,
      buffFilter,
    });
  }, [query, rarityChecks, shinyOnly, nonShinyOnly, teamOnly, sortKey, sortDir, buffFilter]);
  const teamSet = new Set(Array.isArray(teamUids) ? teamUids : []);
  const canAddMore = teamSet.size < 3;

  const toggleRarity = (key) => {
    setRarityChecks((rc) => ({ ...(rc || {}), [key]: !rc?.[key] }));
  };

  const selected = useMemo(() => {
    if (!selectedUid) return null;
    return (caughtList ?? []).find(p => p.uid === selectedUid) || null;
  }, [caughtList, selectedUid]);


  const fuseBase = useMemo(() => {
    if (!fuseBaseUid) return null;
    return (Array.isArray(caughtList) ? caughtList : []).find(p => p && (p.uid === fuseBaseUid)) || null;
  }, [caughtList, fuseBaseUid]);

  const fusePick = useMemo(() => {
    if (!fusePickUid) return null;
    return (Array.isArray(caughtList) ? caughtList : []).find(p => p && (p.uid === fusePickUid)) || null;
  }, [caughtList, fusePickUid]);


  const viewList = useMemo(() => {
    const list = Array.isArray(caughtList) ? caughtList : [];
    const q = query.trim().toLowerCase();

    const filtered = list.filter((p) => {
      if (!p) return false;

      if (teamOnly && !teamSet.has(p.uid)) return false;

      // Shiny filters (tri-state)
      if (shinyOnly && !nonShinyOnly) {
        if (!p.shiny) return false;
      } else if (nonShinyOnly && !shinyOnly) {
        if (p.shiny) return false;
      }

      const isDelta = !!(p.isDelta || p.delta);

      // Rarity (OR across checked rarities; if none checked -> all)
      const rk = String(p.rarity || '').toLowerCase();
      const baseRarityKeys = ['common', 'uncommon', 'rare', 'legendary'];
      const anyBaseChecked = baseRarityKeys.some((k) => !!rarityChecks?.[k]);
      if (anyBaseChecked && !rarityChecks?.[rk]) return false;

      // Delta checkbox requires delta typing
      if (rarityChecks?.delta && !isDelta) return false;

      // Buff filter (single-select)
      if (buffFilter) {
        const bs = Array.isArray(p.buffs) ? p.buffs : (p.buff ? [p.buff] : []);
        const has = bs.some(b => String(b?.kind || '').toLowerCase() === String(buffFilter).toLowerCase());
        if (!has) return false;
      }

      if (!q) return true;
      const name = String(p.name || '').toLowerCase();
      const id = String(p.formId || p.speciesId || '').toLowerCase();
      const num = String(p.dexId ?? p.id ?? '');
      return name.includes(q) || id.includes(q) || num === q;
    });

    const dir = sortDir === 'desc' ? -1 : 1;
    const scored = filtered.slice().sort((a, b) => {
      const aNum = (typeof a.dexId === 'number' ? a.dexId : (typeof a.id === 'number' ? a.id : 99999));
      const bNum = (typeof b.dexId === 'number' ? b.dexId : (typeof b.id === 'number' ? b.id : 99999));
      const aName = String(a.name || '').toLowerCase();
      const bName = String(b.name || '').toLowerCase();
      const aCaught = a.caughtAt ?? 0;
      const bCaught = b.caughtAt ?? 0;
      const aR = String(a.rarity || '').toLowerCase();
      const bR = String(b.rarity || '').toLowerCase();
      const rarityRank = (rk) => ({ common: 1, uncommon: 2, rare: 3, legendary: 4 }[rk] ?? 9);

      let cmp = 0;
      if (sortKey === 'dex') cmp = aNum - bNum;
      else if (sortKey === 'name') cmp = aName.localeCompare(bName);
      else if (sortKey === 'caught') cmp = aCaught - bCaught;
      else if (sortKey === 'rarity') cmp = rarityRank(aR) - rarityRank(bR);
      else cmp = aNum - bNum;

      if (cmp === 0) cmp = (aNum - bNum) || aName.localeCompare(bName);
      return cmp * dir;
    });

    return scored;
  }, [caughtList, query, rarityChecks, shinyOnly, nonShinyOnly, teamOnly, sortKey, sortDir, teamSet]);

  return (
    <>
      <div className="modalOverlay" role="dialog" aria-modal="true">
        <div className="modalCard">
          <div className="pcStickyHeader">
            <div className="modalHeader">
              <div>
                <div className="modalTitle">PC Box</div>
                <div className="modalSub">{caughtList.length} Pokémon caught</div>
              </div>

              <div className="pcBulkActions">
                {onRefreshAllCaught && (
                  <button
                    className="pcIconButton"
                    title="Debug refresh: recompute saved Pokémon derived fields"
                    onClick={onRefreshAllCaught}
                  >
                    ⟳
                  </button>
                )}

                <button
                  className="btnSmall"
                  type="button"
                  onClick={() => {
                    const uids = viewList.map((m) => m?.uid).filter(Boolean);
                    if (!uids.length) return;
                    const lockedCount = viewList.filter((m) => m?.locked).length;
                    const msg = lockedCount
                      ? `Release ${uids.length} Pokémon? (${lockedCount} locked will be skipped)`
                      : `Release ${uids.length} Pokémon?`;
                    if (window.confirm(msg)) {
                      if (onReleaseMany) onReleaseMany(uids);
                      else uids.forEach((u) => onRelease && onRelease(u));
                    }
                  }}
                  disabled={!viewList.length}
                  title="Release all Pokémon currently matched by the filters"
                >
                  Release Selected
                </button>

                <button
                  className="btnSmall"
                  type="button"
                  onClick={() => {
                    const uids = viewList.map((m) => m?.uid).filter(Boolean);
                    if (!uids.length) return;
                    if (onSetLockMany) onSetLockMany(uids, true);
                    else uids.forEach((u) => onToggleLock && onToggleLock(u));
                  }}
                  disabled={!viewList.length}
                  title="Lock all Pokémon currently matched by the filters"
                >
                  Lock Selected
                </button>
              </div>

              <button className="btnSmall" onClick={onClose}>
                Close
              </button>
            </div>

          </div>

          {fuseBaseUid && fuseBase ? (
            <div className="fusionBar" role="region" aria-label="Fusion selection">
              <div className="fusionBarLeft">
                <div className="fusionBarTitle">Fusion Pokémon</div>
                <div className="fusionBarMon">
                  <SpriteWithFallback mon={fuseBase} className="fusionBarSprite" alt={fuseBase.name} />
                  <div className="fusionBarName">
                    <div style={{ fontWeight: 900 }}>{fuseBase.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>Select a second Pokémon to fuse with</div>
                  </div>
                </div>
              </div>
              <button
                className="btnSmall"
                type="button"
                onClick={() => {
                  if (onCancelFuse) onCancelFuse();
                  setFuseBaseUid(null);
                  setFusePickUid(null);
                }}
              >
                Cancel
              </button>
            </div>
          ) : null}


          <div className="pcControls" aria-label="PC sorting and filtering">
              <input
                className="pcSearch"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name / id / dex #"
                aria-label="Search PC"
              />

              <div
                className="pcRarityFilters"
                aria-label="Filter by rarities"
                title="Filter by rarities (any checked)"
              >
                {RARITIES.map((r) => {
                  const key = String(r.key).toLowerCase();
                  return (
                    <label key={key} className="pcToggle pcRarityToggle" title={`Show ${r.label}`}>
                      <input
                        type="checkbox"
                        checked={!!rarityChecks?.[key]}
                        onChange={() => toggleRarity(key)}
                      />
                      <span className="pcRarityToggleIcon">
                        <RarityBadge badge={r.badge} size={14} />
                      </span>
                    </label>
                  );
                })}
                <label className="pcToggle pcRarityToggle" title="Show Delta typing only when checked (requires delta)">
                  <input
                    type="checkbox"
                    checked={!!rarityChecks?.delta}
                    onChange={() => toggleRarity('delta')}
                  />
                  <span className="pcRarityToggleIcon">
                    <RarityBadge badge={DELTA_BADGE} size={14} />
                  </span>
                </label>
              </div>

              <label className="pcToggle" title="Filter Shiny">
                <input type="checkbox" checked={shinyOnly} onChange={(e) => setShinyOnly(e.target.checked)} />
                Shiny
              </label>

              <label className="pcToggle" title="Filter Non-shiny">
                <input type="checkbox" checked={nonShinyOnly} onChange={(e) => setNonShinyOnly(e.target.checked)} />
                Non-shiny
              </label>
<label className="pcToggle" title="Show team only">
                <input type="checkbox" checked={teamOnly} onChange={(e) => setTeamOnly(e.target.checked)} />
                Team
              </label>

              <div className="pcSortGroup" aria-label="Sort">
                <select
                  className="pcSelect"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  aria-label="Sort field"
                  title="Sort field"
                >
                  <option value="dex">Dex #</option>
                  <option value="name">Name</option>
                  <option value="caught">Caught time</option>
                  <option value="rarity">Rarity</option>
                </select>
                <button
                  className="btnSmall pcSortDir"
                  onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                  title="Toggle sort direction"
                  aria-label="Toggle sort direction"
                  type="button"
                >
                  {sortDir === 'asc' ? '↑' : '↓'}
                </button>

            <div className="pcSortGroup" aria-label="Buff filter">
              <select
                className="pcSelect"
                value={buffFilter}
                onChange={(e) => setBuffFilter(e.target.value)}
                aria-label="Filter by buff"
                title="Filter by buff"
              >
                <option value="">All buffs</option>
                <option value="rarity-team">Rarity (team)</option>
                <option value="rarity-active">Rarity (active)</option>
                <option value="shiny-team">Shiny (team)</option>
                <option value="shiny-active">Shiny (active)</option>
                <option value="catch-team">Catch (team)</option>
                <option value="catch-active">Catch (active)</option>
                <option value="ko-ball-active">Ball on KO (active)</option>
                <option value="custom-move">Custom Move</option>
                <option value="chosen-ability">Chosen Ability</option>
                <option value="stat-all">All stats</option>
                <option value="bst-to-600">BST → 600</option>
                <option value="reroll-stats">Reroll stats</option>
                <option value="stat-mult">Double low stat</option>
              </select>
            </div>

              </div>
            </div>

          {caughtList.length === 0 ? (
            <div className="emptyState">No Pokémon yet. Go catch some!</div>
          ) : (
            <div className="grid">
              {viewList.map(p => (
                  <button
                    key={p.uid ?? p.id}
                    className={`gridItem hasBallWm ${p?.isFusion ? "fusionOutline" : ""}`}
                    onClick={() => {
                      if (fuseBaseUid) {
                        if (p.uid === fuseBaseUid) return;
                        // Only allow fully evolved Pokémon to be selected for fusion.
                        const evoOpts = getEvolutionOptions(p.formId ?? p.speciesId ?? p.name);
                        if (Array.isArray(evoOpts) && evoOpts.length > 0) {
                          alert('Only fully evolved Pokémon can be fused.');
                          return;
                        }
                        setFusePickUid(p.uid);
                        return;
                      }
                      setSelectedUid(p.uid);
                    }}
                    aria-label={`Inspect ${p.name}`}
                    style={{
                      cursor: 'pointer',
                      position: 'relative',
                      '--ballWm': `url(${ballImgFromKey((p.caughtBall || p.ballKey || 'poke'))})`,
                    }}
                  >
                    {/* Rarity badge (top-left) */}
                    {p.badge && (
                      <div className="gridBadgeCorner">
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {(p.isDelta) ? (
                            <RarityBadge badge={DELTA_BADGE} size={18} />
                          ) : null}
                          <RarityBadge badge={p.badge} size={18} />
                        </div>
                      </div>
                    )}

                    {(p.shiny || (Array.isArray(p.buffs) && p.buffs.some(b => b?.superRare))) ? (
                      <div className="gridTopRight">
                        {p.shiny ? <div className="gridShinyCorner" title="Shiny!">✨</div> : null}
                        {(Array.isArray(p.buffs) && p.buffs.some(b => b?.superRare)) ? <div className="gridSuperRareCorner" title="Super rare buff!">✦</div> : null}
                      </div>
                    ) : null}

                    <SpriteWithFallback
                      className="gridSprite"
                      candidates={getShowdownSpriteCandidates(p)}
                      alt={p.name}
                      // cache on successful load
                      onLoadSrc={(src) => cacheSpriteSuccess(p, src)}
                    />

                    <div className="gridName">
  {(() => {
    const dex = p.dexId ?? p.id ?? '';
    const raw = String(p.name ?? '').trim();

    // If name already starts with a dex prefix, don't add it again
    const alreadyHasDex = /^\s*#?\d+\s+/.test(raw);
    const cleanName = raw.replace(/^\s*#?\d+\s+/i, '').trim();

    // Fusion display name: "Base / Other" (with spaces)
    const otherRaw = String(p.fusionOtherName ?? '').trim();
    const otherClean = otherRaw.replace(/^\s*#?\d+\s+/i, '').trim();
    const fusionName = (p.isFusion && otherClean) ? `${cleanName || raw} / ${otherClean}` : null;

    const labelName = fusionName || cleanName || raw; // fallback
    return alreadyHasDex ? raw : (dex ? `#${dex} ${labelName}` : labelName);
  })()}
</div>

                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {(fuseBaseUid && fuseBase && fusePickUid && fusePick) ? (
        <div className="pcConfirmOverlay" role="dialog" aria-modal="true">
          <div className="pcConfirmCard">
            <div className="pcConfirmTitle">Confirm Fusion</div>
            <div className="pcConfirmText">
              Do you want to fuse <b>{fuseBase.name}</b> with <b>{fusePick.name}</b>?
            </div>
            <div className="pcConfirmSprites">
              <SpriteWithFallback mon={fuseBase} className="pcConfirmSprite" alt={fuseBase.name} />
              <div className="pcConfirmPlus">+</div>
              <SpriteWithFallback mon={fusePick} className="pcConfirmSprite" alt={fusePick.name} />
            </div>
            <div className="pcConfirmBtns">
              <button
                className="btnSmall"
                type="button"
                onClick={() => {
                  if (onCancelFuse) onCancelFuse();
                  setFuseBaseUid(null);
                  setFusePickUid(null);
                }}
              >
                Cancel (refund)
              </button>
              <button
                className="btnSmall"
                type="button"
                onClick={() => {
                  if (onConfirmFuse) onConfirmFuse(fuseBaseUid, fusePickUid);
                  setFuseBaseUid(null);
                  setFusePickUid(null);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}



      {selected && (
        <PokemonDetail
          mon={selected}
          onClose={() => setSelectedUid(null)}
          onEvolve={onEvolve ? (uid, targetDexId) => onEvolve(uid, targetDexId) : null}
          teamUids={teamUids}
          onToggleTeam={onToggleTeam}
          moveTokens={moveTokens}
          onReplaceMove={onReplaceMove}
          onRelease={onRelease}
          onToggleLock={onToggleLock}
          fusionTokens={fusionTokens}
          onStartFuse={onStartFuse ? (uid) => { onStartFuse(uid); setFuseBaseUid(uid); setFusePickUid(null); } : null}
        />
      )}
    </>
  );
}