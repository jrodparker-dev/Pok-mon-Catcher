import React from 'react';

export default function MiniRunSummariesModal({ open, onClose, summaries, onOpenSummary }) {
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
              <button
                key={s.id}
                type="button"
                className="achRow"
                onClick={() => onOpenSummary(s)}
                style={{ cursor: 'pointer' }}
              >
                <div className="achLeft">
                  <div className="achName">Run {new Date(s.createdAt).toLocaleString()}</div>
                  <div className="achDesc">
                    {s.counts?.caught ?? (s.caught?.length ?? 0)} caught • {s.reason || 'Game Over'}
                  </div>
                </div>
                <div className="achRight">➡️</div>
              </button>
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
