import React, { useState } from 'react';
import PokemonDetail from './PokemonDetail.jsx';
import RarityBadge from './RarityBadge.jsx';

export default function PCBox({ caughtList, onClose, onEvolve, teamUids, onToggleTeam }) {
  const [selected, setSelected] = useState(null);
  const teamSet = new Set(Array.isArray(teamUids) ? teamUids : []);
  const canAddMore = teamSet.size < 3;

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
                    onClick={() => setSelected(p)}
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

                    <img
                      className="gridSprite"
                      src={p.spriteUrlResolved || p.spriteUrl}
                      alt={p.name}
                      loading="lazy"
                      onError={(e) => {
                        // If a sprite url is missing/bad (custom forms, etc.), don't let it blow up the UI.
                        // Hide the broken image icon.
                        e.currentTarget.style.visibility = 'hidden';
                      }}
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
          onClose={() => setSelected(null)}
          onEvolve={onEvolve ? (uid, targetDexId) => onEvolve(uid, targetDexId) : null}
          teamUids={teamUids}
          onToggleTeam={onToggleTeam}
        />
      )}
    </>
  );
}
