import React from 'react';
import RarityBadge from './RarityBadge.jsx';
import { toID } from '../pokeapi.js';
import { getAllBaseDexEntries, MAX_POKEDEX_NUM, getDexById } from '../dexLocal.js';
import { RARITIES, DELTA_BADGE } from '../rarity.js';

export default function Pokedex({
  open = true,
  onClose,
  dexList = null,           // optional override
  pokedex = {},             // stats map keyed by dexNum string (ex: "157")
  caughtList = [],          // caught mons (forms allowed)
  rarityFromCaught,         // optional fn(mon)=>badge
}) {
  const [query, setQuery] = React.useState('');
  const [caughtOnly, setCaughtOnly] = React.useState(false);
  const [uncaughtOnly, setUncaughtOnly] = React.useState(false);
  const [rarityChecks, setRarityChecks] = React.useState(() => ({
    common: false,
    uncommon: false,
    rare: false,
    legendary: false,
    delta: false,
    shiny: false,
  }));
  const [sortKey, setSortKey] = React.useState('num');
  const [sortDir, setSortDir] = React.useState('asc');

  if (!open) return null;

  const toggleRarity = React.useCallback((key) => {
    setRarityChecks((rc) => ({ ...rc, [key]: !rc?.[key] }));
  }, []);

  // Map caught mons -> base dexNum (so forms count toward base species)
  const caughtByDexNum = React.useMemo(() => {
    const map = new Map(); // key: dexNum (number), value: mons[]
    for (const m of (caughtList || [])) {
      const anyId =
        m?.formId ||
        m?.speciesId ||
        (typeof m?.dexId === 'string' ? m.dexId : '') ||
        m?.name;

      const baseDexNum = getBaseDexNumFromAnyId(anyId) ?? (
        // fallback if your caught record already has numeric dexId
        typeof m?.dexId === 'number' ? m.dexId : undefined
      );

      if (typeof baseDexNum !== 'number') continue;
      if (!map.has(baseDexNum)) map.set(baseDexNum, []);
      map.get(baseDexNum).push(m);
    }
    return map;
  }, [caughtList]);

  // Base dex list (1..1025 base species)
  const normalizedDex = React.useMemo(() => {
    const list = (Array.isArray(dexList) && dexList.length)
      ? dexList
      : (typeof getAllBaseDexEntries === 'function' ? getAllBaseDexEntries() : []);

    const out = [];
    for (const e of (list || [])) {
      if (!e) continue;
      const id = toID(e.id || e.name);
      if (!id) continue;

      // This list should already be base forms, but keep guard:
      if (isAltFormId(id)) continue;

      const num = typeof e.num === 'number' ? e.num : undefined;
      if (typeof num !== 'number') continue;

      out.push({
        id,
        name: e.name || e.id || id,
        num,
      });
    }

    out.sort((a, b) => (a.num ?? 99999) - (b.num ?? 99999));

    const want = (typeof MAX_POKEDEX_NUM === 'number' ? MAX_POKEDEX_NUM : 1025);
    if (out.length !== want) {
      console.warn(`[Pokedex] Expected ${want} entries, got ${out.length}. Check dexLocal data.`);
    }

    return out.slice(0, want);
  }, [dexList]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = normalizedDex.filter((d) => {
      const dexNum = d.num;
      const entry = pokedex?.[String(dexNum)] || {};
      const caughtArr = caughtByDexNum.get(dexNum) || [];
      const caughtCount = Math.max(entry.caught ?? 0, caughtArr.length);
      const seenCount = Math.max(entry.seen ?? 0, caughtCount ? 1 : 0);
      const anyShinyCaught =
        (entry.shinyCaught ?? 0) > 0 ||
        caughtArr.some((m) => !!m?.shiny);
      const caughtRarityKeys = new Set([
        ...Object.entries((entry.rarityCaught && typeof entry.rarityCaught === 'object') ? entry.rarityCaught : {})
          .filter(([, v]) => (v ?? 0) > 0)
          .map(([k]) => String(k).toLowerCase()),
        ...(caughtArr || []).map(m => String(m?.rarity || '').toLowerCase()).filter(Boolean),
      ]);
      const anyDeltaCaught = (entry.deltaCaught ?? 0) > 0 || caughtArr.some((m) => !!(m?.isDelta || m?.delta || m?.buff?.kind === 'delta-typing'));

      if (caughtOnly && !caughtCount) return false;
      if (uncaughtOnly && caughtCount) return false;
      // rarity filter (checkboxes): if multiple are checked, require ALL selected rarities
      const selectedRarities = Object.entries(rarityChecks || {})
        .filter(([, v]) => !!v)
        .map(([k]) => String(k).toLowerCase());

      if (selectedRarities.length) {
        for (const key of selectedRarities) {
          if (key === 'shiny') {
            if (!anyShinyCaught) return false;
          } else if (key === 'delta') {
            if (!anyDeltaCaught) return false;
          } else {
            if (!caughtRarityKeys.has(key)) return false;
          }
        }
      }

      if (!q) return true;

      const n = String(d.name || '').toLowerCase();
      const i = String(d.id || '').toLowerCase();
      const nn = String(dexNum);
      return n.includes(q) || i.includes(q) || nn === q;
    });

    const dir = sortDir === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      const aNum = a.num ?? 99999;
      const bNum = b.num ?? 99999;

      const aEntry = pokedex?.[String(aNum)] || {};
      const bEntry = pokedex?.[String(bNum)] || {};
      const aCaughtArr = caughtByDexNum.get(aNum) || [];
      const bCaughtArr = caughtByDexNum.get(bNum) || [];

      const aCaught = Math.max(aEntry.caught ?? 0, aCaughtArr.length);
      const bCaught = Math.max(bEntry.caught ?? 0, bCaughtArr.length);
      const aSeen = Math.max(aEntry.seen ?? 0, aCaught ? 1 : 0);
      const bSeen = Math.max(bEntry.seen ?? 0, bCaught ? 1 : 0);

      const aName = String(a.name || a.id || '').toLowerCase();
      const bName = String(b.name || b.id || '').toLowerCase();

      let cmp = 0;
      if (sortKey === 'num') cmp = aNum - bNum;
      else if (sortKey === 'name') cmp = aName.localeCompare(bName);
      else if (sortKey === 'seen') cmp = aSeen - bSeen;
      else if (sortKey === 'caught') cmp = aCaught - bCaught;
      else cmp = aNum - bNum;

      if (cmp === 0) cmp = (aNum - bNum) || aName.localeCompare(bName);
      return cmp * dir;
    });

    return list;
  }, [normalizedDex, pokedex, caughtByDexNum, query, caughtOnly, uncaughtOnly, rarityChecks, sortKey, sortDir]);

  const totals = React.useMemo(() => {
    const total = normalizedDex.length;
    let caught = 0;
    for (const d of normalizedDex) {
      const dexNum = d.num;
      const entry = pokedex?.[String(dexNum)] || {};
      const caughtArr = caughtByDexNum.get(dexNum) || [];
      const caughtCount = Math.max(entry.caught ?? 0, caughtArr.length);
      if (caughtCount > 0) caught += 1;
    }
    return { total, caught };
  }, [normalizedDex, pokedex, caughtByDexNum]);

  return (
    <div className="modalOverlay" role="dialog" aria-label="Pokédex">
      <div className="dexModalCard">

        {/* Sticky header */}
        <div className="dexStickyHeader">
          <div className="modalHeader" style={{ marginBottom: 10 }}>
            <div>
              <div className="modalTitle">Pokédex</div>
              <div className="modalSub">
                {totals.caught} / {totals.total} caught
              </div>
            </div>

            <button className="btnSmall" onClick={onClose} aria-label="Close Pokédex">
              Close
            </button>
          </div>
        </div>

        <div className="dexScroll">
          <div className="dexHeaderRow">
            <div className="dexControls" style={{ width: '100%' }}>
              <input
                className="dexSearch"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name / id / dex #"
                aria-label="Search Pokédex"
              />

              <label className="dexToggle" title="Show caught only">
                <input
                  type="checkbox"
                  checked={caughtOnly}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setCaughtOnly(v);
                    if (v) setUncaughtOnly(false);
                  }}
                />
                Caught only
              </label>

              <label className="dexToggle" title="Show uncaught only">
                <input
                  type="checkbox"
                  checked={uncaughtOnly}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setUncaughtOnly(v);
                    if (v) setCaughtOnly(false);
                  }}
                />
                Uncaught only
              </label>
              <div
                className="dexRarityFilters"
                aria-label="Filter by caught rarities"
                title="Filter by caught rarities (requires all checked)"
              >
                {RARITIES.map((r) => {
                  const key = String(r.key).toLowerCase();
                  return (
                    <label key={key} className="dexToggle dexRarityToggle" title={`Require ${r.label} caught`}>
                      <input
                        type="checkbox"
                        checked={!!rarityChecks?.[key]}
                        onChange={() => toggleRarity(key)}
                      />
                      <span className="dexRarityToggleIcon">
                        <RarityBadge badge={r.badge} size={14} />
                      </span>
                    </label>
                  );
                })}
                <label className="dexToggle dexRarityToggle" title="Require Delta caught">
                  <input
                    type="checkbox"
                    checked={!!rarityChecks?.delta}
                    onChange={() => toggleRarity('delta')}
                  />
                  <span className="dexRarityToggleIcon">
                    <RarityBadge badge={DELTA_BADGE} size={14} />
                  </span>
                </label>
                <label className="dexToggle dexRarityToggle" title="Require Shiny caught">
                  <input
                    type="checkbox"
                    checked={!!rarityChecks?.shiny}
                    onChange={() => toggleRarity('shiny')}
                  />
                  <span className="dexRarityToggleIcon">✨</span>
                </label>
              </div>
              
              <div className="dexSortGroup" aria-label="Sort">
                <select
                  className="dexSelect"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  aria-label="Sort field"
                  title="Sort field"
                >
                  <option value="num">Dex #</option>
                  <option value="name">Name</option>
                  <option value="seen">Seen</option>
                  <option value="caught">Caught</option>
                </select>
                <button
                  className="btnSmall dexSortDir"
                  onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                  title="Toggle sort direction"
                  aria-label="Toggle sort direction"
                  type="button"
                >
                  {sortDir === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>
          </div>

          <div className="dexMetaLine">
            Showing {filtered.length} entries
          </div>

          <div className="dexDivider" />
          <div className="dexGrid">
            {filtered.map((d) => {
              const dexNum = d.num;
              const entry = pokedex?.[String(dexNum)] || {};
              const caughtArr = caughtByDexNum.get(dexNum) || [];

              const caughtCount = Math.max(entry.caught ?? 0, caughtArr.length);
              const seenCount = Math.max(entry.seen ?? 0, caughtCount ? 1 : 0);

              const anyShinyCaught =
                (entry.shinyCaught ?? 0) > 0 ||
                caughtArr.some((m) => !!m?.shiny);

              const caughtRarityKeys = new Set([
                ...Object.entries((entry.rarityCaught && typeof entry.rarityCaught === 'object') ? entry.rarityCaught : {})
                  .filter(([, v]) => (v ?? 0) > 0)
                  .map(([k]) => String(k).toLowerCase()),
                ...(caughtArr || []).map(m => String(m?.rarity || '').toLowerCase()).filter(Boolean),
              ]);
              const anyDeltaCaught = (entry.deltaCaught ?? 0) > 0 || caughtArr.some((m) => !!(m?.isDelta || m?.delta || m?.buff?.kind === 'delta-typing'));

              const isCaught = caughtCount > 0;

              // IMPORTANT: sprite should always use base ID from base dex entry, not a form id
              const spriteBaseId = toID(d.id);
              const spriteUrl = getHomePngSpriteUrl(spriteBaseId, anyShinyCaught);

              return (
                <div key={dexNum} className="dexTile" aria-label={`Dex entry ${d.name}`}>
                  <div className="dexCountsPill" title="Seen / Caught">
                    👁 {seenCount} • 🧺 {caughtCount}
                  </div>

                  {anyShinyCaught ? (
                    <div className="dexCornerTR" title="Shiny caught">
                      ✨
                    </div>
                  ) : null}

                  <div className="dexSpriteWrap">
                    <img
                      className={`dexSprite ${isCaught ? '' : 'silhouette'}`}
                      src={spriteUrl}
                      alt={String(d.name || d.id)}
                      title={String(d.name || d.id)}
                      loading="lazy"
                      draggable="false"
                    />
                  </div>

                  <div className="dexName">{toPrettyName(d.name || d.id)}</div>
                  <div className="dexSub">#{dexNum}</div>

                  {/* Rarity strip: always show one of each rarity symbol (greyed if not caught) */}
                  <div className="dexRarityStrip" aria-label="Rarity caught">
                    {RARITIES.map((r) => {
                      const active = caughtRarityKeys.has(String(r.key).toLowerCase());
                      return (
                        <span
                          key={r.key}
                          className={`dexRarityIcon ${active ? 'active' : 'inactive'}`}
                          title={`${r.label}${active ? ' caught' : ''}`}
                        >
                          <RarityBadge badge={r.badge} size={14} />
                        </span>
                      );
                    })}
                    <span
                      className={`dexRarityIcon ${anyDeltaCaught ? 'active' : 'inactive'}`}
                      title={`Delta${anyDeltaCaught ? ' caught' : ''}`}
                    >
                      <RarityBadge badge={DELTA_BADGE} size={14} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dexLegend">
            <span><span style={{ fontWeight: 900 }}>👁</span> Seen</span>
            <span><span style={{ fontWeight: 900 }}>🧺</span> Caught</span>
            <span><span style={{ fontWeight: 900 }}>✨</span> Shiny caught</span>
            <span><span style={{ fontWeight: 900 }}>⬛</span> Silhouette = not caught</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <button className="btnSmall" onClick={onClose} aria-label="Close Pokédex (bottom)">
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* -----------------------
   Helpers
   ----------------------- */

function toPrettyName(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s
    .split('-')
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function getHomePngSpriteUrl(id, shiny) {
  const base = 'https://play.pokemonshowdown.com/sprites/';
  const folder = shiny ? 'home-shiny' : 'home';
  return `${base}${folder}/${toID(id)}.png`;
}

// ✅ Core: form id -> base dex num (Rotom-Frost -> Rotom's num, Typhlosion-Hisui -> Typhlosion's num)
function getBaseDexNumFromAnyId(anyIdOrNum) {
  if (typeof anyIdOrNum === 'number') return anyIdOrNum;

  const id = toID(anyIdOrNum);
  if (!id) return undefined;

  let entry = null;
  try {
    entry = getDexById({ id });
  } catch {
    entry = null;
  }
  if (!entry) return undefined;

  const baseId = toID(entry.baseSpecies || entry.name || entry.id || id);

  let baseEntry = null;
  try {
    baseEntry = getDexById({ id: baseId });
  } catch {
    baseEntry = null;
  }

  return baseEntry?.num ?? entry?.num ?? undefined;
}

// Guard filter (shouldn’t be needed if using base list, but kept)
function isAltFormId(idRaw) {
  const id = toID(idRaw);
  if (!id) return false;

  const hyphenBaseWhitelist = new Set([
    'mr-mime', 'mr-rime', 'mime-jr',
    'ho-oh', 'porygon-z', 'type-null',
    'jangmo-o', 'hakamo-o', 'kommo-o',
    'tapu-koko', 'tapu-lele', 'tapu-bulu', 'tapu-fini',
    'wo-chien', 'chien-pao', 'ting-lu', 'chi-yu',
  ]);
  if (hyphenBaseWhitelist.has(id)) return false;

  if (!id.includes('-')) return false;

  const altTokens = [
    'mega', 'mega-x', 'mega-y',
    'alola', 'galar', 'hisui', 'paldea',
    'gmax', 'primal', 'origin', 'crowned',
    'therian', 'incarnate',
    'attack', 'defense', 'speed',
    'dusk', 'dawn', 'ultra',
    'busted', 'complete', 'school', 'zen',
    'resolute', 'pirouette', 'ash', 'eternamax',
    'sunny', 'rainy', 'snowy',
    'stretchy', 'droopy',
  ];

  for (const tok of altTokens) {
    if (id.endsWith(`-${tok}`) || id.includes(`-${tok}-`)) return true;
  }

  const parts = id.split('-');
  if (parts.length >= 3) return true;

  return false;
}