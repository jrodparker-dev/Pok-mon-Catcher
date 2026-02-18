import React from 'react';
import RarityBadge from './RarityBadge.jsx';
import { toID } from '../pokeapi.js';
import { getAllBaseDexEntries, MAX_POKEDEX_NUM } from '../dexLocal.js';

export default function Pokedex({
  open = true,
  onClose,
  dexList = null,           // optional override
  pokedex = {},             // optional stats map
  caughtList = [],          // your caught mons (for filling in + rarity + shiny)
  rarityFromCaught,         // optional fn(mon)=>badge
}) {
  const [query, setQuery] = React.useState('');
  const [caughtOnly, setCaughtOnly] = React.useState(false);

  if (!open) return null;

  // Build caught lookup by base id
  const caughtByBase = React.useMemo(() => {
    const map = new Map();
    for (const m of (caughtList || [])) {
      const fid = toID(
        m?.formId ||
        m?.speciesId ||
        (typeof m?.dexId === 'string' ? m.dexId : '') ||
        m?.name
      );
      const baseId = baseDexId(fid);
      if (!baseId) continue;
      if (!map.has(baseId)) map.set(baseId, []);
      map.get(baseId).push(m);
    }
    return map;
  }, [caughtList]);

  // Full dex list (base forms only) -> silhouettes until caught
  const normalizedDex = React.useMemo(() => {
    const list = (Array.isArray(dexList) && dexList.length)
      ? dexList
      : (typeof getAllBaseDexEntries === 'function' ? getAllBaseDexEntries() : []);

    const out = [];
    for (const e of (list || [])) {
      if (!e) continue;
      const id = toID(e.id || e.name);
      if (!id) continue;

      // This list should already be base forms (1..1025), but keep guard:
      if (isAltFormId(id)) continue;

      out.push({
        id,
        name: e.name || e.id || id,
        num: typeof e.num === 'number' ? e.num : undefined,
      });
    }

    out.sort((a, b) => (a.num ?? 99999) - (b.num ?? 99999));

    // Hard expectation: 1025 base species
    const want = (typeof MAX_POKEDEX_NUM === 'number' ? MAX_POKEDEX_NUM : 1025);
    if (out.length !== want) {
      console.warn(`[Pokedex] Expected ${want} entries, got ${out.length}. Check dexLocal data.`);
    }

    return out.slice(0, want);
  }, [dexList]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return normalizedDex.filter((d) => {
      const baseId = baseDexId(d.id);
      const entry = pokedex?.[baseId] || pokedex?.[d.id] || {};
      const caughtArr = caughtByBase.get(baseId) || [];
      const caughtCount = Math.max(entry.caught ?? 0, caughtArr.length);


      if (caughtOnly && !caughtCount) return false;
      if (!q) return true;

      const n = String(d.name || '').toLowerCase();
      const i = String(d.id || '').toLowerCase();
      const nn = typeof d.num === 'number' ? String(d.num) : '';
      return n.includes(q) || i.includes(q) || nn === q;
    });
  }, [normalizedDex, pokedex, caughtByBase, query, caughtOnly]);

  const totals = React.useMemo(() => {
    const total = normalizedDex.length;
    let caught = 0;
    for (const d of normalizedDex) {
      const baseId = baseDexId(d.id);
      const entry = pokedex?.[baseId] || pokedex?.[d.id] || {};
      const caughtArr = caughtByBase.get(baseId) || [];
      const caughtCount = Math.max(entry.caught ?? 0, caughtArr.length);

      if (caughtCount > 0) caught += 1;
    }
    return { total, caught };
  }, [normalizedDex, pokedex, caughtByBase]);

  return (
    <div className="modalOverlay" role="dialog" aria-label="Pokédex">
      <div className="dexModalCard">

        {/* ✅ Sticky header: Close/search always accessible */}
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

        {/* ✅ Scrollable body: grid + legend */}
        <div className="dexScroll">
          <div className="dexGrid">
            {filtered.map((d) => {
              const baseId = baseDexId(d.id);
              const entry = pokedex?.[baseId] || pokedex?.[d.id] || {};
              const caughtArr = caughtByBase.get(baseId) || [];

              const caughtCount = Math.max(entry.caught ?? 0, caughtArr.length);

              const seenCount = Math.max(entry.seen ?? 0, caughtCount ? 1 : 0);


              const anyShinyCaught =
                (entry.shinyCaught ?? 0) > 0 ||
                caughtArr.some((m) => !!m?.shiny);

              const isCaught = caughtCount > 0;

              // Rarity badge: from caught mon
              let rarityBadge = null;
              if (isCaught) {
                if (typeof rarityFromCaught === 'function') rarityBadge = rarityFromCaught(caughtArr[0]);
                else rarityBadge = caughtArr[0]?.badge ?? null;
              }

              const spriteUrl = getHomePngSpriteUrl(baseId, anyShinyCaught);

              return (
                <div key={baseId} className="dexTile" aria-label={`Dex entry ${d.name}`}>
                  <div className="dexCountsPill" title="Seen / Caught">
                    👁 {seenCount} • 🧺 {caughtCount}
                  </div>

                  {anyShinyCaught ? (
                    <div className="dexCornerTR" title="Shiny caught">
                      ✨
                    </div>
                  ) : null}

                  {rarityBadge ? (
                    <div className="dexCornerBR" title="Rarity">
                      <RarityBadge badge={rarityBadge} size={18} />
                    </div>
                  ) : null}

                  <div className="dexSpriteWrap">
                    <img
                      className={`dexSprite ${isCaught ? '' : 'silhouette'}`}
                      src={spriteUrl}
                      alt={String(d.name || baseId)}
                      title={String(d.name || baseId)}
                      loading="lazy"
                      draggable="false"
                    />
                  </div>

                  <div className="dexName">{toPrettyName(d.name || baseId)}</div>
                  <div className="dexSub">
                    {typeof d.num === 'number' ? `#${d.num}` : `ID: ${baseId}`}
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

          {/* Optional bottom close (handy on huge scroll) */}
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

// Guard filter (shouldn’t be needed if using 1..1025 from dexLocal)
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

function baseDexId(idRaw) {
  return toID(idRaw);
}
