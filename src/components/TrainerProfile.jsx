import React, { useMemo, useState } from 'react';
import { ACHIEVEMENTS, ACH_CATEGORY, DEX_MILESTONES, levelFromTotalXp, xpToNextLevel } from '../trainer.js';

function fmt(n) {
  const x = Number(n) || 0;
  return x.toLocaleString();
}

function isUnlocked(flag) {
  return !!(flag && typeof flag === 'object' && flag.unlockedAt);
}

export default function TrainerProfile({ open, onClose, save }) {
  const trainer = save?.trainer ?? { level: 1, totalXp: 0, dexMilestones: {}, achievements: {}, stats: {} };
  const pokedex = save?.pokedex ?? {};
  const [expanded, setExpanded] = useState(null);

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

  const dexRows = useMemo(() => {
    const rows = [];
    for (const m of DEX_MILESTONES) {
      rows.push({
        id: `dex_${m}`,
        category: 'dex',
        icon: ACH_CATEGORY.dex.icon,
        name: `Catch ${m} species`,
        desc: 'Unique base species caught in your Pokédex.',
        unlocked: isUnlocked(trainer?.dexMilestones?.[m]),
      });
    }
    return rows;
  }, [trainer?.dexMilestones]);

  const achRows = useMemo(() => {
    const rows = ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: isUnlocked(trainer?.achievements?.[a.id]),
    }));
    return [...dexRows, ...rows];
  }, [dexRows, trainer?.achievements]);

  const byCategory = useMemo(() => {
    const map = {};
    for (const row of achRows) {
      const cat = row.category || 'other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(row);
    }
    return map;
  }, [achRows]);

  if (!open) return null;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modalCard profileModal">
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

        {/* Minimal icon rows by category */}
        <div className="achCategories">
          {Object.keys(ACH_CATEGORY).map((catKey) => {
            const meta = ACH_CATEGORY[catKey];
            const rows = byCategory[catKey] ?? [];
            if (!rows.length) return null;

            const unlockedCount = rows.filter(r => r.unlocked).length;
            const total = rows.length;

            return (
              <div key={catKey} className="achCategoryBlock">
                <div className="achCategoryHeader" title={`${meta.label}: ${unlockedCount}/${total} unlocked`}>
                  <span className="achCategoryIcon">{meta.icon}</span>
                  <span className="achCategoryLabel">{meta.label}</span>
                  <span className="achCategoryCount">{unlockedCount}/{total}</span>
                </div>

                <div className="achIconGrid">
                  {rows.map((r) => {
                    const active = expanded === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`achIconBtn ${r.unlocked ? 'achIconUnlocked' : ''} ${active ? 'achIconActive' : ''}`}
                        title={`${r.name} — ${r.unlocked ? 'Unlocked' : 'Locked'}`}
                        onClick={() => setExpanded(active ? null : r.id)}
                        aria-label={r.name}
                      >
                        <span className="achIconGlyph">{r.icon}</span>
                        <span className="achIconCheck">{r.unlocked ? '✅' : '⬜'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {expanded && (
          <div className="achExpandedCard">
            {(() => {
              const r = achRows.find(x => x.id === expanded);
              if (!r) return null;
              return (
                <>
                  <div className="achExpandedTitle">
                    <span className="achExpandedIcon">{r.icon}</span>
                    <span>{r.name}</span>
                    <span className={`achExpandedStatus ${r.unlocked ? 'ok' : 'no'}`}>{r.unlocked ? 'Unlocked' : 'Locked'}</span>
                  </div>
                  <div className="achExpandedDesc">{r.desc}</div>
                </>
              );
            })()}
          </div>
        )}

        <div className="modalFooter">
          <button className="pcButton" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}
