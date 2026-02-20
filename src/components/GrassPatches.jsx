import React from 'react';

/**
 * GrassPatches
 * - Renders up to 3 click-to-select grass tiles.
 * - Each tile preloads sprite by rendering it behind a FULLY OPAQUE grass overlay.
 * - Shows sparkle if shiny.
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
    <div style={styles.wrap} aria-label="Grass encounters">
      {list.map((mon, i) => (
        <button
          key={mon?.uid || mon?.formId || mon?.dexId || i}
          type="button"
          onClick={() => onPick?.(i)}
          style={styles.patchBtn}
          aria-label={mon?.shiny ? 'Grass patch (shiny nearby)' : 'Grass patch'}
          title={mon?.shiny ? 'Something sparkly in the grass…' : 'Rustling grass…'}
        >
          {/* Sprite preload layer (still loads, but will be fully covered) */}
          <div style={styles.spriteLayer} aria-hidden="true">
            {Sprite ? <Sprite mon={mon} className="grassHiddenSprite" alt="" title="" /> : null}
          </div>

          {/* FULLY OPAQUE overlay to hide sprite completely */}
          <div style={styles.grassOverlay} aria-hidden="true" />

          {/* sparkle for shiny */}
          {mon?.shiny ? (
            <div style={styles.sparkle} aria-hidden="true">✨</div>
          ) : null}

          <div style={styles.label} aria-hidden="true">Grass</div>
        </button>
      ))}
    </div>
  );
}

const styles = {
  wrap: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 10,
    width: '100%',
  },
  patchBtn: {
    position: 'relative',
    height: 90,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.12)',
    background: '#0b1a10',
    overflow: 'hidden',
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(0,0,0,0.25)',
  },
  spriteLayer: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Keep sprite loading; overlay above is what hides it.
    opacity: 1,
  },
  grassOverlay: {
    position: 'absolute',
    inset: 0,
    // OPAQUE grass texture layers (no alpha that would show sprite)
    background:
      'linear-gradient(180deg, #1f6b2f 0%, #0f3c1c 100%),' +
      'repeating-linear-gradient(60deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 7px)',
    backgroundBlendMode: 'multiply',
  },
  sparkle: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: 18,
    filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.45))',
  },
  label: {
    position: 'absolute',
    left: 10,
    bottom: 8,
    fontSize: 12,
    letterSpacing: 0.3,
    color: 'rgba(255,255,255,0.90)',
    textShadow: '0 2px 8px rgba(0,0,0,0.65)',
  },
};
