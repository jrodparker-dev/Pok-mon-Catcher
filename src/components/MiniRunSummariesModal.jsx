import React from 'react';

export default function MiniRunSummariesModal({ open, onClose, summaries, onOpenSummary, onEditRun }) {
  if (!open) return null;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modalCard">
        <div className="modalHeader">
          <div>
            <div className="modalTitle">Mini Run Summaries</div>
            <div className="modalSubtitle">Last 3 completed runs</div>
          </div>
          <button className="btnSmall" onClick={onClose} type="button">Close</button>
        </div>

        {(!summaries || summaries.length === 0) ? (
          <div className="profileSmallText" style={{ marginTop: 10 }}>No completed runs yet.</div>
        ) : (
          <div className="achList" style={{ marginTop: 10 }}>
            {summaries.map((s) => (
              <div
                key={s.id}
                className="achRow"
                style={{ cursor: 'default', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
              >
                <div className="achLeft">
                  <div className="achName">Run {new Date(s.createdAt).toLocaleString()}</div>
                  <div className="achDesc">
                    {s.counts?.caught ?? (s.caught?.length ?? 0)} caught • {s.reason || 'Game Over'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btnSmall" type="button" onClick={() => onEditRun?.(s)}>Edit Pokémon</button>
                  <button className="btnSmall" type="button" onClick={() => onOpenSummary(s)}>Open Summary</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modalFooter">
          <button className="pcButton" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}
