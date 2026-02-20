import React, { useMemo, useState } from 'react';

function clampInt(v, { min = 0, max = 99999 } = {}) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export default function NewMiniRunModal({ open, onClose, onConfirm }) {
  const [capEncountersEnabled, setCapEncountersEnabled] = useState(true);
  const [capEncounters, setCapEncounters] = useState(50);

  const [capCatchesEnabled, setCapCatchesEnabled] = useState(true);
  const [capCatches, setCapCatches] = useState(20);

  const [capBallsEnabled, setCapBallsEnabled] = useState(true);

  const [balls, setBalls] = useState({ poke: 20, great: 10, ultra: 5, master: 0 });

  const [shinyCharm, setShinyCharm] = useState(false);

  const canStart = useMemo(() => {
    const anyCap = capEncountersEnabled || capCatchesEnabled || capBallsEnabled;
    const totalBalls = Object.values(balls).reduce((a, b) => a + (Number(b) || 0), 0);
    return anyCap && totalBalls > 0;
  }, [capEncountersEnabled, capCatchesEnabled, balls]);

  if (!open) return null;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modalCard">
        <div className="modalHeader">
          <div>
            <div className="modalTitle">Start a New Mini Run</div>
            <div className="modalSubtitle">Fresh run, separate save. No new balls can be earned.</div>
          </div>
          <button className="btnSmall" onClick={onClose} type="button">Close</button>
        </div>

        <div className="runFormGrid">
          <div className="runField">
            <div className="runFieldLabel">Caps</div>

            <div className="runRow">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={capEncountersEnabled} onChange={(e) => setCapEncountersEnabled(e.target.checked)} />
                Encounters cap
              </label>
              <input
                type="number"
                min={1}
                value={capEncounters}
                disabled={!capEncountersEnabled}
                onChange={(e) => setCapEncounters(clampInt(e.target.value, { min: 1, max: 99999 }))}
              />
            </div>

            <div className="runRow">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={capCatchesEnabled} onChange={(e) => setCapCatchesEnabled(e.target.checked)} />
                Catches cap
              </label>
              <input
                type="number"
                min={1}
                value={capCatches}
                disabled={!capCatchesEnabled}
                onChange={(e) => setCapCatches(clampInt(e.target.value, { min: 1, max: 99999 }))}
              />
            
            <div className="runRow">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={capBallsEnabled}
                  onChange={(e) => setCapBallsEnabled(e.target.checked)}
                />
                Ball cap (run ends when you run out of balls)
              </label>
            </div>

</div>

            <div className="runRow" style={{ marginTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={shinyCharm} onChange={(e) => setShinyCharm(e.target.checked)} />
                Shiny Charm (boost shiny rate)
              </label>
            </div>

            <div className="profileSmallText" style={{ marginTop: 10 }}>
              Run ends when you hit any enabled cap.
            </div>
          </div>

          <div className="runField">
            <div className="runFieldLabel">Starting Balls</div>
            <div className="runBallGrid">
              {[
                ['poke', 'Poké'],
                ['great', 'Great'],
                ['ultra', 'Ultra'],
                ['master', 'Master'],
              ].map(([k, label]) => (
                <div key={k} className="runRow" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85 }}>{label}</div>
                  <input
                    type="number"
                    min={0}
                    value={balls[k]}
                    onChange={(e) => setBalls((b) => ({ ...b, [k]: clampInt(e.target.value, { min: 0, max: 99999 }) }))}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modalFooter" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btnSmall" onClick={onClose} type="button">Cancel</button>
          <button
            className="pcButton"
            disabled={!canStart}
            onClick={() => {
              if (!canStart) return;
              onConfirm({
                shinyCharm,
                balls,
                caps: {
                  encountersLeft: capEncountersEnabled ? capEncounters : null,
                  catchesLeft: capCatchesEnabled ? capCatches : null,
                  ballsCapEnabled: !!capBallsEnabled,
                },
              });
            }}
            type="button"
          >
            Start Run
          </button>
        </div>
      </div>
    </div>
  );
}
