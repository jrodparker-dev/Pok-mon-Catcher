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

  if (!open) return null;

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
    return normalizedDex.filter((d) => {
      const dexNum = d.num;
      const entry = pokedex?.[String(dexNum)] || {};
      const caughtArr = caughtByDexNum.get(dexNum) || [];
      const caughtCount = Math.max(entry.caught ?? 0, caughtArr.length);

      if (caughtOnly && !caughtCount) return false;
      if (!q) return true;

      const n = String(d.name || '').toLowerCase();
      const i = String(d.id || '').toLowerCase();
      const nn = String(dexNum);
      return n.includes(q) || i.includes(q) || nn === q;
    });
  }, [normalizedDex, pokedex, caughtByDexNum, query, caughtOnly]);

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
                  onChange={(e) => setCaughtOnly(e.target.checked)}
                />
                Caught only
              </label>
            </div>
          </div>

          <div className="dexMetaLine">
            Showing {filtered.length} entries
          </div>

          <div className="dexDivider" />
        </div>

        {/* Scrollable body */}
        <div className="dexScroll">
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

              const caughtRarityKeys = new Set((caughtArr || []).map(m => String(m?.rarity || '').toLowerCase()).filter(Boolean));
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
                      const active = caughtRarityKeys.has(r.key);
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
