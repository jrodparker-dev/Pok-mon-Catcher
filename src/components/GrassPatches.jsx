import React from 'react';
import { getBiomeLabel } from '../biomes.js';

/**
 * GrassPatches
 * - Renders up to 3 click-to-select encounter tiles (biomes).
 * - Each tile preloads sprite by rendering it behind a FULLY OPAQUE biome overlay.
 *
 * Props:
 *  - slots: Array of mon objects (length 0..3)
 *  - onPick(index)
 *  - Sprite: a component like SpriteWithFallback ({mon, className, alt, title})
 */
export default function GrassPatches({ slots, onPick, Sprite }) {
  const list = Array.isArray(slots) ? slots.slice(0, 3) : [];
  if (!list.length) return null;

  return (
    <div style={styles.wrap} aria-label="Encounter tiles">
      {list.map((mon, i) => {
        const biomeKey = String(mon?.biome || 'grass');
        const biomeLabel = getBiomeLabel(biomeKey);
        const biomeOverlayStyle = getBiomeOverlayStyle(biomeKey);
        const isSuperRare = Array.isArray(mon?.buffs) && mon.buffs.some(b => b?.superRare);
        const isShiny = !!mon?.shiny;

        return (
          <button
            key={mon?.uid || mon?.formId || mon?.dexId || i}
            type="button"
            onClick={() => onPick?.(i)}
            style={styles.patchBtn}
            aria-label={isShiny ? `${biomeLabel} (shiny nearby)` : biomeLabel}
            title={isShiny ? `Something sparkly in the ${biomeLabel.toLowerCase()}…` : `${biomeLabel}…`}
          >
            {/* Preload sprite behind fully opaque overlay */}
            <div style={styles.preloadWrap} aria-hidden="true">
              <Sprite mon={mon} className="grassPreloadSprite" alt="" title="" />
            </div>

            {/* FULLY OPAQUE biome overlay to hide sprite completely */}
            <div style={{ ...styles.overlay, ...biomeOverlayStyle }} aria-hidden="true" />

            {/* Vignette for cave */}
            {biomeKey === 'cave' ? <div style={styles.vignette} /> : null}

            {/* Lightning bolt for power plant */}
            {biomeKey === 'powerplant' ? <div style={styles.bolt}>⚡</div> : null}

            <div style={styles.biomePill}>{biomeLabel}</div>

            {/* sparkles (shiny + super-rare) */}
            {(isShiny || isSuperRare) ? (
              <div style={styles.sparkleWrap} aria-hidden="true">
                {isShiny ? <div style={styles.sparkle}>✨</div> : null}
                {isSuperRare ? <div style={styles.superSparkle}>✦</div> : null}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function getBiomeOverlayStyle(key) {
  const k = String(key || '').toLowerCase();
  if (k === 'sea') {
    return {
      background: 'linear-gradient(135deg, #2e86c1 0%, #1f618d 45%, #5dade2 100%)',
    };
  }
  if (k === 'cave') {
    return { background: '#6e4b2a' };
  }
  if (k === 'grass') {
    return { background: '#6ccf62' };
  }
  if (k === 'desert') {
    return { background: '#e6d2a6' };
  }
  if (k === 'tallgrass') {
    return { background: '#2e7d32' };
  }
  if (k === 'snow') {
    return { background: 'linear-gradient(180deg, #ffffff 0%, #e8f4ff 100%)' };
  }
  if (k === 'powerplant') {
    return { background: '#9aa0a6' };
  }
  return { background: '#6ccf62' };
}

const styles = {
  wrap: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 10,
    width: '100%',
    marginTop: 10,
  },
  patchBtn: {
    position: 'relative',
    // Match the original tile size so the UI doesn't jump around (desktop + mobile)
    height: 90,
    borderRadius: 14,
    border: '2px solid rgba(0,0,0,0.12)',
    overflow: 'hidden',
    cursor: 'pointer',
    padding: 0,
    background: '#0b1a10',
  },
  preloadWrap: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.001, // basically invisible but still loads
    pointerEvents: 'none',
    zIndex: 0,
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    // MUST be fully opaque (no alpha) or the sprite will show through.
    background: '#6ccf62',
    pointerEvents: 'none',
    zIndex: 1,
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 85%)',
    pointerEvents: 'none',
    zIndex: 2,
  },
  bolt: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 34,
    fontWeight: 900,
    color: '#f1c40f',
    textShadow: '0 2px 10px rgba(0,0,0,0.35)',
    pointerEvents: 'none',
    zIndex: 3,
  },
  biomePill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    background: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(0,0,0,0.12)',
    padding: '4px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    pointerEvents: 'none',
    zIndex: 4,
  },
  sparkleWrap: {
    position: 'absolute',
    top: 8,
    right: 8,
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    pointerEvents: 'none',
    zIndex: 6,
    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.55))',
  },
  sparkle: { fontSize: 18 },
  superSparkle: {
    fontSize: 18,
    color: '#60a5fa',
    textShadow: '0 0 10px rgba(96,165,250,0.85)',
  },
};
