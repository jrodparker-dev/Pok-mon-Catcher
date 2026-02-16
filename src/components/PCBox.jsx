import React, { useMemo, useState } from 'react';
import PokemonDetail from './PokemonDetail.jsx';
import RarityBadge from './RarityBadge.jsx';
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

export default function PCBox({ caughtList, onClose, onEvolve, teamUids, onToggleTeam, moveTokens, onReplaceMove, onRelease }) {
  const [selectedUid, setSelectedUid] = useState(null);
  const teamSet = new Set(Array.isArray(teamUids) ? teamUids : []);
  const canAddMore = teamSet.size < 3;

  const selected = useMemo(() => {
    if (!selectedUid) return null;
    return (caughtList ?? []).find(p => p.uid === selectedUid) || null;
  }, [caughtList, selectedUid]);

  return (
    <>
      <div className="modalOverlay" role="dialog" aria-modal="true">
        <div className="modalCard">
          <div className="modalHeader">
            <div>
              <div className="modalTitle">PC Box</div>
              <div className="modalSub">{caughtList.length} Pokémon caught</div>
            </div>
            <button className="btnSmall" onClick={onClose}>
              Close
            </button>
          </div>

          {caughtList.length === 0 ? (
            <div className="emptyState">No Pokémon yet. Go catch some!</div>
          ) : (
            <div className="grid">
              {caughtList
                .slice()
                .sort((a, b) => (a.dexId ?? a.id) - (b.dexId ?? b.id))
                .map(p => (
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
                        <RarityBadge badge={p.badge} size={18} />
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
        />
      )}
    </>
  );
}
