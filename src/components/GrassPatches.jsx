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
        const biomeStyle = getBiomeStyle(biomeKey);

        return (
          <button
            key={mon?.uid || mon?.formId || mon?.dexId || i}
            type="button"
            onClick={() => onPick?.(i)}
            style={{ ...styles.patchBtn, ...biomeStyle }}
            aria-label={mon?.shiny ? `${biomeLabel} (shiny nearby)` : biomeLabel}
            title={mon?.shiny ? `Something sparkly in the ${biomeLabel.toLowerCase()}…` : `${biomeLabel}…`}
          >
            {/* Preload sprite behind fully opaque overlay */}
            <div style={styles.preloadWrap} aria-hidden="true">
              <Sprite mon={mon} className="grassPreloadSprite" alt="" title="" />
            </div>

            {/* Opaque overlay */}
            <div style={styles.overlay} />

            {/* Vignette for cave */}
            {biomeKey === 'cave' ? <div style={styles.vignette} /> : null}

            {/* Lightning bolt for power plant */}
            {biomeKey === 'powerplant' ? <div style={styles.bolt}>⚡</div> : null}

            <div style={styles.biomePill}>{biomeLabel}</div>

            {mon?.shiny ? <div style={styles.sparkle}>✨</div> : null}
          </button>
        );
      })}
    </div>
  );
}

function getBiomeStyle(key) {
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
  },
  preloadWrap: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.001, // basically invisible but still loads
    pointerEvents: 'none',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.12)',
    pointerEvents: 'none',
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 85%)',
    pointerEvents: 'none',
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
  },
  sparkle: {
    position: 'absolute',
    right: 8,
    top: 8,
    fontSize: 18,
    pointerEvents: 'none',
  },
};
