import React from 'react';
import RarityBadge from './RarityBadge.jsx';

function capName(name) {
  if (!name) return '';
  return String(name)
    .split('-')
    .map(s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s))
    .join(' ');
}

export default function MiniRunSummaryModal({ open, onClose, summary }) {
  if (!open) return null;
  if (!summary) return null;

  const caught = Array.isArray(summary.caught) ? summary.caught : [];

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modalCard" style={{ maxWidth: 980 }}>
        <div className="modalHeader">
          <div>
            <div className="modalTitle">Mini Run Summary</div>
            <div className="modalSubtitle">
              <span className="runBadge">Game Over</span>{' '}
              {new Date(summary.createdAt).toLocaleString()} → {new Date(summary.endedAt).toLocaleString()}
            </div>
          </div>
          <button className="btnSmall" onClick={onClose} type="button">Close</button>
        </div>

        <div className="runCapsRow">
          {summary?.capsInitial?.encountersLeft != null && (
            <div className="runCapPill">Encounters: {summary.capsInitial.encountersLeft}</div>
          )}
          {summary?.capsInitial?.catchesLeft != null && (
            <div className="runCapPill">Catches: {summary.capsInitial.catchesLeft}</div>
          )}
          {summary?.ballsInitial && (
            <div className="runCapPill">
              Balls: P{summary.ballsInitial.poke ?? 0} / G{summary.ballsInitial.great ?? 0} / U{summary.ballsInitial.ultra ?? 0} / M{summary.ballsInitial.master ?? 0}
            </div>
          )}
          <div className="runCapPill">Caught: {caught.length}</div>
          {summary.reason && <div className="runCapPill">{summary.reason}</div>}
        </div>

        <div className="summaryGrid">
          {caught.map((m) => (
            <div key={m.uid} className="summaryTile">
              <div className="summaryTag">Game Over</div>
              <img className="summarySprite" src={m.spriteUrl} alt={m.name} />
              <div className="summaryName">{capName(m.name)}</div>
              <RarityBadge rarity={m.rarity} badge={m.badge} buff={m.buff} isDelta={!!m.isDelta} shiny={!!m.shiny} />
            </div>
          ))}
        </div>

        <div className="modalFooter">
          <button className="pcButton" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}
