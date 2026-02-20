import React, { useMemo } from 'react';

function fmt(n) {
  if (n == null) return '∞';
  return String(n);
}

function sumBalls(balls) {
  const b = balls || {};
  return (b.poke ?? 0) + (b.great ?? 0) + (b.ultra ?? 0) + (b.master ?? 0);
}

export default function MiniRunInfoModal({ open, onClose, save, mode }) {
  if (!open) return null;
  if (mode !== 'mini') return null;

  const mr = save?.miniRun;
  if (!mr) return null;

  const rows = useMemo(() => {
    const out = [];
    const init = mr.capsInitial || {};
    const cur = mr.caps || {};

    if (init.encountersLeft != null) {
      const used = Math.max(0, (init.encountersLeft ?? 0) - (cur.encountersLeft ?? 0));
      out.push({
        label: 'Encounters cap',
        initial: init.encountersLeft,
        remaining: cur.encountersLeft,
        used,
      });
    } else {
      out.push({ label: 'Encounters cap', initial: null, remaining: null, used: null });
    }

    if (init.catchesLeft != null) {
      const used = Math.max(0, (init.catchesLeft ?? 0) - (cur.catchesLeft ?? 0));
      out.push({
        label: 'Catches cap',
        initial: init.catchesLeft,
        remaining: cur.catchesLeft,
        used,
      });
    } else {
      out.push({ label: 'Catches cap', initial: null, remaining: null, used: null });
    }

    const ballCapEnabled = !!cur.ballsCapEnabled;
    out.push({
      label: 'Ball cap',
      initial: ballCapEnabled ? sumBalls(mr.ballsInitial) : null,
      remaining: ballCapEnabled ? sumBalls(save?.balls) : null,
      used: ballCapEnabled ? Math.max(0, sumBalls(mr.ballsInitial) - sumBalls(save?.balls)) : null,
      note: ballCapEnabled ? `P${save?.balls?.poke ?? 0} / G${save?.balls?.great ?? 0} / U${save?.balls?.ultra ?? 0} / M${save?.balls?.master ?? 0}` : 'disabled',
    });

    return out;
  }, [mr, save]);

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modalCard" style={{ maxWidth: 720 }}>
        <div className="modalHeader">
          <div>
            <div className="modalTitle">Mini Run Info</div>
            <div className="modalSubtitle">Started settings + remaining caps</div>
          </div>
          <button className="btnSmall" onClick={onClose} type="button">Close</button>
        </div>

        <div className="runCapsRow" style={{ marginTop: 6 }}>
          <div className="runCapPill">Shiny charm: {save?.settings?.shinyCharm ? 'ON' : 'OFF'}</div>
          <div className="runCapPill">Caught: {(save?.caught ?? []).length}</div>
          <div className="runCapPill">Move tokens: {save?.moveTokens ?? 0}</div>
        </div>

        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {rows.map((r) => (
            <div key={r.label} className="runField">
              <div className="runFieldLabel">{r.label}</div>
              <div className="profileSmallText">
                Initial: <b>{fmt(r.initial)}</b> • Used: <b>{r.used == null ? '—' : fmt(r.used)}</b> • Remaining: <b>{fmt(r.remaining)}</b>
              </div>
              {r.note ? <div className="profileSmallText" style={{ opacity: 0.9, marginTop: 4 }}>{r.note}</div> : null}
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
