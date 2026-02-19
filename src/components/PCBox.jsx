import React, { useMemo, useState } from 'react';
import PokemonDetail from './PokemonDetail.jsx';
import RarityBadge from './RarityBadge.jsx';
import { DELTA_BADGE, RARITIES } from '../rarity.js';
import { cacheSpriteSuccess, getShowdownSpriteCandidates, SPRITE_CACHE_EVENT } from '../spriteLookup.js';

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

export default function PCBox({ caughtList, onClose, onEvolve, teamUids, onToggleTeam, moveTokens, onReplaceMove, onRelease, onReleaseMany, onToggleLock, onSetLockMany }) {
  const [selectedUid, setSelectedUid] = useState(null);
  const [query, setQuery] = useState('');
  const [rarityChecks, setRarityChecks] = useState(() => ({ common: false, uncommon: false, rare: false, legendary: false, delta: false }));
  const [shinyOnly, setShinyOnly] = useState(false);
  const [nonShinyOnly, setNonShinyOnly] = useState(false);
    const [teamOnly, setTeamOnly] = useState(false);
  const [sortKey, setSortKey] = useState('dex');
  const [sortDir, setSortDir] = useState('asc');
  const teamSet = new Set(Array.isArray(teamUids) ? teamUids : []);
  const canAddMore = teamSet.size < 3;

  const toggleRarity = (key) => {
    setRarityChecks((rc) => ({ ...(rc || {}), [key]: !rc?.[key] }));
  };

  const selected = useMemo(() => {
    if (!selectedUid) return null;
    return (caughtList ?? []).find(p => p.uid === selectedUid) || null;
  }, [caughtList, selectedUid]);

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

      const isDelta = !!(p.isDelta || p.delta || p.buff?.kind === 'delta-typing');

      // Rarity (OR across checked rarities; if none checked -> all)
      const rk = String(p.rarity || '').toLowerCase();
      const baseRarityKeys = ['common', 'uncommon', 'rare', 'legendary'];
      const anyBaseChecked = baseRarityKeys.some((k) => !!rarityChecks?.[k]);
      if (anyBaseChecked && !rarityChecks?.[rk]) return false;

      // Delta checkbox requires delta typing
      if (rarityChecks?.delta && !isDelta) return false;

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
              </div>
            </div>

          {caughtList.length === 0 ? (
            <div className="emptyState">No Pokémon yet. Go catch some!</div>
          ) : (
            <div className="grid">
              {viewList.map(p => (
                  <button
                    key={p.uid ?? p.id}
                    className="gridItem"
                    onClick={() => setSelectedUid(p.uid)}
                    aria-label={`Inspect ${p.name}`}
                    style={{ cursor: 'pointer', position: 'relative' }}
                  >
                    {/* Rarity badge (top-left) */}
                    {p.badge && (
                      <div className="gridBadgeCorner">
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {(p.isDelta || p.buff?.kind === 'delta-typing') ? (
                            <RarityBadge badge={DELTA_BADGE} size={18} />
                          ) : null}
                          <RarityBadge badge={p.badge} size={18} />
                        </div>
                      </div>
                    )}

                    {p.shiny ? (
                      <div className="gridShinyCorner" title="Shiny!">✨</div>
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

    const labelName = cleanName || raw; // fallback
    return alreadyHasDex ? raw : (dex ? `#${dex} ${labelName}` : labelName);
  })()}
</div>

                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

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
        />
      )}
    </>
  );
}
