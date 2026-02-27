import React, { useMemo, useState } from 'react';
import { ACHIEVEMENTS, ACH_CATEGORY, DEX_MILESTONES, levelFromTotalXp, xpToNextLevel } from '../trainer.js';
import { SPECIAL_BALLS } from '../balls.js';
import { getDexEntryByNum } from '../dexLocal.js';
import RarityBadge from './RarityBadge.jsx';
import { RARITIES, DELTA_BADGE } from '../rarity.js';
import { toID } from '../pokeapi.js';

function fmt(n) {
  const x = Number(n) || 0;
  return x.toLocaleString();
}

function isUnlocked(flag) {
  return !!(flag && typeof flag === 'object' && flag.unlockedAt);
}

const BALL_UNLOCK_TEXT = {
  premier: 'Unlocked by default',
  luxury: 'Unlocked by default',
  dive: 'Unlocked by default',
  dusk: 'Unlocked by default',
  net: 'Evolve 25 Bug-type Pokémon',
  love: 'Catch a Pokémon that is on your favorites list',
  timer: 'Complete a Pokédex entry fully (all rarities + shiny)',
  repeat: 'Register 250 Pokémon in the Pokédex',
  nest: 'Catch 100 Common Pokémon',
  quick: 'Trainer level 10',
  dream: 'Trainer level 15',
  moon: 'Trainer level 20',
  beast: 'Trainer level 25',
  fast: 'Catch 50 shiny Pokémon',
};

export default function TrainerProfile({
  open,
  onClose,
  save,
  setSave,
  onPickFavoriteSlot,
}) {
  const trainer = save?.trainer ?? { level: 1, totalXp: 0, dexMilestones: {}, achievements: {}, stats: {} };
  const pokedex = save?.pokedex ?? {};
  const favorites = Array.isArray(save?.favorites) ? save.favorites.slice(0, 5) : [null, null, null, null, null];
  const [expanded, setExpanded] = useState(null);

  const [ballInfoKey, setBallInfoKey] = useState(null);

  function clamp01(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function ballUnlockProgress(ballKey, { trainer, pokedex }) {
    const stats = (trainer?.stats && typeof trainer.stats === 'object') ? trainer.stats : {};
    const level = Math.max(1, Math.floor(trainer?.level ?? 1));

    const uniqueCaught = (() => {
      let c = 0;
      for (const [k, v] of Object.entries(pokedex || {})) {
        if (!/^\d+$/.test(k)) continue;
        if ((v?.caught ?? 0) > 0) c += 1;
      }
      return c;
    })();

    if (ballKey === 'net') {
      const cur = Math.max(0, Math.floor(stats.bugEvolves ?? 0));
      return { label: 'Evolve Bug-type Pokémon', cur, target: 25 };
    }
    if (ballKey === 'repeat') {
      return { label: 'Register Pokémon in the Pokédex', cur: uniqueCaught, target: 250 };
    }
    if (ballKey === 'nest') {
      const cur = Math.max(0, Math.floor(stats.commonCaught ?? 0));
      return { label: 'Catch Common Pokémon', cur, target: 100 };
    }
    if (ballKey === 'fast') {
      const cur = Math.max(0, Math.floor(stats.shinyCaught ?? 0));
      return { label: 'Catch shiny Pokémon', cur, target: 50 };
    }
    if (ballKey === 'quick') return { label: 'Trainer level', cur: level, target: 10 };
    if (ballKey === 'dream') return { label: 'Trainer level', cur: level, target: 15 };
    if (ballKey === 'moon') return { label: 'Trainer level', cur: level, target: 20 };
    if (ballKey === 'beast') return { label: 'Trainer level', cur: level, target: 25 };

    if (ballKey === 'love') {
      // We don't track partial progress (it's a one-time condition)
      return { label: 'Catch a favorited Pokémon', cur: 0, target: 1 };
    }

    if (ballKey === 'timer') {
      // Show the best (closest) dex entry progress toward full completion:
      // 4 rarities + shiny = 5 checks.
      let best = 0;
      let bestLabel = 'Complete a Pokédex entry fully';
      for (const [k, v] of Object.entries(pokedex || {})) {
        if (!/^\d+$/.test(k)) continue;
        const rc = (v?.rarityCaught && typeof v.rarityCaught === 'object') ? v.rarityCaught : {};
        const need = ['common', 'uncommon', 'rare', 'legendary'];
        let got = 0;
        for (const r of need) if ((rc[r] ?? 0) > 0) got += 1;
        if ((v?.shinyCaught ?? 0) > 0) got += 1;
        if (got > best) best = got;
        if (best >= 5) break;
      }
      return { label: bestLabel, cur: best, target: 5 };
    }

    // Default: no measurable progress
    return { label: BALL_UNLOCK_TEXT[ballKey] || 'Locked', cur: 0, target: 1 };
  }


  const unlocked = save?.specialBalls?.unlocked ?? {};
  const equipped = Array.isArray(save?.specialBalls?.equipped) ? save.specialBalls.equipped.slice(0, 4) : [];

  const uniqueCaught = useMemo(() => {
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

  function toggleEquip(ballKey) {
    setSave?.((prev) => {
      const sp = prev?.specialBalls ?? {};
      const prevUnlocked = sp.unlocked ?? {};
      if (!prevUnlocked?.[ballKey]) return prev;

      const prevEq = Array.isArray(sp.equipped) ? sp.equipped.slice(0, 4) : [];
      const has = prevEq.includes(ballKey);
      let nextEq = prevEq.slice();

      if (has) {
        nextEq = nextEq.filter((k) => k !== ballKey);
      } else {
        if (nextEq.length >= 4) return prev;
        nextEq.push(ballKey);
      }

      return { ...prev, specialBalls: { ...sp, equipped: nextEq } };
    });
  }

  function clearFavorite(i) {
    setSave?.((prev) => {
      const fav = Array.isArray(prev?.favorites) ? prev.favorites.slice(0, 5) : [null, null, null, null, null];
      fav[i] = null;
      return { ...prev, favorites: fav };
    });
  }

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

        {/* Favorites */}
        <div className="profileSectionTitle">Favorites</div>
        <div className="profileSmallText" style={{ marginBottom: 10 }}>
          Pick up to 5 caught Pokémon. Love Ball becomes a guaranteed catch when the target is favorited.
        </div>
        <div className="favRow">
          {favorites.map((dexNum, i) => {
            const n = dexNum ? Number(dexNum) : null;
            const entry = n ? (getDexEntryByNum(n) || null) : null;
            const name = entry ? (entry.name || entry.id) : null;
            const p = n ? (pokedex[String(n)] || {}) : {};
            const caughtRarityKeys = new Set(
              Object.entries((p.rarityCaught && typeof p.rarityCaught === 'object') ? p.rarityCaught : {})
                .filter(([, v]) => (v ?? 0) > 0)
                .map(([k]) => String(k).toLowerCase())
            );
            const anyDelta = (p.deltaCaught ?? 0) > 0;
            const anyShiny = (p.shinyCaught ?? 0) > 0;
            return (
              <div key={`fav-${i}`} className="favSlot">
                <button
                  type="button"
                  className="btnSmall favBtn"
                  onClick={() => onPickFavoriteSlot?.(i)}
                  aria-label={name ? `Change favorite ${name}` : `Pick favorite slot ${i + 1}`}
                  title={name ? 'Click to change' : 'Click to pick'}
                >
                  {name ? <b>{name}</b> : <span style={{ opacity: 0.6 }}>Empty</span>}
                </button>

                {name ? (
                  <div className="favMeta">
                    <div className="favBadges">
                      {RARITIES.map((r) => {
                        const active = caughtRarityKeys.has(String(r.key).toLowerCase());
                        return (
                          <span key={`fav-${i}-${r.key}`} style={{ opacity: active ? 1 : 0.25 }}>
                            <RarityBadge badge={r.badge} size={12} />
                          </span>
                        );
                      })}
                      <span style={{ opacity: anyDelta ? 1 : 0.25 }} title="Delta caught">
                        <RarityBadge badge={DELTA_BADGE} size={12} />
                      </span>
                      <span style={{ opacity: anyShiny ? 1 : 0.25 }} title="Shiny caught">✨</span>
                    </div>
                    <button className="btnGhost" style={{ padding: '2px 8px' }} onClick={() => clearFavorite(i)} title="Clear favorite">
                      Clear
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Special balls */}
        <div className="profileSectionTitle" style={{ marginTop: 16 }}>Special Balls</div>
        <div className="profileSmallText" style={{ marginBottom: 10 }}>
          Equip up to 4 unlocked special balls. Equipped balls show up as the second row in encounters.
        </div>

        <div className="equipRow">
          {Array.from({ length: 4 }).map((_, i) => {
            const k = equipped[i] || null;
            const def = k ? SPECIAL_BALLS.find((b) => b.key === k) : null;
            return (
              <div key={`eq-${i}`} className="equipSlot">
                {k ? <b>{def?.label || k}</b> : <span style={{ opacity: 0.5 }}>Empty</span>}
              </div>
            );
          })}
        </div>

        <div className="ballPickGrid">
          {SPECIAL_BALLS.map((b) => {
            const isU = !!unlocked?.[b.key];
            const isE = equipped.includes(b.key);
            const disabled = !isU;
            const req = BALL_UNLOCK_TEXT[b.key] || 'Locked';
            return (
              <button
                key={`pick-${b.key}`}
                type="button"
                className={`btnSmall ${disabled ? 'disabled' : ''}`}
                style={{
                  opacity: disabled ? 0.45 : 1,
                  border: isE ? '2px solid rgba(255,255,255,0.9)' : undefined,
                }}
                onClick={() => {
                  if (disabled) {
                    setBallInfoKey(b.key);
                    return;
                  }
                  toggleEquip(b.key);
                }}
                disabled={false}
                title={disabled ? `Locked: ${req} (click for details)` : (isE ? 'Click to unequip' : 'Click to equip')}
              >
                {b.label}
              </button>
            );
          })}
        </div>


        {ballInfoKey ? (() => {
          const p = ballUnlockProgress(ballInfoKey, { trainer, pokedex });
          const cur = Math.max(0, Math.floor(p.cur ?? 0));
          const target = Math.max(1, Math.floor(p.target ?? 1));
          const pct = clamp01(cur / target);
          return (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: 16,
              }}
              role="dialog"
              aria-modal="true"
            >
              <div
                style={{
                  width: 'min(520px, 96vw)',
                  background: 'rgba(18, 24, 36, 0.98)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 16,
                  padding: 14,
                  boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                  {SPECIAL_BALLS.find(b => b.key === ballInfoKey)?.label || ballInfoKey}
                </div>
                <div style={{ marginTop: 6, opacity: 0.9, fontSize: 13 }}>
                  {p.label} {target === 1 ? '' : `${cur}/${target}`}
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 12, background: 'rgba(255,255,255,0.10)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: 'rgba(34,197,94,0.95)' }} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    {Math.round(pct * 100)}%
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="btnSmall" type="button" onClick={() => setBallInfoKey(null)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })() : null}


        {/* Original trainer cards */}
        <div className="profileGrid" style={{ marginTop: 18 }}>
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

        {/* Minimal icon rows by category (original style) */}
        <div className="achCategories">
          {Object.keys(ACH_CATEGORY).map((catKey) => {
            const meta = ACH_CATEGORY[catKey];
            const rows = byCategory[catKey] ?? [];
            if (!rows.length) return null;

            const unlockedCount = rows.filter((r) => r.unlocked).length;
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
              const r = achRows.find((x) => x.id === expanded);
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
