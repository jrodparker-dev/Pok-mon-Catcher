import React, { useMemo } from 'react';
import { DEX_MILESTONES, levelFromTotalXp, xpToNextLevel } from '../trainer.js';

function fmt(n) {
  const x = Number(n) || 0;
  return x.toLocaleString();
}

export default function TrainerProfile({ open, onClose, save }) {
  const trainer = save?.trainer ?? { level: 1, totalXp: 0, dexMilestones: {} };
  const pokedex = save?.pokedex ?? {};

  const uniqueCaught = useMemo(() => {
    // Count numeric dex keys with caught > 0
    let c = 0;
    for (const [k, v] of Object.entries(pokedex)) {
      if (!/^\d+$/.test(k)) continue;
      if ((v?.caught ?? 0) > 0) c += 1;
    }
    return c;
  }, [pokedex]);

  const progress = useMemo(() => levelFromTotalXp(trainer.totalXp ?? 0), [trainer.totalXp]);
  const pct = progress.xpToNext ? Math.max(0, Math.min(1, (progress.xpIntoLevel ?? 0) / progress.xpToNext)) : 0;

  if (!open) return null;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal profileModal">
        <div className="modalHeader">
          <div>
            <div className="modalTitle">Trainer Profile</div>
            <div className="modalSubtitle">Level {fmt(progress.level)} • {fmt(trainer.totalXp)} XP</div>
          </div>
          <button className="btnSmall" onClick={onClose} type="button">Close</button>
        </div>

        <div className="profileGrid">
          <div className="profileCard">
            <div className="profileLabel">Level Progress</div>
            <div className="profileProgressRow">
              <div className="progressBarOuter">
                <div className="progressBarInner" style={{ width: `${Math.round(pct * 100)}%` }} />
              </div>
              <div className="profileSmallText">
                {fmt(progress.xpIntoLevel)} / {fmt(progress.xpToNext)}
              </div>
            </div>
            <div className="profileSmallText">Next level requires {fmt(xpToNextLevel(progress.level))} XP.</div>
          </div>

          <div className="profileCard">
            <div className="profileLabel">Dex Progress</div>
            <div className="profileBig">{fmt(uniqueCaught)} / 1025</div>
            <div className="profileSmallText">Unique species caught</div>
          </div>
        </div>

        <div className="profileSectionTitle">Achievements</div>
        <div className="achList">
          {DEX_MILESTONES.map((m) => {
            const unlocked = !!trainer?.dexMilestones?.[m];
            return (
              <div key={m} className={`achRow ${unlocked ? 'achUnlocked' : ''}`}>
                <div className="achLeft">
                  <div className="achName">Catch {m} species</div>
                  <div className="achDesc">{unlocked ? 'Unlocked' : 'Not yet'}</div>
                </div>
                <div className="achRight">
                  {unlocked ? '✅' : '⬜'}
                </div>
              </div>
            );
          })}
        </div>

        <div className="modalFooter">
          <button className="pcButton" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}
